const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Transaction Store (Holds last 100 events)
const transactions = [];
let lastEventId = Date.now();
const sseClients = new Set();

/**
 * Helper: Parse nominal dari teks notifikasi Shopee / DANA / Bank
 * Contoh input:
 * - "Pembayaran diterima Rp 15.000 dari BCA" -> 15000
 * - "Kamu menerima pembayaran Rp25.500" -> 25500
 * - "10000" -> 10000
 */
function extractAmountFromText(text) {
  if (typeof text === 'number') return text;
  if (!text) return 0;
  
  const str = String(text);
  // Cari pola Rp 15.000 atau Rp15000
  const rpMatch = str.match(/(?:rp\.?|idr)\s*([0-9\.\,]+)/i);
  if (rpMatch && rpMatch[1]) {
    const clean = rpMatch[1].replace(/\./g, '').replace(/,/g, '');
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Cari angka sembarang jika tidak ada prefix Rp
  const numMatch = str.match(/([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,10})/);
  if (numMatch && numMatch[1]) {
    const clean = numMatch[1].replace(/\./g, '').replace(/,/g, '');
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num > 0) return num;
  }

  return 0;
}

/**
 * Broadcast event to SSE and In-Memory Buffer
 */
function recordAndBroadcast(txData) {
  lastEventId = Date.now();
  const tx = {
    id: lastEventId,
    amount: txData.amount || 0,
    payer: txData.payer || 'QRIS Pembeli',
    source: txData.source || 'Shopee Partner',
    rawText: txData.rawText || '',
    timestamp: new Date().toISOString()
  };

  transactions.unshift(tx);
  if (transactions.length > 100) transactions.pop();

  // Notify SSE clients
  const ssePayload = `data: ${JSON.stringify(tx)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(ssePayload);
    } catch (e) {
      sseClients.delete(client);
    }
  });

  console.log(`[${new Date().toLocaleTimeString('id-ID')}] 🔊 Soundbox Triggered: Rp ${tx.amount.toLocaleString('id-ID')} (${tx.payer})`);
  return tx;
}

// ==========================================
// 1. UNIVERSAL WEBHOOK ENDPOINT
// ==========================================
function handleIncomingPayment(req, res) {
  const time = new Date().toLocaleTimeString('id-ID');
  console.log(`[${time}] 📥 Incoming Webhook Received:`, req.body, req.query);

  let amount = 0;
  let payer = 'ShopeePay';
  let rawText = '';

  // 1. Ambil dari body jika format JSON terstruktur
  if (req.body && typeof req.body === 'object') {
    if (req.body.amount) {
      amount = extractAmountFromText(req.body.amount);
    }
    if (req.body.payer) {
      payer = req.body.payer;
    }
    // Jika body berisi teks mentah dari notifikasi HP (MacroDroid / Notification Listener)
    if (req.body.text || req.body.message || req.body.title) {
      rawText = `${req.body.title || ''} ${req.body.text || req.body.message || ''}`.trim();
      if (!amount) {
        amount = extractAmountFromText(rawText);
      }
    }
  }

  // 2. Ambil dari query string URL jika via GET / browser test
  if (!amount && req.query.amount) {
    amount = extractAmountFromText(req.query.amount);
  }
  if (req.query.payer) {
    payer = req.query.payer;
  }
  if (!rawText && req.query.text) {
    rawText = req.query.text;
    if (!amount) amount = extractAmountFromText(rawText);
  }

  // Validasi nominal
  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Gagal mendeteksi nominal uang masuk. Pastikan ada parameter "amount" atau teks notifikasi "Rp ..."',
      receivedBody: req.body,
      receivedQuery: req.query
    });
  }

  const tx = recordAndBroadcast({
    amount,
    payer,
    source: req.body.package || req.body.source || 'Shopee Partner QRIS',
    rawText
  });

  return res.json({
    success: true,
    message: 'Pembayaran berhasil diterima dan diteruskan ke Soundbox Web!',
    transaction: tx
  });
}

// Support POST and GET for webhook testing
app.post('/api/webhook', handleIncomingPayment);
app.get('/api/webhook', handleIncomingPayment);
app.post('/webhook', handleIncomingPayment);
app.get('/webhook', handleIncomingPayment);

// ==========================================
// 2. CLIENT POLLING ENDPOINT (Reliable on Vercel Serverless)
// ==========================================
app.get('/api/poll', (req, res) => {
  const since = parseInt(req.query.since, 10) || 0;
  const newEvents = transactions.filter(t => t.id > since);

  res.json({
    success: true,
    latestId: transactions.length > 0 ? transactions[0].id : since,
    hasNew: newEvents.length > 0,
    events: newEvents
  });
});

// ==========================================
// 3. SSE STREAM ENDPOINT (Realtime for VPS / Local)
// ==========================================
app.get('/api/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(': connected\n\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ==========================================
// 4. INSTANT SIMULATE / TEST BUTTON
// ==========================================
app.post('/api/simulate', (req, res) => {
  const amount = parseInt(req.body.amount, 10) || 15000;
  const payer = req.body.payer || 'Pembeli QRIS (Tes Mandiri)';

  const tx = recordAndBroadcast({
    amount,
    payer,
    source: 'Simulasi Web',
    rawText: `Tes Simulasi Pembayaran Rp ${amount.toLocaleString('id-ID')}`
  });

  res.json({ success: true, transaction: tx });
});

// ==========================================
// 5. HISTORY & STATUS ENDPOINT
// ==========================================
app.get('/api/history', (req, res) => {
  res.json({ success: true, transactions });
});

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: new Date().toISOString(),
    totalRecordedTransactions: transactions.length
  });
});

// Start Server locally
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🔊 QRIPAY Soundbox Server running on http://localhost:${PORT}`);
    console.log(`📡 Webhook URL: http://localhost:${PORT}/api/webhook`);
    console.log(`====================================================`);
  });
}

module.exports = app;
