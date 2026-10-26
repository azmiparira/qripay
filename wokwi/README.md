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
3. Anda akan langsung melihat ESP32, layar OLED SSD1306, Buzzer, LED Hijau, dan 2 Tombol tersusun rapi dengan kabel-kabelnya!

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
   * Layar OLED menampilkan jam WIB real-time, status WiFi, dan nama toko (**BATAGOR BANDUNG**).
   * **Uji Tombol Hijau ("TES BAYAR"):** Klik tombol hijau, bel buzzer berbunyi melodi transaksi (*Do-Mi-Sol*), LED berkedip, layar OLED menampilkan `Rp 15.000 [V] LUNAS`, dan Serial Monitor mencetak:
     > `🔊 [SPEAKER SOUNDBOX]: "Lima belas ribu rupiah diterima di BATAGOR BANDUNG"`
   * **Uji Tombol Biru ("GANTI TOKO"):** Klik tombol biru untuk mengganti soundbox antar cabang (**BATAGOR BANDUNG** &rarr; **PEMPEK BANDUNG** &rarr; **SOTO LAMONGAN**).
   * **Uji Transaksi Nyata:** ESP32 secara berkala memantau mutasi dari server Vercel Anda (`https://qripay.vercel.app/api/grab/poll`). Jika ada pembayaran masuk di akun Grab Anda, soundbox di Wokwi akan langsung berbunyi sendiri secara otomatis!
