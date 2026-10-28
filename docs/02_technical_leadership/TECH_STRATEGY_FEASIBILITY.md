# STRATEGI TEKNIK & ANALISIS KELAYAKAN
**Technical Strategy, Architecture Decisions, and Feasibility Analysis**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 02 (Technical Leadership)*

---

## 1. Analisis Trade-off Arsitektur Kunci

### A. Pemilihan Chipset Utama: ESP32-S3 vs ESP32-C3 SuperMini vs ESP8266

| Parameter Evaluasi | ESP8266 (NodeMCU) | ESP32-C3 SuperMini (RISC-V) | ESP32-S3 Dual-Core (Xtensa) |
| :--- | :--- | :--- | :--- |
| **Harga Per Unit** | ~Rp 18.000 | ~Rp 25.000 | ~Rp 45.000 – Rp 55.000 |
| **Arsitektur CPU** | 32-bit Single 80/160MHz | 32-bit RISC-V Single Core 160MHz | Dual-core LX7 240MHz + Vector ext |
| **Dukungan I2S Audio** | Sangat Terbatas (Hanya 1 DMA) | **Full Hardware I2S Controller** | **Dual I2S Controller + DSP Support** |
| **Kapasitas RAM / PSRAM** | 80KB (Sering OOM) | 400KB SRAM (Internal) | 512KB SRAM + 2MB/8MB PSRAM eksternal |
| **Konsumsi Baterai** | Tinggi (Proses fabrikasi 40nm) | **Sangat Hemat (22nm ULP node)** | Sedang (40nm) |
| **Dimensi Fisik** | 49 x 25 mm | **22.5 x 18 mm (SuperMini)** | 55 x 28 mm |
| **Rekomendasi Keputusan** | ❌ **DITOLAK** (Tidak stabil untuk streaming I2S) | ✅ **TERPILIH UNTUK PRODUKSI STANDAR (BUDGET KING)** | 🌟 **OPSI PREMIUM (HIGH-END BUFFERING & DISPLAY TFT)** |

> **Keputusan Strategis Tech Lead:** 
> Untuk batch produksi komersial 100–500 unit pertama, gunakan **ESP32-C3 SuperMini** karena memotong biaya hingga 50%, ukuran super ringkas muat di Box X2, dan konsumsi daya 22nm sangat dingin untuk operasi baterai seharian. Jika ada kebutuhan visual layar warna TFT atau pemutaran format FLAC/WAV bitrate tinggi, lini produk tier enterprise dapat menggunakan ESP32-S3.

---

### B. Pemilihan Output Audio: MAX98357A I2S DAC vs DFPlayer Mini MP3

| Karakteristik | DFPlayer Mini (Serial UART + MicroSD) | MAX98357A (Digital I2S Mono DAC Amp) |
| :--- | :--- | :--- |
| **Mekanisme Suara** | Mengambil file MP3 statis dari SD Card lokal | Menerima stream bit audio langsung dari RAM ESP32 |
| **Dukungan Suara Dinamis (TTS)** | ❌ Sulit / Mustahil menyebutkan nama toko / promosi kustom tanpa potong sambung kata (*robotic chopping*) | ✅ **100% Dinamis:** Semua frasa yang digenerate oleh 9router TTS VPS langsung terdengar lancar |
| **Ketahanan Fisik Lapangan** | MicroSD sering korosi / longgar saat soundbox terjatuh di kasir | **Solid-state tanpa komponen bergerak / tanpa kartu memori** |
| **Total Biaya Hardware** | Modul DFPlayer (Rp 15.000) + SD Card 8GB (Rp 25.000) = **Rp 40.000** | Modul MAX98357A = **Rp 18.000 (Hemat Rp 22.000/unit)** |
| **Keputusan** | ❌ **DITINGGALKAN** | ✅ **WAJIB DIGUNAKAN (STANDARD DE FACTO)** |

---

### C. Protokol Komunikasi Transaksi: WebSocket vs MQTT vs HTTP Polling

- **HTTP Long-Polling:** *Ditolak.* Overhead header HTTP terlalu besar, latency 1.5–3 detik, boros kuota bandwidth.
- **MQTT (Mosquitto/EMQX):** *Bagus untuk telemetry IoT,* namun memerlukan overhead parsing paket dan payload binary streaming audio terpisah.
- **WebSocket (WSS) + Binary Stream:** ✅ **TERPILIH.**
  - Koneksi persistent bi-directional dengan latency < 30ms.
  - Memungkinkan pengiriman kontrol JSON (`command: "play"`, `nominal: 25000`) sekaligus streaming raw PCM/WAV chunks secara langsung jika diperlukan.
  - Sangat mudah diproteksi dengan reverse proxy Nginx dan token TLS.

---

## 2. Strategi Pipeline Suara (TTS VPS 9router)

Untuk menjaga suara natural, renyah, dan berkecepatan tinggi:
1. **Audio Pre-generation & Smart Cache di VPS:**
   - Frasa nominal umum (misal: "Rp 10.000", "Rp 25.000", "Rp 50.000") di-pre-render menjadi file MP3 mono 24kHz di Redis memory cache VPS.
   - Frasa custom (*"dari Pempek Silampari"*) digenerate on-the-fly oleh 9router TTS engine (<150ms) lalu digabungkan via stream concatenation.
2. **Audio Delivery Strategy:**
   - ESP32-C3 menerima URL audio terkompresi atau langsung stream chunks via I2S DMA buffer, sehingga tidak membebani memori internal ESP32.

---

## 3. Matriks Manajemen Risiko Rekayasa

| Risiko | Dampak | Probabilitas | Rencana Mitigasi |
| :--- | :---: | :---: | :--- |
| **Brownout Reset saat Speaker Berteriak Keras** | Tinggi | Tinggi | Tambahkan kapasitor elektrolit **470µF 16V** di pin VDD MAX98357A & ESP32. |
| **Sesi Token Grab Kedaluwarsa** | Kritis | Sedang | Service `grabSessionManager.js` otomatis mendeteksi status 401 dan memicu refresh token / notifikasi ke admin via Telegram bot. |
| **Jaringan WiFi Kasir Putus / Flaky** | Sedang | Tinggi | Buffer transaksi lokal di RAM ESP32; mekanisme auto-reconnect backoff (1s, 2s, 4s, maks 10s) + notifikasi visual OLED "WiFi Reconnecting". |
| **Firmware Rusak saat OTA Update** | Kritis | Rendah | Menggunakan skema partisi Dual OTA (`ota_0` dan `ota_1`) dengan watchdog boot. Jika firmware baru crash sebelum 30 detik, otomatis rollback ke partisi lama. |

---

## 4. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 02 (Technical Leadership)
- **Reviewer 1 (Kesesuaian Desain Sistem):** AI Agent 03 (System Architecture) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Kesiapan Infrastruktur & VPS):** AI Agent 12 (DevOps & Infrastructure) &rarr; `STATUS: APPROVED`
- **Next Stage Gate:** Menugaskan System Architect (Agent 03) untuk menyusun diagram detail end-to-end dataflow.
