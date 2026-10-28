# SKEMATIK ELEKTRONIKA & BILL OF MATERIALS (BOM)
**Hardware Schematics, Pinout Mapping, Power Management, and Enclosure Design**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 05 (Hardware & Electronics Engineering)*

---

## 1. Topologi Sirkuit & Skematik Kelistrikan

Soundbox QriPay menggunakan topologi terintegrasi berdaya baterai 18650 mandiri dengan konversi tegangan ganda:

```text
+-------------------------------------------------------------------------------------------------+
|                                 SISTEM KELISTRIKAN SOUNDBOX                                      |
+-------------------------------------------------------------------------------------------------+

 [ Baterai 18650 Li-ion ] (3.7V - 4.2V, 3000mAh)
           |
           +---> Saklar Mekanis KCD11 (Power ON/OFF Switch)
                     |
                     v
 [ Modul Powerbank MH-CD42 (Type-C In / 5.0V Boost Out) ]
           |
           +--- USB Type-C Input (Port Pengecasan 5V 1A/2A)
           |
           +=== Rel Tegangan VBUS 5.0V Ter-boost Konstan ===+
                     |                                       |
                     +--- [ Kapasitor 470µF 16V ]            +--- Pin 5V ESP32-C3
                     |    (Anti-Brownout Buffer)                  (LDO Internal 3.3V)
                     |                                                 |
                     +--- Pin VIN MAX98357A DAC Amp                    +--- Pin VCC OLED (3.3V)
```

### Sensor Pembacaan Tegangan Baterai (Voltage Divider ADC)
Karena pin ADC ESP32-C3 hanya mentoleransi tegangan maksimal 2.5V – 3.3V (dengan attenuation), tegangan baterai Li-ion (3.0V – 4.2V) diturunkan secara proporsional $1:2$ menggunakan 2 buah resistor presisi 100kΩ 1%:

```text
Baterai (+) (3.0V - 4.2V) 
      |
    [ R1: 100kΩ ]
      |
      +------> Menuju Pin ADC GPIO 0 ESP32-C3 (Tegangan: 1.5V - 2.1V)
      |
    [ R2: 100kΩ ]
      |
     GND
```

---

## 2. Tabel Pemetaan Pinout Lengkap (ESP32-C3 SuperMini)

| Nama Komponen | Pin Modul | Terhubung ke Pin ESP32-C3 | Tipe Sinyal | Keterangan & Proteksi |
| :--- | :--- | :--- | :--- | :--- |
| **MAX98357A (DAC)** | **LRC** (Left/Right Clock) | **GPIO 7** | Digital Output | I2S Word Select (Fs = 24kHz / 44.1kHz) |
| | **BCLK** (Bit Clock) | **GPIO 6** | Digital Output | I2S Continuous Serial Clock |
| | **DIN** (Data In) | **GPIO 5** | Digital Output | I2S Audio Bitstream |
| | **SD_MODE** | Dihubungkan ke VDD via 100kΩ | Logic Pull-up | Mode Mix Stereo ke Mono ($L+R)/2$ |
| | **GAIN** | GND | Analog Config | Default Gain 9dB (Stabil, minim distorsi) |
| | **VIN / GND** | 5.0V Boost & GND | Power | Disaring kapasitor 470µF paralel |
| **OLED 0.96" I2C** | **SDA** (Data) | **GPIO 8** | I2C Bidirectional | Pull-up 4.7kΩ internal |
| | **SCL** (Clock) | **GPIO 9** | I2C Clock | Clock frequency 400kHz (Fast Mode) |
| | **VCC / GND** | 3.3V Out & GND | Power | Arus rendah (~15mA) |
| **Tombol [+] (Vol+)** | Pin Sinyal | **GPIO 1** | Digital Input | Internal Pull-Up, debounce 50ms |
| **Tombol [🔁] (Replay)**| Pin Sinyal | **GPIO 2** | Digital Input | Internal Pull-Up, long-press 3s detector |
| **Tombol [-] (Vol-)** | Pin Sinyal | **GPIO 3** | Digital Input | Internal Pull-Up, long-press 5s AP-reset |
| **Sensor Baterai** | Tengah Divider R1/R2 | **GPIO 0** | Analog Input | ADC1 Channel 0, Attenuation 11dB |
| **Speaker Fisik** | Terminal +/- | Output MAX98357A | Analog Speaker | 3 Watt, 4 Ohm, Diafragma Karet 40mm |

---

## 3. Bill of Materials (BOM) & Biaya Produksi (Skala 100 Unit)

| No | Nama Komponen & Spesifikasi | Jumlah | Estimasi Harga Satuan (IDR) | Subtotal (IDR) |
| :---: | :--- | :---: | :---: | :---: |
| 1 | **ESP32-C3 SuperMini Development Board** (RISC-V 160MHz, 400KB SRAM, Type-C) | 1 pcs | Rp 25.000 | Rp 25.000 |
| 2 | **Modul I2S DAC MAX98357A** (3W Class-D Mono Amplifier) | 1 pcs | Rp 18.000 | Rp 18.000 |
| 3 | **Layar OLED 0.96" SSD1306** (128x64 I2C Monokrom Biru/Putih) | 1 pcs | Rp 22.000 | Rp 22.000 |
| 4 | **Baterai Li-ion 18650 3000mAh Grade-A** (Kapasitas riil teruji) | 1 pcs | Rp 17.500 | Rp 17.500 |
| 5 | **Holder Baterai 18650 Tunggal** (Dengan kabel pinout tebal) | 1 pcs | Rp 2.500 | Rp 2.500 |
| 6 | **Modul Charger & Boost 5V MH-CD42** (Type-C Charging, 2.1A Boost, Proteksi BMS) | 1 pcs | Rp 6.500 | Rp 6.500 |
| 7 | **Speaker Internal 3W 4Ω 40mm** (Suara vokal tebal, magnet Neodymium) | 1 pcs | Rp 7.500 | Rp 7.500 |
| 8 | **Saklar Rocker Switch KCD11 Kecil** (Black 2-pin 250V 3A) | 1 pcs | Rp 1.000 | Rp 1.000 |
| 9 | **Push Button Tactile 12x12x7.3mm + Cap Topi** (3 warna: Hijau, Kuning, Merah) | 3 pcs | Rp 800 | Rp 2.400 |
| 10 | **Kapasitor Elektrolit 470µF 16V Low-ESR** (Anti-Brownout audio) | 1 pcs | Rp 800 | Rp 800 |
| 11 | **Resistor 100kΩ Logam 1% 1/4W** (Pembagi tegangan baterai) | 2 pcs | Rp 150 | Rp 300 |
| 12 | **Kabel Jumper Silicon 26AWG & Header Pin** | 1 set | Rp 2.500 | Rp 2.500 |
| 13 | **Enclosure / Box X2 Plastik ABS / Akrilik Custom Stand** (Cutting presisi) | 1 pcs | Rp 12.000 | Rp 12.000 |
| 14 | **Stiker Vinyl QRIS Merchant + Baut Spacer M2/M3** | 1 set | Rp 3.000 | Rp 3.000 |
| **TOTAL** | **HARGA POKOK PRODUKSI (HPP) PER UNIT** | | | **Rp 121.000** |

---

## 4. Desain Casing & Proteksi Termal

1. **Akustik Speaker:** Speaker 3W dipasang pada ruang resonansi tertutup (*acoustic chamber*) di dalam box untuk memperkuat frekuensi vokal 300Hz – 3kHz agar pelafalan Rupiah terdengar bulat dan tidak cempreng.
2. **Ventilasi Termal:** Lubang ventilasi kisi-kisi dibuat di bagian dasar box untuk membuang panas dari modul MH-CD42 saat pengisian baterai cepat.
3. **Proteksi Brownout:** Kapasitor 470µF disolder sedekat mungkin (jarak < 10mm) ke pin VDD amplifier untuk menyerap lonjakan arus transien hingga 1.2A saat bass kick atau volume maksimal.

---

## 5. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 05 (Hardware & Electronics Engineering)
- **Reviewer 1 (Kesesuaian Pinout & Driver):** AI Agent 06 (Embedded Firmware) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Keamanan Arus & Baterai BMS):** AI Agent 10 (Information Security) &rarr; `STATUS: APPROVED`
- **Reviewer 3 (Uji Stres Fisik & Suhu):** AI Agent 11 (Quality Assurance) &rarr; `STATUS: APPROVED`
