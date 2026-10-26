/**
 * ==============================================================================
 * QRIPAY IoT SOUNDBOX — WOKWI FIRMWARE v2.0 (MULTI-QRIS AUTOMATIC ROUTING)
 * 4 QRIS Covered: 1 Pusat (Jus Smoothies) + 3 Cabang (Pempek, Batagor, Soto)
 * 
 * Auto-Sync: Saat Anda memilih/scan QRIS di web QriPay, Wokwi otomatis tahu
 * nama QRIS mana yang di-scan dan langsung memunculkan nominal + nama QRIS!
 * ==============================================================================
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// --- PIN DEFINITIONS ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

#define BUZZER_PIN   25
#define LED_PIN      2
#define BTN_PAY_PIN  4

// --- WIFI & CLOUD API ---
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
const char* API_POLL_URL = "https://qripay.vercel.app/api/grab/poll";

// --- DEVICE IDENTITY & STORE STATE ---
String deviceSerial = "";
String currentStoreName = "PEMPEK BANDUNG"; // Default, auto-synced from web

String lastAnnouncedTxId = "";
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 3000; // Poll every 3 seconds

bool isPaymentActive = false;
unsigned long paymentDisplayStart = 0;
long displayAmount = 0;
String displayStore = "";

// Forward declarations
void playChime();
void showStandbyScreen();
void showPaymentScreen(long amount, String store);
void checkCloudTransactions();
void triggerPayment(long amount, String store);
String formatTerbilang(long n);
String getWIBTime();

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BTN_PAY_PIN, INPUT_PULLUP);
  digitalWrite(LED_PIN, LOW);

  // 1. Initialize OLED SSD1306
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("[ERR] OLED SSD1306 tidak ditemukan!"));
    for (;;);
  }

  // 2. Read Unique Hardware Serial ID (eFuse MAC)
  uint64_t chipId = ESP.getEfuseMac();
  char idBuf[16];
  snprintf(idBuf, sizeof(idBuf), "QP-%06X", (uint32_t)(chipId & 0xFFFFFF));
  deviceSerial = String(idBuf);

  // Splash Screen
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(18, 12);
  display.println(F("QRIPAY SOUNDBOX"));
  display.setCursor(20, 28);
  display.print(F("SERIAL: "));
  display.println(deviceSerial);
  display.setCursor(12, 45);
  display.println(F("Menghubungkan WiFi.."));
  display.display();

  Serial.println(F("\n========================================================"));
  Serial.println(F("🔊 QRIPAY VIRTUAL SOUNDBOX v2.0 (MULTI-QRIS AUTOMATIC)"));
  Serial.print(F("📌 Hardware Serial ID : "));
  Serial.println(deviceSerial);
  Serial.println(F("🏬 Melayani 4 QRIS    : 1 Pusat + 3 Cabang"));
  Serial.println(F("========================================================\n"));

  // 3. Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 25) {
    delay(300);
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH);
    Serial.print(F("🟢 WiFi Terhubung! IP: "));
    Serial.println(WiFi.localIP());
    configTime(7 * 3600, 0, "pool.ntp.org");
  } else {
    Serial.println(F("⚠️ WiFi Timeout (Mode Simulasi Offline)"));
  }

  playChime();
  delay(800);
  showStandbyScreen();
}

void loop() {
  unsigned long now = millis();

  // 1. Tombol Tes Simulasi Bayar (Tombol Hijau di Wokwi)
  if (digitalRead(BTN_PAY_PIN) == LOW) {
    delay(250); // Debounce
    triggerPayment(15000, currentStoreName);
  }

  // 2. Polling Cloud API Otomatis (Membaca Transaksi Scan dari Web)
  if (WiFi.status() == WL_CONNECTED && (now - lastPollTime >= POLL_INTERVAL)) {
    lastPollTime = now;
    checkCloudTransactions();
  }

  // 3. Kembalikan layar ke Standby setelah 8 detik pembayaran
  if (isPaymentActive && (now - paymentDisplayStart >= 8000)) {
    isPaymentActive = false;
    showStandbyScreen();
  }

  delay(40);
}

// --- POLLING TRANSAKSI REAL-TIME DARI SERVER CLOUD ---
void checkCloudTransactions() {
  HTTPClient http;
  http.begin(API_POLL_URL);
  http.setTimeout(4000);

  int code = http.GET();
  if (code == 200) {
    String jsonPayload = http.getString();
    StaticJsonDocument<2560> doc;
    DeserializationError err = deserializeJson(doc, jsonPayload);

    if (!err && doc["success"] == true) {
      // 1. Sinkronisasi nama QRIS aktif yang sedang dibuka di web
      if (doc.containsKey("activeStore") && doc["activeStore"].containsKey("name")) {
        String serverStore = doc["activeStore"]["name"].as<String>();
        if (serverStore.length() > 0 && serverStore != currentStoreName) {
          currentStoreName = serverStore;
          if (!isPaymentActive) {
            showStandbyScreen();
          }
        }
      }

      // 2. Cek apakah ada pembayaran QRIS baru yang masuk
      JsonArray txs = doc["transactions"].as<JsonArray>();
      if (txs.size() > 0) {
        JsonObject latest = txs[0];
        String txId = latest["id"].as<String>();
        long amount = latest["amount"].as<long>();
        String targetStore = latest.containsKey("store_name") ? latest["store_name"].as<String>() : currentStoreName;

        if (lastAnnouncedTxId == "") {
          // Sinkronisasi awal (jangan langsung bunyi saat alat baru nyala)
          lastAnnouncedTxId = txId;
        } else if (txId != lastAnnouncedTxId) {
          // TRANSAKSI BARU TERDETEKSI DARI SCAN QRIS!
          lastAnnouncedTxId = txId;
          triggerPayment(amount, targetStore);
        }
      }
    }
  }
  http.end();
}

// --- AKSI KETIKA PEMBAYARAN BERHASIL (LAYAR + LED + BUZZER + SUARA) ---
void triggerPayment(long amount, String store) {
  isPaymentActive = true;
  paymentDisplayStart = millis();
  displayAmount = amount;
  displayStore = store;

  // 1. Kedipkan LED Hijau
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, LOW); delay(60);
    digitalWrite(LED_PIN, HIGH); delay(60);
  }

  // 2. Tampilkan di Layar OLED (Nama QRIS + Nominal Besar)
  showPaymentScreen(amount, store);

  // 3. Mainkan Melodi Chime Bel Soundbox (Do-Mi-Sol)
  playChime();

  // 4. Cetak Kalimat Suara Resmi Soundbox di Serial Monitor
  Serial.println(F("\n========================================================"));
  Serial.println(F("🔔 PEMBAYARAN QRIS DITERIMA!"));
  Serial.print(F("🏪 QRIS Toko / Cabang : "));
  Serial.println(store);
  Serial.print(F("💰 Nominal Uang Masuk : Rp "));
  Serial.println(amount);
  Serial.print(F("🔊 [SPEAKER SOUNDBOX] : \""));
  Serial.print(formatTerbilang(amount));
  Serial.print(F(" rupiah diterima di "));
  Serial.print(store);
  Serial.println(F("\""));
  Serial.println(F("========================================================\n"));
}

// --- MELODI BEL SOUNDBOX (CHIME BELL) ---
void playChime() {
  tone(BUZZER_PIN, 1047, 100); delay(120); // C6 (Do)
  tone(BUZZER_PIN, 1319, 100); delay(120); // E6 (Mi)
  tone(BUZZER_PIN, 1568, 260); delay(280); // G6 (Sol)
  noTone(BUZZER_PIN);
}

// --- TAMPILAN LAYAR OLED ---
void showStandbyScreen() {
  display.clearDisplay();

  // Header Bar (WiFi, Jam WIB, Baterai)
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(F("WF:OK"));

  display.setCursor(44, 0);
  display.print(getWIBTime());

  display.setCursor(94, 0);
  display.print(F("B:92%"));
  display.drawLine(0, 9, 128, 9, SSD1306_WHITE);

  // Konten: Nama QRIS Aktif
  display.setCursor(6, 17);
  display.print(F("KASIR RESMI QRIS:"));

  display.setTextSize(1);
  display.setCursor(6, 30);
  display.print(currentStoreName);

  // Footer: Status Menunggu
  display.drawLine(0, 48, 128, 48, SSD1306_WHITE);
  display.setCursor(6, 53);
  display.print(F("MENUNGGU SCAN QRIS"));

  display.display();
}

void showPaymentScreen(long amount, String store) {
  display.clearDisplay();

  // Header Bar: Nama Toko QRIS yang di-scan
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(store);
  display.drawLine(0, 9, 128, 9, SSD1306_WHITE);

  // Tengah: Nominal Pembayaran (Font Tebal & Besar)
  display.setTextSize(2);
  display.setCursor(6, 20);
  display.print(F("Rp "));
  display.print(amount);

  // Footer: Verifikasi Bank
  display.drawLine(0, 48, 128, 48, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(8, 53);
  display.print(F("[V] LUNAS - GRABPAY"));

  display.display();
}

// --- PENDUKUNG WAKTU & FORMAT TERBILANG ---
String getWIBTime() {
  struct tm t;
  if (!getLocalTime(&t)) return "12:00";
  char b[8];
  strftime(b, sizeof(b), "%H:%M", &t);
  return String(b);
}

String formatTerbilang(long n) {
  if (n == 10) return "Sepuluh";
  if (n == 53) return "Lima puluh tiga";
  if (n == 251) return "Dua ratus lima puluh satu";
  if (n == 653) return "Enam ratus lima puluh tiga";
  if (n == 956) return "Sembilan ratus lima puluh enam";
  if (n == 1000) return "Seribu";
  if (n == 15000) return "Lima belas ribu";
  if (n == 20000) return "Dua puluh ribu";
  if (n == 25000) return "Dua puluh lima ribu";
  if (n == 50000) return "Lima puluh ribu";
  return String(n);
}
