require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const grabSessionManager = require('./grabSessionManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Transaction History & Event Cache
const transactions = [];
const MAX_HISTORY = 100;
let lastCheckTime = null;

function recordTransaction(tx) {
  const item = {
    id: tx.id || String(Date.now()),
    transactionId: tx.transactionId || tx.id || String(Date.now()),
    amount: parseInt(tx.amount, 10) || 0,
    storeId: tx.storeId || 'pempek',
    storeName: tx.storeName || 'Pempek Bandung',
    payer: tx.payer || 'GrabPay / OVO QRIS',
    source: tx.source || 'GrabMerchant Gateway',
    timestamp: tx.timestamp || tx.created_at || new Date().toISOString()
  };

  // Prevent duplicate insertion in history
  const exists = transactions.some(t => t.transactionId === item.transactionId);
  if (!exists) {
    transactions.unshift(item);
    if (transactions.length > MAX_HISTORY) transactions.pop();
  }
  return item;
}

// ==============================================================================
// 1. GRABMERCHANT GATEWAY ENDPOINTS
// ==============================================================================

app.get('/api/status', (req, res) => {
  const session = grabSessionManager.loadSession();
  res.json({
    success: true,
    status: 'online',
    gateway: 'GrabMerchant Gateway',
    storeName: session?.store_name || 'Jus Smoothies - Janji Jawa',
    storeId: session?.store_id || '03555c6f-2c66-466d-8c26-a404adbc8ebb',
    serverTime: new Date().toISOString(),
    totalRecordedTransactions: transactions.length
  });
});

app.get('/api/grab/status', (req, res) => {
  const session = grabSessionManager.loadSession();
  const isConnected = !!(session && session.cookie);
  res.json({
    success: true,
    connected: isConnected,
    storeName: session?.store_name || 'Jus Smoothies - Janji Jawa - AZMI ADI PARIRA',
    storeId: session?.store_id || '03555c6f-2c66-466d-8c26-a404adbc8ebb',
    merchantGroupId: session?.merchant_group_id || 'IDMG20250905033145011397',
    city: session?.city || 'Bandung',
    expiresAt: session?.expires_at || null,
    lastChecked: lastCheckTime
  });
});

app.get('/api/grab/transactions', async (req, res) => {
  try {
    const apiData = await grabSessionManager.fetchTransactions({ limit: 30 });
    const normalized = grabSessionManager.normalizeTransactions(apiData);
    lastCheckTime = new Date().toISOString();

    res.json({
      success: true,
      total_count: normalized.length,
      data: { transactions: normalized }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/grab/poll', async (req, res) => {
  try {
    const apiData = await grabSessionManager.fetchTransactions({ limit: 15 });
    const normalized = grabSessionManager.normalizeTransactions(apiData);
    lastCheckTime = new Date().toISOString();

    res.json({
      success: true,
      connected: true,
      serverTime: lastCheckTime,
      totalCount: normalized.length,
      transactions: normalized
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/simulate', (req, res) => {
  const amount = parseInt(req.body.amount, 10) || 15000;
  const storeId = req.body.storeId || 'pempek';
  const storeNames = {
    pempek: 'Pempek Bandung',
    batagor: 'Batagor Bandung',
    soto: 'Soto Lamongan',
    pusat: 'Jus Smoothies Cipadung'
  };
  const storeName = req.body.storeName || storeNames[storeId] || 'Pempek Bandung';

  const tx = recordTransaction({
    id: `SIM-${Date.now()}`,
    transactionId: `SIM-${Date.now()}`,
    amount,
    storeId,
    storeName,
    payer: 'Pembeli (Simulasi Tes)',
    source: 'Simulasi Mandiri'
  });

  res.json({ success: true, transaction: tx });
});

app.get('/api/history', (req, res) => {
  res.json({ success: true, transactions });
});

// Fallback universal webhook
app.post(['/api/webhook', '/webhook'], (req, res) => {
  const amount = parseInt(req.body?.amount || req.query?.amount, 10) || 10000;
  const storeId = req.body?.storeId || req.query?.storeId || 'pempek';
  const storeName = req.body?.storeName || req.query?.storeName || 'Pempek Bandung';

  const tx = recordTransaction({
    id: `WH-${Date.now()}`,
    amount,
    storeId,
    storeName,
    payer: req.body?.payer || 'Pembeli QRIS',
    source: 'Webhook External'
  });

  res.json({ success: true, transaction: tx });
});

// Start local dev server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🔊 QRIPAY GrabMerchant Soundbox running on http://localhost:${PORT}`);
    console.log(`🟢 Connected to: Jus Smoothies - Janji Jawa (Bandung)`);
    console.log(`====================================================`);
  });
}

module.exports = app;
