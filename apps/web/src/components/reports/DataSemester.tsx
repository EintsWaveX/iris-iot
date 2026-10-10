/**
 * Data Semester (2026-10-10): the retention rule in Laporan. Practicum
 * records live one semester; on the first day of the next one everything
 * before it is deleted (api/_lib/retensi.ts). The dialog lists what each
 * semester still holds and lets the Admin tier delete a finished semester
 * early, after typing its name. A banner warns every Asisten in the two
 * weeks before an automatic deletion, so exports happen in time.
 */
import { useEffect, useState } from "react";
import { DatabaseIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Pill from "../ui/Pill";
import { dict, getJson, jamMenit, postJson, tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { useSegar } from "../../lib/siaran";
import { tanggalWib } from "./data";

interface Catatan {
  batas: string;
  pada: string;
  oleh: string;
  otomatis: boolean;
}

interface Status {
  ok: boolean;
  sekarang: string;
  batas: string;
  berikut: string;
  terakhir: Catatan | null;
  semester: string[];
  boleh: boolean;
}

const T = dict({
  id: {
    open: "Data Semester",
    title: "Data Semester",
    rule: (hapus: string, label: string) =>
      `Catatan praktikum disimpan satu semester. Pada ${hapus}, semua data ${label} terhapus otomatis: sesi, kehadiran, jawaban, nilai, umpan balik, honor, laporan tertulis, jadwal dan log.`,
    export: "Ekspor yang masih kamu perlukan dari Laporan sebelum tanggal itu.",
    last: (pada: string, oleh: string, batas: string) =>
      `Terakhir dihapus ${pada} oleh ${oleh}: semua data sebelum ${batas}.`,
    system: "sistem",
    now: "Semester Berjalan",
    held: "Masih Tersimpan",
    remove: "Hapus",
    onlyAdmin: "Hanya Admin yang bisa menghapus lebih awal.",
    typeTitle: (label: string) => `Hapus Semua Data ${label}`,
    typeBody: (label: string) =>
      `Ini tidak bisa dibatalkan. Semua data ${label} dan sebelumnya terhapus. Ketik "${label}" untuk melanjutkan.`,
    typeLabel: "Nama semester",
    confirm: "Hapus Sekarang",
    cancel: "Batal",
    done: (label: string) => `Data ${label} sudah dihapus.`,
    err: {
      sesi_berjalan: "Ada sesi yang sedang berjalan. Hapus setelah sesinya selesai.",
      konfirmasi_salah: "Nama semester belum cocok.",
      tidak_berhak: "Hanya Admin yang bisa menghapus.",
      semester_mendatang: "Semester ini belum berjalan.",
      lain: "Gagal menghapus. Coba lagi sebentar.",
    } as Record<string, string>,
    banner: (label: string, hapus: string) =>
      `Data ${label} terhapus otomatis ${hapus}. Ekspor yang masih kamu perlukan sebelum itu.`,
    none: "Tidak ada data semester yang tersimpan.",
    sem: (ganjil: boolean, a: number, b: number) => `${ganjil ? "Ganjil" : "Genap"} ${a}/${b}`,
  },
  en: {
    open: "Semester Data",
    title: "Semester Data",
    rule: (hapus: string, label: string) =>
      `Practicum records are kept for one semester. On ${hapus}, all ${label} data is deleted automatically: sessions, attendance, answers, scores, feedback, pay, written reports, the schedule and the logs.`,
    export: "Export what you still need from Reports before that date.",
    last: (pada: string, oleh: string, batas: string) =>
      `Last deleted ${pada} by ${oleh}: everything before ${batas}.`,
    system: "the system",
    now: "Current Semester",
    held: "Still Stored",
    remove: "Delete",
    onlyAdmin: "Only an Admin can delete early.",
    typeTitle: (label: string) => `Delete All ${label} Data`,
    typeBody: (label: string) =>
      `This can't be undone. All ${label} data and everything older is deleted. Type "${label}" to go on.`,
    typeLabel: "Semester name",
    confirm: "Delete Now",
    cancel: "Cancel",
    done: (label: string) => `${label} data deleted.`,
    err: {
      sesi_berjalan: "A session is running. Delete after it ends.",
      konfirmasi_salah: "The semester name doesn't match yet.",
      tidak_berhak: "Only an Admin can delete.",
      semester_mendatang: "That semester hasn't started.",
      lain: "Couldn't delete. Try again in a moment.",
    } as Record<string, string>,
    banner: (label: string, hapus: string) =>
      `${label} data is deleted automatically on ${hapus}. Export what you still need before then.`,
    none: "No semester data is stored.",
    sem: (ganjil: boolean, a: number, b: number) => `${ganjil ? "Odd" : "Even"} ${a}/${b}`,
  },
  zh: {
    open: "学期数据",
    title: "学期数据",
    rule: (hapus: string, label: string) =>
      `实验记录保存一个学期。${hapus}，${label} 的所有数据会自动删除：课堂、出勤、答案、成绩、反馈、报酬、书面报告、课表和日志。`,
    export: "请在那之前从报告中导出你还需要的内容。",
    last: (pada: string, oleh: string, batas: string) =>
      `上次删除：${pada}，由${oleh}执行，删除了 ${batas} 之前的所有数据。`,
    system: "系统",
    now: "当前学期",
    held: "仍在保存",
    remove: "删除",
    onlyAdmin: "只有管理员可以提前删除。",
    typeTitle: (label: string) => `删除 ${label} 的全部数据`,
    typeBody: (label: string) =>
      `此操作无法撤销。${label} 及更早的所有数据都会删除。输入"${label}"继续。`,
    typeLabel: "学期名称",
    confirm: "立即删除",
    cancel: "取消",
    done: (label: string) => `${label} 的数据已删除。`,
    err: {
      sesi_berjalan: "有课正在进行。请在下课后删除。",
      konfirmasi_salah: "学期名称还不一致。",
      tidak_berhak: "只有管理员可以删除。",
      semester_mendatang: "这个学期还没开始。",
      lain: "删除失败。请稍后再试。",
    } as Record<string, string>,
    banner: (label: string, hapus: string) =>
      `${label} 的数据会在 ${hapus} 自动删除。请在那之前导出你还需要的内容。`,
    none: "没有保存的学期数据。",
    sem: (ganjil: boolean, a: number, b: number) =>
      `${a}/${b} 学年${ganjil ? "第一学期" : "第二学期"}`,
  },
});

/** "2026-ganjil" as the people say it: Ganjil 2026/2027 */
function label(s: string, lang: Lang): string {
  const [y, j] = s.split("-");
  const n = Number(y);
  return j === "ganjil" ? T[lang].sem(true, n, n + 1) : T[lang].sem(false, n - 1, n);
}

/** Days from today (WIB) to an ISO date */
function hariMenuju(iso: string): number {
  const now = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(iso) - Date.parse(now)) / 86_400_000);
}

function useStatus(): [Status | null, () => void] {
  const [s, setS] = useState<Status | null>(null);
  const segar = useSegar(["sesi", "laporan"]);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    getJson<Status>("/api/session/retensi")
      .then((d) => alive && d.ok && setS(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [segar, n]);
  return [s, () => setN((x) => x + 1)];
}

// ---------- Banner ----------
// ---------- Banner ----------
// ---------- Banner ----------

/** Shown in the two weeks before the automatic deletion */
export function DataSemesterBanner({ lang, onOpen }: { lang: Lang; onOpen: () => void }) {
  const t = T[lang];
  const [s] = useStatus();
  if (!s) return null;
  const sisa = hariMenuju(s.berikut);
  if (sisa > 14 || sisa < 0) return null;
  return (
    <div className="banner banner--warn" role="status">
      <WarningIcon size={20} aria-hidden="true" />
      <span className="grow">
        {t.banner(label(s.sekarang, lang), tanggalPanjang(s.berikut, lang))}
      </span>
      <button type="button" className="btn btn--sm" onClick={onOpen}>
        {t.open}
      </button>
    </div>
  );
}

// ---------- Dialog ----------
// ---------- Dialog ----------
// ---------- Dialog ----------

export default function DataSemester({
  lang,
  open,
  onOpenChange,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = T[lang];
  const [s, muat] = useStatus();
  const [pilih, setPilih] = useState<string | null>(null);
  const [ketik, setKetik] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPilih(null);
      setKetik("");
      setErr(null);
    } else muat();
  }, [open]);

  async function hapus() {
    if (!pilih) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/retensi", {
        semester: pilih,
        konfirmasi: pilih,
      });
      if (!r.ok) {
        setErr(t.err[r.kode ?? "lain"] ?? t.err.lain);
        return;
      }
      window.Toast?.show(t.done(label(pilih, lang)), "ok");
      onOpenChange(false);
      location.reload();
    } catch {
      setErr(t.err.lain);
    } finally {
      setBusy(false);
    }
  }

  const nama = pilih ? label(pilih, lang) : "";
  const cocok = ketik.trim().toLowerCase() === nama.toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={pilih ? t.typeTitle(nama) : t.title}
      size="md"
      lang={lang}
      actions={
        pilih ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => {
                setPilih(null);
                setKetik("");
                setErr(null);
              }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={!cocok || busy}
              onClick={() => void hapus()}
            >
              <TrashIcon size={18} aria-hidden="true" />
              {t.confirm}
            </button>
          </>
        ) : undefined
      }
    >
      {!s ? (
        <span className="skeleton" style={{ height: 160 }} />
      ) : pilih ? (
        <div className="stack">
          <p className="hint" style={{ margin: 0 }}>
            {t.typeBody(nama)}
          </p>
          <div className="field">
            <label className="field__label" htmlFor="retensi-ketik">
              {t.typeLabel}
            </label>
            <input
              id="retensi-ketik"
              className="field__input"
              value={ketik}
              autoComplete="off"
              placeholder={nama}
              onChange={(e) => setKetik(e.target.value)}
            />
          </div>
          {err && (
            <p className="banner banner--danger" role="alert" style={{ margin: 0 }}>
              {err}
            </p>
          )}
        </div>
      ) : (
        <div className="stack">
          <p style={{ margin: 0 }}>
            {t.rule(tanggalPanjang(s.berikut, lang), label(s.sekarang, lang))}
          </p>
          <p className="hint" style={{ margin: 0 }}>
            {t.export}
          </p>
          {s.terakhir && (
            <p className="hint" style={{ margin: 0 }}>
              {t.last(
                `${tanggalPanjang(tanggalWib(s.terakhir.pada), lang)} ${jamMenit(s.terakhir.pada)}`,
                s.terakhir.otomatis ? t.system : s.terakhir.oleh,
                tanggalPanjang(s.terakhir.batas, lang),
              )}
            </p>
          )}
          {s.semester.length === 0 ? (
            <p className="empty-note">{t.none}</p>
          ) : (
            <ul className="datasem">
              {[...s.semester].reverse().map((k) => (
                <li key={k} className="datasem__row">
                  <DatabaseIcon size={20} aria-hidden="true" />
                  <b className="grow">{label(k, lang)}</b>
                  <Pill tone={k === s.sekarang ? "accent" : "warn"}>
                    {k === s.sekarang ? t.now : t.held}
                  </Pill>
                  {s.boleh && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => setPilih(k)}
                    >
                      <TrashIcon size={16} aria-hidden="true" />
                      {t.remove}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!s.boleh && <p className="hint">{t.onlyAdmin}</p>}
        </div>
      )}
    </Dialog>
  );
}

/** The header button that opens the dialog */
export function DataSemesterButton({ lang, onOpen }: { lang: Lang; onOpen: () => void }) {
  return (
    <button type="button" className="btn" onClick={onOpen}>
      <DatabaseIcon size={18} aria-hidden="true" />
      {T[lang].open}
    </button>
  );
}
