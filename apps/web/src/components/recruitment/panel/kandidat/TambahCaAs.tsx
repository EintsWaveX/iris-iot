/**
 * Tambah CaAs (user, 2026-10-25): while the team's Google Form is the way in,
 * the Pencipta and the Admin tier copy each form into IRIS. Step one is the
 * account and the form's answers (POST candidate-add); step two is the PDFs,
 * downloaded from the form's Drive and uploaded here one by one
 * (candidate-ticket, the relay PUT, candidate-document), with the NIM and
 * password ready to copy into a private chat. The same dialog corrects a
 * candidate already added (`edit`); BerkasPanitia is also the candidate
 * sheet's upload list.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CheckIcon,
  CopyIcon,
  FilePdfIcon,
  KeyIcon,
  SealCheckIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Dialog from "../../../ui/Dialog";
import Dropdown from "../../../ui/Dropdown";
import SegmentedControl from "../../../ui/SegmentedControl";
import { href } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";
import {
  cekNama,
  cekNimOprec,
  cekSandi,
  NAMA_MAX,
  SANDI_MAX,
} from "../../../../lib/recruitment/akun";
import { isFail, recGet, recPost } from "../../../../lib/recruitment/client";
import { kirimBerkas } from "../../../../lib/recruitment/upload";
import { ANGKATAN_FORMULIR, cekBiodataFormulir } from "../../../../lib/recruitment/validate";
import {
  PRODI,
  type Biodata,
  type CandidateAddResponse,
  type CandidateDetailResponse,
  type DocKind,
  type DocumentResponse,
  type Prodi,
} from "../../../../lib/recruitment/types";
import { CP, DF } from "../../candidate/candidateStrings";
import { PN } from "../panelStrings";

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

/** No 0/O or 1/l/I: read off a screen and typed on a phone. */
const rentang = (a: string, b: string) =>
  Array.from({ length: b.charCodeAt(0) - a.charCodeAt(0) + 1 }, (_, i) =>
    String.fromCharCode(a.charCodeAt(0) + i),
  );
const HURUF = [...rentang("a", "z"), ...rentang("A", "Z"), ...rentang("2", "9")]
  .filter((c) => !"lIO".includes(c))
  .join("");
function sandiAcak(n = 10): string {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => HURUF[x % HURUF.length]).join("");
}

/** TT-49- for Telekomunikasi 2025: the class code's first two parts. */
const awalanKelas = (prodi: string, angkatan: string) =>
  prodi && angkatan ? `${prodi.toUpperCase()}-${48 + Number(angkatan) - 2024}-` : "";

type Dokumen = NonNullable<CandidateDetailResponse["documents"]>[number];

/** Every kind the form asks for, required first, with upload or replace. */
import { useDocRules } from "../../../../lib/recruitment/doc-rules";
export function BerkasPanitia({
  lang,
  id,
  documents,
  onChanged,
  steps = false,
}: {
  lang: Lang;
  id: number;
  documents: Dokumen[];
  onChanged: () => void;
  /** The Tambah CaAs step: two columns, "Pick a PDF", a progress bar (mockup UpRow). */
  steps?: boolean;
}) {
  const t = PN[lang].cand;
  const tt = PN[lang].tambah;
  const nama = CP[lang].docs.kind;
  const rules = useDocRules();
  const d = DF[lang].slot;
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [persen, setPersen] = useState(0);
  const [galat, setGalat] = useState<{ kind: DocKind; msg: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<DocKind | null>(null);

  async function unggah(kind: DocKind, f: File) {
    setBusy(kind);
    setPersen(0);
    setGalat(null);
    const r = await kirimBerkas(kind, f, setPersen, undefined, id, rules.maxBytes(kind));
    if (!r.ok) {
      const msg =
        r.kode === "bukan_pdf"
          ? d.notPdfHint
          : r.kode === "terlalu_besar"
            ? d.tooBigHint
            : r.kode === "jaringan"
              ? d.offline
              : r.kode === "penyimpanan_mati"
                ? d.storage
                : r.kode === "kosong"
                  ? d.empty
                  : d.other;
      setGalat({ kind, msg: `${f.name}: ${msg}` });
      setBusy(null);
      return;
    }
    if (!r.sama) {
      const done = await recPost<DocumentResponse>("candidate-document", {
        id,
        kind,
        tiket: r.tiket,
      });
      if (isFail(done)) {
        setGalat({ kind, msg: `${f.name}: ${done.kode === "bukan_pdf" ? d.notPdfHint : d.other}` });
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    window.Toast?.show(t.uploaded, "ok");
    onChanged();
  }

  /** The short name as Atur Berkas keeps it (the mockup's list), else the long built-in one. */
  const sebut = (kind: DocKind) => {
    const d = rules.docs.find((x) => x.kind === kind);
    return d ? (lang === "id" ? d.label.id : d.label.en) : nama[kind];
  };
  const picker = (
    <input
      ref={input}
      type="file"
      accept="application/pdf,.pdf"
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f && target.current) void unggah(target.current, f);
      }}
    />
  );

  if (steps)
    return (
      <>
        {picker}
        <ul className="rec9-uplist">
          {[...rules.required, ...rules.optional].map((kind) => {
            const doc = documents.find((x) => x.kind === kind);
            const opsional = rules.optional.includes(kind);
            const st =
              busy === kind
                ? "unggah"
                : galat?.kind === kind
                  ? "galat"
                  : doc
                    ? "lengkap"
                    : "kosong";
            return (
              <li key={kind} className="rec9-up" data-st={st}>
                <span className="rec9-up__ic">
                  {st === "lengkap" ? (
                    <CheckIcon size={20} />
                  ) : st === "galat" ? (
                    <WarningIcon size={20} />
                  ) : (
                    <FilePdfIcon size={20} />
                  )}
                </span>
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <b>
                    {sebut(kind)}
                    {opsional && <span className="hint"> · {t.optional}</span>}
                  </b>
                  {st === "unggah" ? (
                    <span className="rec-bar" aria-label={t.uploading(persen)}>
                      <i style={{ width: `${persen}%` }} />
                    </span>
                  ) : st === "galat" ? (
                    <span className="rec9-up__err" role="alert">
                      {galat?.msg}
                    </span>
                  ) : (
                    <span className="hint">
                      {doc ? kb(doc.size) : tt.pdfMax(Math.round(rules.maxBytes(kind) / 1048576))}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className={`btn btn--sm ${st === "kosong" || st === "galat" ? "" : "btn--ghost"}`.trim()}
                  disabled={busy !== null}
                  onClick={() => {
                    target.current = kind;
                    input.current?.click();
                  }}
                >
                  {st === "lengkap"
                    ? t.replace
                    : st === "unggah"
                      ? t.uploading(persen)
                      : tt.pilihPdf}
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );

  return (
    <div className="stack stack--sm">
      {picker}
      {[...rules.required, ...rules.optional].map((kind) => {
        const doc = documents.find((x) => x.kind === kind);
        const opsional = rules.optional.includes(kind);
        return (
          <div key={kind} className="rec-doc">
            <span className="rec-doc__ic" data-ok={doc ? "yes" : undefined}>
              <FilePdfIcon size={20} />
            </span>
            <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
              <b>
                {rules.label(kind, lang, nama[kind])}
                {opsional && <span className="hint"> · {t.optional}</span>}
              </b>
              <span className="hint rec-doc__f">
                {busy === kind ? t.uploading(persen) : doc ? kb(doc.size) : t.notUploaded}
              </span>
              {galat?.kind === kind && (
                <span className="field__error" role="alert">
                  {galat.msg}
                </span>
              )}
            </span>
            <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              {doc && (
                <a
                  className="btn btn--ghost btn--sm"
                  href={`/api/recruitment/berkas?id=${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.view}
                </a>
              )}
              <button
                type="button"
                className={`btn btn--sm ${doc ? "" : "btn--primary"}`.trim()}
                disabled={busy !== null}
                onClick={() => {
                  target.current = kind;
                  input.current?.click();
                }}
              >
                {doc ? t.replace : t.upload}
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

type Medan =
  | "nim"
  | "nama"
  | "sandi"
  | "angkatan"
  | "prodi"
  | "kelas"
  | "phone"
  | "lineId"
  | "mkIot"
  | "praktikumIot";
type Salah = Partial<Record<Medan, string>>;

interface Isian {
  nama: string;
  nim: string;
  sandi: string;
  angkatan: string;
  prodi: string;
  kelas: string;
  phone: string;
  lineId: string;
  mkIot: string;
  praktikumIot: string;
}

const yaTidak = (v: boolean | null | undefined) => (v === true ? "ya" : v === false ? "tidak" : "");

function isianDari(edit?: { nim: string; nama: string; biodata: Biodata | null }): Isian {
  const b = edit?.biodata;
  return {
    nama: edit?.nama ?? "",
    nim: edit?.nim ?? "",
    sandi: "",
    angkatan:
      b?.angkatan && (ANGKATAN_FORMULIR as readonly number[]).includes(b.angkatan)
        ? String(b.angkatan)
        : edit
          ? ""
          : String(ANGKATAN_FORMULIR[0]),
    prodi: b?.prodi ?? "",
    kelas: b?.kelas ?? "",
    phone: b?.phone ?? "",
    lineId: b?.lineId ?? "",
    mkIot: yaTidak(b?.mkIot),
    praktikumIot: yaTidak(b?.praktikumIot),
  };
}

export default function TambahCaAs({
  lang,
  open,
  onOpenChange,
  edit,
  onSaved,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Correct this candidate instead of adding one */
  edit?: { id: number; nim: string; nama: string; biodata: Biodata | null };
  onSaved: () => void;
}) {
  const t = PN[lang].tambah;
  const [f, setF] = useState<Isian>(() => isianDari(edit));
  const [salah, setSalah] = useState<Salah>({});
  const [gagal, setGagal] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);
  const [baru, setBaru] = useState<{ id: number; nim: string; nama: string; sandi: string } | null>(
    null,
  );
  const [docs, setDocs] = useState<Dokumen[]>([]);
  /** The three steps (mockup TambahDialog): the form, the PDFs, what to send. */
  const [langkah, setLangkah] = useState<"akun" | "berkas" | "selesai">("akun");
  const rules = useDocRules();

  // A fresh form each time it opens for a new candidate.
  useEffect(() => {
    if (!open) return;
    setF(isianDari(edit));
    setSalah({});
    setGagal(null);
    setBaru(null);
    setDocs([]);
    setLangkah("akun");
  }, [open, edit?.id]);

  const set = (p: Partial<Isian>) => setF((x) => ({ ...x, ...p }));
  // The class starts as the programme and batch code; typing past it keeps what was typed.
  const pilih = (p: Partial<Pick<Isian, "prodi" | "angkatan">>) =>
    setF((x) => {
      const n = { ...x, ...p };
      const lama = awalanKelas(x.prodi, x.angkatan);
      if (!x.kelas || x.kelas === lama) n.kelas = awalanKelas(n.prodi, n.angkatan);
      if (n.prodi !== "te") n.praktikumIot = "";
      return n;
    });

  const biodata = () => ({
    angkatan: f.angkatan ? Number(f.angkatan) : null,
    prodi: f.prodi as Prodi,
    kelas: f.kelas,
    phone: f.phone,
    lineId: f.lineId,
    mkIot: f.mkIot === "ya" ? true : f.mkIot === "tidak" ? false : null,
    praktikumIot: f.praktikumIot === "ya" ? true : f.praktikumIot === "tidak" ? false : null,
  });

  function periksa(): boolean {
    const s: Salah = {};
    if (!cekNama(f.nama)) s.nama = t.err.nama;
    if (!cekNimOprec(f.nim.trim())) s.nim = t.err.nim;
    if ((!edit || f.sandi) && !cekSandi(f.sandi)) s.sandi = t.err.sandi;
    const b = cekBiodataFormulir(biodata());
    if (!b.ok && b.field in t.err) s[b.field as Medan] = t.err[b.field as Medan];
    setSalah(s);
    return Object.keys(s).length === 0;
  }

  async function muatDocs(id: number) {
    const r = await recGet<CandidateDetailResponse>("candidate", { id: String(id) });
    if (!isFail(r)) setDocs(r.documents ?? []);
  }

  async function simpan(e: FormEvent) {
    e.preventDefault();
    setGagal(null);
    if (kirim || !periksa()) return;
    setKirim(true);
    const r = await recPost<CandidateAddResponse>("candidate-add", {
      nim: f.nim.trim(),
      nama: f.nama,
      ...(f.sandi ? { sandi: f.sandi } : {}),
      biodata: biodata(),
      ...(edit || baru ? { ubah: true } : {}),
    });
    setKirim(false);
    if (isFail(r)) {
      if (r.kode === "data_salah" && typeof r.field === "string" && r.field in t.err)
        return setSalah({ [r.field]: t.err[r.field as Medan] });
      if (r.kode === "sudah_daftar") return setGagal(t.err.sudahDaftar);
      if (r.kode === "akun_ada") return setGagal(t.err.akunAda);
      if (r.kode === "nim_asisten") return setSalah({ nim: t.err.nimAsisten });
      return setGagal(t.err.lain);
    }
    onSaved();
    if (edit) {
      window.Toast?.show(t.diubah, "ok");
      onOpenChange(false);
      return;
    }
    if (baru) {
      // Came back to step one after adding: the same account, corrected.
      window.Toast?.show(t.diubah, "ok");
      setBaru({ ...r.candidate, sandi: f.sandi || baru.sandi });
      setLangkah("berkas");
      return;
    }
    window.Toast?.show(t.ditambah(r.candidate.nama), "ok");
    setBaru({ ...r.candidate, sandi: f.sandi });
    setLangkah("berkas");
    void muatDocs(r.candidate.id);
  }

  const err = (k: Medan) =>
    salah[k] ? (
      <span className="field__error" role="alert">
        {salah[k]}
      </span>
    ) : null;

  const pesan = baru
    ? t.akunTeks(baru.nim, baru.sandi, `${location.host}${href(lang, "/recruitment")}`)
    : "";

  // The three steps are for a new CaAs; correcting one is the form alone.
  const tiga = !edit;
  const si = langkah === "akun" ? 0 : langkah === "berkas" ? 1 : 2;
  // As in the mockup: the main button waits for a name, a NIM and a password (a correction may keep its password).
  const okAkun =
    cekNama(f.nama) &&
    cekNimOprec(f.nim.trim()) &&
    (edit || baru ? !f.sandi || cekSandi(f.sandi) : cekSandi(f.sandi));
  const kurang = rules.required.filter((k) => !docs.some((d) => d.kind === k)).length;

  const ya = [
    { value: "ya", label: t.ya },
    { value: "tidak", label: t.tidak },
  ];

  let actions: ReactNode;
  let alt: ReactNode;
  if (langkah === "akun") {
    alt = (
      <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
        {t.batal}
      </button>
    );
    actions = (
      <button
        type="submit"
        form="rec-tambah-form"
        className="btn btn--primary"
        disabled={kirim || !okAkun}
      >
        <span className="btn__label">{kirim ? t.tunggu : edit ? t.simpanEdit : t.simpan}</span>
      </button>
    );
  } else if (langkah === "berkas") {
    alt = (
      <button type="button" className="btn btn--ghost" onClick={() => setLangkah("akun")}>
        {t.kembali}
      </button>
    );
    actions = (
      <>
        {kurang > 0 && <span className="hint">{t.kurang(kurang)}</span>}
        <button type="button" className="btn btn--primary" onClick={() => setLangkah("selesai")}>
          <span className="btn__label">{t.selesai}</span>
        </button>
      </>
    );
  } else {
    actions = (
      <button type="button" className="btn btn--primary" onClick={() => onOpenChange(false)}>
        <span className="btn__label">{t.tutup}</span>
      </button>
    );
  }

  const angkatanOpsi = ANGKATAN_FORMULIR.map((y) => ({ value: String(y), label: String(y) }));
  const prodiOpsi = [
    { value: "", label: t.pilih },
    ...PRODI.map((p) => ({ value: p, label: t.prodiNama[p] })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? t.titleEdit : t.title}
      description={edit ? t.descEdit : t.desc}
      size="form"
      lang={lang}
      alt={alt}
      actions={actions}
    >
      <div className="stack stack--lg">
        {tiga && (
          <ol className="rec9-tsteps" aria-label={t.stepsLabel}>
            {t.steps.map((s, i) => (
              <li key={s} data-st={i < si ? "done" : i === si ? "cur" : "next"}>
                <span className="num">
                  {i < si ? <CheckIcon size={14} weight="bold" /> : i + 1}
                </span>
                <b>{s}</b>
              </li>
            ))}
          </ol>
        )}

        {langkah === "akun" && (
          <form id="rec-tambah-form" className="rec-form" noValidate onSubmit={simpan}>
            {gagal && (
              <p className="banner banner--warn rec-form__wide" role="alert">
                {gagal}
              </p>
            )}
            <label className="field" data-invalid={salah.nama ? "yes" : undefined}>
              <span className="field__label">{t.nama}</span>
              <input
                className="field__input"
                value={f.nama}
                placeholder={t.ph.nama}
                maxLength={NAMA_MAX}
                autoComplete="off"
                onChange={(e) => set({ nama: e.target.value })}
              />
              {err("nama")}
            </label>
            <label className="field" data-invalid={salah.nim ? "yes" : undefined}>
              <span className="field__label">{t.nim}</span>
              <input
                className="field__input mono"
                value={f.nim}
                placeholder={t.ph.nim}
                inputMode="numeric"
                maxLength={12}
                readOnly={!!edit || !!baru}
                autoComplete="off"
                onChange={(e) => set({ nim: e.target.value.replace(/\D/g, "") })}
              />
              {err("nim") ?? <span className="hint">{t.nimHint}</span>}
            </label>
            <div className="field" data-invalid={salah.angkatan ? "yes" : undefined}>
              <span className="field__label">{t.angkatan}</span>
              <Dropdown
                id="rec-tambah-angkatan"
                label={t.angkatan}
                hideLabel
                value={f.angkatan}
                onChange={(v) => pilih({ angkatan: v })}
                options={[{ value: "", label: t.pilih }, ...angkatanOpsi]}
              />
              {err("angkatan")}
            </div>
            <div className="field" data-invalid={salah.prodi ? "yes" : undefined}>
              <span className="field__label">{t.prodi}</span>
              <Dropdown
                id="rec-tambah-prodi"
                label={t.prodi}
                hideLabel
                value={f.prodi}
                onChange={(v) => pilih({ prodi: v })}
                options={prodiOpsi}
              />
              {err("prodi")}
            </div>
            <label className="field" data-invalid={salah.kelas ? "yes" : undefined}>
              <span className="field__label">{t.kelas}</span>
              <input
                className="field__input mono"
                value={f.kelas}
                placeholder={t.ph.kelas}
                maxLength={40}
                autoComplete="off"
                onChange={(e) => set({ kelas: e.target.value.toUpperCase() })}
              />
              {err("kelas") ?? <span className="hint">{t.kelasHint}</span>}
            </label>
            <label className="field" data-invalid={salah.phone ? "yes" : undefined}>
              <span className="field__label">{t.phone}</span>
              <input
                className="field__input mono"
                value={f.phone}
                placeholder={t.ph.phone}
                inputMode="tel"
                maxLength={20}
                autoComplete="off"
                onChange={(e) => set({ phone: e.target.value })}
              />
              {err("phone")}
            </label>
            <label className="field" data-invalid={salah.lineId ? "yes" : undefined}>
              <span className="field__label">{t.line}</span>
              <input
                className="field__input"
                value={f.lineId}
                placeholder={t.ph.line}
                maxLength={40}
                autoComplete="off"
                onChange={(e) => set({ lineId: e.target.value })}
              />
              {err("lineId")}
            </label>
            <div className="field" data-invalid={salah.mkIot ? "yes" : undefined}>
              <span className="field__label">{t.mkIot}</span>
              <SegmentedControl
                aria-label={t.mkIot}
                value={f.mkIot}
                fill
                onValueChange={(v) => set({ mkIot: v })}
                options={ya}
              />
              {err("mkIot")}
            </div>
            {f.prodi === "te" && (
              <div className="field" data-invalid={salah.praktikumIot ? "yes" : undefined}>
                <span className="field__label">{t.praktikumIot}</span>
                <SegmentedControl
                  aria-label={t.praktikumIot}
                  value={f.praktikumIot}
                  fill
                  onValueChange={(v) => set({ praktikumIot: v })}
                  options={ya}
                />
                {err("praktikumIot") ?? <span className="hint">{t.praktikumHint}</span>}
              </div>
            )}
            <div className="field rec-form__wide" data-invalid={salah.sandi ? "yes" : undefined}>
              <label className="field__label" htmlFor="rec-tambah-sandi">
                {t.sandi}
              </label>
              <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <input
                  id="rec-tambah-sandi"
                  className="field__input mono"
                  style={{ flex: 1 }}
                  value={f.sandi}
                  placeholder={t.sandiPh}
                  maxLength={SANDI_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => set({ sandi: e.target.value })}
                />
                <button type="button" className="btn" onClick={() => set({ sandi: sandiAcak() })}>
                  <KeyIcon size={18} aria-hidden="true" />
                  <span className="btn__label">{t.buat}</span>
                </button>
              </span>
              {err("sandi") ?? (
                <span className="hint">{edit || baru ? t.sandiEditHint : t.sandiHint}</span>
              )}
            </div>
          </form>
        )}

        {langkah === "berkas" && baru && (
          <div className="stack stack--sm">
            <span className="hint">{t.berkasDesc(mbTerbesar(rules))}</span>
            <BerkasPanitia
              steps
              lang={lang}
              id={baru.id}
              documents={docs}
              onChanged={() => {
                void muatDocs(baru.id);
                onSaved();
              }}
            />
          </div>
        )}

        {langkah === "selesai" && baru && (
          <div className="stack">
            <div className="rec-sent">
              <span className="rec-sent__mark">
                <SealCheckIcon size={36} aria-hidden="true" />
              </span>
              <b className="rec-sent__t">{t.addedTitle(baru.nama)}</b>
              <span className="hint">{kurang > 0 ? t.kurangSelesai(kurang) : t.lengkap}</span>
            </div>
            <div className="stack stack--sm">
              <span className="eyebrow">{t.akun}</span>
              <pre className="rec9-akun">{pesan}</pre>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pesan);
                    window.Toast?.show(t.tersalin, "ok");
                  } catch {
                    /* the text is on screen to copy by hand */
                  }
                }}
              >
                <CopyIcon size={18} aria-hidden="true" />
                <span className="btn__label">{t.salin}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** The largest PDF the list allows, for the hint line. */
function mbTerbesar(rules: { docs: { maxMb: number }[] }): number {
  return rules.docs.reduce((m, d) => Math.max(m, d.maxMb), 5);
}
