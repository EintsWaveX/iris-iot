/*
 * MODUL 4 - PERBURUAN LoRa  |  Peran: HUNTER (Kelompok 1)
 * Hanya MENDENGARKAN, tidak pernah memancar, sehingga papan tiap kelompok
 * tidak mungkin bertabrakan di udara. Paket beacon yang tertangkap dihaluskan
 * lalu dikirim ke papan skor lewat Wi-Fi.
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

// Hotspot ponsel kelompok (IRIS-G<n>) membawa papan; papan skor ada di internet.
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
// batas ini, dan keepOnline() (di bagian bawah berkas) mencobanya lagi di latar.
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

// Keempat nilai ini harus sama persis dengan beacon, jika tidak paketnya
// hanya hening.
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF1

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

// Memulai (atau mengulang) penyambungan ke hotspot, lalu langsung kembali.
void beginWiFi() {
  WiFi.persistent(false);  // jangan tulis ke flash, dan jangan pakai jaringan lama yang tersimpan
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect();       // buang percobaan setengah jadi sebelum memulai yang baru
  delay(100);
  WiFi.begin(WIFI_SSID, ________);  // (2) Variabel kata sandi Wi-Fi
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

  // Tanpa baris ini, modem sleep menambah lebih dari 100 ms pada tiap
  // pengiriman dan delay yang kalian catat jadi salah ukur.
  WiFi.setSleep(false);
  Serial.printf("\nTerhubung, alamat IP hunter: %s (sinyal %d dBm)\n",
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
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER, NTP_FALLBACK_1, NTP_FALLBACK_2);

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

  LoRa.setSpreadingFactor(________);  // (3) Konstanta spreading factor
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setSyncWord(________);  // (4) Konstanta penanda pasangan, sama dengan beacon
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Tiap langkah menyerah setelah batasnya, tidak menunggu selamanya. Apa pun
  // yang masih kurang, Hunter tetap mulai mendengarkan dan keepOnline()
  // menyelesaikannya di latar.
  connectToWiFi();
  syncClock();
  startRadio();

  webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/hunter");
  webSocket.onEvent(onSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);  // tautan mati ketahuan dalam detik, bukan menit
  WiFi.setAutoReconnect(true);

  Serial.printf("Hunter kelompok %d siap mendengarkan.\n", GROUP_ID);
}

void loop() {
  webSocket.loop();
  keepOnline();

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

  // Paket beacon berisi "<kelompok> <no. paket> <waktu kirim>", dipisahkan
  // spasi. Kelompok ikut dikirim sebagai jaring pengaman kedua: penanda
  // pasangan (sync word) radio sudah menyaring hampir semua paket pasangan
  // lain, tetapi kalau ada yang lolos, baris ini membuangnya diam-diam
  // alih-alih melaporkannya seolah milik kelompok yang salah.
  int sp1 = beaconLine.indexOf(' ');
  int sp2 = sp1 < 0 ? -1 : beaconLine.indexOf(' ', sp1 + 1);
  if (sp1 < 0 || sp2 < 0) {
    return;  // Paket rusak di udara; abaikan saja.
  }

  if (beaconLine.substring(0, sp1).toInt() != GROUP_ID) {
    return;  // Bukan beacon pasangan kita; abaikan diam-diam.
  }

  String seq    = beaconLine.substring(sp1 + 1, sp2);
  String sentAt = beaconLine.substring(sp2 + 1);

  // Paket yang rusak bisa membawa apa saja, dan papan skor membaca teks ini
  // sebagai angka. Teruskan hanya yang bisa dibacanya.
  if (!looksLikeNumber(seq) || !looksLikeTime(sentAt)) {
    return;
  }

  char payload[192];
  snprintf(payload, sizeof(payload),
           "{\"grup\":%d,\"k\":\"%s\",\"seq\":%s,\"rssi\":%d,\"halus\":%.1f,\"snr\":%.1f,"
           "\"tx\":\"%s\",\"rx\":\"%s\",\"ip\":\"%s\"}",
           GROUP_ID, HUNT_KEY, seq.c_str(), rssi, smoothRssi(rssi), snr,
           sentAt.c_str(), receivedAt.c_str(),
           WiFi.localIP().toString().c_str());

  webSocket.________(payload);  // (6) Metode pengirim pesan teks

  Serial.printf("[%s] Paket #%s | RSSI %d dBm (halus %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}

// ===========================================================================
// Tetap online. Tidak ada yang perlu diisi di bawah ini: bacalah untuk melihat
// bagaimana papan menghadapi hotspot yang rewel, dan arti baris Serial Monitor-nya.
// ===========================================================================

bool looksLikeNumber(const String& s) {
  if (s.length() == 0 || s.length() > 9) return false;
  for (size_t i = 0; i < s.length(); i++) {
    if (!isDigit(s[i])) return false;
  }
  return true;
}

// "-" berarti Beacon belum punya waktu; selain itu JJ:MM:DD:mmm.
bool looksLikeTime(const String& s) {
  if (s == "-") return true;
  if (s.length() < 9 || s.length() > 12) return false;
  for (size_t i = 0; i < s.length(); i++) {
    if (!isDigit(s[i]) && s[i] != ':') return false;
  }
  return true;
}

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
  Serial.printf("[status] Wi-Fi %s (%d dBm) | jam %s | papan skor %s | hidup %lu dtk\n",
                WiFi.status() == WL_CONNECTED ? "OK" : "MATI", WiFi.RSSI(),
                clockSynced ? (clockFromNtp ? "NTP" : "papan skor") : "BELUM",
                socketUp ? "tersambung" : "MATI", millis() / 1000);
}

// Laporan singkat untuk layar asisten: asisten bisa melihat papan kelompok
// mana yang lemah tanpa harus berjalan ke tempatnya.
void sendStatus() {
  char report[170];
  snprintf(report, sizeof(report),
           "{\"tipe\":\"status\",\"grup\":%d,\"k\":\"%s\",\"peran\":\"hunter\",\"wifi\":%d,"
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
// memperhatikan apa yang rusak dan menyentuhnya, supaya paket LoRa tidak
// terlewat selagi hotspot membereskan dirinya.
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
