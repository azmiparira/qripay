/**
 * QriPay Soundbox — GrabMerchant Official Gateway Engine
 * Features: High-Reliability Audio Queue, Chrome GC Protection, Live Polling
 */

// ==============================================================================
// 1. STORE REGISTRY
// ==============================================================================

const STORES = {
  pempek: {
    id: 'pempek',
    name: 'Pempek Bandung',
    emoji: '🥘',
    qrisImg: '/qris_pempekbandung.png',
    qrisTitle: 'QRIS Pempek Bandung',
    qrisStoreName: 'PEMPEK BANDUNG',
    downloadName: 'QRIS_Pempek_Bandung.png'
  },
  batagor: {
    id: 'batagor',
    name: 'Batagor Bandung',
    emoji: '🥟',
    qrisImg: '/qris_batagorbandung.png',
    qrisTitle: 'QRIS Batagor Bandung',
    qrisStoreName: 'BATAGOR BANDUNG',
    downloadName: 'QRIS_Batagor_Bandung.png'
  },
  soto: {
    id: 'soto',
    name: 'Soto Lamongan',
    emoji: '🍲',
    qrisImg: '/qris_sotolamongan.png',
    qrisTitle: 'QRIS Soto Lamongan',
    qrisStoreName: 'SOTO LAMONGAN',
    downloadName: 'QRIS_Soto_Lamongan.png'
  },
  pusat: {
    id: 'pusat',
    name: 'Jus Smoothies Cipadung',
    emoji: '🍹',
    qrisImg: '/qris_pempekbandung.png',
    qrisTitle: 'Master QRIS Grab (Janji Jawa)',
    qrisStoreName: 'BAKSO / JUS SMOOTHIES',
    downloadName: 'QRIS_Master_Grab.png'
  }
};

let currentStoreKey = 'pempek';
let audioUnlocked = false;
let isInitialSyncDone = false;

// Transaction tracking (persisted in localStorage to prevent repeat announcements)
const STORAGE_KEY = 'qripay_announced_grab_tx_ids';
let announcedTxIds = new Set();
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) announcedTxIds = new Set(JSON.parse(saved));
} catch (e) {}

function saveAnnouncedTxIds() {
  try {
    const arr = Array.from(announcedTxIds).slice(-200); // keep last 200 IDs
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {}
}

// ==============================================================================
// 2. DOM ELEMENTS
// ==============================================================================

const btnAudioToggle = document.getElementById('btnAudioToggle');
const audioStatusLabel = document.getElementById('audioStatusLabel');
const voicePreset = document.getElementById('voicePreset');
const btnTestAudio = document.getElementById('btnTestAudio');

const screenStoreLabel = document.getElementById('screenStoreLabel');
const screenAmount = document.getElementById('screenAmount');
const screenStatus = document.getElementById('screenStatus');
const speakerGrill = document.getElementById('speakerGrill');

const qrisTitle = document.getElementById('qrisTitle');
const activeQrisImage = document.getElementById('activeQrisImage');
const qrisStoreName = document.getElementById('qrisStoreName');
const btnDownloadQris = document.getElementById('btnDownloadQris');

const feedList = document.getElementById('feedList');
const feedSubtitle = document.getElementById('feedSubtitle');
const btnManualRefresh = document.getElementById('btnManualRefresh');

// ==============================================================================
// 3. AUDIO ENGINE & SPEECH SYNTHESIS (GC-Protected)
// ==============================================================================

// Global references to prevent Chrome Garbage Collector from clipping audio
window._activeSpeechUtterance = null;
let speechQueue = [];
let isSpeakingNow = false;

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    function tone(freq, start, duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    }

    const t = ctx.currentTime;
    tone(587.33, t, 0.22);        // D5
    tone(880.00, t + 0.12, 0.38); // A5
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

/**
 * Exact speech wording requested:
 * "nominal + diterima + di + nama perusahaan"
 * Contoh: "Sepuluh rupiah diterima di Pempek Bandung"
 */
function speakAnnouncement(amount, storeName, callback) {
  playChime();

  setTimeout(() => {
    if (!('speechSynthesis' in window)) {
      if (callback) callback();
      return;
    }

    const nominalTeks = angkaKeTeks(amount);
    const kalimat = `${nominalTeks} rupiah diterima di ${storeName}`;

    const utter = new SpeechSynthesisUtterance(kalimat);
    window._activeSpeechUtterance = utter; // CRITICAL: Kept in window scope so V8 never GCs it mid-speech!

    utter.lang = 'id-ID';

    const preset = voicePreset ? voicePreset.value : 'natural';
    if (preset === 'cheerful') {
      utter.rate = 1.0;
      utter.pitch = 1.15;
    } else if (preset === 'male') {
      utter.rate = 0.92;
      utter.pitch = 0.90;
    } else {
      // Natural Female (Default)
      utter.rate = 0.94;
      utter.pitch = 1.05;
    }

    // Set Indonesian voice if available
    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find(v => v.lang === 'id-ID' || v.lang.startsWith('id'));
    if (idVoice) utter.voice = idVoice;

    utter.onend = () => {
      window._activeSpeechUtterance = null;
      if (callback) callback();
    };

    utter.onerror = () => {
      window._activeSpeechUtterance = null;
      if (callback) callback();
    };

    window.speechSynthesis.speak(utter);
  }, 300);
}

function processSpeechQueue() {
  if (isSpeakingNow || speechQueue.length === 0) return;
  isSpeakingNow = true;

  const item = speechQueue.shift();

  // Trigger hardware animations
  if (speakerGrill) speakerGrill.classList.add('active');
  updateDisplay(item.amount, item.storeName);

  speakAnnouncement(item.amount, item.storeName, () => {
    isSpeakingNow = false;
    if (speakerGrill) speakerGrill.classList.remove('active');
    setTimeout(processSpeechQueue, 350);
  });
}

function queueSpeech(amount, storeName) {
  speechQueue.push({ amount, storeName });
  processSpeechQueue();
}

// ==============================================================================
// 4. DISPLAY & HARDWARE LED UPDATES
// ==============================================================================

function updateDisplay(amount, storeName) {
  const formatted = `Rp ${Number(amount).toLocaleString('id-ID')}`;
  if (screenAmount) screenAmount.textContent = formatted;
  if (screenStatus) screenStatus.textContent = `Pembayaran Berhasil • ${storeName}`;
  if (screenStoreLabel) screenStoreLabel.textContent = storeName.toUpperCase();

  setTimeout(() => {
    if (screenAmount && screenAmount.textContent === formatted) {
      screenAmount.textContent = 'STANDBY';
      screenStatus.textContent = 'Siap menerima pembayaran QRIS';
      const s = STORES[currentStoreKey] || STORES.pempek;
      screenStoreLabel.textContent = s.name.toUpperCase();
    }
  }, 10000);
}

function addFeedRow(item, isNew = false) {
  const existing = document.getElementById(`tx-${item.id}`);
  if (existing) return;

  const row = document.createElement('div');
  row.className = 'feed-item';
  row.id = `tx-${item.id}`;

  const timeStr = item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID') : new Date().toLocaleTimeString('id-ID');

  row.innerHTML = `
    <div class="feed-item-left">
      <div class="feed-icon">🟢</div>
      <div class="feed-info">
        <strong>${item.storeName || STORES[currentStoreKey]?.name || 'Pempek Bandung'}</strong>
        <small>Trx ID: ${item.id} • ${item.type ? item.type.toUpperCase() : 'OVO'} QRIS</small>
      </div>
    </div>
    <div class="feed-item-right">
      <span class="feed-amount">+Rp ${Number(item.amount).toLocaleString('id-ID')}</span>
      <span class="feed-time">${timeStr}</span>
    </div>
  `;

  if (feedList) {
    feedList.insertBefore(row, feedList.firstChild);
  }
}

// ==============================================================================
// 5. STORE SELECTION
// ==============================================================================

function selectStore(key) {
  const s = STORES[key];
  if (!s) return;
  currentStoreKey = key;

  document.querySelectorAll('.store-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-store') === key);
  });

  if (screenStoreLabel) screenStoreLabel.textContent = s.name.toUpperCase();
  if (qrisTitle) qrisTitle.textContent = s.qrisTitle;
  if (activeQrisImage) activeQrisImage.src = s.qrisImg;
  if (qrisStoreName) qrisStoreName.textContent = s.qrisStoreName;
  if (btnDownloadQris) {
    btnDownloadQris.href = s.qrisImg;
    btnDownloadQris.setAttribute('download', s.downloadName);
  }
}

document.querySelectorAll('.store-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const key = tab.getAttribute('data-store');
    if (key) selectStore(key);
  });
});

// ==============================================================================
// 6. AUDIO UNLOCK & TEST BUTTONS
// ==============================================================================

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  playChime();
  if ('speechSynthesis' in window) {
    const s = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(s);
  }

  if (btnAudioToggle) {
    btnAudioToggle.classList.add('unlocked');
    if (audioStatusLabel) audioStatusLabel.textContent = 'Audio Aktif ✅';
  }
}

if (btnAudioToggle) btnAudioToggle.addEventListener('click', unlockAudio);
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

if (btnTestAudio) {
  btnTestAudio.addEventListener('click', () => {
    unlockAudio();
    const s = STORES[currentStoreKey] || STORES.pempek;
    queueSpeech(15000, s.name);
  });
}

document.querySelectorAll('.pill-test').forEach(pill => {
  pill.addEventListener('click', (e) => {
    unlockAudio();
    const amt = parseInt(e.currentTarget.getAttribute('data-amt'), 10) || 1000;
    const s = STORES[currentStoreKey] || STORES.pempek;
    queueSpeech(amt, s.name);
  });
});

// ==============================================================================
// 7. REAL-TIME GRAB POLLER
// ==============================================================================

async function fetchGrabPoll() {
  try {
    const res = await fetch('/api/grab/poll');
    const data = await res.json();

    if (data.success && Array.isArray(data.transactions)) {
      const s = STORES[currentStoreKey] || STORES.pempek;

      if (!isInitialSyncDone) {
        // First load: render recent transactions and store IDs
        data.transactions.forEach(tx => {
          if (tx.id) announcedTxIds.add(String(tx.id));
        });
        saveAnnouncedTxIds();
        isInitialSyncDone = true;

        data.transactions.slice(0, 10).forEach(tx => {
          addFeedRow({ ...tx, storeName: s.name });
        });
      } else {
        // Subsequent polls: check for genuinely new transactions
        const newItems = data.transactions.filter(tx => tx.id && !announcedTxIds.has(String(tx.id)));

        // Process oldest to newest
        newItems.reverse().forEach(tx => {
          announcedTxIds.add(String(tx.id));
          saveAnnouncedTxIds();

          const payload = {
            id: tx.id,
            amount: tx.amount,
            storeName: s.name,
            type: tx.type,
            created_at: tx.created_at
          };

          addFeedRow(payload, true);
          queueSpeech(tx.amount, s.name);
        });
      }

      if (feedSubtitle) {
        const time = new Date().toLocaleTimeString('id-ID');
        feedSubtitle.textContent = `🟢 Terhubung Grab (Update: ${time})`;
      }
    }
  } catch (err) {
    if (feedSubtitle) feedSubtitle.textContent = 'Menghubungkan ke Grab...';
  } finally {
    setTimeout(fetchGrabPoll, 3000);
  }
}

if (btnManualRefresh) {
  btnManualRefresh.addEventListener('click', async () => {
    btnManualRefresh.style.transform = 'rotate(180deg)';
    await fetchGrabPoll();
    setTimeout(() => { btnManualRefresh.style.transform = 'rotate(0deg)'; }, 400);
  });
}

// Start polling
fetchGrabPoll();
