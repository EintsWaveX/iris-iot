/*
 * MODUL 1 - KONEKTIVITAS BLUETOOTH LOW ENERGY (BLE)  |  Peran: PERIPHERAL/SERVER
 * Board   : ESP32 DevKit V1 (DOIT) atau ESP32-S3
 * Library : BLEDevice (bawaan ESP32) dan ESP32Servo
 *
 * Peripheral menerima sudut dari Central, menggerakkan servo SG90 ke sudut itu,
 * lalu memantulkan (echo) nilainya kembali lewat notifikasi.
 *
 * Isi setiap bagian rumpang; nomor (1) sampai (6) pada komentar di sebelahnya
 * adalah petunjuknya.
 */

#include <BLEDevice.h>
#include <________>  // (1) Berkas header pembuat server/peripheral BLE
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP32Servo.h>
#include <time.h>

// ---- UUID KELOMPOK ---------------------------------------------------------
// Hapus tanda // pada SATU pasang baris saja, yaitu pasangan milik kelompok
// kalian. Pasangan yang sama harus aktif pada program Central. Tiap kelompok
// memakai UUID sendiri agar Central tidak tersambung ke papan kelompok lain.
// Kelompok 1
#define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce01"
#define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676501"
// Kelompok 2
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce02"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676502"
// Kelompok 3
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce03"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676503"
// Kelompok 4
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce04"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676504"
// Kelompok 5
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce05"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676505"
// Kelompok 6
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce06"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676506"
// Kelompok 7
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce07"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676507"
// Kelompok 8
// #define SERVICE_UUID        "d1f8ef04-1fa7-4806-ba3a-8115c0bcce08"
// #define CHARACTERISTIC_UUID "11d29a29-98ee-453e-8c87-2f95f8676508"

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

// Jam dinding dari PC lewat Serial: kirim "YYYY-MM-DD HH:MM:SS.mmm" lalu Enter
// pada Serial Monitor, atau jalankan scripts/send_time.ps1 di PC. Kedua papan
// HARUS disinkronkan dari PC yang sama agar waktunya dapat dibandingkan.
uint64_t syncEpochMs = 0;      // Milidetik Unix pada saat sinkronisasi.
unsigned long syncMillis = 0;  // Nilai millis() pada saat yang sama.

void syncTimeFromSerial() {
  Serial.println("Menunggu waktu PC (YYYY-MM-DD HH:MM:SS.mmm), maksimal 10 detik...");

  unsigned long waitStart = millis();
  while (millis() - waitStart < 10000UL) {
    if (!Serial.available()) {
      continue;
    }

    String line = Serial.readStringUntil('\n');

    // Dicatat sedini mungkin; inilah titik millis() yang mewakili waktu PC itu.
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

      Serial.println("Waktu tersinkron dari PC sampai milidetik.");
      return;
    }

    Serial.println("Format tidak dikenali, kirim ulang: YYYY-MM-DD HH:MM:SS.mmm");
  }

  Serial.println("Tidak ada waktu PC diterima, timestamp memakai waktu sejak boot.");
}

// Format HH:MM:SS:MS. Setelah tersinkron ini adalah jam dinding nyata sampai ke
// milidetiknya, sehingga waktu pada kedua Serial Monitor boleh dikurangkan.
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
