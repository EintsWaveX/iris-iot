// =====================================================================
// MODUL 4 — KOMUNIKASI LONG RANGE (LoRa)
// Presentasi pengantar praktikum, durasi sasaran 20–25 menit.
//
// Kompilasi dari direktori akar proyek:
//   typst compile --root . "presentasi/id/ID_Modul 4.typ"
//
// Tanda --root wajib: berkas ini merujuk aset dan berkas kode di luar
// folder presentasi memakai lintasan absolut terhadap akar proyek.
// =====================================================================

#import "/presentasi/template/slides.typ": *

#show: iris-theme.with(
  title: "Modul 4 — Komunikasi Long Range (LoRa)",
  subtitle: "Praktikum Pemrograman Perangkat IoT",
  lang: "id",
)

#title-slide(
  title: [MODUL 4],
  topic: [KOMUNIKASI LONG RANGE (LoRa)],
  subtitle: [LoRa Peer-to-Peer],
  lang: "id",
)

#include "parts/01-teori.typ"

#include "parts/02-implementasi.typ"
