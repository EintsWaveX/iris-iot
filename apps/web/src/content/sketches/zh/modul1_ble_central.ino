/*
 * 模块 1 · BLE  |  角色：CENTRAL/CLIENT（ESP32-S3/DevKit V1）
 * 读取按钮的状态，状态一变就发给 Peripheral。
 * 请填好空格 (1)-(6)。
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <________>  // (1) 扫描 BLE 设备用的头文件
#include <BLEAdvertisedDevice.h>
#include <time.h>

// ---- 共用时钟 ---------------------------------------------------------------
// 两块板子必须从同一台电脑对时（在串口监视器里发送 "YYYY-MM-DD HH:MM:SS.mmm"，
// 或运行 scripts/send_time.ps1），这样两边打印的时间
// 才能互相比较。
static uint64_t irisWaktuSyncEpochMs = 0;      // 对时那一刻的 Unix 毫秒数。
static unsigned long irisWaktuSyncMillis = 0;  // 同一时刻的 millis() 值。

static void syncTimeFromSerial() {
  Serial.println("Waiting for PC time (YYYY-MM-DD HH:MM:SS.mmm), up to 10 seconds...");

  unsigned long waitStart = millis();
  while (millis() - waitStart < 10000UL) {
    if (!Serial.available()) {
      continue;
    }

    String line = Serial.readStringUntil('\n');

    // 尽早记下；这个 millis() 时间点就对应
    // 刚收到的电脑时间。
    unsigned long arrival = millis();
    line.trim();

    struct tm timeInfo = {};
    int year, month, day, hour, minute, second, milli = 0;

    if (sscanf(line.c_str(), "%d-%d-%d %d:%d:%d.%d",
               &year, &month, &day, &hour, &minute, &second, &milli) >= 6) {
      timeInfo.tm_year = year - 1900;
      timeInfo.tm_mon  = month - 1;
      timeInfo.tm_mday = day;
      timeInfo.tm_hour = hour;
      timeInfo.tm_min  = minute;
      timeInfo.tm_sec  = second;

      irisWaktuSyncEpochMs = (uint64_t)mktime(&timeInfo) * 1000ULL + (uint64_t)milli;
      irisWaktuSyncMillis  = arrival;

      Serial.println("Clock synchronised from the PC down to the millisecond.");
      return;
    }

    Serial.println("Format not recognised, send again: YYYY-MM-DD HH:MM:SS.mmm");
  }

  Serial.println("No PC time received, timestamps will count from boot.");
}

// 格式为 HH:MM:SS:MS。对时以后这就是精确到毫秒的真实时间，
// 所以两个串口监视器里的时间可以直接相减。
static String formatTimestamp(unsigned long ms) {
  char buffer[16];

  if (irisWaktuSyncEpochMs != 0) {
    uint64_t nowMs = irisWaktuSyncEpochMs + (uint64_t)(ms - irisWaktuSyncMillis);
    time_t seconds = (time_t)(nowMs / 1000ULL);
    struct tm *t = localtime(&seconds);

    snprintf(buffer, sizeof(buffer), "%02d:%02d:%02d:%03u",
             t->tm_hour, t->tm_min, t->tm_sec, (unsigned)(nowMs % 1000ULL));
    return String(buffer);
  }

  unsigned long totalSeconds = ms / 1000UL;
  snprintf(buffer, sizeof(buffer), "%02lu:%02lu:%02lu:%03lu",
           (totalSeconds / 3600UL) % 24UL, (totalSeconds / 60UL) % 60UL,
           totalSeconds % 60UL, ms % 1000UL);
  return String(buffer);
}

// ---- 小组编号 ---------------------------------------------------------------
// 把下面的数字改成你们的组号（1 到 5），*两个*程序都要改。
// 两个 UUID 会自动根据组号生成，这样 Central 就不会连到
// 别组的板子上。
const int GROUP_ID = 1;

String SERVICE_UUID        = "d1f8ef04-1fa7-4806-ba3a-8115c0bcce0" + String(GROUP_ID);
String CHARACTERISTIC_UUID = "11d29a29-98ee-453e-8c87-2f95f867650" + String(GROUP_ID);

String centralName = "ESP32-Central";

// 按钮接 GPIO17，外接 10 kΩ 下拉电阻（见电路图）。
const int PB_PIN = 17;

// 两次发送之间至少隔这么久，用来消除按下或松开按钮时的
// 触点抖动。
const unsigned long MIN_SEND_INTERVAL_MS = 100;

BLEClient *pClient = nullptr;
BLERemoteCharacteristic *pRemoteCharacteristic = nullptr;
BLEAddress *pPeripheralAddress = nullptr;

bool doConnect = false;
bool connected = false;

int lastSentState = -1;
unsigned long lastSendTime = 0;

unsigned long sendTime = 0;
bool waitingForEcho = false;

// 读取按钮状态。有下拉电阻，没按下时引脚读到 LOW，
// 按下时读到 HIGH。
int readButtonState() {
  return ________(PB_PIN);  // (2) 读取引脚数字值的函数
}

// Peripheral 每发一次 notification，BLE 库就会调用这里。
// 回传的数据在这里收到，所以往返延迟
// 也在这里计算。
static void notifyCallback(
  BLERemoteCharacteristic *pBLERemoteCharacteristic,
  uint8_t *pData,
  size_t length,
  bool isNotify
) {
  unsigned long receiveTime = millis();

  String echo = "";
  for (size_t i = 0; i < length; i++) {
    echo += (char)pData[i];
  }

  if (waitingForEcho) {
    waitingForEcho = false;

    Serial.printf("[%s] Echo from Peripheral: %s | Delay (round trip): %lu ms\n",
                  formatTimestamp(receiveTime).c_str(), echo.c_str(),
                  receiveTime - sendTime);
  }
}

class MyClientCallbacks : public BLEClientCallbacks {
  void onConnect(BLEClient *pClient) override {
    connected = true;
    Serial.println("Connected to Peripheral!");
  }

  void onDisconnect(BLEClient *pClient) override {
    connected = false;
    Serial.println("Connection to Peripheral lost!");
  }
};

static MyClientCallbacks clientCallbacks;

bool connectToPeripheral(BLEAddress address) {
  Serial.printf("Contacting Peripheral: %s\n", address.toString().c_str());

  if (pClient != nullptr) {
    delete pClient;
  }

  pClient = BLEDevice::createClient();
  pClient->setClientCallbacks(&clientCallbacks);

  if (!pClient->connect(address)) {
    Serial.println("Connection failed!");
    return false;
  }

  // service 是容器，characteristic 是装在里面的数据。
  BLERemoteService *pService = pClient->getService(________);  // (4) Service 的 UUID

  if (pService == nullptr) {
    Serial.println("Service not found!");
    pClient->disconnect();
    return false;
  }

  pRemoteCharacteristic = pService->getCharacteristic(CHARACTERISTIC_UUID);

  if (pRemoteCharacteristic == nullptr) {
    Serial.println("Characteristic not found!");
    pClient->disconnect();
    return false;
  }

  if (!pRemoteCharacteristic->canNotify()) {
    Serial.println("Characteristic does not support notifications!");
    pClient->disconnect();
    return false;
  }

  // 不在这里注册的话，Peripheral 的回传永远收不到，
  // 日志里的延迟一栏也就填不了。
  pRemoteCharacteristic->registerForNotify(________);  // (5) notification 回调函数名

  connected = true;
  Serial.println("Ready! Press the button to light the LED.");
  return true;
}

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    if (
      advertisedDevice.haveServiceUUID() &&
      advertisedDevice.isAdvertisingService(BLEUUID(SERVICE_UUID))
    ) {
      Serial.println("Found the Peripheral we're looking for!");
      BLEDevice::getScan()->stop();

      if (pPeripheralAddress != nullptr) {
        delete pPeripheralAddress;
      }

      pPeripheralAddress = new BLEAddress(advertisedDevice.getAddress());
      doConnect = true;
    }
  }
};

void setup() {
  Serial.begin(115200);
  syncTimeFromSerial();

  pinMode(PB_PIN, ________);  // (3) 输入引脚模式

  BLEDevice::init(centralName.c_str());

  BLEScan *pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(80);
  pBLEScan->setActiveScan(true);

  Serial.println("Central mode active, scanning for Peripheral...");
  pBLEScan->start(5, false);
}

void loop() {
  if (doConnect && pPeripheralAddress != nullptr) {
    connectToPeripheral(*pPeripheralAddress);
    doConnect = false;
  }

  if (!connected && !doConnect) {
    Serial.println("Peripheral not found yet, scanning again...");
    BLEDevice::getScan()->start(5, false);
    return;
  }

  if (pRemoteCharacteristic == nullptr) {
    return;
  }

  int state = readButtonState();

  // 只有按钮状态真的变了才发送；没有这个判断的话，
  // 按钮不动也会一直发。
  bool changed = state != lastSentState;
  bool ready = millis() - lastSendTime >= MIN_SEND_INTERVAL_MS;

  if (changed && ready) {
    sendTime = millis();
    lastSendTime = sendTime;
    lastSentState = state;
    waitingForEcho = true;

    String payload = String(________);  // (6) 要发送的状态变量

    Serial.printf("[%s] Button changed, sending state: %s\n",
                  formatTimestamp(sendTime).c_str(), payload.c_str());

    // BLE 发送的是字节串，所以数据长度也要一起传。
    pRemoteCharacteristic->writeValue((uint8_t *)payload.c_str(), payload.length());
  }

  delay(20);
}
