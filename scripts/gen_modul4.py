#!/usr/bin/env python3
"""Generate Module 4 Part A per-group sketches and their answer keys.

Every group gets a self-contained folder holding `hunter.ino` and `beacon.ino`,
so a group copies one folder and flashes it without editing anything. The only
line that differs between folders is `#define GROUP_ID n`; `beacon.ino` is
identical everywhere, so any group's board can be the one the assistant hides.

Run from the project root:

    python scripts/gen_modul4.py

Writes:
    kode_praktikum/{id,en}/modul4/grup1..grup7/{hunter,beacon}.ino   blanks intact
    kunci_jawaban/{id,en}/modul4/grup1..grup7/{hunter,beacon}.ino    blanks filled

The generator is the single source of truth. Editing a generated file by hand is
wasted work because the next run overwrites it; edit the templates below.
"""

import pathlib
import re
import sys

GROUPS = range(1, 8)
MARKER = "_" * 8
GROUP_TOKEN = "@@GROUP_ID@@"
LABEL = re.compile(r"(?://|#)\s*\((\d+)\)")

# The answer for each numbered blank, per sketch. Both language tracks share
# these because only comments and printed strings differ between them.
ANSWERS = {
    "hunter.ino": {
        1: "LoRa.h",
        2: "WIFI_PASSWORD",
        3: "LORA_SPREADING_FACTOR",
        4: "LORA_SYNC_WORD",
        5: "packetRssi",
        6: "sendTXT",
    },
    "beacon.ino": {
        1: "LoRa.h",
        2: "NTP_SERVER",
        3: "LORA_BANDWIDTH",
        4: "BEACON_TX_POWER",
        5: "payload",
        6: "endPacket",
    },
}

# --------------------------------------------------------------------------
# Shared radio + network configuration, spelled the same way in both sketches
# and in both languages so a mismatch is visible at a glance.
# --------------------------------------------------------------------------

HUNTER_ID = r'''/*
 * MODUL 4 PART A - PERBURUAN LoRa  |  Peran: HUNTER (Kelompok @@GROUP_ID@@)
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
#include <@@BLANK1@@>  // (1) Header pustaka LoRa peer-to-peer oleh Sandeep Mistry
#include <WebSocketsClient.h>
#include <time.h>
#include <sys/time.h>

#define GROUP_ID @@GROUP_ID@@

// Orange Pi menjadi access point, papan skor, sekaligus server NTP.
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
  WiFi.begin(WIFI_SSID, @@BLANK2@@);  // (2) Variabel kata sandi Wi-Fi

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

  LoRa.setSpreadingFactor(@@BLANK3@@);  // (3) Konstanta spreading factor
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setSyncWord(@@BLANK4@@);  // (4) Konstanta penanda pasangan, sama dengan beacon
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

  int rssi = LoRa.@@BLANK5@@();  // (5) Metode pembaca kekuatan sinyal paket
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

  webSocket.@@BLANK6@@(payload);  // (6) Metode pengirim pesan teks

  Serial.printf("[%s] Paket #%s | RSSI %d dBm (halus %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}
'''

HUNTER_EN = r'''/*
 * MODULE 4 PART A - LoRa HUNT  |  Role: HUNTER (Group @@GROUP_ID@@)
 * Board   : Cosmic LoRa Aurora V2 (ESP32 + RFM95W)
 * Library : SPI.h, LoRa.h by Sandeep Mistry, WebSockets by Markus Sattler
 *
 * The hunter only LISTENS; its radio never transmits. That is why the six
 * group boards cannot collide with each other in the air. Every beacon packet
 * it catches is measured for signal strength, smoothed, then sent to the
 * scoreboard over Wi-Fi.
 *
 * Fill in every blank section; the numbers (1) through (6) in the comment
 * beside each one are the hints.
 */

#include <WiFi.h>
#include <SPI.h>
#include <@@BLANK1@@>  // (1) LoRa peer-to-peer library header by Sandeep Mistry
#include <WebSocketsClient.h>
#include <time.h>
#include <sys/time.h>

#define GROUP_ID @@GROUP_ID@@

// The Orange Pi is the access point, the scoreboard, and the NTP server.
const char* WIFI_SSID      = "IRIS-HUNT";
const char* WIFI_PASSWORD  = "iris2026";
const char* SERVER_HOST    = "192.168.4.1";
const uint16_t SERVER_PORT = 8080;

const char* NTP_SERVER      = "192.168.4.1";
const long  GMT_OFFSET_SEC  = 25200;
const int   DST_OFFSET_SEC  = 0;

// RFM95W radio pins on the Cosmic LoRa Aurora V2 board.
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32
#define SPI_MISO  19
#define SPI_MOSI  23
#define SPI_SCK   18

// These four values must match the beacon exactly, otherwise its packets are
// simply silent.
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF3

// Indoors, RSSI jumps by as much as 10 dB from wall reflections. The median
// throws the spikes away and the EWMA smooths what is left. Without both
// filters the distance bar on the scoreboard is nothing but noise.
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

// The middle value of the last five readings.
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
  Serial.print("Connecting to the Orange Pi hotspot");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, @@BLANK2@@);  // (2) Wi-Fi password variable

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  // Without this line, modem sleep adds over 100 ms to every send and the
  // delay you record measures the wrong thing.
  WiFi.setSleep(false);

  Serial.printf("\nConnected, hunter IP address: %s\n",
                WiFi.localIP().toString().c_str());
}

void syncClock() {
  Serial.print("Synchronising the clock to the Orange Pi");
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER);

  struct tm timeinfo;
  while (!getLocalTime(&timeinfo, 1000)) {
    Serial.print(".");
  }

  Serial.printf("\nClock synchronised: %s\n", wallClockTimestamp().c_str());
}

void startRadio() {
  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);  // Switch the radio enable circuit on
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  while (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("RFM95W radio not detected yet, retrying...");
    delay(500);
  }

  LoRa.setSpreadingFactor(@@BLANK3@@);  // (3) Spreading factor constant
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setSyncWord(@@BLANK4@@);  // (4) Pairing marker constant, same as the beacon
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

  Serial.printf("Group %d hunter is ready and listening.\n", GROUP_ID);
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

  int rssi = LoRa.@@BLANK5@@();  // (5) Method that reads the packet signal strength
  float snr = LoRa.packetSnr();

  // A beacon packet holds "<packet no.> <send time>", separated by one space.
  int space = beaconLine.indexOf(' ');
  if (space < 0) {
    return;  // The packet was corrupted in the air; just ignore it.
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

  webSocket.@@BLANK6@@(payload);  // (6) Method that sends a text message

  Serial.printf("[%s] Packet #%s | RSSI %d dBm (smoothed %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}
'''

BEACON_ID = r'''/*
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
#include <@@BLANK1@@>  // (1) Header pustaka LoRa peer-to-peer oleh Sandeep Mistry
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
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, @@BLANK2@@);  // (2) Alamat server NTP

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
  LoRa.setSignalBandwidth(@@BLANK3@@);  // (3) Konstanta lebar pita radio
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(@@BLANK4@@);  // (4) Konstanta daya pancar beacon
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
  LoRa.print(@@BLANK5@@);  // (5) Variabel isi paket yang disusun di atas
  LoRa.@@BLANK6@@();  // (6) Metode pemancar paket yang sudah disiapkan

  // Papan skor perlu tahu nomor paket yang benar-benar dipancarkan, supaya
  // paket yang tidak sampai ke sebuah hunter dapat dihitung sebagai hilang.
  char report[64];
  snprintf(report, sizeof(report), "{\"seq\":%lu,\"tx\":\"%s\"}",
           (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Memancar paket #%lu\n", sentAt.c_str(),
                (unsigned long)seq);
}
'''

BEACON_EN = r'''/*
 * MODULE 4 PART A - LoRa HUNT  |  Role: BEACON (hidden by the assistant)
 * Board   : Cosmic LoRa Aurora V2 (ESP32 + RFM95W)
 * Library : SPI.h, LoRa.h by Sandeep Mistry, WebSockets by Markus Sattler
 *
 * Only ONE beacon is switched on in the room. This beacon is the only radio
 * that transmits at all, so there are no packet collisions and no time-slot
 * scheme is needed whatsoever. Every packet carries a sequence number and its
 * send time, and that number is also reported to the scoreboard over Wi-Fi so
 * lost packets can be counted.
 *
 * Fill in every blank section; the numbers (1) through (6) in the comment
 * beside each one are the hints.
 */

#include <WiFi.h>
#include <SPI.h>
#include <@@BLANK1@@>  // (1) LoRa peer-to-peer library header by Sandeep Mistry
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

// RFM95W radio pins on the Cosmic LoRa Aurora V2 board.
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32
#define SPI_MISO  19
#define SPI_MOSI  23
#define SPI_SCK   18

// These four values must match every hunter exactly.
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF3

// The transmit power is matched to the SIZE OF THE ARENA, not turned up as
// far as it goes. At 20 dBm the whole building reads as "close" and the
// beacon cannot be found; too low and the farthest hunter never hears it.
// One room: 2. One floor of a building: 10. A large building: 14.
#define BEACON_TX_POWER 10

// One packet is roughly 20 ms in the air. A 200 ms gap means the channel is
// busy only about a tenth of the time.
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
  Serial.print("Connecting to the Orange Pi hotspot");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  WiFi.setSleep(false);
  Serial.printf("\nConnected, beacon IP address: %s\n",
                WiFi.localIP().toString().c_str());
}

void syncClock() {
  Serial.print("Synchronising the clock to the Orange Pi");
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, @@BLANK2@@);  // (2) NTP server address

  struct tm timeinfo;
  while (!getLocalTime(&timeinfo, 1000)) {
    Serial.print(".");
  }

  Serial.printf("\nClock synchronised: %s\n", wallClockTimestamp().c_str());
}

void startRadio() {
  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);  // Switch the radio enable circuit on
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  while (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("RFM95W radio not detected yet, retrying...");
    delay(500);
  }

  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(@@BLANK3@@);  // (3) Radio bandwidth constant
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(@@BLANK4@@);  // (4) Beacon transmit power constant
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

  Serial.println("Beacon transmitting. Hide this board now.");
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
  LoRa.print(@@BLANK5@@);  // (5) Variable holding the packet built above
  LoRa.@@BLANK6@@();  // (6) Method that transmits the prepared packet

  // The scoreboard needs to know which packet numbers were actually sent, so
  // that a packet which never reached a hunter can be counted as lost.
  char report[64];
  snprintf(report, sizeof(report), "{\"seq\":%lu,\"tx\":\"%s\"}",
           (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Transmitted packet #%lu\n", sentAt.c_str(),
                (unsigned long)seq);
}
'''

TEMPLATES = {
    ("id", "hunter.ino"): HUNTER_ID,
    ("en", "hunter.ino"): HUNTER_EN,
    ("id", "beacon.ino"): BEACON_ID,
    ("en", "beacon.ino"): BEACON_EN,
}


# The answer key relabels its own header so a file handed out by mistake
# announces itself. Both versions are two lines, so line numbers are identical
# between a sketch and its key -- the slide deck cites those numbers.
HEADER_STUDENT = {
    "id": (" * Isi setiap bagian rumpang; nomor (1) sampai (6) pada komentar di sebelahnya" + chr(10) +
           " * adalah petunjuknya."),
    "en": (" * Fill in every blank section; the numbers (1) through (6) in the comment" + chr(10) +
           " * beside each one are the hints."),
}
HEADER_KEY = {
    "id": (" * KUNCI JAWABAN. Seluruh bagian rumpang sudah terisi; nomor (1) sampai (6) pada" + chr(10) +
           " * komentar di sebelahnya menandai jawaban yang dinilai."),
    "en": (" * ANSWER KEY. Every blank is already filled in; the numbers (1) through (6) in" + chr(10) +
           " * the comment beside each one mark the graded answers."),
}


def render(template: str, group: int, filled: bool, answers: dict,
           lang: str = "id") -> str:
    """Substitute the group number and either blank or fill every slot."""
    out = template.replace(GROUP_TOKEN, str(group))
    for n in range(1, 7):
        token = "@@BLANK%d@@" % n
        out = out.replace(token, answers[n] if filled else MARKER)

    if filled:
        student = HEADER_STUDENT[lang]
        assert student in out, "header to relabel not found for %s" % lang
        out = out.replace(student, HEADER_KEY[lang], 1)

    return out


def audit(path: pathlib.Path, text: str, expect_markers: bool) -> None:
    """Enforce the project's blank convention before anything is written."""
    lines = text.split("\n")
    seen = []

    for line in lines:
        if MARKER not in line:
            continue
        if line.count(MARKER) != 1:
            sys.exit("FAIL %s: more than one blank on a line:\n%s" % (path, line))
        m = LABEL.search(line)
        if not m:
            sys.exit("FAIL %s: blank without an (n) label:\n%s" % (path, line))
        seen.append(int(m.group(1)))

    if expect_markers and seen != [1, 2, 3, 4, 5, 6]:
        sys.exit("FAIL %s: labels are %s, expected [1..6]" % (path, seen))
    if not expect_markers and seen:
        sys.exit("FAIL %s: answer key still holds blanks %s" % (path, seen))


def main() -> None:
    root = pathlib.Path(".")
    if not (root / "template" / "template.typ").exists():
        sys.exit("Run this from the project root (the folder holding template/).")

    written = 0
    for lang in ("id", "en"):
        for tree, filled in (("kode_praktikum", False), ("kunci_jawaban", True)):
            for group in GROUPS:
                folder = root / tree / lang / "modul4" / ("grup%d" % group)
                folder.mkdir(parents=True, exist_ok=True)

                for name in ("hunter.ino", "beacon.ino"):
                    text = render(TEMPLATES[(lang, name)], group,
                                  filled, ANSWERS[name], lang)
                    path = folder / name
                    audit(path, text, expect_markers=not filled)
                    path.write_bytes(text.encode("utf-8"))
                    written += 1

    print("ok  %d files written across kode_praktikum/ and kunci_jawaban/" % written)


if __name__ == "__main__":
    main()
