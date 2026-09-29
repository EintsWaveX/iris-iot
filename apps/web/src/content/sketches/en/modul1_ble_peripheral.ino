/*
 * MODULE 1 - BLE  |  Role: PERIPHERAL/SERVER (ESP32-S3/DevKit V1)
 * Receives a button state from the Central, turns an LED on or off to match
 * it, then echoes the value back through a notification. Fill in (1)-(6).
 */

#include <BLEDevice.h>
#include <________>  // (1) Header file that creates a BLE server/peripheral
#include <BLEUtils.h>
#include <BLE2902.h>
#include <time.h>

// ---- SHARED WALL CLOCK -------------------------------------------------------
// Both boards MUST be synced from the same PC (send "YYYY-MM-DD HH:MM:SS.mmm"
// to the Serial Monitor, or run scripts/send_time.ps1) for their times to be
// comparable.
static uint64_t irisWaktuSyncEpochMs = 0;      // Unix milliseconds at the moment of the sync.
static unsigned long irisWaktuSyncMillis = 0;  // The millis() value at that same moment.

static void syncTimeFromSerial() {
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

      irisWaktuSyncEpochMs = (uint64_t)mktime(&timeInfo) * 1000ULL + (uint64_t)milli;
      irisWaktuSyncMillis  = arrival;

      Serial.println("Clock synchronised from the PC down to the millisecond.");
      return;
    }

    Serial.println("Format not recognised, send again: YYYY-MM-DD HH:MM:SS.mmm");
  }

  Serial.println("No PC time received, timestamps will count from boot.");
}

// HH:MM:SS:MS format. Once synced this is the real wall clock down to the
// millisecond, so times from the two Serial Monitors may be subtracted.
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
