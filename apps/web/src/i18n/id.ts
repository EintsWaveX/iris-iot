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
    note: "Isikan setiap kotak rumpang lalu klik di luar kotak untuk memeriksa jawabannya. Jawaban yang benar menampilkan alasannya; jawaban tersimpan otomatis sehingga bisa dilanjutkan kapan saja.",
    download: "Unduh berkas",
    downloadHint: "Selesaikan semua bagian rumpang pada berkas ini untuk membuka unduhan.",
    masuk: "Masuk sebagai praktikan untuk mengisi dan menyimpan jawaban di sini.",
    sesiBerubah: "Sesi baru dimulai, silakan masuk lagi.",
    helperNote:
      "Berkas ini memakai jam bersama dari {file}. Unduh berkas itu juga dan letakkan di folder yang sama sebelum mengunggah.",
  },
  live: {
    heading: "Tampilan live",
    // Modul 1 tidak pernah punya sumber data sungguhan (tidak ada relay BLE
    // sungguhan, dan tidak direncanakan), jadi body/disclosure di bawah ini
    // tetap berlaku untuknya apa adanya. Modul 2 sampai 4 memakai versi
    // "Real" lewat bodyFor/disclosureFor, karena Tahap 20 memberi mereka
    // data sungguhan begitu sesi dan papan yang berjalan mengirimkannya.
    body: "Ladder dan lapisan protokol modul ini, disimulasikan langsung di peramban. Data sungguhan dari sesi dan papan yang berjalan menyusul di tahap berikutnya.",
    bodyReal:
      "Ladder dan lapisan protokol modul ini menampilkan data sungguhan dari sesi dan papan yang sedang berjalan begitu tersedia, dan disimulasikan di peramban sebelum itu.",
    bodyFor: (modul: number) => (modul === 1 ? id.live.body : id.live.bodyReal),
    cta: "Buka tampilan live",
    backToModule: "Kembali ke modul",
    tabLadder: "Ladder",
    tabLayers: "Lapisan",
    tabSandbox: "Coba sendiri",
    disclosure:
      "Semua data pada halaman ini disimulasikan di peramban Anda, bukan diambil dari papan atau sesi yang sebenarnya.",
    disclosureReal:
      "Data pada halaman ini sungguhan dari sesi dan papan yang sedang berjalan begitu tersedia, dan disimulasikan di peramban Anda sebelum itu.",
    disclosureFor: (modul: number) => (modul === 1 ? id.live.disclosure : id.live.disclosureReal),
    fireHint: "Tekan tombol untuk mengirim satu pesan uji dan melihatnya melintasi tiap lapisan.",
  },
  nav: {
    prev: "Sebelumnya",
    next: "Berikutnya",
    stepOf: (current: number, total: number) => `Langkah ${current} dari ${total}`,
  },
};

export type ModuleStrings = typeof id;
