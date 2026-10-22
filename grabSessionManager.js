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
  cookie: 'bnc-uuid=6d25ed53-ea44-4efa-a8cc-f4b2f514af0b; _ga=GA1.1.1749878883.1792504115; _gsvid=0c186e3c-84b4-4822-8a67-64e35c1eb6a8; DEVICE_ID=c5940e5d-b358-4b57-b222-85a326b149ee; hwuuidtime=1792504291; hwuuid=b881acab-ca87-4905-beca-7fbf14ac65db; _gssid=2609220203-er3psk0114o; mexusers_authn_token=eyJhbGciOiJFUzI1NiIsImtpZCI6IkVTMjU2XzE3ODY2NTI4MzYiLCJ0eXAiOiJKV1QifQ.eyJhbXIiOiJXRUJMT0dJTiIsImF1ZCI6IlNTT19UT0tFTl9JU1NVSU5HX1NFUlZJQ0UiLCJlc2kiOiJxUTFxaC9HN2RJZDhQN0lqZjRqZC9ldHRtVGFGck1BVDVzZk4wSHUybnBsRmNIbmR0bE95Z2JoajdZSlQ1dz09IiwiZXhwIjoxNzkyODA3NDAxLCJpYXQiOjE3OTI2MzQ1OTgsImp0aSI6IjM2YmI3MmM1LTU1OGYtNGM3NS1iODFjLTBhZDY4OGUyM2M5ZCIsInN1YiI6ImU0N2M5NTk4LWZmYzAtNDQzYi05YTdhLWI5M2RlZGRiN2RmOCIsInN2YyI6Ik1FWFVTRVJTIn0.MAoP45_Q8auqje60GlRQ4oFvq73pJmD19OOdNS-7_xbwU3O3_E--Xow8ALngmy-Aiij4AGCBVGG76buLQmTaxg; mexusers_authn_token_jti=36bb72c5-558f-4c75-b81c-0ad688e23c9d; sa_MEXUSERS_c20e6c0fd4=eyJhbGciOiJFUzI1NiIsImtpZCI6IkVTMjU2XzE3ODY2NTI3MDUiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJNRVhVU0VSUyIsImV4cCI6MTc5NTIyNjYwMSwiaWF0IjoxNzkyNjM0NjAxLCJqdGkiOiI1MGFkZTE3ZTM3MDY0ODA0OTZjZjFiOWE4ZjUwNGY2YiIsIm5iZiI6MTc5MjYzNDU3MSwic3ViIjoiZTQ3Yzk1OTgtZmZjMC00NDNiLTlhN2EtYjkzZGVkZGI3ZGY4In0.1mqXMwYhwb0fNkvtOYuORrSuxI2vplyYL1vFcE8yRKpYx736hlkszdBcO4LG41ybmsjAeULMCoyOfFY5PkE2bQ; AWSELB=53B7490F14CB44B3C3CAE476A7D8BD7A112F66C8F807333E5C78FD4109F65AFEAFB0F879844BA5674BE47D52B41AEDC0C91AC16DC1BB863294F60D8297EC55AE9E6BDE1549; AWSELBCORS=53B7490F14CB44B3C3CAE476A7D8BD7A112F66C8F807333E5C78FD4109F65AFEAFB0F879844BA5674BE47D52B41AEDC0C91AC16DC1BB863294F60D8297EC55AE9E6BDE1549; hwToken=007feea460bda30a29efa48dc9ee7541; hwTime=1792635272836',
  expires_at: '2026-10-24T02:03:21.000Z'
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
  DEFAULT_SESSION
};
