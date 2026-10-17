# 🔊 QRIS Virtual Soundbox - PayKita

Aplikasi Web Soundbox untuk memutar suara pengumuman pembayaran otomatis ketika **QRIS Statis** PayKita Anda di-scan oleh pembeli.

---

## 🌟 Fitur Utama
1. **Audio Announcer (Text-to-Speech Bahasa Indonesia):**
   - Otomatis mengubah nominal angka ke terbilang bahasa Indonesia (misal: `Rp 25.000` dibaca *"dua puluh lima ribu rupiah"*).
   - Dilengkapi nada bel kasir digital (*cash register chime*) sebelum suara berbicara.
2. **Real-time Webhook Receiver:**
   - Menerima notifikasi seketika via Server-Sent Events (SSE) tanpa perlu refresh halaman.
   - Kompatibel dengan berbagai format payload webhook payment gateway (PayKita, Midtrans, Tripay, dll).
3. **Simulator Suara / Tombol Tes:**
   - Tombol cepat Rp 10.000, Rp 25.000, Rp 50.000, Rp 100.000, atau nominal bebas untuk menguji suara sebelum dipakai jualan.
4. **Log & Debugging:**
   - Menampilkan payload mentah yang dikirim oleh PayKita langsung di dashboard web.

---

## 🚀 Cara Menjalankan

Server saat ini **sudah berjalan di latar belakang (background)** pada port `3000`.

### 1. Buka Web Soundbox di Browser
Buka browser (Google Chrome, Edge, atau browser HP) dan akses:
👉 **`http://localhost:3000`**

### 2. Aktifkan Suara Soundbox
Klik tombol hijau/biru **"Klik untuk Mengaktifkan Suara"** satu kali di layar web.
*(Ini diperlukan karena kebijakan keamanan browser melarang website membunyikan suara otomatis sebelum ada interaksi klik dari pengguna).*

---

## 📡 Menghubungkan ke PayKita (QRIS Statis)

Agar server PayKita bisa mengirim notifikasi ke laptop/PC Anda:

1. **Jadikan URL Server Anda Online (Tunneling):**
   Jalankan salah satu perintah ini di terminal:
   ```bash
   npx localtunnel --port 3000
   ```
   *atau jika punya ngrok:*
   ```bash
   ngrok http 3000
   ```
2. Anda akan mendapatkan URL publik HTTPS, misalnya:
   `https://soundbox-anda.loca.lt` atau `https://xxxx.ngrok-free.app`
3. **Buka Dashboard PayKita:**
   - Masuk ke dashboard merchant PayKita Anda.
   - Buka menu **Pengaturan** / **Integrasi** / **Webhook / Callback**.
   - Masukkan Callback URL:
     `https://URL-PUBLIK-ANDA/webhook`
   - Simpan pengaturan.

Setiap kali QRIS Anda menerima pembayaran, PayKita akan menembak URL tersebut dan web Anda akan otomatis bersuara:
*"Pembayaran QRIS berhasil diterima sebesar ... rupiah"*.
