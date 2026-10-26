/**
 * ==============================================================================
 * QRIPAY IoT SOUNDBOX — WOKWI SIMULATOR FIRMWARE
 * Hardware: ESP32 + OLED SSD1306 (128x64) + Piezo Buzzer + Status LED + Buttons
 * Real Internet Connection: Virtual WiFi "Wokwi-GUEST" -> Live Cloud Polling
 * ==============================================================================
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// --- PIN CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define BUZZER_PIN   25
#define LED_PIN      2
#define BTN_PAY_PIN  4
#define BTN_STORE_PIN 5

// --- WIFI CONFIGURATION (Wokwi Virtual Router) ---
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";

// Cloud Gateway API (Vercel Production)
const char* API_POLL_URL = "https://qripay.vercel.app/api/grab/poll";

// --- TIMEZONE (WIB: UTC+7) ---
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;
const char* NTP_SERVER = "pool.ntp.org";

// --- DEVICE STATE ---
String deviceSerial = "";
const char* STORES[] = { "BATAGOR BANDUNG", "PEMPEK BANDUNG", "SOTO LAMONGAN" };
int currentStoreIndex = 0;

String lastAnnouncedTxId = "";
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 3500; // Poll every 3.5 seconds

bool isPaymentActive = false;
unsigned long paymentDisplayStart = 0;
long displayAmount = 0;
String displayStore = "";

// Forward Declarations
void playChime();
void showStandbyScreen();
void showPaymentScreen(long amount, String store);
void checkCloudTransactions();
String formatRupiah(long amount);
String getWIBTime();

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BTN_PAY_PIN, INPUT_PULLUP);
  pinMode(BTN_STORE_PIN, INPUT_PULLUP);
  digitalWrite(LED_PIN, LOW);

  // 1. Initialize OLED SSD1306
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("[ERR] OLED SSD1306 not found!"));
    for (;;);
  }

  // 2. Generate Unique Hardware Serial ID (eFuse MAC)
  uint64_t chipId = ESP.getEfuseMac();
  char idBuf[16];
  snprintf(idBuf, sizeof(idBuf), "QP-%06X", (uint32_t)(chipId & 0xFFFFFF));
  deviceSerial = String(idBuf);

  // Boot Splash
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(18, 12);
  display.println(F("QRIPAY SOUNDBOX"));
  display.setCursor(22, 28);
  display.print(F("ID: "));
  display.println(deviceSerial);
  display.setCursor(12, 45);
  display.println(F("Menghubungkan WiFi.."));
  display.display();

  Serial.println(F("=================================================="));
  Serial.println(F("🔊 QRIPAY VIRTUAL SOUNDBOX STARTED (WOKWI ESP32)"));
  Serial.print(F("📌 Hardware Device ID: "));
  Serial.println(deviceSerial);
  Serial.println(F("=================================================="));

  // 3. Connect to Wokwi Virtual WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(400);
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH);
    Serial.print(F("🟢 WiFi Terhubung! IP: "));
    Serial.println(WiFi.localIP());
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  } else {
    Serial.println(F("⚠️ WiFi Timeout (Mode Simulasi Offline Aktif)"));
  }

  // Play Startup Chime
  playChime();
  delay(1000);
  showStandbyScreen();
}

void loop() {
  unsigned long now = millis();

  // 1. Handle Button 1: TEST PAYMENT (Green Button)
  if (digitalRead(BTN_PAY_PIN) == LOW) {
    delay(200); // Debounce
    triggerPayment(15000, STORES[currentStoreIndex]);
  }

  // 2. Handle Button 2: SWITCH STORE (Blue Button)
  if (digitalRead(BTN_STORE_PIN) == LOW) {
    delay(200); // Debounce
    currentStoreIndex = (currentStoreIndex + 1) % 3;
    tone(BUZZER_PIN, 1200, 80);
    Serial.print(F("🔄 Cabang Toko Diganti: "));
    Serial.println(STORES[currentStoreIndex]);
    showStandbyScreen();
  }

  // 3. Poll Cloud Gateway API (Real Internet)
  if (WiFi.status() == WL_CONNECTED && (now - lastPollTime >= POLL_INTERVAL)) {
    lastPollTime = now;
    checkCloudTransactions();
  }

  // 4. Return to Standby after 9 seconds of payment display
  if (isPaymentActive && (now - paymentDisplayStart >= 9000)) {
    isPaymentActive = false;
    showStandbyScreen();
  }

  delay(50);
}

// --- CLOUD POLLING & PARSING ---
void checkCloudTransactions() {
  HTTPClient http;
  http.begin(API_POLL_URL);
  http.setTimeout(4000);

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    
    // Parse JSON
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error && doc["success"] == true) {
      JsonArray txs = doc["transactions"].as<JsonArray>();
      if (txs.size() > 0) {
        JsonObject latest = txs[0];
        String txId = latest["id"].as<String>();
        long amount = latest["amount"].as<long>();

        // Check if new transaction arrived
        if (lastAnnouncedTxId == "") {
          // Initial sync: mark current latest without blasting audio
          lastAnnouncedTxId = txId;
        } else if (txId != lastAnnouncedTxId) {
          lastAnnouncedTxId = txId;
          triggerPayment(amount, STORES[currentStoreIndex]);
        }
      }
    }
  }
  http.end();
}

// --- PAYMENT TRIGGER & AUDIO SYNTHESIS SIMULATION ---
void triggerPayment(long amount, String store) {
  isPaymentActive = true;
  paymentDisplayStart = millis();
  displayAmount = amount;
  displayStore = store;

  // LED Flash
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, LOW);
    delay(70);
    digitalWrite(LED_PIN, HIGH);
    delay(70);
  }

  // Visual Display on OLED
  showPaymentScreen(amount, store);

  // Play High-End Digital Chime (Melodi Transaksi)
  playChime();

  // Output Spoken Announcement via Serial Monitor
  Serial.println(F("\n**************************************************"));
  Serial.print(F("🔊 [SPEAKER SOUNDBOX]: \""));
  Serial.print(formatTerbilang(amount));
  Serial.print(F(" rupiah diterima di "));
  Serial.print(store);
  Serial.println(F("\""));
  Serial.println(F("**************************************************\n"));
}

// --- MELODIC CHIME BELL ---
void playChime() {
  // 3-Tone Arpeggio (C6 -> E6 -> G6)
  tone(BUZZER_PIN, 1047, 100); // Do
  delay(120);
  tone(BUZZER_PIN, 1319, 100); // Mi
  delay(120);
  tone(BUZZER_PIN, 1568, 250); // Sol
  delay(260);
  noTone(BUZZER_PIN);
}

// --- DISPLAY SCREENS ---
void showStandbyScreen() {
  display.clearDisplay();

  // Top Bar
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(F("WF:OK"));

  display.setCursor(44, 0);
  display.print(getWIBTime());

  display.setCursor(96, 0);
  display.print(F("B:92%"));
  display.drawLine(0, 9, 128, 9, SSD1306_WHITE);

  // Body: Store Info
  display.setCursor(10, 16);
  display.print(F("KASIR RESMI:"));

  display.setTextSize(1);
  display.setCursor(10, 29);
  display.print(STORES[currentStoreIndex]);

  // Footer: Standby status
  display.drawLine(0, 48, 128, 48, SSD1306_WHITE);
  display.setCursor(6, 53);
  display.print(F("MENUNGGU BAYAR QRIS"));

  display.display();
}

void showPaymentScreen(long amount, String store) {
  display.clearDisplay();

  // Top Bar
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(store);
  display.drawLine(0, 9, 128, 9, SSD1306_WHITE);

  // Center: Big Amount
  display.setTextSize(2);
  display.setCursor(6, 20);
  display.print(F("Rp "));
  display.print(amount);

  // Footer: Verification Badge
  display.drawLine(0, 48, 128, 48, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(8, 53);
  display.print(F("[V] LUNAS - GRABPAY"));

  display.display();
}

// --- UTILITIES ---
String getWIBTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "12:00";
  }
  char buf[8];
  strftime(buf, sizeof(buf), "%H:%M", &timeinfo);
  return String(buf);
}

String formatTerbilang(long n) {
  if (n == 10) return "Sepuluh";
  if (n == 53) return "Lima puluh tiga";
  if (n == 1000) return "Seribu";
  if (n == 10000) return "Sepuluh ribu";
  if (n == 15000) return "Lima belas ribu";
  if (n == 25000) return "Dua puluh lima ribu";
  if (n == 50000) return "Lima puluh ribu";
  return String(n);
}
