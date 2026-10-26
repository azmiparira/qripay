# Panduan Simulasi 4 Soundbox Kasir Se-Indonesia di Wokwi

Panduan ini menjelaskan cara membuat **4 perangkat Soundbox mandiri** yang disimulasikan dalam **4 tab browser Wokwi**, di mana masing-masing perangkat mewakili meja kasir di cabang yang berbeda.

---

### 🏪 Pembagian 4 Cabang & Identitas Perangkat

| No | Tab Wokwi | Kode Cabang (`MY_BRANCH_ID`) | Nama Toko QRIS | Device Serial ID | Lokasi Kasir |
|:--:|:---------:|:----------------------------:|:---------------|:----------------:|:-------------|
| 1  | **Tab 1** | `"pusat"`                    | JUS SMOOTHIES PUSAT | `SB-PUSAT-01` | Bandung (Pusat Cipadung) |
| 2  | **Tab 2** | `"pempek"`                   | PEMPEK BANDUNG | `SB-PEMPEK-01` | Bandung (Buah Batu) |
| 3  | **Tab 3** | `"batagor"`                  | BATAGOR BANDUNG | `SB-BATAGOR-01` | Bandung (Dago) |
| 4  | **Tab 4** | `"soto"`                     | SOTO LAMONGAN | `SB-SOTO-01` | Bandung (Dipatiukur) |

---

### 🚀 Cara Menyiapkan 4 Tab Wokwi (Cepat & Mudah)

Lakukan langkah di bawah ini untuk **Tab 1**, lalu duplikat / buka 3 tab baru lagi untuk cabang lainnya:

1. **Buka Wokwi:** Kunjungi **[https://wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32)**.
2. **Tab `diagram.json`:** Hapus isinya, lalu salin dan tempel kode dari [`wokwi/diagram.json`](./diagram.json).
3. **Tab `Library Manager`:** Tambahkan 3 library ini:
   * `Adafruit SSD1306`
   * `Adafruit GFX Library`
   * `ArduinoJson`
4. **Tab `sketch.ino`:** Salin seluruh kode dari [`wokwi/sketch.ino`](./sketch.ino).
5. **Pilih Cabang (Baris 24 `sketch.ino`):**
   Cukup ganti 1 baris ini sesuai cabang untuk tab tersebut:
   * Untuk Tab 1 (Pusat): `const char* MY_BRANCH_ID = "pusat";`
   * Untuk Tab 2 (Pempek): `const char* MY_BRANCH_ID = "pempek";`
   * Untuk Tab 3 (Batagor): `const char* MY_BRANCH_ID = "batagor";`
   * Untuk Tab 4 (Soto): `const char* MY_BRANCH_ID = "soto";`
6. **Klik Play (▶️)** di pojok atas Wokwi pada masing-masing tab.

---

### 🧪 Cara Menguji Transaksi Multi-Soundbox

Buka web **[https://qripay.vercel.app](https://qripay.vercel.app)** di tab lain:

1. **Lihat Status Jaringan IoT:**
   Di bagian atas web, Anda akan melihat indikator bar:
   `Jaringan IoT Soundbox Kasir: Pusat (SB-PUSAT-01) 🟢 | Pempek (SB-PEMPEK-01) 🟢 | Batagor (SB-BATAGOR-01) 🟢 | Soto (SB-SOTO-01) 🟢`
   Tab Wokwi yang sedang menyala akan otomatis berubah warna menjadi hijau (Online)!

2. **Simulasikan Pembeli Scan di Meja Kasir Pempek:**
   * Klik tab **Pempek Bandung** di web.
   * Di kotak *"Simulasi Pembeli Scan di Kasir Ini"*, klik nominal **Rp 25.000** (atau ketik nominal bebas, lalu klik *⚡ Bayar Sekarang*).
   * **Hasil di Wokwi:**
     * **HANYA Tab Wokwi Pempek yang berbunyi!**
     * Buzzer bel transaksi (*Do-Mi-Sol*) berbunyi, LED hijau berkedip.
     * Layar OLED menampilkan `PEMPEK BANDUNG - Rp 25.000 - [V] LUNAS`.
     * Serial Monitor mencetak:
       ```
       ========================================================
       🔔 PEMBAYARAN QRIS DITERIMA DI MEJA KASIR!
       🏪 Cabang Toko        : PEMPEK BANDUNG
       📱 Soundbox Device ID : SB-PEMPEK-01
       📍 Lokasi             : Bandung (Cabang Buah Batu)
       💰 Nominal Uang Masuk : Rp 25.000
       💳 Pembayar           : Pembeli (Scan QRIS Meja Kasir)
       🔊 [SPEAKER SOUNDBOX] : "Dua puluh lima ribu rupiah diterima di PEMPEK BANDUNG"
       ========================================================
       ```
     * Tab Wokwi **Soto, Batagor, dan Pusat tetap tenang dan tidak ikut berbunyi** (tidak ada suara ganda/salah sasaran)!

3. **Uji Cabang Lain (Batagor / Soto / Pusat):**
   * Pindah ke tab **Batagor Bandung** di web, simulasikan pembayaran Rp 50.000.
   * Maka **HANYA Tab Wokwi Batagor** yang berbunyi dan mencetak:
     > `🔊 [SPEAKER SOUNDBOX]: "Lima puluh ribu rupiah diterima di BATAGOR BANDUNG"`

4. **Uji Pembayaran Asli Grab:**
   Setiap kali ada mutasi riil dari pembeli yang scan QRIS Anda via aplikasi Grab/OVO/BCA, server akan memproses dan mengarahkan suara ke soundbox cabang yang bersangkutan!
