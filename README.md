# 🔊 QRIS Virtual Soundbox - Cashi.id

Aplikasi Web Soundbox & Kasir QRIS Dinamis terintegrasi dengan **Cashi.id Payment Gateway**.

---

## 🌟 Fitur Utama
1. **Audio Soundbox (Text-to-Speech Bahasa Indonesia - Nominal Dahulu):**
   - Otomatis menyebutkan nominal terlebih dahulu:
     *"Dua puluh lima ribu rupiah, pembayaran QRIS berhasil diterima."*
   - Dilengkapi nada bel kasir digital (*cash register chime*).
2. **Kasir QRIS Dinamis (Input Nominal Manual):**
   - Kasir cukup ketik nominal belanja (min. Rp 2.000) atau klik tombol cepat (Rp 5rb, 10rb, 15rb, 25rb, 50rb, 100rb).
   - Klik **Buat QRIS 📱**, QRIS dinamis resmi Cashi.id langsung terbit di layar untuk di-scan pembeli.
   - Nominal otomatis terkunci di HP pembeli tanpa perlu ketik manual.
3. **Webhook Otomatis Cashi.id (HMAC-SHA256):**
   - Memvalidasi tanda tangan `x-gateway-signature` untuk menjamin keamanan transaksi resmi.
   - Langsung membunyikan soundbox saat event `PAYMENT_SETTLED` diterima.
4. **Kompatibilitas Vercel Serverless:**
   - Dilengkapi polling fallback otomatis agar suara tetap berbunyi tanpa putus di Vercel.

---

## ⚙️ Konfigurasi Environment (`.env`)
```env
PORT=3000
CASHI_BASE_URL=https://cashi.id
CASHI_API_KEY=28567018921edd2bb00c979281d2ab663ab16b4809c87e23b4234f22d4b7fadf
CASHI_WEBHOOK_SECRET=sk_725cec268bbf895562be95d9aff42c37
MERCHANT_NAME=Jus Smoothies
```

---

## 📡 Setup Webhook di Dashboard Cashi.id
1. Masuk ke Dashboard Cashi.id: **Settings** > **Webhooks**.
2. Masukkan URL Webhook Anda:
   ```text
   https://qripay.vercel.app/webhook
   ```
3. Simpan pengaturan.
