/*
 * MODUL 2 - WEBSOCKET  |  Peran: Client (ESP32 DevKit V1/S3)
 * Membaca suhu/kelembapan DHT22 tiap 2 detik dan mengirimkannya sebagai JSON
 * ke server Python, yang membalas dengan waktu terimanya. Isi rumpang (1)-(6).
 */

#include <WiFi.h>
#include <________>  // (1) Header pustaka client WebSocket (arduinoWebSockets)
#include <DHT.h>
#include <time.h>
#include <sys/time.h>  // Untuk gettimeofday() beresolusi mikrodetik

const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char*    WS_HOST = "192.168.1.100";  // Samakan dengan alamat IP Orange Pi
const uint16_t WS_PORT = 8765;             // Samakan dengan port Orange Pi

// ---- PATH KELOMPOK ---------------------------------------------------------
// Path inilah yang memberi tahu server papan kelompok mana yang menyambung.
// Pakailah path milik kelompok kalian saja: "/grup1", "/grup2", "/grup3",
// "/grup4", "/grup5", "/grup6", "/grup7", atau "/grup8". Nilainya harus ada
// di dalam ALLOWED_PATHS pada server.
const char*    WS_PATH = "________";  // (2) Path, sama dengan pada server Python

// NTP: penyelaras jam dinding. Offset 25200 detik setara dengan WIB (UTC+7).
const char*  NTP_SERVER     = "pool.ntp.org";
const long   GMT_OFFSET_SEC = 25200;
const int    DST_OFFSET_SEC = 0;

// DHT22 pada GPIO16. Sensor ini tidak boleh dibaca lebih cepat dari sekali
// tiap 2 detik.
const int DHT_PIN = 16;
const unsigned long SAMPLE_INTERVAL_MS = 2000;

DHT dht(DHT_PIN, DHT22);
WebSocketsClient webSocket;

bool webSocketConnected = false;

unsigned long seq = 0;
unsigned long lastSampleTime = 0;
unsigned long sendTime = 0;
bool waitingForReply = false;

// Jam dinding hasil sinkronisasi NTP dalam format HH:MM:SS:MS.
String wallClockTimestamp() {
  struct timeval tv;
  gettimeofday(&tv, NULL);

  struct tm timeinfo;
  localtime_r(&tv.tv_sec, &timeinfo);

  char buffer[16];
  snprintf(
    buffer, sizeof(buffer), "%02d:%02d:%02d:%03ld",
    timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec,
    (long)(tv.tv_usec / 1000L)
  );
  return String(buffer);
}

// Menyusun satu bingkai JSON berisi pembacaan DHT22 terbaru. Mengembalikan
// string kosong bila sensornya gagal dibaca.
String buildReading() {
  float humidity    = dht.readHumidity();
  float temperature = dht.________();  // (3) Metode pembaca suhu dalam Celsius

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT22 gagal dibaca, periksa kabel data dan catu dayanya.");
    return "";
  }

  char buffer[80];
  snprintf(buffer, sizeof(buffer), "{\"seq\":%lu,\"temp\":%.1f,\"hum\":%.1f}",
           seq, temperature, humidity);
  return String(buffer);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      Serial.println("WebSocket terhubung.");
      break;

    case WStype_DISCONNECTED:
      webSocketConnected = false;
      Serial.println("WebSocket terputus.");
      break;

    case WStype_TEXT: {
      if (!waitingForReply) {
        break;
      }

      unsigned long replyTime = millis();
      waitingForReply = false;

      String reply = String((const char*)payload).substring(0, length);

      Serial.printf("[%s] Ack #%lu dari server: %s | Delay (round-trip): %lu ms\n",
                    wallClockTimestamp().c_str(), seq, reply.c_str(),
                    replyTime - sendTime);
      break;
    }

    case WStype_ERROR:
      Serial.println("WebSocket error.");
      break;

    default:
      break;
  }
}

void connectToWiFi() {
  Serial.print("Menyambung ke Wi-Fi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.printf("\nWi-Fi terhubung, alamat IP ESP32: %s\n",
                WiFi.localIP().toString().c_str());
}

void syncClock() {
  Serial.print("Menyelaraskan jam melalui NTP");
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER);

  // Sebelum NTP menjawab, jam sistem masih berada di tahun 1970.
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo, 1000)) {
    Serial.print(".");
  }

  Serial.printf("\nJam tersinkronisasi: %s\n", wallClockTimestamp().c_str());
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  dht.begin();

  connectToWiFi();
  syncClock();

  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(________);  // (4) Nama fungsi callback di atas, tanpa tanda kurung

  // Ping tiap 15 detik; setelah 2 kali gagal dibalas dalam 3 detik, papan
  // memutus sendiri koneksi yang macet dan reconnect otomatis berjalan.
  webSocket.enableHeartbeat(15000, 3000, 2);

  webSocket.setReconnectInterval(5000);
  WiFi.setAutoReconnect(true);

  Serial.println("Pembacaan DHT22 akan dikirim setiap 2 detik.");
}

void loop() {
  webSocket.________();  // (5) Metode pemroses event, wajib dipanggil berkala

  if (!webSocketConnected) {
    return;
  }

  if (millis() - lastSampleTime < SAMPLE_INTERVAL_MS) {
    return;
  }

  lastSampleTime = millis();
  seq++;

  String message = buildReading();
  if (message == "") {
    return;
  }

  sendTime = millis();
  waitingForReply = true;

  webSocket.________(message);  // (6) Metode pengirim pesan teks

  Serial.printf("[%s] Kirim #%lu: %s\n",
                wallClockTimestamp().c_str(), seq, message.c_str());
}
