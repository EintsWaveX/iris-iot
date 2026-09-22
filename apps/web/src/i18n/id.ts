/**
 * Indonesian UI strings for the /modules carousel and index. The rest of
 * apps/web's chrome (nav, dashboard, buttons) stays hardcoded Indonesian by
 * standing convention -- this file exists only because module content itself
 * ships in both id/ and en/ journal tracks (see src/content/modules), so the
 * carousel built around that content needs its own copy per language.
 */
export const id = {
  indexTitle: "Modul praktikum",
  indexLede:
    "Empat modul, satu papan. Pilih modul untuk membuka brief, persiapan, kode, dan tampilan live-nya.",
  langSwitchLabel: "English",
  langSwitchHref: (modul?: number) => (modul ? `/en/modules/${modul}` : "/en/modules"),
  backToIndex: "Semua modul",
  stepLabels: {
    brief: "Brief",
    setup: "Persiapan",
    code: "Kode",
    live: "Live",
  },
  brief: {
    heading: "Ringkasan",
    gameHeading: "Aturan permainan",
  },
  setup: {
    toolchainHeading: "Toolchain",
    hardwareHeading: "Komponen",
    pinHeading: "Pin",
    checklistHeading: "Sebelum menjalankan program",
  },
  code: {
    heading: "Kode program",
    note: "Bagian rumpang ditandai garis bawah dan nomor. Pengisian dan penilaian jawaban langsung di sini menyusul pada tahap berikutnya; untuk sekarang, kode ditampilkan seperti pada jurnal cetak.",
  },
  live: {
    heading: "Tampilan live",
    body: "Ladder dan lapisan protokol yang berjalan langsung belum tersedia di tahap ini. Kartu ini akan berpindah menjadi tautan ke tampilan live begitu tahap itu selesai dibangun.",
  },
  nav: {
    prev: "Sebelumnya",
    next: "Berikutnya",
    stepOf: (current: number, total: number) => `Langkah ${current} dari ${total}`,
  },
};

export type ModuleStrings = typeof id;
