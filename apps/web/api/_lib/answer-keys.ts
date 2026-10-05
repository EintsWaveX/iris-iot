/**
 * Version 1 of every code blank's answer (ASO code editor, 2026-10-05):
 * what api/_lib/kode-aktif.ts imports as a module's first published version,
 * and serves until one exists in the database. Extracted by hand from Downloads/IRIS ASO/kunci_jawaban/{id,en}. Deliberately lives
 * under api/_lib/ rather than src/lib/: everything under src/ is reachable
 * from an Astro page and therefore from the client bundle, while api/_lib/
 * is only ever imported by Vercel serverless functions. Nothing but
 * api/_lib/kode-aktif.ts may import this file -- that is the whole point of
 * putting it here instead of next to blanks.ts.
 *
 * id/ and en/ answers are identical (verified against both kunci_jawaban
 * trees): a code blank resolves to an identifier, a number, or a short
 * expression, none of which change between the two journal languages --
 * only surrounding comments and strings do. One shared table therefore
 * serves both language tracks.
 *
 * Two blanks are not a single fixed string:
 *  - m2.modul2_websocket_server.2 (ALLOWED_PATHS) is fixed to the
 *    practicum's now-standing five-group roster (see
 *    iris-five-groups-per-session) rather than kunci_jawaban's own
 *    illustrative two-path example, which predates that decision.
 *  - m2.modul2_websocket_esp32.2 (WS_PATH) is genuinely per-group: group 3's
 *    correct answer is "/grup3", not whatever kunci_jawaban's
 *    representative grup1 copy happens to show. Resolved from the
 *    submitting group's own `nomor`, the same way modul4's per-group
 *    folders already resolve GROUP_ID outside the graded blanks.
 */

/** One blank's answer as authored: the canonical text, other spellings
 *  that compile the same, and the per-group form (`{n}` = group number). */
export interface KunciV1 {
  jawaban: string;
  juga?: string[];
  perKelompok?: string;
  kenapa: string;
}

export const KUNCI_V1: Record<string, KunciV1> = {
  // Module 1 -- BLE
  "m1.modul1_ble_central.1": {
    jawaban: "BLEScan.h",
    kenapa:
      "BLEScan.h mendeklarasikan kelas pemindai (BLEScan) yang dipakai di bawah untuk mencari Peripheral.",
  },
  "m1.modul1_ble_central.2": {
    jawaban: "digitalRead",
    kenapa:
      "digitalRead() adalah fungsi Arduino bawaan untuk membaca status HIGH/LOW pada sebuah pin digital.",
  },
  "m1.modul1_ble_central.3": {
    jawaban: "INPUT",
    kenapa:
      "Resistor pull-down eksternal pada skema sudah menyediakan nilai pasti saat tombol tidak ditekan, sehingga mode pin cukup INPUT biasa, bukan INPUT_PULLUP.",
  },
  // kunci_jawaban (2026-09-29) passes SERVICE_UUID straight in, which the
  // ESP32 core 3.3 compiles; the handbook's BLEUUID(SERVICE_UUID) is the
  // same call spelled out, so both are accepted.
  "m1.modul1_ble_central.4": {
    jawaban: "SERVICE_UUID",
    juga: ["BLEUUID(SERVICE_UUID)"],
    kenapa:
      "getService() mencari layanan lewat UUID-nya, yaitu SERVICE_UUID yang sama dengan milik Peripheral.",
  },
  "m1.modul1_ble_central.5": {
    jawaban: "notifyCallback",
    kenapa:
      "notifyCallback adalah fungsi di atas yang menangani setiap notifikasi masuk dari Peripheral.",
  },
  "m1.modul1_ble_central.6": {
    jawaban: "state",
    kenapa:
      "state adalah variabel yang baru saja dihitung readButtonState() dan yang ingin dikirim ke Peripheral.",
  },
  "m1.modul1_ble_peripheral.1": {
    jawaban: "BLEServer.h",
    kenapa:
      "BLEServer.h mendeklarasikan kelas BLEServer yang dipakai untuk membuat sisi Peripheral/server BLE.",
  },
  "m1.modul1_ble_peripheral.2": {
    jawaban: "notify",
    kenapa: "notify() mengirim nilai characteristic saat ini ke Central tanpa menunggu diminta.",
  },
  "m1.modul1_ble_peripheral.3": {
    jawaban: "state",
    kenapa:
      "state adalah status tombol hasil pembacaan data yang baru saja dikonversi dari nilai Central.",
  },
  "m1.modul1_ble_peripheral.4": {
    jawaban: "PROPERTY_NOTIFY",
    kenapa:
      "PROPERTY_NOTIFY adalah properti characteristic yang mengizinkan Peripheral mengirim data otomatis tanpa ACK.",
  },
  "m1.modul1_ble_peripheral.5": {
    jawaban: "MyCharacteristicCallbacks",
    kenapa:
      "MyCharacteristicCallbacks adalah kelas di atas yang berisi onWrite(), dipanggil setiap kali Central menulis data.",
  },
  "m1.modul1_ble_peripheral.6": {
    jawaban: "LED_PIN",
    kenapa: "LED_PIN adalah konstanta pin GPIO tempat anoda LED terpasang.",
  },

  // Module 2 -- WebSocket
  "m2.modul2_websocket_server.1": {
    jawaban: "8765",
    kenapa: "8765 adalah nomor port yang harus sama persis dengan WS_PORT pada setiap kode ESP32.",
  },
  "m2.modul2_websocket_server.2": {
    jawaban: '{"/grup1","/grup2","/grup3","/grup4","/grup5"}',
    kenapa:
      "Praktikum berjalan dengan lima kelompok tiap sesi, sehingga kelima path itulah yang diterima server.",
  },
  "m2.modul2_websocket_server.3": {
    jawaban: "json.loads",
    kenapa:
      "json.loads() mengurai teks JSON yang diterima menjadi dict Python yang nilainya bisa dibaca.",
  },
  "m2.modul2_websocket_server.4": {
    jawaban: '"hum"',
    kenapa:
      'ESP32 mengirim kelembapan dengan kunci JSON "hum", sehingga server harus membaca kunci yang sama.',
  },
  "m2.modul2_websocket_server.5": {
    jawaban: "send",
    kenapa:
      "send() adalah metode websockets untuk mengirim balasan teks kembali ke client yang terhubung.",
  },
  "m2.modul2_websocket_server.6": {
    jawaban: "serve",
    kenapa:
      "serve() dari websockets.asyncio.server adalah fungsi yang benar-benar menjalankan server WebSocket.",
  },
  "m2.modul2_websocket_esp32.1": {
    jawaban: "WebSocketsClient.h",
    kenapa:
      "WebSocketsClient.h adalah header pustaka WebSockets karya Markus Sattler yang dipakai di bawah.",
  },
  "m2.modul2_websocket_esp32.2": {
    jawaban: "/grup1",
    perKelompok: "/grup{n}",
    kenapa:
      "WS_PATH memberi tahu server papan kelompok mana yang menyambung, jadi harus path milik kelompok kalian sendiri.",
  },
  "m2.modul2_websocket_esp32.3": {
    jawaban: "readTemperature",
    kenapa: "readTemperature() adalah metode pustaka DHT untuk membaca suhu dalam Celsius.",
  },
  "m2.modul2_websocket_esp32.4": {
    jawaban: "webSocketEvent",
    kenapa:
      "webSocketEvent adalah fungsi callback di atas yang menangani status koneksi dan balasan server.",
  },
  "m2.modul2_websocket_esp32.5": {
    jawaban: "loop",
    kenapa: "webSocket.loop() memproses event WebSocket dan wajib dipanggil setiap iterasi loop().",
  },
  "m2.modul2_websocket_esp32.6": {
    jawaban: "sendTXT",
    kenapa:
      "sendTXT() mengirim pesan teks (di sini JSON) melalui koneksi WebSocket yang sudah terbuka.",
  },

  // Module 3 -- MQTT
  "m3.modul3_mqtt_publish.1": {
    jawaban: "STA_IF",
    kenapa:
      "STA_IF adalah konstanta mode station: Pico W bergabung ke jaringan yang sudah ada, bukan membuat jaringan sendiri.",
  },
  "m3.modul3_mqtt_publish.2": {
    jawaban: "wifi_password",
    kenapa:
      "wlan.connect() butuh SSID dan kata sandi; wifi_password adalah variabel kata sandi yang sudah didefinisikan di atas.",
  },
  "m3.modul3_mqtt_publish.3": {
    jawaban: "1883",
    kenapa:
      "1883 adalah port bawaan Eclipse Mosquitto, harus sama dengan nilai listener pada mosquitto.conf.",
  },
  "m3.modul3_mqtt_publish.4": {
    jawaban: "read_u16",
    kenapa: "read_u16() membaca ADC Pico W sebagai bilangan 16 bit (0 sampai 65535).",
  },
  "m3.modul3_mqtt_publish.5": {
    jawaban: "deadband_pct",
    kenapa:
      "deadband_pct adalah ambang perubahan yang sudah didefinisikan di atas, dipakai supaya derau ADC tidak memicu publish terus-menerus.",
  },
  "m3.modul3_mqtt_publish.6": {
    jawaban: "publish",
    kenapa: "publish() adalah metode MQTTClient untuk mengirim sebuah pesan ke topic tertentu.",
  },
  "m3.modul3_mqtt_subscribe.1": {
    jawaban: "MQTTClient",
    kenapa: "MQTTClient adalah kelas client MQTT dari pustaka umqtt.simple yang dipakai di bawah.",
  },
  "m3.modul3_mqtt_subscribe.2": {
    jawaban: "group_id",
    kenapa:
      "Topic Subscriber harus sama persis dengan topic Publisher, keduanya diturunkan dari group_id yang sama.",
  },
  "m3.modul3_mqtt_subscribe.3": {
    jawaban: "timestamp",
    kenapa:
      "timestamp() di bagian atas berkas mengembalikan jam dinding dalam format HH:MM:SS:MS yang sudah diselaraskan NTP.",
  },
  "m3.modul3_mqtt_subscribe.4": {
    jawaban: "mqtt_subscription_callback",
    kenapa:
      "mqtt_subscription_callback adalah fungsi di atas yang dijalankan setiap kali pesan baru diterima.",
  },
  "m3.modul3_mqtt_subscribe.5": {
    jawaban: "subscribe",
    kenapa:
      "subscribe() mendaftarkan client untuk menerima setiap pesan yang dipublikasikan ke topic tersebut.",
  },
  "m3.modul3_mqtt_subscribe.6": {
    jawaban: "check_msg",
    kenapa:
      "check_msg() memeriksa pesan baru tanpa memblokir, sehingga loop tetap sempat mengirim ping berkala.",
  },

  // Module 4 -- LoRa
  "m4.modul4_hunter.1": {
    jawaban: "LoRa.h",
    kenapa:
      "LoRa.h adalah header pustaka LoRa peer-to-peer karya Sandeep Mistry yang dipakai kedua papan.",
  },
  "m4.modul4_hunter.2": {
    jawaban: "WIFI_PASSWORD",
    kenapa:
      "WIFI_PASSWORD adalah konstanta kata sandi hotspot Orange Pi yang sudah didefinisikan di atas.",
  },
  "m4.modul4_hunter.3": {
    jawaban: "LORA_SPREADING_FACTOR",
    kenapa:
      "Spreading factor Hunter harus sama persis dengan Beacon, diambil dari konstanta LORA_SPREADING_FACTOR.",
  },
  "m4.modul4_hunter.4": {
    jawaban: "LORA_SYNC_WORD",
    kenapa:
      "Sync word menyaring radio pasangan; LORA_SYNC_WORD harus sama persis dengan Beacon agar paket terbaca.",
  },
  "m4.modul4_hunter.5": {
    jawaban: "packetRssi",
    kenapa:
      "packetRssi() membaca kekuatan sinyal mentah (RSSI) dari paket yang baru saja diterima.",
  },
  "m4.modul4_hunter.6": {
    jawaban: "sendTXT",
    kenapa: "sendTXT() mengirim payload JSON hasil pembacaan ke papan skor melalui WebSocket.",
  },
  "m4.modul4_beacon.1": {
    jawaban: "LoRa.h",
    kenapa:
      "LoRa.h adalah header pustaka LoRa peer-to-peer karya Sandeep Mistry yang dipakai kedua papan.",
  },
  "m4.modul4_beacon.2": {
    jawaban: "NTP_SERVER",
    kenapa:
      "NTP_SERVER menunjuk ke Orange Pi yang sama, satu-satunya sumber waktu yang tersedia di hotspot praktikum.",
  },
  "m4.modul4_beacon.3": {
    jawaban: "LORA_BANDWIDTH",
    kenapa:
      "Lebar pita Beacon harus sama persis dengan seluruh Hunter, diambil dari konstanta LORA_BANDWIDTH.",
  },
  "m4.modul4_beacon.4": {
    jawaban: "BEACON_TX_POWER",
    kenapa: "BEACON_TX_POWER mengatur daya pancar sesuai ukuran arena, bukan dibesarkan sebisanya.",
  },
  "m4.modul4_beacon.5": {
    jawaban: "payload",
    kenapa: "payload adalah string nomor urut dan waktu kirim yang baru saja disusun di atas.",
  },
  "m4.modul4_beacon.6": {
    jawaban: "endPacket",
    kenapa:
      "endPacket() menutup dan benar-benar memancarkan paket yang isinya sudah ditulis dengan print().",
  },
};
