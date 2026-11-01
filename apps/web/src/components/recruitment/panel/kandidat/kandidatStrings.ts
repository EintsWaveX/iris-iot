/** The Kandidat list's own words: the status queues, the chips and the row labels (mockup rec9). */
import { dict } from "../../../../lib/app";

export type Antre = "menunggu" | "revisi" | "disetujui" | "aktif" | "berhenti" | "mundur";

export const KS = dict({
  id: {
    all: "Semua",
    checkNext: "Periksa Berikutnya",
    download: "Download XLSX",
    stageNow: "Tahap sekarang",
    cutting: (s: string) => `Cutting ${s}`,
    cuttingOpen: (s: string) => `Buka Cutting ${s}`,
    accept: "Penerimaan",
    acceptOpen: "Buka tab Penerimaan",
    docsOf: (n: number, total: number) => `${n} dari ${total} berkas`,
    filterStatus: "Saring status",
    q: {
      menunggu: { t: "Menunggu Verifikasi", h: "Berkas sudah masuk, belum diperiksa." },
      revisi: {
        t: "Perlu Perbaikan",
        h: "Admin sudah meminta perbaikan; menunggu CaAs upload ulang.",
      },
      disetujui: { t: "Terverifikasi", h: "Berkas sesuai. Lanjut ke tahap berikutnya." },
      aktif: { t: "Berjalan", h: "Masih di perjalanan, ikut tahap sekarang." },
      berhenti: {
        t: "Tidak lolos",
        h: "Berhenti di tahap yang tertera. Halaman mereka dibekukan.",
      },
      mundur: { t: "Mundur", h: "Mengundurkan diri dari seleksi." },
    } as Record<Antre, { t: string; h: string }>,
    cols: ["NIM", "Nama", "Kelas", "Angkatan", "Berkas", "Daftar", "Tahap", "Status"],
  },
  en: {
    all: "All",
    checkNext: "Check the Next One",
    download: "Download XLSX",
    stageNow: "Current stage",
    cutting: (s: string) => `${s} Cutting`,
    cuttingOpen: (s: string) => `Open the ${s} Cutting`,
    accept: "Acceptance",
    acceptOpen: "Open the Acceptance tab",
    docsOf: (n: number, total: number) => `${n} of ${total} documents`,
    filterStatus: "Filter status",
    q: {
      menunggu: { t: "Awaiting Checks", h: "Documents are in, not checked yet." },
      revisi: {
        t: "Needs a Fix",
        h: "Admin asked for a fix; waiting for the CaAs to upload again.",
      },
      disetujui: { t: "Verified", h: "Documents are fine. On to the next stage." },
      aktif: { t: "In progress", h: "Still on the road, taking part in the current stage." },
      berhenti: { t: "Did not pass", h: "Stopped at the stage shown. Their page is frozen." },
      mundur: { t: "Withdrew", h: "Left the selection." },
    } as Record<Antre, { t: string; h: string }>,
    cols: ["NIM", "Name", "Class", "Year", "Docs", "Applied", "Stage", "Status"],
  },
  zh: {
    all: "全部",
    checkNext: "检查下一位",
    download: "下载 XLSX",
    stageNow: "当前阶段",
    cutting: (s: string) => `${s}筛选`,
    cuttingOpen: (s: string) => `打开${s}筛选`,
    accept: "录取",
    acceptOpen: "打开录取页",
    docsOf: (n: number, total: number) => `${n}/${total} 份材料`,
    filterStatus: "按状态筛选",
    q: {
      menunggu: { t: "等待审核", h: "材料已提交，尚未检查。" },
      revisi: { t: "需要修改", h: "管理员已要求修改，等待 CaAs 重新上传。" },
      disetujui: { t: "已通过审核", h: "材料无误，进入下一阶段。" },
      aktif: { t: "进行中", h: "仍在选拔路上，参加当前阶段。" },
      berhenti: { t: "未通过", h: "止步于所示阶段，他们的页面已冻结。" },
      mundur: { t: "已退出", h: "已退出选拔。" },
    } as Record<Antre, { t: string; h: string }>,
    cols: ["NIM", "姓名", "班级", "年级", "材料", "报名", "阶段", "状态"],
  },
});
