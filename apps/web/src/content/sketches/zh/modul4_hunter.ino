/*
 * 模块 4 · LoRa 寻信号  |  角色：HUNTER（第 1 组）
 * 只接收，从不发射，所以各组的板子在空中
 * 不会互相撞车。收到的每个 beacon 包都先平滑处理，再通过
 * Wi-Fi 发给记分板。
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

// Orange Pi 同时是接入点、记分板和 NTP 服务器。
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

// 这四个值必须和 beacon 完全一致，不然它的包
// 就根本收不到。
#define LORA_FREQUENCY        920E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH        250E3
#define LORA_SYNC_WORD        0xF1

// 在室内，墙壁反射会让 RSSI 跳动多达 10 dB。中位数
// 去掉尖峰，EWMA 再把剩下的平滑掉。两种滤波缺一个，
// 记分板上的距离条就全是噪声。
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

// 最近五次读数的中间值。
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
  WiFi.begin(WIFI_SSID, ________);  // (2) Wi-Fi 密码变量

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  // 没有这一行的话，modem sleep 会让每次发送多出 100 ms 以上，
  // 你记下的延迟就测错了。
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
  digitalWrite(LORA_EN, HIGH);  // 打开射频模块的使能电路
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  while (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("RFM95W radio not detected yet, retrying...");
    delay(500);
  }

  LoRa.setSpreadingFactor(________);  // (3) 扩频因子常量
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setSyncWord(________);  // (4) 配对标记常量，要和 beacon 的一样
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

  int rssi = LoRa.________();  // (5) 读取数据包信号强度的方法
  float snr = LoRa.packetSnr();

  // beacon 包的内容是"<组号> <包编号> <发送时间>"，用空格
  // 隔开。组号是第二道保险：电台自己的
  // sync word 已经挡掉了几乎所有别组的包，但万一
  // 还是漏进来一个，这一行会悄悄丢掉它，而不是
  // 把它算到别的组头上。
  int sp1 = beaconLine.indexOf(' ');
  int sp2 = sp1 < 0 ? -1 : beaconLine.indexOf(' ', sp1 + 1);
  if (sp1 < 0 || sp2 < 0) {
    return;  // 数据包在空中损坏了，直接忽略。
  }

  if (beaconLine.substring(0, sp1).toInt() != GROUP_ID) {
    return;  // 不是本组的 beacon，悄悄忽略。
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

  webSocket.________(payload);  // (6) 发送文本消息的方法

  Serial.printf("[%s] Packet #%s | RSSI %d dBm (smoothed %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}
