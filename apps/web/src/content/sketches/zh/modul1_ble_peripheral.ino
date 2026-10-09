/*
 * 模块 1 · BLE  |  角色：PERIPHERAL/SERVER（ESP32-S3/DevKit V1）
 * 从 Central 接收按钮状态，按状态开关 LED，
 * 再用 notification 把这个值回传过去。请填好空格 (1)-(6)。
 */

#include <BLEDevice.h>
#include <________>  // (1) 创建 BLE server/peripheral 用的头文件
#include <BLEUtils.h>
#include <BLE2902.h>
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

String peripheralName = "ESP32-Peripheral";

// LED 接 GPIO16，负极那条腿串一个 220 Ω 限流电阻。
const int LED_PIN = 16;

BLEServer *pServer = nullptr;
BLECharacteristic *pCharacteristic = nullptr;

bool deviceConnected = false;
bool oldDeviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    deviceConnected = true;
    Serial.println("Central connected!");
  }

  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;
    Serial.println("Central disconnected!");
  }
};

// Central 每往 characteristic 写一次值，
// BLE 库就会调用这里。
class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    unsigned long receiveTime = millis();

    String data = pCharacteristic->getValue().c_str();
    int state = constrain(data.toInt(), 0, 1);

    // 先尽快把数据回传，再去开关 LED
    // 和打印串口，免得拖慢 Central 那边
    // 测到的往返时间。
    pCharacteristic->setValue(data.c_str());
    pCharacteristic->________();  // (2) 把值发回 Central 的方法

    digitalWrite(LED_PIN, ________);  // (3) 从数据里读出的状态变量

    Serial.printf("[%s] State from Central: %d | LED %s\n",
                  formatTimestamp(receiveTime).c_str(), state,
                  state ? "on" : "off");
  }
};

void BLE_init() {
  BLEDevice::init(peripheralName.c_str());

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(BLEUUID(SERVICE_UUID));

  // PROPERTY_READ     -> Central 可以读数据
  // PROPERTY_WRITE    -> Central 可以向 ESP32 发数据
  // PROPERTY_NOTIFY   -> ESP32 自动发送数据（不需要 ACK）
  // PROPERTY_INDICATE -> ESP32 自动发送数据（需要 ACK）
  // PROPERTY_WRITE_NR -> Central 发数据，不等确认
  pCharacteristic = pService->createCharacteristic(
    BLEUUID(CHARACTERISTIC_UUID),
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::________  // (4) 自动发送数据、不需要 ACK 的属性
  );

  // 有了这个 0x2902 描述符，Central 才能打开 notification。
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new ________());  // (5) 写入回调类的名字
  pCharacteristic->setValue("0");

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLEUUID(SERVICE_UUID));
  pAdvertising->setScanResponse(true);

  BLEDevice::startAdvertising();

  Serial.println("Peripheral ready, waiting for Central...");
}

void setup() {
  Serial.begin(115200);
  syncTimeFromSerial();

  pinMode(________, OUTPUT);  // (6) LED 引脚常量
  digitalWrite(LED_PIN, LOW);

  BLE_init();
}

void loop() {
  // Central 断开以后要重新开启广播，
  // 下次扫描时才能再找到这块板子。
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Advertising restarted...");
    oldDeviceConnected = deviceConnected;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}
