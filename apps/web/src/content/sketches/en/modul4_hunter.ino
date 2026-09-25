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
#include <time.h>
#include <sys/time.h>

#define GROUP_ID 1

// The Orange Pi is the access point, the scoreboard, and the NTP server.
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
  WiFi.begin(WIFI_SSID, ________);  // (2) Wi-Fi password variable

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

  LoRa.setSpreadingFactor(________);  // (3) Spreading factor constant
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setSyncWord(________);  // (4) Pairing marker constant, same as the beacon
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

  char payload[192];
  snprintf(payload, sizeof(payload),
           "{\"grup\":%d,\"seq\":%s,\"rssi\":%d,\"halus\":%.1f,\"snr\":%.1f,"
           "\"tx\":\"%s\",\"rx\":\"%s\",\"ip\":\"%s\"}",
           GROUP_ID, seq.c_str(), rssi, smoothRssi(rssi), snr,
           sentAt.c_str(), receivedAt.c_str(),
           WiFi.localIP().toString().c_str());

  webSocket.________(payload);  // (6) Method that sends a text message

  Serial.printf("[%s] Packet #%s | RSSI %d dBm (smoothed %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}
