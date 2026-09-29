/*
 * MODULE 1 - BLE  |  Role: CENTRAL/CLIENT (ESP32-S3/DevKit V1)
 * Reads a push button's state, and sends it to the Peripheral whenever it
 * changes. Fill in (1)-(6).
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <________>  // (1) Header file for the BLE device scanner
#include <BLEAdvertisedDevice.h>
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

String centralName = "ESP32-Central";

// Button on GPIO17, with an external 10 kOhm pull-down resistor (see schematic).
const int PB_PIN = 17;

// Send again at most this often, to smooth out contact bounce as the button
// is pressed or released.
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

// Reads the button's state. The pull-down resistor makes the pin read LOW
// when the button is not pressed and HIGH when it is.
int readButtonState() {
  return ________(PB_PIN);  // (2) Function that reads a pin's digital value
}

// Called by the BLE library every time the Peripheral sends a notification.
// This is where the echo is received, so this is where the round trip delay
// is calculated.
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

  // A service is a container, a characteristic is the data inside it.
  BLERemoteService *pService = pClient->getService(________);  // (4) Service UUID

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

  // Without registering here, the Peripheral's echo will never arrive and
  // the journal's Delay column cannot be filled in.
  pRemoteCharacteristic->registerForNotify(________);  // (5) Notification function name

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

  pinMode(PB_PIN, ________);  // (3) Input pin mode

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

  // Sending only happens when the button's state actually changes; without
  // this check an idle button would still send continuously.
  bool changed = state != lastSentState;
  bool ready = millis() - lastSendTime >= MIN_SEND_INTERVAL_MS;

  if (changed && ready) {
    sendTime = millis();
    lastSendTime = sendTime;
    lastSentState = state;
    waitingForEcho = true;

    String payload = String(________);  // (6) The state variable to send

    Serial.printf("[%s] Button changed, sending state: %s\n",
                  formatTimestamp(sendTime).c_str(), payload.c_str());

    // BLE sends a byte string, so the data's length is included too.
    pRemoteCharacteristic->writeValue((uint8_t *)payload.c_str(), payload.length());
  }

  delay(20);
}
