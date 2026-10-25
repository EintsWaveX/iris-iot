/**
 * What Live Coding ships with (EXAM-ENGINE 9.2, 9.3, 9.8, ruling 2026-10-24):
 * the six topics, the starting sketches and the grader rubric. They are the
 * defaults of every edition and stay editable in the bank; `sample` only
 * puts a "Bawaan" badge on them. Pure data.
 */
import type { Protocol, RubricRow } from "./exam-types.js";
import { DEFAULT_TEMPLATES } from "./lc-templates.js";

export { DEFAULT_TEMPLATES };

export interface DefaultTopic {
  title: string;
  brief: string;
  fits: Protocol[];
  parts: string[];
  libs: string[];
  hints: string;
  icon: string;
}

const ALL: Protocol[] = ["ble", "httpws", "mqtt"];

/** How a seat's messages are named, the same for every protocol (the topic decides the meaning). */
const KONTRAK =
  'Nama pesan: tulis di brief sesuai topik. Lewat MQTT nama itu bagian terakhir topik, lewat WebSocket dan BLE kirim teks JSON `{"nama":nilai}`, lewat HTTP kirim ke jalur `/data` dengan badan JSON yang sama.';

export const DEFAULT_TOPICS: DefaultTopic[] = [
  {
    title: "Lampu Jarak Jauh",
    brief:
      "Buat papanmu mengirim status tombol ke IRIS setiap kali berubah (`tombol`: 1 saat ditekan, 0 saat dilepas) dan menyalakan atau mematikan LED sesuai perintah dari halaman IRIS (`led`: `nyala` atau `mati`).\n\n" +
      KONTRAK,
    fits: ALL,
    parts: ["LED", "tombol"],
    libs: [],
    hints:
      "Cek: tombol ditekan lalu terlihat di Lalu Lintas; perintah `nyala` menyalakan LED. Tombol harus dibaca dengan INPUT_PULLUP atau resistor.",
    icon: "lamp",
  },
  {
    title: "Monitor Suhu Ruang",
    brief:
      "Kirim suhu (`suhu`, derajat Celsius) dan kelembapan (`lembap`, persen) dari DHT11 setiap 2 detik. Terima batas alarm (`batas`, suhu) dari halaman IRIS dan bunyikan buzzer selama suhu melewati batas.\n\n" +
      KONTRAK,
    fits: ALL,
    parts: ["DHT11", "buzzer"],
    libs: ["DHT sensor library", "Adafruit Unified Sensor"],
    hints:
      "Cek: suhu masuk tiap 2 detik (DHT11 tidak boleh dibaca lebih cepat); buzzer berbunyi saat batas diturunkan di bawah suhu sekarang dan berhenti saat dinaikkan.",
    icon: "thermometer",
  },
  {
    title: "Dimmer Potensiometer",
    brief:
      "Kirim posisi potensiometer dalam persen (`pot`, 0 sampai 100) dan terima kecerahan LED (`cerah`, 0 sampai 100) dari halaman IRIS, lalu atur LED dengan PWM.\n\n" +
      KONTRAK,
    fits: ALL,
    parts: ["potensiometer", "LED"],
    libs: [],
    hints:
      "Cek: memutar potensiometer mengubah angka di Lalu Lintas; mengirim `cerah` mengubah terang LED bertahap (PWM, bukan hidup mati). Nilai ADC 12 bit dipetakan ke 0 sampai 100.",
    icon: "sliders",
  },
  {
    title: "Alarm Pintu",
    brief:
      "Anggap tombol sebagai sensor pintu. Kirim tiap kali pintu dibuka atau ditutup (`pintu`: `buka` atau `tutup`) bersama hitungannya (`hitung`). Terima perintah `alarm` (`aktif` atau `nonaktif`): saat aktif, buka pintu membunyikan buzzer dan menyalakan LED.\n\n" +
      KONTRAK,
    fits: ALL,
    parts: ["tombol", "buzzer", "LED"],
    libs: [],
    hints:
      "Cek: tiap perubahan terkirim sekali (bukan terus menerus), hitungan naik, alarm nonaktif tidak berbunyi. Debounce tombol menjadi nilai tambah.",
    icon: "door",
  },
  {
    title: "Penghitung Pengunjung",
    brief:
      "Hitung tekanan tombol dan kirim totalnya (`total`) setiap bertambah. Terima perintah `reset` dari halaman IRIS yang mengembalikan hitungan ke 0. LED berkedip sekali pada tiap tekanan.\n\n" +
      KONTRAK,
    fits: ALL,
    parts: ["tombol", "LED"],
    libs: [],
    hints:
      "Cek: satu tekanan menaikkan total tepat satu (debounce), `reset` mengembalikan ke 0 dan terkirim ulang.",
    icon: "counter",
  },
  {
    title: "Lampu Lalu Lintas",
    brief:
      "Tiga LED berganti seperti lampu lalu lintas (merah, hijau, kuning) dan papan mengirim fase yang sedang menyala (`fase`: `merah`, `hijau` atau `kuning`) setiap berganti. Terima mode (`mode`: `normal` atau `kedip`): pada `kedip`, hanya LED kuning yang berkedip.\n\n" +
      KONTRAK,
    fits: ALL,
    parts: ["LED merah", "LED kuning", "LED hijau"],
    libs: [],
    hints:
      "Cek: urutan fase benar dan tiap fase dilaporkan sekali; pergantian mode terjadi tanpa menunggu siklus selesai; tidak memakai delay panjang yang menghalangi menerima pesan.",
    icon: "traffic",
  },
];

/** The rubric rows of 9.8: scored 0 to max in whole steps, weighted. */
export const DEFAULT_RUBRIC_ROWS: RubricRow[] = [
  { key: "jalan", label: "Sistem berjalan dari sensor sampai IRIS", max: 4, weight: 3 },
  { key: "protokol", label: "Protokol dipakai dengan benar", max: 4, weight: 2 },
  { key: "data", label: "Data dikirim dan diterima sesuai topik", max: 4, weight: 2 },
  { key: "kode", label: "Kode rapi dan terstruktur", max: 4, weight: 1 },
  { key: "jelas", label: "Bisa menjelaskan alur sistemnya", max: 4, weight: 2 },
];

/** The words of a row's levels (9.8). */
export const LEVEL_WORDS = ["Belum Ada", "Baru Mulai", "Sebagian", "Hampir", "Lengkap"] as const;
