/*
 * MODUL 4 PART A - PERBURUAN LoRa  |  Peran: BEACON (disembunyikan asisten)
 * Board   : Cosmic LoRa Aurora V2 (ESP32 + RFM95W)
 * Library : SPI.h, LoRa.h oleh Sandeep Mistry, WebSockets oleh Markus Sattler
 *
 * Hanya SATU beacon yang dinyalakan di ruangan. Beacon inilah satu-satunya
 * radio yang memancar, sehingga tidak ada tabrakan paket dan tidak diperlukan
 * pembagian jatah waktu sama sekali. Tiap paket membawa nomor urut dan waktu
 * kirimnya, dan nomor itu juga dilaporkan ke papan skor lewat Wi-Fi supaya
 * paket yang hilang dapat dihitung.
 *
 * Isi setiap bagian rumpang; nomor (1) sampai (6) pada komentar di sebelahnya
 * adalah petunjuknya.
 */

#include <WiFi.h>
#include <SPI.h>
#include <________>  // (1) Header pustaka LoRa peer-to-peer oleh Sandeep Mistry
#include <WebSocketsClient.h>
#include <time.h>
#include <sys/time.h>

const char* WIFI_SSID      = "IRIS-HUNT";
const char* WIFI_PASSWORD  = "iris2026";
const char* SERVER_HOST    = "192.168.4.1";
const uint16_t SERVER_PORT = 8080;

const char* NTP_SERVER      = "192.168.4.1";
const long  GMT_OFFSET_SEC  = 25200;
const int   DST_OFFSET_SEC  = 0;

// Pin radio RFM95W pada board Cosmic LoRa Aurora V2.
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32
#define SPI_MISO  19
#define SPI_MOSI  23
#define SPI_SCK   18

// Keempat nilai ini harus sama persis dengan seluruh hunter.
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF3

// Daya pancar disetel menurut UKURAN ARENA, bukan dibesarkan sebisanya. Pada
// 20 dBm seluruh gedung terbaca "dekat" dan beacon mustahil ditemukan; pada
// daya terlalu kecil hunter terjauh tidak mendengar apa pun sejak awal.
// Satu ruangan: 2. Satu lantai gedung: 10. Gedung besar: 14.
#define BEACON_TX_POWER 10

// Satu paket kira-kira 20 ms di udara. Jeda 200 ms berarti kanal terpakai
// sekitar sepersepuluh waktu saja.
const unsigned long BEACON_PERIOD_MS = 200;

WebSocketsClient webSocket;

uint32_t seq = 0;
unsigned long lastChirp = 0;

String wallClockTimestamp() {
  struct timeval tv;
  gettimeofday(&tv, NULL);

  struct tm timeinfo;
  localtime_r(&tv.tv_sec, &timeinfo);

  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%02d:%02d:%02d:%03ld",
           timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec,
           (long)(tv.tv_usec / 1000L));
  return String(buffer);
}

void connectToWiFi() {
  Serial.print("Menyambung ke hotspot Orange Pi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  WiFi.setSleep(false);
  Serial.printf("\nTerhubung, alamat IP beacon: %s\n",
                WiFi.localIP().toString().c_str());
}

void syncClock() {
  Serial.print("Menyelaraskan jam ke Orange Pi");
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, ________);  // (2) Alamat server NTP

  struct tm timeinfo;
  while (!getLocalTime(&timeinfo, 1000)) {
    Serial.print(".");
  }

  Serial.printf("\nJam tersinkronisasi: %s\n", wallClockTimestamp().c_str());
}

void startRadio() {
  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);  // Rangkaian pengaktif radio dinyalakan
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  while (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("Radio RFM95W belum terdeteksi, mencoba lagi...");
    delay(500);
  }

  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(________);  // (3) Konstanta lebar pita radio
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(________);  // (4) Konstanta daya pancar beacon
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectToWiFi();
  syncClock();
  startRadio();

  webSocket.begin(SERVER_HOST, SERVER_PORT, "/beacon");
  webSocket.setReconnectInterval(2000);
  WiFi.setAutoReconnect(true);

  Serial.println("Beacon memancar. Sembunyikan papan ini sekarang.");
}

void loop() {
  webSocket.loop();

  if (millis() - lastChirp < BEACON_PERIOD_MS) {
    return;
  }

  lastChirp = millis();
  seq++;

  String sentAt = wallClockTimestamp();
  String payload = String(seq) + " " + sentAt;

  LoRa.beginPacket();
  LoRa.print(________);  // (5) Variabel isi paket yang disusun di atas
  LoRa.________();  // (6) Metode pemancar paket yang sudah disiapkan

  // Papan skor perlu tahu nomor paket yang benar-benar dipancarkan, supaya
  // paket yang tidak sampai ke sebuah hunter dapat dihitung sebagai hilang.
  char report[64];
  snprintf(report, sizeof(report), "{\"seq\":%lu,\"tx\":\"%s\"}",
           (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Memancar paket #%lu\n", sentAt.c_str(),
                (unsigned long)seq);
}
