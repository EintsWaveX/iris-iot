/*
 * MODULE 4 PART A - LoRa HUNT  |  Role: BEACON (Group 1, hidden
 * by the assistant)
 * Transmits only in its own time slot, taking turns with the other four
 * pairs within one shared period, so all five beacons share the same
 * channel without ever colliding. Every packet carries a sequence number
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

// TDMA schedule: one 500 ms period split into five 100 ms slots, one per
// group, chosen by GROUP_ID, so all five beacons share one channel without
// ever colliding -- none transmits outside its own slot. This replaces the
// previous version's fixed gap, which was only safe with a single beacon
// on the air.
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
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, ________);  // (2) NTP server address

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
  LoRa.setSignalBandwidth(________);  // (3) Radio bandwidth constant
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(________);  // (4) Beacon transmit power constant
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectToWiFi();
  syncClock();
  startRadio();

  // Group 1 transmits at the start of every period, group 2 a hundred
  // milliseconds after that, and so on -- see the TDMA_* comment above.
  nextFireAt = millis() + (unsigned long)(GROUP_ID - 1) * TDMA_SLOT_MS;

  webSocket.begin(SERVER_HOST, SERVER_PORT, "/beacon");
  webSocket.setReconnectInterval(2000);
  WiFi.setAutoReconnect(true);

  Serial.println("Beacon transmitting. Hide this board now.");
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
  LoRa.print(________);  // (5) Variable holding the packet built above
  LoRa.________();  // (6) Method that transmits the prepared packet

  // The scoreboard needs to know which packet numbers were actually sent, so
  // that a packet which never reached a hunter can be counted as lost.
  char report[80];
  snprintf(report, sizeof(report), "{\"grup\":%d,\"seq\":%lu,\"tx\":\"%s\"}",
           GROUP_ID, (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Transmitted packet #%lu (group %d)\n", sentAt.c_str(),
                (unsigned long)seq, GROUP_ID);
}
