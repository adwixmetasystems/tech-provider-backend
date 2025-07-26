require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json()); // keep for JSON parsing

const {
  APP_ID,
  APP_SECRET,
  API_VERSION,
  PORT,
  DEFAULT_WABA_ID,
  DEFAULT_PHONE_NUMBER_ID,
  DEFAULT_PHONE_PIN,
  SUCCESS_URL
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

// OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    log('❌ Missing code in OAuth redirect.');
    return res.status(400).send('Missing code.');
  }

  log('🔁 Received OAuth redirect. Starting onboarding...');

  try {
    // Step 1: Token exchange
    log('🔐 STEP 1: Exchanging code for token...');
    const tokenRes = await axios.get(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`, {
      params: {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        code
      }
    });

    const businessToken = tokenRes.data.access_token;
    log('✅ Token acquired.');

    // Step 2: Subscribe to WABA
    log('🔔 STEP 2: Subscribing to WABA...');
    const subRes = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${DEFAULT_WABA_ID}/subscribed_apps`,
      {},
      { headers: { Authorization: `Bearer ${businessToken}` } }
    );
    if (subRes.data.success) log('✅ Subscribed to webhooks.');

    // Step 3: Register number
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
    if (regRes.data.success) log('✅ Phone number registered.');

    // Step 5: Notify client to add payment
    log('💳 STEP 5: Instruct client to add payment: https://business.facebook.com/wa/manage/home/');

    return res.redirect(SUCCESS_URL || 'https://business.facebook.com/wa/manage/home/');
  } catch (err) {
    const errMsg = err?.response?.data || err.message;
    log(`❌ Error during onboarding: ${JSON.stringify(errMsg)}`);
    res.status(500).send(`<h2>❌ Onboarding Failed</h2><pre>${JSON.stringify(errMsg, null, 2)}</pre>`);
  }
});

// Health check
app.get('/', (_, res) => {
  res.send('🟢 WhatsApp Onboarding Server is Live');
});

// Run server
app.listen(PORT || 3000, () => {
  log(`🚀 Server is running on port ${PORT || 3000}`);
});
