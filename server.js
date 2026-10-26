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

// ==============================================================================
// 1. MULTI-DEVICE SOUNDBOX & BRANCH REGISTRY (SE-INDONESIA)
// ==============================================================================

const STORES = {
  pempek: {
    id: 'pempek',
    name: 'Pempek Bandung',
    deviceId: 'SB-PEMPEK-01',
    location: 'Bandung (Cabang Buah Batu)'
  },
  batagor: {
    id: 'batagor',
    name: 'Batagor Bandung',
    deviceId: 'SB-BATAGOR-01',
    location: 'Bandung (Cabang Dago)'
  },
  soto: {
    id: 'soto',
    name: 'Soto Lamongan',
    deviceId: 'SB-SOTO-01',
    location: 'Bandung (Cabang Dipatiukur)'
  },
  pusat: {
    id: 'pusat',
    name: 'Jus Smoothies Pusat',
    deviceId: 'SB-PUSAT-01',
    location: 'Bandung (Pusat Cipadung)'
  }
};

// IoT Device Heartbeats & Status
const soundboxDevices = {
  'SB-PEMPEK-01': { id: 'SB-PEMPEK-01', branch: 'pempek', name: 'Pempek Bandung', lastSeen: null },
  'SB-BATAGOR-01': { id: 'SB-BATAGOR-01', branch: 'batagor', name: 'Batagor Bandung', lastSeen: null },
  'SB-SOTO-01': { id: 'SB-SOTO-01', branch: 'soto', name: 'Soto Lamongan', lastSeen: null },
  'SB-PUSAT-01': { id: 'SB-PUSAT-01', branch: 'pusat', name: 'Jus Smoothies Pusat', lastSeen: null }
};

// In-Memory Transaction Queues
const transactions = []; // Global history
const MAX_HISTORY = 100;
let lastCheckTime = null;

const branchQueues = {
  pempek: [],
  batagor: [],
  soto: [],
  pusat: []
};

// Currently active QRIS store being displayed/scanned on the web
let activeStore = {
  id: 'pempek',
  name: 'Pempek Bandung'
};

function addBranchTransaction(tx) {
  const branchId = tx.branch || tx.storeId || 'pempek';
  const storeInfo = STORES[branchId] || STORES.pempek;
  const now = new Date().toISOString();

  const item = {
    id: tx.id || `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    transactionId: tx.transactionId || tx.id || `TX-${Date.now()}`,
    amount: parseInt(tx.amount, 10) || 0,
    branch: branchId,
    storeId: branchId,
    storeName: storeInfo.name,
    deviceId: storeInfo.deviceId,
    location: storeInfo.location,
    payer: tx.payer || 'QRIS GrabPay / OVO',
    source: tx.source || 'Kasir Scan QRIS',
    timestamp: tx.timestamp || now,
    created_at: tx.created_at || now
  };

  // Prevent duplicate insertion in history
  const exists = transactions.some(t => t.id === item.id || t.transactionId === item.transactionId);
  if (!exists) {
    transactions.unshift(item);
    if (transactions.length > MAX_HISTORY) transactions.pop();

    if (!branchQueues[branchId]) branchQueues[branchId] = [];
    branchQueues[branchId].unshift(item);
    if (branchQueues[branchId].length > 50) branchQueues[branchId].pop();
  }

  return item;
}

// ==============================================================================
// 2. ACTIVE STORE SYNC
// ==============================================================================

app.get('/api/store/active', (req, res) => {
  res.json({ success: true, activeStore });
});

app.post('/api/store/active', (req, res) => {
  const { id, name } = req.body || {};
  if (id && STORES[id]) {
    activeStore = { id, name: STORES[id].name };
  } else if (id && name) {
    activeStore = { id, name };
  }
  res.json({ success: true, activeStore });
});

// ==============================================================================
// 3. SOUNDBOX IoT MULTI-DEVICE POLLING & TRIGGER APIS
// ==============================================================================

/**
 * Dedicated Polling Endpoint for ESP32 Soundboxes (e.g., in Wokwi or real devices)
 * GET /api/soundbox/poll?branch=pempek&device=SB-PEMPEK-01
 * If branch=all, acts as a Universal Receiver for all 4 QRIS stores (solves Wokwi 1-WiFi limit)
 */
app.get('/api/soundbox/poll', (req, res) => {
  const branch = (req.query.branch || 'all').toLowerCase();

  // Mode "ALL": Universal multi-branch listener (perfect for running in 1 single Wokwi tab)
  if (branch === 'all') {
    Object.keys(soundboxDevices).forEach(key => {
      soundboxDevices[key].lastSeen = Date.now();
    });

    return res.json({
      success: true,
      branch: 'all',
      storeName: activeStore.name || 'Semua Cabang (4 QRIS)',
      deviceId: 'SB-MULTI-01',
      location: 'Jaringan Multi-Kasir',
      serverTime: new Date().toISOString(),
      activeStore,
      totalCount: transactions.length,
      transactions: transactions.slice(0, 10)
    });
  }

  const storeInfo = STORES[branch] || STORES.pempek;
  const deviceId = req.query.device || storeInfo.deviceId;

  // Update device heartbeat
  if (!soundboxDevices[deviceId]) {
    soundboxDevices[deviceId] = {
      id: deviceId,
      branch: branch,
      name: storeInfo.name,
      lastSeen: Date.now()
    };
  } else {
    soundboxDevices[deviceId].lastSeen = Date.now();
    soundboxDevices[deviceId].branch = branch;
    soundboxDevices[deviceId].name = storeInfo.name;
  }

  const branchTxs = branchQueues[branch] || [];

  res.json({
    success: true,
    branch,
    storeName: storeInfo.name,
    deviceId,
    location: storeInfo.location,
    serverTime: new Date().toISOString(),
    totalCount: branchTxs.length,
    transactions: branchTxs.slice(0, 10)
  });
});

/**
 * Direct Trigger / Customer Scan Simulator
 * POST /api/soundbox/trigger
 * Body: { branch: "pempek", amount: 25000, payer: "BCA Mobile QRIS" }
 */
app.post('/api/soundbox/trigger', (req, res) => {
  const branch = (req.body.branch || req.body.storeId || 'pempek').toLowerCase();
  const amount = parseInt(req.body.amount, 10) || 15000;
  const payer = req.body.payer || 'QRIS Scan di Kasir';

  const tx = addBranchTransaction({
    branch,
    amount,
    payer,
    source: 'Kasir Scan Simulator'
  });

  res.json({
    success: true,
    message: `Pembayaran Rp ${amount.toLocaleString('id-ID')} berhasil dikirim ke Soundbox ${tx.storeName}!`,
    transaction: tx
  });
});

/**
 * Get Live Status of all Soundbox devices across Indonesia
 * GET /api/soundbox/devices
 */
app.get('/api/soundbox/devices', (req, res) => {
  const now = Date.now();
  const list = Object.keys(STORES).map(branchKey => {
    const s = STORES[branchKey];
    const dev = soundboxDevices[s.deviceId];
    const lastSeen = dev?.lastSeen || null;
    const isOnline = lastSeen ? (now - lastSeen < 12000) : false; // Online if polled within last 12s

    return {
      branchId: s.id,
      storeName: s.name,
      deviceId: s.deviceId,
      location: s.location,
      online: isOnline,
      lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null
    };
  });

  res.json({ success: true, devices: list });
});

// ==============================================================================
// 4. GRABMERCHANT GATEWAY ENDPOINTS
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

    // Map each new transaction to the appropriate branch queue
    normalized.forEach(tx => {
      const exists = transactions.some(t => t.id === String(tx.id) || t.transactionId === String(tx.id));
      if (!exists) {
        addBranchTransaction({
          id: String(tx.id),
          transactionId: String(tx.id),
          amount: tx.amount,
          branch: activeStore.id, // Route to active QRIS being scanned on web
          payer: tx.type ? `${tx.type.toUpperCase()} QRIS` : 'GrabPay QRIS',
          source: 'GrabMerchant API',
          created_at: tx.created_at
        });
      }
    });

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
  const branch = (req.body.storeId || req.body.branch || 'pempek').toLowerCase();
  const amount = parseInt(req.body.amount, 10) || 15000;

  const tx = addBranchTransaction({
    branch,
    amount,
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
  const branch = (req.body?.storeId || req.query?.storeId || 'pempek').toLowerCase();

  const tx = addBranchTransaction({
    branch,
    amount,
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
    console.log(`🟢 Multi-Device Soundbox Registry: Pusat, Pempek, Batagor, Soto`);
    console.log(`====================================================`);
  });
}

module.exports = app;
