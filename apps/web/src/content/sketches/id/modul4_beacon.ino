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
#include <esp_sntp.h>
#include <time.h>
#include <sys/time.h>

#define GROUP_ID 1

// ESP32 hanya bisa 2,4 GHz. iPhone: Pengaturan > Hotspot Pribadi > nyalakan
// "Maksimalkan Kompatibilitas", dan tetap di layar itu selagi papan menyambung.
// Android: Hotspot > Pita > 2,4 GHz, Keamanan > WPA2. Biarkan data seluler menyala.
const char* WIFI_SSID      = "IRIS-G1";
const char* WIFI_PASSWORD  = "13015954";
const char* SERVER_HOST    = "hunt.irisiotlab.com";
const uint16_t SERVER_PORT = 443;
const char* HUNT_KEY       = "KUNCI-SITUS";  // Kunci papan dari langkah Perburuan situs
const char* NTP_SERVER      = "time.cloudflare.com";
const long  GMT_OFFSET_SEC  = 25200;
const int   DST_OFFSET_SEC  = 0;

// Server waktu cadangan, dipakai bila NTP_SERVER tidak menjawab.
const char* NTP_FALLBACK_1  = "pool.ntp.org";
const char* NTP_FALLBACK_2  = "time.google.com";

// Hotspot ponsel bukan router lab: ia bisa di pita 5 GHz, membuang UDP, tertidur
// atau kehilangan data seluler. Karena itu tidak ada langkah di sketsa ini yang
// menunggu selamanya: langkah yang gagal menyebut sebabnya, menyerah setelah
// berkas) mencobanya lagi di latar. Radio tidak pernah menunggu salah satunya:
// beacon yang menyala ulang saat tersembunyi harus tetap memancar.
const uint32_t WIFI_TIMEOUT_MS  = 20000;  // satu percobaan menyambung ke hotspot
const uint32_t WIFI_RETRY_MS    = 20000;  // jeda antar percobaan saat berjalan
const uint32_t CLOCK_TIMEOUT_MS = 20000;  // berapa lama setup() menunggu NTP
const uint32_t STATUS_EVERY_MS  = 5000;   // baris status di Serial Monitor

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
bool    slotsOnClock = false;  // true bila nextFireAt dihitung di atas jam yang sudah disetel

WebSocketsClient webSocket;

uint32_t seq = 0;

volatile bool clockSynced  = false;  // true setelah NTP atau papan skor menyetel jam
volatile bool clockFromNtp = false;  // true bila dari NTP (yang paling teliti)
bool     socketUp      = false;      // soket papan skor sedang terbuka
uint32_t socketDrops   = 0;          // berapa kali soket tertutup sendiri
uint32_t wifiUpSince   = 0;          // millis() saat Wi-Fi naik, 0 selama mati
uint32_t lastWifiTryAt = 0;
uint32_t lastStatusAt  = 0;
uint32_t lastReportAt  = 0;
uint32_t lastTimeAskAt = 0;

String wallClockTimestamp() {
  if (!clockSynced) return String("-");  // jam yang belum disetel akan berkata 1970: laporkan "belum ada waktu"

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

// Memulai (atau mengulang) penyambungan ke hotspot, lalu langsung kembali.
void beginWiFi() {
  WiFi.persistent(false);  // jangan tulis ke flash, dan jangan pakai jaringan lama yang tersimpan
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect();       // buang percobaan setengah jadi sebelum memulai yang baru
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiTryAt = millis();
}

bool connectToWiFi() {
  Serial.print("Menyambung ke hotspot ponsel");

  beginWiFi();

  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    explainWiFi();
    return false;
  }

  WiFi.setSleep(false);
  Serial.printf("\nTerhubung, alamat IP beacon: %s (sinyal %d dBm)\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

// Dipanggil pustaka waktu begitu balasan NTP yang sungguhan menyetel jam.
void onNtpSynced(struct timeval* tv) {
  clockSynced  = true;
  clockFromNtp = true;
}

void syncClock() {
  Serial.print("Menyelaraskan jam");
  sntp_set_time_sync_notification_cb(onNtpSynced);
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, ________, NTP_FALLBACK_1, NTP_FALLBACK_2);  // (2) Alamat server NTP

  uint32_t started = millis();
  while (!clockSynced && WiFi.status() == WL_CONNECTED &&
         millis() - started < CLOCK_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (clockSynced) {
    Serial.printf("\nJam tersinkronisasi: %s\n", wallClockTimestamp().c_str());
  } else {
    Serial.println("\nBelum ada waktu. Lanjut dulu: jam disetel begitu server waktu, atau papan skor, menjawab.");
  }
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

  // Radio didahulukan dan tak ada yang sesudahnya bisa menghentikannya: Wi-Fi
  // dan jam hanya menambah laporan ke papan skor serta slot yang tepat, dan
  // keepOnline() mencobanya lagi di latar.
  startRadio();
  connectToWiFi();
  syncClock();

  // Pancaran pertama jatuh di slot kelompok ini yang berikutnya menurut jam NTP
  // (lihat komentar TDMA_* di atas), bukan sejak papan dinyalakan.
  nextFireAt = nextSlot(clockMs());
  slotsOnClock = clockSynced;

  webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/beacon");
  webSocket.onEvent(onSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);  // tautan mati ketahuan dalam detik, bukan menit
  WiFi.setAutoReconnect(true);

  if (WiFi.status() == WL_CONNECTED && clockSynced) {
    Serial.println("Beacon memancar. Sembunyikan papan ini sekarang.");
  } else {
    Serial.println("Beacon memancar, tetapi BELUM siap disembunyikan: belum online. Baca baris di atas.");
  }
}

void loop() {
  webSocket.loop();
  keepOnline();

  int64_t now = clockMs();
  // Slot hidup di atas jam. Saat jam pertama kali disetel (atau melompat), cari
  // lagi slot kelompok ini yang berikutnya, jangan menunggu saat yang sudah bergeser.
  if (clockSynced != slotsOnClock || nextFireAt - now > (int64_t)TDMA_PERIOD_MS) {
    slotsOnClock = clockSynced;
    nextFireAt = nextSlot(now);
  }
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

// ===========================================================================
// Tetap online. Tidak ada yang perlu diisi di bawah ini: bacalah untuk melihat
// bagaimana papan menghadapi hotspot yang rewel, dan arti baris Serial Monitor-nya.
// ===========================================================================

// Menyebut dengan kata sederhana mengapa papan belum ada di Wi-Fi.
void explainWiFi() {
  wl_status_t status = WiFi.status();
  if (status == WL_NO_SSID_AVAIL) {
    Serial.printf("\nWi-Fi \"%s\" tidak ditemukan. Hotspot menyala dan namanya persis itu? Apakah di 2,4 GHz\n"
                  "(iPhone: Maksimalkan Kompatibilitas; Android: Pita > 2,4 GHz)? iPhone harus tetap di\n"
                  "layar Hotspot Pribadi selagi papan menyambung.\n", WIFI_SSID);
  } else if (status == WL_CONNECT_FAILED) {
    Serial.printf("\nWi-Fi \"%s\" menolak papan. Periksa kata sandinya, dan setel keamanan hotspot\n"
                  "ke WPA2 (bukan WPA3 saja).\n", WIFI_SSID);
  } else {
    Serial.printf("\nBelum di Wi-Fi \"%s\" (status %d). Hotspot mati, pita 5 GHz, kata sandi salah atau\n"
                  "keamanan WPA3 saja adalah penyebab yang paling sering.\n", WIFI_SSID, (int)status);
  }
}

// Bila balasan NTP tidak pernah datang (sebagian hotspot dan operator
// membuang UDP port 123), papan skor bisa memberi waktu lewat soket yang
// sudah dipakai papan ini, yang tidak bisa diblokir hotspot. Hasilnya kurang
// teliti (sekitar setengah waktu pulang-pergi), jadi hanya dipakai bila NTP gagal.
void askScoreboardForTime() {
  char ask[110];
  snprintf(ask, sizeof(ask), "{\"tipe\":\"waktu\",\"grup\":%d,\"k\":\"%s\",\"t0\":%lu}",
           GROUP_ID, HUNT_KEY, (unsigned long)millis());
  webSocket.sendTXT(ask);
  lastTimeAskAt = millis();
}

void takeScoreboardTime(const char* reply) {
  const char* a = strstr(reply, "\"t0\"");
  const char* b = strstr(reply, "\"ts\"");
  if (!a || !b || clockFromNtp) return;
  a = strchr(a, ':');  // lompat ke tiap angka; spasi sesudah titik dua tidak masalah
  b = strchr(b, ':');
  if (!a || !b) return;

  unsigned long t0 = strtoul(a + 1, NULL, 10);
  long long ts = strtoll(b + 1, NULL, 10);
  unsigned long roundTrip = (unsigned long)millis() - t0;
  if (roundTrip > 1500) return;  // terlalu lambat untuk dipercaya

  long long ms = ts + roundTrip / 2;  // balasan menempuh separuh waktu pulang-pergi di jalan
  struct timeval tv;
  tv.tv_sec  = (time_t)(ms / 1000);
  tv.tv_usec = (suseconds_t)(ms % 1000) * 1000;
  settimeofday(&tv, NULL);
  clockSynced = true;
  Serial.printf("[jam] disetel dari papan skor (pulang-pergi %lu ms): %s\n",
                roundTrip, wallClockTimestamp().c_str());
}

void onSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      socketUp = true;
      Serial.println("[soket] tersambung ke papan skor");
      break;
    case WStype_DISCONNECTED:
      if (socketUp) {
        socketUp = false;
        socketDrops++;
        Serial.println("[soket] sambungan putus, menyambung lagi");
      }
      break;
    case WStype_ERROR:
      Serial.println("[soket] galat");
      break;
    case WStype_TEXT:
      if (strstr((const char*)payload, "\"waktu\"")) {
        takeScoreboardTime((const char*)payload);
      } else {
        Serial.printf("[papan skor berkata] %s\n", (const char*)payload);  // mis. HUNT_KEY salah
      }
      break;
    default:
      break;
  }
}

void printStatus() {
  bool online = WiFi.status() == WL_CONNECTED && clockSynced && socketUp;
  Serial.printf("[status] Wi-Fi %s (%d dBm) | jam %s | papan skor %s | hidup %lu dtk%s\n",
                WiFi.status() == WL_CONNECTED ? "OK" : "MATI", WiFi.RSSI(),
                clockSynced ? (clockFromNtp ? "NTP" : "papan skor") : "BELUM",
                socketUp ? "tersambung" : "MATI", millis() / 1000,
                online ? " | SIAP DISEMBUNYIKAN" : "");
}

// Laporan singkat untuk layar asisten: asisten bisa melihat papan kelompok
// mana yang lemah tanpa harus berjalan ke tempatnya.
void sendStatus() {
  char report[170];
  snprintf(report, sizeof(report),
           "{\"tipe\":\"status\",\"grup\":%d,\"k\":\"%s\",\"peran\":\"beacon\",\"wifi\":%d,"
           "\"jam\":\"%s\",\"naik\":%lu,\"mem\":%lu,\"putus\":%lu}",
           GROUP_ID, HUNT_KEY, WiFi.RSSI(),
           clockSynced ? (clockFromNtp ? "ntp" : "papan") : "-",
           millis() / 1000, (unsigned long)ESP.getFreeHeap(), (unsigned long)socketDrops);
  webSocket.sendTXT(report);
}

// Satu baris yang menyebut apa yang perlu diperiksa, untuk hal pertama yang salah.
void adviseOnTrouble() {
  if (WiFi.status() != WL_CONNECTED) {
    explainWiFi();
  } else if (!clockSynced && millis() - wifiUpSince > CLOCK_TIMEOUT_MS) {
    Serial.println("[saran] Wi-Fi sudah naik tetapi tak ada server waktu yang menjawab. Apakah ponselnya punya data seluler? Sebagian jaringan memblokir NTP; papan skor akan memberi waktu begitu soket tersambung.");
  } else if (!socketUp && millis() - wifiUpSince > CLOCK_TIMEOUT_MS) {
    Serial.printf("[saran] %s tidak terjangkau. Periksa data seluler dan Penghemat Data ponsel, dan pastikan HUNT_KEY adalah kunci kelompok ini.\n", SERVER_HOST);
  }
}

// Dipanggil di setiap putaran loop(). Ia tidak pernah menunggu: hanya
// memperhatikan apa yang rusak dan menyentuhnya, supaya tidak ada slot
// pancar yang terlewat selagi hotspot membereskan dirinya.
void keepOnline() {
  uint32_t now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    if (wifiUpSince == 0) wifiUpSince = now;
  } else {
    wifiUpSince = 0;
    if (now - lastWifiTryAt >= WIFI_RETRY_MS) {
      Serial.println("[wifi] belum tersambung, mencoba lagi");
      beginWiFi();
    }
  }

  // NTP diberi kesempatan dulu; baru sesudah itu papan skor yang memberi waktu.
  if (socketUp && !clockSynced && wifiUpSince != 0 &&
      now - wifiUpSince > CLOCK_TIMEOUT_MS && now - lastTimeAskAt >= 5000) {
    askScoreboardForTime();
  }

  if (socketUp && now - lastReportAt >= 10000) {
    lastReportAt = now;
    sendStatus();
  }

  if (now - lastStatusAt >= STATUS_EVERY_MS) {
    static uint8_t rounds = 0;
    lastStatusAt = now;
    printStatus();
    bool allGood = WiFi.status() == WL_CONNECTED && clockSynced && socketUp;
    if (!allGood && ++rounds % 4 == 0) adviseOnTrouble();
  }
}
