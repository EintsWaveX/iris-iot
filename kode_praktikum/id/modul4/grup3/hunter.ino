/*
 * MODUL 4 PART A - PERBURUAN LoRa  |  Peran: HUNTER (Kelompok 3)
 * Board   : Cosmic LoRa Aurora V2 (ESP32 + RFM95W)
 * Library : SPI.h, LoRa.h oleh Sandeep Mistry, WebSockets oleh Markus Sattler
 *
 * Hunter hanya MENDENGARKAN; radionya tidak pernah memancar. Karena itu papan
 * keenam kelompok tidak mungkin saling bertabrakan di udara. Tiap paket beacon
 * yang tertangkap diukur kekuatan sinyalnya, dihaluskan, lalu dikirim ke papan
 * skor melalui Wi-Fi.
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

#define GROUP_ID 3

// Orange Pi menjadi access point, papan skor, sekaligus server NTP.
const char* WIFI_SSID      = "IRIS-IOT";
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

// Keempat nilai ini harus sama persis dengan beacon, jika tidak paketnya
// hanya hening.
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF3

// RSSI di dalam ruangan melonjak sampai 10 dB karena pantulan dinding. Median
// membuang lonjakannya, EWMA menghaluskan sisanya. Tanpa kedua tapis ini
// batang jarak pada papan skor hanya berisi derau.
const int   MEDIAN_N   = 5;
const float EWMA_ALPHA = 0.25;

WebSocketsClient webSocket;

int   window[MEDIAN_N];
int   windowCount = 0;
float smoothed    = 0;
bool  haveSmoothed = false;

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

// Nilai tengah dari lima pembacaan terakhir.
int median() {
  int s[MEDIAN_N];
  memcpy(s, window, windowCount * sizeof(int));

  for (int i = 1; i < windowCount; i++) {
    int key = s[i], j = i - 1;
    while (j >= 0 && s[j] > key) { s[j + 1] = s[j]; j--; }
    s[j + 1] = key;
  }
  return s[windowCount / 2];
}

float smoothRssi(int rssi) {
  if (windowCount < MEDIAN_N) {
    window[windowCount++] = rssi;
  } else {
    for (int i = 1; i < MEDIAN_N; i++) window[i - 1] = window[i];
    window[MEDIAN_N - 1] = rssi;
  }

  int m = median();
  if (!haveSmoothed) {
    smoothed = m;
    haveSmoothed = true;
  } else {
    smoothed = EWMA_ALPHA * m + (1 - EWMA_ALPHA) * smoothed;
  }
  return smoothed;
}

void connectToWiFi() {
  Serial.print("Menyambung ke hotspot Orange Pi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, ________);  // (2) Variabel kata sandi Wi-Fi

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  // Tanpa baris ini, modem sleep menambah lebih dari 100 ms pada tiap
  // pengiriman dan delay yang kalian catat jadi salah ukur.
  WiFi.setSleep(false);

  Serial.printf("\nTerhubung, alamat IP hunter: %s\n",
                WiFi.localIP().toString().c_str());
}

void syncClock() {
  Serial.print("Menyelaraskan jam ke Orange Pi");
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER);

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

  LoRa.setSpreadingFactor(________);  // (3) Konstanta spreading factor
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setSyncWord(________);  // (4) Konstanta penanda pasangan, sama dengan beacon
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectToWiFi();
  syncClock();
  startRadio();

  webSocket.begin(SERVER_HOST, SERVER_PORT, "/hunter");
  webSocket.setReconnectInterval(2000);
  WiFi.setAutoReconnect(true);

  Serial.printf("Hunter kelompok %d siap mendengarkan.\n", GROUP_ID);
}

void loop() {
  webSocket.loop();

  if (LoRa.parsePacket() == 0) {
    return;
  }

  String beaconLine = "";
  while (LoRa.available()) {
    beaconLine += (char)LoRa.read();
  }

  String receivedAt = wallClockTimestamp();

  int rssi = LoRa.________();  // (5) Metode pembaca kekuatan sinyal paket
  float snr = LoRa.packetSnr();

  // Paket beacon berisi "<no. paket> <waktu kirim>", dipisahkan satu spasi.
  int space = beaconLine.indexOf(' ');
  if (space < 0) {
    return;  // Paket rusak di udara; abaikan saja.
  }

  String seq    = beaconLine.substring(0, space);
  String sentAt = beaconLine.substring(space + 1);

  char payload[192];
  snprintf(payload, sizeof(payload),
           "{\"grup\":%d,\"seq\":%s,\"rssi\":%d,\"halus\":%.1f,\"snr\":%.1f,"
           "\"tx\":\"%s\",\"rx\":\"%s\",\"ip\":\"%s\"}",
           GROUP_ID, seq.c_str(), rssi, smoothRssi(rssi), snr,
           sentAt.c_str(), receivedAt.c_str(),
           WiFi.localIP().toString().c_str());

  webSocket.________(payload);  // (6) Metode pengirim pesan teks

  Serial.printf("[%s] Paket #%s | RSSI %d dBm (halus %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}
