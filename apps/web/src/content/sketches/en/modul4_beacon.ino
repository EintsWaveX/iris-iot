/*
 * MODULE 4 - LoRa HUNT  |  Role: BEACON (Group 1, hidden
 * by the assistant)
 * Transmits only in its own time slot, taking turns with the other
 * groups' beacons within one shared period, so all beacons share the same
 * channel without stepping on each other. Every packet carries a sequence number
 * and send time, also reported to the scoreboard over Wi-Fi so lost packets
 * can be counted.
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
// file) keeps trying in the background. The radio never waits for any of it:
// a Beacon that restarts while hidden must still transmit.
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

// These four values must match this pair's own hunter exactly -- other
// pairs deliberately use a different LORA_SYNC_WORD, so the five radios
// cannot hear each other.
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF1

// The transmit power is matched to the SIZE OF THE ARENA, not turned up as
// far as it goes. At 20 dBm the whole building reads as "close" and the
// beacon cannot be found; too low and the farthest hunter never hears it.
// One room: 2. One floor of a building: 10. A large building: 14.
#define BEACON_TX_POWER 10

// TDMA schedule: one 500 ms period split into ten 50 ms slots, one per
// group (group 11 and up share a slot with the group ten below). Slots
// follow the NTP clock the board just synchronised, not its own power-on
// time, so every beacon really keeps to its slot. A packet takes about
// 30 ms; the rest of the slot absorbs clock error.
const unsigned long TDMA_PERIOD_MS = 500;
const unsigned long TDMA_SLOT_MS   = 50;
const int           TDMA_SLOTS     = 10;
int64_t nextFireAt = 0;
bool    slotsOnClock = false;  // true once nextFireAt was worked out on a set clock

WebSocketsClient webSocket;

uint32_t seq = 0;

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

// Starts (or restarts) joining the hotspot and returns at once.
void beginWiFi() {
  WiFi.persistent(false);  // keep the flash, and any old saved network, out of it
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect();       // drop a half-finished attempt before starting a new one
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
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

  WiFi.setSleep(false);
  Serial.printf("\nConnected, beacon IP address: %s (signal %d dBm)\n",
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
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, ________, NTP_FALLBACK_1, NTP_FALLBACK_2);  // (2) NTP server address

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

  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(________);  // (3) Radio bandwidth constant
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(________);  // (4) Beacon transmit power constant
}

// Milliseconds since 1970 on the NTP clock, and the next moment that falls
// in this group's slot. Slots follow the NTP clock, not the power-on time.
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

  // The radio comes first and nothing after it can stop it: the Wi-Fi and the
  // clock only add the scoreboard report and exact slots, and keepOnline()
  // retries them in the background.
  startRadio();
  connectToWiFi();
  syncClock();

  // The first transmission falls in this group's next slot on the NTP
  // clock (see the TDMA_* comment above), not from the power-on moment.
  nextFireAt = nextSlot(clockMs());
  slotsOnClock = clockSynced;

  webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/beacon");
  webSocket.onEvent(onSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);  // notice a dead link in seconds, not minutes
  WiFi.setAutoReconnect(true);

  if (WiFi.status() == WL_CONNECTED && clockSynced) {
    Serial.println("Beacon transmitting. Hide this board now.");
  } else {
    Serial.println("Beacon transmitting, but NOT ready to hide: it is not online yet. Read the lines above.");
  }
}

void loop() {
  webSocket.loop();
  keepOnline();

  int64_t now = clockMs();
  // The slots live on the clock. When the clock is first set (or jumps), find
  // this group's next slot again instead of waiting for a moment that moved.
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
  LoRa.print(________);  // (5) Variable holding the packet built above
  LoRa.________();  // (6) Method that transmits the prepared packet

  // The scoreboard needs to know which packet numbers were actually sent, so
  // that a packet which never reached a hunter can be counted as lost.
  char report[96];
  snprintf(report, sizeof(report), "{\"grup\":%d,\"k\":\"%s\",\"seq\":%lu,\"tx\":\"%s\"}",
           GROUP_ID, HUNT_KEY, (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Transmitted packet #%lu (group %d)\n", sentAt.c_str(),
                (unsigned long)seq, GROUP_ID);
}

// ===========================================================================
// Staying online. Nothing to fill in below: read it to see how the board
// copes when the hotspot misbehaves, and what its Serial Monitor lines mean.
// ===========================================================================

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
  bool online = WiFi.status() == WL_CONNECTED && clockSynced && socketUp;
  Serial.printf("[status] Wi-Fi %s (%d dBm) | clock %s | scoreboard %s | up %lu s%s\n",
                WiFi.status() == WL_CONNECTED ? "OK" : "DOWN", WiFi.RSSI(),
                clockSynced ? (clockFromNtp ? "NTP" : "scoreboard") : "NOT SET",
                socketUp ? "connected" : "DOWN", millis() / 1000,
                online ? " | READY TO HIDE" : "");
}

// A short report for the assistants' screen: lets them see which board of
// which group is weak without walking over to it.
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
// broken and nudges it, so no transmit slot is missed while the hotspot
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
