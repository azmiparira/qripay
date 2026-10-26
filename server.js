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

// Currently active QRIS store being displayed/scanned on the web
let activeStore = {
  id: 'pempek',
  name: 'Pempek Bandung'
};

app.get('/api/store/active', (req, res) => {
  res.json({ success: true, activeStore });
});

app.post('/api/store/active', (req, res) => {
  const { id, name } = req.body || {};
  if (id && name) {
    activeStore = { id, name };
  }
  res.json({ success: true, activeStore });
});

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
  const expiresAt = session?.expires_at ? new Date(session.expires_at) : null;
  const isExpired = expiresAt ? (new Date() > expiresAt) : false;
  const isConnected = !!(session && session.cookie && !isExpired);

  res.json({
    success: true,
    connected: isConnected,
    isExpired,
    storeName: session?.store_name || 'Jus Smoothies - Janji Jawa - AZMI ADI PARIRA',
    storeId: session?.store_id || '03555c6f-2c66-466d-8c26-a404adbc8ebb',
    merchantGroupId: session?.merchant_group_id || 'IDMG20250905033145011397',
    city: session?.city || 'Bandung',
    expiresAt: session?.expires_at || null,
    lastChecked: lastCheckTime
  });
});

app.post('/api/grab/session', async (req, res) => {
  try {
    const rawInput = req.body?.curl || req.body?.raw || req.body?.token;
    if (!rawInput) {
      return res.status(400).json({
        success: false,
        error: 'Teks cURL atau token tidak boleh kosong. Silakan tempel seluruh perintah cURL dari browser.'
      });
    }

    const result = await grabSessionManager.updateSessionFromCurl(rawInput);
    lastCheckTime = new Date().toISOString();

    res.json({
      success: true,
      message: 'Sesi Grab berhasil diperbarui dan aktif!',
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || 'Gagal memproses cURL Grab'
    });
  }
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

    // Tag transactions with the currently active QRIS store name scanned on web
    const taggedTransactions = normalized.map((tx, idx) => ({
      ...tx,
      store_name: idx === 0 ? activeStore.name : (tx.store_name || activeStore.name),
      store_id: idx === 0 ? activeStore.id : (tx.store_id || activeStore.id),
      scanned_store_name: activeStore.name,
      scanned_store_id: activeStore.id
    }));

    res.json({
      success: true,
      connected: true,
      serverTime: lastCheckTime,
      activeStore,
      totalCount: taggedTransactions.length,
      transactions: taggedTransactions
    });
  } catch (err) {
    res.json({ success: false, error: err.message, activeStore });
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
