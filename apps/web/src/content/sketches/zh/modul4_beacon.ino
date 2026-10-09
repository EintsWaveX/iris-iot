/*
 * 模块 4 · LoRa 寻信号  |  角色：BEACON（第 1 组，由助教
 * 藏好）
 * 只在自己的时隙里发射，和另外四对在同一个周期里
 * 轮流发，所以五个 beacon 共用同一个信道
 * 也不会撞车。每个数据包都带着序号
 * 和发送时间，并通过 Wi-Fi 报给记分板，
 * 这样就能统计丢包。
 *
 * 把每个空格都填好；每个空格旁边注释里的 (1) 到 (6)
 * 就是提示。
 */

#include <WiFi.h>
#include <SPI.h>
// 在库管理器里安装 Sandeep Mistry 的 "LoRa" | PlatformIO：lib_deps = sandeepmistry/LoRa
#include <________>  // (1) Sandeep Mistry 的 LoRa 点对点库头文件
// 在库管理器里安装 Markus Sattler 的 "WebSockets" | PlatformIO：lib_deps = links2004/WebSockets
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

// Cosmic LoRa Aurora V2 板上 RFM95W 射频模块的引脚。
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_EN   32
#define SPI_MISO  19
#define SPI_MOSI  23
#define SPI_SCK   18

// 这四个值必须和本组自己的 hunter 完全一致；
// 其他组故意用了不同的 LORA_SYNC_WORD，所以五台电台
// 互相听不到。
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF1

// 发射功率要按场地大小来定，不是开得越大越好。
// 开到 20 dBm 的话整栋楼都显示"很近"，
// beacon 就找不到了；太低的话最远的 hunter 又收不到。
// 一个房间：2。一层楼：10。一整栋大楼：14。
#define BEACON_TX_POWER 10

// TDMA 时间表：一个 500 ms 的周期分成五个 100 ms 的时隙，每组一个，
// 由 GROUP_ID 决定，所以五个 beacon 共用一个信道
// 也不会撞车，谁都不会在自己的时隙以外发射。这代替了
// 旧版本的固定间隔，那种做法只有空中只有一个 beacon
// 的时候才安全。
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
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, ________);  // (2) NTP 服务器地址

  struct tm timeinfo;
  while (!getLocalTime(&timeinfo, 1000)) {
    Serial.print(".");
  }

  Serial.printf("\nClock synchronised: %s\n", wallClockTimestamp().c_str());
}

void startRadio() {
  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);  // 打开射频模块的使能电路
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  while (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("RFM95W radio not detected yet, retrying...");
    delay(500);
  }

  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(________);  // (3) 射频带宽常量
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(________);  // (4) beacon 发射功率常量
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectToWiFi();
  syncClock();
  startRadio();

  // 第 1 组在每个周期开头发射，第 2 组晚一百
  // 毫秒，以此类推，详见上面 TDMA_* 的注释。
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
  LoRa.print(________);  // (5) 存放上面组好的数据包的变量
  LoRa.________();  // (6) 发射准备好的数据包的方法

  // 记分板需要知道哪些编号的包真的发出去了，
  // 这样没到 hunter 手里的包才能算作丢包。
  char report[80];
  snprintf(report, sizeof(report), "{\"grup\":%d,\"seq\":%lu,\"tx\":\"%s\"}",
           GROUP_ID, (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Transmitted packet #%lu (group %d)\n", sentAt.c_str(),
                (unsigned long)seq, GROUP_ID);
}
