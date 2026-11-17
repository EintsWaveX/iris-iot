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
#include <esp_sntp.h>
#include <time.h>
#include <sys/time.h>

#define GROUP_ID 1

// 本组手机的热点（IRIS-G<n>）负责联网；记分板在网上。
// ESP32 只支持 2.4 GHz。iPhone：设置 > 个人热点 > 打开
// “最大化兼容性”，并在板子连接时停留在这个页面。
// 安卓：热点 > 频段 > 2.4 GHz，安全性 > WPA2。保持移动数据开启。
const char* WIFI_SSID      = "IRIS-G1";
const char* WIFI_PASSWORD  = "13015954";
const char* SERVER_HOST    = "hunt.irisiotlab.com";
const uint16_t SERVER_PORT = 443;
const char* HUNT_KEY       = "SITE-KEY";  // 来自网站“寻踪”步骤的板子密钥
const char* NTP_SERVER      = "time.cloudflare.com";
const long  GMT_OFFSET_SEC  = 25200;
const int   DST_OFFSET_SEC  = 0;

// 备用对时服务器，NTP_SERVER 没有回应时使用。
const char* NTP_FALLBACK_1  = "pool.ntp.org";
const char* NTP_FALLBACK_2  = "time.google.com";

// 热点不是实验室的路由器：它可能在 5 GHz 上、丢掉 UDP、睡着，或者
// 失去移动数据。所以这份代码里没有任何一步会无限等待：失败的步骤
// 会说明原因，超过这些限制就放弃，由 keepOnline()（在文件
// 底部）在后台继续重试。
const uint32_t WIFI_TIMEOUT_MS  = 20000;  // 一次连接热点的尝试
const uint32_t WIFI_RETRY_MS    = 20000;  // 运行中两次尝试之间的间隔
const uint32_t CLOCK_TIMEOUT_MS = 20000;  // setup() 等待 NTP 的时间
const uint32_t STATUS_EVERY_MS  = 5000;   // 串口监视器上的状态行

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

volatile bool clockSynced  = false;  // NTP 或计分板设好时间后为 true
volatile bool clockFromNtp = false;  // 来自 NTP（更精确的那个）时为 true
bool     socketUp      = false;      // 计分板的连接是打开的
uint32_t socketDrops   = 0;          // 它自己断开的次数
uint32_t wifiUpSince   = 0;          // Wi-Fi 连上时的 millis()，断开时为 0
uint32_t lastWifiTryAt = 0;
uint32_t lastStatusAt  = 0;
uint32_t lastReportAt  = 0;
uint32_t lastTimeAskAt = 0;

String wallClockTimestamp() {
  if (!clockSynced) return String("-");  // 没设好的时钟会显示 1970：改为报告“没有时间”

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

// 开始（或重新开始）连接热点，并立即返回。
void beginWiFi() {
  WiFi.persistent(false);  // 不写入闪存，也不用旧的已保存网络
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect();       // 开始新的尝试之前，先丢掉没完成的那一次
  delay(100);
  WiFi.begin(WIFI_SSID, ________);  // (2) Wi-Fi 密码变量
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

  // 没有这一行的话，modem sleep 会让每次发送多出 100 ms 以上，
  // 你记下的延迟就测错了。
  WiFi.setSleep(false);
  Serial.printf("\nConnected, hunter IP address: %s (signal %d dBm)\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

// 真正的 NTP 回应设好时钟的那一刻，由对时库调用。
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

  // 每一步到了限制就放弃，而不是无限等待。不管
  // 还缺什么，Hunter 都会先开始监听，由 keepOnline()
  // 在后台把剩下的做完。
  connectToWiFi();
  syncClock();
  startRadio();

  webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/hunter");
  webSocket.onEvent(onSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);  // 几秒钟就能发现断掉的连接，而不是几分钟
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

  // 损坏的数据包可能带着任何内容，而计分板会把这段文字
  // 当作数字来读。只转发它读得懂的内容。
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

  webSocket.________(payload);  // (6) 发送文本消息的方法

  Serial.printf("[%s] Packet #%s | RSSI %d dBm (smoothed %.1f) | SNR %.1f dB\n",
                receivedAt.c_str(), seq.c_str(), rssi, smoothed, snr);
}

// ===========================================================================
// 保持在线。下面没有要填的空：读一读，看看板子
// 在热点出问题时怎么应对，以及串口监视器各行是什么意思。
// ===========================================================================

bool looksLikeNumber(const String& s) {
  if (s.length() == 0 || s.length() > 9) return false;
  for (size_t i = 0; i < s.length(); i++) {
    if (!isDigit(s[i])) return false;
  }
  return true;
}

// “-” 表示 Beacon 还没有时间；否则格式为 HH:MM:SS:mmm。
bool looksLikeTime(const String& s) {
  if (s == "-") return true;
  if (s.length() < 9 || s.length() > 12) return false;
  for (size_t i = 0; i < s.length(); i++) {
    if (!isDigit(s[i]) && s[i] != ':') return false;
  }
  return true;
}

// 用直白的话说明板子为什么没连上 Wi-Fi。
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

// 当 NTP 回应一直不来（有些热点和运营商会丢掉 UDP
// 端口 123）时，计分板可以通过这块板子已经在用的那条连接
// 告诉它时间，热点拦不住这条连接。它不够精确（误差约为
// 往返时间的一半），所以只在 NTP 失败时使用。
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
  a = strchr(a, ':');  // 跳到每个数字；冒号后面的空格没有影响
  b = strchr(b, ':');
  if (!a || !b) return;

  unsigned long t0 = strtoul(a + 1, NULL, 10);
  long long ts = strtoll(b + 1, NULL, 10);
  unsigned long roundTrip = (unsigned long)millis() - t0;
  if (roundTrip > 1500) return;  // 太慢，不可信

  long long ms = ts + roundTrip / 2;  // 回应在路上花了往返时间的一半
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
        Serial.printf("[scoreboard says] %s\n", (const char*)payload);  // 例如 HUNT_KEY 填错了
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

// 给助教屏幕的简短报告：让他们不用走过去，就能看到
// 哪个组的哪块板子状态不好。
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

// 一行话，说明第一个出问题的地方该检查什么。
void adviseOnTrouble() {
  if (WiFi.status() != WL_CONNECTED) {
    explainWiFi();
  } else if (!clockSynced && millis() - wifiUpSince > CLOCK_TIMEOUT_MS) {
    Serial.println("[hint] Wi-Fi is up but no time server answers. Has the phone got mobile data? Some networks block NTP; the scoreboard will give the time once the socket connects.");
  } else if (!socketUp && millis() - wifiUpSince > CLOCK_TIMEOUT_MS) {
    Serial.printf("[hint] Cannot reach %s. Check the phone's mobile data and Data Saver, and that HUNT_KEY is this group's key.\n", SERVER_HOST);
  }
}

// loop() 每转一圈都会调用它。它从不等待：只是留意哪里
// 出了问题并推它一把，所以热点自己恢复期间不会漏掉任何 LoRa 数据包
// 时隙。
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

  // 先给 NTP 一个公平的机会，之后才由计分板提供时间。
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
