require('dotenv').config();
const express = require('express');
const axios = require('axios');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const {
  APP_ID,
  APP_SECRET,
  API_VERSION,
  PORT,
  DEFAULT_WABA_ID,
  DEFAULT_PHONE_NUMBER_ID,
  DEFAULT_PHONE_PIN
} = process.env;

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFile = path.join(logDir, 'onboarding.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, line);
  console.log(line);
}

// OAuth Redirect Callback Endpoint
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    log('❌ Missing code in OAuth redirect.');
    return res.status(400).send('Missing code.');
  }

  log('🔁 Received OAuth redirect. Starting onboarding...');

  try {
    // STEP 1: Exchange Code -> Business Token
    log('🔐 STEP 1: Exchanging code for business token...');
    const tokenRes = await axios.get(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`, {
      params: {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        code
      }
    });

    const businessToken = tokenRes.data.access_token;
    log('✅ Business token acquired.');

    // STEP 2: Subscribe to WABA Webhooks
    log('🔔 STEP 2: Subscribing to WABA webhooks...');
    const subRes = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${DEFAULT_WABA_ID}/subscribed_apps`,
      {},
      {
        headers: {
          Authorization: `Bearer ${businessToken}`
        }
      }
    );
    if (subRes.data.success) {
      log('✅ Webhook subscription successful.');
    }

    // STEP 3: Register business number
    log('📞 STEP 3: Registering phone number...');
    const regRes = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${DEFAULT_PHONE_NUMBER_ID}/register`,
      {
        messaging_product: 'whatsapp',
        pin: DEFAULT_PHONE_PIN
      },
      {
        headers: {
          Authorization: `Bearer ${businessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (regRes.data.success) {
      log('✅ Phone number registered.');
    }

    // STEP 5: Instruct to add payment
    log('💳 STEP 5: Tell client to add payment at https://business.facebook.com/wa/manage/home/');
    res.send(`
      <h2>✅ WhatsApp Business Onboarding Complete</h2>
      <p>Your business has been onboarded successfully.</p>
      <p>Next step: <a href="https://business.facebook.com/wa/manage/home/" target="_blank">Add a payment method</a> in WhatsApp Manager.</p>
    `);
  } catch (error) {
    const errMsg = error?.response?.data || error.message;
    log(`❌ Error during onboarding: ${JSON.stringify(errMsg)}`);
    res.status(500).send(`<h2>❌ Onboarding Failed</h2><pre>${JSON.stringify(errMsg, null, 2)}</pre>`);
  }
});

// Health check
app.get('/', (_, res) => {
  res.send('🟢 OAuth Onboarding Server is Live');
});

app.listen(PORT || 3000, () => {
  log(`🚀 Server listening on port ${PORT || 3000}`);
});
