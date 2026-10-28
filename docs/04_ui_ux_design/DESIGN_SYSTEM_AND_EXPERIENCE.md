# DESAIN SISTEM & PENGALAMAN PENGGUNA (UI/UX)
**Cashier Ergonomics, OLED 128x64 Interface, Auditory Branding, and Mobile Companion UX**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 04 (UI/UX Design)*

---

## 1. Ergonomi Fisik & Pengalaman Kasir Meja Toko

### Tata Letak Fisik Soundbox (Box X2 Acrylic)
- **Sudut Kemiringan 30°:** Wajah soundbox (layar OLED & speaker) miring 30 derajat menghadap kasir yang sedang berdiri/duduk.
- **Grille Speaker Depan:** Lubang speaker 3W dilindungi mesh kain atau kisi akrilik berpori halus agar suara terpancar langsung ke depan tanpa teredam.
- **3 Tombol Taktil Beralur (Tactile 12x12mm):**
  - Ditempatkan di bagian atas perangkat (*top deck*) dengan jarak antar tombol 15mm untuk mencegah salah pencet (*fat-finger error*).
  - Tuts diberi tekstur timbul: `[+]` (plus), `[🔁]` (panah melingkar), `[-]` (minus).

---

## 2. Spesifikasi Tampilan Layar OLED 128x64 (SSD1306)

Layar monokrom OLED 0.96 inci dibagi menjadi 3 zona visual:
- **Header Bar (Baris 0–12):** Status WiFi (bar sinyal RSSI), Nama Toko ringkas, Indikator Baterai (% + ikon bar).
- **Main Canvas (Baris 14–52):** Area pesan dinamis, animasi, nominal transaksi huruf besar.
- **Footer Bar (Baris 54–63):** Jam/Waktu, status koneksi cloud, atau petunjuk tombol.

### State 1: Layar Standby Normal (Kasir Siap Melayani)
```text
+------------------------------------------------+
| [WiFi 4/4]  Pempek Silampari       [🔋 89%]   |
|                                                |
|                   QriPay IoT                   |
|               STANDBY / SIAP                   |
|               28-Oct-2026 14:32                |
|                                                |
| IP: 192.168.1.45              v3.5             |
+------------------------------------------------+
```

### State 2: Transaksi Berhasil Masuk (Pop-up Audio Berjalan)
```text
+------------------------------------------------+
| [WiFi 4/4]  PEMBAYARAN DITERIMA    [🔋 89%]   |
|                                                |
|               ✓ QRIS BERHASIL                  |
|               +Rp 25.000                       |
|           Kasir: Soto Bangkong                 |
|                                                |
| [🔁] Tekan untuk Replay                        |
+------------------------------------------------+
```

### State 3: Rekap Harian (Saat Tekan Tahan Tombol [🔁] 3 Detik)
```text
+------------------------------------------------+
| [REKAP HARI INI]                   [🔋 89%]   |
|                                                |
| Total Transaksi : 48 Trx                       |
| Total Omset     : Rp 1.450.000                 |
| Terakhir        : Rp 25.000 (14:30)            |
|                                                |
| Tekan sembarang tombol untuk kembali           |
+------------------------------------------------+
```

### State 4: Indikator Baterai Lemah (*Low Battery Warning*)
```text
+------------------------------------------------+
| ! PERINGATAN !                     [🪫 12%]   |
|                                                |
|              BATERAI HAMPIR HABIS              |
|             Colokkan Kabel Type-C              |
|                                                |
| Sisa daya estimasi: ~45 menit                  |
+------------------------------------------------+
```

---

## 3. Auditory Experience & Sound Branding

Kenyamanan telinga kasir adalah prioritas tertinggi. Suara yang terlalu melengking menyebabkan kelelahan telinga (*ear fatigue*), sementara suara yang terlalu pelan tidak terdengar di pasar/food court.

### A. Nada Chime Intro (Signature Brand Identity)
- **Notasi Musik:** Akord C-Mayor ceria: C5 (523Hz) &rarr; E5 (659Hz) &rarr; G5 (784Hz).
- **Durasi:** Tepat 80 milidetik, dengan envelope decay lembut.
- **Fungsi Kritis:** Memperingatkan alam bawah sadar kasir bahwa ada uang masuk bahkan sebelum kata pertama diucapkan.

### B. Aturan Frasa Bahasa Indonesia Alami
- **Format Default:** `"Pembayaran QRIS berhasil diterima, Rp [NOMINAL]."`
- **Format Opsional (Multi-Cabang):** `"Pembayaran QRIS Rp [NOMINAL], dari [CABANG]."`
- **Pelafalan Angka:**
  - Rp 25.000 &rarr; *"Dua puluh lima ribu rupiah"* (bukan *"dua lima nol nol nol"*).
  - Rp 150.000 &rarr; *"Seratus lima puluh ribu rupiah"*.
- **Feedback Suara Tombol:**
  - Tekan Volume: Beep pendek bernada naik untuk `[+]` dan nada turun untuk `[-]`.
  - Tekan Replay: Suara chime pendek lalu pembacaan ulang transaksi terakhir.

---

## 4. UI/UX Companion Mobile App (Aplikasi Kasir / Pemilik)

Aplikasi HP (Flutter) untuk pemilik toko dirancang dengan prinsip **Zero Configuration**:
1. **Flow Pairing WiFi 3-Langkah:**
   - Langkah 1: Buka aplikasi, tap "Tambah Soundbox".
   - Langkah 2: HP mendeteksi soundbox via Bluetooth BLE / SmartConfig otomatis.
   - Langkah 3: Pilih nama WiFi toko & masukkan password &rarr; Soundbox bersuara *"WiFi Terhubung, Siap Digunakan!"*.
2. **Katalog Suara (Voice Selector):**
   - Pemilik toko dapat memilih sampel suara: Mbak Ayu (Jawa ramah), Kang Asep (Sunda santun), atau Suara Formal Profesional.
   - Mengatur kalimat sapaan penutup.
3. **Audit Log & Live Monitor:**
   - Menampilkan daftar soundbox milik merchant, persentase baterai live, dan status online/offline.

---

## 5. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 04 (UI/UX Design)
- **Reviewer 1 (Kesesuaian Bisnis Kasir):** AI Agent 01 (Product Management) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Kemudahan Koding di Mobile):** AI Agent 09 (Mobile Engineering) &rarr; `STATUS: APPROVED`
- **Reviewer 3 (Kelayakan Font & Buffer OLED):** AI Agent 06 (Embedded Firmware) &rarr; `STATUS: APPROVED`
