/**
 * QriPay Soundbox — GrabMerchant Gateway Frontend Engine
 * Real-Time Poller, Audio Synthesis, and Hardware Animations
 */

// ==============================================================================
// 1. STORE REGISTRY & STATE
// ==============================================================================

const STORES = {
  pempek: {
    id: 'pempek',
    name: 'Pempek Bandung',
    emoji: '🥘',
    city: 'Outlet Resmi • Kota Bandung (NMID: ID1025433207095)',
    qrisImg: '/qris_pempekbandung.png',
    qrisTitle: 'Poster QRIS Resmi Pempek Bandung',
    qrisMerchant: 'PEMPEK BANDUNG',
    downloadName: 'QRIS_Pempek_Bandung.png'
  },
  batagor: {
    id: 'batagor',
    name: 'Batagor Bandung',
    emoji: '🥟',
    city: 'Outlet Resmi • Kota Bandung (NMID: ID1025433207095)',
    qrisImg: '/qris_batagorbandung.png',
    qrisTitle: 'Poster QRIS Resmi Batagor Bandung',
    qrisMerchant: 'BATAGOR BANDUNG',
    downloadName: 'QRIS_Batagor_Bandung.png'
  },
  soto: {
    id: 'soto',
    name: 'Soto Lamongan',
    emoji: '🍲',
    city: 'Outlet Resmi • Kota Bandung (NMID: ID1025433207095)',
    qrisImg: '/qris_sotolamongan.png',
    qrisTitle: 'Poster QRIS Resmi Soto Lamongan',
    qrisMerchant: 'SOTO LAMONGAN',
    downloadName: 'QRIS_Soto_Lamongan.png'
  },
  pusat: {
    id: 'pusat',
    name: 'Jus Smoothies Cipadung',
    emoji: '🍹',
    city: 'Janji Jawa (Pusat) • Master Grab (NMID: ID1025433207095)',
    qrisImg: '/qris_pempekbandung.png',
    qrisTitle: 'Poster Master QRIS Grab (Janji Jawa)',
    qrisMerchant: 'BAKSO / JUS SMOOTHIES',
    downloadName: 'QRIS_Master_Grab.png'
  }
};

let currentActiveStore = 'pempek';
let audioUnlocked = false;
let isInitialSyncDone = false;
const knownTxIds = new Set();
const spokenTxIds = new Set();
const speechQueue = [];
let isSpeechBusy = false;

// ==============================================================================
// 2. DOM ELEMENTS
// ==============================================================================

const branchTabs = document.getElementById('branchTabs');
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
const qrisImage = document.getElementById('qrisImage');
const qrisMerchantName = document.getElementById('qrisMerchantName');
const btnDownloadQR = document.getElementById('btnDownloadQR');
const btnQuickTest = document.getElementById('btnQuickTest');

const btnUnlockAudio = document.getElementById('btnUnlockAudio');
const audioBtnText = document.getElementById('audioBtnText');
const voiceSelect = document.getElementById('voiceSelect');
const btnTestVoice = document.getElementById('btnTestVoice');
const btnHeaderSimulate = document.getElementById('btnHeaderSimulate');

const grabStatusBadge = document.getElementById('grabStatusBadge');
const grabStoreName = document.getElementById('grabStoreName');
const grabStoreId = document.getElementById('grabStoreId');
const cbGrabAutoPoll = document.getElementById('cbGrabAutoPoll');
const grabPollStatusText = document.getElementById('grabPollStatusText');
const btnCheckGrabMutasi = document.getElementById('btnCheckGrabMutasi');
const transactionFeed = document.getElementById('transactionFeed');
const emptyFeedState = document.getElementById('emptyFeedState');

// ==============================================================================
// 3. AUDIO SYNTHESIS & SPEECH ENGINE
// ==============================================================================

function playChimeBell() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    function playNote(freq, start, duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    }

    const t = ctx.currentTime;
    playNote(587.33, t, 0.25);       // D5
    playNote(880.00, t + 0.12, 0.4); // A5
  } catch (e) {}
}

function angkaKeTeks(n) {
  n = Math.abs(parseInt(n, 10)) || 0;
  if (n === 0) return 'nol';

  const angka = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

  if (n < 12) return angka[n];
  if (n < 20) return angkaKeTeks(n - 10) + ' belas';
  if (n < 100) return angkaKeTeks(Math.floor(n / 10)) + ' puluh' + (n % 10 !== 0 ? ' ' + angkaKeTeks(n % 10) : '');
  if (n < 200) return 'seratus' + (n % 100 !== 0 ? ' ' + angkaKeTeks(n % 100) : '');
  if (n < 1000) return angkaKeTeks(Math.floor(n / 100)) + ' ratus' + (n % 100 !== 0 ? ' ' + angkaKeTeks(n % 100) : '');
  if (n < 2000) return 'seribu' + (n % 1000 !== 0 ? ' ' + angkaKeTeks(n % 1000) : '');
  if (n < 1000000) return angkaKeTeks(Math.floor(n / 1000)) + ' ribu' + (n % 1000 !== 0 ? ' ' + angkaKeTeks(n % 1000) : '');
  if (n < 1000000000) return angkaKeTeks(Math.floor(n / 1000000)) + ' juta' + (n % 1000000 !== 0 ? ' ' + angkaKeTeks(n % 1000000) : '');
  return n.toLocaleString('id-ID');
}

function speakAnnouncement(amount, storeName, callback) {
  playChimeBell();

  setTimeout(() => {
    if (!('speechSynthesis' in window)) {
      if (callback) callback();
      return;
    }

    window.speechSynthesis.cancel();

    const terbilang = angkaKeTeks(amount);
    const storeLabel = storeName ? `${storeName}, ` : '';
    const kalimat = `Pembayaran QRIS untuk ${storeLabel}sebesar ${terbilang} rupiah, berhasil diterima.`;

    const utter = new SpeechSynthesisUtterance(kalimat);
    utter.lang = 'id-ID';

    const profile = voiceSelect ? voiceSelect.value : 'natural_female';
    if (profile === 'cheerful_female') {
      utter.rate = 0.98;
      utter.pitch = 1.12;
    } else if (profile === 'gentle_male') {
      utter.rate = 0.90;
      utter.pitch = 0.92;
    } else {
      utter.rate = 0.92;
      utter.pitch = 1.04;
    }

    utter.onend = () => { if (callback) callback(); };
    utter.onerror = () => { if (callback) callback(); };

    window.speechSynthesis.speak(utter);
  }, 350);
}

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
  if (spokenTxIds.has(uniqueKey)) return;
  spokenTxIds.add(uniqueKey);

  speechQueue.push({
    storeId: tx.storeId || 'pempek',
    storeName: tx.storeName || STORES[tx.storeId]?.name || 'Pempek Bandung',
    amount: tx.amount
  });

  processSpeechQueue();
}

// ==============================================================================
// 4. ANIMATIONS & UI UPDATES
// ==============================================================================

function triggerSoundboxAnimation(storeId) {
  if (speakerGrill) speakerGrill.classList.add('active');
  const miniBox = document.getElementById(`miniBox${capitalize(storeId)}`);
  if (miniBox) miniBox.classList.add('active-pulse');
}

function stopSoundboxAnimation(storeId) {
  if (speakerGrill) speakerGrill.classList.remove('active');
  const miniBox = document.getElementById(`miniBox${capitalize(storeId)}`);
  if (miniBox) miniBox.classList.remove('active-pulse');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function updateSoundboxLED(amount, storeId, storeName) {
  const formatted = `Rp ${Number(amount).toLocaleString('id-ID')}`;
  if (displayAmount) displayAmount.textContent = formatted;
  if (displayInfo) displayInfo.textContent = `Pembayaran QRIS ${storeName} Berhasil!`;
  if (ledStoreTag) ledStoreTag.textContent = `KASIR ${storeName.toUpperCase()}`;

  const miniAmount = document.getElementById(`miniAmount${capitalize(storeId)}`);
  const miniInfo = document.getElementById(`miniInfo${capitalize(storeId)}`);
  if (miniAmount) miniAmount.textContent = formatted;
  if (miniInfo) miniInfo.textContent = 'Lunas via QRIS Grab';

  setTimeout(() => {
    if (displayAmount && displayAmount.textContent === formatted) {
      displayAmount.textContent = 'STANDBY';
      displayInfo.textContent = 'Menunggu pembayaran QRIS dari pembeli...';
    }
  }, 12000);
}

function addTransactionToFeed(tx) {
  if (emptyFeedState) emptyFeedState.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'feed-item';
  const time = tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString('id-ID') : new Date().toLocaleTimeString('id-ID');

  row.innerHTML = `
    <div class="feed-item-left">
      <div class="feed-icon">🟢</div>
      <div class="feed-info">
        <strong>${tx.storeName || 'Pempek Bandung'}</strong>
        <small>${tx.payer || 'GrabPay / OVO QRIS'} • ID: ${tx.transactionId || tx.id}</small>
      </div>
    </div>
    <div class="feed-item-right">
      <span class="feed-amount">+Rp ${Number(tx.amount).toLocaleString('id-ID')}</span>
      <span class="feed-time">${time}</span>
    </div>
  `;

  if (transactionFeed) {
    transactionFeed.insertBefore(row, transactionFeed.firstChild);
  }
}

// ==============================================================================
// 5. STORE SWITCHING
// ==============================================================================

function selectStore(storeId) {
  currentActiveStore = storeId;

  document.querySelectorAll('.branch-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-store') === storeId);
  });

  if (storeId === 'all') {
    if (singleSoundboxView) singleSoundboxView.style.display = 'none';
    if (multiSoundboxView) multiSoundboxView.style.display = 'block';
  } else {
    if (singleSoundboxView) singleSoundboxView.style.display = 'block';
    if (multiSoundboxView) multiSoundboxView.style.display = 'none';

    const s = STORES[storeId] || STORES.pempek;
    if (storeBadgeIcon) storeBadgeIcon.textContent = s.emoji;
    if (storeBadgeName) storeBadgeName.textContent = s.name;
    if (storeBadgeCity) storeBadgeCity.textContent = s.city;
    if (ledStoreTag) ledStoreTag.textContent = `KASIR ${s.name.toUpperCase()}`;

    if (qrisCardTitle) qrisCardTitle.textContent = s.qrisTitle;
    if (qrisImage) qrisImage.src = s.qrisImg;
    if (qrisMerchantName) qrisMerchantName.textContent = s.qrisMerchant;
    if (btnDownloadQR) {
      btnDownloadQR.href = s.qrisImg;
      btnDownloadQR.setAttribute('download', s.downloadName);
    }
  }
}

if (branchTabs) {
  branchTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.branch-tab');
    if (!btn) return;
    const storeId = btn.getAttribute('data-store');
    if (storeId) selectStore(storeId);
  });
}

// ==============================================================================
// 6. AUDIO UNLOCK HANDLERS (Permanent on user touch/click)
// ==============================================================================

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  playChimeBell();
  if ('speechSynthesis' in window) {
    const silent = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(silent);
  }

  if (btnUnlockAudio) btnUnlockAudio.classList.add('unlocked');
  if (audioBtnText) audioBtnText.textContent = 'SUARA SOUNDBOX SUDAH AKTIF ✅';
}

if (btnUnlockAudio) btnUnlockAudio.addEventListener('click', unlockAudio);
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

if (btnTestVoice) {
  btnTestVoice.addEventListener('click', () => {
    unlockAudio();
    const currentStore = currentActiveStore === 'all' ? 'pempek' : currentActiveStore;
    speakAnnouncement(15000, STORES[currentStore]?.name || 'Pempek Bandung');
  });
}

if (btnHeaderSimulate || btnQuickTest) {
  const handler = () => {
    unlockAudio();
    const currentStore = currentActiveStore === 'all' ? 'pempek' : currentActiveStore;
    const storeName = STORES[currentStore]?.name || 'Pempek Bandung';
    const amount = 15000;
    const tx = {
      id: `SIM-${Date.now()}`,
      transactionId: `SIM-${Date.now()}`,
      amount,
      storeId: currentStore,
      storeName,
      payer: 'Pembeli (Simulasi)',
      timestamp: new Date().toISOString()
    };
    updateSoundboxLED(amount, currentStore, storeName);
    addTransactionToFeed(tx);
    queueAnnouncement(tx);
  };

  if (btnHeaderSimulate) btnHeaderSimulate.addEventListener('click', handler);
  if (btnQuickTest) btnQuickTest.addEventListener('click', handler);
}

document.querySelectorAll('.btn-mini-test').forEach(btn => {
  btn.addEventListener('click', (e) => {
    unlockAudio();
    const storeId = e.currentTarget.getAttribute('data-store');
    const amount = parseInt(e.currentTarget.getAttribute('data-amount'), 10) || 15000;
    const storeName = STORES[storeId]?.name || 'Pempek Bandung';
    const tx = {
      id: `SIM-${Date.now()}`,
      transactionId: `SIM-${Date.now()}`,
      amount,
      storeId,
      storeName,
      payer: 'Pembeli (Simulasi)',
      timestamp: new Date().toISOString()
    };
    updateSoundboxLED(amount, storeId, storeName);
    addTransactionToFeed(tx);
    queueAnnouncement(tx);
  });
});

// ==============================================================================
// 7. GRABMERCHANT REAL-TIME POLLER (Anti-Miss, Anti-Double Guaranteed)
// ==============================================================================

async function startGrabPolling() {
  async function poll() {
    if (!cbGrabAutoPoll || !cbGrabAutoPoll.checked) {
      setTimeout(poll, 3000);
      return;
    }

    try {
      const res = await fetch('/api/grab/poll');
      const data = await res.json();

      if (data.success && Array.isArray(data.transactions)) {
        if (!isInitialSyncDone) {
          // On first page load: record all current history into knownTxIds so we don't spam audio for past transactions
          data.transactions.forEach(tx => {
            if (tx.id) knownTxIds.add(String(tx.id));
          });
          isInitialSyncDone = true;

          // Populate the feed with recent transactions
          data.transactions.slice(0, 8).forEach(tx => {
            addTransactionToFeed({
              id: tx.id,
              transactionId: tx.id,
              amount: tx.amount,
              storeId: currentActiveStore === 'all' ? 'pempek' : currentActiveStore,
              storeName: STORES[currentActiveStore === 'all' ? 'pempek' : currentActiveStore]?.name || 'Pempek Bandung',
              payer: 'GrabPay / OVO QRIS',
              timestamp: tx.created_at
            });
          });
        } else {
          // Subsequent polls: check for genuinely new transactions!
          const newTxList = data.transactions.filter(tx => tx.id && !knownTxIds.has(String(tx.id)));

          // Process in chronological order (oldest to newest)
          newTxList.reverse().forEach(tx => {
            knownTxIds.add(String(tx.id));

            const storeKey = currentActiveStore === 'all' ? 'pempek' : currentActiveStore;
            const storeName = STORES[storeKey]?.name || 'Pempek Bandung';

            const payload = {
              id: tx.id,
              transactionId: tx.id,
              amount: tx.amount,
              storeId: storeKey,
              storeName: storeName,
              payer: 'GrabPay / OVO QRIS',
              timestamp: tx.created_at || new Date().toISOString()
            };

            updateSoundboxLED(tx.amount, storeKey, storeName);
            addTransactionToFeed(payload);
            queueAnnouncement(payload);
          });
        }

        if (grabPollStatusText) {
          const timeStr = new Date().toLocaleTimeString('id-ID');
          grabPollStatusText.textContent = `🟢 Memantau transaksi Grab (Terakhir dicek: ${timeStr})`;
        }
      }
    } catch (err) {
      if (grabPollStatusText) {
        grabPollStatusText.textContent = 'Menghubungkan ke server Grab...';
      }
    } finally {
      setTimeout(poll, 3000);
    }
  }

  poll();
}

if (btnCheckGrabMutasi) {
  btnCheckGrabMutasi.addEventListener('click', async () => {
    btnCheckGrabMutasi.disabled = true;
    btnCheckGrabMutasi.textContent = 'Menarik mutasi...';
    try {
      const res = await fetch('/api/grab/transactions');
      const data = await res.json();
      if (data.success && data.data?.transactions) {
        alert(`✅ Berhasil mengambil ${data.data.transactions.length} transaksi GrabMerchant terbaru!`);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      btnCheckGrabMutasi.disabled = false;
      btnCheckGrabMutasi.textContent = 'Tarik Mutasi Grab Sekarang 🔄';
    }
  });
}

// Initial start
startGrabPolling();
