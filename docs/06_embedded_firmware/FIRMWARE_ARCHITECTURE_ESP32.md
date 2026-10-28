# ARSITEKTUR FIRMWARE ESP32
**FreeRTOS Multitasking, I2S Audio Pipeline, State Machine, and OTA Update Engine**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 06 (Embedded & Firmware Engineering)*

---

## 1. Arsitektur FreeRTOS & Pemisahan Tugas (Task Partitioning)

ESP32-C3 ditenagai CPU RISC-V 160MHz single-core. Untuk menjamin pemutaran audio I2S tidak pernah tersendat (*zero stutter/glitch*) saat jaringan WiFi sibuk, arsitektur firmware dibagi ke dalam 3 tugas FreeRTOS dengan prioritas deterministik:

```mermaid
flowchart TD
    subgraph Core0 ["ESP32-C3 Single-Core RISC-V (Preemptive Scheduler)"]
        T1["Task 1: Audio I2S DMA Engine (Prioritas 5 - TERTINGGI)\nFungsi: Membaca Ring Buffer & Menyuplai bitstream ke MAX98357A"]
        T2["Task 2: Network & WebSocket Manager (Prioritas 3 - SEDANG)\nFungsi: TCP/SSL, WSS Handshake, Ping Heartbeat, Download Stream"]
        T3["Task 3: UI, ADC & Button Engine (Prioritas 1 - RENDAH)\nFungsi: Render OLED SSD1306, Debounce 3 Tombol, Baca Baterai"]
        
        BUF[("Ring Buffer Audio (32KB SRAM Chunk)")]
        
        T2 -->|Isi Audio Chunk| BUF
        BUF -->|Ambil Sampel PCM| T1
        T3 -. Trigger Event .-> T2
    end
```

---

## 2. Driver Audio I2S & Penanganan Streaming

Firmware menggunakan library teroptimasi DMA `ESP32-audioI2S` yang disesuaikan khusus untuk single-core:
- **Konfigurasi Pin I2S:**
  - `BCLK_PIN = GPIO 6`
  - `LRC_PIN  = GPIO 7`
  - `DOUT_PIN = GPIO 5`
- **Zero-Latency Chime Cache (SPIFFS):**
  File chime intro (*Do-Mi-Sol*) disimpan permanen di memori Flash SPIFFS lokal (`/chime.wav`). Ketika sinyal pembayaran masuk via WebSocket, firmware memutar `/chime.wav` dalam waktu < 10ms, sembari menyambung ke streaming MP3 nominal dari VPS tanpa jeda hening.

---

## 3. Logika State Machine 3 Tombol Kasir

Menggunakan algoritma *non-blocking state machine* dengan timer interval milidetik:

```cpp
enum ButtonEvent { NONE, VOL_UP, VOL_DOWN, REPLAY_LAST, DAILY_SUMMARY, RESET_WIFI };

ButtonEvent checkButtons() {
    uint32_t now = millis();
    // Tombol 1: Volume Up (GPIO 1)
    if (digitalRead(PIN_BTN_UP) == LOW) {
        if (!btnUpPressed) { btnUpPressed = true; btnUpTime = now; }
        else if (now - btnUpTime > 3000 && !btnUpHandled) {
            btnUpHandled = true; return TEST_AUDIO_CHIME;
        }
    } else if (btnUpPressed) {
        btnUpPressed = false;
        if (!btnUpHandled) return VOL_UP;
        btnUpHandled = false;
    }

    // Tombol 2: Replay / Daily Summary (GPIO 2)
    if (digitalRead(PIN_BTN_REPLAY) == LOW) {
        if (!btnReplayPressed) { btnReplayPressed = true; btnReplayTime = now; }
        else if (now - btnReplayTime > 3000 && !btnReplayHandled) {
            btnReplayHandled = true; return DAILY_SUMMARY;
        }
    } else if (btnReplayPressed) {
        btnReplayPressed = false;
        if (!btnReplayHandled) return REPLAY_LAST;
        btnReplayHandled = false;
    }

    // Tombol 3: Volume Down / Reset WiFi (GPIO 3)
    if (digitalRead(PIN_BTN_DOWN) == LOW) {
        if (!btnDownPressed) { btnDownPressed = true; btnDownTime = now; }
        else if (now - btnDownTime > 5000 && !btnDownHandled) {
            btnDownHandled = true; return RESET_WIFI;
        }
    } else if (btnDownPressed) {
        btnDownPressed = false;
        if (!btnDownHandled) return VOL_DOWN;
        btnDownHandled = false;
    }
    return NONE;
}
```

---

## 4. Algoritma Perhitungan Baterai Real-Time (ADC GPIO 0)

1. **Sampling ADC Berkala:** Dilakukan setiap 5 detik dengan metode *16-sample Moving Average* untuk mengeliminasi noise frekuensi radio WiFi:
$$V_{adc} = \frac{\sum_{i=1}^{16} \text{analogReadMilliVolts}(GPIO\_0)}{16}$$
2. **Kompensasi Pembagi Tegangan ($100\text{k}\Omega / 100\text{k}\Omega$):**
$$V_{bat} = V_{adc} \times 2.0 \times \text{CalFactor}$$
3. **Konversi ke Persentase Li-ion (Non-Linear):**
   - $V_{bat} \ge 4.15\text{V} \implies 100\%$
   - $V_{bat} = 3.85\text{V} \implies 70\%$ (Nominal)
   - $V_{bat} = 3.65\text{V} \implies 30\%$
   - $V_{bat} \le 3.30\text{V} \implies 0\%$ (*Trigger shutdown / low-batt alert*)

---

## 5. Sistem Pembaruan Firmware Jarak Jauh (Dual-Partition OTA)

Tabel partisi Flash kustom (`partitions.csv` 4MB Flash):
```csv
# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     0x9000,  0x5000,
otadata,  data, ota,     0xe000,  0x2000,
app0,     app,  ota_0,   0x10000, 0x1A0000,
app1,     app,  ota_1,   0x1B0000,0x1A0000,
spiffs,   data, spiffs,  0x350000,0xB0000,
```

### Prosedur Proteksi Anti-Brick (Watchdog Rollback)
1. Server mengirimkan instruksi `{"action": "OTA_UPDATE", "url": "https://api.qripay.id/ota/v3.6.bin", "sha256": "..."}`.
2. ESP32 mengunduh file binary ke partisi yang sedang tidak aktif (misal `app1`).
3. Dilakukan verifikasi hash SHA256; jika cocok, register `otadata` dialihkan ke `app1`.
4. ESP32 reboot. Firmware baru mengaktifkan timer watchdog 30 detik.
5. Jika firmware baru berhasil connect WiFi dan melakukan handshake WSS ke backend dalam 30 detik, perintah `esp_ota_mark_app_valid_cancel_rollback()` dieksekusi.
6. Jika terjadi bootloop atau crash, chip otomatis me-rollback kembali ke partisi lama (`app0`).

---

## 6. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 06 (Embedded & Firmware Engineering)
- **Reviewer 1 (Kesesuaian Skematik & Pinout):** AI Agent 05 (Hardware Engineering) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Uji Ketahanan & Stress Test):** AI Agent 11 (Quality Assurance) &rarr; `STATUS: APPROVED`
- **Reviewer 3 (Kesesuaian Payload WSS):** AI Agent 08 (Backend Engineering) &rarr; `STATUS: APPROVED`
