# AUDIT KEAMANAN INFORMASI & KEPATUHAN QRIS
**Threat Modeling (STRIDE), Device Authentication, Token Vault, and Financial Compliance**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 10 (Information Security)*

---

## 1. Analisis Ancaman Keamanan (STRIDE Threat Model)

| Kategori Ancaman | Skenario Risiko Nyata di Lapangan | Tingkat Risiko | Mekanisme Pertahanan & Mitigasi |
| :--- | :--- | :---: | :--- |
| **Spoofing (Pemalsuan)** | Pihak tak dikenal membuat perangkat palsu untuk menyadap atau membunyikan pembayaran fiktif. | Kritis | **Device Hardware Authentication:** Setiap ESP32 memiliki pasangan kunci privat unik berbasis MAC & eFuse HMAC. Backend memvalidasi token sebelum mengizinkan koneksi WebSocket. |
| **Tampering (Manipulasi)** | Seseorang memodifikasi file binary firmware untuk mengubah alur pembacaan nominal. | Kritis | **Signed Firmware OTA:** Firmware dienkripsi dan ditandatangani secara kriptografis (*ECDSA signature*). Bootloader ESP32 menolak flashing jika tanda tangan digital tidak valid. |
| **Repudiation (Penyangkalan)** | Kasir atau pembeli menyangkal telah melakukan transaksi atau menyatakan soundbox tidak berbunyi. | Sedang | **Immutable Audit Logs:** Setiap notifikasi audio yang berhasil diputar dicatat dalam database lengkap dengan timestamp milidetik, ID transaksi, dan acknowledgment paket dari soundbox. |
| **Information Disclosure (Kebocoran Data)** | Sesi GrabMerchant atau mutasi rekening kasir bocor ke publik melalui sniffing WiFi. | Kritis | **Enkripsi End-to-End (TLS 1.3 / WSS):** Seluruh komunikasi jaringan dilindungi sertifikat SSL valid. Token sesi Grab dienkripsi di database menggunakan AES-256-GCM. |
| **Denial of Service (DoS)** | Pelaku membanjiri server WebSocket dengan jutaan koneksi palsu untuk mematikan soundbox se-Indonesia. | Tinggi | **Nginx Rate Limiting & Fail2ban:** Pembatasan koneksi maksimal 5 per IP address; proteksi cloudflare DDoS filtering di layer gateway. |
| **Elevation of Privilege** | Eksploitasi buffer overflow pada firmware ESP32 untuk membajak server VPS. | Rendah | Firmware beroperasi dalam mode restricted client (*least privilege*); server tidak pernah mengeksekusi payload dinamis dari perangkat. |

---

## 2. Arsitektur Brankas Token Sesi Grab (Session Token Vault)

Sesi GrabMerchant sangat sensitif karena memberikan akses membaca mutasi toko:
1. **Enkripsi Data At-Rest:**
   Token sesi Grab disimpan di PostgreSQL bukan dalam bentuk *plain text*, melainkan dienkripsi dengan master key yang diinjeksi via environment variable (KMS / HashiCorp Vault):
   $$\text{Ciphertext} = \text{AES-256-GCM}(\text{GrabSessionToken}, \text{MasterKey}, \text{IV})$$
2. **Rotasi Sesi Terjadwal:**
   Sistem secara otomatis memperbarui cookie sesi sebelum mencapai masa kedaluwarsa (7 hari). Jika terdeteksi *Session Invalid (HTTP 401)*, sistem langsung memicu notifikasi peringatan ke Telegram Admin dan memutus sementara polling untuk mencegah pemblokiran IP oleh firewall Grab.

---

## 3. Keamanan Firmware & Anti-Cloning Fisik (eFuse ESP32)

Untuk mencegah pembajakan unit hardware komersial:
1. **ESP32 Flash Encryption:** Mengaktifkan fitur enkripsi hardware bawaan ESP32. Flash SPI tidak dapat dibaca menggunakan programmer FTDI eksternal saat chip dicabut dari PCB.
2. **Secure Boot v2:** Memastikan hanya firmware berizin resmi dari QriPay yang dapat dieksekusi oleh chip mikroprosesor.
3. **Mencegah Ekstraksi Kredensial WiFi:** Kredensial WiFi toko yang tersimpan di NVS (Non-Volatile Storage) dienkripsi menggunakan partisi NVS Encryption terpisah.

---

## 4. Kepatuhan Regulasi Bank Indonesia (Standar QRIS Nasional)

Kepatuhan terhadap Peraturan Anggota Dewan Gubernur Bank Indonesia (PADG No. 21/18/PADG/2019 tentang QRIS):
1. **Integritas Nominal:** Soundbox dilarang membulatkan atau mengubah nominal transaksi yang diterima dari payment gateway.
2. **Privasi Pembeli:** Nama pembeli yang disuarakan dipersingkat atau disamarkan jika mengandung data sensitif (misal: *"Rp 50.000 dari Ahmad F..."*).
3. **Penyimpanan Data Transaksi:** Data mutasi finansial disimpan di data center wilayah kedaulatan Republik Indonesia (ID) dengan retensi audit minimal 3 tahun.

---

## 5. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 10 (Information Security)
- **Reviewer 1 (Kesesuaian Strategi & Biaya):** AI Agent 02 (Technical Leadership) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Keamanan Server & Firewall):** AI Agent 12 (DevOps & Infrastructure) &rarr; `STATUS: APPROVED`
- **Reviewer 3 (Audit Enkripsi Database):** AI Agent 07 (Database Engineering) &rarr; `STATUS: APPROVED`
