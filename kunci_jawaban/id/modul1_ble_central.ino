/*
 * MODUL 1 - KONEKTIVITAS BLUETOOTH LOW ENERGY (BLE)  |  Peran: CENTRAL/CLIENT
 * Board   : ESP32 DevKit V1 (DOIT) atau ESP32-S3
 * Library : BLEDevice (bawaan ESP32)
 *
 * Central membaca potensiometer, mengubahnya menjadi sudut 0-180 derajat, lalu
 * mengirimkannya ke Peripheral setiap kali nilainya berubah cukup jauh.
 *
 * KUNCI JAWABAN. Seluruh bagian rumpang sudah terisi; nomor (1) sampai (6) pada
 * komentar di sebelahnya menandai jawaban yang dinilai.
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>  // (1) Berkas header pemindai (scan) perangkat BLE
#include <BLEAdvertisedDevice.h>
#include <time.h>

// ---- UUID KELOMPOK ---------------------------------------------------------
// Hapus tanda // pada SATU pasang baris saja, yaitu pasangan milik kelompok
// kalian. Pasangan yang sama harus aktif pada program Peripheral. Tiap kelompok
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

// Mengubah tegangan pada potensiometer menjadi sudut servo.
int readAngle() {
  int raw = analogRead(POT_PIN);  // (2) Fungsi pembaca nilai analog sebuah pin

  return map(raw, 0, ADC_MAX, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);  // (3) Batas sudut tertinggi
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
  BLERemoteService *pService = pClient->getService(BLEUUID(SERVICE_UUID));  // (4) UUID service

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
  pRemoteCharacteristic->registerForNotify(notifyCallback);  // (5) Nama fungsi notifikasi

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

    String payload = String(angle);  // (6) Variabel sudut yang ingin dikirim

    Serial.printf("[%s] Potensiometer berubah, mengirim sudut: %s derajat\n",
                  formatTimestamp(sendTime).c_str(), payload.c_str());

    // BLE mengirim deretan byte, sehingga panjang datanya ikut disertakan.
    pRemoteCharacteristic->writeValue((uint8_t *)payload.c_str(), payload.length());
  }

  delay(20);
}
