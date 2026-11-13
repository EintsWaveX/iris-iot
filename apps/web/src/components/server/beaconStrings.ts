/**
 * Strings for the Module 4 board layout control (BeaconHunt.tsx), 2026-11-13.
 * Indonesian first, then English and Mandarin.
 */
import type { Lang } from "../../lib/kelas";

export interface BeaconTeks {
  title: string;
  sub: string;
  label: string;
  perGroup: string;
  shared: string;
  less: string;
  more: string;
  pattern: string;
  interleaved: string;
  contiguous: string;
  /** "Beacon 1: kelompok 1, 3, 5" */
  line: (beacon: number, groups: number[]) => string;
  ownHint: string;
  sharedHint: string;
  lockedHint: string;
  redownload: string;
  saved: string;
  locked: string;
  fail: string;
}

export const B: Record<Lang, BeaconTeks> = {
  id: {
    title: "Beacon Modul 4",
    sub: "Berapa Beacon yang dipakai lab, dan kelompok mana yang dilayani tiap Beacon.",
    label: "Jumlah Beacon Modul 4",
    perGroup: "Satu per kelompok",
    shared: "Dibagi",
    less: "Kurangi jumlah Beacon",
    more: "Tambah jumlah Beacon",
    pattern: "Pembagian kelompok",
    interleaved: "Selang",
    contiguous: "Berurutan",
    line: (b, g) => `Beacon ${b}: kelompok ${g.join(", ")}`,
    ownHint: "Tiap kelompok punya Beacon sendiri.",
    sharedHint:
      "Kelompok yang berbagi satu Beacon memburu tempat sembunyi yang sama. Tiap Beacon dipasang lewat Upload oleh salah satu kelompoknya, dan papan itu memancar untuk semua kelompok yang dilayaninya.",
    lockedHint: "Perburuan sudah dimulai, jadi jumlah Beacon tidak bisa diganti lagi.",
    redownload:
      "Beacon yang sudah dipasang harus dipasang ulang lewat Upload, karena kelompok yang dilayaninya berubah.",
    saved: "Jumlah Beacon diganti",
    locked: "Perburuan sudah dimulai, jumlah Beacon tidak bisa diganti.",
    fail: "Jumlah Beacon belum bisa diganti. Coba lagi.",
  },
  en: {
    title: "Module 4 Beacons",
    sub: "How many Beacons the lab uses, and which groups each Beacon serves.",
    label: "Module 4 Beacon count",
    perGroup: "One per group",
    shared: "Shared",
    less: "Fewer Beacons",
    more: "More Beacons",
    pattern: "How groups are split",
    interleaved: "Alternating",
    contiguous: "In order",
    line: (b, g) => `Beacon ${b}: group ${g.join(", ")}`,
    ownHint: "Each group has its own Beacon.",
    sharedHint:
      "Groups that share a Beacon hunt the same hiding spot. Each Beacon is set up through Upload by one of its groups, and that board transmits for every group it serves.",
    lockedHint: "The hunt has started, so the Beacon count can't be changed any more.",
    redownload:
      "A Beacon that was already set up must be uploaded again, because the groups it serves changed.",
    saved: "Beacon count changed",
    locked: "The hunt has started, the Beacon count can't be changed.",
    fail: "Couldn't change the Beacon count. Try again.",
  },
  zh: {
    title: "模块 4 Beacon",
    sub: "实验室用几个 Beacon，以及每个 Beacon 负责哪些组。",
    label: "模块 4 Beacon 数量",
    perGroup: "每组一个",
    shared: "共用",
    less: "减少 Beacon",
    more: "增加 Beacon",
    pattern: "分组方式",
    interleaved: "交替",
    contiguous: "按顺序",
    line: (b, g) => `Beacon ${b}：第 ${g.join("、")} 组`,
    ownHint: "每组有自己的 Beacon。",
    sharedHint:
      "共用一个 Beacon 的组会找同一个藏身处。每个 Beacon 由其中一组通过上传设置，这块板会为它负责的所有组发射。",
    lockedHint: "寻踪已经开始，Beacon 数量不能再改了。",
    redownload: "已经设置过的 Beacon 要重新上传，因为它负责的组变了。",
    saved: "Beacon 数量已更改",
    locked: "寻踪已经开始，Beacon 数量不能更改。",
    fail: "Beacon 数量没改成。请再试一次。",
  },
};
