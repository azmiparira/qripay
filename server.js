require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const danaSessionManager = require('./danaSessionManager');
const grabSessionManager = require('./grabSessionManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Config from env
let shopeeToken = process.env.SHOPEE_TOKEN || '';
const apiKey = process.env.API_KEY || '';
const qrisStaticTemplate = process.env.QRIS_STATIC || '00020101021126580006id.ovo01189360091200028632020215yS8XQqMtdJFOgbp0303UKE51450015ID.OR.GPNQR.WWW0215ID10254332070950303UKE5204581253033605802ID5905BAKSO6007Bandung61054061462310507mdA5CZx07162ETGA0xIKAXiD4br63044093';

// In-Memory Buffers
const transactions = [];
let lastEventId = Date.now();
const sseClients = new Set();
const logs = [];
const MAX_LOGS = 100;
const qrisStore = new Map();
const usedTransactionIds = new Map();
const knownShopeeTxIds = new Set();
const knownGrabTxIds = new Set();
let isInitialGrabSync = true;
let lastGrabCheckTime = null;

let isInitialShopeeSync = true;
let lastShopeeCheckTime = null;
let tokenValidStatus = null;

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Logging helper
function logEvent(level, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${message}`);
  logs.push({ timestamp: ts, level, message });
  if (logs.length > MAX_LOGS) logs.shift();
}

// User-Agents Pool
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
];

function getRandomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const statusMap = {
  1: 'pending',
  2: 'processing',
  3: 'success',
  4: 'failed',
  5: 'cancelled'
};

// API Key Middleware (ShopeePay API Gateway compatibility)
function apiKeyMiddleware(req, res, next) {
  if (!apiKey) return next(); // If API_KEY is not configured in .env, allow open access
  const clientKey = req.headers['x-api-key'] || req.query.api_key;
  if (!clientKey || clientKey !== apiKey) {
    return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
  }
  next();
}

function getReqToken(req) {
  return req.headers['x-shopee-token'] || req.body?.token || req.query?.token || shopeeToken;
}

/**
 * TLV and CRC16-CCITT for Dynamic QRIS Generation
 */
function parseTLV(data) {
  const tags = [];
  let index = 0;
  while (index < data.length) {
    if (index + 4 > data.length) break;
    const tag = data.slice(index, index + 2);
    const length = parseInt(data.slice(index + 2, index + 4), 10);
    if (isNaN(length)) break;
    index += 4;
    if (index + length > data.length) break;
    const value = data.slice(index, index + length);
    index += length;
    tags.push([tag, value]);
  }
  return tags;
}

function buildTLV(tags) {
  let result = '';
  for (const [tag, val] of tags) {
    const lenStr = String(val.length).padStart(2, '0');
    result += tag + lenStr + val;
  }
  return result;
}

function crc16CCITT(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function generateDynamicQRIS(staticQR, amount) {
  if (!staticQR) throw new Error('Static QRIS string is missing');
  const tlvList = parseTLV(staticQR);
  if (tlvList.length === 0) throw new Error('Invalid static QRIS structure');

  const filtered = [];
  let hasAmount = false;
  for (const [tag, val] of tlvList) {
    if (tag === '63') continue; // Strip checksum tag
    if (tag === '01') {
      filtered.push(['01', '12']); // 12 = Dynamic QR
      continue;
    }
    if (tag === '54') {
      filtered.push(['54', String(amount)]);
      hasAmount = true;
      continue;
    }
    filtered.push([tag, val]);
  }

  if (!hasAmount) {
    const withAmount = [];
    for (const item of filtered) {
      withAmount.push(item);
      if (item[0] === '53') { // Insert Tag 54 right after Currency Tag 53
        withAmount.push(['54', String(amount)]);
      }
    }
    filtered.length = 0;
    filtered.push(...withAmount);
  }

  let raw = buildTLV(filtered) + '6304';
  const checksum = crc16CCITT(raw);
  return raw + checksum;
}

/**
 * ShopeePay Internal API Callers
 */
async function callShopeeAPI(startTime, endTime, pageSize = 20, nextPos = '', token = shopeeToken) {
  const url = 'https://shopeepay.shopee.co.id/merchant/v1/partner-web/get-transaction-list';
  const payload = {
    data: {
      metadata: {
        token: token,
        language: 'id',
        timezone: 'Asia/Jakarta'
      },
      pageSize: pageSize,
      filter: {
        startTime: startTime,
        endTime: endTime,
        serviceList: [1, 3]
      },
      sorter: {
        field: 'transaction_time',
        order: 'descend'
      },
      next_position: nextPos || ''
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'Origin': 'https://partner.shopee.co.id',
    'Referer': 'https://partner.shopee.co.id/',
    'User-Agent': getRandomUA(),
    'X-Timestamp-Ms': String(Date.now())
  };

  const response = await axios.post(url, payload, { headers, timeout: 15000 });
  return response.data;
}

async function callShopeeDetailAPI(orderSn, token = shopeeToken) {
  const url = 'https://shopeepay.shopee.co.id/merchant/v1/partner-web/get-transaction-detail';
  const payload = {
    data: {
      metadata: {
        token: token,
        language: 'id',
        timezone: 'Asia/Jakarta'
      },
      order_sn: String(orderSn)
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'Origin': 'https://partner.shopee.co.id',
    'Referer': 'https://partner.shopee.co.id/',
    'User-Agent': getRandomUA(),
    'X-Timestamp-Ms': String(Date.now())
  };

  const response = await axios.post(url, payload, { headers, timeout: 15000 });
  return response.data;
}

function formatTransaction(item) {
  const dateObj = new Date((item.transaction_time || item.transactionTime || Math.floor(Date.now() / 1000)) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;

  let amountStr = String(item.total_amount || item.amount || '0').replace(/\./g, '').replace(/,/g, '');
  const amount = parseInt(amountStr, 10) || 0;
  const statusStr = statusMap[item.status] || ('status_' + item.status);

  return {
    transactionId: item.transactionId || item.displayTransactionId || '',
    amount: amount,
    status: statusStr,
    time: timeStr,
    issuer: item.issuer || 'ShopeePay/QRIS'
  };
}

/**
 * Soundbox Core Broadcaster
 */
function recordAndBroadcast(txData) {
  lastEventId = Date.now();
  const tx = {
    id: lastEventId,
    transactionId: txData.transactionId || String(lastEventId),
    storeId: txData.storeId || 'pempek',
    storeName: txData.storeName || 'Pempek Bandung',
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

  logEvent('INFO', `🔊 Soundbox [${tx.storeName}]: Rp ${tx.amount.toLocaleString('id-ID')} (${tx.payer}) via ${tx.source}`);
  return tx;
}

function extractAmountFromText(text) {
  if (typeof text === 'number') return text;
  if (!text) return 0;
  
  const str = String(text);
  const rpMatch = str.match(/(?:rp\.?|idr)\s*([0-9\.\,]+)/i);
  if (rpMatch && rpMatch[1]) {
    const clean = rpMatch[1].replace(/\./g, '').replace(/,/g, '');
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num > 0) return num;
  }

  const numMatch = str.match(/([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,10})/);
  if (numMatch && numMatch[1]) {
    const clean = numMatch[1].replace(/\./g, '').replace(/,/g, '');
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num > 0) return num;
  }

  return 0;
}

// ==============================================================================
// 1. SHOPEEPAY API GATEWAY ENDPOINTS (Compliant with ahmadzakiyox/shoppepay-api-gateway)
// ==============================================================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'ShopeePay API Service is running',
    timestamp: new Date().toISOString()
  });
});

app.post('/update-token', apiKeyMiddleware, (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Provide token' });
  }
  shopeeToken = token.trim().replace(/^["']|["']$/g, '');
  isInitialShopeeSync = true;
  tokenValidStatus = null;
  logEvent('INFO', 'ShopeeToken updated via /update-token');
  res.json({ success: true, data: { message: 'Token updated' } });
});

app.get('/token-status', apiKeyMiddleware, async (req, res) => {
  const token = getReqToken(req);
  if (!token) {
    return res.json({
      success: false,
      data: {
        token_status: 'invalid',
        message: 'No ShopeeToken configured'
      }
    });
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = nowSec - 3600;
    const response = await callShopeeAPI(startSec, nowSec, 1, '', token);

    if (response && response.code === 0) {
      tokenValidStatus = true;
      lastShopeeCheckTime = new Date().toISOString();
      return res.json({
        success: true,
        data: {
          token_status: 'valid',
          message: 'Token is working'
        }
      });
    } else {
      tokenValidStatus = false;
      return res.json({
        success: false,
        data: {
          token_status: 'invalid',
          message: response?.msg || 'Token expired or rejected by Shopee'
        }
      });
    }
  } catch (err) {
    tokenValidStatus = false;
    return res.status(500).json({
      success: false,
      data: {
        token_status: 'error',
        message: err.message
      }
    });
  }
});

app.post('/create-qris', apiKeyMiddleware, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Provide valid amount (positive integer)' });
  }

  try {
    const staticQR = req.body.qris_static || qrisStaticTemplate;
    const dynamicQR = generateDynamicQRIS(staticQR, amount);
    const qrisId = crypto.randomBytes(4).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    qrisStore.set(qrisId, { data: dynamicQR, expiresAt, amount });

    const host = req.get('host');
    const protocol = req.protocol;
    const qrisUrl = `${protocol}://${host}/qr/${qrisId}`;

    res.json({
      success: true,
      data: {
        qris_url: qrisUrl,
        amount: amount,
        expires_at: expiresAt.toISOString().replace('T', ' ').slice(0, 19),
        expires_in: '15 menit'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/qr/:id', (req, res) => {
  const id = req.params.id;
  const qrisItem = qrisStore.get(id);
  if (!qrisItem) {
    return res.status(404).send('QR Code Not Found');
  }

  if (Date.now() > qrisItem.expiresAt.getTime()) {
    qrisStore.delete(id);
    return res.status(410).send('QR Code Expired');
  }

  // Generate QR image via public QR API redirect
  const qrImageRedirect = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrisItem.data)}`;
  res.redirect(302, qrImageRedirect);
});

app.post('/check-payment', apiKeyMiddleware, async (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  let startTime = parseInt(req.body.startTime, 10);
  const token = getReqToken(req);

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Provide valid amount (positive integer)' });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(startTime) || startTime <= 0) {
    startTime = nowSec - (15 * 60); // Default check last 15 mins
  }

  try {
    const result = await callShopeeAPI(startTime, nowSec, 50, '', token);
    if (!result || result.code !== 0) {
      return res.status(400).json({
        success: false,
        error: result?.msg || `Shopee API error code ${result?.code}`
      });
    }

    const list = result.data?.list || [];
    const matched = list.find(item => {
      let rawAmount = String(item.total_amount || item.amount || '0').replace(/\./g, '').replace(/,/g, '');
      const itemAmount = parseInt(rawAmount, 10) || 0;
      const txId = item.transactionId || item.displayTransactionId;
      return (item.status === 3 || item.status === '3') &&
             itemAmount === amount &&
             (item.transaction_time || item.transactionTime) >= startTime &&
             !usedTransactionIds.has(txId);
    });

    if (!matched) {
      return res.json({ success: true, paid: false });
    }

    const txId = matched.transactionId || matched.displayTransactionId;
    usedTransactionIds.set(txId, Date.now());

    let issuer = 'ShopeePay/QRIS';
    try {
      const detail = await callShopeeDetailAPI(txId, token);
      if (detail && detail.code === 0 && detail.data?.issuer) {
        issuer = detail.data.issuer;
      }
    } catch (e) {
      // Ignored detail failure
    }

    const formatted = formatTransaction(matched);
    formatted.issuer = issuer;

    // Trigger Soundbox!
    recordAndBroadcast({
      transactionId: txId,
      amount: formatted.amount,
      payer: issuer,
      source: 'ShopeePay Gateway (/check-payment)',
      rawText: `Shopee QRIS: Pembayaran Rp ${formatted.amount.toLocaleString('id-ID')} via ${issuer}`
    });

    res.json({
      success: true,
      paid: true,
      transaction: {
        transactionId: txId,
        amount: formatted.amount,
        status: 'success',
        time: formatted.time,
        issuer: issuer
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/transactions', apiKeyMiddleware, async (req, res) => {
  const token = getReqToken(req);
  if (!token) return res.status(400).json({ success: false, error: 'No ShopeeToken configured' });

  const nowSec = Math.floor(Date.now() / 1000);
  let startTime = parseInt(req.query.startTime, 10);
  let endTime = parseInt(req.query.endTime, 10);
  let pageSize = parseInt(req.query.pageSize, 10) || 20;

  if (isNaN(startTime) || startTime <= 0) startTime = nowSec - (3 * 24 * 3600); // 3 days
  if (isNaN(endTime) || endTime <= 0) endTime = nowSec;

  try {
    const result = await callShopeeAPI(startTime, endTime, pageSize, '', token);
    if (!result || result.code !== 0) {
      return res.status(400).json({ success: false, error: result?.msg || 'Error fetching transactions' });
    }

    const rawList = result.data?.list || [];
    const formattedList = rawList.map(item => formatTransaction(item));

    res.json({
      success: true,
      total_amount: result.data?.total_amount || '0',
      data: {
        transactions: formattedList
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/transactions/all', apiKeyMiddleware, async (req, res) => {
  const token = getReqToken(req);
  if (!token) return res.status(400).json({ success: false, error: 'No ShopeeToken configured' });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const startTime = Math.floor(startOfMonth.getTime() / 1000);
  const endTime = Math.floor(now.getTime() / 1000);

  const allTx = [];
  let nextPos = '';

  try {
    while (true) {
      const result = await callShopeeAPI(startTime, endTime, 50, nextPos, token);
      if (!result || result.code !== 0) break;

      const list = result.data?.list || [];
      for (const item of list) {
        allTx.push(formatTransaction(item));
      }

      if (!result.data?.next_position || list.length < 50) break;
      nextPos = result.data.next_position;
      await new Promise(r => setTimeout(r, 300));
    }

    res.json({
      success: true,
      total_amount: String(allTx.reduce((acc, curr) => acc + curr.amount, 0)),
      data: {
        total_count: allTx.length,
        transactions: allTx
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/logs', apiKeyMiddleware, (req, res) => {
  res.json({ success: true, data: { logs } });
});

// ==============================================================================
// 2. DEDICATED SOUNDBOX SHOPEE PARTNER CONNECT & AUTO-POLLER ENDPOINTS
// ==============================================================================

app.post('/api/shopee/connect', async (req, res) => {
  const { token } = req.body;
  if (!token || !token.trim()) {
    return res.status(400).json({ success: false, message: 'Token Shopee Partner tidak boleh kosong!' });
  }

  // Bersihkan spasi dan tanda petik jika user menyalin beserta tanda kutip
  const cleanToken = token.trim().replace(/^["']|["']$/g, '');
  logEvent('INFO', `Connecting Shopee Partner account with token: ${cleanToken.slice(0, 6)}...`);

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = nowSec - 3600;
    const testResult = await callShopeeAPI(startSec, nowSec, 10, '', cleanToken);

    if (testResult && testResult.code === 0) {
      shopeeToken = cleanToken;
      tokenValidStatus = true;
      lastShopeeCheckTime = new Date().toISOString();

      // Seed existing IDs into knownShopeeTxIds to prevent re-sounding past transactions
      const existingList = testResult.data?.list || [];
      existingList.forEach(item => {
        const id = item.transactionId || item.displayTransactionId;
        if (id) knownShopeeTxIds.add(id);
      });
      isInitialShopeeSync = false;

      logEvent('INFO', `✅ Shopee Partner connected successfully! Found ${existingList.length} recent transactions.`);

      return res.json({
        success: true,
        message: 'Akun Shopee Partner berhasil terhubung!',
        data: {
          tokenStatus: 'valid',
          merchantInfo: {
            recentCount: existingList.length,
            totalAmount: testResult.data?.total_amount || '0'
          }
        }
      });
    } else {
      tokenValidStatus = false;
      return res.status(400).json({
        success: false,
        message: testResult?.msg || 'Token Shopee Partner ditolak atau sesi sudah berakhir. Silakan salin token baru.',
        raw: testResult
      });
    }
  } catch (err) {
    logEvent('ERROR', `Shopee connect error: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: `Gagal memverifikasi token ke Shopee: ${err.message}`
    });
  }
});

app.get('/api/shopee/status', (req, res) => {
  res.json({
    success: true,
    connected: !!shopeeToken,
    tokenMasked: shopeeToken ? `${shopeeToken.slice(0, 6)}...${shopeeToken.slice(-4)}` : null,
    valid: tokenValidStatus,
    lastChecked: lastShopeeCheckTime,
    knownTransactionsCount: knownShopeeTxIds.size
  });
});

app.post('/api/shopee/disconnect', (req, res) => {
  shopeeToken = '';
  tokenValidStatus = null;
  knownShopeeTxIds.clear();
  isInitialShopeeSync = true;
  logEvent('INFO', 'Shopee Partner disconnected by user.');
  res.json({ success: true, message: 'Akun Shopee Partner telah diputuskan.' });
});

/**
 * Endpoint yang dipanggil browser setiap 4-5 detik untuk mengecek apakah ada transaksi Shopee baru
 * Jika ada transaksi baru dengan status 'success' (status 3), langsung picu suara Soundbox!
 */
app.get('/api/shopee/poll-transactions', async (req, res) => {
  if (!shopeeToken) {
    return res.json({
      success: false,
      connected: false,
      message: 'Shopee Partner belum terhubung'
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - (15 * 60); // Cek transaksi dalam 15 menit terakhir

  try {
    const result = await callShopeeAPI(startSec, nowSec, 20, '', shopeeToken);
    lastShopeeCheckTime = new Date().toISOString();

    if (!result || result.code !== 0) {
      tokenValidStatus = false;
      return res.json({
        success: false,
        tokenValid: false,
        error: result?.msg || 'Shopee token invalid or expired'
      });
    }

    tokenValidStatus = true;
    const list = result.data?.list || [];
    const newPayments = [];

    for (const item of list) {
      const txId = item.transactionId || item.displayTransactionId;
      if (!txId) continue;

      // Status 3 = SUCCESS di ShopeePay Partner
      if ((item.status === 3 || item.status === '3') && !knownShopeeTxIds.has(txId)) {
        knownShopeeTxIds.add(txId);

        let rawAmount = String(item.total_amount || item.amount || '0').replace(/\./g, '').replace(/,/g, '');
        const amount = parseInt(rawAmount, 10) || 0;

        // Ambil nama issuer (BCA, DANA, Seabank, dll)
        let issuer = 'ShopeePay/QRIS';
        try {
          const detail = await callShopeeDetailAPI(txId, shopeeToken);
          if (detail && detail.code === 0 && detail.data?.issuer) {
            issuer = detail.data.issuer;
          }
        } catch (e) {
          // Ignore
        }

        const storeId = req.query.storeId || 'pempek';
        const storeName = req.query.storeName || 'Pempek Bandung';

        // Trigger soundbox announcement!
        const broadcastedTx = recordAndBroadcast({
          transactionId: txId,
          storeId,
          storeName,
          amount,
          payer: issuer,
          source: 'Shopee Partner Live API',
          rawText: `Shopee QRIS ID: ${txId}`
        });

        newPayments.push(broadcastedTx);
      }
    }

    res.json({
      success: true,
      connected: true,
      hasNew: newPayments.length > 0,
      newPayments: newPayments,
      totalChecked: list.length
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 2B. DEDICATED DANA BISNIS MERCHANT GATEWAY (yono99/dana-api-gateway integration)
// ==============================================================================

const knownDanaTxIds = new Set();
let isInitialDanaSync = true;
let lastDanaCheckTime = null;

app.get('/api/dana/status', async (req, res) => {
  const session = danaSessionManager.loadSession();
  const connected = !!(session && (session.access_token || session.cookie));
  res.json({
    success: true,
    connected,
    merchantName: session?.merchant_name || session?.merchant_id || null,
    phoneNumber: session?.phone_number || null,
    expiresAt: session?.expires_at || null,
    isExpired: session ? danaSessionManager.isExpired(session) : true,
    lastChecked: lastDanaCheckTime,
    knownTransactionsCount: knownDanaTxIds.size
  });
});

app.post('/api/dana/connect', async (req, res) => {
  const { accessToken, cookie, merchantId, merchantName, phone } = req.body;
  if (!accessToken && !cookie) {
    return res.status(400).json({ success: false, message: 'Minimal masukkan Access Token atau Cookie DANA Bisnis!' });
  }

  const session = danaSessionManager.saveSession({
    access_token: accessToken ? accessToken.trim() : null,
    cookie: cookie ? cookie.trim() : null,
    merchant_id: merchantId ? merchantId.trim() : null,
    merchant_name: merchantName ? merchantName.trim() : null,
    phone_number: phone ? phone.trim() : null,
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    login_method: 'manual_connect'
  });

  isInitialDanaSync = true;
  lastDanaCheckTime = new Date().toISOString();
  logEvent('INFO', `✅ DANA Bisnis connected! Merchant: ${session.merchant_name || session.merchant_id || 'Active'}`);

  res.json({
    success: true,
    message: 'Akun DANA Bisnis berhasil terhubung!',
    session: {
      merchantName: session.merchant_name,
      merchantId: session.merchant_id,
      expiresAt: session.expires_at
    }
  });
});

app.post('/api/dana/disconnect', (req, res) => {
  danaSessionManager.clearSession();
  knownDanaTxIds.clear();
  isInitialDanaSync = true;
  logEvent('INFO', 'DANA Bisnis disconnected.');
  res.json({ success: true, message: 'Koneksi DANA Bisnis telah diputuskan.' });
});

app.post('/api/dana/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Masukkan nomor HP DANA Bisnis!' });
  try {
    const result = await danaSessionManager.requestOtp(phone);
    res.json({ success: true, message: 'Kode OTP telah dikirim ke nomor DANA via SMS/WA.', data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/dana/otp/verify', async (req, res) => {
  const { phone, otp, otpToken, deviceId } = req.body;
  if (!otp || !phone) return res.status(400).json({ success: false, message: 'Nomor HP dan kode OTP wajib diisi!' });
  try {
    const session = await danaSessionManager.verifyOtp(phone, otp, otpToken, deviceId);
    isInitialDanaSync = true;
    res.json({ success: true, message: 'Berhasil login DANA Bisnis!', session });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/dana/poll-transactions', async (req, res) => {
  const headers = await danaSessionManager.getValidHeaders(req.headers['user-agent']);
  if (!headers) {
    return res.json({ success: false, connected: false, message: 'DANA Bisnis belum terhubung' });
  }

  const session = danaSessionManager.loadSession();
  const merchantId = session?.merchant_id || process.env.DANA_MERCHANT_ID || '';
  const now = new Date();
  const from = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  try {
    const response = await danaSessionManager.fetchDanaTransactions(headers, {
      merchantId,
      merchant_id: merchantId,
      pageSize: 20,
      size: 20,
      startTime: from,
      endTime: now.toISOString(),
      status: 'SUCCESS,SETTLED'
    });

    lastDanaCheckTime = new Date().toISOString();

    const rawList = danaSessionManager.extractRawTransactions(response.data);
    const normalized = danaSessionManager.normalizeTransactions(rawList);

    if (isInitialDanaSync) {
      normalized.forEach(tx => {
        const id = tx.transaction_id || tx.order_id;
        if (id) knownDanaTxIds.add(id);
      });
      isInitialDanaSync = false;
      return res.json({ success: true, connected: true, hasNew: false, initialSync: true, totalChecked: normalized.length });
    }

    const newPayments = [];
    for (const tx of normalized) {
      const txId = tx.transaction_id || tx.order_id;
      if (!txId) continue;

      if ((tx.status === 'success' || tx.status === 'settled') && !knownDanaTxIds.has(txId)) {
        knownDanaTxIds.add(txId);

        const storeId = req.query.storeId || 'pempek';
        const storeName = req.query.storeName || 'Pempek Bandung';

        const broadcasted = recordAndBroadcast({
          transactionId: txId,
          storeId,
          storeName,
          amount: tx.amount,
          payer: tx.issuer || 'DANA / Bank',
          source: 'DANA Bisnis Gateway',
          rawText: `DANA Trx: Rp ${tx.amount.toLocaleString('id-ID')} via ${tx.issuer}`
        });

        newPayments.push(broadcasted);
      }
    }

    res.json({
      success: true,
      connected: true,
      hasNew: newPayments.length > 0,
      newPayments,
      totalChecked: normalized.length
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/dana/transactions', async (req, res) => {
  const headers = await danaSessionManager.getValidHeaders(req.headers['user-agent']);
  if (!headers) return res.status(400).json({ success: false, error: 'DANA Bisnis belum terhubung' });

  const session = danaSessionManager.loadSession();
  const merchantId = session?.merchant_id || process.env.DANA_MERCHANT_ID || '';
  const now = new Date();
  const from = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString();

  try {
    const response = await danaSessionManager.fetchDanaTransactions(headers, {
      merchantId,
      merchant_id: merchantId,
      pageSize: 30,
      startTime: from,
      endTime: now.toISOString()
    });

    const rawList = danaSessionManager.extractRawTransactions(response.data);
    const normalized = danaSessionManager.normalizeTransactions(rawList);

    res.json({
      success: true,
      total_count: normalized.length,
      data: { transactions: normalized }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 2.5 GRABMERCHANT GATEWAY ENDPOINTS
// ==============================================================================

app.get('/api/grab/status', (req, res) => {
  const session = grabSessionManager.loadSession();
  const isConnected = !!(session && session.cookie);
  res.json({
    success: true,
    connected: isConnected,
    storeName: session?.store_name || 'Jus Smoothies - Janji Jawa',
    storeId: session?.store_id || '03555c6f-2c66-466d-8c26-a404adbc8ebb',
    merchantGroupId: session?.merchant_group_id || 'IDMG20250905033145011397',
    city: session?.city || 'Bandung',
    expiresAt: session?.expires_at || null,
    lastChecked: lastGrabCheckTime,
    knownTransactionsCount: knownGrabTxIds.size
  });
});

app.post('/api/grab/connect', (req, res) => {
  const { cookie, merchantGroupId, storeId, grabId } = req.body;
  if (!cookie) {
    return res.status(400).json({ success: false, message: 'Cookie GrabMerchant wajib diisi!' });
  }

  const session = grabSessionManager.saveSession({
    cookie: cookie.trim(),
    merchant_group_id: merchantGroupId ? merchantGroupId.trim() : undefined,
    store_id: storeId ? storeId.trim() : undefined,
    grab_id: grabId ? grabId.trim() : undefined
  });

  isInitialGrabSync = true;
  lastGrabCheckTime = new Date().toISOString();
  logEvent('INFO', `✅ GrabMerchant connected! Store: ${session.store_name}`);

  res.json({
    success: true,
    message: 'Koneksi GrabMerchant berhasil disimpan!',
    session: {
      storeName: session.store_name,
      storeId: session.store_id,
      expiresAt: session.expires_at
    }
  });
});

app.post('/api/grab/disconnect', (req, res) => {
  grabSessionManager.clearSession();
  knownGrabTxIds.clear();
  isInitialGrabSync = true;
  logEvent('INFO', 'GrabMerchant disconnected.');
  res.json({ success: true, message: 'Koneksi GrabMerchant telah diputuskan.' });
});

app.get('/api/grab/poll-transactions', async (req, res) => {
  const session = grabSessionManager.loadSession();
  if (!session || !session.cookie) {
    return res.json({ success: false, connected: false, message: 'GrabMerchant belum terhubung' });
  }

  try {
    const apiData = await grabSessionManager.fetchTransactions({ limit: 20 });
    lastGrabCheckTime = new Date().toISOString();

    const normalized = grabSessionManager.normalizeTransactions(apiData);

    if (isInitialGrabSync) {
      normalized.forEach(tx => {
        if (tx.id) knownGrabTxIds.add(tx.id);
      });
      isInitialGrabSync = false;
      return res.json({
        success: true,
        connected: true,
        hasNew: false,
        initialSync: true,
        totalChecked: normalized.length
      });
    }

    const newPayments = [];
    for (const tx of normalized) {
      if (!tx.id) continue;

      if ((tx.status === 'completed' || tx.status === 'success') && !knownGrabTxIds.has(tx.id)) {
        knownGrabTxIds.add(tx.id);

        const storeId = req.query.storeId || 'pempek';
        const storeName = req.query.storeName || 'Pempek Bandung';

        const broadcasted = recordAndBroadcast({
          transactionId: tx.id,
          storeId,
          storeName,
          amount: tx.amount,
          payer: 'GrabPay / OVO QRIS',
          source: 'GrabMerchant Gateway',
          rawText: `Grab QRIS: Rp ${tx.amount.toLocaleString('id-ID')} (${tx.store_name})`
        });

        newPayments.push(broadcasted);
      }
    }

    res.json({
      success: true,
      connected: true,
      hasNew: newPayments.length > 0,
      newPayments,
      totalChecked: normalized.length
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/grab/transactions', async (req, res) => {
  try {
    const apiData = await grabSessionManager.fetchTransactions({ limit: 30 });
    const normalized = grabSessionManager.normalizeTransactions(apiData);
    res.json({
      success: true,
      total_count: normalized.length,
      data: { transactions: normalized }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 3. UNIVERSAL WEBHOOK & SIMULATION ENDPOINTS (Backward Compatibility)
// ==============================================================================

function handleIncomingPayment(req, res) {
  let amount = 0;
  let payer = 'ShopeePay';
  let rawText = '';
  const storeId = req.body?.storeId || req.query?.storeId || 'pempek';
  const storeName = req.body?.storeName || req.query?.storeName || 'Pempek Bandung';

  if (req.body && typeof req.body === 'object') {
    if (req.body.amount) amount = extractAmountFromText(req.body.amount);
    if (req.body.payer) payer = req.body.payer;
    if (req.body.text || req.body.message || req.body.title) {
      rawText = `${req.body.title || ''} ${req.body.text || req.body.message || ''}`.trim();
      if (!amount) amount = extractAmountFromText(rawText);
    }
  }

  if (!amount && req.query.amount) amount = extractAmountFromText(req.query.amount);
  if (req.query.payer) payer = req.query.payer;
  if (!rawText && req.query.text) {
    rawText = req.query.text;
    if (!amount) amount = extractAmountFromText(rawText);
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Gagal mendeteksi nominal uang masuk. Pastikan ada parameter "amount" atau teks "Rp ..."',
      receivedBody: req.body,
      receivedQuery: req.query
    });
  }

  const tx = recordAndBroadcast({
    amount,
    payer,
    storeId,
    storeName,
    source: req.body?.package || req.body?.source || 'Shopee Partner QRIS (Webhook)',
    rawText
  });

  return res.json({
    success: true,
    message: 'Pembayaran berhasil diterima dan diteruskan ke Soundbox Web!',
    transaction: tx
  });
}

app.post('/api/webhook', handleIncomingPayment);
app.get('/api/webhook', handleIncomingPayment);
app.post('/webhook', handleIncomingPayment);
app.get('/webhook', handleIncomingPayment);

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

app.post('/api/simulate', (req, res) => {
  const amount = parseInt(req.body.amount, 10) || 15000;
  const payer = req.body.payer || 'Pembeli QRIS (Tes Mandiri)';
  const storeId = req.body.storeId || 'pempek';
  const storeName = req.body.storeName || 'Pempek Bandung';

  const tx = recordAndBroadcast({
    amount,
    payer,
    storeId,
    storeName,
    source: 'Simulasi Web',
    rawText: `Tes Simulasi Pembayaran Rp ${amount.toLocaleString('id-ID')} (${storeName})`
  });

  res.json({ success: true, transaction: tx });
});

app.get('/api/history', (req, res) => {
  res.json({ success: true, transactions });
});

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    shopeeConnected: !!shopeeToken,
    shopeeTokenValid: tokenValidStatus,
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
    console.log(`📡 ShopeePay Gateway & Webhook online`);
    console.log(`====================================================`);
  });
}

module.exports = app;
