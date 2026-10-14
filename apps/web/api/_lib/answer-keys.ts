/**
 * Version 1 of every code blank's answer (ASO code editor, 2026-10-05):
 * what api/_lib/kode-aktif.ts imports as a module's first published version,
 * and serves until one exists in the database. Extracted by hand from
 * Downloads/IRIS ASO/kunci_jawaban/{id,en}. Deliberately lives under
 * api/_lib/ rather than src/lib/: everything under src/ is reachable from an
 * Astro page and therefore from the client bundle, while api/_lib/ is only
 * ever imported by Vercel serverless functions. Nothing but
 * api/_lib/kode-aktif.ts may import this file.
 *
 * id/ and en/ answers are identical (verified against both kunci_jawaban
 * trees and all five Module 4 group folders): a code blank resolves to an
 * identifier, a number, or a short expression, none of which change between
 * the two journal languages. One shared table therefore serves both.
 *
 * kenapa is kunci_jawaban/README.md's "Alasan" column (id) with its English
 * and Mandarin; bantuan is the hint a group gets after two wrong tries. A
 * hint points at where the answer is, never at the answer itself.
 *
 * Two blanks are not a single fixed string:
 *  - m2.modul2_websocket_server.2 (ALLOWED_PATHS) holds the five groups'
 *    paths, as kunci_jawaban's server file does.
 *  - m2.modul2_websocket_esp32.2 (WS_PATH) is per group: group 3's answer is
 *    "/grup3". Resolved from the submitting group's own `nomor`.
 */
import type { TeksKode } from "../../src/lib/kode-jurnal.js";

/** One blank's answer as authored: the canonical text, other spellings
 *  that compile the same, and the per-group form (`{n}` = group number). */
export interface KunciV1 {
  jawaban: string;
  juga?: string[];
  perKelompok?: string;
  kenapa: TeksKode;
  bantuan: TeksKode;
}

const t = (id: string, en: string, zh: string): TeksKode => ({ id, en, zh });

// ---------- Shared lines ----------
// ---------- Shared lines ----------
// ---------- Shared lines ----------

const LORA_H = {
  jawaban: "LoRa.h",
  kenapa: t(
    "Header pustaka LoRa peer-to-peer karya Sandeep Mistry.",
    "The header of Sandeep Mistry's peer-to-peer LoRa library.",
    "Sandeep Mistry 的点对点 LoRa 库的头文件。",
  ),
  bantuan: t(
    "Komentar di atasnya menyebut nama pustakanya. Header-nya bernama sama, diakhiri .h. Huruf besar kecilnya sama dengan objek LoRa di bawah.",
    "The comment above names the library. The header has the same name, ending in .h. Match the capitals of the LoRa object below.",
    "上面的注释写了库名。头文件同名，以 .h 结尾，大小写和下面的 LoRa 对象一致。",
  ),
};

const SEND_TXT_BANTUAN = t(
  "Pustaka WebSockets ini tidak punya send(). Metode kirim teksnya diawali send, lalu singkatan text dalam huruf besar.",
  "This WebSockets library has no send(). Its text sending method is send followed by an upper case short form of text.",
  "这个 WebSockets 库没有 send()。发文本的方法是 send 加上大写的 text 缩写。",
);

// ---------- Shared lines ----------
// ---------- Shared lines ----------
// ---------- Shared lines ----------

export const KUNCI_V1: Record<string, KunciV1> = {
  // ---------- Module 1: BLE ----------
  // ---------- Module 1: BLE ----------
  // ---------- Module 1: BLE ----------
  "m1.modul1_ble_central.1": {
    jawaban: "BLEScan.h",
    kenapa: t(
      "Header yang menyediakan BLEScan, dipakai Central untuk memindai Peripheral.",
      "The header that provides BLEScan, which the Central uses to scan for the Peripheral.",
      "这个头文件提供 BLEScan，Central 用它扫描 Peripheral。",
    ),
    bantuan: t(
      "Lihat dua #include di atasnya: BLE lalu nama kelasnya, diakhiri .h. Kelas yang dicari adalah pemindai (scan).",
      "Look at the two #include lines above: BLE, then the class name, ending in .h. The class you need is the scanner.",
      "看上面两行 #include：BLE 加类名，以 .h 结尾。这里要的是扫描器（scan）的类。",
    ),
  },
  "m1.modul1_ble_central.2": {
    jawaban: "digitalRead",
    kenapa: t(
      "Membaca status pin digital tombol: HIGH (1) berarti ditekan, LOW (0) berarti dilepas. Resistor pull-down eksternal menjaga nilainya pasti saat dilepas.",
      "Reads the button pin's digital state: HIGH (1) means pressed, LOW (0) means released. The external pull-down resistor keeps it defined when released.",
      "读取按钮引脚的数字状态：HIGH (1) 表示按下，LOW (0) 表示松开。外接下拉电阻让松开时的值保持确定。",
    ),
    bantuan: t(
      "Fungsi bawaan Arduino, pasangan digitalWrite() untuk membaca. Namanya diawali digital.",
      "A built in Arduino function, the reading partner of digitalWrite(). Its name starts with digital.",
      "Arduino 自带函数，是 digitalWrite() 的读取版。名字以 digital 开头。",
    ),
  },
  "m1.modul1_ble_central.3": {
    jawaban: "INPUT",
    kenapa: t(
      "Mode pin masukan biasa. Resistor pull-down eksternal sudah ada pada skema, jadi INPUT_PULLUP tidak diperlukan.",
      "Plain input pin mode. The schematic already has an external pull-down resistor, so INPUT_PULLUP isn't needed.",
      "普通输入引脚模式。原理图上已有外接下拉电阻，所以不需要 INPUT_PULLUP。",
    ),
    bantuan: t(
      "Konstanta mode pin Arduino, huruf besar semua. Tombol adalah masukan, dan resistor pull-down sudah ada di rangkaian, jadi tanpa _PULLUP.",
      "An Arduino pin mode constant in capitals. The button is an input, and the circuit already has a pull-down resistor, so no _PULLUP.",
      "Arduino 的引脚模式常量，全部大写。按钮是输入，电路里已有下拉电阻，所以不要 _PULLUP。",
    ),
  },
  // kunci_jawaban passes SERVICE_UUID straight in, which the ESP32 core 3.3
  // compiles; the handbook's BLEUUID(SERVICE_UUID) is the same call spelled
  // out, so both are accepted.
  "m1.modul1_ble_central.4": {
    jawaban: "SERVICE_UUID",
    juga: ["BLEUUID(SERVICE_UUID)"],
    kenapa: t(
      "Service adalah wadah characteristic, jadi harus ditemukan lebih dahulu lewat UUID-nya, yang sama dengan milik Peripheral.",
      "A service holds the characteristic, so it has to be found first, by its UUID, the same one the Peripheral uses.",
      "Service 是 characteristic 的容器，所以要先用它的 UUID 找到它，这个 UUID 和 Peripheral 的一样。",
    ),
    bantuan: t(
      "getService() mencari layanan lewat UUID-nya. Cari konstanta UUID layanan yang disusun dari GROUP_ID di bagian atas berkas.",
      "getService() looks a service up by its UUID. Find the service UUID constant built from GROUP_ID near the top of the file.",
      "getService() 用 UUID 查找服务。在文件上方找由 GROUP_ID 拼出的服务 UUID 常量。",
    ),
  },
  "m1.modul1_ble_central.5": {
    jawaban: "notifyCallback",
    kenapa: t(
      "Nama fungsi didaftarkan tanpa tanda kurung, sama seperti callback pada Modul 3.",
      "The function is registered by name, without brackets, just like the callback in Module 3.",
      "注册时只写函数名，不加括号，和模块 3 的回调一样。",
    ),
    bantuan: t(
      "Cari fungsi di atas yang dipanggil setiap ada notifikasi dari Peripheral. Tulis namanya saja, tanpa tanda kurung.",
      "Find the function above that runs on every notification from the Peripheral. Write just its name, no brackets.",
      "在上面找每次收到 Peripheral 通知时运行的函数。只写函数名，不加括号。",
    ),
  },
  "m1.modul1_ble_central.6": {
    jawaban: "state",
    kenapa: t(
      "Status tombol (0 atau 1) hasil readButtonState() itulah yang dikirim ke Peripheral.",
      "The button state (0 or 1) from readButtonState() is what gets sent to the Peripheral.",
      "发送给 Peripheral 的就是 readButtonState() 得到的按钮状态（0 或 1）。",
    ),
    bantuan: t(
      "Lihat beberapa baris di atasnya: hasil readButtonState() disimpan ke sebuah variabel. Variabel itulah yang dikirim.",
      "Look a few lines up: readButtonState()'s result is stored in a variable. Send that variable.",
      "往上看几行：readButtonState() 的结果存进了一个变量。要发送的就是这个变量。",
    ),
  },
  "m1.modul1_ble_peripheral.1": {
    jawaban: "BLEServer.h",
    kenapa: t(
      "Header yang menyediakan BLEServer dan BLEService untuk sisi Peripheral.",
      "The header that provides BLEServer and BLEService for the Peripheral side.",
      "这个头文件为 Peripheral 端提供 BLEServer 和 BLEService。",
    ),
    bantuan: t(
      "Peripheral berperan sebagai server BLE. Polanya sama dengan #include di atasnya: BLE lalu nama perannya, diakhiri .h.",
      "The Peripheral acts as the BLE server. Same pattern as the #include above: BLE, then the role, ending in .h.",
      "Peripheral 充当 BLE 服务器。写法和上面的 #include 一样：BLE 加角色名，以 .h 结尾。",
    ),
  },
  "m1.modul1_ble_peripheral.2": {
    jawaban: "notify",
    kenapa: t(
      "Memantulkan nilai characteristic ke Central sebagai echo, supaya Central bisa mengukur round trip.",
      "Bounces the characteristic's value back to the Central as an echo, so the Central can measure the round trip.",
      "把 characteristic 的值作为回声发回 Central，让 Central 能测往返时间。",
    ),
    bantuan: t(
      "Metode BLECharacteristic yang mendorong nilai baru ke Central tanpa diminta. Namanya sama dengan yang didaftarkan Central lewat registerForNotify().",
      "The BLECharacteristic method that pushes the new value to the Central without being asked. Its name matches what the Central registers for with registerForNotify().",
      "这是 BLECharacteristic 的方法，不等 Central 请求就把新值推过去。名字和 Central 用 registerForNotify() 注册的一样。",
    ),
  },
  "m1.modul1_ble_peripheral.3": {
    jawaban: "state",
    kenapa: t(
      "Hasil constrain(data.toInt(), 0, 1), dipakai langsung sebagai HIGH/LOW karena Arduino mendefinisikan HIGH = 1 dan LOW = 0.",
      "The result of constrain(data.toInt(), 0, 1), used directly as HIGH/LOW because Arduino defines HIGH as 1 and LOW as 0.",
      "constrain(data.toInt(), 0, 1) 的结果，可直接当 HIGH/LOW 用，因为 Arduino 中 HIGH 是 1，LOW 是 0。",
    ),
    bantuan: t(
      "Beberapa baris di atasnya, data dari Central diubah menjadi 0 atau 1 dan disimpan ke sebuah variabel. Nyalakan LED dengan variabel itu.",
      "A few lines up, the Central's data is turned into 0 or 1 and stored in a variable. Drive the LED with that variable.",
      "往上几行，Central 发来的数据被转成 0 或 1 存进一个变量。用这个变量控制 LED。",
    ),
  },
  "m1.modul1_ble_peripheral.4": {
    jawaban: "PROPERTY_NOTIFY",
    kenapa: t(
      "Tanpa properti ini Peripheral tidak bisa memantulkan data, dan kolom Delay tidak terisi.",
      "Without this property the Peripheral can't echo the data back, and the Delay column stays empty.",
      "没有这个属性，Peripheral 无法回传数据，Delay 一栏就填不了。",
    ),
    bantuan: t(
      "Lihat baris di atasnya: PROPERTY_WRITE. Properti kedua mengizinkan Peripheral mengirim nilai ke Central tanpa diminta, dengan pola PROPERTY_ yang sama.",
      "Look at the line above: PROPERTY_WRITE. The second property lets the Peripheral send a value to the Central unasked, with the same PROPERTY_ pattern.",
      "看上一行的 PROPERTY_WRITE。第二个属性让 Peripheral 主动把值发给 Central，写法同样是 PROPERTY_ 开头。",
    ),
  },
  "m1.modul1_ble_peripheral.5": {
    jawaban: "MyCharacteristicCallbacks",
    kenapa: t(
      "Kelas callback yang meng-override onWrite() di atasnya, dipanggil setiap kali Central menulis data.",
      "The callback class above that overrides onWrite(), called each time the Central writes data.",
      "上面那个重写了 onWrite() 的回调类，每次 Central 写入数据时被调用。",
    ),
    bantuan: t(
      "Cari kata class di bagian atas berkas: kelas yang berisi onWrite(). Tulis nama kelasnya persis; tanda kurungnya sudah ada.",
      "Look for the word class higher up: the class holding onWrite(). Type its exact name; the brackets are already there.",
      "在文件上方找 class 关键字：里面有 onWrite() 的那个类。准确写出类名，括号已经写好了。",
    ),
  },
  "m1.modul1_ble_peripheral.6": {
    jawaban: "LED_PIN",
    kenapa: t(
      "GPIO16, disambungkan ke anoda LED, dengan resistor pembatas arus 220 Ω pada kaki katodanya.",
      "GPIO16, wired to the LED's anode, with a 220 Ω current limiting resistor on its cathode leg.",
      "GPIO16，接到 LED 的阳极，阴极一侧串一个 220 Ω 限流电阻。",
    ),
    bantuan: t(
      "Jangan tulis angkanya langsung. Pakai konstanta pin LED yang dideklarasikan di bagian atas berkas (const int ...).",
      "Don't type the number itself. Use the LED pin constant declared near the top of the file (const int ...).",
      "不要直接写数字。用文件上方声明的 LED 引脚常量（const int ...）。",
    ),
  },

  // ---------- Module 2: WebSocket ----------
  // ---------- Module 2: WebSocket ----------
  // ---------- Module 2: WebSocket ----------
  "m2.modul2_websocket_server.1": {
    jawaban: "8765",
    kenapa: t(
      "Port server. Harus sama dengan WS_PORT pada sketch ESP32.",
      "The server's port. It must match WS_PORT in the ESP32 sketch.",
      "服务器的端口，必须和 ESP32 程序里的 WS_PORT 一样。",
    ),
    bantuan: t(
      "Buka modul2_websocket_esp32.ino dan cari WS_PORT. Server harus mendengarkan di angka yang sama.",
      "Open modul2_websocket_esp32.ino and find WS_PORT. The server must listen on the same number.",
      "打开 modul2_websocket_esp32.ino 找 WS_PORT。服务器要监听同一个数字。",
    ),
  },
  "m2.modul2_websocket_server.2": {
    jawaban: '{"/grup1","/grup2","/grup3","/grup4","/grup5"}',
    kenapa: t(
      "Himpunan path yang diterima, satu per kelompok. Kelima kelompok tersambung ke server yang sama, tiap ESP32 dengan path miliknya sendiri.",
      "The set of accepted paths, one per group. All five groups connect to the same server, each ESP32 on its own path.",
      "允许的路径集合，每组一个。五个组连同一台服务器，每块 ESP32 用自己的路径。",
    ),
    bantuan: t(
      "Tipenya set[str], jadi ditulis dengan kurung kurawal {...} berisi string. Isinya WS_PATH setiap kelompok, lima kelompok per sesi.",
      "The type is set[str], so write curly braces {...} holding strings. It holds every group's WS_PATH, five groups per session.",
      "类型是 set[str]，要用花括号 {...} 包住字符串。内容是每个组的 WS_PATH，每节课五个组。",
    ),
  },
  "m2.modul2_websocket_server.3": {
    jawaban: "json.loads",
    kenapa: t(
      "Pesan datang sebagai teks JSON dan harus diurai menjadi dict dulu.",
      "The message arrives as JSON text and has to be parsed into a dict first.",
      "消息以 JSON 文本到达，要先解析成 dict。",
    ),
    bantuan: t(
      "Modul json sudah diimpor di atas. Pakai fungsinya yang mengurai string (load string) menjadi dict, ditulis modul.fungsi.",
      "The json module is imported above. Use its function that loads a string into a dict, written module.function.",
      "上面已经 import 了 json 模块。用它把字符串（load string）解析成 dict 的函数，写成 模块.函数。",
    ),
  },
  "m2.modul2_websocket_server.4": {
    jawaban: '"hum"',
    kenapa: t(
      "Kunci JSON kelembapan, harus sama persis dengan yang ditulis ESP32. Salah ketik di sini memunculkan KeyError, bukan nilai yang salah.",
      "The humidity JSON key, exactly as the ESP32 writes it. A typo here raises a KeyError rather than giving a wrong value.",
      "湿度的 JSON 键，必须和 ESP32 写的一模一样。这里打错会报 KeyError，而不是得到错误的值。",
    ),
    bantuan: t(
      'Lihat buildReading() di sketch ESP32: kunci suhu adalah "temp", dan kunci kelembapan ada di sebelahnya. Tulis lengkap dengan tanda kutipnya.',
      'Look at buildReading() in the ESP32 sketch: the temperature key is "temp", and the humidity key sits next to it. Include the quotes.',
      '看 ESP32 程序里的 buildReading()：温度的键是 "temp"，湿度的键就在旁边。要连引号一起写。',
    ),
  },
  "m2.modul2_websocket_server.5": {
    jawaban: "send",
    kenapa: t(
      "Mengirim balasan tanda terima (nomor urut dan waktu terima) kembali ke client.",
      "Sends the acknowledgement (sequence number and receive time) back to the client.",
      "把确认回复（序号和接收时间）发回客户端。",
    ),
    bantuan: t(
      "Metode objek websocket untuk mengirim pesan ke client yang sama, lawan dari recv. Satu kata pendek bahasa Inggris.",
      "The websocket object's method for sending a message to the same client, the opposite of recv. One short English word.",
      "websocket 对象向同一客户端发消息的方法，和 recv 相对，是一个简短的英文单词。",
    ),
  },
  "m2.modul2_websocket_server.6": {
    jawaban: "serve",
    kenapa: t(
      "Fungsi penjalan server WebSocket, yang memanggil handle_client untuk tiap koneksi.",
      "The function that runs the WebSocket server, calling handle_client for each connection.",
      "运行 WebSocket 服务器的函数，每个连接都会调用 handle_client。",
    ),
    bantuan: t(
      "Lihat bagian import di atas: satu fungsi diimpor dari websockets.asyncio.server. Tulis namanya saja, tanpa tanda kurung.",
      "Check the imports at the top: one function comes from websockets.asyncio.server. Write just its name, no brackets.",
      "看文件顶部的 import：有一个函数来自 websockets.asyncio.server。只写函数名，不加括号。",
    ),
  },
  "m2.modul2_websocket_esp32.1": {
    jawaban: "WebSocketsClient.h",
    kenapa: t(
      "Header pustaka arduinoWebSockets karya Markus Sattler, sisi client.",
      "The header of Markus Sattler's arduinoWebSockets library, client side.",
      "Markus Sattler 的 arduinoWebSockets 库的客户端头文件。",
    ),
    bantuan: t(
      "Lihat tipe objek webSocket di bawah: header-nya bernama sama dengan kelas itu, diakhiri .h.",
      "Look at the type of the webSocket object below: the header has the same name as that class, ending in .h.",
      "看下面 webSocket 对象的类型：头文件名和这个类名相同，以 .h 结尾。",
    ),
  },
  "m2.modul2_websocket_esp32.2": {
    jawaban: "/grup1",
    perKelompok: "/grup{n}",
    kenapa: t(
      "Path milik kelompokmu sendiri, dan harus termasuk salah satu ALLOWED_PATHS pada server Python.",
      "Your own group's path, and it must be one of ALLOWED_PATHS on the Python server.",
      "你们组自己的路径，并且必须在 Python 服务器的 ALLOWED_PATHS 里。",
    ),
    bantuan: t(
      "Komentar di atasnya memberi polanya: garis miring, grup, lalu nomor kelompokmu. Tanda kutipnya sudah ada.",
      "The comment above shows the pattern: a slash, grup, then your group number. The quotes are already there.",
      "上面的注释给了格式：斜杠、grup，再加你们的组号。引号已经写好了。",
    ),
  },
  "m2.modul2_websocket_esp32.3": {
    jawaban: "readTemperature",
    kenapa: t(
      "Pasangan readHumidity() yang sudah terisi tepat di atasnya. Keduanya mengembalikan NAN bila sensor gagal dibaca.",
      "The partner of readHumidity(), filled in right above it. Both return NAN when the sensor can't be read.",
      "和上一行已写好的 readHumidity() 是一对。读不到传感器时两者都返回 NAN。",
    ),
    bantuan: t(
      "Baris di atasnya memakai dht.readHumidity(). Ganti Humidity dengan kata bahasa Inggris untuk suhu.",
      "The line above uses dht.readHumidity(). Swap Humidity for the English word for temperature.",
      "上一行用的是 dht.readHumidity()。把 Humidity 换成英文的温度一词。",
    ),
  },
  "m2.modul2_websocket_esp32.4": {
    jawaban: "webSocketEvent",
    kenapa: t(
      "Nama fungsi callback yang didaftarkan ke onEvent(), tanpa tanda kurung.",
      "The callback's name, registered with onEvent() without brackets.",
      "注册给 onEvent() 的回调函数名，不加括号。",
    ),
    bantuan: t(
      "Cari fungsi di atas yang menerima WStype_t type: itulah penangan event. Tulis namanya saja.",
      "Find the function above that takes WStype_t type: that's the event handler. Write just its name.",
      "在上面找参数里有 WStype_t type 的函数，它就是事件处理函数。只写名字。",
    ),
  },
  "m2.modul2_websocket_esp32.5": {
    jawaban: "loop",
    kenapa: t(
      "webSocket.loop() wajib dipanggil berkala agar event diproses.",
      "webSocket.loop() must be called regularly so events get processed.",
      "必须定期调用 webSocket.loop()，事件才会被处理。",
    ),
    bantuan: t(
      "Metode ini dipanggil di setiap putaran fungsi tempat baris ini berada, dan namanya sama dengan fungsi itu.",
      "This method runs on every pass of the function this line sits in, and has the same name as that function.",
      "这个方法在所在函数的每一轮里调用，名字和这个函数一样。",
    ),
  },
  "m2.modul2_websocket_esp32.6": {
    jawaban: "sendTXT",
    kenapa: t(
      "Mengirim bingkai teks. send() bukan nama metode pada pustaka ini.",
      "Sends a text frame. send() isn't a method in this library.",
      "发送文本帧。这个库里没有 send() 这个方法。",
    ),
    bantuan: SEND_TXT_BANTUAN,
  },

  // ---------- Module 3: MQTT ----------
  // ---------- Module 3: MQTT ----------
  // ---------- Module 3: MQTT ----------
  "m3.modul3_mqtt_publish.1": {
    jawaban: "STA_IF",
    kenapa: t(
      "Pico W berperan sebagai station yang bergabung ke Access Point.",
      "The Pico W acts as a station that joins an access point.",
      "Pico W 作为 station 加入接入点。",
    ),
    bantuan: t(
      "network punya dua mode: station (bergabung ke Wi-Fi) dan access point (membuat Wi-Fi). Konstantanya singkatan mode itu ditambah _IF.",
      "network has two modes: station (joins Wi-Fi) and access point (makes one). The constant is the mode's short form plus _IF.",
      "network 有两种模式：station（加入 Wi-Fi）和 access point（建立 Wi-Fi）。常量是模式缩写加 _IF。",
    ),
  },
  "m3.modul3_mqtt_publish.2": {
    jawaban: "wifi_password",
    kenapa: t(
      "Argumen kedua wlan.connect(), variabel kata sandi yang didefinisikan di atas.",
      "The second argument of wlan.connect(), the password variable defined above.",
      "wlan.connect() 的第二个参数，就是上面定义的密码变量。",
    ),
    bantuan: t(
      "Argumen pertama adalah wifi_ssid. Pakai variabel di sebelahnya di bagian atas berkas, bukan teks di dalamnya.",
      "The first argument is wifi_ssid. Use the variable defined next to it near the top, not the text inside it.",
      "第一个参数是 wifi_ssid。用文件上方紧挨着它定义的变量，而不是里面的文字。",
    ),
  },
  "m3.modul3_mqtt_publish.3": {
    jawaban: "1883",
    kenapa: t(
      "Nilai listener pada mosquitto.conf, port bawaan MQTT.",
      "The listener value in mosquitto.conf, MQTT's default port.",
      "mosquitto.conf 里的 listener 值，也是 MQTT 的默认端口。",
    ),
    bantuan: t(
      "Baca komentar tepat di atas MQTTClient(: angkanya ada di sana. Tulis sebagai angka, tanpa tanda kutip.",
      "Read the comment right above MQTTClient(: the number is there. Write it as a number, no quotes.",
      "看 MQTTClient( 正上方的注释，数字就在那里。写成数字，不加引号。",
    ),
  },
  "m3.modul3_mqtt_publish.4": {
    jawaban: "read_u16",
    kenapa: t(
      "Metode ADC yang mengembalikan 0 sampai 65535, bukan read() yang 0 sampai 4095 pada ESP32.",
      "The ADC method that returns 0 to 65535, not read(), which gives 0 to 4095 on the ESP32.",
      "返回 0 到 65535 的 ADC 方法，不是 ESP32 上返回 0 到 4095 的 read()。",
    ),
    bantuan: t(
      "Baris berikutnya membagi dengan 65535, jadi bacaannya 16 bit tanpa tanda (unsigned). Namanya read_ lalu singkatan unsigned 16.",
      "The next line divides by 65535, so the reading is unsigned 16 bit. The name is read_ plus a short form of unsigned 16.",
      "下一行除以 65535，所以读数是 16 位无符号。方法名是 read_ 加 unsigned 16 的缩写。",
    ),
  },
  "m3.modul3_mqtt_publish.5": {
    jawaban: "deadband_pct",
    kenapa: t(
      "Ambang perubahan. Tanpa ini, derau ADC beberapa satuan sudah memicu publish terus-menerus dan Shell banjir.",
      "The change threshold. Without it, a few units of ADC noise trigger publish after publish and flood the Shell.",
      "变化阈值。没有它，ADC 几个单位的噪声就会不停触发 publish，Shell 被刷屏。",
    ),
    bantuan: t(
      "Jangan tulis angkanya. Pakai variabel ambang di atas yang dijelaskan komentar tentang derau ADC.",
      "Don't type the number. Use the threshold variable above, the one the ADC noise comment explains.",
      "不要直接写数字。用上面那条讲 ADC 噪声的注释所说明的阈值变量。",
    ),
  },
  "m3.modul3_mqtt_publish.6": {
    jawaban: "publish",
    kenapa: t(
      'Mengirim pesan "<no. sampel> <posisi>" ke topik tujuan.',
      'Sends the "<sample no.> <position>" message to the topic.',
      '把 "<样本号> <位置>" 消息发到目标主题。',
    ),
    bantuan: t(
      "Di MQTT, pengirim disebut publisher. Nama metodenya adalah kata kerja dari peran itu.",
      "In MQTT the sender is called the publisher. The method is the verb of that role.",
      "在 MQTT 里发送方叫 publisher。方法名就是这个角色对应的动词。",
    ),
  },
  "m3.modul3_mqtt_subscribe.1": {
    jawaban: "MQTTClient",
    kenapa: t(
      "Kelas client yang diimpor dari umqtt.simple, dipakai di bawah untuk membuat koneksi.",
      "The client class imported from umqtt.simple, used below to make the connection.",
      "从 umqtt.simple 导入的客户端类，下面用它建立连接。",
    ),
    bantuan: t(
      "Cari baris di bawah yang membuat mqtt_client = ...(. Nama kelas sebelum tanda kurung itulah yang diimpor.",
      "Find the line below that creates mqtt_client = ...(. The class name before the bracket is what gets imported.",
      "在下面找创建 mqtt_client = ...( 的那一行，括号前的类名就是要导入的。",
    ),
  },
  "m3.modul3_mqtt_subscribe.2": {
    jawaban: "group_id",
    kenapa: t(
      "Topik Subscriber diturunkan dari nomor kelompok yang sama dengan Publisher. Angka berbeda berarti tidak ada pesan yang pernah masuk.",
      "The Subscriber's topic is built from the same group number as the Publisher's. A different number means no message ever arrives.",
      "Subscriber 的主题用和 Publisher 相同的组号拼成。号码不同就永远收不到消息。",
    ),
    bantuan: t(
      "Tepat di atasnya ada variabel nomor kelompok. Tulis nama variabelnya, bukan angkanya.",
      "Right above it is the group number variable. Write the variable's name, not the number.",
      "正上方就是组号变量。写变量名，不要写数字。",
    ),
  },
  "m3.modul3_mqtt_subscribe.3": {
    jawaban: "timestamp",
    kenapa: t(
      "Waktu terima dicatat sebagai baris pertama callback, sebelum message.decode(), supaya penguraian payload tidak ikut terhitung sebagai delay.",
      "The receive time is taken on the callback's first line, before message.decode(), so parsing the payload isn't counted as delay.",
      "接收时间在回调第一行记录，早于 message.decode()，这样解析负载的时间不会算进延迟。",
    ),
    bantuan: t(
      "Cari def di bagian atas berkas yang mengembalikan jam dinding HH:MM:SS:MS. Tulis namanya saja; tanda kurungnya sudah ada.",
      "Find the def near the top that returns the HH:MM:SS:MS wall clock. Write just its name; the brackets are already there.",
      "在文件上方找返回 HH:MM:SS:MS 时间的 def。只写函数名，括号已经有了。",
    ),
  },
  "m3.modul3_mqtt_subscribe.4": {
    jawaban: "mqtt_subscription_callback",
    kenapa: t(
      "Fungsi callback didaftarkan tanpa tanda kurung, supaya pustakanya yang memanggil fungsi itu saat pesan masuk.",
      "The callback is registered without brackets, so the library is the one that calls it when a message comes in.",
      "回调函数注册时不加括号，这样由库在消息到达时去调用它。",
    ),
    bantuan: t(
      "Fungsi yang dijalankan setiap pesan masuk didefinisikan di atas (def ...). Tulis namanya, tanpa tanda kurung.",
      "The function that runs on each message is defined above (def ...). Write its name, no brackets.",
      "每次收到消息时运行的函数定义在上面（def ...）。写它的名字，不加括号。",
    ),
  },
  "m3.modul3_mqtt_subscribe.5": {
    jawaban: "subscribe",
    kenapa: t(
      "Berlangganan topik setelah koneksi terbentuk.",
      "Subscribes to the topic once the connection is up.",
      "连接建立后订阅主题。",
    ),
    bantuan: t(
      "Publisher memakai publish(). Peran berkas ini Subscriber, dan metodenya kata kerja dari peran itu.",
      "The Publisher uses publish(). This file's role is Subscriber, and the method is that role's verb.",
      "Publisher 用的是 publish()。这个文件的角色是 Subscriber，方法名就是这个角色的动词。",
    ),
  },
  "m3.modul3_mqtt_subscribe.6": {
    jawaban: "check_msg",
    kenapa: t(
      "Non-blocking, jadi loop tetap sempat mengirim ping berkala. wait_msg() blocking selamanya.",
      "Non-blocking, so the loop still gets to send its periodic ping. wait_msg() blocks forever.",
      "非阻塞，循环还能定期发送 ping。wait_msg() 会一直阻塞。",
    ),
    bantuan: t(
      "Komentar di atasnya menyebut dua metode: yang blocking dan yang tidak. Pakai yang tidak blocking.",
      "The comment above names two methods: one blocks, one doesn't. Use the one that doesn't.",
      "上面的注释提到两个方法：一个阻塞，一个不阻塞。用不阻塞的那个。",
    ),
  },

  // ---------- Module 4: LoRa ----------
  // ---------- Module 4: LoRa ----------
  // ---------- Module 4: LoRa ----------
  "m4.modul4_hunter.1": LORA_H,
  "m4.modul4_hunter.2": {
    jawaban: "WIFI_PASSWORD",
    kenapa: t(
      "Argumen kedua WiFi.begin(). Ini kata sandi hotspot PC Server, bukan Wi-Fi kampus.",
      "The second argument of WiFi.begin(). It's the PC Server hotspot's password, not the campus Wi-Fi.",
      "WiFi.begin() 的第二个参数，是 PC 服务器热点的密码，不是校园 Wi-Fi。",
    ),
    bantuan: t(
      "Argumen pertama WIFI_SSID. Pakai konstanta pasangannya yang didefinisikan di bagian atas berkas, huruf besar semua.",
      "The first argument is WIFI_SSID. Use its partner constant defined near the top, all in capitals.",
      "第一个参数是 WIFI_SSID。用文件上方和它配对的常量，全部大写。",
    ),
  },
  "m4.modul4_hunter.3": {
    jawaban: "LORA_SPREADING_FACTOR",
    kenapa: t(
      "SF7. Harus sama dengan beacon; berbeda satu tingkat saja membuat paketnya tidak terdengar.",
      "SF7. It must match the beacon; one step off and the packets can't be heard.",
      "SF7。必须和 beacon 一样，差一级就收不到数据包。",
    ),
    bantuan: t(
      "Baris berikutnya memakai LORA_BANDWIDTH. Konstanta spreading factor didefinisikan di dekatnya dengan pola LORA_ yang sama.",
      "The next line uses LORA_BANDWIDTH. The spreading factor constant is defined next to it with the same LORA_ pattern.",
      "下一行用了 LORA_BANDWIDTH。扩频因子的常量就定义在旁边，同样以 LORA_ 开头。",
    ),
  },
  "m4.modul4_hunter.4": {
    jawaban: "LORA_SYNC_WORD",
    kenapa: t(
      "Penanda pasangan, bukan alamat dan bukan pengamanan. Harus sama dengan beacon.",
      "The pair's marker, not an address and not security. It must match the beacon.",
      "这是配对标记，不是地址，也不是加密。必须和 beacon 一样。",
    ),
    bantuan: t(
      "Cari #define LORA_ di bagian atas yang nilainya 0xF lalu nomor kelompokmu. Tulis nama konstantanya.",
      "Find the #define LORA_ near the top whose value is 0xF plus your group number. Write the constant's name.",
      "在文件上方找值为 0xF 加组号的 #define LORA_ 常量，写它的名字。",
    ),
  },
  "m4.modul4_hunter.5": {
    jawaban: "packetRssi",
    kenapa: t(
      "Kekuatan sinyal paket yang baru diterima, dalam dBm. Hanya bisa diukur di sisi penerima.",
      "The signal strength of the packet just received, in dBm. Only the receiving side can measure it.",
      "刚收到的数据包的信号强度，单位 dBm，只有接收端能测。",
    ),
    bantuan: t(
      "RSSI adalah kekuatan sinyal. Metode LoRa-nya diawali packet lalu singkatan itu, dengan huruf pertama besar saja.",
      "RSSI is the signal strength. The LoRa method starts with packet followed by that short form, only its first letter in capitals.",
      "RSSI 就是信号强度。LoRa 的方法名是 packet 加这个缩写，只有首字母大写。",
    ),
  },
  "m4.modul4_hunter.6": {
    jawaban: "sendTXT",
    kenapa: t(
      "Mengirim laporan JSON ke papan skor. send() bukan nama metode pada pustaka ini.",
      "Sends the JSON report to the scoreboard. send() isn't a method in this library.",
      "把 JSON 报告发到计分板。这个库里没有 send()。",
    ),
    bantuan: SEND_TXT_BANTUAN,
  },
  "m4.modul4_beacon.1": LORA_H,
  "m4.modul4_beacon.2": {
    jawaban: "NTP_SERVER",
    kenapa: t(
      "Alamat PC Server itu sendiri (192.168.4.1). Hotspot tidak punya jalur ke Internet, jadi pool.ntp.org tidak akan pernah menjawab.",
      "The PC Server's own address (192.168.4.1). The hotspot has no route to the Internet, so pool.ntp.org would never answer.",
      "就是 PC 服务器自己的地址（192.168.4.1）。热点不通互联网，所以 pool.ntp.org 永远不会回应。",
    ),
    bantuan: t(
      "Jangan tulis alamatnya langsung. Pakai konstanta alamat server waktu yang didefinisikan di bagian atas berkas.",
      "Don't type the address itself. Use the time server address constant defined near the top.",
      "不要直接写地址。用文件上方定义的时间服务器地址常量。",
    ),
  },
  "m4.modul4_beacon.3": {
    jawaban: "LORA_BANDWIDTH",
    kenapa: t(
      "250 kHz. Bersama SF7, inilah yang menekan waktu udara satu paket ke sekitar 20 ms.",
      "250 kHz. Together with SF7 it keeps one packet's airtime to about 20 ms.",
      "250 kHz。和 SF7 一起，把一个包的空中时间压到约 20 ms。",
    ),
    bantuan: t(
      "Baris di atasnya memakai LORA_SPREADING_FACTOR. Konstanta lebar pita (bandwidth) memakai pola LORA_ yang sama.",
      "The line above uses LORA_SPREADING_FACTOR. The bandwidth constant uses the same LORA_ pattern.",
      "上一行用了 LORA_SPREADING_FACTOR。带宽常量同样以 LORA_ 开头。",
    ),
  },
  "m4.modul4_beacon.4": {
    jawaban: "BEACON_TX_POWER",
    kenapa: t(
      "Bawaannya 10 dBm, bukan 20. Dayanya disetel menurut ukuran arena: 2 untuk satu ruangan, 10 untuk satu lantai, 14 untuk gedung besar.",
      "10 dBm by default, not 20. It's set by the arena's size: 2 for one room, 10 for a floor, 14 for a large building.",
      "默认 10 dBm，不是 20。按场地大小设置：一个房间 2，一层楼 10，大楼 14。",
    ),
    bantuan: t(
      "Jangan tulis angka. Pakai konstanta daya pancar (TX power) beacon di bagian atas berkas; namanya diawali BEACON_.",
      "Don't type a number. Use the beacon's transmit (TX) power constant near the top; its name starts with BEACON_.",
      "不要写数字。用文件上方 beacon 的发射功率（TX power）常量，名字以 BEACON_ 开头。",
    ),
  },
  "m4.modul4_beacon.5": {
    jawaban: "payload",
    kenapa: t(
      "String berisi nomor kelompok, nomor paket dan waktu kirim yang disusun tepat di atasnya.",
      "The string of group number, packet number and send time built just above.",
      "就是上面刚拼好的字符串：组号、包序号和发送时间。",
    ),
    bantuan: t(
      "Beberapa baris di atasnya ada String ... = .... Tulis nama variabel itu.",
      "A few lines up there's a String ... = .... Write that variable's name.",
      "往上几行有一个 String ... = ...，写这个变量的名字。",
    ),
  },
  "m4.modul4_beacon.6": {
    jawaban: "endPacket",
    kenapa: t(
      "beginPacket() menyiapkan buffer, endPacket() yang benar-benar memancarkannya.",
      "beginPacket() prepares the buffer; endPacket() is what actually transmits it.",
      "beginPacket() 准备缓冲区，endPacket() 才真正把它发射出去。",
    ),
    bantuan: t(
      "Paket dibuka dengan LoRa.beginPacket() dua baris di atasnya. Metode ini menutup dan memancarkannya: lawan kata begin.",
      "The packet was opened with LoRa.beginPacket() two lines up. This method closes and sends it: the opposite of begin.",
      "往上两行用 LoRa.beginPacket() 开始了数据包。这个方法结束并发送它，是 begin 的反义词。",
    ),
  },
};
