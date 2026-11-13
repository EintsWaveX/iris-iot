/**
 * The Module 4 Tes Awal as a quiz: 25 questions, Tipe A to E with 5 each.
 * `id` is TA IOT REG (Indonesian) and `en` is TA IOT INT (English). Each
 * open question became a multiple-choice one, with the right answer taken
 * from the answer key (KJ TA IOT) and the other options written to be
 * believable. Five questions per type set are Benar/Salah instead.
 * `penjelasan` is the answer key's own wording.
 */
import type { SoalKuis } from "../../lib/kuis/types.js";

export const SOAL_MODUL4: readonly SoalKuis[] = [
  // ---------- Tipe A ----------
  {
    id: "m4-a1",
    tipe: "A",
    nomor: 1,
    benar: 1,
    teks: {
      id: "Di bagian mana pada arsitektur LoRaWAN autentikasi, pemeriksaan keamanan, penghapusan data duplikat, dan penentuan jalur data dilakukan?",
      en: "In the LoRaWAN architecture, where do authentication, security checks, duplicate data removal, and data routing take place?",
    },
    pilihan: {
      id: ["Gateway", "Network server", "Application server", "End-device"],
      en: ["Gateway", "Network Server", "Application Server", "End-device"],
    },
    penjelasan: {
      id: "Di Network server.",
      en: "In the Network Server.",
    },
  },
  {
    id: "m4-a2",
    tipe: "A",
    nomor: 2,
    benar: 2,
    teks: {
      id: "Dev board Cosmic LoRa Aurora V2 punya smart power switching. Tiga sumber tenaga apa yang didukungnya?",
      en: "The Cosmic LoRa Aurora V2 dev board has smart power switching. Which 3 power sources does it support?",
    },
    pilihan: {
      id: [
        "USB, Solar Panel, dan DC Jack",
        "LiPo Battery, Solar Panel, dan Coin Cell",
        "USB, LiPo Battery, dan DC Jack",
        "USB, Baterai AA, dan Solar Panel",
      ],
      en: [
        "USB, Solar Panel, and DC Jack",
        "LiPo Battery, Solar Panel, and Coin Cell",
        "USB, LiPo Battery, and DC Jack",
        "USB, AA Battery, and Solar Panel",
      ],
    },
    penjelasan: {
      id: "USB, LiPo Battery, dan DC Jack.",
      en: "USB, LiPo Battery, and DC Jack.",
    },
  },
  {
    id: "m4-a3",
    tipe: "A",
    nomor: 3,
    benar: 3,
    teks: {
      id: "Kenapa topologi star-of-stars di LoRaWAN lebih menguntungkan daripada topologi mesh?",
      en: "Why is the star-of-stars topology in LoRaWAN better than a mesh topology?",
    },
    pilihan: {
      id: [
        "Setiap end-device harus routing sendiri supaya paketnya sampai",
        "End-device cuma boleh terhubung ke satu gateway tertentu",
        "Semua paket langsung dikirim ke Application server tanpa gateway",
        "Satu paket bisa diterima beberapa gateway sekaligus, jadi end-device tidak perlu routing sendiri",
      ],
      en: [
        "Every end-device must do its own routing so packets arrive",
        "An end-device may only connect to one specific gateway",
        "Every packet goes straight to the Application Server with no gateway",
        "One packet can be received by several gateways at once, so the end-device needs no routing of its own",
      ],
    },
    penjelasan: {
      id: "Karena end-device tidak harus terhubung eksklusif ke satu gateway tertentu. Paket data bisa diterima beberapa gateway sekaligus dan diteruskan ke network server, jadi end-device tidak perlu repot routing sendiri.",
      en: "Because the end-device does not have to connect exclusively to one specific gateway. A data packet can be received by multiple gateways simultaneously and forwarded to the network server, so the end-device does not have to deal with independent routing.",
    },
  },
  {
    id: "m4-a4",
    tipe: "A",
    nomor: 4,
    benar: 0,
    teks: {
      id: "Benar atau Salah? Di Indonesia, LoRa memakai pita radio 920-923 MHz (AS923-2).",
      en: "True or False? In Indonesia, LoRa uses the 920-923 MHz radio band (AS923-2).",
    },
    pilihan: {
      id: ["Benar", "Salah"],
      en: ["True", "False"],
    },
    penjelasan: {
      id: "Benar: 920-923 MHz (parameter regional AS923-2).",
      en: "True: 920-923 MHz (using the AS923-2 regional parameters).",
    },
  },
  {
    id: "m4-a5",
    tipe: "A",
    nomor: 5,
    benar: 1,
    teks: {
      id: "Apa fungsi lora.sendUplink(message, strlen(message), 0, 5) di kode LoRaWAN ANTARES?",
      en: "In the ANTARES LoRaWAN code, what does lora.sendUplink(message, strlen(message), 0, 5) do?",
    },
    pilihan: {
      id: [
        "Membaca 5 byte downlink dari server",
        "Mengirim uplink ke server: unconfirmed (0) lewat application port 5",
        "Mengirim uplink confirmed ke port 0 sebanyak 5 kali",
        "Mengatur Data Rate 5 dan Class 0",
      ],
      en: [
        "Reads 5 bytes of downlink from the server",
        "Sends an uplink to the server: unconfirmed (0) on application port 5",
        "Sends a confirmed uplink to port 0, 5 times",
        "Sets Data Rate 5 and Class 0",
      ],
    },
    penjelasan: {
      id: "Mengirim pesan/data (uplink) ke server. Parameternya: buffer pesan, panjang byte, status unconfirmed uplink (angka 0), dan application port 5.",
      en: "It sends a message/data (uplink) to the server. The parameters are the message buffer, its byte length, unconfirmed uplink (the number 0), and application port 5.",
    },
  },

  // ---------- Tipe B ----------
  {
    id: "m4-b1",
    tipe: "B",
    nomor: 1,
    benar: 2,
    teks: {
      id: "Apa bedanya LoRa dan LoRaWAN?",
      en: "What is the difference between LoRa and LoRaWAN?",
    },
    pilihan: {
      id: [
        "LoRa itu protokol jaringan, LoRaWAN itu modul radionya",
        "LoRa untuk jarak dekat, LoRaWAN untuk jarak jauh dengan radio yang sama",
        "LoRa itu modulasi radio di lapisan fisik, LoRaWAN itu protokol jaringan di atas LoRa",
        "LoRa dipakai di Indonesia, LoRaWAN dipakai di luar negeri",
      ],
      en: [
        "LoRa is a network protocol, LoRaWAN is the radio module",
        "LoRa is for short range, LoRaWAN is for long range with the same radio",
        "LoRa is a physical-layer radio modulation, LoRaWAN is a network protocol on top of LoRa",
        "LoRa is used in Indonesia, LoRaWAN is used abroad",
      ],
    },
    penjelasan: {
      id: "LoRa adalah teknik modulasi radio fisik yang mengatur transmisi sinyal di udara. LoRaWAN adalah protokol jaringan area luas di atas LoRa yang mengatur transmisi data, routing, autentikasi, sampai keamanan perangkat.",
      en: "LoRa is the physical radio modulation technique that governs wireless signal transmission over the air, while LoRaWAN is a wide-area network protocol built on top of LoRa to manage data transmission, routing, authentication, and device security.",
    },
  },
  {
    id: "m4-b2",
    tipe: "B",
    nomor: 2,
    benar: 1,
    teks: {
      id: "Benar atau Salah? LoRaWAN punya tiga class perangkat: Class A, Class B, dan Class D.",
      en: "True or False? LoRaWAN has three device classes: Class A, Class B, and Class D.",
    },
    pilihan: {
      id: ["Benar", "Salah"],
      en: ["True", "False"],
    },
    penjelasan: {
      id: "Salah. Tiga class-nya Class A, Class B, dan Class C.",
      en: "False. The three classes are Class A, Class B, and Class C.",
    },
  },
  {
    id: "m4-b3",
    tipe: "B",
    nomor: 3,
    benar: 0,
    teks: {
      id: "Bagaimana cara kerja komunikasi LoRaWAN Class A?",
      en: "How does LoRaWAN Class A communication work?",
    },
    pilihan: {
      id: [
        "Uplink dimulai end-device, lalu dibuka dua jendela downlink. Hemat daya karena lebih sering tidur",
        "Receiver selalu terbuka, jadi downlink bisa datang kapan saja",
        "Downlink datang di jadwal beacon dan ping slot dari network",
        "Server yang selalu memulai komunikasi, end-device cuma menjawab",
      ],
      en: [
        "The end-device starts the uplink, then two downlink windows open. Low power because it mostly sleeps",
        "The receiver is always open, so downlink can arrive any time",
        "Downlink arrives on the network's beacon and ping slot schedule",
        "The server always starts communication, the end-device only replies",
      ],
    },
    penjelasan: {
      id: "Di Class A, uplink selalu dimulai end-device. Setelah kirim, perangkat membuka dua jendela downlink. Konsumsi dayanya paling rendah karena perangkat tidur hampir sepanjang waktu.",
      en: "In Class A, uplink is always started by the end-device. After transmitting, it opens two downlink reception windows. This gives the lowest power use because the device sleeps most of the time.",
    },
  },
  {
    id: "m4-b4",
    tipe: "B",
    nomor: 4,
    benar: 3,
    teks: {
      id: "Apa itu Chirp Spread Spectrum (CSS)?",
      en: "What is Chirp Spread Spectrum (CSS)?",
    },
    pilihan: {
      id: [
        "Teknik enkripsi untuk mengamankan data LoRaWAN",
        "Cara membagi bandwidth menjadi banyak channel tetap",
        "Metode mengirim data lewat kabel dengan sinyal berfrekuensi tetap",
        "Modulasi radio yang mengubah data jadi sinyal chirp (frekuensi berubah terhadap waktu) supaya tahan jarak jauh",
      ],
      en: [
        "An encryption technique to secure LoRaWAN data",
        "A way of splitting bandwidth into many fixed channels",
        "A method of sending data over a cable with a fixed-frequency signal",
        "A radio modulation that encodes data as a chirp signal (frequency changing over time) to survive long distances",
      ],
    },
    penjelasan: {
      id: "Teknik modulasi radio di mana data dikodekan menjadi sinyal chirp (frekuensinya berubah terhadap waktu) supaya penerimaan sinyal jarak jauh lebih tahan.",
      en: "A radio modulation technique where the data is encoded into a chirp signal (a signal whose frequency changes over time) to make long-distance reception more resilient.",
    },
  },
  {
    id: "m4-b5",
    tipe: "B",
    nomor: 5,
    benar: 2,
    teks: {
      id: "Di kode LoRaWAN ANTARES, kenapa setup() memanggil lora.setDeviceClass(CLASS_A);?",
      en: "In the ANTARES LoRaWAN code, why does setup() call lora.setDeviceClass(CLASS_A);?",
    },
    pilihan: {
      id: [
        "Supaya perangkat bisa langsung terhubung ke Wi-Fi",
        "Supaya receiver terbuka terus seperti Class C",
        "Supaya ESP32 jadi end-device Class A dan jadwal jendela downlink-nya ikut standar Class A",
        "Supaya data dikirim dengan Spreading Factor paling tinggi",
      ],
      en: [
        "So the device connects to Wi-Fi right away",
        "So the receiver stays open all the time like Class C",
        "So the ESP32 acts as a Class A end-device and its downlink window schedule follows the Class A standard",
        "So data is sent with the highest Spreading Factor",
      ],
    },
    penjelasan: {
      id: "Untuk mengatur ESP32 supaya beroperasi sebagai end-device Class A, sehingga jadwal pembukaan jendela downlink dari server ikut standar Class A.",
      en: "It configures the ESP32 to operate as a Class A end-device, so the schedule of downlink reception windows from the server follows the Class A standard.",
    },
  },

  // ---------- Tipe C ----------
  {
    id: "m4-c1",
    tipe: "C",
    nomor: 1,
    benar: 3,
    teks: {
      id: "Empat komponen utama arsitektur jaringan LoRaWAN itu apa saja?",
      en: "What are the 4 main components of the LoRaWAN network architecture?",
    },
    pilihan: {
      id: [
        "Sensor, Gateway, MQTT broker, Dashboard",
        "End-device, Router, Broker, Application server",
        "End-device, Gateway, Switch, Database",
        "End-device, Gateway, Network server, Application server",
      ],
      en: [
        "Sensor, Gateway, MQTT Broker, Dashboard",
        "End-device, Router, Broker, Application Server",
        "End-device, Gateway, Switch, Database",
        "End-device, Gateway, Network Server, Application Server",
      ],
    },
    penjelasan: {
      id: "End-device (sensor/aktuator), Gateway, Network server, dan Application server.",
      en: "End-device (sensor/actuator), Gateway, Network Server, and Application Server.",
    },
  },
  {
    id: "m4-c2",
    tipe: "C",
    nomor: 2,
    benar: 1,
    teks: {
      id: "Apa fungsi Application server di arsitektur LoRaWAN?",
      en: "What does the Application Server do in the LoRaWAN architecture?",
    },
    pilihan: {
      id: [
        "Menerima sinyal radio dari end-device",
        "Mengolah, menyimpan, dan menampilkan data (misalnya di dashboard) supaya bisa dipakai user",
        "Menghapus paket duplikat dan memilih jalur kirim",
        "Mengatur Spreading Factor tiap end-device",
      ],
      en: [
        "Receives radio signals from end-devices",
        "Processes, stores, and displays data (for example on a dashboard) so users can use it",
        "Removes duplicate packets and chooses the route",
        "Sets the Spreading Factor of each end-device",
      ],
    },
    penjelasan: {
      id: "Mengolah, menyimpan, dan menampilkan data (misalnya ke dashboard) supaya langsung bisa dipakai pengguna atau aplikasi klien.",
      en: "It processes, stores, and displays data (e.g., on a dashboard) so it can be used directly by users or client applications.",
    },
  },
  {
    id: "m4-c3",
    tipe: "C",
    nomor: 3,
    benar: 0,
    teks: {
      id: "Apa itu ANTARES di praktikum ini, dan apa dua layanan utamanya?",
      en: "What is ANTARES in this practicum, and what are its two main services?",
    },
    pilihan: {
      id: [
        "Platform IoT dari PT Telkom Indonesia, dengan layanan IoT platform dan IoT connectivity",
        "Broker MQTT open source dari Eclipse, dengan layanan publish dan subscribe",
        "Modul radio LoRa buatan Semtech, dengan layanan transmitter dan receiver",
        "Platform cloud dari Google, dengan layanan storage dan machine learning",
      ],
      en: [
        "An IoT platform from PT Telkom Indonesia, with IoT platform and IoT connectivity services",
        "An open-source MQTT broker from Eclipse, with publish and subscribe services",
        "A LoRa radio module made by Semtech, with transmitter and receiver services",
        "A cloud platform from Google, with storage and machine learning services",
      ],
    },
    penjelasan: {
      id: "ANTARES adalah platform Internet of Things (IoT) yang dikembangkan PT Telkom Indonesia. Dua layanan utamanya IoT platform dan IoT connectivity.",
      en: "ANTARES is an Internet of Things (IoT) platform developed by PT Telkom Indonesia. Its two main services are IoT platform and IoT connectivity.",
    },
  },
  {
    id: "m4-c4",
    tipe: "C",
    nomor: 4,
    benar: 0,
    teks: {
      id: "Benar atau Salah? Class C punya latency terendah tapi paling boros daya, karena receiver-nya hampir selalu terbuka.",
      en: "True or False? Class C has the lowest latency but uses the most power, because its receiver is open almost all the time.",
    },
    pilihan: {
      id: ["Benar", "Salah"],
      en: ["True", "False"],
    },
    penjelasan: {
      id: "Benar. Perangkat Class C menjaga receiver tetap terbuka hampir sepanjang waktu (kecuali saat mengirim), jadi konsumsi energinya sangat tinggi.",
      en: "True. Class C devices keep their receiver open almost continuously (except while transmitting), so their energy use is very high.",
    },
  },
  {
    id: "m4-c5",
    tipe: "C",
    nomor: 5,
    benar: 2,
    teks: {
      id: "Di sisi receiver kode LoRaWAN ANTARES, apa fungsi lora.readData(receivedData)?",
      en: "On the receiver side of the ANTARES LoRaWAN code, what does lora.readData(receivedData) do?",
    },
    pilihan: {
      id: [
        "Mengirim isi receivedData ke server",
        "Membaca nilai sensor lalu menyimpannya di receivedData",
        "Membaca data downlink dari ANTARES ke array receivedData dan mengembalikan jumlah byte-nya",
        "Menghapus isi receivedData setelah dikirim",
      ],
      en: [
        "Sends the contents of receivedData to the server",
        "Reads a sensor value and stores it in receivedData",
        "Reads downlink data from ANTARES into the receivedData array and returns its byte count",
        "Clears receivedData after it is sent",
      ],
    },
    penjelasan: {
      id: "Membaca data downlink yang diterima dari server ANTARES ke array receivedData, dan mengembalikan ukuran pesan yang masuk dalam byte.",
      en: "It reads the downlink data received from the ANTARES server into the receivedData array and returns the byte size of the incoming message.",
    },
  },

  // ---------- Tipe D ----------
  {
    id: "m4-d1",
    tipe: "D",
    nomor: 1,
    benar: 3,
    teks: {
      id: "Apa itu Cosmic LoRa Aurora V2?",
      en: "What is the Cosmic LoRa Aurora V2?",
    },
    pilihan: {
      id: [
        "Gateway LoRaWAN untuk dipasang di luar ruangan",
        "Sensor suhu dan kelembapan berbasis LoRa",
        "Board Raspberry Pi dengan modul LoRa bawaan",
        "Development board LoRa dengan transceiver RFM95W dan mikrokontroler ESP32 (mendukung Wi-Fi)",
      ],
      en: [
        "A LoRaWAN gateway for outdoor installation",
        "A LoRa-based temperature and humidity sensor",
        "A Raspberry Pi board with a built-in LoRa module",
        "A LoRa development board with an RFM95W transceiver and an ESP32 microcontroller (Wi-Fi capable)",
      ],
    },
    penjelasan: {
      id: "Development board LoRa yang memakai transceiver radio LoRa RFM95W dan mikrokontroler ESP32 (mendukung Wi-Fi).",
      en: "A LoRa development board that uses the RFM95W LoRa radio transceiver and an ESP32 microcontroller (Wi-Fi capable).",
    },
  },
  {
    id: "m4-d2",
    tipe: "D",
    nomor: 2,
    benar: 1,
    teks: {
      id: "Kasus mana yang paling cocok memakai LoRaWAN?",
      en: "Which case suits LoRaWAN best?",
    },
    pilihan: {
      id: [
        "Streaming video CCTV secara real-time",
        "Ratusan sensor tersebar berbaterai yang kirim data kecil secara berkala",
        "Mengendalikan robot dengan latency serendah mungkin",
        "Memindahkan file besar tiap detik",
      ],
      en: [
        "Streaming CCTV video in real time",
        "Hundreds of scattered battery-powered sensors sending small data periodically",
        "Controlling a robot with the lowest possible latency",
        "Moving large files every second",
      ],
    },
    penjelasan: {
      id: "LoRaWAN cocok untuk jangkauan luas (beberapa km), perangkat berbaterai, data kecil berkala, tidak butuh real-time, dan banyak sensor tersebar.",
      en: "LoRaWAN suits wide coverage (several km), battery-powered devices, small periodic data, no need for real time, and many distributed sensors.",
    },
  },
  {
    id: "m4-d3",
    tipe: "D",
    nomor: 3,
    benar: 2,
    teks: {
      id: "Bagaimana cara kerja Gateway di jaringan LoRaWAN?",
      en: "How does the Gateway work in a LoRaWAN network?",
    },
    pilihan: {
      id: [
        "Mengolah dan menampilkan data di dashboard",
        "Menyimpan session key semua end-device",
        "Menerima paket radio LoRa dari banyak end-device sekaligus lalu meneruskannya lewat jaringan IP ke Network server",
        "Mengubah data sensor jadi sinyal chirp",
      ],
      en: [
        "Processes and displays data on a dashboard",
        "Stores the session keys of every end-device",
        "Receives LoRa radio packets from many end-devices at once and forwards them over an IP network to the Network Server",
        "Turns sensor data into a chirp signal",
      ],
    },
    penjelasan: {
      id: "Gateway menerima paket data radio RF (LoRa) dari banyak end-device secara serentak, lalu meneruskannya (jadi bridge) lewat koneksi jaringan IP seperti internet ke Network Server.",
      en: "The Gateway receives RF (LoRa) data packets from many end-devices simultaneously and forwards them (acting as a bridge) over an IP network connection such as the internet to the Network Server.",
    },
  },
  {
    id: "m4-d4",
    tipe: "D",
    nomor: 4,
    benar: 1,
    teks: {
      id: "Benar atau Salah? Pada LoRa peer-to-peer, Sync Word (contoh 0xF3) membuat radio memproses paket dari Sync Word mana pun.",
      en: "True or False? In LoRa peer-to-peer, the Sync Word (e.g. 0xF3) makes the radio process packets from any Sync Word.",
    },
    pilihan: {
      id: ["Benar", "Salah"],
      en: ["True", "False"],
    },
    penjelasan: {
      id: "Salah. Sync Word dipakai untuk menyaring paket: radio cuma mendengarkan dan memproses paket dengan Sync Word yang sama, nilai lain diabaikan.",
      en: "False. The Sync Word filters packets: the radio only listens to and processes packets with the same Sync Word, and ignores other values.",
    },
  },
  {
    id: "m4-d5",
    tipe: "D",
    nomor: 5,
    benar: 0,
    teks: {
      id: "Dengan aktivasi ABP di ANTARES, tiga kredensial apa yang harus dimasukkan ke source code?",
      en: "With ABP activation in ANTARES, which 3 credentials must go into the source code?",
    },
    pilihan: {
      id: [
        "Device Address, Network Session Key, dan Application Session Key",
        "DevEUI, AppEUI, dan AppKey",
        "SSID, Password, dan Broker",
        "Sync Word, Spreading Factor, dan Bandwidth",
      ],
      en: [
        "Device Address, Network Session Key, and Application Session Key",
        "DevEUI, AppEUI, and AppKey",
        "SSID, Password, and Broker",
        "Sync Word, Spreading Factor, and Bandwidth",
      ],
    },
    penjelasan: {
      id: "Device Address (DevAddr), Network Session Key (NwkSKey), dan Application Session Key (AppSKey).",
      en: "Device Address (DevAddr), Network Session Key (NwkSKey), and Application Session Key (AppSKey).",
    },
  },

  // ---------- Tipe E ----------
  {
    id: "m4-e1",
    tipe: "E",
    nomor: 1,
    benar: 3,
    teks: {
      id: "Parameter radio mana yang memengaruhi jangkauan, ketahanan sinyal, dan data rate di LoRa?",
      en: "Which radio parameters affect range, signal resilience, and data rate in LoRa?",
    },
    pilihan: {
      id: [
        "Baud rate, SSID, Topic, dan Port",
        "RAM, Flash, clock CPU, dan ADC",
        "Panjang kabel, tegangan, arus, dan resistansi",
        "Spreading factor, bandwidth, coding rate, frekuensi, dan TX power",
      ],
      en: [
        "Baud rate, SSID, Topic, and Port",
        "RAM, Flash, CPU clock, and ADC",
        "Cable length, voltage, current, and resistance",
        "Spreading factor, bandwidth, coding rate, frequency, and TX power",
      ],
    },
    penjelasan: {
      id: "Spreading factor, bandwidth, coding rate, frekuensi, dan daya pancar (TX Power).",
      en: "Spreading factor, bandwidth, coding rate, frequency, and transmit power (TX Power).",
    },
  },
  {
    id: "m4-e2",
    tipe: "E",
    nomor: 2,
    benar: 1,
    teks: {
      id: "Benar atau Salah? LoRaWAN cocok untuk mengirim video berukuran besar.",
      en: "True or False? LoRaWAN is suitable for sending large video files.",
    },
    pilihan: {
      id: ["Benar", "Salah"],
      en: ["True", "False"],
    },
    penjelasan: {
      id: "Salah. LoRaWAN dirancang untuk paket data kecil (low data rate) yang mengutamakan hemat energi, bukan transfer data cepat terus-menerus.",
      en: "False. LoRaWAN is designed for small data packets (low data rate) that prioritise energy efficiency, not continuous high-speed transfer.",
    },
  },
  {
    id: "m4-e3",
    tipe: "E",
    nomor: 3,
    benar: 2,
    teks: {
      id: "Apa fitur unggulan yang ditambahkan Class B dibanding Class A?",
      en: "What outstanding feature does Class B add compared to Class A?",
    },
    pilihan: {
      id: [
        "Receiver yang terbuka terus-menerus",
        "Enkripsi data end-to-end",
        "Downlink lewat beacon jaringan dan ping slot terjadwal, jadi lebih bisa diprediksi",
        "Kemampuan kirim data tanpa gateway",
      ],
      en: [
        "A receiver that is always open",
        "End-to-end data encryption",
        "Downlink through network beacons and scheduled ping slots, so it is more predictable",
        "The ability to send data without a gateway",
      ],
    },
    penjelasan: {
      id: "Class B menambahkan penerimaan downlink lewat beacon jaringan dan ping slot terjadwal, jadi peluang server mengirim data balik jauh lebih bisa diprediksi.",
      en: "Class B adds downlink reception through scheduled network beacons and ping slots, making the chances of the server sending data back much more predictable.",
    },
  },
  {
    id: "m4-e4",
    tipe: "E",
    nomor: 4,
    benar: 0,
    teks: {
      id: "Library (header) apa yang harus di-include supaya ESP32 bisa bicara dengan modul RFM95W dan server LoRaWAN ANTARES?",
      en: "Which libraries (headers) must be included so the ESP32 can talk to the RFM95W module and the ANTARES LoRaWAN server?",
    },
    pilihan: {
      id: [
        "<SPI.h> dan <lorawan.h>",
        "<WiFi.h> dan <PubSubClient.h>",
        "<Wire.h> dan <BluetoothSerial.h>",
        "<SPI.h> dan <WebSocketsClient.h>",
      ],
      en: [
        "<SPI.h> and <lorawan.h>",
        "<WiFi.h> and <PubSubClient.h>",
        "<Wire.h> and <BluetoothSerial.h>",
        "<SPI.h> and <WebSocketsClient.h>",
      ],
    },
    penjelasan: {
      id: "<SPI.h> (komunikasi ESP32 ke modul RFM95W) dan <lorawan.h> (dari AntaresLoraID).",
      en: "<SPI.h> (ESP32 to RFM95W module communication) and <lorawan.h> (provided by AntaresLoraID).",
    },
  },
  {
    id: "m4-e5",
    tipe: "E",
    nomor: 5,
    benar: 3,
    teks: {
      id: "Di transmitter LoRa peer-to-peer, apa fungsi urutan LoRa.beginPacket(), LoRa.print(counter), LoRa.endPacket()?",
      en: "In the LoRa peer-to-peer transmitter, what does the sequence LoRa.beginPacket(), LoRa.print(counter), LoRa.endPacket() do?",
    },
    pilihan: {
      id: [
        "Membaca paket yang masuk lalu mencetak counter",
        "Menyambungkan ke gateway lalu mengirim counter lewat internet",
        "Mengatur frekuensi, Sync Word, lalu mulai menerima",
        "Membuka paket baru, mengisi payload dengan counter, lalu menutup paket dan memancarkannya lewat radio LoRa",
      ],
      en: [
        "Reads an incoming packet and prints the counter",
        "Connects to a gateway and sends the counter over the internet",
        "Sets the frequency and Sync Word, then starts receiving",
        "Opens a new packet, fills the payload with the counter, then closes the packet and transmits it over LoRa radio",
      ],
    },
    penjelasan: {
      id: "Membuka paket transmisi baru, mengisi payload dengan isi variabel counter, lalu menutup paket dan memerintahkan modul memancarkannya lewat gelombang radio LoRa.",
      en: "It opens a new transmission packet, fills the payload with the value of the counter variable, then ends the packet and commands the module to transmit it over LoRa radio waves.",
    },
  },
];
