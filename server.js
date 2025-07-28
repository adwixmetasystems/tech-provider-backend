require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

// Webhook verification
app.get('/webhook', (req, res) => {
  const { VERIFY_TOKEN } = process.env;
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    console.log('✅ Webhook Verified');
    return res.status(200).send(req.query['hub.challenge']);
  }
  console.warn('❌ Webhook verification failed');
  return res.sendStatus(403);
});

// Webhook event logging
app.post('/webhook', (req, res) => {
  console.log('📨 Webhook Event:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// OAuth code exchange and onboarding
app.get('/exchange-token', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    // Step 1: Exchange the token code for a business token
    const tokenResponse = await axios.get('https://graph.facebook.com/v23.0/oauth/access_token', {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }
    });

    const businessToken = tokenResponse.data.access_token;
    console.log('✅ Access Token:', businessToken);

    // Step 2: Subscribe to WABA webhooks
    const WABA_ID = process.env.WABA_ID; // must be set
    const subscribeResponse = await axios.post(
      `https://graph.facebook.com/v23.0/${WABA_ID}/subscribed_apps`,
      {},
      {
        headers: {
          Authorization: `Bearer ${businessToken}`
        }
      }
    );
    console.log('✅ Subscribed to Webhooks:', subscribeResponse.data);

    // Step 3: Register the business phone number
    const PHONE_ID = process.env.BUSINESS_PHONE_ID; // must be set
    const registerResponse = await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_ID}/register`,
      {
        messaging_product: 'whatsapp',
        pin: process.env.NUMBER_PIN
      },
      {
        headers: {
          Authorization: `Bearer ${businessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Phone Number Registered:', registerResponse.data);

    // Final success redirect
    return res.redirect(`${process.env.SUCCESS_URL}?token=${businessToken}`);
  } catch (err) {
    console.error('❌ Onboarding Error:', err.response?.data || err.message);
    return res.status(500).send('Onboarding failed');
  }
});

// catch-all
app.use((req, res) => res.status(404).send('Not Found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
