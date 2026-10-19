/**
 * QRIPAY Soundbox - Client Engine
 * - Web Audio API Chime Bell Synthesizer
 * - Indonesian Web Speech Synthesis
 * - Realtime Polling & SSE Integration
 */

let audioUnlocked = false;
let audioCtx = null;
let lastProcessedId = Date.now();
const processedIds = new Set();

// Elements
const btnUnlockAudio = document.getElementById('btnUnlockAudio');
const audioBtnText = document.getElementById('audioBtnText');
const displayAmount = document.getElementById('displayAmount');
const displayInfo = document.getElementById('displayInfo');
const speakerGrill = document.getElementById('speakerGrill');
const transactionList = document.getElementById('transactionList');
const emptyState = document.getElementById('emptyState');
const btnCopyWebhook = document.getElementById('btnCopyWebhook');
const webhookUrlText = document.getElementById('webhookUrlText');
const btnSimulate = document.getElementById('btnSimulate');
const customAmountInput = document.getElementById('customAmount');
const btnClearHistory = document.getElementById('btnClearHistory');
const qrisFileInput = document.getElementById('qrisFileInput');
const qrisImage = document.getElementById('qrisImage');

// Dynamically set webhook URL to current origin
const currentOrigin = window.location.origin;
if (currentOrigin && !currentOrigin.startsWith('file://')) {
  webhookUrlText.textContent = `${currentOrigin}/api/webhook`;
  const directLink = document.getElementById('directTestLink');
  if (directLink) {
    directLink.href = `${currentOrigin}/api/webhook?amount=20000&payer=BCA`;
  }
}

/**
 * 1. Convert Number to Indonesian Spoken Words
 */
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

/**
 * 2. Synthesize Crisp Dual-Tone Cash Chime Bell (Web Audio API)
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
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    // Tone 2: 880 Hz (A5) - Ding Dong effect
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.4, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.9);
  } catch (e) {
    console.warn('Audio chime warning:', e);
  }
}

/**
 * 3. Speak Indonesian Announcement
 */
function speakAnnouncement(amount, payer) {
  // Visual Speaker Pulse
  speakerGrill.classList.add('active');
  
  // Play Ding Dong Chime
  playChimeBell();

  // Speak voice after chime
  setTimeout(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop previous

      const terbilang = angkaKeTeks(amount);
      const kalimat = `Pembayaran QRIS sebesar ${terbilang} rupiah berhasil diterima.`;
      
      const utter = new SpeechSynthesisUtterance(kalimat);
      utter.lang = 'id-ID';
      utter.rate = 1.0;
      utter.pitch = 1.0;

      // Select Indonesian voice if available
      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find(v => v.lang.startsWith('id') || v.lang.includes('ID'));
      if (idVoice) utter.voice = idVoice;

      utter.onend = () => {
        speakerGrill.classList.remove('active');
      };
      utter.onerror = () => {
        speakerGrill.classList.remove('active');
      };

      window.speechSynthesis.speak(utter);
    } else {
      setTimeout(() => speakerGrill.classList.remove('active'), 1500);
    }
  }, 350);
}

/**
 * 4. Process Incoming Payment Event
 */
function handlePaymentEvent(tx) {
  if (!tx || !tx.amount) return;
  if (processedIds.has(tx.id)) return;
  processedIds.add(tx.id);

  // Update LED Display
  displayAmount.textContent = `Rp ${Number(tx.amount).toLocaleString('id-ID')}`;
  displayInfo.textContent = `LUNAS via ${tx.payer || 'QRIS'} • ${new Date(tx.timestamp).toLocaleTimeString('id-ID')}`;

  // Voice Announcement
  speakAnnouncement(tx.amount, tx.payer);

  // Add to Feed UI
  addTransactionToFeed(tx);

  // Reset LED display back to STANDBY after 12 seconds
  setTimeout(() => {
    if (displayAmount.textContent === `Rp ${Number(tx.amount).toLocaleString('id-ID')}`) {
      displayAmount.textContent = 'STANDBY';
      displayInfo.textContent = 'Menunggu pembayaran QRIS dari pembeli...';
    }
  }, 12000);
}

/**
 * 5. Add Transaction Item to Feed List
 */
function addTransactionToFeed(tx) {
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  const item = document.createElement('div');
  item.className = 'tx-item';
  const time = new Date(tx.timestamp).toLocaleTimeString('id-ID');
  
  item.innerHTML = `
    <div class="tx-left">
      <span class="tx-payer">${tx.payer || 'Pembeli QRIS'}</span>
      <span class="tx-meta">Pukul ${time} • ${tx.source || 'Shopee Partner'}</span>
    </div>
    <div class="tx-amount">+Rp ${Number(tx.amount).toLocaleString('id-ID')}</div>
  `;

  transactionList.insertBefore(item, transactionList.firstChild);
}

/**
 * 6. Audio Unlocker (Bypass Autoplay Policy)
 */
function unlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // Speak a silent short test
  if ('speechSynthesis' in window) {
    const silentTest = new SpeechSynthesisUtterance('Soundbox siap');
    silentTest.lang = 'id-ID';
    silentTest.volume = 0.5;
    window.speechSynthesis.speak(silentTest);
  }

  audioUnlocked = true;
  btnUnlockAudio.classList.add('unlocked');
  audioBtnText.textContent = 'SUARA SOUNDBOX SUDAH AKTIF ✅';
}

btnUnlockAudio.addEventListener('click', unlockAudio);

/**
 * 7. Realtime Polling Loop (/api/poll) - Guaranteed on Vercel Serverless
 */
async function pollTransactions() {
  try {
    const res = await fetch(`/api/poll?since=${lastProcessedId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.hasNew && Array.isArray(data.events)) {
        // Process new events from oldest to newest
        data.events.reverse().forEach(ev => {
          handlePaymentEvent(ev);
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
    // Silent network retry
  } finally {
    setTimeout(pollTransactions, 1500);
  }
}

// Start polling
pollTransactions();

/**
 * 8. Quick Simulation Triggers
 */
document.querySelectorAll('.chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = btn.getAttribute('data-amount');
    triggerSimulation(amount);
  });
});

btnSimulate.addEventListener('click', () => {
  const val = customAmountInput.value || 15000;
  triggerSimulation(val);
});

async function triggerSimulation(amount) {
  if (!audioUnlocked) unlockAudio();
  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, payer: 'Tes Pembeli QRIS' })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.transaction) {
        handlePaymentEvent(json.transaction);
      }
    }
  } catch (e) {
    // Fallback direct local simulation
    handlePaymentEvent({
      id: Date.now(),
      amount: parseInt(amount, 10),
      payer: 'Tes Suara Mandiri',
      source: 'Simulasi Lokal',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * 9. Copy Webhook URL Button
 */
btnCopyWebhook.addEventListener('click', () => {
  const text = webhookUrlText.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnCopyWebhook.textContent;
    btnCopyWebhook.textContent = 'Tersalin! ✅';
    setTimeout(() => btnCopyWebhook.textContent = orig, 2000);
  }).catch(() => {
    prompt('Salin URL Webhook berikut:', text);
  });
});

/**
 * 10. Clear History
 */
btnClearHistory.addEventListener('click', () => {
  transactionList.innerHTML = '';
  if (emptyState) {
    emptyState.style.display = 'block';
    transactionList.appendChild(emptyState);
  }
});

/**
 * 11. Custom QRIS File Upload Preview
 */
qrisFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      qrisImage.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
});

// Load Voices on Startup
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
