/*
 * MODUL 1 - BLE  |  Peran: PERIPHERAL/SERVER (ESP32-S3/DevKit V1)
 * Menerima status tombol dari Central, menyalakan/mematikan LED sesuai
 * statusnya, lalu memantulkan (echo) nilainya kembali lewat notifikasi. Isi
 * rumpang (1)-(6).
 */

#include <BLEDevice.h>
#include <________>  // (1) Berkas header pembuat server/peripheral BLE
#include <BLEUtils.h>
#include <BLE2902.h>
#include "iris_waktu.h"

// ---- IDENTITAS KELOMPOK -----------------------------------------------------
// Ubah angka di bawah menjadi nomor kelompok kalian (1 sampai 5) pada *kedua*
// program. Kedua UUID ikut berubah sendiri, sehingga Central tidak akan
// tersambung ke papan kelompok lain.
const int GROUP_ID = 1;

String SERVICE_UUID        = "d1f8ef04-1fa7-4806-ba3a-8115c0bcce0" + String(GROUP_ID);
String CHARACTERISTIC_UUID = "11d29a29-98ee-453e-8c87-2f95f867650" + String(GROUP_ID);

String peripheralName = "ESP32-Peripheral";

// LED pada GPIO16, dengan resistor pembatas arus 220 Ω pada kaki katodanya.
const int LED_PIN = 16;

BLEServer *pServer = nullptr;
BLECharacteristic *pCharacteristic = nullptr;

bool deviceConnected = false;
bool oldDeviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    deviceConnected = true;
    Serial.println("Central terhubung!");
  }

  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;
    Serial.println("Central terputus!");
  }
};

// Dipanggil pustaka BLE setiap kali Central menuliskan nilai ke characteristic.
class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    unsigned long receiveTime = millis();

    String data = pCharacteristic->getValue().c_str();
    int state = constrain(data.toInt(), 0, 1);

    // Memantulkan data secepat mungkin, sebelum menyalakan/mematikan LED dan
    // mencetak ke Serial, agar pengukuran pulang-pergi di sisi Central tidak
    // terbebani.
    pCharacteristic->setValue(data.c_str());
    pCharacteristic->________();  // (2) Metode pengirim nilai ke Central

    digitalWrite(LED_PIN, ________);  // (3) Variabel status hasil pembacaan data

    Serial.printf("[%s] Status dari Central: %d | LED %s\n",
                  formatTimestamp(receiveTime).c_str(), state,
                  state ? "menyala" : "padam");
  }
};

void BLE_init() {
  BLEDevice::init(peripheralName.c_str());

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(BLEUUID(SERVICE_UUID));

  // PROPERTY_READ     -> Central bisa membaca data
  // PROPERTY_WRITE    -> Central bisa mengirim data ke ESP32
  // PROPERTY_NOTIFY   -> ESP32 mengirim data otomatis (tanpa ACK)
  // PROPERTY_INDICATE -> ESP32 mengirim data otomatis (dengan ACK)
  // PROPERTY_WRITE_NR -> Central mengirim data tanpa konfirmasi
  pCharacteristic = pService->createCharacteristic(
    BLEUUID(CHARACTERISTIC_UUID),
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::________  // (4) Properti pengirim data otomatis tanpa ACK
  );

  // Descriptor 0x2902 inilah yang mengizinkan Central menghidupkan notifikasi.
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new ________());  // (5) Nama kelas callback tulisan
  pCharacteristic->setValue("0");

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLEUUID(SERVICE_UUID));
  pAdvertising->setScanResponse(true);

  BLEDevice::startAdvertising();

  Serial.println("Peripheral siap, menunggu Central...");
}

void setup() {
  Serial.begin(115200);
  syncTimeFromSerial();

  pinMode(________, OUTPUT);  // (6) Konstanta pin LED
  digitalWrite(LED_PIN, LOW);

  BLE_init();
}

void loop() {
  // Setelah Central terputus, advertising harus dinyalakan kembali agar
  // perangkat dapat ditemukan lagi pada pemindaian berikutnya.
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Advertising dinyalakan kembali...");
    oldDeviceConnected = deviceConnected;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}
