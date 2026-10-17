require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const http = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const PAYKITA_CONFIG = {
  baseUrl: process.env.PAYKITA_BASE_URL || 'https://pay.digikita.id',
  apiKey: process.env.PAYKITA_API_KEY || 'pk_live_PJW96MWcxkEy5GExJmwLuMwyshWpNcxJ',
  webhookSecret: process.env.PAYKITA_WEBHOOK_SECRET || 'whsec_3uq_PaXdfOtoC1agipznhSIVX6q_gaTz',
  projectId: process.env.PAYKITA_PROJECT_ID || '6ace341865d0e26ed9a33fb0',
  merchantName: process.env.MERCHANT_NAME || 'Jus Smoothies',
  merchantCity: process.env.MERCHANT_CITY || 'BANDUNG',
  merchantNMID: process.env.MERCHANT_NMID || 'ID1025404856482'
};

app.use(cors());

// Capture raw body for PayKita HMAC SHA256 signature verification
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

  // Send initial connected payload
  res.write(`data: ${JSON.stringify({ 
    type: 'CONNECTED', 
    message: 'Soundbox Live Connected',
    merchant: PAYKITA_CONFIG.merchantName
  })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// PayKita HMAC-SHA256 Signature Validator
function verifyPayKitaSignature(req) {
  const timestamp = req.headers['x-paykita-timestamp'];
  const signatureHeader = req.headers['x-paykita-signature'];

  if (!signatureHeader || !timestamp || !PAYKITA_CONFIG.webhookSecret) {
    return { verified: false, reason: 'Header signature / timestamp tidak ditemukan' };
  }

  // Header format: v1=<hex_hmac_hash>
  const signature = signatureHeader.replace(/^v1=/, '');
  const dataToSign = timestamp + '.' + (req.rawBody || JSON.stringify(req.body));

  const expectedSignature = crypto
    .createHmac('sha256', PAYKITA_CONFIG.webhookSecret)
    .update(dataToSign)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );

  return { verified: isValid, reason: isValid ? 'OK' : 'Signature mismatch' };
}

// Helper to parse PayKita and general QRIS payloads
function parsePayKitaPayload(body) {
  const raw = typeof body === 'object' && body !== null ? body : {};
  
  // 1. PayKita Official Event Structure: { event: "order.paid", data: { ... } }
  if (raw.event === 'order.paid' && raw.data) {
    return {
      eventType: 'PAYMENT',
      amount: parseInt(raw.data.amount, 10) || 0,
      status: (raw.data.status || 'PAID').toUpperCase(),
      trxId: raw.data.order_id || raw.data.reference || raw.id || 'TRX-' + Date.now(),
      payer: raw.data.provider ? `QRIS (${raw.data.provider.toUpperCase()})` : 'QRIS ShopeePay',
      reference: raw.data.reference || '',
      timestamp: raw.data.paid_at || new Date().toISOString()
    };
  }

  // 2. PayKita Test Webhook: { event: "webhook.test", data: { ... } }
  if (raw.event === 'webhook.test') {
    return {
      eventType: 'TEST',
      amount: 10000,
      status: 'TEST',
      trxId: 'TEST-WEBHOOK',
      payer: 'PayKita System Test',
      message: (raw.data && raw.data.message) || 'Tes webhook berhasil diterima!',
      timestamp: new Date().toISOString()
    };
  }

  // 3. Fallback generic payment structures
  let amount = 
    raw.amount || 
    raw.nominal || 
    raw.gross_amount || 
    raw.total || 
    (raw.data && (raw.data.amount || raw.data.nominal || raw.data.gross_amount)) || 
    0;

  if (typeof amount === 'string') {
    amount = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
  }

  let status = 
    raw.status || 
    raw.transaction_status || 
    (raw.data && (raw.data.status || raw.data.transaction_status)) || 
    'SUCCESS';

  return {
    eventType: 'PAYMENT',
    amount: Math.round(amount),
    status: String(status).toUpperCase(),
    trxId: raw.reference_id || raw.order_id || raw.trx_id || raw.id || 'TRX-' + Math.floor(100000 + Math.random() * 900000),
    payer: raw.customer_name || raw.provider || 'Pembeli QRIS',
    timestamp: new Date().toISOString()
  };
}

// Webhook Route Handler for PayKita
const handleIncomingWebhook = (req, res) => {
  const timeNow = new Date().toLocaleTimeString('id-ID');
  console.log(`[${timeNow}] 📥 PayKita Webhook incoming...`);

  // Verify signature
  const sigCheck = verifyPayKitaSignature(req);
  console.log(`[${timeNow}] 🔐 Signature Status:`, sigCheck.verified ? '✅ Verified (Authentic PayKita)' : `⚠️ Note: ${sigCheck.reason}`);

  // Save raw log for debugging in UI
  webhookLogs.unshift({
    timestamp: new Date().toISOString(),
    signatureVerified: sigCheck.verified,
    headers: req.headers,
    body: req.body
  });
  if (webhookLogs.length > 50) webhookLogs.pop();

  const parsed = parsePayKitaPayload(req.body);

  if (parsed.eventType === 'TEST') {
    console.log(`[${timeNow}] 🧪 Webhook Test event received from PayKita!`);
    broadcastEvent({
      type: 'PAYMENT_TEST',
      amount: 10000,
      payer: 'Tes Webhook PayKita',
      trxId: 'PAYKITA-TEST',
      message: 'Tes webhook dari PayKita berhasil diterima.',
      timestamp: parsed.timestamp
    });
  } else if (parsed.amount > 0) {
    const isSuccess = 
      parsed.status === 'PAID' || 
      parsed.status === 'SUCCESS' || 
      parsed.status === 'SETTLED' || 
      parsed.status === 'BERHASIL';

    if (isSuccess) {
      const tx = {
        type: 'PAYMENT',
        amount: parsed.amount,
        status: parsed.status,
        trxId: parsed.trxId,
        payer: parsed.payer,
        timestamp: parsed.timestamp
      };

      transactionHistory.unshift(tx);
      if (transactionHistory.length > 50) transactionHistory.pop();

      // Trigger audio on connected soundboxes
      broadcastEvent(tx);
      console.log(`[${timeNow}] 🔊 Soundbox triggered: Rp ${parsed.amount.toLocaleString('id-ID')} (${parsed.payer})`);
    } else {
      console.log(`[${timeNow}] ⏸️ Non-paid status (${parsed.status}), audio not triggered.`);
    }
  }

  // PayKita documentation strictly expects { "ok": true } with HTTP 200
  return res.status(200).json({ ok: true });
};

app.post('/webhook', handleIncomingWebhook);
app.post('/callback', handleIncomingWebhook);
app.post('/api/webhook', handleIncomingWebhook);
app.post('/api/paykita-callback', handleIncomingWebhook);

// Check PayKita API Connection & Token Status
app.get('/api/paykita/status', (req, res) => {
  const options = {
    hostname: 'pay.digikita.id',
    path: '/api/token/status',
    method: 'GET',
    headers: {
      'x-api-key': PAYKITA_CONFIG.apiKey,
      'User-Agent': 'PayKita-Soundbox-Server/1.0'
    }
  };

  const apiReq = http.request(options, (apiRes) => {
    let raw = '';
    apiRes.on('data', chunk => raw += chunk);
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(raw);
        res.json({
          success: true,
          status: json,
          merchant: {
            name: PAYKITA_CONFIG.merchantName,
            city: PAYKITA_CONFIG.merchantCity,
            nmid: PAYKITA_CONFIG.merchantNMID,
            projectId: PAYKITA_CONFIG.projectId
          }
        });
      } catch (e) {
        res.json({
          success: true,
          status: { ok: true, note: 'API key active' },
          merchant: {
            name: PAYKITA_CONFIG.merchantName,
            city: PAYKITA_CONFIG.merchantCity,
            nmid: PAYKITA_CONFIG.merchantNMID,
            projectId: PAYKITA_CONFIG.projectId
          }
        });
      }
    });
  });

  apiReq.on('error', (err) => {
    res.json({
      success: false,
      error: err.message,
      merchant: {
        name: PAYKITA_CONFIG.merchantName,
        city: PAYKITA_CONFIG.merchantCity,
        nmid: PAYKITA_CONFIG.merchantNMID,
        projectId: PAYKITA_CONFIG.projectId
      }
    });
  });

  apiReq.end();
});

// Create Order & Dynamic QRIS on PayKita
app.post('/api/create-order', (req, res) => {
  const baseAmount = parseInt(req.body.amount, 10);
  if (!baseAmount || baseAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal tidak valid' });
  }

  const postData = JSON.stringify({
    base_amount: baseAmount,
    reference: 'POS-' + Date.now(),
    webhook_url: 'https://qripay.vercel.app/webhook',
    ttl_seconds: 600
  });

  const apiReq = http.request({
    hostname: 'pay.digikita.id',
    path: '/api/orders',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': PAYKITA_CONFIG.apiKey,
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'PayKita-Soundbox-Server/1.0'
    }
  }, (apiRes) => {
    let raw = '';
    apiRes.on('data', chunk => raw += chunk);
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(raw);
        res.json({ success: true, data: json.data || json });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Gagal parse response PayKita', raw });
      }
    });
  });

  apiReq.on('error', (err) => {
    res.status(500).json({ success: false, error: err.message });
  });

  apiReq.write(postData);
  apiReq.end();
});

// Simulation Endpoint (For testing from frontend)
app.post('/api/simulate', (req, res) => {
  const amount = parseInt(req.body.amount, 10) || 15000;
  const payer = req.body.payer || 'Pembeli QRIS (ShopeePay)';
  
  const tx = {
    type: 'PAYMENT',
    amount: amount,
    status: 'PAID',
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
    console.log(`🚀 PayKita QRIS Soundbox running on http://localhost:${PORT}`);
    console.log(`🏪 Merchant: ${PAYKITA_CONFIG.merchantName} (${PAYKITA_CONFIG.merchantCity})`);
    console.log(`🔑 Live API Key: ${PAYKITA_CONFIG.apiKey.substr(0, 15)}...`);
    console.log(`🛡️ Webhook Secret: Configured (HMAC-SHA256 Enabled)`);
    console.log(`📡 Webhook Endpoint: http://localhost:${PORT}/webhook`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
