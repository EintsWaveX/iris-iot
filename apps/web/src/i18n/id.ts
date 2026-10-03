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
  indexCardOpen: "Buka modul",
  indexLocked: "Terkunci",
  moduleWord: "Modul",
  langSwitchLabel: "English",
  langSwitchHref: (modul?: number) => (modul ? `/en/modules/${modul}` : "/en/modules"),
  backToIndex: "Semua Modul",
  jurnal: {
    title: (m: number) => `Jurnal Modul ${m} belum terbuka untukmu`,
    body: "Persiapan, kode dan live terbuka setelah kamu mengikuti praktikum modul ini. Sambil menunggu, baca modulnya di langkah pertama.",
    masuk: "Masuk",
    baca: "Baca modul",
  },
  modulDoc: (m: number) => `Modul ${m} · IRIS IoT`,
  stepLabels: {
    modul: "Modul",
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
  live: {
    heading: "Tampilan live",
    // Modul 1 mendapat data sungguhan dari PC kelompok yang menghubungkan
    // papan Central lewat USB (BoardLink), bukan dari Pi, jadi kalimatnya
    // sendiri. Modul 2 sampai 4 memakai versi "Real" lewat bodyFor/disclosureFor.
    body: "Alur dan lapisan protokol modul ini menampilkan data sungguhan begitu PC kelompok menghubungkan papan Central di halaman live, dan disimulasikan di peramban sebelum itu.",
    bodyReal:
      "Alur dan lapisan protokol modul ini menampilkan data sungguhan dari sesi dan papan yang sedang berjalan begitu tersedia, dan disimulasikan di peramban sebelum itu.",
    bodyFor: (modul: number) => (modul === 1 ? id.live.body : id.live.bodyReal),
    cta: "Buka tampilan live",
    backToModule: "Kembali ke Modul",
    tabLadder: "Alur",
    tabLayers: "Lapisan",
    tabSandbox: "Coba sendiri",
    disclosure:
      "Data pada halaman ini sungguhan begitu PC kelompok menghubungkan papan Central, dan disimulasikan di peramban Anda sebelum itu.",
    disclosureReal:
      "Data pada halaman ini sungguhan dari sesi dan papan yang sedang berjalan begitu tersedia, dan disimulasikan di peramban Anda sebelum itu.",
    disclosureFor: (modul: number) => (modul === 1 ? id.live.disclosure : id.live.disclosureReal),
    fireHint: "Tekan tombol untuk mengirim satu pesan uji dan melihatnya melintasi tiap lapisan.",
    jalurLabel: (jalur: number) => `Alur: ${jalur} jalur`,
  },
  nav: {
    prev: "Sebelumnya",
    next: "Berikutnya",
    stepOf: (current: number, total: number) => `Langkah ${current} dari ${total}`,
  },
};

export type ModuleStrings = typeof id;
