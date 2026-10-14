/**
 * Ganti Modul / Ubah Jenis Kelas (Ada Masalah?, 2026-10-10): fix a running
 * session started with the wrong module or class type (POST
 * /api/session/ubah). The module changes only while no blank is right yet,
 * and its wrong answers go with it; the class type only before scores were
 * sent. A closed module can't be picked, except in a TOT session.
 */
import { useEffect, useState } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { dict, getJson, MODUL_NAMA, postJson } from "../../lib/app";
import { useSegar } from "../../lib/siaran";
import { kelasLabel, modulLabel } from "../../lib/labels";
import { KELAS, type Kelas, type Lang } from "../../lib/kelas";
import type { SesiRunning } from "./types";

const U = dict({
  id: {
    title: "Ganti Modul atau Jenis Kelas",
    desc: "Untuk sesi yang terlanjur dimulai dengan pilihan yang salah.",
    modul: "Modul",
    kelas: "Jenis kelas",
    closed: "tertutup",
    lockedModul: (n: number) =>
      `Sudah ada ${n} blank benar, jadi modul tidak bisa diganti lagi. Akhiri sesi ini dan mulai yang baru.`,
    wipe: (n: number) =>
      n
        ? `${n} isian salah dari modul lama ikut terhapus. Roster, kehadiran dan pasangan tetap.`
        : "Roster, kehadiran dan pasangan tetap.",
    cancel: "Batal",
    save: "Simpan",
    saved: "Sesi diperbarui.",
    warn: (x: string) => `Sesi diperbarui. Cek layanan di PC Server: ${x}.`,
    errors: {
      ada_benar: "Sudah ada blank benar. Modul tidak bisa diganti lagi.",
      modul_tertutup: "Modul itu masih tertutup. Buka dulu di Persiapan.",
      sudah_kirim: "Nilai sudah dikirim, jadi jenis kelas tidak bisa diubah lagi.",
      sudah_ada: "Sudah ada sesi lain dengan modul itu di jam yang sama.",
      tanpa_hak: "Hanya yang memegang kendali sesi yang bisa mengubahnya.",
      gagal: "Tidak bisa sekarang. Coba lagi.",
    } as Record<string, string>,
  },
  en: {
    title: "Change the Module or Class Type",
    desc: "For a session that was started with the wrong choice.",
    modul: "Module",
    kelas: "Class type",
    closed: "closed",
    lockedModul: (n: number) =>
      `${n} ${n === 1 ? "blank is" : "blanks are"} already right, so the module can't change anymore. End this session and start a new one.`,
    wipe: (n: number) =>
      n
        ? `${n} wrong ${n === 1 ? "answer" : "answers"} from the old module go too. The roster, attendance and pairings stay.`
        : "The roster, attendance and pairings stay.",
    cancel: "Cancel",
    save: "Save",
    saved: "Session updated.",
    warn: (x: string) => `Session updated. Check the PC Server's services: ${x}.`,
    errors: {
      ada_benar: "A blank is already right. The module can't change anymore.",
      modul_tertutup: "That module is still closed. Open it in Preparation first.",
      sudah_kirim: "Scores were already sent, so the class type can't change anymore.",
      sudah_ada: "Another session has that module at the same time.",
      tanpa_hak: "Only whoever holds the session's control can change it.",
      gagal: "Not possible right now. Try again.",
    } as Record<string, string>,
  },
  zh: {
    title: "更换模块或班级类型",
    desc: "用于开始时选错了的课。",
    modul: "模块",
    kelas: "班级类型",
    closed: "未开放",
    lockedModul: (n: number) =>
      `已经有 ${n} 个填空答对了，模块不能再换。结束这节课，再开一节新的。`,
    wipe: (n: number) =>
      n ? `旧模块的 ${n} 个错误答案会一起删除。名单、出勤和配对不变。` : "名单、出勤和配对不变。",
    cancel: "取消",
    save: "保存",
    saved: "课程已更新。",
    warn: (x: string) => `课程已更新。检查一下 PC 服务器上的服务：${x}。`,
    errors: {
      ada_benar: "已经有填空答对了，模块不能再换。",
      modul_tertutup: "这个模块还没开放。先在准备里开放。",
      sudah_kirim: "成绩已经发送，班级类型不能再改。",
      sudah_ada: "同一时间已经有另一节这个模块的课。",
      tanpa_hak: "只有掌控这节课的人能修改。",
      gagal: "现在不行。再试一次。",
    } as Record<string, string>,
  },
});

export default function UbahSesi({
  lang,
  open,
  onOpenChange,
  sesi,
  benar,
  salah,
  onDone,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sesi: SesiRunning;
  /** Blanks right and wrong answers in this session so far. */
  benar: number;
  salah: number;
  onDone: () => void;
}) {
  const t = U[lang];
  const [modul, setModul] = useState(sesi.modul);
  const [kelas, setKelas] = useState<Kelas>(sesi.kelas ?? "reguler");
  const [terbuka, setTerbuka] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tot = sesi.jenis === "tot";

  useEffect(() => {
    if (!open) return;
    setModul(sesi.modul);
    setKelas(sesi.kelas ?? "reguler");
    setErr(null);
  }, [open, sesi.modul, sesi.kelas]);
  // Which modules are open follows Module Access while the dialog is up.
  const segarAkses = useSegar(["akses"], open);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getJson<{ ok: boolean; terbuka: number[] }>("/api/session/akses?segar=1")
      .then((d) => alive && setTerbuka(d.ok ? d.terbuka : []))
      .catch(() => alive && setTerbuka([]));
    return () => {
      alive = false;
    };
  }, [open, segarAkses]);

  const gantiModul = modul !== sesi.modul;
  const gantiKelas = kelas !== (sesi.kelas ?? "reguler");

  async function simpan() {
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson<{
        ok: boolean;
        kode?: string;
        peringatan?: { id: string; layanan: string | null }[];
      }>("/api/session/ubah", {
        ...(gantiModul ? { modul } : {}),
        ...(gantiKelas ? { kelas } : {}),
      });
      if (!r.ok) {
        setErr(t.errors[r.kode ?? "gagal"] ?? t.errors.gagal);
        return;
      }
      const w = (r.peringatan ?? []).map((p) => p.layanan ?? p.id);
      window.Toast?.show(w.length ? t.warn(w.join(", ")) : t.saved, w.length ? "warn" : "ok");
      onDone();
      onOpenChange(false);
    } catch {
      setErr(t.errors.gagal);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.desc}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || (!gantiModul && !gantiKelas)}
            data-loading={busy ? "yes" : undefined}
            onClick={() => void simpan()}
          >
            {t.save}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <span className="field__label">{t.modul}</span>
          <div className="seg" role="group" aria-label={t.modul}>
            {[1, 2, 3, 4].map((m) => {
              const tutup = !tot && terbuka !== null && !terbuka.includes(m) && m !== sesi.modul;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={modul === m}
                  disabled={benar > 0 || tutup}
                  title={`${modulLabel(m, lang)} · ${MODUL_NAMA[m]}${tutup ? ` (${t.closed})` : ""}`}
                  onClick={() => setModul(m)}
                >
                  {modulLabel(m, lang)}
                </button>
              );
            })}
          </div>
          {benar > 0 ? (
            <div className="banner banner--warn" role="status">
              <WarningIcon size={18} aria-hidden="true" />
              <span>{t.lockedModul(benar)}</span>
            </div>
          ) : (
            gantiModul && <span className="hint">{t.wipe(salah)}</span>
          )}
        </div>
        <div className="field">
          <span className="field__label">{t.kelas}</span>
          <div className="seg" role="group" aria-label={t.kelas}>
            {KELAS.map((k) => (
              <button key={k} type="button" aria-pressed={kelas === k} onClick={() => setKelas(k)}>
                {kelasLabel(k, lang)}
              </button>
            ))}
          </div>
        </div>
        {err && (
          <div className="banner banner--danger" role="alert">
            <WarningIcon size={18} aria-hidden="true" />
            <span>{err}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
