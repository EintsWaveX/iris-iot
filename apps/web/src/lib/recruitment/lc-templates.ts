/**
 * The default starting sketches of Live Coding (EXAM-ENGINE 9.3): one per
 * protocol, two for HTTP/WebSocket. Each one starts with
 * `#include "iris_seat.h"` (the generated header carries the hotspot, the
 * token and the addresses), connects, has one send helper and one receive
 * callback, prints [INFO] lines at boot, and leaves the topic's logic between
 * the TODO markers. They ship as the defaults and stay editable in the bank.
 *
 * Every one is compiled for both chips by `rec_lc_templates.py` in the rig
 * before it goes in (2026-10-25: results in handoffs/12.md).
 */
import type { TemplateKey } from "./lc-types.js";

/** The markers the editor stripes in gold; the candidate writes between them. */
export const TODO_START = "// TODO-MULAI";
export const TODO_END = "// TODO-SELESAI";

const wifi = String.raw`
void sambungWifi() {
  Serial.printf("[INFO] Menyambung ke hotspot %s\n", IRIS_WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(IRIS_WIFI_SSID, IRIS_WIFI_PASS);
  unsigned long mulai = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    if (millis() - mulai > 30000UL) {
      Serial.println("[ERROR] Wi-Fi belum tersambung, periksa hotspot (2,4 GHz, WPA2).");
      mulai = millis();
    }
  }
  Serial.print("[INFO] Wi-Fi tersambung, IP ");
  Serial.println(WiFi.localIP());
}
`;

const mqtt =
  String.raw`#include "iris_seat.h"
#include <WiFi.h>
#include <mqtt_client.h>

// MQTT lewat WebSocket ke broker IRIS. Akun dan topik papan ini sudah diatur
// di iris_seat.h: kirim ke IRIS_TOPIC "up/<nama>", terima dari IRIS_TOPIC "down/<nama>".

esp_mqtt_client_handle_t klien = nullptr;
bool mqttTersambung = false;
String idKlien;
` +
  wifi +
  String.raw`
// Satu fungsi kirim: nama = bagian terakhir topik, isi = teks pesannya.
void kirim(const char* nama, const String& isi) {
  if (!mqttTersambung) return;
  String topik = String(IRIS_TOPIC) + "up/" + nama;
  esp_mqtt_client_publish(klien, topik.c_str(), isi.c_str(), isi.length(), 0, 0);
  Serial.printf("[KIRIM] %s = %s\n", topik.c_str(), isi.c_str());
}

// Satu fungsi terima: dipanggil untuk tiap pesan dari IRIS_TOPIC "down/...".
void onTerima(const String& nama, const String& isi) {
  Serial.printf("[TERIMA] %s = %s\n", nama.c_str(), isi.c_str());
  ${TODO_START}
  // Tulis di sini apa yang dilakukan papan saat menerima perintah.
  ${TODO_END}
}

static void onMqtt(void* arg, esp_event_base_t base, int32_t id, void* data) {
  auto* e = static_cast<esp_mqtt_event_handle_t>(data);
  switch (static_cast<esp_mqtt_event_id_t>(id)) {
    case MQTT_EVENT_CONNECTED:
      mqttTersambung = true;
      esp_mqtt_client_subscribe(klien, IRIS_TOPIC "down/#", 0);
      Serial.println("[INFO] MQTT tersambung dan berlangganan");
      break;
    case MQTT_EVENT_DISCONNECTED:
      mqttTersambung = false;
      Serial.println("[WARN] MQTT terputus, mencoba lagi");
      break;
    case MQTT_EVENT_DATA: {
      String topik(e->topic, e->topic_len);
      String isi(e->data, e->data_len);
      int garis = topik.lastIndexOf('/');
      onTerima(garis >= 0 ? topik.substring(garis + 1) : topik, isi);
      break;
    }
    default:
      break;
  }
}

void sambungMqtt() {
  idKlien = String(IRIS_SEAT) + "-b" + String(IRIS_BOARD);
  esp_mqtt_client_config_t cfg = {};
  cfg.broker.address.uri = IRIS_MQTT_URI;
  cfg.credentials.username = IRIS_MQTT_USER;
  cfg.credentials.client_id = idKlien.c_str();
  cfg.credentials.authentication.password = IRIS_MQTT_PASS;
  cfg.network.reconnect_timeout_ms = 3000;
  klien = esp_mqtt_client_init(&cfg);
  esp_mqtt_client_register_event(klien, static_cast<esp_mqtt_event_id_t>(ESP_EVENT_ANY_ID), onMqtt, nullptr);
  esp_mqtt_client_start(klien);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("[INFO] Papan %d kursi %s siap\n", IRIS_BOARD, IRIS_SEAT);
  sambungWifi();
  sambungMqtt();
  ${TODO_START}
  // Atur pin dan sensormu di sini.
  ${TODO_END}
}

void loop() {
  ${TODO_START}
  // Baca sensor dan panggil kirim("nama", "isi") di sini.
  ${TODO_END}
  delay(10);
}
`;

const ws =
  String.raw`#include "iris_seat.h"
#include <WiFi.h>
#include <WebSocketsClient.h>

// WebSocket ke IRIS (arduinoWebSockets). Alamat dan token sudah ada di
// iris_seat.h. Teks apa pun yang kamu kirim muncul di halaman IRIS, dan teks
// dari halaman IRIS datang ke onTerima.

WebSocketsClient soket;
bool soketTersambung = false;
` +
  wifi +
  String.raw`
// Satu fungsi kirim: satu bingkai teks.
void kirim(const String& pesan) {
  if (!soketTersambung) return;
  soket.sendTXT(pesan);
  Serial.printf("[KIRIM] %s\n", pesan.c_str());
}

// Satu fungsi terima: dipanggil untuk tiap bingkai teks dari IRIS.
void onTerima(const String& pesan) {
  Serial.printf("[TERIMA] %s\n", pesan.c_str());
  ${TODO_START}
  // Tulis di sini apa yang dilakukan papan saat menerima perintah.
  ${TODO_END}
}

void onSoket(WStype_t tipe, uint8_t* isi, size_t panjang) {
  switch (tipe) {
    case WStype_CONNECTED:
      soketTersambung = true;
      Serial.println("[INFO] WebSocket tersambung");
      break;
    case WStype_DISCONNECTED:
      soketTersambung = false;
      Serial.println("[WARN] WebSocket terputus, mencoba lagi");
      break;
    case WStype_TEXT:
      onTerima(String(reinterpret_cast<const char*>(isi)).substring(0, panjang));
      break;
    default:
      break;
  }
}

void sambungSoket() {
  soket.begin(IRIS_WS_HOST, IRIS_WS_PORT, IRIS_WS_PATH);
  soket.onEvent(onSoket);
  soket.setReconnectInterval(3000);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("[INFO] Papan %d kursi %s siap\n", IRIS_BOARD, IRIS_SEAT);
  sambungWifi();
  sambungSoket();
  ${TODO_START}
  // Atur pin dan sensormu di sini.
  ${TODO_END}
}

void loop() {
  soket.loop();
  ${TODO_START}
  // Baca sensor dan panggil kirim("...") di sini.
  ${TODO_END}
}
`;

const http =
  String.raw`#include "iris_seat.h"
#include <WiFi.h>
#include <HTTPClient.h>

// HTTP ke IRIS. Papan hanya membuat permintaan: IRIS membalas dengan
// {"ok":true,"t":...,"echo":...,"cmd":...}, dan "cmd" berisi perintah
// berikutnya dari halaman IRIS (atau null). Alamat dan token ada di iris_seat.h.

` +
  wifi +
  String.raw`
// Satu fungsi terima: dipanggil dengan perintah dari "cmd" (teks mentah).
void onTerima(const String& perintah) {
  Serial.printf("[TERIMA] %s\n", perintah.c_str());
  ${TODO_START}
  // Tulis di sini apa yang dilakukan papan saat menerima perintah.
  ${TODO_END}
}

// Mengambil nilai "cmd" dari balasan; kosong bila null atau tidak ada.
String ambilPerintah(const String& balasan) {
  int a = balasan.indexOf("\"cmd\":");
  if (a < 0) return "";
  a += 6;
  while (a < (int)balasan.length() && balasan[a] == ' ') a++;
  if (balasan.startsWith("null", a)) return "";
  int b = balasan.indexOf('}', a);
  int akhir = balasan.length() - 1;
  String nilai = balasan.substring(a, b > a ? b : akhir);
  nilai.trim();
  return nilai;
}

// Satu fungsi kirim: POST isi ke IRIS_HTTP_URL/<jalur>. Perintah dari balasan
// langsung diteruskan ke onTerima.
bool kirim(const char* jalur, const String& isi) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient klien;
  klien.begin(String(IRIS_HTTP_URL) + "/" + jalur);
  klien.addHeader("Content-Type", "application/json");
  int kode = klien.POST(isi);
  if (kode <= 0) {
    Serial.printf("[ERROR] HTTP gagal: %s\n", klien.errorToString(kode).c_str());
    klien.end();
    return false;
  }
  String balasan = klien.getString();
  klien.end();
  Serial.printf("[KIRIM] /%s %s -> %d %s\n", jalur, isi.c_str(), kode, balasan.c_str());
  String perintah = ambilPerintah(balasan);
  if (perintah.length()) onTerima(perintah);
  return kode == 200;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("[INFO] Papan %d kursi %s siap\n", IRIS_BOARD, IRIS_SEAT);
  sambungWifi();
  ${TODO_START}
  // Atur pin dan sensormu di sini.
  ${TODO_END}
}

void loop() {
  ${TODO_START}
  // Baca sensor lalu panggil kirim("data", "{...}") secukupnya (jangan lebih dari sekali per detik).
  ${TODO_END}
  delay(10);
}
`;

const ble = String.raw`#include "iris_seat.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// BLE: papan ini mengiklankan diri sebagai IRIS_BLE_NAME. Halaman IRIS
// (Web Bluetooth) menyambung ke papan: data yang kamu kirim keluar lewat
// notifikasi TX, dan tulisan dari halaman masuk lewat RX. Papan BLE tidak
// memakai Wi-Fi.

BLECharacteristic* karakterTx = nullptr;
bool bleTersambung = false;

// Satu fungsi kirim: satu notifikasi (sampai sekitar 20 byte per paket).
void kirim(const String& pesan) {
  if (!bleTersambung || !karakterTx) return;
  karakterTx->setValue(pesan.c_str());
  karakterTx->notify();
  Serial.printf("[KIRIM] %s\n", pesan.c_str());
}

// Satu fungsi terima: dipanggil untuk tiap tulisan dari halaman IRIS.
void onTerima(const String& pesan) {
  Serial.printf("[TERIMA] %s\n", pesan.c_str());
  ${TODO_START}
  // Tulis di sini apa yang dilakukan papan saat menerima perintah.
  ${TODO_END}
}

class CallbackServer : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    bleTersambung = true;
    Serial.println("[INFO] BLE tersambung");
  }
  void onDisconnect(BLEServer* server) override {
    bleTersambung = false;
    Serial.println("[WARN] BLE terputus, beriklan lagi");
    server->startAdvertising();
  }
};

class CallbackRx : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* karakter) override {
    String nilai = karakter->getValue();
    onTerima(nilai);
  }
};

void mulaiBle() {
  BLEDevice::init(IRIS_BLE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new CallbackServer());
  BLEService* layanan = server->createService(IRIS_SERVICE_UUID);
  karakterTx = layanan->createCharacteristic(IRIS_TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  karakterTx->addDescriptor(new BLE2902());
  BLECharacteristic* karakterRx = layanan->createCharacteristic(IRIS_RX_UUID, BLECharacteristic::PROPERTY_WRITE);
  karakterRx->setCallbacks(new CallbackRx());
  layanan->start();
  BLEAdvertising* iklan = BLEDevice::getAdvertising();
  iklan->addServiceUUID(IRIS_SERVICE_UUID);
  iklan->start();
  Serial.printf("[INFO] BLE beriklan sebagai %s\n", IRIS_BLE_NAME);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("[INFO] Papan %d kursi %s siap\n", IRIS_BOARD, IRIS_SEAT);
  mulaiBle();
  ${TODO_START}
  // Atur pin dan sensormu di sini.
  ${TODO_END}
}

void loop() {
  ${TODO_START}
  // Baca sensor dan panggil kirim("...") di sini.
  ${TODO_END}
  delay(10);
}
`;

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = { ble, http, ws, mqtt };
