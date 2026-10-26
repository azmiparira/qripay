# Panduan Menjalankan Simulasi QRIS Soundbox di Wokwi

Berikut adalah cara menjalankan prototipe hardware **ESP32 QRIS Soundbox** secara virtual di [Wokwi.com](https://wokwi.com/):

---

### Langkah 1: Buka Wokwi Simulator
1. Buka browser dan kunjungi: **[https://wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32)**

---

### Langkah 2: Masukkan Kode `sketch.ino`
1. Di tab **sketch.ino**, hapus semua kode bawaan.
2. Salin seluruh isi file [`wokwi/sketch.ino`](./sketch.ino) dan tempel (paste) ke dalamnya.

---

### Langkah 3: Masukkan Konfigurasi Komponen `diagram.json`
1. Di samping tab *sketch.ino*, klik tab **diagram.json**.
2. Hapus isinya, lalu salin seluruh isi file [`wokwi/diagram.json`](./diagram.json) dan tempel ke dalamnya.
3. Anda akan melihat ESP32, layar OLED SSD1306, Buzzer, LED Hijau, dan 1 Tombol ("TES SIMULASI BAYAR") tersusun rapi dengan kabel-kabelnya. (Tidak ada lagi tombol manual ganti toko, karena sudah otomatis terhubung dengan web!).

---

### Langkah 4: Tambahkan Library di Tab `Library Manager`
1. Di panel sebelah kiri Wokwi, klik icon **Library Manager** (tab "Libraries").
2. Klik tombol **+ Add a New Library**, lalu tambahkan 3 library ini:
   * `Adafruit SSD1306`
   * `Adafruit GFX Library`
   * `ArduinoJson`

---

### Langkah 5: Jalankan Simulasi (Klik Tombol Play Hijau ▶️)
1. Klik tombol **Play (▶️)** di pojok atas Wokwi.
2. Anda akan melihat:
   * ESP32 otomatis tersambung ke WiFi virtual `Wokwi-GUEST`.
   * Layar OLED menampilkan jam WIB real-time, status WiFi, dan kasir QRIS aktif (contoh: **PEMPEK BANDUNG**).
   * **Uji Otomatis via Web QriPay (4 QRIS):**
     Buka web [https://qripay.vercel.app](https://qripay.vercel.app). Saat Anda mengklik tab cabang lain (**Jus Smoothies Pusat**, **Pempek Bandung**, **Batagor Bandung**, atau **Soto Lamongan**), Wokwi secara otomatis mendeteksi perpindahan QRIS dan memperbarui nama toko di layarnya secara real-time!
   * **Uji Tombol Hijau ("TES SIMULASI BAYAR"):** Klik tombol hijau, bel buzzer berbunyi melodi transaksi (*Do-Mi-Sol*), LED berkedip, layar OLED menampilkan nominal Rp 15.000 dengan nama QRIS yang aktif, dan Serial Monitor mencetak:
     > `🔊 [SPEAKER SOUNDBOX]: "Lima belas ribu rupiah diterima di PEMPEK BANDUNG"`
   * **Uji Transaksi Scan Nyata:** Saat ada pelanggan scan QRIS cabang mana pun di website Anda, mutasi Grab yang masuk akan otomatis diproses, dan Wokwi akan langsung memunculkan nominal uang serta nama QRIS yang bersangkutan!
