/**
 * DANA Business Session & API Manager for QriPay Soundbox
 * Adapted from yono99/dana-api-gateway with Vercel serverless + local VPS support.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// File storage path (uses /tmp on serverless environments like Vercel)
const SESSION_FILE = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join('/tmp', '.DANA_SESI_JANGAN_DIHAPUS.json')
  : path.join(__dirname, '.DANA_SESI_JANGAN_DIHAPUS.json');

const DEFAULT_API_BASE = process.env.DANA_API_BASE || 'https://api.saas.dana.id';
const DANA_TX_PATH = process.env.DANA_TX_PATH || '/v1/merchant/transactions';
const REFRESH_PATH = process.env.DANA_REFRESH_PATH || '/v1/oauth/token/refresh';
const OTP_REQUEST_PATH = process.env.DANA_OTP_REQUEST_PATH || '/v1/oauth/otp/send';
const OTP_VERIFY_PATH = process.env.DANA_OTP_VERIFY_PATH || '/v1/oauth/otp/verify';

const TOKEN_EXPIRY_SKEW_MS = 5 * 60 * 1000; // 5 min skew
const REFRESH_FAIL_BACKOFF_MS = 5 * 60 * 1000;

const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// In-Memory fallback session (preserves session in memory during serverless execution)
let inMemorySession = null;

function loadSession() {
  if (inMemorySession && (inMemorySession.access_token || inMemorySession.cookie)) {
    return inMemorySession;
  }
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || (!data.access_token && !data.cookie)) return null;
    inMemorySession = data;
    return data;
  } catch (err) {
    return inMemorySession;
  }
}

function saveSession(session) {
  const payload = {
    ...session,
    updated_at: new Date().toISOString()
  };
  inMemorySession = payload;
  try {
    const tmpFile = `${SESSION_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8');
    if (fs.existsSync(tmpFile)) {
      fs.renameSync(tmpFile, SESSION_FILE);
    }
  } catch (e) {
    // Read-only filesystem warning; inMemorySession will continue to work
  }
  return payload;
}

function clearSession() {
  inMemorySession = null;
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch (e) {}
}

function isExpired(session) {
  if (!session) return true;
  if (!session.expires_at) return false;
  const exp = new Date(session.expires_at).getTime();
  return Date.now() >= exp - TOKEN_EXPIRY_SKEW_MS;
}

function isRefreshBackedOff(session) {
  if (!session || !session.refresh_backoff_until) return false;
  return Date.now() < new Date(session.refresh_backoff_until).getTime();
}

function buildHeaders(session, userAgent) {
  if (!session) return null;
  const headers = {
    'User-Agent': userAgent || session.user_agent || DEFAULT_UA,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Country-Code': 'ID',
    'X-Locale': 'id_ID',
    'X-Client-Id': session.client_id || 'dana-business-web'
  };

  if (session.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  if (session.cookie) {
    headers.Cookie = session.cookie;
  }
  if (session.merchant_id) {
    headers['X-Merchant-Id'] = session.merchant_id;
  }
  if (session.device_id) {
    headers['X-Device-Id'] = session.device_id;
  }

  return headers;
}

async function getValidHeaders(userAgent) {
  let session = loadSession();
  if (!session) return null;

  if (isExpired(session) && session.refresh_token && !isRefreshBackedOff(session)) {
    try {
      session = await refreshSession();
    } catch (err) {
      console.error('[DANA-SESSION] Auto-refresh gagal:', err.message);
      try {
        session = saveSession({
          ...session,
          refresh_backoff_until: new Date(Date.now() + REFRESH_FAIL_BACKOFF_MS).toISOString()
        });
      } catch (saveErr) {}
    }
  }

  return buildHeaders(session, userAgent);
}

function parseSetCookie(setCookie) {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const pairs = arr.map((c) => c.split(';')[0].trim()).filter(Boolean);
  return pairs.length ? pairs.join('; ') : null;
}

async function refreshSession() {
  const session = loadSession();
  if (!session || !session.refresh_token) {
    throw new Error('Tidak ada refresh_token.');
  }

  const base = process.env.DANA_API_BASE || DEFAULT_API_BASE;
  const url = `${base.replace(/\/$/, '')}${REFRESH_PATH}`;

  const res = await axios.post(
    url,
    { grantType: 'REFRESH_TOKEN', refreshToken: session.refresh_token },
    {
      headers: {
        'User-Agent': session.user_agent || DEFAULT_UA,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(session.cookie ? { Cookie: session.cookie } : {})
      },
      timeout: 15000,
      validateStatus: () => true
    }
  );

  if (res.status >= 400) {
    if (session.cookie || session.access_token) {
      return saveSession({
        ...session,
        refresh_backoff_until: new Date(Date.now() + REFRESH_FAIL_BACKOFF_MS).toISOString()
      });
    }
    throw new Error(`Refresh gagal HTTP ${res.status}`);
  }

  const body = res.data?.data || res.data || {};
  const access = body.accessToken || body.access_token || body.token || session.access_token;
  const refresh = body.refreshToken || body.refresh_token || session.refresh_token;
  const rawExpiresIn = Number(body.expiresIn ?? body.expires_in);
  const expiresIn = Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 ? rawExpiresIn : 6 * 60 * 60;
  const cookieFromSet = parseSetCookie(res.headers['set-cookie']);

  return saveSession({
    ...session,
    access_token: access,
    refresh_token: refresh,
    cookie: cookieFromSet || session.cookie,
    expires_at: new Date(Date.now() + Number(expiresIn) * 1000).toISOString()
  });
}

function normalizePhone(raw) {
  let p = raw.replace(/[\s\-]/g, '');
  if (p.startsWith('+62')) p = '0' + p.slice(3);
  if (p.startsWith('62') && p.length > 10) p = '0' + p.slice(2);
  return p;
}

function toMsisdn62(phone08) {
  return '62' + phone08.slice(1);
}

function generateDeviceId() {
  return crypto.randomBytes(16).toString('hex');
}

async function requestOtp(phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  const device = generateDeviceId();
  const base = process.env.DANA_API_BASE || DEFAULT_API_BASE;
  const url = `${base.replace(/\/$/, '')}${OTP_REQUEST_PATH}`;

  const body = {
    phoneNumber: toMsisdn62(phone),
    phone: phone,
    channel: 'SMS',
    deviceId: device,
    clientId: process.env.DANA_CLIENT_ID || 'dana-business-web'
  };

  const res = await axios.post(url, body, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_UA,
      'X-Country-Code': 'ID'
    },
    timeout: 20000,
    validateStatus: () => true
  });

  if (res.status >= 400) {
    throw new Error(`Request OTP gagal HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }

  const data = res.data?.data || res.data || {};
  return {
    success: true,
    phone,
    deviceId: device,
    otp_token: data.otpToken || data.otp_token || data.requestId || data.request_id || null,
    raw: data
  };
}

async function verifyOtp(phoneRaw, otp, otpToken, deviceId) {
  const phone = normalizePhone(phoneRaw);
  const base = process.env.DANA_API_BASE || DEFAULT_API_BASE;
  const url = `${base.replace(/\/$/, '')}${OTP_VERIFY_PATH}`;

  const body = {
    phoneNumber: toMsisdn62(phone),
    phone: phone,
    otp: otp,
    otpToken: otpToken,
    otp_token: otpToken,
    deviceId: deviceId || generateDeviceId(),
    clientId: process.env.DANA_CLIENT_ID || 'dana-business-web'
  };

  const res = await axios.post(url, body, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_UA,
      'X-Country-Code': 'ID'
    },
    timeout: 20000,
    validateStatus: () => true
  });

  if (res.status >= 400) {
    throw new Error(`Verifikasi OTP gagal HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }

  const data = res.data?.data || res.data || {};
  const setCookie = res.headers['set-cookie'];
  const cookie = parseSetCookie(setCookie);

  const session = saveSession({
    access_token: data.accessToken || data.access_token || data.token || null,
    refresh_token: data.refreshToken || data.refresh_token || null,
    merchant_id: data.merchantId || data.merchant_id || data.shopId || process.env.DANA_MERCHANT_ID || null,
    merchant_name: data.merchantName || data.merchant_name || data.shopName || null,
    phone_number: phone,
    device_id: deviceId,
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    cookie: cookie || data.cookie || null
  });

  return session;
}

async function fetchDanaTransactions(headers, params) {
  const base = process.env.DANA_API_BASE || DEFAULT_API_BASE;
  const url = `${base.replace(/\/$/, '')}${DANA_TX_PATH}`;
  return axios.get(url, {
    headers,
    params,
    timeout: 12000,
    validateStatus: () => true
  });
}

function normalizeTransactions(rawList) {
  return (rawList || []).map((tx) => {
    let amount = parseInt(
      tx.gross_amount ||
        tx.real_gross_amount ||
        tx.amount?.value ||
        tx.amount ||
        tx.totalAmount ||
        tx.payAmount ||
        0,
      10
    );
    return {
      amount,
      status: String(tx.transaction_status || tx.status || tx.txnStatus || 'success').toLowerCase(),
      time: tx.transaction_time || tx.settlement_time || tx.createdAt || tx.finishTime || new Date().toISOString(),
      issuer: tx.qris_provider_aspi_issuer || tx.issuer || tx.payerSource || tx.customerName || 'DANA / Bank',
      order_id: tx.order_id || tx.orderId || tx.acquirementId || tx.merchantOrderId,
      transaction_id: tx.id || tx.transactionId || tx.acquirementId || tx.order_id || String(Date.now())
    };
  });
}

function extractRawTransactions(data) {
  return (
    data?.transactions ||
    data?.data?.transactions ||
    data?.data?.list ||
    data?.data?.records ||
    data?.list ||
    data?.records ||
    (Array.isArray(data?.data) ? data.data : null) ||
    (Array.isArray(data) ? data : []) ||
    []
  );
}

module.exports = {
  loadSession,
  saveSession,
  clearSession,
  isExpired,
  getValidHeaders,
  requestOtp,
  verifyOtp,
  fetchDanaTransactions,
  normalizeTransactions,
  extractRawTransactions
};
