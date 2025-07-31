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

// ✅ Step 1: Webhook Verification (GET)
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

// ✅ Step 2: Webhook Event Receiver (POST)
app.post('/webhook', (req, res) => {
  console.log('📨 Webhook Event:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// 🔄 Step 2.5: Exchange Code via POST from Embedded Signup
app.post('/exchange-token', async (req, res) => {
  const { code, waba_id, phone_number_id } = req.body;
  if (!code) return res.status(400).send('Missing code');

  try {
    const tokenRes = await axios.get('https://graph.facebook.com/v23.0/oauth/access_token', {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
      },
    });

    const access_token = tokenRes.data.access_token;
    console.log('✅ Access Token:', access_token);
    console.log('🆔 WABA ID (from client):', waba_id);
    console.log('📞 Phone Number ID (from client):', phone_number_id);

    // Optionally store the details in a DB or session
    return res.status(200).json({ success: true, access_token });
  } catch (err) {
    console.error('❌ Token Exchange Error:', err.response?.data || err.message);
    return res.status(500).send('Token exchange failed');
  }
});


// ✅ Step 3: Exchange Code for Access Token
app.get('/exchange-token', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    const tokenRes = await axios.get(`https://graph.facebook.com/v23.0/oauth/access_token`, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
      },
    });

    const access_token = tokenRes.data.access_token;
    console.log('✅ Access Token:', access_token);

    // Return token to frontend or continue with next step
    return res.status(200).json({ success: true, access_token });
  } catch (err) {
    console.error('❌ Token Exchange Error:', err.response?.data || err.message);
    return res.status(500).send('Token exchange failed');
  }
});

// ✅ Step 4: Fetch WABA ID & Phone Number ID
app.get('/waba-info', async (req, res) => {
  const { access_token } = req.query;
  if (!access_token) return res.status(400).send('Missing access_token');

  try {
    // Get Business ID
    const businessRes = await axios.get('https://graph.facebook.com/v23.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const business_id = businessRes.data.id;
    console.log('✅ Business ID:', business_id);

    // Get WABA ID
    const wabaRes = await axios.get(`https://graph.facebook.com/v23.0/${business_id}/owned_whatsapp_business_accounts`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const waba_id = wabaRes.data.data[0]?.id;
    if (!waba_id) throw new Error('No WABA ID found');
    console.log('✅ WABA ID:', waba_id);

    // Add after you get waba_id in /waba-info route
await axios.post(
  `https://graph.facebook.com/v23.0/${waba_id}/subscribed_apps`,
  {},
  {
    headers: { Authorization: `Bearer ${access_token}` },
  }
);
console.log('✅ App subscribed to WABA webhooks');


    // Get Phone Number ID
    const phoneRes = await axios.get(`https://graph.facebook.com/v23.0/${waba_id}/phone_numbers`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const phone_number_id = phoneRes.data.data[0]?.id;
    if (!phone_number_id) throw new Error('No phone_number_id found');
    console.log('✅ Phone Number ID:', phone_number_id);

    res.json({ business_id, waba_id, phone_number_id });
  } catch (err) {
    console.error('❌ WABA Info Error:', err.response?.data || err.message);
    res.status(500).send('Failed to fetch WABA and phone info');
  }
});

// ✅ Step 5: Register Phone Number Using PIN
app.post('/register-phone', async (req, res) => {
  const { access_token, phone_number_id } = req.body;
  if (!access_token || !phone_number_id) {
    return res.status(400).send('Missing access_token or phone_number_id');
  }

  try {
    const registerRes = await axios.post(
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

    console.log('✅ Phone Registered:', registerRes.data);
    return res.redirect(`${process.env.SUCCESS_URL}?status=success`);

  } catch (err) {
    console.error('❌ Register Error:', err.response?.data || err.message);
    res.status(500).send('Phone registration failed');
  }
})


// ✅ WhatsApp Embedded Signup INIT Handler
app.post('/whatsapp-flow', (req, res) => {
  const { action } = req.body;

  if (action === "INIT") {
    return res.status(200).json({
      action: "INIT",
      status: "success"
    });
  }

  // Optionally handle other actions later
  return res.status(400).json({ error: "Unsupported action" });
});

// Catch-all for unknown routes
app.use((req, res) => res.status(404).send('Not Found'));

// ✅ Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));


