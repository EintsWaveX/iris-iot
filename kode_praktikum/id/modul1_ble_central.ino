/*
 * MODUL 1 - BLE  |  Peran: CENTRAL/CLIENT (ESP32 DevKit V1/S3)
 * Membaca potensiometer, mengubahnya jadi sudut 0-180 derajat, dan mengirimnya
 * ke Peripheral saat nilainya berubah cukup jauh. Isi bagian rumpang (1)-(6).
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <________>  // (1) Berkas header pemindai (scan) perangkat BLE
#include <BLEAdvertisedDevice.h>
#include "iris_waktu.h"

// ---- IDENTITAS KELOMPOK -----------------------------------------------------
// Ubah angka di bawah menjadi nomor kelompok kalian (1 sampai 8) pada *kedua*
// program. Kedua UUID ikut berubah sendiri, sehingga Central tidak akan
// tersambung ke papan kelompok lain.
const int GROUP_ID = 1;

String SERVICE_UUID        = "d1f8ef04-1fa7-4806-ba3a-8115c0bcce0" + String(GROUP_ID);
String CHARACTERISTIC_UUID = "11d29a29-98ee-453e-8c87-2f95f867650" + String(GROUP_ID);

String centralName = "ESP32-Central";

// Papan ESP32-S3 tidak memiliki ADC pada GPIO34. Hapus tanda // pada baris di
// bawah bila kalian memakai papan ESP32-S3, dan biarkan bila memakai DevKit V1.
// #define BOARD_ESP32S3

// Potensiometer pada pin ADC1; ADC2 tidak dapat dibaca selama radio BLE menyala.
#ifdef BOARD_ESP32S3
const int POT_PIN = 4;   // ESP32-S3: ADC1_CH3
#else
const int POT_PIN = 34;  // ESP32 DevKit V1: ADC1_CH6
#endif
const int ADC_MAX = 4095;

const int SERVO_MIN_ANGLE = 0;
const int SERVO_MAX_ANGLE = 180;

// Kirim ulang hanya bila sudut bergeser sejauh ini, dan paling cepat sekian
// milidetik sekali, supaya kanal BLE tidak dibanjiri.
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

// Mengubah tegangan pada potensiometer menjadi sudut servo.
int readAngle() {
  int raw = ________(POT_PIN);  // (2) Fungsi pembaca nilai analog sebuah pin

  return map(raw, 0, ADC_MAX, SERVO_MIN_ANGLE, ________);  // (3) Batas sudut tertinggi
}

// Dipanggil pustaka BLE setiap kali Peripheral mengirim notifikasi. Di sinilah
// pantulan (echo) diterima, sehingga di sinilah delay pulang-pergi dihitung.
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

    Serial.printf("[%s] Echo dari Peripheral: %s derajat | Delay (round-trip): %lu ms\n",
                  formatTimestamp(receiveTime).c_str(), echo.c_str(),
                  receiveTime - sendTime);
  }
}

class MyClientCallbacks : public BLEClientCallbacks {
  void onConnect(BLEClient *pClient) override {
    connected = true;
    Serial.println("Terhubung ke Peripheral!");
  }

  void onDisconnect(BLEClient *pClient) override {
    connected = false;
    Serial.println("Koneksi ke Peripheral terputus!");
  }
};

static MyClientCallbacks clientCallbacks;

bool connectToPeripheral(BLEAddress address) {
  Serial.printf("Menghubungi Peripheral: %s\n", address.toString().c_str());

  if (pClient != nullptr) {
    delete pClient;
  }

  pClient = BLEDevice::createClient();
  pClient->setClientCallbacks(&clientCallbacks);

  if (!pClient->connect(address)) {
    Serial.println("Koneksi gagal!");
    return false;
  }

  // Service adalah wadah, characteristic adalah data di dalamnya.
  BLERemoteService *pService = pClient->getService(________);  // (4) UUID service

  if (pService == nullptr) {
    Serial.println("Service tidak ditemukan!");
    pClient->disconnect();
    return false;
  }

  pRemoteCharacteristic = pService->getCharacteristic(CHARACTERISTIC_UUID);

  if (pRemoteCharacteristic == nullptr) {
    Serial.println("Characteristic tidak ditemukan!");
    pClient->disconnect();
    return false;
  }

  if (!pRemoteCharacteristic->canNotify()) {
    Serial.println("Characteristic tidak mendukung notifikasi!");
    pClient->disconnect();
    return false;
  }

  // Tanpa pendaftaran ini, pantulan dari Peripheral tidak akan pernah sampai
  // dan kolom Delay pada jurnal tidak dapat diisi.
  pRemoteCharacteristic->registerForNotify(________);  // (5) Nama fungsi notifikasi

  connected = true;
  Serial.println("Siap! Putar potensiometer untuk menggerakkan servo.");
  return true;
}

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    if (
      advertisedDevice.haveServiceUUID() &&
      advertisedDevice.isAdvertisingService(BLEUUID(SERVICE_UUID))
    ) {
      Serial.println("Peripheral yang dicari ditemukan!");
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

  Serial.println("Mode central aktif, memindai Peripheral...");
  pBLEScan->start(5, false);
}

void loop() {
  if (doConnect && pPeripheralAddress != nullptr) {
    connectToPeripheral(*pPeripheralAddress);
    doConnect = false;
  }

  if (!connected && !doConnect) {
    Serial.println("Peripheral belum ditemukan, memindai ulang...");
    BLEDevice::getScan()->start(5, false);
    return;
  }

  if (pRemoteCharacteristic == nullptr) {
    return;
  }

  int angle = readAngle();

  // Pengiriman hanya terjadi bila sudutnya benar-benar bergeser; tanpa ambang
  // ini potensiometer yang diam pun tetap mengirim terus-menerus.
  bool moved = abs(angle - lastSentAngle) >= DEADBAND_DEG;
  bool ready = millis() - lastSendTime >= MIN_SEND_INTERVAL_MS;

  if (moved && ready) {
    sendTime = millis();
    lastSendTime = sendTime;
    lastSentAngle = angle;
    waitingForEcho = true;

    String payload = String(________);  // (6) Variabel sudut yang ingin dikirim

    Serial.printf("[%s] Potensiometer berubah, mengirim sudut: %s derajat\n",
                  formatTimestamp(sendTime).c_str(), payload.c_str());

    // BLE mengirim deretan byte, sehingga panjang datanya ikut disertakan.
    pRemoteCharacteristic->writeValue((uint8_t *)payload.c_str(), payload.length());
  }

  delay(20);
}
