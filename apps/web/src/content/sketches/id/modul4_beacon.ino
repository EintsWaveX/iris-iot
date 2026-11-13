/*
 * MODUL 4 - PERBURUAN LoRa  |  Peran: BEACON (Kelompok 1,
 * disembunyikan asisten)
 * Memancar hanya di slot waktunya sendiri, bergiliran dengan beacon
 * kelompok lain dalam satu periode bersama, sehingga semua beacon
 * berbagi kanal yang sama tanpa saling menimpa. Tiap paket membawa nomor
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

const char* WIFI_SSID      = "IRIS-G1";
const char* WIFI_PASSWORD  = "13015954";
const char* SERVER_HOST    = "hunt.irisiotlab.com";
const uint16_t SERVER_PORT = 443;
const char* HUNT_KEY       = "KUNCI-SITUS";  // Kunci papan dari langkah Perburuan situs
const char* NTP_SERVER      = "time.cloudflare.com";
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

// Jadwal TDMA: satu periode 500 ms dibagi sepuluh slot 50 ms, satu slot per
// kelompok (kelompok 11 dan seterusnya berbagi slot dengan kelompok 10 di
// bawahnya). Slot mengikuti jam NTP yang baru disinkronkan, bukan waktu papan
// dinyalakan, jadi tiap beacon benar-benar memancar di slotnya. Satu paket
// butuh sekitar 30 ms; sisa slot menampung selisih jam.
const unsigned long TDMA_PERIOD_MS = 500;
const unsigned long TDMA_SLOT_MS   = 50;
const int           TDMA_SLOTS     = 10;
int64_t nextFireAt = 0;

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
  Serial.print("Menyambung ke hotspot ponsel");

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
  Serial.print("Menyelaraskan jam");
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

// Milidetik sejak 1970 menurut jam NTP, dan saat berikutnya yang jatuh di slot
// kelompok ini. Slot mengikuti jam NTP, bukan waktu papan dinyalakan.
int64_t clockMs() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

int64_t nextSlot(int64_t now) {
  int64_t start = now - now % TDMA_PERIOD_MS + (GROUP_ID - 1) % TDMA_SLOTS * TDMA_SLOT_MS;
  return start > now ? start : start + TDMA_PERIOD_MS;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectToWiFi();
  syncClock();
  startRadio();

  // Pancaran pertama jatuh di slot kelompok ini yang berikutnya menurut jam NTP
  // (lihat komentar TDMA_* di atas), bukan sejak papan dinyalakan.
  nextFireAt = nextSlot(clockMs());

  webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/beacon");
  webSocket.setReconnectInterval(2000);
  WiFi.setAutoReconnect(true);

  Serial.println("Beacon memancar. Sembunyikan papan ini sekarang.");
}

void loop() {
  webSocket.loop();

  int64_t now = clockMs();
  if (now < nextFireAt) {
    return;
  }
  nextFireAt = nextSlot(now);

  seq++;

  String sentAt = wallClockTimestamp();
  String payload = String(GROUP_ID) + " " + String(seq) + " " + sentAt;

  LoRa.beginPacket();
  LoRa.print(________);  // (5) Variabel isi paket yang disusun di atas
  LoRa.________();  // (6) Metode pemancar paket yang sudah disiapkan

  // Papan skor perlu tahu nomor paket yang benar-benar dipancarkan, supaya
  // paket yang tidak sampai ke sebuah hunter dapat dihitung sebagai hilang.
  char report[96];
  snprintf(report, sizeof(report), "{\"grup\":%d,\"k\":\"%s\",\"seq\":%lu,\"tx\":\"%s\"}",
           GROUP_ID, HUNT_KEY, (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Memancar paket #%lu (kelompok %d)\n", sentAt.c_str(),
                (unsigned long)seq, GROUP_ID);
}
