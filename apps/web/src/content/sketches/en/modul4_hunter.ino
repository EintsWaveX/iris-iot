/*
 * MODULE 4 - LoRa HUNT  |  Role: HUNTER (Group 1)
 * Only LISTENS, never transmits, so no group's board can collide with
 * another in the air. Every beacon packet it catches is smoothed, then sent
 * to the scoreboard over Wi-Fi.
 *
 * Fill in every blank section; the numbers (1) through (6) in the comment
 * beside each one are the hints.
 */

#include <WiFi.h>
#include <SPI.h>
// Install via Library Manager: "LoRa" by Sandeep Mistry | PlatformIO: lib_deps = sandeepmistry/LoRa
#include <________>  // (1) LoRa peer-to-peer library header by Sandeep Mistry
// Install via Library Manager: "WebSockets" by Markus Sattler | PlatformIO: lib_deps = links2004/WebSockets
#include <WebSocketsClient.h>
#include <esp_sntp.h>
#include <time.h>
#include <sys/time.h>

#define GROUP_ID 1

// The group phone's hotspot (IRIS-G<n>) carries the board; the scoreboard is online.
// The ESP32 only speaks 2.4 GHz. iPhone: Settings > Personal Hotspot > switch
// "Maximize Compatibility" on, and stay on that screen while the board joins.
// Android: Hotspot > Band > 2.4 GHz, Security > WPA2. Keep mobile data on.
const char* WIFI_SSID      = "IRIS-G1";
const char* WIFI_PASSWORD  = "13015954";
const char* SERVER_HOST    = "hunt.irisiotlab.com";
const uint16_t SERVER_PORT = 443;
const char* HUNT_KEY       = "SITE-KEY";  // Board key from the website's Hunt step
const char* NTP_SERVER      = "time.cloudflare.com";
const long  GMT_OFFSET_SEC  = 25200;
const int   DST_OFFSET_SEC  = 0;

// Backup time servers, used when NTP_SERVER does not answer.
const char* NTP_FALLBACK_1  = "pool.ntp.org";
const char* NTP_FALLBACK_2  = "time.google.com";

// A hotspot is not a lab router: it can sit on 5 GHz, drop UDP, doze off or
// lose its mobile data. So nothing in this sketch waits forever: a step that
// fails says why, gives up after these limits, and keepOnline() (bottom of the
// file) keeps trying in the background.
const uint32_t WIFI_TIMEOUT_MS  = 20000;  // one try at joining the hotspot
const uint32_t WIFI_RETRY_MS    = 20000;  // gap between tries while running
const uint32_t CLOCK_TIMEOUT_MS = 20000;  // how long setup() waits for NTP
const uint32_t STATUS_EVERY_MS  = 5000;   // the status line on the Serial Monitor

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
#define LORA_SYNC_WORD        0xF1

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

volatile bool clockSynced  = false;  // true once NTP or the scoreboard has set the time
volatile bool clockFromNtp = false;  // true if it was NTP (the accurate one)
bool     socketUp      = false;      // the scoreboard socket is open
uint32_t socketDrops   = 0;          // how often it closed on us
uint32_t wifiUpSince   = 0;          // millis() when Wi-Fi came up, 0 while down
uint32_t lastWifiTryAt = 0;
uint32_t lastStatusAt  = 0;
uint32_t lastReportAt  = 0;
uint32_t lastTimeAskAt = 0;

String wallClockTimestamp() {
  if (!clockSynced) return String("-");  // an unset clock would say 1970: report "no time" instead

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

// Starts (or restarts) joining the hotspot and returns at once.
void beginWiFi() {
  WiFi.persistent(false);  // keep the flash, and any old saved network, out of it
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect();       // drop a half-finished attempt before starting a new one
  delay(100);
  WiFi.begin(WIFI_SSID, ________);  // (2) Wi-Fi password variable
  lastWifiTryAt = millis();
}

bool connectToWiFi() {
  Serial.print("Connecting to the phone hotspot");

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

  // Without this line, modem sleep adds over 100 ms to every send and the
  // delay you record measures the wrong thing.
  WiFi.setSleep(false);
  Serial.printf("\nConnected, hunter IP address: %s (signal %d dBm)\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

// Called by the time library the moment a real NTP reply sets the clock.
void onNtpSynced(struct timeval* tv) {
  clockSynced  = true;
  clockFromNtp = true;
}

void syncClock() {
  Serial.print("Synchronising the clock");
  sntp_set_time_sync_notification_cb(onNtpSynced);
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER, NTP_FALLBACK_1, NTP_FALLBACK_2);

  uint32_t started = millis();
  while (!clockSynced && WiFi.status() == WL_CONNECTED &&
         millis() - started < CLOCK_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (clockSynced) {
    Serial.printf("\nClock synchronised: %s\n", wallClockTimestamp().c_str());
  } else {
    Serial.println("\nNo time yet. Carrying on: the clock is set as soon as a time server, or the scoreboard, answers.");
  }
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

  LoRa.setSpreadingFactor(________);  // (3) Spreading factor constant
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setSyncWord(________);  // (4) Pairing marker constant, same as the beacon
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Each step gives up after its limit instead of waiting forever. Whatever
  // is still missing, the Hunter starts listening anyway and keepOnline()
  // finishes the job in the background.
  connectToWiFi();
  syncClock();
  startRadio();

  webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/hunter");
  webSocket.onEvent(onSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);  // notice a dead link in seconds, not minutes
  WiFi.setAutoReconnect(true);

  Serial.printf("Group %d hunter is ready and listening.\n", GROUP_ID);
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

  int rssi = LoRa.________();  // (5) Method that reads the packet signal strength
  float snr = LoRa.packetSnr();

  // A beacon packet holds "<group> <packet no.> <send time>", separated by
  // spaces. The group rides along as a second safety net: the radio's own
  // sync word already filters out nearly every other pair's packets, but if
  // one slips through anyway, this line drops it silently instead of
  // reporting it as belonging to the wrong group.
  int sp1 = beaconLine.indexOf(' ');
  int sp2 = sp1 < 0 ? -1 : beaconLine.indexOf(' ', sp1 + 1);
  if (sp1 < 0 || sp2 < 0) {
    return;  // The packet was corrupted in the air; just ignore it.
  }

  if (beaconLine.substring(0, sp1).toInt() != GROUP_ID) {
    return;  // Not our own pair's beacon; ignore it silently.
  }

  String seq    = beaconLine.substring(sp1 + 1, sp2);
  String sentAt = beaconLine.substring(sp2 + 1);

  // A damaged packet can carry anything, and the scoreboard reads this text
  // as numbers. Forward only what it can read.
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

  webSocket.________(payload);  // (6) Method that sends a text message

  Serial.printf("[%s] Packet #%s | RSSI %d dBm (smoothed %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}

// ===========================================================================
// Staying online. Nothing to fill in below: read it to see how the board
// copes when the hotspot misbehaves, and what its Serial Monitor lines mean.
// ===========================================================================

bool looksLikeNumber(const String& s) {
  if (s.length() == 0 || s.length() > 9) return false;
  for (size_t i = 0; i < s.length(); i++) {
    if (!isDigit(s[i])) return false;
  }
  return true;
}

// "-" means the Beacon had no time yet; otherwise HH:MM:SS:mmm.
bool looksLikeTime(const String& s) {
  if (s == "-") return true;
  if (s.length() < 9 || s.length() > 12) return false;
  for (size_t i = 0; i < s.length(); i++) {
    if (!isDigit(s[i]) && s[i] != ':') return false;
  }
  return true;
}

// Says, in plain words, why the board is not on the Wi-Fi.
void explainWiFi() {
  wl_status_t status = WiFi.status();
  if (status == WL_NO_SSID_AVAIL) {
    Serial.printf("\nWi-Fi \"%s\" not found. Is the hotspot ON and named exactly that? Is it on 2.4 GHz\n"
                  "(iPhone: Maximize Compatibility; Android: Band > 2.4 GHz)? An iPhone must stay on its\n"
                  "Personal Hotspot screen while the board joins.\n", WIFI_SSID);
  } else if (status == WL_CONNECT_FAILED) {
    Serial.printf("\nWi-Fi \"%s\" refused the board. Check the password, and set the hotspot security\n"
                  "to WPA2 (not WPA3 only).\n", WIFI_SSID);
  } else {
    Serial.printf("\nNot on Wi-Fi \"%s\" yet (status %d). Hotspot off, 5 GHz band, wrong password or\n"
                  "WPA3-only security are the usual causes.\n", WIFI_SSID, (int)status);
  }
}

// When the NTP replies never arrive (some hotspots and carriers drop UDP
// port 123) the scoreboard can tell the time over the very socket this board
// already uses, which a hotspot cannot block. It is less exact (about half the
// round trip), so it is used only when NTP has failed.
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
  a = strchr(a, ':');  // skip to each number; spaces after the colon do not matter
  b = strchr(b, ':');
  if (!a || !b) return;

  unsigned long t0 = strtoul(a + 1, NULL, 10);
  long long ts = strtoll(b + 1, NULL, 10);
  unsigned long roundTrip = (unsigned long)millis() - t0;
  if (roundTrip > 1500) return;  // too slow to trust

  long long ms = ts + roundTrip / 2;  // the reply spent half the round trip on the way
  struct timeval tv;
  tv.tv_sec  = (time_t)(ms / 1000);
  tv.tv_usec = (suseconds_t)(ms % 1000) * 1000;
  settimeofday(&tv, NULL);
  clockSynced = true;
  Serial.printf("[clock] set from the scoreboard (round trip %lu ms): %s\n",
                roundTrip, wallClockTimestamp().c_str());
}

void onSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      socketUp = true;
      Serial.println("[socket] connected to the scoreboard");
      break;
    case WStype_DISCONNECTED:
      if (socketUp) {
        socketUp = false;
        socketDrops++;
        Serial.println("[socket] connection lost, reconnecting");
      }
      break;
    case WStype_ERROR:
      Serial.println("[socket] error");
      break;
    case WStype_TEXT:
      if (strstr((const char*)payload, "\"waktu\"")) {
        takeScoreboardTime((const char*)payload);
      } else {
        Serial.printf("[scoreboard says] %s\n", (const char*)payload);  // e.g. a wrong HUNT_KEY
      }
      break;
    default:
      break;
  }
}

void printStatus() {
  Serial.printf("[status] Wi-Fi %s (%d dBm) | clock %s | scoreboard %s | up %lu s\n",
                WiFi.status() == WL_CONNECTED ? "OK" : "DOWN", WiFi.RSSI(),
                clockSynced ? (clockFromNtp ? "NTP" : "scoreboard") : "NOT SET",
                socketUp ? "connected" : "DOWN", millis() / 1000);
}

// A short report for the assistants' screen: lets them see which board of
// which group is weak without walking over to it.
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

// One line saying what to check, for the first thing that is wrong.
void adviseOnTrouble() {
  if (WiFi.status() != WL_CONNECTED) {
    explainWiFi();
  } else if (!clockSynced && millis() - wifiUpSince > CLOCK_TIMEOUT_MS) {
    Serial.println("[hint] Wi-Fi is up but no time server answers. Has the phone got mobile data? Some networks block NTP; the scoreboard will give the time once the socket connects.");
  } else if (!socketUp && millis() - wifiUpSince > CLOCK_TIMEOUT_MS) {
    Serial.printf("[hint] Cannot reach %s. Check the phone's mobile data and Data Saver, and that HUNT_KEY is this group's key.\n", SERVER_HOST);
  }
}

// Called on every pass of loop(). It never waits: it only notices what is
// broken and nudges it, so LoRa packets are never missed while the hotspot
// sorts itself out.
void keepOnline() {
  uint32_t now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    if (wifiUpSince == 0) wifiUpSince = now;
  } else {
    wifiUpSince = 0;
    if (now - lastWifiTryAt >= WIFI_RETRY_MS) {
      Serial.println("[wifi] not connected, trying again");
      beginWiFi();
    }
  }

  // NTP gets a fair chance first; only then does the scoreboard give the time.
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
