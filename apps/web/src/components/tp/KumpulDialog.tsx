/**
 * Who handed in a module's TP, and every change to the files (2026-10-15).
 * Opened from LMS › Ringkasan (the top card, Baru Masuk, a class in Per
 * Kelas) and from Penilaian's TP tab. Only the Praktikan registered in
 * IRIS count; the LMS-only students and the excluded are left out, as in
 * every count on those pages.
 */
import { useMemo, useState } from "react";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { dict, getJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { waktuPanjang } from "./shared";

interface BarisKumpul {
  nim: string;
  nama: string;
  kursus: number | null;
  status: "sudah" | "belum" | "kosong";
  pada: string | null;
  sumber: "lms" | "iris" | null;
  telat: boolean;
}
interface DataKumpul {
  ok: boolean;
  kode?: string;
  modul: number;
  kelas: { id: number; label: string }[];
  baris: BarisKumpul[];
}
interface Jejak {
  id: number;
  nim: string;
  nama: string;
  kursus: string | null;
  jenis: "baru" | "ganti" | "tarik" | "unggah";
  sumber: "lms" | "iris";
  berkas: { nama: string; ukuran: number }[];
  dikirimPada: string | null;
  dicatatPada: string;
}
interface DataJejak {
  ok: boolean;
  kode?: string;
  jejak: Jejak[];
  batas: boolean;
}

const T = dict({
  id: {
    judul: (m: number) => `Pengumpulan TP Modul ${m}`,
    desc: "Hanya Praktikan yang terdaftar di IRIS. Mahasiswa yang hanya ada di LMS tidak dihitung.",
    sudah: (n: number) => `Sudah (${n})`,
    belum: (n: number) => `Belum (${n})`,
    semua: (n: number) => `Semua (${n})`,
    tampil: "Tampilkan",
    kelas: "Kelas",
    semuaKelas: "Semua kelas",
    tanpaKelas: "Tidak ada di kelas LMS",
    cari: "Cari nama atau NIM",
    kosong: "Tidak ada yang cocok.",
    belumKumpul: "Belum mengumpulkan",
    ditandai: "Ditandai tidak mengumpulkan",
    telat: "Telat",
    diIris: "Diunggah di IRIS",
    riwayat: "Riwayat",
    tutup: "Tutup",
    jejakJudul: (m: number) => `Riwayat Pengumpulan TP Modul ${m}`,
    jejakDesc:
      "Setiap berkas baru, berkas pengganti, berkas yang ditarik di LMS, dan unggahan di IRIS, dari yang terbaru.",
    jejakSatu: (n: string) => `Riwayat pengumpulan ${n}, dari yang terbaru.`,
    jenis: {
      baru: "Mengumpulkan",
      ganti: "Mengganti berkas",
      tarik: "Menarik berkas di LMS",
      unggah: "Mengunggah di IRIS",
    },
    dikirim: (w: string) => `dikirim ${w}`,
    jejakKosong: "Belum ada perubahan yang tercatat.",
    batas: "Menampilkan 500 perubahan terbaru.",
    gagal: "Daftar ini belum bisa dibaca. Coba lagi sebentar lagi.",
  },
  en: {
    judul: (m) => `TP Modul ${m} Submissions`,
    desc: "Only Praktikan registered in IRIS. Students who are only in the LMS aren't counted.",
    sudah: (n) => `Handed In (${n})`,
    belum: (n) => `Not Yet (${n})`,
    semua: (n) => `All (${n})`,
    tampil: "Show",
    kelas: "Class",
    semuaKelas: "All classes",
    tanpaKelas: "In no LMS class",
    cari: "Search a name or NIM",
    kosong: "Nothing matches.",
    belumKumpul: "Not handed in",
    ditandai: "Marked as not handed in",
    telat: "Late",
    diIris: "Uploaded in IRIS",
    riwayat: "History",
    tutup: "Close",
    jejakJudul: (m) => `TP Modul ${m} Submission History`,
    jejakDesc:
      "Every new file, replaced file, file taken back in the LMS and upload in IRIS, newest first.",
    jejakSatu: (n) => `${n}'s submission history, newest first.`,
    jenis: {
      baru: "Handed in",
      ganti: "Replaced the file",
      tarik: "Took the file back in the LMS",
      unggah: "Uploaded in IRIS",
    },
    dikirim: (w) => `sent ${w}`,
    jejakKosong: "No changes recorded yet.",
    batas: "Showing the newest 500 changes.",
    gagal: "This list can't be read yet. Try again in a moment.",
  },
  zh: {
    judul: (m) => `模块 ${m} 预习作业提交情况`,
    desc: "只包括在 IRIS 注册的学生。只在 LMS 中的学生不计入。",
    sudah: (n) => `已提交（${n}）`,
    belum: (n) => `未提交（${n}）`,
    semua: (n) => `全部（${n}）`,
    tampil: "显示",
    kelas: "班级",
    semuaKelas: "所有班级",
    tanpaKelas: "不在任何 LMS 班级",
    cari: "搜索姓名或学号",
    kosong: "没有匹配的结果。",
    belumKumpul: "未提交",
    ditandai: "已标记为未提交",
    telat: "迟交",
    diIris: "在 IRIS 上传",
    riwayat: "记录",
    tutup: "关闭",
    jejakJudul: (m) => `模块 ${m} 预习作业提交记录`,
    jejakDesc: "每个新文件、替换的文件、在 LMS 撤回的文件以及在 IRIS 的上传，按时间从新到旧。",
    jejakSatu: (n) => `${n} 的提交记录，按时间从新到旧。`,
    jenis: {
      baru: "提交",
      ganti: "替换文件",
      tarik: "在 LMS 撤回文件",
      unggah: "在 IRIS 上传",
    },
    dikirim: (w) => `发送于 ${w}`,
    jejakKosong: "还没有记录到变化。",
    batas: "显示最新的 500 条变化。",
    gagal: "暂时无法读取此列表。请稍后再试。",
  },
});

type Tampil = "sudah" | "belum" | "semua";

/** Who handed in, by class, with a search; a row opens its history. */
export function KumpulDialog({
  open,
  onOpenChange,
  lang,
  modul,
  kursus = null,
  tampil: tampilAwal = "belum",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  modul: number;
  /** a class to start on (its LMS course id) */
  kursus?: number | null;
  tampil?: Tampil;
}) {
  const t = T[lang];
  const poll = usePoll(
    () => getJson<DataKumpul>(`/api/lms/kumpul?modul=${modul}`),
    60_000,
    open,
    ["tp"],
    0,
    `${modul}`,
  );
  const [tampil, setTampil] = useState<Tampil>(tampilAwal);
  const [kelas, setKelas] = useState(kursus === null ? "semua" : String(kursus));
  const [cari, setCari] = useState("");
  const [riwayat, setRiwayat] = useState<{ nim: string; nama: string } | null>(null);
  const d = poll.data;
  const labelOf = useMemo(() => new Map((d?.kelas ?? []).map((k) => [k.id, k.label])), [d]);
  const diKelas = (d?.baris ?? []).filter(
    (b) =>
      kelas === "semua" || (kelas === "tanpa" ? b.kursus === null : String(b.kursus) === kelas),
  );
  const q = cari.trim().toLowerCase();
  const cocok = diKelas.filter((b) => !q || b.nama.toLowerCase().includes(q) || b.nim.includes(q));
  const n = {
    sudah: cocok.filter((b) => b.status === "sudah").length,
    belum: cocok.filter((b) => b.status !== "sudah").length,
  };
  const baris = cocok.filter(
    (b) => tampil === "semua" || (tampil === "sudah" ? b.status === "sudah" : b.status !== "sudah"),
  );
  const adaTanpa = (d?.baris ?? []).some((b) => b.kursus === null);
  return (
    <>
      <Dialog
        open={open && !riwayat}
        onOpenChange={onOpenChange}
        title={t.judul(modul)}
        description={t.desc}
        size="lg"
        lang={lang}
        actions={
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.tutup}
          </button>
        }
      >
        {!d ? (
          <span className="skeleton" style={{ height: 320 }} />
        ) : !d.ok ? (
          <p className="banner banner--warn">{t.gagal}</p>
        ) : (
          <div className="stack">
            <div className="kumpul-bar">
              <Dropdown
                id="kumpul-kelas"
                label={t.kelas}
                value={kelas}
                onChange={setKelas}
                options={[
                  { value: "semua", label: t.semuaKelas },
                  ...d.kelas.map((k) => ({ value: String(k.id), label: k.label })),
                  ...(adaTanpa ? [{ value: "tanpa", label: t.tanpaKelas }] : []),
                ]}
              />
              <label className="field">
                <span className="field__label">{t.cari}</span>
                <input
                  className="field__input"
                  value={cari}
                  inputMode="search"
                  onChange={(e) => setCari(e.target.value)}
                />
              </label>
            </div>
            <SegmentedControl
              aria-label={t.tampil}
              fill
              value={tampil}
              onValueChange={(v) => setTampil(v as Tampil)}
              options={[
                { value: "belum", label: t.belum(n.belum) },
                { value: "sudah", label: t.sudah(n.sudah) },
                { value: "semua", label: t.semua(cocok.length) },
              ]}
            />
            {baris.length ? (
              <ul className="kumpul-list">
                {baris.map((b) => (
                  <li key={b.nim} data-status={b.status}>
                    <span className="kumpul-list__who">
                      <b>{b.nama}</b>
                      <span className="hint mono">
                        {b.nim}
                        {b.kursus !== null
                          ? ` · ${labelOf.get(b.kursus) ?? ""}`
                          : ` · ${t.tanpaKelas}`}
                      </span>
                    </span>
                    <span className="kumpul-list__st">
                      {b.status === "sudah" ? (
                        <>
                          <span className="hint">{b.pada ? waktuPanjang(b.pada, lang) : ""}</span>
                          {b.telat && <Pill tone="warn">{t.telat}</Pill>}
                          {b.sumber === "iris" && <Pill tone="accent">{t.diIris}</Pill>}
                        </>
                      ) : (
                        <Pill tone={b.status === "kosong" ? "danger" : undefined}>
                          {b.status === "kosong" ? t.ditandai : t.belumKumpul}
                        </Pill>
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setRiwayat({ nim: b.nim, nama: b.nama })}
                    >
                      {t.riwayat}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{t.kosong}</p>
            )}
          </div>
        )}
      </Dialog>
      {riwayat && (
        <JejakDialog
          open
          onOpenChange={(v) => !v && setRiwayat(null)}
          lang={lang}
          modul={modul}
          nim={riwayat.nim}
          nama={riwayat.nama}
        />
      )}
    </>
  );
}

/** Every change to the files, newest first; one Praktikan's, or all. */
export function JejakDialog({
  open,
  onOpenChange,
  lang,
  modul,
  nim,
  nama,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  modul: number;
  nim?: string;
  nama?: string;
}) {
  const t = T[lang];
  const url = `/api/lms/jejak?modul=${modul}${nim ? `&nim=${encodeURIComponent(nim)}` : ""}`;
  const poll = usePoll(() => getJson<DataJejak>(url), 60_000, open, ["tp"], 0, url);
  const [kelas, setKelas] = useState("semua");
  const [cari, setCari] = useState("");
  const d = poll.data;
  const kelasAda = [...new Set((d?.jejak ?? []).map((j) => j.kursus).filter(Boolean))] as string[];
  const q = cari.trim().toLowerCase();
  const rows = (d?.jejak ?? []).filter(
    (j) =>
      (kelas === "semua" || j.kursus === kelas) &&
      (!q || j.nama.toLowerCase().includes(q) || j.nim.includes(q)),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.jejakJudul(modul)}
      description={nim ? t.jejakSatu(`${nama ?? nim} (${nim})`) : t.jejakDesc}
      size="lg"
      lang={lang}
      actions={
        <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
          {t.tutup}
        </button>
      }
    >
      {!d ? (
        <span className="skeleton" style={{ height: 320 }} />
      ) : !d.ok ? (
        <p className="banner banner--warn">{t.gagal}</p>
      ) : (
        <div className="stack">
          {!nim && (
            <div className="kumpul-bar">
              <Dropdown
                id="jejak-kelas"
                label={t.kelas}
                value={kelas}
                onChange={setKelas}
                options={[
                  { value: "semua", label: t.semuaKelas },
                  ...kelasAda.sort().map((k) => ({ value: k, label: k })),
                ]}
              />
              <label className="field">
                <span className="field__label">{t.cari}</span>
                <input
                  className="field__input"
                  value={cari}
                  inputMode="search"
                  onChange={(e) => setCari(e.target.value)}
                />
              </label>
            </div>
          )}
          {rows.length ? (
            <ol className="jejak-list">
              {rows.map((j) => (
                <li key={j.id} data-jenis={j.jenis}>
                  <span className="mono jejak-list__t">{waktuPanjang(j.dicatatPada, lang)}</span>
                  <span className="jejak-list__what">
                    <b>{nim ? t.jenis[j.jenis] : `${j.nama} · ${t.jenis[j.jenis]}`}</b>
                    <span className="hint">
                      {[
                        !nim ? `${j.nim}${j.kursus ? ` · ${j.kursus}` : ""}` : j.kursus,
                        j.berkas.map((b) => b.nama).join(", "),
                        j.dikirimPada && j.dikirimPada.slice(0, 16) !== j.dicatatPada.slice(0, 16)
                          ? t.dikirim(waktuPanjang(j.dikirimPada, lang))
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">{t.jejakKosong}</p>
          )}
          {d.batas && <p className="hint">{t.batas}</p>}
        </div>
      )}
    </Dialog>
  );
}
