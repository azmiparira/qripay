/**
 * QRIPAY Soundbox - Client Engine (Multi-Store Edition)
 * - Natural Indonesian Speech Synthesis (Softer, Human-like Voice)
 * - Strict Anti-Double Speech Lock (1x Execution Guaranteed)
 * - Multi-Branch / Anak Perusahaan Navigation & Soundbox Modules
 * - Shopee Partner Live Poller Integration
 */

// ==============================================================================
// 1. DATA STORES (ANAK PERUSAHAAN)
// ==============================================================================
const STORES = {
  pempek: {
    id: 'pempek',
    name: 'Pempek Bandung',
    shortName: 'Pempek Bandung',
    city: 'Outlet Resmi • Kota Bandung (NMID: ID7549815959905)',
    icon: '🥘',
    color: '#f97316',
    qrisImage: '/qris_pempekbandung.png',
    qrisTitle: 'Poster QRIS Resmi Pempek Bandung',
    badgeText: 'QRIS Statis Cabang'
  },
  batagor: {
    id: 'batagor',
    name: 'Batagor Bandung',
    shortName: 'Batagor Bandung',
    city: 'Outlet Resmi • Kota Bandung (NMID: ID2358527015292)',
    icon: '🥟',
    color: '#06b6d4',
    qrisImage: '/qris_batagorbandung.png',
    qrisTitle: 'Poster QRIS Resmi Batagor Bandung',
    badgeText: 'QRIS Statis Cabang'
  },
  soto: {
    id: 'soto',
    name: 'Soto Lamongan',
    shortName: 'Soto Lamongan',
    city: 'Outlet Resmi • Kab. Lamongan (NMID: ID8211776223979)',
    icon: '🍲',
    color: '#eab308',
    qrisImage: '/qris_sotolamongan.png',
    qrisTitle: 'Poster QRIS Resmi Soto Lamongan',
    badgeText: 'QRIS Statis Cabang'
  },
  pusat: {
    id: 'pusat',
    name: 'Janji Jawa (Pusat)',
    shortName: 'Janji Jawa',
    city: 'NMID Merchant Utama (ID1025404856482)',
    icon: '🏬',
    color: '#3b82f6',
    qrisImage: '/qrisawal.png',
    qrisTitle: 'QRIS Merchant Utama Janji Jawa',
    badgeText: 'QRIS Merchant Induk'
  }
};

let currentStore = 'pempek'; // Default active store
let audioUnlocked = false;
let audioCtx = null;
let lastProcessedId = Date.now();

// Strict Anti-Double Speech Lock
const spokenTxIds = new Set();
let speechQueue = [];
let isSpeechBusy = false;

// DOM Elements
const btnUnlockAudio = document.getElementById('btnUnlockAudio');
const audioBtnText = document.getElementById('audioBtnText');
const singleSoundboxView = document.getElementById('singleSoundboxView');
const multiSoundboxView = document.getElementById('multiSoundboxView');
const storeBadgeIcon = document.getElementById('storeBadgeIcon');
const storeBadgeName = document.getElementById('storeBadgeName');
const storeBadgeCity = document.getElementById('storeBadgeCity');
const ledStoreTag = document.getElementById('ledStoreTag');
const displayAmount = document.getElementById('displayAmount');
const displayInfo = document.getElementById('displayInfo');
const speakerGrill = document.getElementById('speakerGrill');
const qrisCardTitle = document.getElementById('qrisCardTitle');
const qrisTypeBadge = document.getElementById('qrisTypeBadge');
const qrisImage = document.getElementById('qrisImage');
const simDescStore = document.getElementById('simDescStore');
const btnSimulate = document.getElementById('btnSimulate');
const customAmountInput = document.getElementById('customAmount');
const transactionList = document.getElementById('transactionList');
const emptyState = document.getElementById('emptyState');
const btnClearHistory = document.getElementById('btnClearHistory');
const voiceSelect = document.getElementById('voiceSelect');
const btnTestVoice = document.getElementById('btnTestVoice');

// Dynamically set webhook URL to current origin
const currentOrigin = window.location.origin;
const webhookUrlText = document.getElementById('webhookUrlText');
if (webhookUrlText && currentOrigin && !currentOrigin.startsWith('file://')) {
  webhookUrlText.textContent = `${currentOrigin}/api/webhook`;
  const directLink = document.getElementById('directTestLink');
  if (directLink) {
    directLink.href = `${currentOrigin}/api/webhook?amount=20000&payer=BCA&storeId=pempek`;
  }
}

// ==============================================================================
// 2. TERBILANG RUPIAH (INDONESIAN WORDS)
// ==============================================================================
function angkaKeTeks(nilai) {
  nilai = Math.abs(parseInt(nilai, 10)) || 0;
  const simpan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  let hasil = "";
  if (nilai < 12) {
    hasil = " " + simpan[nilai];
  } else if (nilai < 20) {
    hasil = angkaKeTeks(nilai - 10) + " belas";
  } else if (nilai < 100) {
    hasil = angkaKeTeks(Math.floor(nilai / 10)) + " puluh" + angkaKeTeks(nilai % 10);
  } else if (nilai < 200) {
    hasil = " seratus" + angkaKeTeks(nilai - 100);
  } else if (nilai < 1000) {
    hasil = angkaKeTeks(Math.floor(nilai / 100)) + " ratus" + angkaKeTeks(nilai % 100);
  } else if (nilai < 2000) {
    hasil = " seribu" + angkaKeTeks(nilai - 1000);
  } else if (nilai < 1000000) {
    hasil = angkaKeTeks(Math.floor(nilai / 1000)) + " ribu" + angkaKeTeks(nilai % 1000);
  } else if (nilai < 1000000000) {
    hasil = angkaKeTeks(Math.floor(nilai / 1000000)) + " juta" + angkaKeTeks(nilai % 1000000);
  } else if (nilai < 1000000000000) {
    hasil = angkaKeTeks(Math.floor(nilai / 1000000000)) + " miliar" + angkaKeTeks(nilai % 1000000000);
  }
  return hasil.trim();
}

// ==============================================================================
// 3. SOUND SYNTHESIS & NATURAL SPEECH ENGINE
// ==============================================================================

/**
 * Crisp Ding-Dong Cash Register Chime (Web Audio API)
 */
function playChimeBell() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    
    // Tone 1: 587.33 Hz (D5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.32, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.55);

    // Tone 2: 880 Hz (A5) - Ding Dong effect
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.38, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.85);
  } catch (e) {
    console.warn('Audio chime warning:', e);
  }
}

/**
 * Select the best Natural / Smooth Indonesian Voice available in the browser
 */
function getBestIndonesianVoice(profile) {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 1. Check for high quality neural/natural Indonesian voices
  const msGadis = voices.find(v => v.name.includes('Gadis') || (v.lang === 'id-ID' && v.name.includes('Natural')));
  const googleId = voices.find(v => v.name.includes('Google Bahasa Indonesia') || v.name.includes('Indonesian Google'));
  const msArdi = voices.find(v => v.name.includes('Ardi') || (v.lang === 'id-ID' && v.name.includes('Male')));
  const standardId = voices.find(v => v.lang.startsWith('id') || v.lang.includes('ID'));

  if (profile === 'gentle_male' && msArdi) return msArdi;
  if (msGadis) return msGadis;
  if (googleId) return googleId;
  return standardId || null;
}

/**
 * Natural Spoken Announcement with Strict Queue & Anti-Double Guarantee
 */
function speakAnnouncement(amount, storeName, callback) {
  playChimeBell();

  setTimeout(() => {
    if (!('speechSynthesis' in window)) {
      if (callback) callback();
      return;
    }

    window.speechSynthesis.cancel(); // Clear any hanging audio

    const terbilang = angkaKeTeks(amount);
    const storeLabel = storeName ? `${storeName}, ` : '';
    // Intonasi alami dengan jeda koma santai
    const kalimat = `Pembayaran QRIS untuk ${storeLabel}sebesar ${terbilang} rupiah, berhasil diterima.`;

    const utter = new SpeechSynthesisUtterance(kalimat);
    utter.lang = 'id-ID';

    const profile = voiceSelect ? voiceSelect.value : 'natural_female';
    const voice = getBestIndonesianVoice(profile);
    if (voice) utter.voice = voice;

    // Setting intonasi halus (softer & natural cadence)
    if (profile === 'cheerful_female') {
      utter.rate = 0.98;
      utter.pitch = 1.12;
    } else if (profile === 'gentle_male') {
      utter.rate = 0.90;
      utter.pitch = 0.92;
    } else {
      // Natural Female (Default)
      utter.rate = 0.92;
      utter.pitch = 1.04;
    }

    utter.onend = () => {
      if (callback) callback();
    };
    utter.onerror = () => {
      if (callback) callback();
    };

    window.speechSynthesis.speak(utter);
  }, 400);
}

/**
 * Sequential Speech Queue Processor (Guarantees STRICTLY 1x Audio Execution)
 */
function processSpeechQueue() {
  if (isSpeechBusy || speechQueue.length === 0) return;
  isSpeechBusy = true;

  const item = speechQueue.shift();
  triggerSoundboxAnimation(item.storeId);

  speakAnnouncement(item.amount, item.storeName, () => {
    isSpeechBusy = false;
    stopSoundboxAnimation(item.storeId);
    setTimeout(processSpeechQueue, 300);
  });
}

function queueAnnouncement(tx) {
  const uniqueKey = String(tx.transactionId || tx.id);
  if (spokenTxIds.has(uniqueKey)) {
    console.log(`[Anti-Double] Ignored duplicate speech trigger for ID: ${uniqueKey}`);
    return;
  }
  spokenTxIds.add(uniqueKey);

  speechQueue.push({
    storeId: tx.storeId || 'pempek',
    storeName: tx.storeName || STORES[tx.storeId]?.name || 'Pempek Bandung',
    amount: tx.amount,
    payer: tx.payer
  });

  processSpeechQueue();
}

// ==============================================================================
// 4. ANIMATION & UI FEED CONTROLLERS
// ==============================================================================

function triggerSoundboxAnimation(storeId) {
  // 1. Single View Speaker Grill
  if (speakerGrill) speakerGrill.classList.add('active');

  // 2. Multi View Mini Box Pulse
  const miniBox = document.getElementById(`miniBox${capitalize(storeId)}`);
  if (miniBox) miniBox.classList.add('active-pulse');
}

function stopSoundboxAnimation(storeId) {
  if (speakerGrill) speakerGrill.classList.remove('active');
  const miniBox = document.getElementById(`miniBox${capitalize(storeId)}`);
  if (miniBox) miniBox.classList.remove('active-pulse');
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function handlePaymentEvent(tx) {
  if (!tx || !tx.amount) return;

  const storeInfo = STORES[tx.storeId] || STORES.pempek;
  const storeName = tx.storeName || storeInfo.name;

  // 1. Update Large LED Screen in Single View
  if (displayAmount) displayAmount.textContent = `Rp ${Number(tx.amount).toLocaleString('id-ID')}`;
  if (displayInfo) displayInfo.textContent = `LUNAS (${storeName}) • ${tx.payer || 'QRIS'} • ${new Date(tx.timestamp).toLocaleTimeString('id-ID')}`;

  // 2. Update Mini LED in Multi View
  const miniAmount = document.getElementById(`miniAmount${capitalize(tx.storeId)}`);
  const miniInfo = document.getElementById(`miniInfo${capitalize(tx.storeId)}`);
  if (miniAmount) miniAmount.textContent = `+Rp ${Number(tx.amount).toLocaleString('id-ID')}`;
  if (miniInfo) miniInfo.textContent = `Lunas via ${tx.payer || 'QRIS'}`;

  // 3. Queue Spoken Audio (Strict 1x)
  queueAnnouncement(tx);

  // 4. Add To Feed List
  addTransactionToFeed(tx);

  // 5. Reset Large LED after 12s
  setTimeout(() => {
    if (displayAmount && displayAmount.textContent === `Rp ${Number(tx.amount).toLocaleString('id-ID')}`) {
      displayAmount.textContent = 'STANDBY';
      displayInfo.textContent = `Menunggu pembayaran QRIS dari pembeli...`;
    }
    if (miniAmount && miniAmount.textContent === `+Rp ${Number(tx.amount).toLocaleString('id-ID')}`) {
      miniAmount.textContent = 'STANDBY';
      miniInfo.textContent = 'Siap melayani';
    }
  }, 12000);
}

function addTransactionToFeed(tx) {
  if (emptyState) emptyState.style.display = 'none';

  const item = document.createElement('div');
  item.className = 'tx-item';
  const time = new Date(tx.timestamp).toLocaleTimeString('id-ID');
  const storeInfo = STORES[tx.storeId] || STORES.pempek;
  const storeName = tx.storeName || storeInfo.name;
  
  item.innerHTML = `
    <div class="tx-left">
      <div style="display:flex; align-items:center; gap:6px;">
        <span class="badge-pill" style="background:rgba(255,255,255,0.08); font-size:11px; padding:2px 6px;">${storeInfo.icon || '🏪'} ${storeName}</span>
        <span class="tx-payer">${tx.payer || 'Pembeli QRIS'}</span>
      </div>
      <span class="tx-meta">Pukul ${time} • ${tx.source || 'Shopee Partner'}</span>
    </div>
    <div class="tx-amount" style="color: ${storeInfo.color || '#10b981'};">+Rp ${Number(tx.amount).toLocaleString('id-ID')}</div>
  `;

  transactionList.insertBefore(item, transactionList.firstChild);
}

// ==============================================================================
// 5. BRANCH SWITCHER (ANAK PERUSAHAAN NAVIGATION)
// ==============================================================================

function switchStore(storeKey) {
  currentStore = storeKey;

  // Update tabs active state
  document.querySelectorAll('.branch-tab').forEach(tab => {
    if (tab.getAttribute('data-store') === storeKey) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  if (storeKey === 'all') {
    // Show Multi-Store View
    if (singleSoundboxView) singleSoundboxView.style.display = 'none';
    if (multiSoundboxView) multiSoundboxView.style.display = 'block';
  } else {
    // Show Single Store View
    if (multiSoundboxView) multiSoundboxView.style.display = 'none';
    if (singleSoundboxView) singleSoundboxView.style.display = 'block';

    const store = STORES[storeKey] || STORES.pempek;
    if (storeBadgeIcon) storeBadgeIcon.textContent = store.icon;
    if (storeBadgeName) storeBadgeName.textContent = store.name;
    if (storeBadgeCity) storeBadgeCity.textContent = store.city;
    if (ledStoreTag) ledStoreTag.textContent = `KASIR ${store.name.toUpperCase()}`;
    if (qrisCardTitle) qrisCardTitle.textContent = store.qrisTitle;
    if (qrisTypeBadge) qrisTypeBadge.textContent = store.badgeText;
    if (qrisImage) qrisImage.src = store.qrisImage;
    if (simDescStore) simDescStore.textContent = `Menguji suara soundbox khusus toko ${store.name}`;
  }
}

// Bind Branch Tabs
document.querySelectorAll('.branch-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const storeKey = tab.getAttribute('data-store');
    switchStore(storeKey);
  });
});

// Mini test buttons inside multi-store view
document.querySelectorAll('.btn-mini-test').forEach(btn => {
  btn.addEventListener('click', () => {
    const storeKey = btn.getAttribute('data-store');
    const amount = btn.getAttribute('data-amount') || 15000;
    triggerSimulation(amount, storeKey);
  });
});

// Voice Test Button
if (btnTestVoice) {
  btnTestVoice.addEventListener('click', () => {
    if (!audioUnlocked) unlockAudio();
    const store = STORES[currentStore === 'all' ? 'pempek' : currentStore];
    playChimeBell();
    setTimeout(() => {
      speakAnnouncement(25000, store.name);
    }, 300);
  });
}

// ==============================================================================
// 6. SIMULATION & SOUND TESTING
// ==============================================================================

document.querySelectorAll('.chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = btn.getAttribute('data-amount');
    const store = currentStore === 'all' ? 'pempek' : currentStore;
    triggerSimulation(amount, store);
  });
});

if (btnSimulate) {
  btnSimulate.addEventListener('click', () => {
    const val = customAmountInput ? (customAmountInput.value || 15000) : 15000;
    const store = currentStore === 'all' ? 'pempek' : currentStore;
    triggerSimulation(val, store);
  });
}

async function triggerSimulation(amount, storeKey = 'pempek') {
  if (!audioUnlocked) unlockAudio();
  const store = STORES[storeKey] || STORES.pempek;

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseInt(amount, 10),
        payer: 'Tes Pembeli QRIS',
        storeId: store.id,
        storeName: store.name
      })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.transaction) {
        handlePaymentEvent(json.transaction);
      }
    }
  } catch (e) {
    // Local fallback
    handlePaymentEvent({
      id: Date.now(),
      transactionId: String(Date.now()),
      amount: parseInt(amount, 10),
      storeId: store.id,
      storeName: store.name,
      payer: 'Tes Suara Mandiri',
      source: 'Simulasi Lokal',
      timestamp: new Date().toISOString()
    });
  }
}

// ==============================================================================
// 7. AUDIO UNLOCKER (BROWSER AUTOPLAY POLICY)
// ==============================================================================

function unlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if ('speechSynthesis' in window) {
    const silent = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(silent);
  }

  audioUnlocked = true;
  if (btnUnlockAudio) btnUnlockAudio.classList.add('unlocked');
  if (audioBtnText) audioBtnText.textContent = 'SUARA SOUNDBOX SUDAH AKTIF ✅';
}

if (btnUnlockAudio) btnUnlockAudio.addEventListener('click', unlockAudio);

// ==============================================================================
// 8. REALTIME POLLING ROUTINES (Anti-Double Guarded)
// ==============================================================================

async function pollTransactions() {
  try {
    const res = await fetch(`/api/poll?since=${lastProcessedId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.hasNew && Array.isArray(data.events)) {
        data.events.reverse().forEach(ev => {
          // If transaction has already been spoken by Shopee poller, skip
          const uniqueKey = String(ev.transactionId || ev.id);
          if (!spokenTxIds.has(uniqueKey)) {
            handlePaymentEvent(ev);
          }
          if (ev.id > lastProcessedId) {
            lastProcessedId = ev.id;
          }
        });
      }
      if (data.latestId && data.latestId > lastProcessedId) {
        lastProcessedId = data.latestId;
      }
    }
  } catch (err) {
    // Silent
  } finally {
    setTimeout(pollTransactions, 2000);
  }
}

pollTransactions();

// ==============================================================================
// 9. SHOPEE PARTNER LIVE POLLER CONTROLLER
// ==============================================================================

const shopeeTokenInput = document.getElementById('shopeeTokenInput');
const btnToggleTokenVisibility = document.getElementById('btnToggleTokenVisibility');
const btnConnectShopee = document.getElementById('btnConnectShopee');
const connectBtnText = document.getElementById('connectBtnText');
const btnDisconnectShopee = document.getElementById('btnDisconnectShopee');
const btnCheckMutasi = document.getElementById('btnCheckMutasi');
const shopeeStatusBadge = document.getElementById('shopeeStatusBadge');
const tokenHintText = document.getElementById('tokenHintText');
const autoPollBox = document.getElementById('autoPollBox');
const cbAutoPoll = document.getElementById('cbAutoPoll');
const pollStatusText = document.getElementById('pollStatusText');

let isShopeeConnected = false;
let shopeePollTimer = null;

if (btnToggleTokenVisibility && shopeeTokenInput) {
  btnToggleTokenVisibility.addEventListener('click', () => {
    if (shopeeTokenInput.type === 'password') {
      shopeeTokenInput.type = 'text';
      btnToggleTokenVisibility.textContent = '🔒';
    } else {
      shopeeTokenInput.type = 'password';
      btnToggleTokenVisibility.textContent = '👁️';
    }
  });
}

async function connectShopee(token, isAuto = false) {
  if (!token || !token.trim()) {
    if (!isAuto) alert('Silakan masukkan SHOPEE_TOKEN terlebih dahulu!');
    return;
  }

  const cleanToken = token.trim().replace(/^["']|["']$/g, '');
  if (shopeeTokenInput) shopeeTokenInput.value = cleanToken;
  if (btnConnectShopee) btnConnectShopee.disabled = true;
  if (connectBtnText) connectBtnText.textContent = 'Memverifikasi ke Shopee...';
  if (tokenHintText) {
    tokenHintText.textContent = 'Menghubungkan ke server ShopeePay Partner...';
    tokenHintText.style.color = '#38bdf8';
  }

  try {
    const res = await fetch('/api/shopee/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanToken })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      isShopeeConnected = true;
      localStorage.setItem('qripay_shopee_token', cleanToken);

      if (shopeeStatusBadge) {
        shopeeStatusBadge.className = 'badge-pill badge-online';
        shopeeStatusBadge.textContent = '🟢 Terhubung & Aktif';
      }
      if (connectBtnText) connectBtnText.textContent = 'Perbarui Token';
      if (tokenHintText) {
        tokenHintText.textContent = `✅ Terhubung! Akun Shopee Partner Anda aktif. Soundbox siap mengumumkan transaksi untuk anak perusahaan!`;
        tokenHintText.style.color = '#34d399';
      }

      if (btnDisconnectShopee) btnDisconnectShopee.style.display = 'inline-block';
      if (btnCheckMutasi) btnCheckMutasi.style.display = 'inline-block';
      if (autoPollBox) autoPollBox.style.display = 'flex';

      if (!audioUnlocked) unlockAudio();
      startShopeePolling();
    } else {
      throw new Error(data.message || 'Token ditolak');
    }
  } catch (err) {
    isShopeeConnected = false;
    if (shopeeStatusBadge) {
      shopeeStatusBadge.className = 'badge-pill badge-warning';
      shopeeStatusBadge.textContent = 'Gagal Terhubung ⚠️';
    }
    if (tokenHintText) {
      tokenHintText.textContent = `❌ ${err.message}. Pastikan token diawali "B:".`;
      tokenHintText.style.color = '#f87171';
    }
    if (connectBtnText) connectBtnText.textContent = 'Sambungkan Akun Shopee';
  } finally {
    if (btnConnectShopee) btnConnectShopee.disabled = false;
  }
}

async function disconnectShopee() {
  if (!confirm('Putuskan koneksi ke Shopee Partner?')) return;
  try {
    await fetch('/api/shopee/disconnect', { method: 'POST' });
  } catch (e) {}

  localStorage.removeItem('qripay_shopee_token');
  isShopeeConnected = false;
  if (shopeeTokenInput) shopeeTokenInput.value = '';
  if (shopeeStatusBadge) {
    shopeeStatusBadge.className = 'badge-pill badge-offline';
    shopeeStatusBadge.textContent = 'Belum Terhubung';
  }
  if (connectBtnText) connectBtnText.textContent = 'Sambungkan Akun Shopee';
  if (tokenHintText) {
    tokenHintText.textContent = 'Akun Shopee Partner telah diputuskan.';
    tokenHintText.style.color = 'var(--text-muted)';
  }
  if (btnDisconnectShopee) btnDisconnectShopee.style.display = 'none';
  if (btnCheckMutasi) btnCheckMutasi.style.display = 'none';
  if (autoPollBox) autoPollBox.style.display = 'none';
  if (shopeePollTimer) clearTimeout(shopeePollTimer);
}

async function pollShopeeLoop() {
  if (!isShopeeConnected || (cbAutoPoll && !cbAutoPoll.checked)) {
    shopeePollTimer = setTimeout(pollShopeeLoop, 4000);
    return;
  }

  try {
    const store = STORES[currentStore === 'all' ? 'pempek' : currentStore];
    const res = await fetch(`/api/shopee/poll-transactions?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`);
    const data = await res.json();

    if (data.connected && data.success) {
      if (pollStatusText) {
        pollStatusText.textContent = `Aktif (Cek: ${new Date().toLocaleTimeString('id-ID')})`;
      }
      
      if (data.hasNew && Array.isArray(data.newPayments)) {
        data.newPayments.forEach(payment => {
          handlePaymentEvent(payment);
        });
      }
    } else if (data.tokenValid === false) {
      if (pollStatusText) pollStatusText.textContent = 'Token Kadaluarsa! ⚠️';
      if (shopeeStatusBadge) {
        shopeeStatusBadge.className = 'badge-pill badge-warning';
        shopeeStatusBadge.textContent = 'Sesi Kadaluarsa ⚠️';
      }
    }
  } catch (err) {
    if (pollStatusText) pollStatusText.textContent = 'Mencoba menghubungkan kembali...';
  } finally {
    shopeePollTimer = setTimeout(pollShopeeLoop, 4000);
  }
}

function startShopeePolling() {
  if (shopeePollTimer) clearTimeout(shopeePollTimer);
  pollShopeeLoop();
}

async function checkShopeeMutasi() {
  if (!btnCheckMutasi) return;
  btnCheckMutasi.disabled = true;
  btnCheckMutasi.textContent = 'Mengambil Data...';
  try {
    const res = await fetch('/transactions');
    const data = await res.json();
    if (data.success && data.data?.transactions) {
      const list = data.data.transactions;
      alert(`✅ Berhasil mengambil ${list.length} mutasi terbaru!\nTotal: Rp ${parseInt(data.total_amount, 10).toLocaleString('id-ID')}`);
      list.slice(0, 5).forEach(tx => {
        addTransactionToFeed({
          amount: tx.amount,
          storeId: currentStore === 'all' ? 'pempek' : currentStore,
          storeName: STORES[currentStore === 'all' ? 'pempek' : currentStore].name,
          payer: tx.issuer || 'ShopeePay',
          source: 'Mutasi Shopee (Manual)',
          timestamp: new Date().toISOString()
        });
      });
    } else {
      alert(`Gagal mengambil mutasi: ${data.error || 'Terjadi kesalahan'}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  } finally {
    btnCheckMutasi.disabled = false;
    btnCheckMutasi.textContent = 'Tarik Mutasi Sekarang 🔄';
  }
}

if (btnConnectShopee) btnConnectShopee.addEventListener('click', () => connectShopee(shopeeTokenInput.value));
if (btnDisconnectShopee) btnDisconnectShopee.addEventListener('click', disconnectShopee);
if (btnCheckMutasi) btnCheckMutasi.addEventListener('click', checkShopeeMutasi);

if (btnClearHistory) {
  btnClearHistory.addEventListener('click', () => {
    transactionList.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'block';
      transactionList.appendChild(emptyState);
    }
  });
}

// Startup: Auto restore saved token
const savedShopeeToken = localStorage.getItem('qripay_shopee_token');
if (savedShopeeToken) {
  if (shopeeTokenInput) shopeeTokenInput.value = savedShopeeToken;
  connectShopee(savedShopeeToken, true);
}

// Load voices
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

// ==============================================================================
// 10. DANA BISNIS GATEWAY CONTROLLER (yono99/dana-api-gateway integration)
// ==============================================================================

const tabGatewayDana = document.getElementById('tabGatewayDana');
const tabGatewayShopee = document.getElementById('tabGatewayShopee');
const danaGatewayCard = document.getElementById('danaGatewayCard');
const shopeeGatewayCard = document.getElementById('shopeeGatewayCard');

const btnDanaTabToken = document.getElementById('btnDanaTabToken');
const btnDanaTabOtp = document.getElementById('btnDanaTabOtp');
const danaTokenView = document.getElementById('danaTokenView');
const danaOtpView = document.getElementById('danaOtpView');

const danaTokenInput = document.getElementById('danaTokenInput');
const danaMerchantIdInput = document.getElementById('danaMerchantIdInput');
const btnToggleDanaToken = document.getElementById('btnToggleDanaToken');
const btnConnectDana = document.getElementById('btnConnectDana');
const connectDanaBtnText = document.getElementById('connectDanaBtnText');
const btnDisconnectDana = document.getElementById('btnDisconnectDana');
const btnCheckDanaMutasi = document.getElementById('btnCheckDanaMutasi');
const danaStatusBadge = document.getElementById('danaStatusBadge');
const cbDanaAutoPoll = document.getElementById('cbDanaAutoPoll');
const danaAutoPollBox = document.getElementById('danaAutoPollBox');
const danaPollStatusText = document.getElementById('danaPollStatusText');

const danaPhoneInput = document.getElementById('danaPhoneInput');
const btnSendDanaOtp = document.getElementById('btnSendDanaOtp');
const danaOtpStep2 = document.getElementById('danaOtpStep2');
const danaOtpInput = document.getElementById('danaOtpInput');
const btnVerifyDanaOtp = document.getElementById('btnVerifyDanaOtp');

let isDanaConnected = false;
let danaPollTimer = null;
let currentOtpToken = null;
let currentDeviceId = null;

// Gateway Switcher
if (tabGatewayDana && tabGatewayShopee) {
  tabGatewayDana.addEventListener('click', () => {
    tabGatewayDana.classList.add('active');
    tabGatewayShopee.classList.remove('active');
    if (danaGatewayCard) danaGatewayCard.style.display = 'block';
    if (shopeeGatewayCard) shopeeGatewayCard.style.display = 'none';
  });

  tabGatewayShopee.addEventListener('click', () => {
    tabGatewayShopee.classList.add('active');
    tabGatewayDana.classList.remove('active');
    if (shopeeGatewayCard) shopeeGatewayCard.style.display = 'block';
    if (danaGatewayCard) danaGatewayCard.style.display = 'none';
  });
}

// DANA Tabs: Token vs OTP
if (btnDanaTabToken && btnDanaTabOtp) {
  btnDanaTabToken.addEventListener('click', () => {
    btnDanaTabToken.classList.add('active');
    btnDanaTabOtp.classList.remove('active');
    if (danaTokenView) danaTokenView.style.display = 'block';
    if (danaOtpView) danaOtpView.style.display = 'none';
  });

  btnDanaTabOtp.addEventListener('click', () => {
    btnDanaTabOtp.classList.add('active');
    btnDanaTabToken.classList.remove('active');
    if (danaOtpView) danaOtpView.style.display = 'block';
    if (danaTokenView) danaTokenView.style.display = 'none';
  });
}

if (btnToggleDanaToken && danaTokenInput) {
  btnToggleDanaToken.addEventListener('click', () => {
    if (danaTokenInput.type === 'password') {
      danaTokenInput.type = 'text';
      btnToggleDanaToken.textContent = '🔒';
    } else {
      danaTokenInput.type = 'password';
      btnToggleDanaToken.textContent = '👁️';
    }
  });
}

async function checkDanaStatus() {
  try {
    const res = await fetch('/api/dana/status');
    const data = await res.json();
    if (data.success && data.connected) {
      setDanaConnectedState(true, data.merchantName || 'DANA Merchant');
    } else {
      setDanaConnectedState(false);
    }
  } catch (e) {
    setDanaConnectedState(false);
  }
}

function setDanaConnectedState(connected, merchantName = '') {
  isDanaConnected = connected;
  if (connected) {
    if (danaStatusBadge) {
      danaStatusBadge.className = 'badge-pill badge-live';
      danaStatusBadge.textContent = `🟢 Terhubung (${merchantName})`;
    }
    if (btnConnectDana) btnConnectDana.style.display = 'none';
    if (btnDisconnectDana) btnDisconnectDana.style.display = 'inline-block';
    if (btnCheckDanaMutasi) btnCheckDanaMutasi.style.display = 'inline-block';
    if (danaAutoPollBox) danaAutoPollBox.style.display = 'block';
    startDanaPolling();
  } else {
    if (danaStatusBadge) {
      danaStatusBadge.className = 'badge-pill badge-offline';
      danaStatusBadge.textContent = 'Belum Terhubung';
    }
    if (btnConnectDana) btnConnectDana.style.display = 'inline-block';
    if (btnDisconnectDana) btnDisconnectDana.style.display = 'none';
    if (btnCheckDanaMutasi) btnCheckDanaMutasi.style.display = 'none';
    if (danaAutoPollBox) danaAutoPollBox.style.display = 'none';
    if (danaPollTimer) clearTimeout(danaPollTimer);
  }
}

async function connectDanaManual() {
  const token = danaTokenInput?.value?.trim();
  const merchantId = danaMerchantIdInput?.value?.trim();
  if (!token) {
    alert('Silakan masukkan Access Token atau Cookie DANA Bisnis!');
    return;
  }

  if (btnConnectDana) btnConnectDana.disabled = true;
  if (connectDanaBtnText) connectDanaBtnText.textContent = 'Menghubungkan...';

  try {
    const res = await fetch('/api/dana/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: token.startsWith('Bearer ') ? token.slice(7) : token,
        merchantId: merchantId || null
      })
    });
    const data = await res.json();
    if (data.success) {
      setDanaConnectedState(true, data.session?.merchantName || 'DANA Merchant');
      localStorage.setItem('qripay_dana_token', token);
      alert('✅ Akun DANA Bisnis berhasil terhubung!');
    } else {
      alert(`Gagal menghubungkan DANA: ${data.message || 'Error'}`);
      setDanaConnectedState(false);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
    setDanaConnectedState(false);
  } finally {
    if (btnConnectDana) btnConnectDana.disabled = false;
    if (connectDanaBtnText) connectDanaBtnText.textContent = 'Sambungkan DANA Bisnis';
  }
}

async function disconnectDana() {
  await fetch('/api/dana/disconnect', { method: 'POST' });
  localStorage.removeItem('qripay_dana_token');
  setDanaConnectedState(false);
}

// DANA OTP Handlers
if (btnSendDanaOtp) {
  btnSendDanaOtp.addEventListener('click', async () => {
    const phone = danaPhoneInput?.value?.trim();
    if (!phone) {
      alert('Masukkan nomor HP akun DANA Bisnis Anda!');
      return;
    }
    btnSendDanaOtp.disabled = true;
    btnSendDanaOtp.textContent = 'Mengirim...';
    try {
      const res = await fetch('/api/dana/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.success) {
        currentOtpToken = data.data?.otp_token;
        currentDeviceId = data.data?.deviceId;
        if (danaOtpStep2) danaOtpStep2.style.display = 'block';
        alert('✅ Kode OTP berhasil dikirim via SMS/WhatsApp DANA. Masukkan kode tersebut.');
      } else {
        alert(`Gagal kirim OTP: ${data.message}`);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      btnSendDanaOtp.disabled = false;
      btnSendDanaOtp.textContent = 'Kirim Ulang OTP';
    }
  });
}

if (btnVerifyDanaOtp) {
  btnVerifyDanaOtp.addEventListener('click', async () => {
    const phone = danaPhoneInput?.value?.trim();
    const otp = danaOtpInput?.value?.trim();
    if (!otp) {
      alert('Masukkan kode OTP!');
      return;
    }
    btnVerifyDanaOtp.disabled = true;
    btnVerifyDanaOtp.textContent = 'Memverifikasi...';
    try {
      const res = await fetch('/api/dana/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          otp,
          otpToken: currentOtpToken,
          deviceId: currentDeviceId
        })
      });
      const data = await res.json();
      if (data.success) {
        setDanaConnectedState(true, data.session?.merchant_name || 'DANA Merchant');
        alert('🎉 Berhasil login DANA Bisnis!');
      } else {
        alert(`Verifikasi OTP gagal: ${data.message}`);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      btnVerifyDanaOtp.disabled = false;
      btnVerifyDanaOtp.textContent = 'Verifikasi OTP';
    }
  });
}

async function pollDanaLoop() {
  if (!isDanaConnected || (cbDanaAutoPoll && !cbDanaAutoPoll.checked)) {
    danaPollTimer = setTimeout(pollDanaLoop, 4000);
    return;
  }

  try {
    const store = STORES[currentStore === 'all' ? 'pempek' : currentStore];
    const res = await fetch(`/api/dana/poll-transactions?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`);
    const data = await res.json();

    if (data.connected && data.success) {
      if (danaPollStatusText) {
        danaPollStatusText.textContent = `Aktif (Cek DANA: ${new Date().toLocaleTimeString('id-ID')})`;
      }
      if (data.hasNew && Array.isArray(data.newPayments)) {
        data.newPayments.forEach(payment => {
          handlePaymentEvent(payment);
        });
      }
    } else if (data.connected === false) {
      setDanaConnectedState(false);
    }
  } catch (err) {
    if (danaPollStatusText) danaPollStatusText.textContent = 'Menghubungkan DANA...';
  } finally {
    danaPollTimer = setTimeout(pollDanaLoop, 4000);
  }
}

function startDanaPolling() {
  if (danaPollTimer) clearTimeout(danaPollTimer);
  pollDanaLoop();
}

async function checkDanaMutasi() {
  if (!btnCheckDanaMutasi) return;
  btnCheckDanaMutasi.disabled = true;
  btnCheckDanaMutasi.textContent = 'Mengambil Data...';
  try {
    const res = await fetch('/api/dana/transactions');
    const data = await res.json();
    if (data.success && data.data?.transactions) {
      const list = data.data.transactions;
      alert(`✅ Berhasil mengambil ${list.length} mutasi DANA terbaru!`);
      list.slice(0, 5).forEach(tx => {
        addTransactionToFeed({
          amount: tx.amount,
          storeId: currentStore === 'all' ? 'pempek' : currentStore,
          storeName: STORES[currentStore === 'all' ? 'pempek' : currentStore].name,
          payer: tx.issuer || 'DANA Payer',
          source: 'DANA Bisnis (Mutasi)',
          timestamp: tx.time || new Date().toISOString()
        });
      });
    } else {
      alert(`Gagal mengambil mutasi DANA: ${data.error || 'Terjadi kesalahan'}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  } finally {
    btnCheckDanaMutasi.disabled = false;
    btnCheckDanaMutasi.textContent = 'Tarik Mutasi DANA 🔄';
  }
}

if (btnConnectDana) btnConnectDana.addEventListener('click', connectDanaManual);
if (btnDisconnectDana) btnDisconnectDana.addEventListener('click', disconnectDana);
if (btnCheckDanaMutasi) btnCheckDanaMutasi.addEventListener('click', checkDanaMutasi);

// Initial check
checkDanaStatus();
