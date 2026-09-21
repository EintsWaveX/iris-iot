/*
 * MODULE 1 - BLE  |  Role: PERIPHERAL/SERVER (ESP32 DevKit V1/S3)
 * Receives an angle from the Central, drives an SG90 servo to that angle,
 * then echoes the value back through a notification.
 *
 * ANSWER KEY. Every blank is already filled in; the numbers (1) through (6) in
 * the comment beside each one mark the graded answers.
 */

#include <BLEDevice.h>
#include <BLEServer.h>  // (1) Header file that creates a BLE server/peripheral
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP32Servo.h>
#include "iris_waktu.h"

// ---- GROUP IDENTITY ---------------------------------------------------------
// Change the number below to your group number (1 to 8) in *both* programs.
// Both UUIDs derive from it automatically, so a Central never connects to
// another group's board.
const int GROUP_ID = 1;

String SERVICE_UUID        = "d1f8ef04-1fa7-4806-ba3a-8115c0bcce0" + String(GROUP_ID);
String CHARACTERISTIC_UUID = "11d29a29-98ee-453e-8c87-2f95f867650" + String(GROUP_ID);

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
