/**
 * The correct value for every code blank across all four modules, extracted
 * by hand from Downloads/IRIS ASO/kunci_jawaban/{id,en}. Deliberately lives
 * under api/_lib/ rather than src/lib/: everything under src/ is reachable
 * from an Astro page and therefore from the client bundle, while api/_lib/
 * is only ever imported by Vercel serverless functions. Nothing outside
 * api/modul/[aksi].ts may import this file -- that is the whole point of
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

export interface AnswerContext {
  nomorKelompok: number;
}

interface AnswerEntry {
  cocok(jawaban: string, ctx: AnswerContext): boolean;
  kenapa: string;
  /** The as-authored correct text, for the gated download's reconstruction
   *  ONLY (see canonicalAnswer() below) -- never wired into a client-facing
   *  response. A verified-correct answer is merged into the downloaded file
   *  as THIS value, not the student's own raw isi, because "blescan.h" with
   *  stray spaces passes the normalized check but would not compile if
   *  spliced verbatim into `#include <...>`. */
  kanonik(ctx: AnswerContext): string;
}

/** Trim, case-fold, and collapse internal whitespace -- the last step matters
 *  only for the one blank whose answer is a multi-token set literal; every
 *  other answer is a single token with no internal whitespace to collapse. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function exact(correct: string, kenapa: string): AnswerEntry {
  const target = normalize(correct);
  return { cocok: (jawaban) => normalize(jawaban) === target, kenapa, kanonik: () => correct };
}

function perGroup(template: (nomorKelompok: number) => string, kenapa: string): AnswerEntry {
  return {
    cocok: (jawaban, ctx) => normalize(jawaban) === normalize(template(ctx.nomorKelompok)),
    kenapa,
    kanonik: (ctx) => template(ctx.nomorKelompok),
  };
}

export const ANSWER_KEYS: Record<string, AnswerEntry> = {
  // Module 1 -- BLE
  "m1.modul1_ble_central.1": exact(
    "BLEScan.h",
    "BLEScan.h mendeklarasikan kelas pemindai (BLEScan) yang dipakai di bawah untuk mencari Peripheral.",
  ),
  "m1.modul1_ble_central.2": exact(
    "analogRead",
    "analogRead() adalah fungsi Arduino bawaan untuk membaca tegangan pada sebuah pin ADC.",
  ),
  "m1.modul1_ble_central.3": exact(
    "SERVO_MAX_ANGLE",
    "map() butuh batas atas keluarannya; SERVO_MAX_ANGLE (180) adalah sudut servo tertinggi yang valid.",
  ),
  "m1.modul1_ble_central.4": exact(
    "BLEUUID(SERVICE_UUID)",
    "getService() menerima objek BLEUUID, bukan string biasa, sehingga SERVICE_UUID harus dibungkus BLEUUID().",
  ),
  "m1.modul1_ble_central.5": exact(
    "notifyCallback",
    "notifyCallback adalah fungsi di atas yang menangani setiap notifikasi masuk dari Peripheral.",
  ),
  "m1.modul1_ble_central.6": exact(
    "angle",
    "angle adalah variabel yang baru saja dihitung readAngle() dan yang ingin dikirim ke Peripheral.",
  ),
  "m1.modul1_ble_peripheral.1": exact(
    "BLEServer.h",
    "BLEServer.h mendeklarasikan kelas BLEServer yang dipakai untuk membuat sisi Peripheral/server BLE.",
  ),
  "m1.modul1_ble_peripheral.2": exact(
    "notify",
    "notify() mengirim nilai characteristic saat ini ke Central tanpa menunggu diminta.",
  ),
  "m1.modul1_ble_peripheral.3": exact(
    "angle",
    "angle adalah sudut hasil pembacaan data yang baru saja dikonversi dari nilai Central.",
  ),
  "m1.modul1_ble_peripheral.4": exact(
    "PROPERTY_NOTIFY",
    "PROPERTY_NOTIFY adalah properti characteristic yang mengizinkan Peripheral mengirim data otomatis tanpa ACK.",
  ),
  "m1.modul1_ble_peripheral.5": exact(
    "MyCharacteristicCallbacks",
    "MyCharacteristicCallbacks adalah kelas di atas yang berisi onWrite(), dipanggil setiap kali Central menulis data.",
  ),
  "m1.modul1_ble_peripheral.6": exact(
    "SERVO_PIN",
    "SERVO_PIN adalah konstanta pin GPIO tempat kabel sinyal servo terpasang.",
  ),

  // Module 2 -- WebSocket
  "m2.modul2_websocket_server.1": exact(
    "8765",
    "8765 adalah nomor port yang harus sama persis dengan WS_PORT pada setiap kode ESP32.",
  ),
  "m2.modul2_websocket_server.2": exact(
    '{"/grup1","/grup2","/grup3","/grup4","/grup5"}',
    "Praktikum berjalan dengan lima kelompok tiap sesi, sehingga kelima path itulah yang diterima server.",
  ),
  "m2.modul2_websocket_server.3": exact(
    "json.loads",
    "json.loads() mengurai teks JSON yang diterima menjadi dict Python yang nilainya bisa dibaca.",
  ),
  "m2.modul2_websocket_server.4": exact(
    '"hum"',
    'ESP32 mengirim kelembapan dengan kunci JSON "hum", sehingga server harus membaca kunci yang sama.',
  ),
  "m2.modul2_websocket_server.5": exact(
    "send",
    "send() adalah metode websockets untuk mengirim balasan teks kembali ke client yang terhubung.",
  ),
  "m2.modul2_websocket_server.6": exact(
    "serve",
    "serve() dari websockets.asyncio.server adalah fungsi yang benar-benar menjalankan server WebSocket.",
  ),
  "m2.modul2_websocket_esp32.1": exact(
    "WebSocketsClient.h",
    "WebSocketsClient.h adalah header pustaka WebSockets karya Markus Sattler yang dipakai di bawah.",
  ),
  "m2.modul2_websocket_esp32.2": perGroup(
    (nomor) => `/grup${nomor}`,
    "WS_PATH memberi tahu server papan kelompok mana yang menyambung, jadi harus path milik kelompok kalian sendiri.",
  ),
  "m2.modul2_websocket_esp32.3": exact(
    "readTemperature",
    "readTemperature() adalah metode pustaka DHT untuk membaca suhu dalam Celsius.",
  ),
  "m2.modul2_websocket_esp32.4": exact(
    "webSocketEvent",
    "webSocketEvent adalah fungsi callback di atas yang menangani status koneksi dan balasan server.",
  ),
  "m2.modul2_websocket_esp32.5": exact(
    "loop",
    "webSocket.loop() memproses event WebSocket dan wajib dipanggil setiap iterasi loop().",
  ),
  "m2.modul2_websocket_esp32.6": exact(
    "sendTXT",
    "sendTXT() mengirim pesan teks (di sini JSON) melalui koneksi WebSocket yang sudah terbuka.",
  ),

  // Module 3 -- MQTT
  "m3.modul3_mqtt_publish.1": exact(
    "STA_IF",
    "STA_IF adalah konstanta mode station: Pico W bergabung ke jaringan yang sudah ada, bukan membuat jaringan sendiri.",
  ),
  "m3.modul3_mqtt_publish.2": exact(
    "wifi_password",
    "wlan.connect() butuh SSID dan kata sandi; wifi_password adalah variabel kata sandi yang sudah didefinisikan di atas.",
  ),
  "m3.modul3_mqtt_publish.3": exact(
    "1883",
    "1883 adalah port bawaan Eclipse Mosquitto, harus sama dengan nilai listener pada mosquitto.conf.",
  ),
  "m3.modul3_mqtt_publish.4": exact(
    "read_u16",
    "read_u16() membaca ADC Pico W sebagai bilangan 16 bit (0 sampai 65535).",
  ),
  "m3.modul3_mqtt_publish.5": exact(
    "deadband_pct",
    "deadband_pct adalah ambang perubahan yang sudah didefinisikan di atas, dipakai supaya derau ADC tidak memicu publish terus-menerus.",
  ),
  "m3.modul3_mqtt_publish.6": exact(
    "publish",
    "publish() adalah metode MQTTClient untuk mengirim sebuah pesan ke topic tertentu.",
  ),
  "m3.modul3_mqtt_subscribe.1": exact(
    "MQTTClient",
    "MQTTClient adalah kelas client MQTT dari pustaka umqtt.simple yang dipakai di bawah.",
  ),
  "m3.modul3_mqtt_subscribe.2": exact(
    "group_id",
    "Topic Subscriber harus sama persis dengan topic Publisher, keduanya diturunkan dari group_id yang sama.",
  ),
  "m3.modul3_mqtt_subscribe.3": exact(
    "timestamp",
    "timestamp() dari iris_waktu mengembalikan jam dinding dalam format HH:MM:SS:MS yang sudah diselaraskan NTP.",
  ),
  "m3.modul3_mqtt_subscribe.4": exact(
    "mqtt_subscription_callback",
    "mqtt_subscription_callback adalah fungsi di atas yang dijalankan setiap kali pesan baru diterima.",
  ),
  "m3.modul3_mqtt_subscribe.5": exact(
    "subscribe",
    "subscribe() mendaftarkan client untuk menerima setiap pesan yang dipublikasikan ke topic tersebut.",
  ),
  "m3.modul3_mqtt_subscribe.6": exact(
    "check_msg",
    "check_msg() memeriksa pesan baru tanpa memblokir, sehingga loop tetap sempat mengirim ping berkala.",
  ),

  // Module 4 -- LoRa
  "m4.modul4_hunter.1": exact(
    "LoRa.h",
    "LoRa.h adalah header pustaka LoRa peer-to-peer karya Sandeep Mistry yang dipakai kedua papan.",
  ),
  "m4.modul4_hunter.2": exact(
    "WIFI_PASSWORD",
    "WIFI_PASSWORD adalah konstanta kata sandi hotspot Orange Pi yang sudah didefinisikan di atas.",
  ),
  "m4.modul4_hunter.3": exact(
    "LORA_SPREADING_FACTOR",
    "Spreading factor Hunter harus sama persis dengan Beacon, diambil dari konstanta LORA_SPREADING_FACTOR.",
  ),
  "m4.modul4_hunter.4": exact(
    "LORA_SYNC_WORD",
    "Sync word menyaring radio pasangan; LORA_SYNC_WORD harus sama persis dengan Beacon agar paket terbaca.",
  ),
  "m4.modul4_hunter.5": exact(
    "packetRssi",
    "packetRssi() membaca kekuatan sinyal mentah (RSSI) dari paket yang baru saja diterima.",
  ),
  "m4.modul4_hunter.6": exact(
    "sendTXT",
    "sendTXT() mengirim payload JSON hasil pembacaan ke papan skor melalui WebSocket.",
  ),
  "m4.modul4_beacon.1": exact(
    "LoRa.h",
    "LoRa.h adalah header pustaka LoRa peer-to-peer karya Sandeep Mistry yang dipakai kedua papan.",
  ),
  "m4.modul4_beacon.2": exact(
    "NTP_SERVER",
    "NTP_SERVER menunjuk ke Orange Pi yang sama, satu-satunya sumber waktu yang tersedia di hotspot praktikum.",
  ),
  "m4.modul4_beacon.3": exact(
    "LORA_BANDWIDTH",
    "Lebar pita Beacon harus sama persis dengan seluruh Hunter, diambil dari konstanta LORA_BANDWIDTH.",
  ),
  "m4.modul4_beacon.4": exact(
    "BEACON_TX_POWER",
    "BEACON_TX_POWER mengatur daya pancar sesuai ukuran arena, bukan dibesarkan sebisanya.",
  ),
  "m4.modul4_beacon.5": exact(
    "payload",
    "payload adalah string nomor urut dan waktu kirim yang baru saja disusun di atas.",
  ),
  "m4.modul4_beacon.6": exact(
    "endPacket",
    "endPacket() menutup dan benar-benar memancarkan paket yang isinya sudah ditulis dengan print().",
  ),
};

export function checkJawaban(
  soalKode: string,
  jawaban: string,
  ctx: AnswerContext,
): { ditemukan: true; benar: boolean; kenapa?: string } | { ditemukan: false } {
  const entry = ANSWER_KEYS[soalKode];
  if (!entry) return { ditemukan: false };
  const benar = entry.cocok(jawaban, ctx);
  return { ditemukan: true, benar, kenapa: benar ? entry.kenapa : undefined };
}

/** For the gated download: how many blanks a given berkas has, so the
 *  handler can require every one of them correct without trusting a count
 *  the client supplies. */
export function blankCountFor(modul: number, berkasSlug: string): number {
  const prefix = `m${modul}.${berkasSlug}.`;
  return Object.keys(ANSWER_KEYS).filter((k) => k.startsWith(prefix)).length;
}

/** Every blank across both of a module's berkas -- what the assistant
 *  console's per-group progress tile (Stage 10) counts against, since a
 *  tile shows one module-wide fraction rather than one per berkas. */
export function blankCountForModul(modul: number): number {
  const prefix = `m${modul}.`;
  return Object.keys(ANSWER_KEYS).filter((k) => k.startsWith(prefix)).length;
}

/** The as-authored correct text for one blank, used ONLY by the gated
 *  download's file reconstruction -- see AnswerEntry.kanonik's own comment
 *  for why a verified-correct blank still isn't spliced in as the student's
 *  raw isi. Never call this from handleDraft or handleCek. */
export function canonicalAnswer(soalKode: string, ctx: AnswerContext): string | undefined {
  return ANSWER_KEYS[soalKode]?.kanonik(ctx);
}
