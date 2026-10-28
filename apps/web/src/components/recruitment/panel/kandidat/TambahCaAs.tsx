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
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CopyIcon, FilePdfIcon } from "@phosphor-icons/react";
import Dialog from "../../../ui/Dialog";
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
}: {
  lang: Lang;
  id: number;
  documents: Dokumen[];
  onChanged: () => void;
}) {
  const t = PN[lang].cand;
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

  return (
    <div className="stack stack--sm">
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
    sandi: edit ? "" : sandiAcak(),
    angkatan:
      b?.angkatan && (ANGKATAN_FORMULIR as readonly number[]).includes(b.angkatan)
        ? String(b.angkatan)
        : "",
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

  // A fresh form each time it opens for a new candidate.
  useEffect(() => {
    if (!open) return;
    setF(isianDari(edit));
    setSalah({});
    setGagal(null);
    setBaru(null);
    setDocs([]);
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
      ...(edit ? { ubah: true } : {}),
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
    window.Toast?.show(t.ditambah(r.candidate.nama), "ok");
    setBaru({ ...r.candidate, sandi: f.sandi });
    void muatDocs(r.candidate.id);
  }

  const err = (k: Medan) =>
    salah[k] ? (
      <span className="field__error" role="alert">
        {salah[k]}
      </span>
    ) : null;

  const pesan = baru
    ? t.akunTeks(baru.nim, baru.sandi, `${location.origin}${href(lang, "/recruitment")}`)
    : "";

  if (baru)
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={baru.nama}
        description={t.berkasDesc}
        size="md"
        lang={lang}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => onOpenChange(false)}>
            <span className="btn__label">{t.selesai}</span>
          </button>
        }
      >
        <div className="stack">
          <div className="rec-note">
            <b>{t.akun}</b>
            <span className="mono" style={{ whiteSpace: "pre-line" }}>
              {pesan}
            </span>
            <span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pesan);
                    window.Toast?.show(t.tersalin, "ok");
                  } catch {
                    /* the text is on screen to copy by hand */
                  }
                }}
              >
                <CopyIcon size={16} aria-hidden="true" />
                <span className="btn__label">{t.salin}</span>
              </button>
            </span>
          </div>
          <BerkasPanitia
            lang={lang}
            id={baru.id}
            documents={docs}
            onChanged={() => {
              void muatDocs(baru.id);
              onSaved();
            }}
          />
        </div>
      </Dialog>
    );

  const ya = [
    { value: "ya", label: t.ya },
    { value: "tidak", label: t.tidak },
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? t.titleEdit : t.title}
      description={edit ? t.descEdit : t.desc}
      size="md"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button
            type="submit"
            form="rec-tambah-form"
            className="btn btn--primary"
            disabled={kirim}
          >
            <span className="btn__label">{kirim ? t.tunggu : edit ? t.simpanEdit : t.simpan}</span>
          </button>
        </>
      }
    >
      <form id="rec-tambah-form" className="stack" noValidate onSubmit={simpan}>
        {gagal && (
          <p className="banner banner--warn" role="alert">
            {gagal}
          </p>
        )}
        <label className="field" data-invalid={salah.nama ? "yes" : undefined}>
          <span className="field__label">{t.nama}</span>
          <input
            className="field__input"
            value={f.nama}
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
            inputMode="numeric"
            maxLength={12}
            readOnly={!!edit}
            autoComplete="off"
            onChange={(e) => set({ nim: e.target.value.replace(/\D/g, "") })}
          />
          {err("nim")}
        </label>
        <label className="field" data-invalid={salah.sandi ? "yes" : undefined}>
          <span className="field__label">{t.sandi}</span>
          <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <input
              className="field__input mono"
              value={f.sandi}
              maxLength={SANDI_MAX}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => set({ sandi: e.target.value })}
            />
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => set({ sandi: sandiAcak() })}
            >
              {t.buat}
            </button>
          </span>
          {err("sandi") ?? <span className="hint">{edit ? t.sandiEditHint : t.sandiHint}</span>}
        </label>
        <div className="field" data-invalid={salah.angkatan ? "yes" : undefined}>
          <span className="field__label">{t.angkatan}</span>
          <SegmentedControl
            aria-label={t.angkatan}
            value={f.angkatan}
            fill
            onValueChange={(v) => pilih({ angkatan: v })}
            options={ANGKATAN_FORMULIR.map((y) => ({ value: String(y), label: String(y) }))}
          />
          {err("angkatan")}
        </div>
        <div className="field" data-invalid={salah.prodi ? "yes" : undefined}>
          <span className="field__label">{t.prodi}</span>
          {/* Narrow, the three stack: "Telekomunikasi" must never break mid-word. */}
          <div className="rec-prodi">
            <SegmentedControl
              aria-label={t.prodi}
              value={f.prodi}
              fill
              onValueChange={(v) => pilih({ prodi: v })}
              options={PRODI.map((p) => ({ value: p, label: t.prodiNama[p] }))}
            />
          </div>
          {err("prodi")}
        </div>
        <label className="field" data-invalid={salah.kelas ? "yes" : undefined}>
          <span className="field__label">{t.kelas}</span>
          <input
            className="field__input mono"
            value={f.kelas}
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
      </form>
    </Dialog>
  );
}
