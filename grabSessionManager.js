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
  cookie: '_gsvid=0fd84a99-0937-48b6-b187-8452cb881f24; _ga=GA1.1.415443980.1792490580; OptanonAlertBoxClosed=2026-10-20T12:54:23.322Z; DEVICE_ID=ee51c0c5-21cf-478f-a80c-6775994eee4a; OptanonConsent=isGpcEnabled=0&datestamp=Tue+Oct+20+2026+19%3A54%3A29+GMT%2B0700+(Western+Indonesia+Time)&version=202304.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&landingPath=NotLandingPage&AwaitingReconsent=false&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1; hwuuidtime=1792500894; hwuuid=c6cf6293-a68d-47e3-ac4e-b0b21f167207; AWSELB=53B7490F14CB44B3C3CAE476A7D8BD7A112F66C8F807333E5C78FD4109F65AFEAFB0F879845C0A73F156E64C2CCDE9D0CAB038FA02BB863294F60D8297EC55AE9E6BDE1549; AWSELBCORS=53B7490F14CB44B3C3CAE476A7D8BD7A112F66C8F807333E5C78FD4109F65AFEAFB0F879845C0A73F156E64C2CCDE9D0CAB038FA02BB863294F60D8297EC55AE9E6BDE1549; _gssid=2609241147-0qc93em21pxc; geo_country=EMPTY; geo_city=EMPTY; _ga_CCE1VPQSKS=GS2.1.s1792842456$o4$g0$t1792842456$j60$l0$h0; mexusers_authn_token=eyJhbGciOiJFUzI1NiIsImtpZCI6IkVTMjU2XzE3ODY2NTI4MzYiLCJ0eXAiOiJKV1QifQ.eyJhbXIiOiJXRUJMT0dJTiIsImF1ZCI6IlNTT19UT0tFTl9JU1NVSU5HX1NFUlZJQ0UiLCJlc2kiOiJXb0lWVzdQQ0MvVnhLRGlpRlc0a3h0dlBTKzBoUGpwaFEvR1U3MFhnQUlrdWpjd0VORWd5U3VPdW44MFlIQT09IiwiZXhwIjoxNzkzMDE1MjcwLCJpYXQiOjE3OTI4NDI0NjcsImp0aSI6IjVjOGZkYmQ1LTMwZmUtNDIzNS1hMjZlLWZjOTA1ZmU3Mjc0YyIsInN1YiI6ImU0N2M5NTk4LWZmYzAtNDQzYi05YTdhLWI5M2RlZGRiN2RmOCIsInN2YyI6Ik1FWFVTRVJTIn0.OwO9_TViY8feii1yncG5owTxYn8hZIImhsdX6BM6YkRhtVGCcCHjCFlZ1oFHjxNf64ahE07j9iA63IpnE2HY9g; mexusers_authn_token_jti=5c8fdbd5-30fe-4235-a26e-fc905fe7274c; sa_MEXUSERS_c20e6c0fd4=eyJhbGciOiJFUzI1NiIsImtpZCI6IkVTMjU2XzE3ODY2NTI3MDUiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJNRVhVU0VSUyIsImV4cCI6MTc5NTQzNDQ3MCwiaWF0IjoxNzkyODQyNDcwLCJqdGkiOiIwYTdiMmZiY2Y2ODE0ZDU5OTU1ZGM5OGEyNmNiZTk1YyIsIm5iZiI6MTc5Mjg0MjQ0MCwic3ViIjoiZTQ3Yzk1OTgtZmZjMC00NDNiLTlhN2EtYjkzZGVkZGI3ZGY4In0.J-x8Qf6jD8JPNDdBLuoWd-9c6FzW70CI7-cF7tnNBDO6xiEyN2Hx80IZJevWb-T53qsO0c0geskBag50Nfi20g; visits=1; hwToken=b080ebb038cf0568453ae4f859519206; hwTime=1792842536661; _dd_s=logs=1&id=1cc94b23-e2f7-4783-afb1-64ed6aea6960&created=1792842459349&expire=1792843441070&rum=0',
  expires_at: '2026-10-26T11:47:50.000Z'
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
