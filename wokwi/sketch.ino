/**
 * ==============================================================================
 * QRIPAY IoT SOUNDBOX — FIRMWARE v3.0 (MULTI-DEVICE REGISTRY SE-INDONESIA)
 * ------------------------------------------------------------------------------
 * Prototipe Soundbox Mandiri untuk Jaringan Kasir Multi-Cabang.
 * Setiap tab Wokwi menyimulasikan 1 perangkat Soundbox fisik di meja kasir.
 * ==============================================================================
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ==============================================================================
// 🏬 IDENTITAS PERANGKAT SOUNDBOX (PILIH 1 UNTUK SETIAP TAB WOKWI):
// ------------------------------------------------------------------------------
// Cukup ganti nilai MY_BRANCH_ID di bawah ini pada setiap tab Wokwi Anda:
//   "pusat"   -> JUS SMOOTHIES PUSAT  (Device ID: SB-PUSAT-01)
//   "pempek"  -> PEMPEK BANDUNG       (Device ID: SB-PEMPEK-01)
//   "batagor" -> BATAGOR BANDUNG      (Device ID: SB-BATAGOR-01)
//   "soto"    -> SOTO LAMONGAN        (Device ID: SB-SOTO-01)
// ==============================================================================
const char* MY_BRANCH_ID = "pempek"; // <-- UBAH DI SINI UNTUK SETIAP TAB WOKWI

// --- PIN DEFINITIONS (WOKWI HARDWARE) ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

#define BUZZER_PIN   25
#define LED_PIN      2
#define BTN_PAY_PIN  4

// --- WIFI & CLOUD API CONFIGURATION ---
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
const char* CLOUD_HOST = "https://qripay.vercel.app";

// --- DEVICE STATE ---
String branchName = "";
String deviceSerial = "";
String branchLocation = "";

String lastAnnouncedTxId = "";
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 3000; // Polling setiap 3 detik
unsigned long lastReconnectAttempt = 0;

bool isPaymentActive = false;
unsigned long paymentDisplayStart = 0;
long displayAmount = 0;

// Forward Declarations
void resolveBranchIdentity();
void playChime();
void showStandbyScreen();
void showPaymentScreen(long amount);
void checkCloudTransactions();
void triggerLocalPayment(long amount, const char* payer);
void sendCloudSimulation(long amount);
String formatTerbilang(long n);
String getWIBTime();

void setup() {
  Serial.begin(115200);
  delay(150);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BTN_PAY_PIN, INPUT_PULLUP);
  digitalWrite(LED_PIN, LOW);

  // 1. Tentukan Identitas Cabang & Serial Number Perangkat
  resolveBranchIdentity();

  // 2. Inisialisasi Layar OLED SSD1306
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("[ERR] OLED SSD1306 tidak terdeteksi!"));
    for (;;);
  }

  // Splash Screen Startup
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(12, 10);
  display.println(F("QRIPAY SOUNDBOX IoT"));
  display.setCursor(14, 25);
  display.print(F("ID : "));
  display.println(deviceSerial);
  display.setCursor(14, 38);
  display.println(branchName);
  display.setCursor(12, 52);
  display.println(F("Menghubungkan WiFi.."));
  display.display();

  Serial.println(F("\n========================================================"));
  Serial.println(F("🔊 QRIPAY IoT SOUNDBOX v3.0 (MULTI-DEVICE REGISTRY)"));
  Serial.print(F("🏪 Cabang Kasir       : ")); Serial.println(branchName);
  Serial.print(F("📱 Soundbox Device ID : ")); Serial.println(deviceSerial);
  Serial.print(F("📍 Lokasi Cabang      : ")); Serial.println(branchLocation);
  Serial.print(F("🌐 Server Cloud       : ")); Serial.println(CLOUD_HOST);
  Serial.println(F("========================================================\n"));

  // 3. Sambungkan ke WiFi Virtual Wokwi (Gunakan Channel 6 untuk Bypass Channel Scan Wokwi)
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS, 6);
  Serial.print(F("Menghubungkan ke WiFi Wokwi"));

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 50) {
    delay(150);
    Serial.print(F("."));
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    retry++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH);
    Serial.print(F("🟢 WiFi Terhubung! IP Perangkat: "));
    Serial.println(WiFi.localIP());
    configTime(7 * 3600, 0, "pool.ntp.org");
    Serial.println(F("🟢 Terhubung ke Jaringan QriPay Cloud!"));
    Serial.print(F("⏳ Siap menerima scan QRIS di meja kasir "));
    Serial.println(branchName);
  } else {
    Serial.println(F("⚠️ WiFi Timeout (Mode Simulasi Standalone)"));
  }

  playChime();
  delay(600);
  showStandbyScreen();
}

void loop() {
  unsigned long now = millis();

  // 1. Auto-Reconnect WiFi jika sempat putus
  if (WiFi.status() != WL_CONNECTED && (now - lastReconnectAttempt >= 6000)) {
    lastReconnectAttempt = now;
    WiFi.begin(WIFI_SSID, WIFI_PASS, 6);
  }

  // 2. Tombol Hijau: Uji Simulasi Pembeli Scan di Meja Kasir Cabang Ini
  if (digitalRead(BTN_PAY_PIN) == LOW) {
    delay(250); // Debounce
    triggerLocalPayment(15000, "Pembeli (Scan QRIS Kasir)");
    if (WiFi.status() == WL_CONNECTED) {
      sendCloudSimulation(15000);
    }
  }

  // 3. Polling Cloud API Khusus Cabang Ini (Mendeteksi Transaksi QRIS Real-Time)
  if (WiFi.status() == WL_CONNECTED && (now - lastPollTime >= POLL_INTERVAL)) {
    lastPollTime = now;
    checkCloudTransactions();
  }

  // 4. Kembalikan Tampilan ke Standby setelah 8 detik pembayaran
  if (isPaymentActive && (now - paymentDisplayStart >= 8000)) {
    isPaymentActive = false;
    showStandbyScreen();
  }

  delay(40);
}

// --- RESOLVE IDENTITAS PERANGKAT SESUAI CABANG ---
void resolveBranchIdentity() {
  if (strcmp(MY_BRANCH_ID, "pempek") == 0) {
    branchName = "PEMPEK BANDUNG";
    deviceSerial = "SB-PEMPEK-01";
    branchLocation = "Bandung (Cabang Buah Batu)";
  } else if (strcmp(MY_BRANCH_ID, "batagor") == 0) {
    branchName = "BATAGOR BANDUNG";
    deviceSerial = "SB-BATAGOR-01";
    branchLocation = "Bandung (Cabang Dago)";
  } else if (strcmp(MY_BRANCH_ID, "soto") == 0) {
    branchName = "SOTO LAMONGAN";
    deviceSerial = "SB-SOTO-01";
    branchLocation = "Bandung (Cabang Dipatiukur)";
  } else if (strcmp(MY_BRANCH_ID, "pusat") == 0) {
    branchName = "JUS SMOOTHIES PUSAT";
    deviceSerial = "SB-PUSAT-01";
    branchLocation = "Bandung (Pusat Cipadung)";
  } else {
    branchName = "QRIPAY SOUNDBOX";
    deviceSerial = "SB-CUSTOM-01";
    branchLocation = "Indonesia";
  }
}

// --- CEK TRANSAKSI KHUSUS CABANG INI DARI CLOUD SERVER ---
void checkCloudTransactions() {
  WiFiClientSecure client;
  client.setInsecure(); // Wokwi SSL bypass
  HTTPClient http;
  
  String pollUrl = String(CLOUD_HOST) + "/api/soundbox/poll?branch=" + String(MY_BRANCH_ID) + "&device=" + deviceSerial;
  
  if (http.begin(client, pollUrl)) {
    http.setTimeout(4000);
    int code = http.GET();
    if (code == 200) {
      String payload = http.getString();
      StaticJsonDocument<2560> doc;
      DeserializationError err = deserializeJson(doc, payload);

      if (!err && doc["success"] == true) {
        JsonArray txs = doc["transactions"].as<JsonArray>();
        if (txs.size() > 0) {
          JsonObject latest = txs[0];
          String txId = latest["id"].as<String>();
          long amount = latest["amount"].as<long>();
          const char* payer = latest["payer"] | "Pembeli QRIS";

          if (lastAnnouncedTxId == "") {
            // Sinkronisasi awal saat soundbox baru menyala (jangan langsung bunyi)
            lastAnnouncedTxId = txId;
          } else if (txId != lastAnnouncedTxId) {
            // 🎉 TRANSAKSI BARU KHUSUS MEJA KASIR CABANG INI!
            lastAnnouncedTxId = txId;
            triggerLocalPayment(amount, payer);
          }
        }
      }
    }
    http.end();
  }
}

// --- AKSI PEMBAYARAN DITERIMA (BUZZER + OLED + LED + SUARA) ---
void triggerLocalPayment(long amount, const char* payer) {
  isPaymentActive = true;
  paymentDisplayStart = millis();
  displayAmount = amount;

  // 1. Kedipkan LED Hijau 3x
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, LOW); delay(60);
    digitalWrite(LED_PIN, HIGH); delay(60);
  }

  // 2. Tampilkan di Layar OLED (Nominal Besar + Nama Cabang)
  showPaymentScreen(amount);

  // 3. Bunyikan Bel Transaksi Soundbox (Melodi Do-Mi-Sol)
  playChime();

  // 4. Cetak Kalimat Suara Resmi Soundbox di Serial Monitor
  Serial.println(F("\n========================================================"));
  Serial.println(F("🔔 PEMBAYARAN QRIS DITERIMA DI MEJA KASIR!"));
  Serial.print(F("🏪 Cabang Toko        : ")); Serial.println(branchName);
  Serial.print(F("📱 Soundbox Device ID : ")); Serial.println(deviceSerial);
  Serial.print(F("📍 Lokasi             : ")); Serial.println(branchLocation);
  Serial.print(F("💰 Nominal Uang Masuk : Rp ")); Serial.println(amount);
  Serial.print(F("💳 Pembayar           : ")); Serial.println(payer);
  Serial.print(F("🔊 [SPEAKER SOUNDBOX] : \""));
  Serial.print(formatTerbilang(amount));
  Serial.print(F(" rupiah diterima di "));
  Serial.print(branchName);
  Serial.println(F("\""));
  Serial.println(F("========================================================\n"));
}

// Kirim data simulasi tombol ke server agar sinkron dengan web dashboard
void sendCloudSimulation(long amount) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  
  String triggerUrl = String(CLOUD_HOST) + "/api/soundbox/trigger";
  if (http.begin(client, triggerUrl)) {
    http.addHeader("Content-Type", "application/json");
    String postBody = "{\"branch\":\"" + String(MY_BRANCH_ID) + "\",\"amount\":" + String(amount) + ",\"payer\":\"Tombol Kasir Wokwi\"}";
    http.POST(postBody);
    http.end();
  }
}

// --- MELODI BEL SOUNDBOX (CHIME BELL) ---
void playChime() {
  tone(BUZZER_PIN, 1047, 100); delay(120); // C6 (Do)
  tone(BUZZER_PIN, 1319, 100); delay(120); // E6 (Mi)
  tone(BUZZER_PIN, 1568, 260); delay(280); // G6 (Sol)
  noTone(BUZZER_PIN);
}

// --- TAMPILAN LAYAR OLED STANDBY ---
void showStandbyScreen() {
  display.clearDisplay();

  // Header Bar: WiFi, Jam WIB, Status Baterai
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(WiFi.status() == WL_CONNECTED ? F("WF:OK") : F("WF:--"));

  display.setCursor(44, 0);
  display.print(getWIBTime());

  display.setCursor(94, 0);
  display.print(F("B:98%"));
  display.drawLine(0, 9, 128, 9, SSD1306_WHITE);

  // Tengah: Identitas Cabang & Device ID
  display.setCursor(4, 16);
  display.print(F("KASIR RESMI QRIS:"));

  display.setCursor(4, 28);
  display.print(branchName);

  display.setCursor(4, 40);
  display.print(F("DEV: "));
  display.print(deviceSerial);

  // Footer: Status Menunggu Scan
  display.drawLine(0, 50, 128, 50, SSD1306_WHITE);
  display.setCursor(4, 54);
  display.print(F("STANDBY SIAP SCAN"));

  display.display();
}

// --- TAMPILAN LAYAR OLED PEMBAYARAN MASUK ---
void showPaymentScreen(long amount) {
  display.clearDisplay();

  // Header Bar: Nama Cabang
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(branchName);
  display.drawLine(0, 9, 128, 9, SSD1306_WHITE);

  // Tengah: Nominal Angka Besar & Tebal
  display.setTextSize(2);
  display.setCursor(4, 20);
  display.print(F("Rp "));
  display.print(amount);

  // Footer: Status Lunas
  display.drawLine(0, 48, 128, 48, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(6, 53);
  display.print(F("[V] LUNAS - QRIS KASIR"));

  display.display();
}

// --- JAM WIB REAL-TIME ---
String getWIBTime() {
  struct tm t;
  if (!getLocalTime(&t)) return "12:00";
  char b[8];
  strftime(b, sizeof(b), "%H:%M", &t);
  return String(b);
}

// --- ALGORITMA KONVERSI NOMINAL KE KALIMAT BAHASA INDONESIA ---
String terbilangHelper(long n) {
  const char* satuan[] = {"", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"};
  if (n < 12) return String(satuan[n]);
  if (n < 20) return terbilangHelper(n - 10) + " belas";
  if (n < 100) return terbilangHelper(n / 10) + " puluh" + (n % 10 != 0 ? " " + terbilangHelper(n % 10) : "");
  if (n < 200) return "seratus" + (n % 100 != 0 ? " " + terbilangHelper(n % 100) : "");
  if (n < 1000) return terbilangHelper(n / 100) + " ratus" + (n % 100 != 0 ? " " + terbilangHelper(n % 100) : "");
  if (n < 2000) return "seribu" + (n % 1000 != 0 ? " " + terbilangHelper(n % 1000) : "");
  if (n < 1000000) return terbilangHelper(n / 1000) + " ribu" + (n % 1000 != 0 ? " " + terbilangHelper(n % 1000) : "");
  if (n < 1000000000) return terbilangHelper(n / 1000000) + " juta" + (n % 1000000 != 0 ? " " + terbilangHelper(n % 1000000) : "");
  return String(n);
}

String formatTerbilang(long n) {
  if (n == 0) return "Nol";
  String res = terbilangHelper(abs(n));
  res.trim();
  if (res.length() > 0) {
    res[0] = toupper(res[0]);
  }
  return res;
}
