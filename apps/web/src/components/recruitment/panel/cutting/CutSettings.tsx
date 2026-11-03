/**
 * Cutting's two edit surfaces (mockup n7-cutting, 28 Oct 2026), for the Ketua
 * and Akademik:
 * - Atur Titik Awal: where the Cutting of Berkas and Tes Tulis starts (Top N,
 *   minimum score) and how many the deck aims to pass.
 * - Ubah Teks Amplop: the heading and the lines for passed and not passed of
 *   each envelope, in both languages, with a preview. An empty box keeps the
 *   built-in text; Kembalikan Bawaan clears one envelope.
 * Both save through the settings API (audited with before and after).
 */
import { useState } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import Dialog from "../../../ui/Dialog";
import SegmentedControl from "../../../ui/SegmentedControl";
import TabLine from "../../../ui/TabLine";
import { Stepper } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import {
  CUTTING_DEFAULT,
  type CuttingStageKey,
  WORD_FIELDS,
  WORD_MAX,
  cuttingFor,
  isiNama,
  type CuttingSetting,
  type SettingMap,
  type WordField,
  type WordSide,
} from "../../../../lib/recruitment/settings";
import { S2 } from "../../s2Strings";

const T = {
  id: {
    cancel: "Batal",
    save: "Simpan",
    reset: "Kembalikan Bawaan",
    fail: "Belum tersimpan. Coba lagi.",
    less: "Kurangi",
    more: "Tambah",
    start: {
      title: "Titik Awal Cutting",
      desc: "Garis potong dibuka dari angka-angka ini. Pleno tetap memutuskan siapa yang lanjut. Hanya Ketua dan Akademik yang mengubahnya.",
      topLabel: "Teratas N",
      topHint: "Berapa yang lolos saat garis dibuka dengan cara Teratas N.",
      minLabel: "Nilai minimal",
      minHint: "Nilai terendah yang lolos saat garis dibuka dengan Nilai Minimal.",
      tgtMinLabel: "Target lolos: paling sedikit",
      tgtMinHint: "Berapa kandidat yang diharapkan lanjut ke tahap berikutnya.",
      tgtMinHintTes: "Berapa kandidat yang diharapkan lanjut ke Wawancara.",
      tgtMaxLabel: "Target lolos: paling banyak",
      apply: "Pakai di Garis Potong",
      done: "Selesai",
      restore: "Kembalikan Bawaan",
      short: {
        berkas: "Berkas",
        tes_tulis: "Tes Tulis",
        wawancara: "Wawancara",
        tubes: "Tubes",
        mengajar: "Mengajar",
      },
      saved: "Titik awal Cutting disimpan.",
      back: "Titik awal kembali ke bawaan.",
      top: "Top N awal",
      min: "Nilai minimum awal",
      from: "Target, dari",
      to: "sampai",
      bad: "Batas bawah target tidak boleh lebih besar dari batas atasnya.",
      stage: {
        berkas: "Seleksi Berkas",
        tes_tulis: "Tes Tulis dan Program",
        wawancara: "Wawancara",
        tubes: "Tubes",
        mengajar: "Tes Mengajar",
      },
      people: (n: number) => `${n} CaAs`,
      score: (n: number) => `${n} poin`,
      builtIn: "Bawaan",
    },
    words: {
      title: "Teks Amplop",
      desc: "Heading dan kalimat yang dibaca CaAs saat membuka amplop. Kotak kosong memakai teks bawaan. Tulis {nama} untuk nama depan CaAs.",
      saved: "Teks amplop disimpan.",
      back: "Teks amplop kembali ke bawaan.",
      envelope: "Amplop",
      lang: "Bahasa",
      lolosTitle: "Heading untuk yang lolos",
      lolosLine: "Kalimat untuk yang lolos",
      gagalTitle: "Heading untuk yang tidak lolos",
      gagalLine: "Kalimat untuk yang tidak lolos",
      preview: "Pratinjau",
      builtIn: "Teks bawaan dipakai",
      resetOne: "Kembalikan Bawaan Amplop Ini",
      tabs: {
        berkas: "Berkas",
        tulis: "Tes Tulis",
        wawancara: "Wawancara",
        tubes: "Tubes",
        mengajar: "Mengajar",
        penerimaan: "Penerimaan",
      },
      acc: {
        lolosTitle: "Heading untuk yang diterima",
        lolosLine: "Kalimat untuk yang diterima",
        gagalTitle: "Heading untuk yang tidak diterima",
        gagalLine: "Kalimat untuk yang tidak diterima (tanpa alasan)",
      },
    },
  },
  en: {
    cancel: "Cancel",
    save: "Save",
    reset: "Restore Defaults",
    fail: "Not saved. Try again.",
    less: "Less",
    more: "More",
    start: {
      title: "Starting Cut",
      desc: "The cut line opens from these numbers. The Pleno still decides who moves on. Only the Ketua and the Akademik change them.",
      topLabel: "Top N",
      topHint: "How many pass when the line opens as Top N.",
      minLabel: "Minimum score",
      minHint: "The lowest score that passes when the line opens as Minimum Score.",
      tgtMinLabel: "Pass target: at least",
      tgtMinHint: "How many candidates are expected to move on to the next stage.",
      tgtMinHintTes: "How many candidates are expected to move on to the Interview.",
      tgtMaxLabel: "Pass target: at most",
      apply: "Use on the Cut Line",
      done: "Done",
      restore: "Restore the Default",
      short: {
        berkas: "Documents",
        tes_tulis: "Written Test",
        wawancara: "Interview",
        tubes: "Project",
        mengajar: "Teaching",
      },
      saved: "Cutting starting point saved.",
      back: "The starting cut is back to the default.",
      top: "Starting Top N",
      min: "Starting minimum score",
      from: "Target, from",
      to: "to",
      bad: "The lower end of the target cannot be above the upper end.",
      stage: {
        berkas: "Document Screening",
        tes_tulis: "Written and Coding Test",
        wawancara: "Interview",
        tubes: "Project",
        mengajar: "Teaching Test",
      },
      people: (n: number) => `${n} CaAs`,
      score: (n: number) => `${n} pts`,
      builtIn: "Default",
    },
    words: {
      title: "Envelope Wording",
      desc: "The heading and lines a CaAs reads when they open an envelope. An empty box keeps the built-in text. Write {nama} for the CaAs's first name.",
      saved: "Envelope wording saved.",
      back: "Envelope wording is back to the default.",
      envelope: "Envelope",
      lang: "Language",
      lolosTitle: "Heading for those who passed",
      lolosLine: "Line for those who passed",
      gagalTitle: "Heading for those who did not",
      gagalLine: "Line for those who did not",
      preview: "Preview",
      builtIn: "Built-in text in use",
      resetOne: "Restore This Envelope",
      tabs: {
        berkas: "Documents",
        tulis: "Written Test",
        wawancara: "Interview",
        tubes: "Project",
        mengajar: "Teaching",
        penerimaan: "Acceptance",
      },
      acc: {
        lolosTitle: "Heading for those accepted",
        lolosLine: "Line for those accepted",
        gagalTitle: "Heading for those not accepted",
        gagalLine: "Line for those not accepted (no reason given)",
      },
    },
  },
} as const;

const ENVELOPES = ["berkas", "tulis", "wawancara", "tubes", "mengajar", "penerimaan"] as const;
type Envelope = (typeof ENVELOPES)[number];

/* ------------------------------------------------------------ Atur Titik Awal */

export function AturTitikAwal({
  lang,
  open,
  onOpenChange,
  value,
  onSaved,
  stage,
  onApply,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: SettingMap["cutting"] | undefined;
  onSaved: () => void;
  /** The stage whose Cutting is open: the mockup's dialog is one stage at a time */
  stage: CuttingStageKey;
  /** Open the cut line as Top N after saving ("Pakai di Garis Potong") */
  onApply?: () => void;
}) {
  const t = T[lang === "id" ? "id" : "en"];
  const s = t.start;
  const [draft, setDraft] = useState<Record<CuttingStageKey, CuttingSetting>>(
    () =>
      Object.fromEntries(
        (Object.keys(CUTTING_DEFAULT) as CuttingStageKey[]).map((k) => [k, cuttingFor(value, k)!]),
      ) as Record<CuttingStageKey, CuttingSetting>,
  );
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const set = (k: CuttingStageKey, p: Partial<CuttingSetting>) =>
    setDraft((d) => ({ ...d, [k]: { ...d[k], ...p } }));

  const sama = JSON.stringify(draft[stage]) === JSON.stringify(CUTTING_DEFAULT[stage]);

  async function simpan(pakai: boolean) {
    if (Object.values(draft).some((c) => c.targetMin > c.targetMax)) return setGalat(s.bad);
    setGalat(null);
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-save", { key: "cutting", value: draft });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(s.saved, "ok");
    onSaved();
    if (pakai) onApply?.();
    onOpenChange(false);
  }
  // Back to the built-in numbers for this stage only; the other stages keep what they have.
  async function pulihkan() {
    const next = { ...draft, [stage]: { ...CUTTING_DEFAULT[stage] } };
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-save", { key: "cutting", value: next });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    setDraft(next);
    window.Toast?.show(s.back, "ok");
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${s.title} · ${s.short[stage]}`}
      description={s.desc}
      size="lg"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" disabled={busy || sama} onClick={pulihkan}>
          <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
          <span className="btn__label">{s.restore}</span>
        </button>
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn--inverse"
            disabled={busy}
            onClick={() => void simpan(true)}
          >
            <span className="btn__label">{s.apply}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void simpan(false)}
          >
            <span className="btn__label">{s.done}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="r6sets">
          <label className="r6set">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{s.topLabel}</b>
              <span className="hint">{s.topHint}</span>
            </span>
            <Stepper
              value={draft[stage].top}
              min={1}
              max={500}
              label={s.topLabel}
              lessLabel={t.less}
              moreLabel={t.more}
              onChange={(v) => set(stage, { top: v })}
            />
          </label>
          <label className="r6set">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{s.minLabel}</b>
              <span className="hint">{s.minHint}</span>
            </span>
            <Stepper
              value={draft[stage].minScore}
              min={0}
              max={stage === "tes_tulis" ? 4000 : 100}
              step={stage === "tes_tulis" ? 50 : 1}
              label={s.minLabel}
              lessLabel={t.less}
              moreLabel={t.more}
              onChange={(v) => set(stage, { minScore: v })}
            />
          </label>
          <label className="r6set">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{s.tgtMinLabel}</b>
              <span className="hint">{stage === "tes_tulis" ? s.tgtMinHintTes : s.tgtMinHint}</span>
            </span>
            <Stepper
              value={draft[stage].targetMin}
              min={1}
              max={draft[stage].targetMax}
              label={s.tgtMinLabel}
              lessLabel={t.less}
              moreLabel={t.more}
              onChange={(v) => set(stage, { targetMin: v })}
            />
          </label>
          <label className="r6set">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{s.tgtMaxLabel}</b>
            </span>
            <Stepper
              value={draft[stage].targetMax}
              min={draft[stage].targetMin}
              max={500}
              label={s.tgtMaxLabel}
              lessLabel={t.less}
              moreLabel={t.more}
              onChange={(v) => set(stage, { targetMax: v })}
            />
          </label>
        </div>
        {galat && (
          <p className="banner banner--warn" role="alert">
            {galat}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/* ----------------------------------------------------------- Ubah Teks Amplop */

type Draft = Record<Envelope, { id: WordSide; en: WordSide }>;

/** The built-in text of one box, with {nama} left in for the editor to see. */
function bawaan(lang: "id" | "en", f: WordField): string {
  const r = S2[lang].reveal;
  return f === "lolosTitle"
    ? r.lolosTitle
    : f === "gagalTitle"
      ? r.gagalTitle
      : f === "lolosLine"
        ? r.lolosLine("{nama}")
        : r.gagalLine("{nama}");
}

export function UbahTeksAmplop({
  lang,
  open,
  onOpenChange,
  value,
  onSaved,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: SettingMap["words"] | undefined;
  onSaved: () => void;
}) {
  const t = T[lang === "id" ? "id" : "en"];
  const w = t.words;
  const [draft, setDraft] = useState<Draft>(
    () =>
      Object.fromEntries(
        ENVELOPES.map((k) => [k, { id: { ...value?.[k]?.id }, en: { ...value?.[k]?.en } }]),
      ) as Draft,
  );
  const [env, setEnv] = useState<Envelope>("berkas");
  const [bhs, setBhs] = useState<"id" | "en">(lang === "id" ? "id" : "en");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const side = draft[env][bhs];
  const ubah = (f: WordField, v: string) =>
    setDraft((d) => ({ ...d, [env]: { ...d[env], [bhs]: { ...d[env][bhs], [f]: v } } }));
  const pakai = (f: WordField) => side[f]?.trim() || bawaan(bhs, f);
  const dipakai = WORD_FIELDS.some((f) => side[f]?.trim());

  async function simpan() {
    const out: SettingMap["words"] = {};
    for (const k of ENVELOPES) {
      const entry: { id?: WordSide; en?: WordSide } = {};
      for (const l of ["id", "en"] as const) {
        const clean: WordSide = {};
        for (const f of WORD_FIELDS) {
          const v = draft[k][l][f]?.trim();
          if (v) clean[f] = v;
        }
        if (Object.keys(clean).length) entry[l] = clean;
      }
      if (entry.id || entry.en) out[k] = entry;
    }
    setGalat(null);
    setBusy(true);
    const res = Object.keys(out).length
      ? await recPost<{ ok: true }>("setting-save", { key: "words", value: out })
      : await recPost<{ ok: true }>("setting-reset", { key: "words" });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(w.saved, "ok");
    onSaved();
    onOpenChange(false);
  }
  async function pulihkanSemua() {
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-reset", { key: "words" });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(w.back, "ok");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={w.title}
      description={w.desc}
      size="form"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={pulihkanSemua}>
          {t.reset}
        </button>
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={simpan}>
            <span className="btn__label">{t.save}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <TabLine
          label={w.envelope}
          value={env}
          onChange={setEnv}
          tabs={ENVELOPES.map((k) => ({ v: k, label: w.tabs[k] }))}
        />
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <SegmentedControl
            aria-label={w.lang}
            value={bhs}
            onValueChange={(v) => setBhs(v as "id" | "en")}
            options={[
              { value: "id", label: "Indonesia" },
              { value: "en", label: "English" },
            ]}
          />
          {!dipakai && <span className="hint">{w.builtIn}</span>}
        </div>
        <div className="b6-words">
          <div className="stack">
            {WORD_FIELDS.map((f) => (
              <label className="field" key={f}>
                <span className="field__label">{env === "penerimaan" ? w.acc[f] : w[f]}</span>
                {f.endsWith("Title") ? (
                  <input
                    className="field__input"
                    value={side[f] ?? ""}
                    maxLength={WORD_MAX[f]}
                    placeholder={bawaan(bhs, f)}
                    onChange={(e) => ubah(f, e.target.value)}
                  />
                ) : (
                  <textarea
                    className="field__input"
                    rows={3}
                    value={side[f] ?? ""}
                    maxLength={WORD_MAX[f]}
                    placeholder={bawaan(bhs, f)}
                    onChange={(e) => ubah(f, e.target.value)}
                  />
                )}
              </label>
            ))}
            <div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setDraft((d) => ({ ...d, [env]: { id: {}, en: {} } }))}
              >
                {w.resetOne}
              </button>
            </div>
          </div>
          <aside className="b6-words__pre" aria-label={w.preview}>
            <span className="eyebrow">{w.preview}</span>
            {(["lolos", "gagal"] as const).map((r) => (
              <div className="b6-words__card" key={r} data-r={r}>
                <b>{pakai(`${r}Title`)}</b>
                <p>{isiNama(pakai(`${r}Line`), "Sari")}</p>
              </div>
            ))}
          </aside>
        </div>
        {galat && (
          <p className="banner banner--warn" role="alert">
            {galat}
          </p>
        )}
      </div>
    </Dialog>
  );
}
