# PRD: ENTERPRISE QRIS IOT SOUNDBOX (QriPay)
**Dokumen Kebutuhan Produk (Product Requirement Document)**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 01 (Product Management)*

---

## 1. Ringkasan Eksekutif & Problem Statement

### Masalah Utama Merchant (UMKM & Retail)
1. **Penipuan Bukti Bayar Palsu (Screenshot Fraud):** Kasir sering tertipu pembeli yang menunjukkan screenshot transfer QRIS palsu atau transaksi tertunda saat jam ramai.
2. **Ketergantungan pada HP Kasir:** Pemilik toko enggan membiarkan kasir mengoperasikan HP pribadi toko untuk mengecek mutasi bank karena risiko privasi dan kelalaian operasional.
3. **Soundbox Bank Terlalu Mahal / Terikat 1 Bank:** Soundbox resmi bank besar mengenakan biaya sewa tinggi (Rp 50.000–80.000/bulan) dan hanya membunyikan 1 bank tertentu.
4. **Keterbatasan Listrik Colokan di Meja Kasir:** Gerobak, warung kaki lima, atau kasir semi-outdoor tidak memiliki stopkontak colokan dekat kasir.

### Solusi QriPay Soundbox
Soundbox QRIS portabel mandiri berbasis ESP32 + MAX98357A I2S DAC dengan daya baterai 18650 (tahan seharian), yang secara otomatis membunyikan notifikasi suara nominal pembayaran dari semua saluran QRIS (Grab, Shopee, Bank, e-Wallet) dalam waktu kurang dari 500 milidetik, lengkap dengan fitur putar ulang (*replay*), rekap omset harian, dan kustomisasi suara jarak jauh via VPS 9router TTS.

---

## 2. Target Pengguna & Personas

| Persona | Kebutuhan Utama | Fitur Kunci yang Digunakan |
| :--- | :--- | :--- |
| **Kasir / Pramuniaga** | Verifikasi cepat tanpa melirik layar HP saat antrean ramai. | Suara lantang (*3W speaker*), tombol *Replay* jika suara terlewat saat gaduh. |
| **Pemilik Toko (Merchant Owner)** | Mengetahui omset harian tanpa repot hitung struk, privasi saldo aman. | Tombol *Daily Recap* saat tutup toko, dashboard monitoring di Companion App. |
| **Teknisi Lapangan / Reseller** | Pemasangan cepat, mudah sambung WiFi, perawatan minim. | Onboarding WiFi 3 tombol, status baterai jelas, update firmware otomatis (OTA). |

---

## 3. Fitur Utama & Spesifikasi Fungsional

### F-01: Notifikasi Audio Pembayaran Instan (< 500ms)
- Mengumumkan nominal pembayaran dalam Bahasa Indonesia alami.
- Contoh frasa: *"Pembayaran QRIS berhasil diterima, Rp 25.000 dari Pempek Silampari."*
- Menggunakan chime intro harmonis (Do-Mi-Sol) sebelum pembacaan teks agar menarik perhatian kasir.

### F-02: Remote Voice Customization (Admin Jarak Jauh)
- Suara dihasilkan di cloud VPS menggunakan engine 9router TTS.
- Admin merchant dapat mengganti suara (Pria/Wanita), dialek lokal, kecepatan, hingga menyisipkan salam promosi toko (misal: *"Terima kasih, selamat menikmati Bakso Sony!"*) langsung dari cloud tanpa perlu flash ulang firmware.

### F-03: Ergonomi 3 Tombol Kasir Fisik
1. **Tombol [+] (GPIO 1):** Tekan singkat menaikkan volume (Level 1–10). Tekan tahan 3 detik = Tes audio chime.
2. **Tombol [🔁] (GPIO 2):** Tekan singkat = Putar ulang transaksi terakhir (*Replay*). Tekan tahan 3 detik = Pembacaan rekapitulasi total omset & jumlah transaksi hari ini.
3. **Tombol [-] (GPIO 3):** Tekan singkat menurunkan volume. Tekan tahan 5 detik = Reset WiFi & masuk ke mode pairing SmartConfig/SoftAP.

### F-04: Portabilitas Baterai 18650 & Indikator Daya Real-Time
- Ditenagai 1 sel baterai Li-ion 18650 (3000mAh) dengan modul booster 5V.
- Mampu beroperasi minimal 18–24 jam nonstop dalam kondisi standby dan 300 transaksi per hari.
- Layar OLED 128x64 menampilkan persentase baterai real-time (0–100%) dan peringatan baterai lemah (*Low Battery Warning*) pada 15%.

### F-05: Over-The-Air (OTA) Fleet Management
- Seluruh perangkat dapat diperbarui sistemnya secara serentak melalui push notifikasi server.
- Dual-partition rollback proteksi untuk mencegah perangkat *brick* bila mati lampu saat update.

---

## 4. Model Finansial & Unit Economics

| Pos Pengeluaran | Estimasi Biaya (IDR) | Catatan |
| :--- | :--- | :--- |
| **BOM Hardware (Perangkat Fisik)** | Rp 95.000 – Rp 115.000 | ESP32-C3, MAX98357A, Baterai 18650, Booster, Speaker 3W, Box X2 |
| **Model Bisnis ke Merchant** | **Opsi A: Beli Putus** Rp 249.000 + Biaya Platform Rp 15.000/bln<br>**Opsi B: Sewa Bulanan** Rp 35.000/bln (BEP dalam 3,5 bulan) |
| **Biaya Server / Unit / Bulan** | Rp 1.200 / soundbox | VPS Hostinger/Contabo + 9router TTS load distribution |
| **Gross Margin Produksi** | > 52% | Sangat kompetitif dibandingkan soundbox bank konvensional |

---

## 5. Non-Functional Requirements (SLA & Kinerja)

1. **Latensi Transaksi-ke-Suara:** $\le 500 \text{ ms}$ (dari diterimanya webhook Grab/QRIS sampai speaker mulai berbunyi).
2. **Kekuatan Suara:** Minimal $85\text{ dB}$ pada jarak 1 meter (cukup keras untuk restoran dan food court ramai).
3. **Availability / Uptime Gateway:** $99.9\%$ uptime.
4. **Keamanan:** Autentikasi token unik per device, enkripsi payload WebSocket (WSS), dan audit log transaksi.

---

## 6. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 01 (Product Management)
- **Reviewer 1 (Kelayakan Teknis):** AI Agent 02 (Technical Leadership) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Kesesuaian Pengalaman Kasir):** AI Agent 04 (UI/UX Design) &rarr; `STATUS: APPROVED`
- **Next Stage Gate:** Menyerahkan PRD ke AI Agent 02 & 03 untuk arsitektur teknis dan pemilihan chipset.
