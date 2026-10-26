/**
 * GrabMerchant Session & Transaction Manager for QriPay Soundbox
 * Connects directly to GrabMerchant Portal API (v2/transactions)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SESSION_FILE = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join('/tmp', '.GRAB_SESI_JANGAN_DIHAPUS.json')
  : path.join(__dirname, '.GRAB_SESI_JANGAN_DIHAPUS.json');

// Default credentials & session extracted from GrabMerchant Portal
const DEFAULT_SESSION = {
  merchant_group_id: 'IDMG20250905033145011397',
  store_id: '03555c6f-2c66-466d-8c26-a404adbc8ebb',
  grab_id: 'e47c9598-ffc0-443b-9a7a-b93deddb7df8',
  store_name: 'Jus Smoothies - Janji Jawa - AZMI ADI PARIRA',
  city: 'Bandung',
  cookie: '_gsvid=0fd84a99-0937-48b6-b187-8452cb881f24; _ga=GA1.1.415443980.1792490580; OptanonAlertBoxClosed=2026-10-20T12:54:23.322Z; DEVICE_ID=ee51c0c5-21cf-478f-a80c-6775994eee4a; OptanonConsent=isGpcEnabled=0&datestamp=Tue+Oct+20+2026+19%3A54%3A29+GMT%2B0700+(Western+Indonesia+Time)&version=202304.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&landingPath=NotLandingPage&AwaitingReconsent=false&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1; hwuuidtime=1792500894; hwuuid=c6cf6293-a68d-47e3-ac4e-b0b21f167207; _ga_CCE1VPQSKS=GS2.1.s1792842456$o4$g0$t1792843142$j60$l0$h0; AWSELB=53B7490F14CB44B3C3CAE476A7D8BD7A112F66C8F807333E5C78FD4109F65AFEAFB0F879844BA5674BE47D52B41AEDC0C91AC16DC1BB863294F60D8297EC55AE9E6BDE1549; AWSELBCORS=53B7490F14CB44B3C3CAE476A7D8BD7A112F66C8F807333E5C78FD4109F65AFEAFB0F879844BA5674BE47D52B41AEDC0C91AC16DC1BB863294F60D8297EC55AE9E6BDE1549; mexusers_authn_token=eyJhbGciOiJFUzI1NiIsImtpZCI6IkVTMjU2XzE3ODY2NTI4MzYiLCJ0eXAiOiJKV1QifQ.eyJhbXIiOiJXRUJMT0dJTiIsImF1ZCI6IlNTT19UT0tFTl9JU1NVSU5HX1NFUlZJQ0UiLCJlc2kiOiJ2L2hhU3Voa2FsV2JGWjRhVHkxVWFpcDFkVnJEQ0JSVFVQalIzaUtCZzJJOStwWDZkeTMwU3phUDFMRVdhdz09IiwiZXhwIjoxNzkzMTkzMTE3LCJpYXQiOjE3OTMwMjAzMTQsImp0aSI6ImU3YzBmM2QyLWI0NjAtNDAwZi1hOWU0LTZkMGI2YWRhMmQyZCIsInN1YiI6ImU0N2M5NTk4LWZmYzAtNDQzYi05YTdhLWI5M2RlZGRiN2RmOCIsInN2YyI6Ik1FWFVTRVJTIn0.V3hclhgFptNP3Hwlb9BaKs9Lzh2tPk0JdHskZnojwxebFucVC__HIXo9Rbkre2foPhkimU57e17sn22E4oiZcA; mexusers_authn_token_jti=e7c0f3d2-b460-400f-a9e4-6d0b6ada2d2d; sa_MEXUSERS_c20e6c0fd4=eyJhbGciOiJFUzI1NiIsImtpZCI6IkVTMjU2XzE3ODY2NTI3MDUiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJNRVhVU0VSUyIsImV4cCI6MTc5NTYxMjMxNywiaWF0IjoxNzkzMDIwMzE3LCJqdGkiOiJhNjFhNDI1NjVkMjc0MDhmOWY0MzIyNDc3M2JkNmI5MiIsIm5iZiI6MTc5MzAyMDI4Nywic3ViIjoiZTQ3Yzk1OTgtZmZjMC00NDNiLTlhN2EtYjkzZGVkZGI3ZGY4In0.zXoZSIUuX1cWm6wr1mjT50ZJfSTyNZzhzZnJLVUnu7wjHCGZ854n9MvbPloJlbUwdRkw6jMXIXMROz0vWxBZ9Q; visits=2; _gssid=2609261429-pa5olykjtpp; hwToken=74c011ad2513071dd98a17be0a16f053; hwTime=1793024990030; _dd_s=logs=1&id=2466ab32-11b9-40fa-9592-c641f428a43d&created=1793024942749&expire=1793025917095&rum=0',
  expires_at: '2026-10-28T13:11:57.000Z'
};

let inMemorySession = null;

function loadSession() {
  if (inMemorySession) return inMemorySession;
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.cookie) {
        inMemorySession = data;
        return data;
      }
    }
  } catch (err) {}
  // Fallback to default working session
  inMemorySession = { ...DEFAULT_SESSION };
  return inMemorySession;
}

function saveSession(session) {
  const payload = {
    ...DEFAULT_SESSION,
    ...session,
    updated_at: new Date().toISOString()
  };
  inMemorySession = payload;
  try {
    const tmp = `${SESSION_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
    if (fs.existsSync(tmp)) fs.renameSync(tmp, SESSION_FILE);
  } catch (e) {}
  return payload;
}

function clearSession() {
  inMemorySession = null;
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch (e) {}
}

function buildHeaders(session) {
  const s = session || loadSession();
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'grab-id': s.grab_id,
    'priority': 'u=1, i',
    'referer': `https://merchant.grab.com/finances?page=tx&grabID=${s.store_id}`,
    'requestsource': 'troyPortal',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    'x-agent': 'mexapp',
    'x-app-platform': 'web',
    'x-app-version': '1.2(v67)',
    'x-build-tag': '19910-183ce387500d604ecc89463345d41cc7fa182d0e',
    'x-client-id': 'GrabMerchant-Portal',
    'x-currency': 'IDR',
    'x-date': new Date().toISOString(),
    'x-device-id': 'ios',
    'x-grabkit-clientid': 'GrabMerchant-Portal',
    'x-language': 'gb',
    'x-merchant-id': s.merchant_group_id,
    'x-mex-resource': `zeus_merchant:${s.merchant_group_id},zeus_store:6-C7MTJNJFAJMEE6`,
    'x-mex-version': 'v2',
    'x-mts-jb': 'false',
    'x-request-id': Math.random().toString(36).substring(2) + Date.now().toString(36),
    'x-user-type': 'user-profile',
    'Cookie': s.cookie
  };
}

/**
 * Fetch transactions from GrabMerchant Portal API
 */
async function fetchTransactions(options = {}) {
  const s = loadSession();
  const headers = buildHeaders(s);

  // Format date range: YYYY-MM-DD
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  // Lookback 3 days by default
  const past = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
  const fromStr = past.toISOString().split('T')[0];

  const from = options.from || fromStr;
  const to = options.to || todayStr;
  const limit = options.limit || 20;
  const offset = options.offset || 0;

  const url = `https://merchant.grab.com/mex/finances/v2/transactions?merchant_group_id=${s.merchant_group_id}&from=${from}&to=${to}&transaction_type=&transaction_status=&transaction_category=&transaction_subcategory=&transaction_paymethod=&limit=${limit}&offset=${offset}&currency=IDR&store_id=${s.store_id}`;

  const res = await axios.get(url, { headers, timeout: 15000 });
  return res.data;
}

/**
 * Parse raw cURL (bash) command or raw cookie string and extract Grab authentication tokens
 */
function parseCurlOrRaw(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Input cURL atau token tidak boleh kosong');
  }

  const cleanRaw = raw.replace(/\\\r?\n/g, ' ').trim();

  // 1. Extract cookie from -b, --cookie, or -H 'cookie:'
  let cookie = '';
  const bMatch = cleanRaw.match(/-b\s+['"]([^'"]+)['"]/);
  const cookieFlagMatch = cleanRaw.match(/--cookie\s+['"]([^'"]+)['"]/);
  const hCookieMatch = cleanRaw.match(/-H\s+['"][Cc]ookie:\s*([^'"]+)['"]/i);

  if (bMatch) {
    cookie = bMatch[1];
  } else if (cookieFlagMatch) {
    cookie = cookieFlagMatch[1];
  } else if (hCookieMatch) {
    cookie = hCookieMatch[1];
  } else if (cleanRaw.includes('mexusers_authn_token=')) {
    cookie = cleanRaw;
  }

  // 2. Extract mexusers_authn_token
  let authnToken = '';
  const searchSource = cookie || cleanRaw;
  const tokenMatch = searchSource.match(/mexusers_authn_token=([A-Za-z0-9_\-\.]+)/);
  if (tokenMatch) {
    authnToken = tokenMatch[1];
  } else if (/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(cleanRaw.trim())) {
    authnToken = cleanRaw.trim();
  }

  if (!authnToken) {
    throw new Error('Token mexusers_authn_token tidak ditemukan dalam cURL yang ditempel. Pastikan menyalin cURL lengkap dari DevTools tab Network.');
  }

  // 3. Decode JWT payload to get exact expiration & account ID
  let jwtPayload = {};
  try {
    const parts = authnToken.split('.');
    if (parts.length >= 2) {
      const buff = Buffer.from(parts[1], 'base64');
      jwtPayload = JSON.parse(buff.toString('utf8'));
    }
  } catch (e) {
    console.warn('Gagal membaca JWT payload:', e.message);
  }

  const expires_at = jwtPayload.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null;

  // 4. Extract merchant_group_id if present
  const mgMatch = cleanRaw.match(/merchant_group_id=([A-Za-z0-9]+)/) || cleanRaw.match(/x-merchant-id:\s*([A-Za-z0-9]+)/i);
  const merchant_group_id = mgMatch ? mgMatch[1] : undefined;

  // 5. Extract store_id if present
  const storeMatch = cleanRaw.match(/store_id=([a-f0-9\-]+)/) || cleanRaw.match(/\/stores\/([a-f0-9\-]+)/);
  const store_id = storeMatch ? storeMatch[1] : undefined;

  // 6. Extract grab_id if present
  const grabMatch = cleanRaw.match(/grab-id:\s*([a-f0-9\-]+)/i);
  const grab_id = grabMatch ? grabMatch[1] : (jwtPayload.sub || undefined);

  return {
    cookie: cookie || `mexusers_authn_token=${authnToken}`,
    authn_token: authnToken,
    expires_at,
    merchant_group_id,
    store_id,
    grab_id
  };
}

/**
 * Validate candidate session by making a real test request to Grab API,
 * and if valid, persist it permanently.
 */
async function updateSessionFromCurl(rawInput) {
  const parsed = parseCurlOrRaw(rawInput);
  const current = loadSession();

  const candidate = {
    ...current,
    cookie: parsed.cookie,
    expires_at: parsed.expires_at || current.expires_at
  };

  if (parsed.merchant_group_id) candidate.merchant_group_id = parsed.merchant_group_id;
  if (parsed.store_id) candidate.store_id = parsed.store_id;
  if (parsed.grab_id) candidate.grab_id = parsed.grab_id;

  // Test candidate against Grab API (Grab requires from & to date range)
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const past = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const fromStr = past.toISOString().split('T')[0];

  const headers = buildHeaders(candidate);
  const testUrl = `https://merchant.grab.com/mex/finances/v2/transactions?merchant_group_id=${candidate.merchant_group_id}&from=${fromStr}&to=${todayStr}&limit=1&offset=0&currency=IDR&store_id=${candidate.store_id}`;

  try {
    const res = await axios.get(testUrl, { headers, timeout: 10000 });
    // Success! Save session
    const saved = saveSession(candidate);
    return {
      success: true,
      message: 'Sesi Grab berhasil diperbarui dan aktif!',
      expires_at: saved.expires_at,
      store_name: saved.store_name,
      store_id: saved.store_id,
      merchant_group_id: saved.merchant_group_id
    };
  } catch (err) {
    const status = err.response ? err.response.status : null;
    if (status === 401 || status === 403) {
      throw new Error('Token Grab ditolak (401 Unauthorized). Sesi di browser Grab mungkin sudah kadaluarsa atau logout. Silakan login ulang di merchant.grab.com dan salin cURL baru.');
    }
    throw new Error(`Gagal menghubungi server Grab (${status || err.message})`);
  }
}

/**
 * Normalize Grab transactions to unified format
 */
function normalizeTransactions(apiResponse) {
  const results = apiResponse?.data?.results || [];
  return results.map(tx => ({
    id: tx.transaction_id,
    transaction_id: tx.transaction_id,
    amount: tx.net_total,
    status: (tx.transaction_status || '').toLowerCase(), // 'completed'
    type: tx.transaction_type, // 'ovo'
    category: tx.transaction_category, // 'payment'
    store_name: tx.store_name,
    store_id: tx.store_id,
    created_at: tx.created_at,
    updated_at: tx.updated_at
  }));
}

module.exports = {
  loadSession,
  saveSession,
  clearSession,
  buildHeaders,
  fetchTransactions,
  normalizeTransactions,
  parseCurlOrRaw,
  updateSessionFromCurl,
  DEFAULT_SESSION
};
