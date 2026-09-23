/*
 * MODULE 1 - BLE  |  Role: PERIPHERAL/SERVER (ESP32-S3/DevKit V1)
 * Receives a button state from the Central, turns an LED on or off to match
 * it, then echoes the value back through a notification. Fill in (1)-(6).
 */

#include <BLEDevice.h>
#include <________>  // (1) Header file that creates a BLE server/peripheral
#include <BLEUtils.h>
#include <BLE2902.h>
#include "iris_waktu.h"

// ---- GROUP IDENTITY ---------------------------------------------------------
// Change the number below to your group number (1 to 5) in *both* programs.
// Both UUIDs derive from it automatically, so a Central never connects to
// another group's board.
const int GROUP_ID = 1;

String SERVICE_UUID        = "d1f8ef04-1fa7-4806-ba3a-8115c0bcce0" + String(GROUP_ID);
String CHARACTERISTIC_UUID = "11d29a29-98ee-453e-8c87-2f95f867650" + String(GROUP_ID);

String peripheralName = "ESP32-Peripheral";

// LED on GPIO16, with a 220 Ohm current-limiting resistor on its cathode leg.
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

// Called by the BLE library every time the Central writes a value to the
// characteristic.
class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    unsigned long receiveTime = millis();

    String data = pCharacteristic->getValue().c_str();
    int state = constrain(data.toInt(), 0, 1);

    // Echo the data back as fast as possible, before turning the LED on or
    // off and printing to Serial, so the round trip measurement on the
    // Central's side isn't weighed down.
    pCharacteristic->setValue(data.c_str());
    pCharacteristic->________();  // (2) Method that sends a value back to the Central

    digitalWrite(LED_PIN, ________);  // (3) The state variable read from the data

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

  // PROPERTY_READ     -> the Central can read data
  // PROPERTY_WRITE    -> the Central can send data to the ESP32
  // PROPERTY_NOTIFY   -> the ESP32 sends data automatically (no ACK)
  // PROPERTY_INDICATE -> the ESP32 sends data automatically (with ACK)
  // PROPERTY_WRITE_NR -> the Central sends data with no confirmation
  pCharacteristic = pService->createCharacteristic(
    BLEUUID(CHARACTERISTIC_UUID),
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::________  // (4) Property for sending data automatically with no ACK
  );

  // This 0x2902 descriptor is what lets the Central turn notifications on.
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new ________());  // (5) Name of the write callback class
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

  pinMode(________, OUTPUT);  // (6) The LED pin constant
  digitalWrite(LED_PIN, LOW);

  BLE_init();
}

void loop() {
  // Once the Central disconnects, advertising has to be turned back on so
  // the device can be found again on the next scan.
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
