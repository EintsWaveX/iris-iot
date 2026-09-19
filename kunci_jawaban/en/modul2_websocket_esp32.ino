/*
 * MODULE 2 - WEBSOCKET COMMUNICATION WITH A LOCAL SERVER  |  Role: WebSocket Client
 * Board   : ESP32 DevKit V1 (DOIT) or ESP32-S3
 * Library : WebSockets by Markus Sattler (arduinoWebSockets), DHT sensor
 *           library by Adafruit, and Adafruit Unified Sensor
 *
 * The client reads DHT22 temperature and humidity every 2 seconds and sends
 * them as JSON to the Python server. The server only records them, then
 * replies with its own receive time.
 *
 * ANSWER KEY. Every blank is already filled in; the numbers (1) through (6) in
 * the comment beside each one mark the graded answers.
 */

#include <WiFi.h>
#include <WebSocketsClient.h>  // (1) WebSocket client library header (arduinoWebSockets)
#include <DHT.h>
#include <time.h>
#include <sys/time.h>  // For microsecond-resolution gettimeofday()

const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char*    WS_HOST = "192.168.1.100";  // Match the Orange Pi IP address
const uint16_t WS_PORT = 8765;             // Match the Orange Pi port

// ---- GROUP PATH ------------------------------------------------------------
// This path is what tells the server which group's board is connecting.
// Use only your own group's path: "/grup1", "/grup2", "/grup3", "/grup4",
// "/grup5", "/grup6", "/grup7", or "/grup8". The value must be present in
// ALLOWED_PATHS on the server.
const char*    WS_PATH = "/grup1";  // (2) Path, same as on the Python server

// NTP: the wall-clock synchroniser. An offset of 25200 seconds equals WIB (UTC+7).
const char*  NTP_SERVER     = "pool.ntp.org";
const long   GMT_OFFSET_SEC = 25200;
const int    DST_OFFSET_SEC = 0;

// DHT22 on GPIO16. This sensor must not be read more often than once every
// 2 seconds.
const int DHT_PIN = 16;
const unsigned long SAMPLE_INTERVAL_MS = 2000;

DHT dht(DHT_PIN, DHT22);
WebSocketsClient webSocket;

bool webSocketConnected = false;

unsigned long seq = 0;
unsigned long lastSampleTime = 0;
unsigned long sendTime = 0;
bool waitingForReply = false;

// NTP-synchronised wall clock in HH:MM:SS:MS format.
String wallClockTimestamp() {
  struct timeval tv;
  gettimeofday(&tv, NULL);

  struct tm timeinfo;
  localtime_r(&tv.tv_sec, &timeinfo);

  char buffer[16];
  snprintf(
    buffer, sizeof(buffer), "%02d:%02d:%02d:%03ld",
    timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec,
    (long)(tv.tv_usec / 1000L)
  );
  return String(buffer);
}

// Builds one JSON frame holding the latest DHT22 reading. Returns an empty
// string when the sensor cannot be read.
String buildReading() {
  float humidity    = dht.readHumidity();
  float temperature = dht.readTemperature();  // (3) Method that reads temperature in Celsius

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT22 could not be read, check its data wire and power supply.");
    return "";
  }

  char buffer[80];
  snprintf(buffer, sizeof(buffer), "{\"seq\":%lu,\"temp\":%.1f,\"hum\":%.1f}",
           seq, temperature, humidity);
  return String(buffer);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      Serial.println("WebSocket connected.");
      break;

    case WStype_DISCONNECTED:
      webSocketConnected = false;
      Serial.println("WebSocket disconnected.");
      break;

    case WStype_TEXT: {
      if (!waitingForReply) {
        break;
      }

      unsigned long replyTime = millis();
      waitingForReply = false;

      String reply = String((const char*)payload).substring(0, length);

      Serial.printf("[%s] Ack #%lu from server: %s | Delay (round-trip): %lu ms\n",
                    wallClockTimestamp().c_str(), seq, reply.c_str(),
                    replyTime - sendTime);
      break;
    }

    case WStype_ERROR:
      Serial.println("WebSocket error.");
      break;

    default:
      break;
  }
}

void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.printf("\nWi-Fi connected, ESP32 IP address: %s\n",
                WiFi.localIP().toString().c_str());
}

void syncClock() {
  Serial.print("Synchronising the clock over NTP");
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER);

  // Until NTP answers, the system clock is still back in 1970.
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo, 1000)) {
    Serial.print(".");
  }

  Serial.printf("\nClock synchronised: %s\n", wallClockTimestamp().c_str());
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  dht.begin();

  connectToWiFi();
  syncClock();

  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);  // (4) Name of the callback above, without parentheses

  // Ping every 15 seconds; after 2 pings go unanswered within 3 seconds the
  // board drops the stalled connection itself and auto-reconnect takes over.
  webSocket.enableHeartbeat(15000, 3000, 2);

  webSocket.setReconnectInterval(5000);
  WiFi.setAutoReconnect(true);

  Serial.println("DHT22 readings will be sent every 2 seconds.");
}

void loop() {
  webSocket.loop();  // (5) Event-processing method, must be called regularly

  if (!webSocketConnected) {
    return;
  }

  if (millis() - lastSampleTime < SAMPLE_INTERVAL_MS) {
    return;
  }

  lastSampleTime = millis();
  seq++;

  String message = buildReading();
  if (message == "") {
    return;
  }

  sendTime = millis();
  waitingForReply = true;

  webSocket.sendTXT(message);  // (6) Method that sends a text message

  Serial.printf("[%s] Send #%lu: %s\n",
                wallClockTimestamp().c_str(), seq, message.c_str());
}
