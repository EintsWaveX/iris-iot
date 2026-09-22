/*
 * MODUL 1 - BLE  |  Peran: PERIPHERAL/SERVER (ESP32 DevKit V1/S3)
 * Menerima sudut dari Central, menggerakkan servo SG90 ke sudut itu, lalu
 * memantulkan (echo) nilainya kembali lewat notifikasi. Isi rumpang (1)-(6).
 */

#include <BLEDevice.h>
#include <________>  // (1) Berkas header pembuat server/peripheral BLE
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP32Servo.h>
#include "iris_waktu.h"

// ---- IDENTITAS KELOMPOK -----------------------------------------------------
// Ubah angka di bawah menjadi nomor kelompok kalian (1 sampai 8) pada *kedua*
// program. Kedua UUID ikut berubah sendiri, sehingga Central tidak akan
// tersambung ke papan kelompok lain.
const int GROUP_ID = 1;

String SERVICE_UUID        = "d1f8ef04-1fa7-4806-ba3a-8115c0bcce0" + String(GROUP_ID);
String CHARACTERISTIC_UUID = "11d29a29-98ee-453e-8c87-2f95f867650" + String(GROUP_ID);

String peripheralName = "ESP32-Peripheral";

// Servo SG90 pada GPIO16. Catu dayanya diambil dari pin VIN (5 V), bukan 3V3.
const int SERVO_PIN = 16;

// Lebar pulsa SG90 dalam mikrodetik untuk sudut 0 dan 180 derajat.
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
    int angle = constrain(data.toInt(), 0, 180);

    // Memantulkan data secepat mungkin, sebelum menggerakkan servo dan mencetak
    // ke Serial, agar pengukuran pulang-pergi di sisi Central tidak terbebani.
    pCharacteristic->setValue(data.c_str());
    pCharacteristic->________();  // (2) Metode pengirim nilai ke Central

    servo.write(________);  // (3) Variabel sudut hasil pembacaan data

    Serial.printf("[%s] Sudut dari Central: %d derajat | Servo digerakkan\n",
                  formatTimestamp(receiveTime).c_str(), angle);
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

  servo.attach(________, SERVO_MIN_US, SERVO_MAX_US);  // (6) Konstanta pin servo
  servo.write(90);

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
