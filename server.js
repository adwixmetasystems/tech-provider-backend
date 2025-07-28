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

// Webhook Verification
app.get('/webhook', (req, res) => {
  const { VERIFY_TOKEN } = process.env;
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VERIFY_TOKEN
  ) {
    console.log('✅ Webhook Verified');
    return res.status(200).send(req.query['hub.challenge']);
  }
  console.warn('❌ Webhook verification failed');
  return res.sendStatus(403);
});

// Webhook Event Logging
app.post('/webhook', (req, res) => {
  console.log('📨 Webhook Event:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Token Exchange + Onboarding
app.get('/exchange-token', async (req, res) => {
  const { code, phone_number_id, waba_id } = req.query;

  if (!code || !phone_number_id || !waba_id) {
    return res.status(400).send('Missing required parameters (code, phone_number_id, waba_id)');
  }

  try {
    // Step 1: Exchange code for access token
    const tokenResponse = await axios.post(`https://graph.facebook.com/v23.0/oauth/access_token`, null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
      },
    });

    const access_token = tokenResponse.data.access_token;
    console.log('✅ Access Token:', access_token);

    // Step 2: Subscribe to Webhooks
    const subscribeResponse = await axios.post(
      `https://graph.facebook.com/v23.0/${waba_id}/subscribed_apps`,
      {},
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    console.log('✅ App Subscribed to Webhooks:', subscribeResponse.data);

    // Step 3: Register the phone number
    const registerResponse = await axios.post(
      `https://graph.facebook.com/v23.0/${phone_number_id}/register`,
      {
        messaging_product: 'whatsapp',
        pin: process.env.NUMBER_PIN,
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Phone Number Registered:', registerResponse.data);

    // Success: Redirect to your frontend
    return res.redirect(`${process.env.SUCCESS_URL}?token=${access_token}`);
  } catch (err) {
    console.error('❌ Onboarding Error:', err.response?.data || err.message);
    return res.status(500).send('Onboarding failed');
  }
});

// Catch-all for undefined routes
app.use((req, res) => res.status(404).send('Not Found'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
