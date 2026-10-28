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
import Dialog from "../../../ui/Dialog";
import SegmentedControl from "../../../ui/SegmentedControl";
import TabLine from "../../../ui/TabLine";
import { Stepper } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import {
  CUTTING_DEFAULT,
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
      title: "Atur Titik Awal",
      desc: "Angka yang dipakai kartu ambang saat Cutting dibuka, dan jumlah CaAs yang ingin diloloskan dek.",
      saved: "Titik awal Cutting disimpan.",
      back: "Titik awal Cutting kembali ke bawaan.",
      top: "Top N awal",
      min: "Nilai minimum awal",
      from: "Target dek, dari",
      to: "sampai",
      bad: "Batas bawah target tidak boleh lebih besar dari batas atasnya.",
      stage: { berkas: "Seleksi Berkas", tes_tulis: "Tes Tulis dan Program" },
      people: (n: number) => `${n} CaAs`,
      score: (n: number) => `${n} poin`,
      builtIn: "Bawaan",
    },
    words: {
      title: "Ubah Teks Amplop",
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
      title: "Set Starting Point",
      desc: "The numbers the threshold card opens on when a Cutting starts, and how many CaAs the deck aims to pass.",
      saved: "Cutting starting point saved.",
      back: "Cutting starting point is back to the default.",
      top: "Starting Top N",
      min: "Starting minimum score",
      from: "Deck target, from",
      to: "to",
      bad: "The lower end of the target cannot be above the upper end.",
      stage: { berkas: "Document Selection", tes_tulis: "Written Test and Program" },
      people: (n: number) => `${n} CaAs`,
      score: (n: number) => `${n} pts`,
      builtIn: "Default",
    },
    words: {
      title: "Edit Envelope Wording",
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
      },
    },
  },
} as const;

const ENVELOPES = ["berkas", "tulis", "wawancara", "tubes", "mengajar"] as const;
type Envelope = (typeof ENVELOPES)[number];

/* ------------------------------------------------------------ Atur Titik Awal */

export function AturTitikAwal({
  lang,
  open,
  onOpenChange,
  value,
  onSaved,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: SettingMap["cutting"] | undefined;
  onSaved: () => void;
}) {
  const t = T[lang === "id" ? "id" : "en"];
  const s = t.start;
  const [draft, setDraft] = useState<Record<"berkas" | "tes_tulis", CuttingSetting>>(() => ({
    berkas: cuttingFor(value, "berkas")!,
    tes_tulis: cuttingFor(value, "tes_tulis")!,
  }));
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const set = (k: keyof typeof draft, p: Partial<CuttingSetting>) =>
    setDraft((d) => ({ ...d, [k]: { ...d[k], ...p } }));

  async function simpan() {
    if (Object.values(draft).some((c) => c.targetMin > c.targetMax)) return setGalat(s.bad);
    setGalat(null);
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-save", { key: "cutting", value: draft });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(s.saved, "ok");
    onSaved();
    onOpenChange(false);
  }
  async function pulihkan() {
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-reset", { key: "cutting" });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(s.back, "ok");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={s.title}
      description={s.desc}
      size="xl"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={pulihkan}>
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
        {(Object.keys(draft) as (keyof typeof draft)[]).map((k) => (
          <section className="panel b6-start" key={k}>
            <h3 className="panel__title">{s.stage[k]}</h3>
            <div className="b6-start__grid">
              <div className="field">
                <span className="field__label">{s.top}</span>
                <Stepper
                  value={draft[k].top}
                  min={1}
                  max={500}
                  label={`${s.stage[k]}: ${s.top}`}
                  fmt={s.people}
                  lessLabel={t.less}
                  moreLabel={t.more}
                  onChange={(v) => set(k, { top: v })}
                />
              </div>
              {k === "tes_tulis" && (
                <div className="field">
                  <span className="field__label">{s.min}</span>
                  <Stepper
                    value={draft[k].minScore}
                    min={0}
                    max={4000}
                    step={50}
                    label={`${s.stage[k]}: ${s.min}`}
                    fmt={s.score}
                    lessLabel={t.less}
                    moreLabel={t.more}
                    onChange={(v) => set(k, { minScore: v })}
                  />
                </div>
              )}
              <div className="field">
                <span className="field__label">{s.from}</span>
                <Stepper
                  value={draft[k].targetMin}
                  min={1}
                  max={500}
                  label={`${s.stage[k]}: ${s.from}`}
                  fmt={s.people}
                  lessLabel={t.less}
                  moreLabel={t.more}
                  onChange={(v) => set(k, { targetMin: v })}
                />
              </div>
              <div className="field">
                <span className="field__label">{s.to}</span>
                <Stepper
                  value={draft[k].targetMax}
                  min={1}
                  max={500}
                  label={`${s.stage[k]}: ${s.to}`}
                  fmt={s.people}
                  lessLabel={t.less}
                  moreLabel={t.more}
                  onChange={(v) => set(k, { targetMax: v })}
                />
              </div>
            </div>
            <span className="hint">
              {`${s.builtIn}: Top ${CUTTING_DEFAULT[k].top}${
                k === "tes_tulis" ? `, ${s.score(CUTTING_DEFAULT[k].minScore)}` : ""
              }, ${CUTTING_DEFAULT[k].targetMin} - ${CUTTING_DEFAULT[k].targetMax}`}
            </span>
          </section>
        ))}
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
      size="xl"
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
                <span className="field__label">{w[f]}</span>
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
