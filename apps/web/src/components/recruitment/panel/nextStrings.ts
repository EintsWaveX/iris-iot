/**
 * Words for Ringkasan's next steps (lib/recruitment/next-step.ts). `d` is the
 * full date of the event the step is about, `n` a real count. No em or en
 * dashes. Mandarin is added last (the zh view reads the English).
 */
import type { Lang } from "../../../lib/kelas";
import type { StepKey } from "../../../lib/recruitment/next-step";

export interface StepVars {
  n: number;
  total: number;
  aim: number;
  d: string;
}
type Words = Record<StepKey, (v: StepVars) => string>;

const ID: Words = {
  seatPanitia: (v) => `Susun kursi Panitia: ${v.n} terisi`,
  watchApplicants: (v) => `Pantau pendaftar yang masuk: ${v.n} dari sasaran sekitar ${v.aim}`,
  prepReview: (v) => `Siapkan Pengecekan Berkas${v.d ? `, ${v.d}` : ""}`,
  decideExtend: () => "Putuskan perlu tidaknya perpanjangan pendaftaran",
  backupFirstMeet: (v) => `Cari tempat cadangan First Meet${v.d ? `, ${v.d}` : ""}`,
  prepTesNights: (v) => `Siapkan malam Tes Tulis${v.d ? `, mulai ${v.d}` : ""}`,
  buildBank: (v) => `Susun Bank Soal Tes Tulis${v.d ? `, paling lambat ${v.d}` : ""}`,
  setPlotting: () => "Atur slot, ruang dan pengawas di Plotting",
  checkWaiting: (v) => `Periksa ${v.n} berkas yang menunggu`,
  addFromForm: () => "Tambah CaAs dari isian Google Form yang baru masuk",
  tellFix: (v) => `Kabari ${v.n} CaAs yang berkasnya perlu perbaikan`,
  followReview: (v) => `Pantau Pengecekan Berkas: ${v.total - v.n} dari ${v.total} sudah beres`,
  lockCuttingBerkas: (v) => `Kunci Cutting Berkas${v.d ? ` sebelum ${v.d}` : ""}`,
  plenoTulis: (v) => `Pleno Tes Tulis${v.d ? `, ${v.d}` : ""}`,
  prepFirstMeet: (v) => `Siapkan First Meet${v.d ? `, ${v.d}` : ""}: tempat dan layar QR`,
  openPilihJadwal: (v) => `Buka Pilih Jadwal Tes Tulis${v.d ? `, ${v.d} pukul 19:00` : ""}`,
  sendEnvelope: (v) => `Kirim amplop tahap ini${v.d ? `, ${v.d} pukul 12:00` : ""}`,
  attendFirstMeet: (v) => `Hadir di First Meet${v.d ? `, ${v.d}` : ""}`,
  runFirstMeet: () => "Jalankan First Meet: layar QR dan absensi",
  lockBank: (v) => `Kunci Bank Soal Tes Tulis${v.d ? ` sebelum ${v.d}` : ""}`,
  rehearseNight: () => "Uji coba Malam Ujian",
  recordFirstMeet: () => "Catat kehadiran First Meet dari QR",
  markAbsent: () => "Tandai yang tidak hadir untuk susulan",
  followNight: (v) => `Pantau Malam Ujian${v.d ? `, ${v.d}` : ""}`,
  lockCuttingTulis: (v) => `Kunci Cutting Tes Tulis${v.d ? `, ${v.d}` : ""}`,
  announceTulis: (v) => `Pengumuman Tes Tulis${v.d ? `, ${v.d} pukul 12:00` : ""}`,
  runNight: () => "Jalankan Malam Ujian: QR, ruang dan pengawas",
  makeupTulis: (v) => `Susulan Tes Tulis${v.d ? `, ${v.d}` : ""}`,
  superviseNight: () => "Awasi Malam Ujian dan nilai Live Coding",
  proposeCutTulis: () => "Usulkan yang lolos di Cutting Tes Tulis",
  recordNight: () => "Catat kehadiran dan susulan Tes Tulis",
  watchCalendar: () => "Pantau Kalender untuk acara berikutnya",
  nothing: () => "Tidak ada langkah untukmu sekarang",
};

const EN: Words = {
  seatPanitia: (v) => `Fill the Panitia seats: ${v.n} filled`,
  watchApplicants: (v) => `Watch applications come in: ${v.n} of about ${v.aim}`,
  prepReview: (v) => `Prepare the Document Check${v.d ? `, ${v.d}` : ""}`,
  decideExtend: () => "Decide whether registration needs an extension",
  backupFirstMeet: (v) => `Find a backup room for First Meet${v.d ? `, ${v.d}` : ""}`,
  prepTesNights: (v) => `Prepare the Written Test nights${v.d ? `, from ${v.d}` : ""}`,
  buildBank: (v) => `Build the Written Test bank${v.d ? ` by ${v.d}` : ""}`,
  setPlotting: () => "Set slots, rooms and supervisors in Plotting",
  checkWaiting: (v) => `Check the ${v.n} documents waiting`,
  addFromForm: () => "Add CaAs from new Google Form entries",
  tellFix: (v) => `Tell the ${v.n} CaAs whose documents need a fix`,
  followReview: (v) => `Follow the Document Check: ${v.total - v.n} of ${v.total} settled`,
  lockCuttingBerkas: (v) => `Lock Document Cutting${v.d ? ` before ${v.d}` : ""}`,
  plenoTulis: (v) => `Written Test plenary${v.d ? `, ${v.d}` : ""}`,
  prepFirstMeet: (v) => `Prepare First Meet${v.d ? `, ${v.d}` : ""}: room and QR screen`,
  openPilihJadwal: (v) => `Open Written Test slot picking${v.d ? `, ${v.d} at 19:00` : ""}`,
  sendEnvelope: (v) => `Send this stage's envelope${v.d ? `, ${v.d} at 12:00` : ""}`,
  attendFirstMeet: (v) => `Be at First Meet${v.d ? `, ${v.d}` : ""}`,
  runFirstMeet: () => "Run First Meet: the QR screen and attendance",
  lockBank: (v) => `Lock the Written Test bank${v.d ? ` before ${v.d}` : ""}`,
  rehearseNight: () => "Rehearse the exam night",
  recordFirstMeet: () => "Record First Meet attendance from the QR",
  markAbsent: () => "Mark who missed it for a makeup",
  followNight: (v) => `Follow the exam night${v.d ? `, ${v.d}` : ""}`,
  lockCuttingTulis: (v) => `Lock Written Test Cutting${v.d ? `, ${v.d}` : ""}`,
  announceTulis: (v) => `Written Test results${v.d ? `, ${v.d} at 12:00` : ""}`,
  runNight: () => "Run the exam night: QR, rooms and supervisors",
  makeupTulis: (v) => `Written Test makeup${v.d ? `, ${v.d}` : ""}`,
  superviseNight: () => "Oversee the exam night and grade Live Coding",
  proposeCutTulis: () => "Propose who passes in Written Test Cutting",
  recordNight: () => "Record Written Test attendance and makeups",
  watchCalendar: () => "Watch the Calendar for the next event",
  nothing: () => "No step for you right now",
};

export const stepText = (lang: Lang, key: StepKey, v: StepVars): string =>
  (lang === "id" ? ID : EN)[key](v);

export const NS = {
  id: {
    title: "Langkah Berikutnya untukmu",
    others: "Langkah lain, sesuai urutan",
    open: (tab: string) => `Buka ${tab}`,
    noScreen: "Langkah ini belum punya layar di sini. Lihat Kalender.",
    funnel: "Perjalanan Kandidat",
    stageNow: "Tahap sekarang",
    reached: (n: number) => `${n} sampai di sini`,
    here: "di tahap ini",
    cut: "gugur",
    notYet: "belum",
    stageCol: "Tahap",
    allStages: "Semua tahap",
    filterStage: "Saring tahap",
    openCutting: "Buka Cutting",
    setDocs: "Atur Berkas",
    stages: {
      berkas: "Berkas",
      first_meet: "First Meet",
      tes_tulis: "Tes Tulis",
      wawancara: "Wawancara",
      tubes: "Tubes",
      mengajar: "Mengajar",
      penerimaan: "Penerimaan",
    },
    tabs: {
      ringkasan: "Ringkasan",
      kalender: "Kalender",
      kandidat: "Kandidat",
      cutting: "Cutting",
      plotting: "Plotting",
      tes: "Tes Tulis",
      bank: "Bank Soal",
      panitia: "Panitia",
    },
  },
  en: {
    title: "Your Next Step",
    others: "The other steps, in order",
    open: (tab: string) => `Open ${tab}`,
    noScreen: "This step has no screen here yet. See the Calendar.",
    funnel: "Candidate Funnel",
    stageNow: "Stage now",
    reached: (n: number) => `${n} got here`,
    here: "in this stage",
    cut: "cut",
    notYet: "not yet",
    stageCol: "Stage",
    allStages: "Every stage",
    filterStage: "Filter stage",
    openCutting: "Open Cutting",
    setDocs: "Set Documents",
    stages: {
      berkas: "Documents",
      first_meet: "First Meet",
      tes_tulis: "Written Test",
      wawancara: "Interview",
      tubes: "Project",
      mengajar: "Teaching",
      penerimaan: "Acceptance",
    },
    tabs: {
      ringkasan: "Overview",
      kalender: "Calendar",
      kandidat: "Candidates",
      cutting: "Cutting",
      plotting: "Plotting",
      tes: "Written Test",
      bank: "Question Bank",
      panitia: "Committee",
    },
  },
} as const;
