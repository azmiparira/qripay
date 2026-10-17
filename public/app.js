// State Management
let audioContext = null;
let isAudioActivated = false;
let eventSource = null;
let isSpeaking = false;
const speechQueue = [];

// DOM Elements
const connectionBadge = document.getElementById('connectionBadge');
const connectionText = document.getElementById('connectionText');
const apiStatusPill = document.getElementById('apiStatusPill');
const apiStatusText = document.getElementById('apiStatusText');
const btnToggleAudio = document.getElementById('btnToggleAudio');
const audioStatusText = document.getElementById('audioStatusText');
const speakerGrill = document.getElementById('speakerGrill');
const displayAmount = document.getElementById('displayAmount');
const displayInfo = document.getElementById('displayInfo');
const transactionList = document.getElementById('transactionList');
const emptyState = document.getElementById('emptyState');
const templateSelect = document.getElementById('templateSelect');
const speechRate = document.getElementById('speechRate');
const rateVal = document.getElementById('rateVal');
const chimeToggle = document.getElementById('chimeToggle');
const webhookUrlDisplay = document.getElementById('webhookUrlDisplay');
const btnCopyWebhook = document.getElementById('btnCopyWebhook');
const btnClearFeed = document.getElementById('btnClearFeed');
const btnRefreshLogs = document.getElementById('btnRefreshLogs');
const rawLogsPreview = document.getElementById('rawLogsPreview');
const customSimAmount = document.getElementById('customSimAmount');
const btnRunSim = document.getElementById('btnRunSim');

// Set Webhook URL in guide based on current origin
if (webhookUrlDisplay) {
  webhookUrlDisplay.textContent = `${window.location.origin}/webhook`;
}

// 1. Angka ke Terbilang Bahasa Indonesia
function terbilang(nominal) {
  const bilangan = [
    '', 'satu', 'dua', 'tiga', 'empat', 'lima',
    'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'
  ];

  nominal = Math.floor(Math.abs(nominal));

  if (nominal < 12) {
    return bilangan[nominal];
  } else if (nominal < 20) {
    return terbilang(nominal - 10) + ' belas';
  } else if (nominal < 100) {
    return terbilang(Math.floor(nominal / 10)) + ' puluh ' + terbilang(nominal % 10);
  } else if (nominal < 200) {
    return 'seratus ' + terbilang(nominal - 100);
  } else if (nominal < 1000) {
    return terbilang(Math.floor(nominal / 100)) + ' ratus ' + terbilang(nominal % 100);
  } else if (nominal < 2000) {
    return 'seribu ' + terbilang(nominal - 1000);
  } else if (nominal < 1000000) {
    return terbilang(Math.floor(nominal / 1000)) + ' ribu ' + terbilang(nominal % 1000);
  } else if (nominal < 1000000000) {
    return terbilang(Math.floor(nominal / 1000000)) + ' juta ' + terbilang(nominal % 1000000);
  } else if (nominal < 1000000000000) {
    return terbilang(Math.floor(nominal / 1000000000)) + ' miliar ' + terbilang(nominal % 1000000000);
  }
  return nominal.toString();
}

// 2. Web Audio API Chime (Nada bel kasir digital modern)
function playCashChime() {
  return new Promise((resolve) => {
    if (!chimeToggle.checked) return resolve();

    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const now = audioContext.currentTime;

      // Note 1: High crisp chime (A5 -> E6)
      const osc1 = audioContext.createOscillator();
      const gain1 = audioContext.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(audioContext.destination);

      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: Harmonious resonance (A6)
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, now + 0.12);
      gain2.gain.setValueAtTime(0.35, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc2.connect(gain2);
      gain2.connect(audioContext.destination);

      osc2.start(now + 0.12);
      osc2.stop(now + 0.65);

      setTimeout(resolve, 500);
    } catch (e) {
      console.warn('Audio chime error:', e);
      resolve();
    }
  });
}

// 3. Text to Speech Engine (Bahasa Indonesia)
function speakPaymentText(amount, customMessage) {
  return new Promise(async (resolve) => {
    if (!('speechSynthesis' in window)) {
      alert('Browser Anda tidak mendukung Web Speech API.');
      return resolve();
    }

    // Play chime first
    await playCashChime();

    // Visual speaker ripple animation
    speakerGrill.classList.add('playing');

    let textToSpeak = '';
    if (customMessage) {
      textToSpeak = customMessage;
    } else {
      const amountWords = terbilang(amount).trim();
      const tmpl = templateSelect.value;

      if (tmpl === 'standard') {
        textToSpeak = `${amountWords} rupiah, pembayaran QRIS berhasil diterima.`;
      } else if (tmpl === 'simple') {
        textToSpeak = `${amountWords} rupiah, uang masuk.`;
      } else if (tmpl === 'kasir') {
        textToSpeak = `${amountWords} rupiah, pembayaran QRIS sukses. Terima kasih.`;
      } else if (tmpl === 'short') {
        textToSpeak = `${amountWords} rupiah berhasil diterima.`;
      }
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'id-ID';
    utterance.rate = parseFloat(speechRate.value) || 1.0;
    utterance.pitch = 1.0;

    // Pick Indonesian voice if available
    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID'));
    if (idVoice) {
      utterance.voice = idVoice;
    }

    utterance.onend = () => {
      speakerGrill.classList.remove('playing');
      resolve();
    };

    utterance.onerror = (err) => {
      console.warn('Speech error:', err);
      speakerGrill.classList.remove('playing');
      resolve();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

// Process Speech Queue
async function processSpeechQueue() {
  if (isSpeaking || speechQueue.length === 0) return;
  isSpeaking = true;
  const nextItem = speechQueue.shift();
  try {
    await speakPaymentText(nextItem.amount, nextItem.customMessage);
  } finally {
    isSpeaking = false;
    processSpeechQueue();
  }
}

function queueSpeech(amount, customMessage) {
  if (!isAudioActivated) {
    console.log('Audio belum diaktifkan pengguna.');
    return;
  }
  speechQueue.push({ amount, customMessage });
  processSpeechQueue();
}

// 4. Activate Audio Button (Bypass Autoplay Policy)
function activateAudio() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const dummy = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(dummy);

    isAudioActivated = true;
    btnToggleAudio.classList.add('active');
    btnToggleAudio.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>Soundbox Aktif & Siap Berbunyi</span>
    `;

    // Test greeting sound
    speakPaymentText(10000);
  } catch (err) {
    console.error('Error activating audio:', err);
  }
}

btnToggleAudio.addEventListener('click', activateAudio);

// 5. Connect to SSE Stream from Server
function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/events');

  eventSource.onopen = () => {
    connectionBadge.className = 'status-pill status-connected';
    connectionText.textContent = 'Soundbox Online';
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'CONNECTED') {
        console.log('📡 SSE Connected. Merchant:', data.merchant);
      } else if (data.type === 'PAYMENT') {
        handleIncomingPayment(data);
      } else if (data.type === 'PAYMENT_TEST') {
        handleIncomingTestWebhook(data);
      }
    } catch (err) {
      console.error('SSE JSON error:', err);
    }
  };

  eventSource.onerror = () => {
    connectionBadge.className = 'status-pill status-connected';
    connectionText.textContent = 'Soundbox Aktif (Polling)';
    setTimeout(connectSSE, 5000);
  };
}

// 5b. Polling Fallback (Ensures compatibility with Vercel Serverless)
let lastKnownTxIds = new Set();
async function pollHistoryFallback() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (data.history && data.history.length > 0) {
      if (lastKnownTxIds.size === 0) {
        data.history.forEach(tx => lastKnownTxIds.add(tx.trxId));
      } else {
        // Find new transactions that were not seen
        for (const tx of data.history) {
          if (!lastKnownTxIds.has(tx.trxId)) {
            lastKnownTxIds.add(tx.trxId);
            handleIncomingPayment(tx);
          }
        }
      }
    }
  } catch (err) {}
}
setInterval(pollHistoryFallback, 3000);

// Handle Incoming Real Payment
function handleIncomingPayment(payment) {
  const formattedAmount = 'Rp ' + Number(payment.amount).toLocaleString('id-ID');
  
  displayAmount.textContent = formattedAmount;
  displayInfo.textContent = `Sukses • ${payment.payer || 'QRIS ShopeePay'} • ${new Date(payment.timestamp).toLocaleTimeString('id-ID')}`;

  queueSpeech(payment.amount);
  addTransactionToUI(payment);
}

// Handle Test Webhook
function handleIncomingTestWebhook(testData) {
  displayAmount.textContent = 'Rp 10.000';
  displayInfo.textContent = `🧪 Tes Webhook PayKita Berhasil • ${new Date().toLocaleTimeString('id-ID')}`;
  
  queueSpeech(10000, 'Tes Webhook dari PayKita berhasil diterima.');
  addTransactionToUI({
    amount: 10000,
    payer: 'Tes Webhook PayKita',
    trxId: 'TEST-WEBHOOK',
    timestamp: testData.timestamp
  });
}

// Add transaction row to Live Feed
function addTransactionToUI(tx) {
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  const timeStr = new Date(tx.timestamp || Date.now()).toLocaleTimeString('id-ID');
  const item = document.createElement('div');
  item.className = 'tx-item';
  item.innerHTML = `
    <div class="tx-left">
      <div class="tx-icon-qris">QRIS</div>
      <div>
        <div class="tx-payer">${tx.payer || 'Pembeli QRIS'}</div>
        <div class="tx-meta">${tx.trxId || 'TRX'} • ${timeStr}</div>
      </div>
    </div>
    <div class="tx-right">
      <div class="tx-amount">+Rp ${Number(tx.amount).toLocaleString('id-ID')}</div>
      <span class="tx-badge">BERHASIL</span>
    </div>
  `;

  transactionList.insertBefore(item, transactionList.firstChild);
}

// 6. Test / Simulation Trigger
async function triggerSimulation(amount) {
  if (!isAudioActivated) {
    activateAudio();
  }

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        amount: parseInt(amount, 10),
        payer: 'Pembeli QRIS (ShopeePay)'
      })
    });
    const result = await res.json();
    console.log('Simulated:', result);
  } catch (err) {
    console.error('Simulation error:', err);
  }
}

// Quick amount chips
document.querySelectorAll('.btn-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const amt = btn.getAttribute('data-amount');
    triggerSimulation(amt);
  });
});

// Custom simulation button
btnRunSim.addEventListener('click', () => {
  const val = customSimAmount.value || 10000;
  triggerSimulation(val);
});

// Clear Feed
btnClearFeed.addEventListener('click', () => {
  transactionList.innerHTML = `
    <div class="empty-state" id="emptyState">
      <div class="empty-icon">💸</div>
      <p>Belum ada pembayaran masuk</p>
      <span>Scan QRIS Jus Smoothies atau gunakan tombol simulasi</span>
    </div>
  `;
});

// Copy Webhook Button
btnCopyWebhook.addEventListener('click', () => {
  const text = webhookUrlDisplay.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnCopyWebhook.textContent;
    btnCopyWebhook.textContent = 'Tersalin!';
    btnCopyWebhook.style.background = '#10B981';
    btnCopyWebhook.style.color = '#FFFFFF';
    setTimeout(() => {
      btnCopyWebhook.textContent = orig;
      btnCopyWebhook.style.background = '';
      btnCopyWebhook.style.color = '';
    }, 2000);
  });
});

// Speech Rate label
speechRate.addEventListener('input', () => {
  rateVal.textContent = parseFloat(speechRate.value).toFixed(1) + 'x';
});

// Fetch raw webhook logs
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    if (data.logs && data.logs.length > 0) {
      rawLogsPreview.textContent = JSON.stringify(data.logs[0], null, 2);
    } else {
      rawLogsPreview.textContent = 'Belum ada payload webhook masuk dari PayKita.';
    }
  } catch (e) {
    rawLogsPreview.textContent = 'Gagal memuat log.';
  }
}

btnRefreshLogs.addEventListener('click', fetchLogs);

// Check PayKita Live API status on startup
async function checkPayKitaStatus() {
  try {
    const res = await fetch('/api/paykita/status');
    const data = await res.json();
    if (data.success) {
      apiStatusPill.className = 'api-status-pill online';
      apiStatusText.textContent = 'PayKita API: Aktif';
    } else {
      apiStatusText.textContent = 'PayKita API: Offline';
    }
  } catch (err) {
    apiStatusText.textContent = 'PayKita API: Terhubung';
  }
}

// Initialize
connectSSE();
checkPayKitaStatus();

// Pre-load voices
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
