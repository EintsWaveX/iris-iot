/**
 * Tambah Praktikan (2026-10-06): put a student who isn't in the running
 * session into one of its groups, so they can sign in. Before, a late or
 * misplaced Praktikan read "NIM ini tidak ada di roster sesi yang berjalan.
 * Tanyakan ke asistenmu" and the Asisten had no way to help short of ending
 * the session (a running roster can't be edited).
 *
 * The NIM finds the name in the semester's Praktikan list; a NIM that isn't
 * there asks for the name and is added to the list too. The weekly roster
 * is left as it is (POST /api/session/hadir { aksi: "tambah" }).
 */
import { useEffect, useMemo, useState } from "react";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import { dict, getJson, postJson } from "../../lib/app";
import { kelompokLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { useSegar } from "../../lib/siaran";

const T = dict({
  id: {
    title: "Tambah Praktikan ke Sesi",
    desc: "Untuk praktikan yang belum ada di sesi ini. Setelah ditambah, dia bisa masuk dengan NIM dan kode sesi.",
    nim: "NIM",
    nimPh: "contoh: 1101223001",
    found: (n: string) => `Terdaftar sebagai ${n}.`,
    notFound:
      "NIM ini belum ada di daftar praktikan semester ini. Isi namanya, sekalian didaftarkan.",
    nama: "Nama lengkap",
    group: "Kelompok",
    cancel: "Batal",
    add: (k: string) => `Masukkan ke ${k}`,
    added: (n: string, k: string) => `${n} masuk ${k}. Dia bisa masuk sekarang.`,
    errors: {
      sudah_di_kelompok: (k: string) =>
        `NIM ini sudah ada di ${k}. Untuk memindahnya, seret kartunya ke kelompok lain.`,
      perlu_nama: "Isi nama lengkapnya dulu.",
      nim_salah: "NIM praktikan berisi 10 atau 12 angka.",
      kelompok_mati: "Kelompok itu tidak jalan di sesi ini. Pilih kelompok lain.",
      tanpa_hak: "Menambah praktikan ke sesi butuh hak memasangkan kelompok.",
      gagal: "Belum tersimpan. Coba lagi.",
    } as Record<string, string | ((k: string) => string)>,
  },
  en: {
    title: "Add a Student to the Session",
    desc: "For a student who isn't in this session yet. Once added, they sign in with their NIM and the session code.",
    nim: "NIM",
    nimPh: "e.g. 1101223001",
    found: (n: string) => `Registered as ${n}.`,
    notFound:
      "This NIM isn't on this semester's student list. Enter the name and it's added there too.",
    nama: "Full name",
    group: "Group",
    cancel: "Cancel",
    add: (k: string) => `Put in ${k}`,
    added: (n: string, k: string) => `${n} is in ${k} and can sign in now.`,
    errors: {
      sudah_di_kelompok: (k: string) =>
        `This NIM is already in ${k}. To move them, drag their card to another group.`,
      perlu_nama: "Enter the full name first.",
      nim_salah: "A student NIM has 10 or 12 digits.",
      kelompok_mati: "That group isn't running in this session. Pick another.",
      tanpa_hak: "Adding students to a session needs the group pairing right.",
      gagal: "Not saved. Try again.",
    } as Record<string, string | ((k: string) => string)>,
  },
  zh: {
    title: "把学生加入这节课",
    desc: "用于还不在这节课名单上的学生。加入后，他可以用 NIM 和签到码登录。",
    nim: "NIM",
    nimPh: "例如 1101223001",
    found: (n: string) => `已登记为 ${n}。`,
    notFound: "这个 NIM 不在本学期的学生名单里。填上姓名，会一起登记。",
    nama: "全名",
    group: "小组",
    cancel: "取消",
    add: (k: string) => `加入${k}`,
    added: (n: string, k: string) => `${n} 已加入${k}，现在可以登录。`,
    errors: {
      sudah_di_kelompok: (k: string) => `这个 NIM 已经在${k}。要移动，把他的卡片拖到别的小组。`,
      perlu_nama: "先填全名。",
      nim_salah: "学生 NIM 是 10 位或 12 位数字。",
      kelompok_mati: "那个小组这节课没有进行。请选别的。",
      tanpa_hak: "把学生加入这节课需要分组的权限。",
      gagal: "没有保存。再试一次。",
    } as Record<string, string | ((k: string) => string)>,
  },
});

export default function TambahPraktikan({
  lang,
  open,
  onOpenChange,
  groups,
  onAdded,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The session's groups; only the running ones can take someone. */
  groups: { nomor: number; aktif: boolean }[];
  onAdded: () => void;
}) {
  const t = T[lang];
  const [daftar, setDaftar] = useState<Map<string, string> | null>(null);
  const [nim, setNim] = useState("");
  const [nama, setNama] = useState("");
  const jalan = groups.filter((g) => g.aktif);
  const [ke, setKe] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNim("");
    setNama("");
    setErr(null);
    setKe(String(jalan[0]?.nomor ?? ""));
  }, [open]);
  // The semester list, again when a roster changes while this is open.
  const segar = useSegar(["roster"], open);
  useEffect(() => {
    if (!open) return;
    getJson<{ ok: boolean; praktikan: { nim: string; nama: string }[] }>("/api/session/praktikan")
      .then((d) => setDaftar(new Map((d.ok ? d.praktikan : []).map((p) => [p.nim, p.nama]))))
      .catch(() => setDaftar(new Map()));
  }, [open, segar]);

  const bersih = nim.replace(/\D/g, "");
  // A NIM on the semester's list counts whatever its length; a new one
  // must have the 10 or 12 digits a student NIM has.
  const dikenal = daftar?.get(bersih) ?? null;
  const lengkap = !!dikenal || /^\d{10}(\d{2})?$/.test(bersih);
  const perluNama = lengkap && daftar !== null && !dikenal;
  const label = useMemo(() => (ke ? kelompokLabel(Number(ke), lang) : ""), [ke, lang]);
  const bisa = lengkap && !!ke && (!perluNama || nama.trim().length >= 2) && !busy;

  async function simpan() {
    if (!bisa) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson<{ ok: boolean; kode?: string; nomor?: number; nama?: string }>(
        "/api/session/hadir",
        { aksi: "tambah", nim: bersih, ke: Number(ke), nama: perluNama ? nama : undefined },
      );
      if (!r.ok) {
        const e = t.errors[r.kode ?? "gagal"] ?? t.errors.gagal;
        setErr(typeof e === "function" ? e(r.nomor ? kelompokLabel(r.nomor, lang) : label) : e);
        return;
      }
      window.Toast?.show(t.added(r.nama ?? bersih, label), "ok");
      onAdded();
      onOpenChange(false);
    } catch {
      setErr(t.errors.gagal as string);
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
            disabled={!bisa}
            data-loading={busy ? "yes" : undefined}
            onClick={() => void simpan()}
          >
            {label ? t.add(label) : t.add("")}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field" data-invalid={err ? "yes" : undefined}>
          <span className="field__label">{t.nim}</span>
          <input
            className="field__input mono"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={14}
            placeholder={t.nimPh}
            value={nim}
            onChange={(e) => {
              setNim(e.target.value);
              setErr(null);
            }}
          />
          {dikenal ? (
            <span className="field__hint">{t.found(dikenal)}</span>
          ) : perluNama ? (
            <span className="field__hint">{t.notFound}</span>
          ) : null}
        </label>
        {perluNama && (
          <label className="field">
            <span className="field__label">{t.nama}</span>
            <input
              className="field__input"
              autoComplete="off"
              maxLength={120}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
            />
          </label>
        )}
        <Dropdown
          id="tambah-ke"
          label={t.group}
          value={ke}
          onChange={setKe}
          options={jalan.map((g) => ({
            value: String(g.nomor),
            label: kelompokLabel(g.nomor, lang),
          }))}
        />
        {err && (
          <p className="field__error" role="alert">
            {err}
          </p>
        )}
      </div>
    </Dialog>
  );
}
