/*
 * MODUL 4 PART A - PERBURUAN LoRa  |  Peran: BEACON (Kelompok 1,
 * disembunyikan asisten)
 * Memancar hanya di jendela waktu (slot) miliknya sendiri, bergiliran dengan
 * keempat pasangan lain dalam satu periode bersama, sehingga kelima beacon
 * berbagi kanal yang sama tanpa pernah bertabrakan. Tiap paket membawa nomor
 * urut dan waktu kirimnya, dilaporkan juga ke papan skor lewat Wi-Fi supaya
 * paket yang hilang dapat dihitung.
 *
 * Isi setiap bagian rumpang; nomor (1) sampai (6) pada komentar di sebelahnya
 * adalah petunjuknya.
 */

#include <WiFi.h>
#include <SPI.h>
// Pasang lewat Library Manager: "LoRa" oleh Sandeep Mistry | PlatformIO: lib_deps = sandeepmistry/LoRa
#include <________>  // (1) Header pustaka LoRa peer-to-peer oleh Sandeep Mistry
// Pasang lewat Library Manager: "WebSockets" oleh Markus Sattler | PlatformIO: lib_deps = links2004/WebSockets
#include <WebSocketsClient.h>
#include <time.h>
#include <sys/time.h>

#define GROUP_ID 1

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

// Keempat nilai ini harus sama persis dengan hunter pasangannya sendiri --
// pasangan lain sengaja memakai LORA_SYNC_WORD yang berbeda, supaya kelima
// radio tidak saling mendengar.
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF1

// Daya pancar disetel menurut UKURAN ARENA, bukan dibesarkan sebisanya. Pada
// 20 dBm seluruh gedung terbaca "dekat" dan beacon mustahil ditemukan; pada
// daya terlalu kecil hunter terjauh tidak mendengar apa pun sejak awal.
// Satu ruangan: 2. Satu lantai gedung: 10. Gedung besar: 14.
#define BEACON_TX_POWER 10

// Jadwal TDMA: satu periode 500 ms dibagi lima slot 100 ms, satu slot per
// kelompok dipilih oleh GROUP_ID, sehingga kelima beacon berbagi kanal yang
// sama tanpa pernah bertabrakan -- tak satu pun memancar di luar slotnya
// sendiri. Ini menggantikan jeda tetap versi sebelumnya, yang hanya aman
// selama cuma ada satu beacon menyala di udara.
const unsigned long TDMA_PERIOD_MS = 500;
const unsigned long TDMA_SLOT_MS   = 100;
unsigned long nextFireAt = 0;

WebSocketsClient webSocket;

uint32_t seq = 0;

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

  // Kelompok 1 memancar di awal setiap periode, kelompok 2 seratus
  // milidetik sesudahnya, dan seterusnya -- lihat komentar TDMA_* di atas.
  nextFireAt = millis() + (unsigned long)(GROUP_ID - 1) * TDMA_SLOT_MS;

  webSocket.begin(SERVER_HOST, SERVER_PORT, "/beacon");
  webSocket.setReconnectInterval(2000);
  WiFi.setAutoReconnect(true);

  Serial.println("Beacon memancar. Sembunyikan papan ini sekarang.");
}

void loop() {
  webSocket.loop();

  if ((long)(millis() - nextFireAt) < 0) {
    return;
  }
  nextFireAt += TDMA_PERIOD_MS;

  seq++;

  String sentAt = wallClockTimestamp();
  String payload = String(GROUP_ID) + " " + String(seq) + " " + sentAt;

  LoRa.beginPacket();
  LoRa.print(________);  // (5) Variabel isi paket yang disusun di atas
  LoRa.________();  // (6) Metode pemancar paket yang sudah disiapkan

  // Papan skor perlu tahu nomor paket yang benar-benar dipancarkan, supaya
  // paket yang tidak sampai ke sebuah hunter dapat dihitung sebagai hilang.
  char report[80];
  snprintf(report, sizeof(report), "{\"grup\":%d,\"seq\":%lu,\"tx\":\"%s\"}",
           GROUP_ID, (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Memancar paket #%lu (kelompok %d)\n", sentAt.c_str(),
                (unsigned long)seq, GROUP_ID);
}
