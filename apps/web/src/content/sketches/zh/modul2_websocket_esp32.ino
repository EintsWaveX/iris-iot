/*
 * 模块 2 · WEBSOCKET  |  角色：Client（ESP32-S3/DevKit V1）
 * 每 2 秒读一次 DHT22 的温湿度，以 JSON 发给
 * Python 服务器，服务器回复它收到的时间。请填好空格 (1)-(6)。
 */

#include <WiFi.h>
// 在库管理器里安装 Markus Sattler 的 "WebSockets" | PlatformIO：lib_deps = links2004/WebSockets
#include <________>  // (1) WebSocket 客户端库的头文件（arduinoWebSockets）
// 在库管理器里安装 Adafruit 的 "DHT sensor library"（不是 Rob Tillaart 的 "DHT"），以及它依赖的 "Adafruit Unified Sensor" | PlatformIO：lib_deps = adafruit/DHT sensor library
#include <DHT.h>
#include <time.h>
#include <sys/time.h>  // 用来调用微秒精度的 gettimeofday()

const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char*    WS_HOST = "ws.irisiotlab.com";  // 服务器地址，每组都一样
const uint16_t WS_PORT = 80;                   // 网关端口，不是 Python 服务器的端口

// ---- 小组路径 ---------------------------------------------------------------
// 服务器靠这个路径分辨连进来的是哪一组的板子。
// 只用你们组自己的路径："/grup1"、"/grup2"、"/grup3"、"/grup4"
// 或 "/grup5"。这个值必须在服务器的 ALLOWED_PATHS 里。
const char*    WS_PATH = "________";  // (2) 路径，要和 Python 服务器上的一样

// NTP 负责对时。偏移 25200 秒就是 WIB（UTC+7）。
const char*  NTP_SERVER     = "pool.ntp.org";
const long   GMT_OFFSET_SEC = 25200;
const int    DST_OFFSET_SEC = 0;

// DHT22 接 GPIO16。这个传感器读取间隔
// 不能短于 2 秒。
const int DHT_PIN = 16;
const unsigned long SAMPLE_INTERVAL_MS = 2000;

DHT dht(DHT_PIN, DHT22);
WebSocketsClient webSocket;

bool webSocketConnected = false;

unsigned long seq = 0;
unsigned long lastSampleTime = 0;
unsigned long sendTime = 0;
bool waitingForReply = false;

// 经 NTP 校准的时间，格式为 HH:MM:SS:MS。
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

// 把最新一次 DHT22 读数打包成一帧 JSON。传感器读不到时
// 返回空字符串。
String buildReading() {
  float humidity    = dht.readHumidity();
  float temperature = dht.________();  // (3) 读取摄氏温度的方法

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

  // NTP 回应之前，系统时钟还停在 1970 年。
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
  webSocket.onEvent(________);  // (4) 上面那个回调函数的名字，不带括号

  // 每 15 秒 ping 一次；连续 2 次在 3 秒内没有回应，
  // 板子会自己断开卡住的连接，再由自动重连接手。
  webSocket.enableHeartbeat(15000, 3000, 2);

  webSocket.setReconnectInterval(5000);
  WiFi.setAutoReconnect(true);

  Serial.println("DHT22 readings will be sent every 2 seconds.");
}

void loop() {
  webSocket.________();  // (5) 处理事件的方法，必须定期调用

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

  webSocket.________(message);  // (6) 发送文本消息的方法

  Serial.printf("[%s] Send #%lu: %s\n",
                wallClockTimestamp().c_str(), seq, message.c_str());
}
