/*
 * MODUL 4 - KOMUNIKASI LONG RANGE (LoRaWAN)  |  Peran: NODE / END DEVICE
 * Board   : Cosmic LoRa Aurora V2 (ESP32 + RFM95W)
 * Library : MCCI LoRaWAN LMIC library
 *
 * Node mengukur jarak dengan HC-SR04 lalu mengirimkannya ke gateway WM1302
 * melalui jaringan LoRaWAN. Pada Part A tabrakan paket mustahil karena hanya
 * satu radio yang memancar; di sini tujuh node memancar bersamaan, dan yang
 * mengatur antriannya adalah protokolnya sendiri lewat delapan kanal gateway.
 *
 * Isi setiap bagian rumpang; nomor (1) sampai (6) pada komentar di sebelahnya
 * adalah petunjuknya.
 */

#include <________>  // (1) Header utama pustaka MCCI LoRaWAN LMIC
#include <hal/hal.h>
#include <SPI.h>
#include <time.h>

// ---- NOMOR KELOMPOK --------------------------------------------------------
// Hapus tanda // pada SATU baris saja, yaitu baris nomor kelompok kalian.
// Nomor ini menjadi byte terakhir DEVEUI sekaligus byte pertama payload.
#define GROUP_ID 1
// #define GROUP_ID 2
// #define GROUP_ID 3
// #define GROUP_ID 4
// #define GROUP_ID 5
// #define GROUP_ID 6
// #define GROUP_ID 7
// #define GROUP_ID 8

// Pin radio RFM95W pada board Cosmic LoRa Aurora V2. Berbeda dengan Part A,
// LoRaWAN juga memakai DIO1 untuk menandai jendela penerimaan.
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_DIO1 2
#define LORA_EN   32

#define SPI_MISO 19
#define SPI_MOSI 23
#define SPI_SCK  18

// HC-SR04 pada GPIO16 (TRIG) dan GPIO17 (ECHO), lengkap dengan pembagi
// tegangan 1 kOhm/2 kOhm pada jalur ECHO. Part A tidak memakai sensor.
const int TRIG_PIN = 16;
const int ECHO_PIN = 17;

const float SOUND_CM_PER_US = 0.0343;
const unsigned long ECHO_TIMEOUT_US = 25000;

// Jeda kirim 30 detik menjaga duty cycle tetap sopan; penjadwalan antar node
// diurus protokolnya, bukan oleh kalian.
const unsigned TX_INTERVAL_S = 30;

// Port aplikasi LoRaWAN; angka 1 sudah cukup untuk praktikum ini.
const u1_t APP_PORT = 1;

// Kunci OTAA. DEVEUI dibedakan oleh nomor kelompok sehingga tiap papan
// terdaftar sendiri di ChirpStack. APPKEY disalin dari halaman device
// pada ChirpStack, ditulis dalam urutan MSB.
static const u1_t PROGMEM APPEUI[8]  = { 0, 0, 0, 0, 0, 0, 0, 0 };
static const u1_t PROGMEM DEVEUI[8]  = { GROUP_ID, 0x00, 0x00, 0x00, 0x00, 0x00, 0x53, 0x49 };
static const u1_t PROGMEM APPKEY[16] = { ________ };  // (2) Enam belas byte APPKEY dari ChirpStack

void os_getArtEui(u1_t *buf) { memcpy_P(buf, APPEUI, 8); }
void os_getDevEui(u1_t *buf) { memcpy_P(buf, DEVEUI, 8); }
void os_getDevKey(u1_t *buf) { memcpy_P(buf, APPKEY, 16); }

// Peta pin yang dipakai LMIC untuk berbicara dengan radio.
const lmic_pinmap lmic_pins = {
  .nss  = LORA_NSS,
  .rxtx = LMIC_UNUSED_PIN,
  .rst  = LORA_RST,
  .dio  = { LORA_DIO0, ________, LMIC_UNUSED_PIN },  // (3) Konstanta pin DIO1
};

static osjob_t sendjob;

// Jam dinding dari PC lewat Serial. Node dan Orange Pi harus memakai jam yang
// sama agar waktunya dapat dikurangkan.
uint64_t syncEpochMs = 0;
unsigned long syncMillis = 0;

void syncTimeFromSerial() {
  Serial.println("Menunggu waktu PC (YYYY-MM-DD HH:MM:SS.mmm), maksimal 10 detik...");

  unsigned long waitStart = millis();
  while (millis() - waitStart < 10000UL) {
    if (!Serial.available()) {
      continue;
    }

    String line = Serial.readStringUntil('\n');
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

// Format HH:MM:SS:MS, sama dengan yang dicetak pemantau gateway.
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

// Mengukur jarak dalam sentimeter; -1 bila tidak ada pantulan.
int readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = ________(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);  // (4) Fungsi pengukur lebar pulsa

  if (duration == 0) {
    return -1;
  }

  return (int)((duration * SOUND_CM_PER_US) / 2.0);
}

void do_send(osjob_t *j) {
  if (LMIC.opmode & OP_TXRXPEND) {
    Serial.println("Pengiriman sebelumnya belum selesai, paket dilewati.");
    return;
  }

  int distance = readDistanceCm();

  if (distance < 0) {
    Serial.printf("[%s] HC-SR04 tidak menerima pantulan, paket dilewati.\n",
                  formatTimestamp(millis()).c_str());
  } else {
    // Tiga byte: nomor kelompok, lalu jarak sebagai bilangan 16 bit. Payload
    // LoRaWAN dibuat sesingkat mungkin karena waktu udaranya berbayar.
    uint8_t payload[3];
    payload[0] = GROUP_ID;
    payload[1] = (uint8_t)(distance >> 8);
    payload[2] = (uint8_t)(distance & 0xFF);

    ________(APP_PORT, payload, sizeof(payload), 0);  // (5) Fungsi LMIC penjadwal pengiriman data

    Serial.printf("[%s] Kelompok %d mengirim jarak %d cm ke gateway.\n",
                  formatTimestamp(millis()).c_str(), GROUP_ID, distance);
  }

  os_setTimedCallback(&sendjob, os_getTime() + sec2osticks(TX_INTERVAL_S), do_send);
}

void onEvent(ev_t ev) {
  switch (ev) {
    case EV_JOINING:
      Serial.println("Meminta bergabung (OTAA) ke jaringan LoRaWAN...");
      break;
    case EV_JOINED:
      Serial.println("Berhasil bergabung ke jaringan LoRaWAN.");
      // Link check dimatikan agar node tidak dianggap putus saat jaringan sepi.
      LMIC_setLinkCheckMode(0);
      break;
    case EV_JOIN_FAILED:
      Serial.println("Gagal bergabung; periksa DEVEUI dan APPKEY pada ChirpStack.");
      break;
    case EV_TXCOMPLETE:
      Serial.printf("[%s] Paket selesai dipancarkan.\n", formatTimestamp(millis()).c_str());
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  syncTimeFromSerial();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);

  os_init();
  LMIC_reset();

  // Pita AS923 dipilih lewat konfigurasi pustaka LMIC; SF7 dipakai agar
  // waktu udaranya singkat, sama seperti beacon pada Part A.
  LMIC_setDrTxpow(DR_SF7, 14);

  do_send(&sendjob);
}

void loop() {
  // Seluruh penjadwalan LoRaWAN dikerjakan oleh fungsi ini.
  ________();  // (6) Fungsi utama penjalan antrean LMIC
}
