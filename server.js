require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req,res,next)=>{console.log(`[${req.method}] ${req.originalUrl}`); next();});

// Webhook verification
app.get('/webhook', (req,res)=>{
  const { VERIFY_TOKEN } = process.env;
  if(req.query['hub.mode']==='subscribe' && req.query['hub.verify_token']===VERIFY_TOKEN){
    console.log('✅ Webhook Verified');
    return res.status(200).send(req.query['hub.challenge']);
  }
  console.warn('❌ Webhook verification failed');
  return res.sendStatus(403);
});

// Webhook event logging
app.post('/webhook',(req,res)=>{
  console.log('📨 Webhook Event:', JSON.stringify(req.body,null,2));
  res.sendStatus(200);
});

// OAuth code exchange
app.get('/exchange-token',async (req,res)=>{
  const { code } = req.query;
  if(!code) return res.status(400).send('Missing code');
  try {
    const resp = await axios.get('https://graph.facebook.com/v23.0/oauth/access_token', {
      params:{
        grant_type:'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }
    });
    console.log('✅ Access Token Exchange:', resp.data);
    const businessToken = resp.data.access_token;
    // TODO: store token & call senders API to register WABA phone number

    return res.redirect(process.env.SUCCESS_URL + `?token=${businessToken}`);
  } catch(err){
    console.error('❌ Token Exchange Error:', err.response?.data || err.message);
    return res.status(500).send('Token exchange failed');
  }
});

// catch-all
app.use((req,res)=>res.status(404).send('Not Found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`🚀 Listening on port ${PORT}`));
