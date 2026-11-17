/*
 * 模块 4 · LoRa 寻信号  |  角色：BEACON（第 1 组，由助教
 * 藏好）
 * 只在自己的时隙里发射，和其他组的
 * beacon 在同一个周期里轮流发，所以所有 beacon 共用同一个
 * 信道而不会互相覆盖。每个数据包都带有序号
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
#include <esp_sntp.h>
#include <time.h>
#include <sys/time.h>

#define GROUP_ID 1

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
// 底部）在后台继续重试。电台从不等待其中任何一步：
// 藏好后重启的 Beacon 也必须继续发射。
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

// TDMA 时间表：一个 500 ms 的周期分成十个 50 ms 的时隙，每组一个
// （第 11 组起，与比它小 10 的那一组共用一个时隙）。时隙
// 跟随板子刚校准过的 NTP 时间，而不是它自己的开机
// 时间，所以每个 beacon 真的都守在自己的时隙里。一个数据包大约要
// 30 ms；时隙剩下的部分用来容纳时钟误差。
const unsigned long TDMA_PERIOD_MS = 500;
const unsigned long TDMA_SLOT_MS   = 50;
const int           TDMA_SLOTS     = 10;
int64_t nextFireAt = 0;
bool    slotsOnClock = false;  // nextFireAt 是在已校准的时钟上算出的，则为 true

WebSocketsClient webSocket;

uint32_t seq = 0;

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

// 开始（或重新开始）连接热点，并立即返回。
void beginWiFi() {
  WiFi.persistent(false);  // 不写入闪存，也不用旧的已保存网络
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect();       // 开始新的尝试之前，先丢掉没完成的那一次
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

// 真正的 NTP 回应设好时钟的那一刻，由对时库调用。
void onNtpSynced(struct timeval* tv) {
  clockSynced  = true;
  clockFromNtp = true;
}

void syncClock() {
  Serial.print("Synchronising the clock");
  sntp_set_time_sync_notification_cb(onNtpSynced);
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, ________, NTP_FALLBACK_1, NTP_FALLBACK_2);  // (2) NTP 服务器地址

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

  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(________);  // (3) 射频带宽常量
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(________);  // (4) beacon 发射功率常量
}

// NTP 时钟上自 1970 年起的毫秒数，以及下一个落在
// 本组时隙里的时刻。时隙跟随 NTP 时钟，而不是开机时间。
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

  // 电台最先启动，后面没有任何东西能让它停下：Wi-Fi 和
  // 时钟只是增加向计分板的上报和精确的时隙，keepOnline()
  // 会在后台重试它们。
  startRadio();
  connectToWiFi();
  syncClock();

  // 第一次发射落在本组在 NTP
  // 时钟上的下一个时隙里（见上面 TDMA_* 的注释），而不是从开机那一刻算起。
  nextFireAt = nextSlot(clockMs());
  slotsOnClock = clockSynced;

  webSocket.beginSSL(SERVER_HOST, SERVER_PORT, "/beacon");
  webSocket.onEvent(onSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);  // 几秒钟就能发现断掉的连接，而不是几分钟
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
  // 时隙建立在时钟上。时钟第一次设好（或跳变）时，重新找出
  // 本组的下一个时隙，而不是去等一个已经移动的时刻。
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
  LoRa.print(________);  // (5) 存放上面组好的数据包的变量
  LoRa.________();  // (6) 发射准备好的数据包的方法

  // 记分板需要知道哪些编号的包真的发出去了，
  // 这样没到 hunter 手里的包才能算作丢包。
  char report[96];
  snprintf(report, sizeof(report), "{\"grup\":%d,\"k\":\"%s\",\"seq\":%lu,\"tx\":\"%s\"}",
           GROUP_ID, HUNT_KEY, (unsigned long)seq, sentAt.c_str());
  webSocket.sendTXT(report);

  Serial.printf("[%s] Transmitted packet #%lu (group %d)\n", sentAt.c_str(),
                (unsigned long)seq, GROUP_ID);
}

// ===========================================================================
// 保持在线。下面没有要填的空：读一读，看看板子
// 在热点出问题时怎么应对，以及串口监视器各行是什么意思。
// ===========================================================================

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
  bool online = WiFi.status() == WL_CONNECTED && clockSynced && socketUp;
  Serial.printf("[status] Wi-Fi %s (%d dBm) | clock %s | scoreboard %s | up %lu s%s\n",
                WiFi.status() == WL_CONNECTED ? "OK" : "DOWN", WiFi.RSSI(),
                clockSynced ? (clockFromNtp ? "NTP" : "scoreboard") : "NOT SET",
                socketUp ? "connected" : "DOWN", millis() / 1000,
                online ? " | READY TO HIDE" : "");
}

// 给助教屏幕的简短报告：让他们不用走过去，就能看到
// 哪个组的哪块板子状态不好。
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
// 出了问题并推它一把，所以热点自己恢复期间不会错过任何发射
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
