/**
 * Strings for the Module 4 network switch (JaringanHunt.tsx), 2026-11-11.
 * Indonesian first, then English and Mandarin.
 */
import type { Lang } from "../../lib/kelas";

export interface JaringanTeks {
  title: string;
  sub: string;
  irisIot: string;
  internet: string;
  irisIotHint: string;
  internetHint: string;
  lockedHint: string;
  redownload: string;
  saved: string;
  locked: string;
  fail: string;
  label: string;
}

export const J: Record<Lang, JaringanTeks> = {
  id: {
    title: "Jaringan Modul 4",
    sub: "Dipakai Beacon, Hunter, dan HP anggota di perburuan. Pilih sebelum praktikan mengunduh sketsa.",
    irisIot: "IRIS_IOT",
    internet: "Internet",
    irisIotHint:
      "PC lab membuat Wi-Fi IRIS_IOT. Beacon, Hunter, dan HP anggota menyambung ke situ, papan skor di 192.168.4.1, tanpa internet.",
    internetHint:
      "Tiap kelompok menyalakan hotspot di satu HP (IRIS-G<n>). Papan skor di hunt.irisiotlab.com lewat tunnel, HP anggota pakai data seluler.",
    lockedHint: "Perburuan sudah dimulai, jadi jaringannya tidak bisa diganti lagi.",
    redownload:
      "Praktikan yang sudah mengunduh sketsa harus mengunduhnya lagi, karena nama Wi-Fi dan alamat papan skor berubah.",
    saved: "Jaringan perburuan diganti",
    locked: "Perburuan sudah dimulai, jaringan tidak bisa diganti.",
    fail: "Jaringan belum bisa diganti. Coba lagi.",
    label: "Jaringan perburuan Modul 4",
  },
  en: {
    title: "Module 4 Network",
    sub: "Used by the Beacon, the Hunter and the members' phones in the hunt. Pick it before the students download the sketches.",
    irisIot: "IRIS_IOT",
    internet: "Internet",
    irisIotHint:
      "The lab PC makes the IRIS_IOT Wi-Fi. The Beacon, the Hunter and the members' phones join it, the scoreboard is at 192.168.4.1, no internet needed.",
    internetHint:
      "Each group turns on a hotspot on one phone (IRIS-G<n>). The scoreboard is at hunt.irisiotlab.com through the tunnel, members' phones use mobile data.",
    lockedHint: "The hunt has started, so the network can't be changed any more.",
    redownload:
      "Students who already downloaded a sketch must download it again, because the Wi-Fi name and the scoreboard address change.",
    saved: "Hunt network changed",
    locked: "The hunt has started, the network can't be changed.",
    fail: "Couldn't change the network. Try again.",
    label: "Module 4 hunt network",
  },
  zh: {
    title: "模块 4 网络",
    sub: "寻踪时 Beacon、Hunter 和成员的手机都用它。请在学生下载代码之前选好。",
    irisIot: "IRIS_IOT",
    internet: "互联网",
    irisIotHint:
      "实验室 PC 提供 IRIS_IOT Wi-Fi。Beacon、Hunter 和成员的手机都连上它，记分板在 192.168.4.1，不需要网络。",
    internetHint:
      "每组在一部手机上开热点（IRIS-G<n>）。记分板通过隧道在 hunt.irisiotlab.com，成员的手机用移动数据。",
    lockedHint: "寻踪已经开始，网络不能再改了。",
    redownload: "已经下载过代码的学生要重新下载，因为 Wi-Fi 名称和记分板地址变了。",
    saved: "寻踪网络已更改",
    locked: "寻踪已经开始，网络不能更改。",
    fail: "网络没改成。请再试一次。",
    label: "模块 4 寻踪网络",
  },
};
