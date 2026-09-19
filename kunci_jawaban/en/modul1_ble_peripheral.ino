/*
 * MODULE 1 - BLUETOOTH LOW ENERGY (BLE) CONNECTIVITY  |  Role: PERIPHERAL/SERVER
 * Board   : ESP32 DevKit V1 (DOIT) or ESP32-S3
 * Library : BLEDevice (bundled with ESP32) and ESP32Servo
 *
 * The Peripheral receives an angle from the Central, drives an SG90 servo to
 * that angle, then echoes the value back through a notification.
 *
 * ANSWER KEY. Every blank is already filled in; the numbers (1) through (6) in
 * the comment beside each one mark the graded answers.
 */

#include <BLEDevice.h>
#include <BLEServer.h>  // (1) Header file that creates a BLE server/peripheral
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP32Servo.h>
#include <time.h>

// ---- GROUP UUIDS -----------------------------------------------------------
// Remove the // from ONE pair of lines only: the pair belonging to your group.
// The same pair must be active in the Central program. Each group uses its
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

String peripheralName = "ESP32-Peripheral";

// SG90 servo on GPIO16. Its power comes from the VIN pin (5 V), never 3V3.
const int SERVO_PIN = 16;

// SG90 pulse widths in microseconds for 0 and 180 degrees.
const int SERVO_MIN_US = 500;
const int SERVO_MAX_US = 2400;

Servo servo;

BLEServer *pServer = nullptr;
BLECharacteristic *pCharacteristic = nullptr;

bool deviceConnected = false;
bool oldDeviceConnected = false;

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

// Called by the BLE library every time the Central writes to the characteristic.
class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    unsigned long receiveTime = millis();

    String data = pCharacteristic->getValue().c_str();
    int angle = constrain(data.toInt(), 0, 180);

    // Echo the data as early as possible, before driving the servo and printing
    // to Serial, so the round-trip measurement on the Central is not weighed down.
    pCharacteristic->setValue(data.c_str());
    pCharacteristic->notify();  // (2) Method that sends a value to the Central

    servo.write(angle);  // (3) Angle variable parsed from the data

    Serial.printf("[%s] Angle from Central: %d degrees | Servo moved\n",
                  formatTimestamp(receiveTime).c_str(), angle);
  }
};

void BLE_init() {
  BLEDevice::init(peripheralName.c_str());

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(BLEUUID(SERVICE_UUID));

  // PROPERTY_READ     -> the Central can read data
  // PROPERTY_WRITE    -> the Central can send data to the ESP32
  // PROPERTY_NOTIFY   -> the ESP32 sends data automatically (without ACK)
  // PROPERTY_INDICATE -> the ESP32 sends data automatically (with ACK)
  // PROPERTY_WRITE_NR -> the Central sends data without confirmation
  pCharacteristic = pService->createCharacteristic(
    BLEUUID(CHARACTERISTIC_UUID),
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY  // (4) Property that sends data automatically without ACK
  );

  // Descriptor 0x2902 is what lets the Central switch notifications on.
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());  // (5) Write callback class name
  pCharacteristic->setValue("0");

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLEUUID(SERVICE_UUID));
  pAdvertising->setScanResponse(true);

  BLEDevice::startAdvertising();

  Serial.println("Peripheral ready, waiting for the Central...");
}

void setup() {
  Serial.begin(115200);
  syncTimeFromSerial();

  servo.attach(SERVO_PIN, SERVO_MIN_US, SERVO_MAX_US);  // (6) Servo pin constant
  servo.write(90);

  BLE_init();
}

void loop() {
  // Once the Central disconnects, advertising has to be switched back on so the
  // device can be discovered again on the next scan.
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Advertising switched back on...");
    oldDeviceConnected = deviceConnected;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}
