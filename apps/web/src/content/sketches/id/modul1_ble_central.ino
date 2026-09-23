/*
 * MODUL 1 - BLE  |  Peran: CENTRAL/CLIENT (ESP32-S3/DevKit V1)
 * Membaca status tombol (push button), dan mengirimnya ke Peripheral saat
 * statusnya berubah. Isi bagian rumpang (1)-(6).
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <________>  // (1) Berkas header pemindai (scan) perangkat BLE
#include <BLEAdvertisedDevice.h>
#include "iris_waktu.h"

// ---- IDENTITAS KELOMPOK -----------------------------------------------------
// Ubah angka di bawah menjadi nomor kelompok kalian (1 sampai 5) pada *kedua*
// program. Kedua UUID ikut berubah sendiri, sehingga Central tidak akan
// tersambung ke papan kelompok lain.
const int GROUP_ID = 1;

String SERVICE_UUID        = "d1f8ef04-1fa7-4806-ba3a-8115c0bcce0" + String(GROUP_ID);
String CHARACTERISTIC_UUID = "11d29a29-98ee-453e-8c87-2f95f867650" + String(GROUP_ID);

String centralName = "ESP32-Central";

// Tombol pada GPIO17, dengan resistor pull-down 10 kΩ eksternal (lihat skema).
const int PB_PIN = 17;

// Kirim ulang paling cepat sekian milidetik sekali, untuk meredam derik
// kontak (bounce) saat tombol ditekan atau dilepas.
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

// Membaca status tombol. Resistor pull-down membuat pin bernilai LOW saat
// tombol tidak ditekan dan HIGH saat ditekan.
int readButtonState() {
  return ________(PB_PIN);  // (2) Fungsi pembaca nilai digital sebuah pin
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

    Serial.printf("[%s] Echo dari Peripheral: %s | Delay (round-trip): %lu ms\n",
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
  Serial.println("Siap! Tekan tombol untuk menyalakan LED.");
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

  pinMode(PB_PIN, ________);  // (3) Mode pin masukan

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

  int state = readButtonState();

  // Pengiriman hanya terjadi bila status tombol benar-benar berubah; tanpa
  // pengecekan ini tombol yang diam pun tetap mengirim terus-menerus.
  bool changed = state != lastSentState;
  bool ready = millis() - lastSendTime >= MIN_SEND_INTERVAL_MS;

  if (changed && ready) {
    sendTime = millis();
    lastSendTime = sendTime;
    lastSentState = state;
    waitingForEcho = true;

    String payload = String(________);  // (6) Variabel status yang ingin dikirim

    Serial.printf("[%s] Tombol berubah, mengirim status: %s\n",
                  formatTimestamp(sendTime).c_str(), payload.c_str());

    // BLE mengirim deretan byte, sehingga panjang datanya ikut disertakan.
    pRemoteCharacteristic->writeValue((uint8_t *)payload.c_str(), payload.length());
  }

  delay(20);
}
