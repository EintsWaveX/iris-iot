/**
 * Daftar, the application (prompt 03, PRD 5.3, mockup r1-daftar): a dialog
 * over the /recruitment page in three steps. Biodata (name and NIM from the
 * account, the rest typed, the motivation one sentence of up to 140
 * characters), Berkas (CV, Surat Lamaran, Visi Misi: PDF only, 5 MB each,
 * sent straight to R2 with a progress bar, each slot with its own error),
 * and Persetujuan (a summary and the consent as a Checkbox naming the six
 * month deletion). Closing keeps what was filled in, uploads included: this
 * component stays mounted, only its dialog opens and closes.
 *
 * The server checks everything again; its answers (a closed gate, a stale
 * ticket, a field) come back to the step they belong to.
 */
import { useRef, useState } from "react";
import {
  CheckIcon,
  FilePdfIcon,
  SealCheckIcon,
  UploadSimpleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import Dropdown from "../../ui/Dropdown";
import Fade from "../../ui/Fade";
import { Checkbox } from "../../ui/Controls";
import { href } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import { kirimBerkas, periksaLokal, type UploadFail } from "../../../lib/recruitment/upload";
import { cekBiodata } from "../../../lib/recruitment/validate";
import {
  DOC_REQUIRED,
  type ApplyResponse,
  type DocKind,
  type OprecAccount,
} from "../../../lib/recruitment/types";
import { tgl } from "../shared";
import { CP, DF } from "./candidateStrings";

type Step = "biodata" | "berkas" | "setuju" | "terkirim";
const STEPS: Exclude<Step, "terkirim">[] = ["biodata", "berkas", "setuju"];
const TIKET_BASI_MS = 20 * 60_000;
const TAHUN = [2023, 2024, 2025, 2026];

interface Slot {
  st: "kosong" | "unggah" | "lengkap" | "galat";
  nama?: string;
  ukuran?: number;
  persen: number;
  tiket?: string;
  at?: number;
  galat?: { judul: string; hint: string };
}
const KOSONG: Slot = { st: "kosong", persen: 0 };

interface Form {
  angkatan: string;
  kelas: string;
  phone: string;
  lineId: string;
  address: string;
  motivation: string;
}

function galatUnggah(k: UploadFail, nama: string, lang: Lang) {
  const t = DF[lang].slot;
  switch (k) {
    case "bukan_pdf":
      return { judul: t.notPdf(nama), hint: t.notPdfHint };
    case "terlalu_besar":
      return { judul: t.tooBig(nama), hint: t.tooBigHint };
    case "kosong":
      return { judul: nama, hint: t.empty };
    case "jendela_tutup":
      return { judul: nama, hint: t.closed };
    case "status_salah":
      return { judul: nama, hint: t.status };
    case "penyimpanan_mati":
      return { judul: nama, hint: t.storage };
    case "tiket_salah":
      return { judul: nama, hint: t.ticket };
    case "jaringan":
      return { judul: nama, hint: t.offline };
    default:
      return { judul: nama, hint: t.other };
  }
}

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

function Slotnya({
  kind,
  slot,
  lang,
  onFile,
  templateUrl,
}: {
  kind: DocKind;
  slot: Slot;
  lang: Lang;
  onFile: (f: File) => void;
  templateUrl?: string;
}) {
  const t = DF[lang].slot;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pilih = () => input.current?.click();
  return (
    <div className="rec-slot" data-st={slot.st}>
      <div className="rec-slot__head">
        <b>{CP[lang].docs.kind[kind]}</b>
        {templateUrl && (
          <a className="rec-link" href={templateUrl} download>
            {t.template}
          </a>
        )}
      </div>
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
          if (f) onFile(f);
        }}
      />
      {slot.st === "lengkap" ? (
        <div className="rec-slot__file">
          <span className="rec-doc__ic" data-ok="yes">
            <CheckIcon size={18} weight="bold" />
          </span>
          <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
            <span className="rec-doc__f">{slot.nama}</span>
            <span className="hint">{kb(slot.ukuran ?? 0)}</span>
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={pilih}>
            {t.replace}
          </button>
        </div>
      ) : slot.st === "unggah" ? (
        <div className="rec-slot__file">
          <span className="rec-doc__ic">
            <FilePdfIcon size={20} />
          </span>
          <span className="stack" style={{ gap: 6, minWidth: 0, flex: 1 }}>
            <span className="rec-doc__f">{slot.nama}</span>
            <span
              className="rec-bar"
              role="progressbar"
              aria-valuenow={slot.persen}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${slot.persen}%` }} />
            </span>
          </span>
          <span className="hint num">{slot.persen}%</span>
        </div>
      ) : (
        <button
          type="button"
          className="rec-slot__drop"
          data-bad={slot.st === "galat" ? "yes" : undefined}
          data-over={over ? "yes" : undefined}
          onClick={pilih}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          {slot.st === "galat" ? (
            <WarningIcon size={24} aria-hidden="true" />
          ) : (
            <UploadSimpleIcon size={24} aria-hidden="true" />
          )}
          <b>{slot.st === "galat" ? slot.galat?.judul : t.drop}</b>
          <span className="hint">{slot.st === "galat" ? slot.galat?.hint : t.hint}</span>
        </button>
      )}
    </div>
  );
}

export default function Daftar({
  lang,
  open,
  onOpenChange,
  me,
  closesOn,
  onApplied,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The oprec account applying */
  me: OprecAccount;
  /** The last day of registration, for the confirmation line */
  closesOn: string | null;
  onApplied: () => void;
}) {
  const t = DF[lang];
  const [step, setStep] = useState<Step>("biodata");
  const [form, setForm] = useState<Form>({
    angkatan: "",
    kelas: "",
    phone: "",
    lineId: "",
    address: "",
    motivation: "",
  });
  const [slots, setSlots] = useState<Record<string, Slot>>(() =>
    Object.fromEntries(DOC_REQUIRED.map((k) => [k, KOSONG])),
  );
  const [salah, setSalah] = useState<Record<string, string>>({});
  const [setuju, setSetuju] = useState(false);
  const [kirim, setKirim] = useState(false);
  const [gagal, setGagal] = useState<string | null>(null);
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const setSlot = (k: DocKind, p: Partial<Slot>) =>
    setSlots((s) => ({ ...s, [k]: { ...s[k], ...p } }));

  const semuaMasuk = DOC_REQUIRED.every((k) => slots[k].st === "lengkap");
  const si = STEPS.indexOf(step as (typeof STEPS)[number]);

  const bioPayload = () => ({
    angkatan: Number(form.angkatan),
    kelas: form.kelas,
    phone: form.phone,
    lineId: form.lineId,
    address: form.address,
    motivation: form.motivation,
  });

  const periksaBio = (): boolean => {
    const r = cekBiodata(bioPayload());
    if (r.ok) {
      setSalah({});
      return true;
    }
    setSalah({ [r.field]: t.err[r.field as keyof typeof t.err] ?? t.fail.field });
    return false;
  };

  async function pilihFile(kind: DocKind, f: File) {
    setSlot(kind, { st: "unggah", nama: f.name, ukuran: f.size, persen: 0, galat: undefined });
    const lokal = await periksaLokal(f);
    if (lokal) {
      setSlot(kind, { st: "galat", galat: galatUnggah(lokal, f.name, lang), tiket: undefined });
      return;
    }
    const r = await kirimBerkas(kind, f, (p) => setSlot(kind, { persen: p }));
    if (r.ok)
      setSlot(kind, {
        st: "lengkap",
        persen: 100,
        tiket: r.sama ? "sama" : r.tiket,
        at: Date.now(),
      });
    else setSlot(kind, { st: "galat", galat: galatUnggah(r.kode, f.name, lang), tiket: undefined });
  }

  async function kirimDaftar() {
    if (!setuju) {
      setGagal(t.err.consent);
      return;
    }
    if (!periksaBio()) {
      setStep("biodata");
      return;
    }
    // A ticket outlives the relay's PUT address by minutes, not hours: an old one means upload again.
    const basi = DOC_REQUIRED.filter((k) => Date.now() - (slots[k].at ?? 0) > TIKET_BASI_MS);
    if (basi.length) {
      basi.forEach((k) => setSlot(k, { ...KOSONG }));
      setGagal(t.fail.missing);
      setStep("berkas");
      return;
    }
    setKirim(true);
    setGagal(null);
    const r = await recPost<ApplyResponse>("apply", {
      biodata: bioPayload(),
      docs: DOC_REQUIRED.map((kind) => ({ kind, tiket: slots[kind].tiket })),
      consent: true,
    });
    setKirim(false);
    if (!isFail(r)) {
      setStep("terkirim");
      onApplied();
      return;
    }
    if (r.kode === "jendela_tutup") setGagal(t.fail.closed);
    else if (r.kode === "sudah_daftar") setGagal(t.fail.already);
    else if (r.kode === "berkas_kurang" || r.kode === "tiket_salah") {
      DOC_REQUIRED.forEach((k) => setSlot(k, { ...KOSONG }));
      setGagal(t.fail.missing);
      setStep("berkas");
    } else if (r.kode === "data_salah" && typeof r.field === "string" && r.field !== "consent") {
      setSalah({ [r.field]: t.err[r.field as keyof typeof t.err] ?? t.fail.field });
      setStep("biodata");
    } else setGagal(t.fail.other);
  }

  const lanjut = () => {
    setGagal(null);
    if (step === "biodata" && !periksaBio()) return;
    if (step === "biodata") setStep("berkas");
    else if (step === "berkas" && semuaMasuk) setStep("setuju");
    else if (step === "setuju") void kirimDaftar();
  };

  const depan = me.nama.split(" ")[0] ?? me.nama;

  if (step === "terkirim") {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t.sent.title}
        size="md"
        lang={lang}
        actions={
          <a
            className="btn btn--primary"
            href={href(lang, "/recruitment")}
            onClick={() => onOpenChange(false)}
          >
            <span className="btn__label">{t.sent.journey}</span>
          </a>
        }
      >
        <div className="rec-sent">
          <span className="rec-sent__mark">
            <SealCheckIcon size={40} weight="duotone" aria-hidden="true" />
          </span>
          <b className="rec-sent__t">{t.sent.welcome(depan)}</b>
          <span className="hint">
            {closesOn ? t.sent.body(tgl(closesOn, lang)) : t.sent.bodyNoDate}
          </span>
        </div>
      </Dialog>
    );
  }

  const lede = (k: keyof Form) =>
    salah[k] ? (
      <span className="field__error" role="alert">
        {salah[k]}
      </span>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.desc}
      size="lg"
      lang={lang}
      actions={
        <>
          {si > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => setStep(STEPS[si - 1])}>
              {t.back}
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
              {t.later}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={
              (step === "berkas" && !semuaMasuk) || (step === "setuju" && (!setuju || kirim))
            }
            onClick={lanjut}
          >
            <span className="btn__label">
              {step === "setuju" ? (kirim ? t.sending : t.sendBtn) : t.next}
            </span>
          </button>
        </>
      }
    >
      <div className="stack stack--lg">
        <ol className="rec-steps" aria-label={t.stepsLabel}>
          {STEPS.map((s, i) => (
            <li
              key={s}
              data-st={i < si ? "done" : i === si ? "cur" : "next"}
              aria-current={i === si ? "step" : undefined}
            >
              <span className="num">{i < si ? <CheckIcon size={14} weight="bold" /> : i + 1}</span>
              <b>{t.steps[s]}</b>
            </li>
          ))}
        </ol>
        {gagal && (
          <p className="banner banner--warn" role="alert">
            {gagal}
          </p>
        )}
        <Fade k={step}>
          {step === "biodata" ? (
            <div className="rec-form">
              <div className="rec-who rec-form__wide">
                <span className="stack" style={{ gap: 0 }}>
                  <b>{me.nama}</b>
                  <span className="hint mono">{me.nim}</span>
                </span>
                <span className="hint">{t.who}</span>
              </div>
              <div className="field" data-invalid={salah.angkatan ? "yes" : undefined}>
                <span className="field__label" id="daftar-angkatan">
                  {t.year}
                </span>
                <Dropdown
                  id="daftar-angkatan-dd"
                  label={t.year}
                  hideLabel
                  value={form.angkatan}
                  onChange={(v) => set({ angkatan: v })}
                  options={[
                    { value: "", label: t.pick, disabled: true },
                    ...TAHUN.map((y) => ({ value: String(y), label: String(y) })),
                  ]}
                />
                {lede("angkatan")}
              </div>
              <label className="field" data-invalid={salah.kelas ? "yes" : undefined}>
                <span className="field__label">{t.kelas}</span>
                <input
                  className="field__input"
                  value={form.kelas}
                  maxLength={40}
                  placeholder="TK-48-01"
                  onChange={(e) => set({ kelas: e.target.value })}
                />
                {lede("kelas")}
              </label>
              <label className="field" data-invalid={salah.phone ? "yes" : undefined}>
                <span className="field__label">{t.phone}</span>
                <input
                  className="field__input mono"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
                {lede("phone")}
              </label>
              <label className="field" data-invalid={salah.lineId ? "yes" : undefined}>
                <span className="field__label">{t.line}</span>
                <input
                  className="field__input"
                  value={form.lineId}
                  maxLength={40}
                  onChange={(e) => set({ lineId: e.target.value })}
                />
                <span className="field__hint">{t.lineHint}</span>
                {lede("lineId")}
              </label>
              <label className="field" data-invalid={salah.address ? "yes" : undefined}>
                <span className="field__label">{t.address}</span>
                <input
                  className="field__input"
                  value={form.address}
                  maxLength={300}
                  onChange={(e) => set({ address: e.target.value })}
                />
                {lede("address")}
              </label>
              <label
                className="field rec-form__wide"
                data-invalid={salah.motivation ? "yes" : undefined}
              >
                <span className="field__label">{t.motivation}</span>
                <input
                  className="field__input"
                  maxLength={140}
                  value={form.motivation}
                  onChange={(e) => set({ motivation: e.target.value.replace(/[\r\n]/g, " ") })}
                />
                <span className="hint num rec-form__count">{form.motivation.length}/140</span>
                {lede("motivation")}
              </label>
            </div>
          ) : step === "berkas" ? (
            <div className="stack">
              {DOC_REQUIRED.map((k) => (
                <Slotnya
                  key={k}
                  kind={k}
                  slot={slots[k]}
                  lang={lang}
                  onFile={(f) => void pilihFile(k, f)}
                />
              ))}
              {!semuaMasuk && <span className="hint">{t.docsWait}</span>}
            </div>
          ) : (
            <div className="stack">
              <div className="rec-sum">
                {(
                  [
                    [t.sum.name, me.nama],
                    [t.sum.nim, me.nim],
                    [t.sum.kelas, form.kelas],
                    [t.sum.year, form.angkatan],
                    [t.sum.wa, form.phone],
                    [t.sum.line, form.lineId],
                    [t.sum.docs, t.sum.threePdf],
                  ] as const
                ).map(([k, v]) => (
                  <span key={k} style={{ display: "contents" }}>
                    <span className="hint">{k}</span>
                    <b>{v}</b>
                  </span>
                ))}
              </div>
              <Checkbox checked={setuju} onChange={setSetuju} label={t.consent} />
            </div>
          )}
        </Fade>
      </div>
    </Dialog>
  );
}
