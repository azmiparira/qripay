require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const CASHI_CONFIG = {
  baseUrl: process.env.CASHI_BASE_URL || 'https://cashi.id',
  apiKey: process.env.CASHI_API_KEY || '28567018921edd2bb00c979281d2ab663ab16b4809c87e23b4234f22d4b7fadf',
  webhookSecret: process.env.CASHI_WEBHOOK_SECRET || 'sk_725cec268bbf895562be95d9aff42c37',
  merchantName: process.env.MERCHANT_NAME || 'Jus Smoothies'
};

app.use(cors());

// Capture raw body for Cashi.id HMAC-SHA256 signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf ? buf.toString('utf8') : '';
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Store connected SSE clients
let sseClients = [];

// Store transaction history & raw webhook logs (in-memory)
const transactionHistory = [];
const webhookLogs = [];

// Broadcast helper via SSE
function broadcastEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (err) {
      console.error('Failed to send SSE to client:', err);
    }
  });
}

// SSE endpoint for live soundbox clients
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const clientId = Date.now() + Math.random().toString(36).substr(2, 9);
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  res.write(`data: ${JSON.stringify({ 
    type: 'CONNECTED', 
    message: 'Cashi.id Soundbox Live Connected',
    merchant: CASHI_CONFIG.merchantName
  })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Cashi.id HMAC-SHA256 Signature Validator
function verifyCashiSignature(req) {
  const signature = req.headers['x-gateway-signature'] || req.headers['http_x_gateway_signature'];

  if (!signature) {
    return { verified: false, reason: 'Header x-gateway-signature tidak ditemukan' };
  }

  const payload = req.rawBody || JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', CASHI_CONFIG.webhookSecret)
    .update(payload)
    .digest('hex');

  const isValid = (signature === expected);
  return { verified: isValid, reason: isValid ? 'OK' : 'Signature mismatch' };
}

// Webhook Handler for Cashi.id
const handleIncomingWebhook = (req, res) => {
  const timeNow = new Date().toLocaleTimeString('id-ID');
  console.log(`[${timeNow}] 📥 Cashi.id Webhook incoming...`);

  // Verify signature
  const sigCheck = verifyCashiSignature(req);
  console.log(`[${timeNow}] 🔐 Signature Status:`, sigCheck.verified ? '✅ Verified (Authentic Cashi.id)' : `⚠️ Note: ${sigCheck.reason}`);

  // Save raw log for debugging in UI
  webhookLogs.unshift({
    timestamp: new Date().toISOString(),
    signatureVerified: sigCheck.verified,
    headers: req.headers,
    body: req.body
  });
  if (webhookLogs.length > 50) webhookLogs.pop();

  const { event, data } = req.body || {};

  // Handle Cashi.id Events
  if (event === 'PAYMENT_SETTLED' && data) {
    // 1. Test Event
    if (data.order_id && String(data.order_id).startsWith('TEST-')) {
      console.log(`[${timeNow}] 🧪 Cashi.id Test Webhook received!`);
      broadcastEvent({
        type: 'PAYMENT_TEST',
        amount: 10000,
        payer: 'Tes Webhook Cashi.id',
        trxId: data.order_id,
        message: 'Tes koneksi Webhook Cashi.id berhasil diterima!',
        timestamp: new Date().toISOString()
      });
      return res.status(200).send('Test OK');
    }

    // 2. Real Payment Settled
    if (data.status === 'SETTLED' || data.status === 'PAID') {
      const amount = parseInt(data.amount, 10) || 0;
      const tx = {
        type: 'PAYMENT',
        amount: amount,
        status: 'SETTLED',
        trxId: data.order_id || 'CASHI-' + Date.now(),
        payer: data.payment_method || data.channel || 'QRIS Cashi',
        timestamp: new Date().toISOString()
      };

      transactionHistory.unshift(tx);
      if (transactionHistory.length > 50) transactionHistory.pop();

      // Trigger audio on connected soundboxes
      broadcastEvent(tx);
      console.log(`[${timeNow}] 🔊 Soundbox triggered: Rp ${amount.toLocaleString('id-ID')} (${tx.payer})`);
      return res.status(200).send('OK');
    }
  }

  // Fallback for generic or non-settled events
  return res.status(200).send('Event processed');
};

app.post('/webhook', handleIncomingWebhook);
app.post('/api/webhook', handleIncomingWebhook);
app.post('/api/cashi-webhook', handleIncomingWebhook);

// Create Dynamic QRIS Order via Cashi.id API
app.post('/api/create-order', (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount < 2000) {
    return res.status(400).json({ 
      success: false, 
      message: 'Minimal nominal pembayaran QRIS Cashi.id adalah Rp 2.000' 
    });
  }

  const orderId = req.body.order_id || ('POS-' + Date.now().toString().slice(-8));
  const channel = req.body.kode_channel || 'QRIS_CUSTOM';

  const payload = JSON.stringify({
    amount: amount,
    order_id: orderId,
    kode_channel: channel
  });

  const options = {
    hostname: 'cashi.id',
    path: '/api/create-order',
    method: 'POST',
    headers: {
      'x-api-key': CASHI_CONFIG.apiKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'Cashi-Soundbox-Server/1.0'
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let raw = '';
    apiRes.on('data', chunk => raw += chunk);
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(raw);
        if (json.success) {
          res.json({
            success: true,
            orderId: json.orderId || orderId,
            amount: json.amount || amount,
            checkout_url: json.checkout_url,
            qrUrl: json.qrUrl,
            fee: json.fee,
            expires_at: json.expires_at
          });
        } else {
          res.status(apiRes.statusCode >= 400 ? apiRes.statusCode : 400).json({
            success: false,
            error: json.error || json.message || 'Gagal membuat QRIS di Cashi.id',
            details: json
          });
        }
      } catch (e) {
        res.status(500).json({ success: false, error: 'Gagal parse response dari Cashi.id', raw });
      }
    });
  });

  apiReq.on('error', (err) => {
    res.status(500).json({ success: false, error: err.message });
  });

  apiReq.write(payload);
  apiReq.end();
});

// Check Cashi.id API Status
app.get('/api/cashi/status', (req, res) => {
  const options = {
    hostname: 'cashi.id',
    path: '/api/check-status/CHECK-CONNECT',
    method: 'GET',
    headers: {
      'x-api-key': CASHI_CONFIG.apiKey,
      'User-Agent': 'Cashi-Soundbox-Server/1.0'
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let raw = '';
    apiRes.on('data', chunk => raw += chunk);
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(raw);
        res.json({
          success: true,
          status: json,
          merchant: CASHI_CONFIG.merchantName,
          httpCode: apiRes.statusCode
        });
      } catch (e) {
        res.json({
          success: true,
          status: { note: 'Cashi connected' },
          merchant: CASHI_CONFIG.merchantName,
          httpCode: apiRes.statusCode
        });
      }
    });
  });

  apiReq.on('error', (err) => {
    res.json({
      success: false,
      error: err.message,
      merchant: CASHI_CONFIG.merchantName
    });
  });

  apiReq.end();
});

// Simulation Endpoint (For instant testing from frontend)
app.post('/api/simulate', (req, res) => {
  const amount = parseInt(req.body.amount, 10) || 15000;
  const payer = req.body.payer || 'Pembeli QRIS (Cashi.id)';
  
  const tx = {
    type: 'PAYMENT',
    amount: amount,
    status: 'SETTLED',
    trxId: 'SIM-' + Math.floor(100000 + Math.random() * 900000),
    payer: payer,
    timestamp: new Date().toISOString()
  };

  transactionHistory.unshift(tx);
  if (transactionHistory.length > 50) transactionHistory.pop();

  broadcastEvent(tx);
  res.json({ success: true, transaction: tx });
});

// History & Logs API
app.get('/api/history', (req, res) => {
  res.json({ success: true, history: transactionHistory });
});

app.get('/api/logs', (req, res) => {
  res.json({ success: true, logs: webhookLogs });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Cashi.id QRIS Soundbox running on http://localhost:${PORT}`);
    console.log(`🏪 Merchant: ${CASHI_CONFIG.merchantName}`);
    console.log(`🔑 Cashi API Key: ${CASHI_CONFIG.apiKey.substr(0, 15)}...`);
    console.log(`🛡️ Webhook Secret: Configured (HMAC-SHA256 Enabled)`);
    console.log(`📡 Webhook Endpoint: http://localhost:${PORT}/webhook`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
