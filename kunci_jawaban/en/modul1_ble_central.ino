/*
 * MODULE 1 - BLUETOOTH LOW ENERGY (BLE) CONNECTIVITY  |  Role: CENTRAL/CLIENT
 * Board   : ESP32 DevKit V1 (DOIT) or ESP32-S3
 * Library : BLEDevice (bundled with ESP32)
 *
 * The Central reads a potentiometer, turns it into an angle of 0-180 degrees,
 * and sends it to the Peripheral whenever the value has moved far enough.
 *
 * ANSWER KEY. Every blank is already filled in; the numbers (1) through (6) in
 * the comment beside each one mark the graded answers.
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>  // (1) Header file for the BLE device scanner
#include <BLEAdvertisedDevice.h>
#include <time.h>

// ---- GROUP UUIDS -----------------------------------------------------------
// Remove the // from ONE pair of lines only: the pair belonging to your group.
// The same pair must be active in the Peripheral program. Each group uses its
// own UUIDs so a Central never connects to another group's board.
// Group 1
#define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce01"
#define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676501"
// Group 2
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce02"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676502"
// Group 3
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce03"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676503"
// Group 4
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce04"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676504"
// Group 5
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce05"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676505"
// Group 6
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce06"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676506"
// Group 7
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce07"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676507"
// Group 8
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce08"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676508"

String centralName = "ESP32-Central";

// The ESP32-S3 has no ADC on GPIO34. Remove the // from the line below if you
// are using an ESP32-S3 board, and leave it in place for the DevKit V1.
// #define BOARD_ESP32S3

// Potentiometer on an ADC1 pin; ADC2 cannot be read while the BLE radio is on.
#ifdef BOARD_ESP32S3
const int POT_PIN = 4;   // ESP32-S3: ADC1_CH3
#else
const int POT_PIN = 34;  // ESP32 DevKit V1: ADC1_CH6
#endif
const int ADC_MAX = 4095;

const int SERVO_MIN_ANGLE = 0;
const int SERVO_MAX_ANGLE = 180;

// Only resend once the angle has shifted this far, and at most once every so
// many milliseconds, so the BLE channel is not flooded.
const int DEADBAND_DEG = 3;
const unsigned long MIN_SEND_INTERVAL_MS = 100;

BLEClient *pClient = nullptr;
BLERemoteCharacteristic *pRemoteCharacteristic = nullptr;
BLEAddress *pPeripheralAddress = nullptr;

bool doConnect = false;
bool connected = false;

int lastSentAngle = -100;
unsigned long lastSendTime = 0;

unsigned long sendTime = 0;
bool waitingForEcho = false;

// Wall clock from the PC over Serial: send "YYYY-MM-DD HH:MM:SS.mmm" followed
// by Enter in the Serial Monitor, or run scripts/send_time.ps1 on the PC. Both
// boards MUST be synced from the same PC for their times to be comparable.
uint64_t syncEpochMs = 0;      // Unix milliseconds at the moment of the sync.
unsigned long syncMillis = 0;  // The millis() value at that same moment.

void syncTimeFromSerial() {
  Serial.println("Waiting for PC time (YYYY-MM-DD HH:MM:SS.mmm), up to 10 seconds...");

  unsigned long waitStart = millis();
  while (millis() - waitStart < 10000UL) {
    if (!Serial.available()) {
      continue;
    }

    String line = Serial.readStringUntil('\n');

    // Taken as early as possible; this is the millis() point that stands for
    // the PC time just received.
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

      syncEpochMs = (uint64_t)mktime(&timeInfo) * 1000ULL + (uint64_t)milli;
      syncMillis  = arrival;

      Serial.println("Clock synchronised from the PC down to the millisecond.");
      return;
    }

    Serial.println("Format not recognised, send again: YYYY-MM-DD HH:MM:SS.mmm");
  }

  Serial.println("No PC time received, timestamps will count from boot.");
}

// HH:MM:SS:MS format. Once synced this is the real wall clock down to the
// millisecond, so times from the two Serial Monitors may be subtracted.
String formatTimestamp(unsigned long ms) {
  char buffer[16];

  if (syncEpochMs != 0) {
    uint64_t nowMs = syncEpochMs + (uint64_t)(ms - syncMillis);
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

// Turns the voltage on the potentiometer into a servo angle.
int readAngle() {
  int raw = analogRead(POT_PIN);  // (2) Function that reads a pin's analog value

  return map(raw, 0, ADC_MAX, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);  // (3) Highest angle limit
}

// Called by the BLE library every time the Peripheral sends a notification.
// The echo arrives here, so the round-trip delay is measured here too.
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

    Serial.printf("[%s] Echo from Peripheral: %s degrees | Delay (round-trip): %lu ms\n",
                  formatTimestamp(receiveTime).c_str(), echo.c_str(),
                  receiveTime - sendTime);
  }
}

class MyClientCallbacks : public BLEClientCallbacks {
  void onConnect(BLEClient *pClient) override {
    connected = true;
    Serial.println("Connected to the Peripheral!");
  }

  void onDisconnect(BLEClient *pClient) override {
    connected = false;
    Serial.println("Connection to the Peripheral lost!");
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

  // A service is the container, a characteristic is the data inside it.
  BLERemoteService *pService = pClient->getService(BLEUUID(SERVICE_UUID));  // (4) Service UUID

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

  // Without registering here, the echo from the Peripheral never arrives and
  // the Delay column in the journal cannot be filled in.
  pRemoteCharacteristic->registerForNotify(notifyCallback);  // (5) Notification function name

  connected = true;
  Serial.println("Ready! Turn the potentiometer to move the servo.");
  return true;
}

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    if (
      advertisedDevice.haveServiceUUID() &&
      advertisedDevice.isAdvertisingService(BLEUUID(SERVICE_UUID))
    ) {
      Serial.println("Target Peripheral found!");
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

  analogReadResolution(12);

  BLEDevice::init(centralName.c_str());

  BLEScan *pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(80);
  pBLEScan->setActiveScan(true);

  Serial.println("Central mode active, scanning for the Peripheral...");
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

  int angle = readAngle();

  // A send only happens once the angle has genuinely shifted; without this
  // threshold even a motionless potentiometer would transmit continuously.
  bool moved = abs(angle - lastSentAngle) >= DEADBAND_DEG;
  bool ready = millis() - lastSendTime >= MIN_SEND_INTERVAL_MS;

  if (moved && ready) {
    sendTime = millis();
    lastSendTime = sendTime;
    lastSentAngle = angle;
    waitingForEcho = true;

    String payload = String(angle);  // (6) Angle variable to be sent

    Serial.printf("[%s] Potentiometer moved, sending angle: %s degrees\n",
                  formatTimestamp(sendTime).c_str(), payload.c_str());

    // BLE sends a sequence of bytes, so the data length goes along with it.
    pRemoteCharacteristic->writeValue((uint8_t *)payload.c_str(), payload.length());
  }

  delay(20);
}
