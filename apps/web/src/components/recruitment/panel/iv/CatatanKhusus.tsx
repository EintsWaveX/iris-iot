/**
 * Catatan Khusus (the interview workbook, 22 Nov 2026): the red notes and plus points a committee member ticks
 * about one CaAs, the label that follows from the ticks, a note of their own and (control seats) the label by
 * hand and the committee's conclusion. Every change is saved on its own, so two people writing about the same
 * CaAs never overwrite each other. A note and the conclusion are saved while they are typed (as the sheet's
 * answers are), so the other examiner reads them as they are written; leaving the box still saves at once.
 * Used in the interview sheet, in the PJ's room list and in Penilaian.
 */
import { useEffect, useRef, useState } from "react";
import Dropdown from "../../../ui/Dropdown";
import Pill from "../../../ui/Pill";
import { Checkbox } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { endsWord, saveDelay } from "../../../../lib/recruitment/iv-sync";
import { useCatatan, type CatatanResponse } from "../../../../lib/recruitment/iv-client";
import {
  labelOf,
  type IvStage,
  type IvTag,
  type Label,
} from "../../../../lib/recruitment/interview";
import { bi } from "./ivStrings";
import { CK } from "./catatanStrings";

const LABEL_TONE = { jago: "ok", perhatian: "warn", banyak: "danger", standar: undefined } as const;

/** The label as a small pill: Jago green, Perlu perhatian amber, Banyak masalah red, Standar plain. */
export function LabelPill({ label, lang }: { label: Label; lang: Lang }) {
  return <Pill tone={LABEL_TONE[label]}>{CK[lang].labels[label]}</Pill>;
}

export default function CatatanKhusus({
  stage,
  id,
  lang,
  locked = false,
  readOnly = false,
}: {
  stage: IvStage;
  id: number;
  lang: Lang;
  /** The sheet is closed for writing (a control seat may still write) */
  locked?: boolean;
  /** Only reading (another CaAs's sheet opened from Penilaian): nothing can be ticked or typed, even by a control seat */
  readOnly?: boolean;
}) {
  const t = CK[lang];
  const q = useCatatan(stage, id);
  const d = q.data;
  // What is typed and not yet saved; null means "show what the server holds".
  const [note, setNote] = useState<string | null>(null);
  const [fin, setFin] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const latest = useRef({ note, fin });
  latest.current = { note, fin };
  const busy = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  const mineNow = d?.catatan.notes.find((n) => n.mine)?.text ?? "";
  const finNow = d?.catatan.final ?? "";
  const dirty =
    (note !== null && note.trim() !== mineNow) || (fin !== null && fin.trim() !== finNow);

  // Typed text goes out soon after a word, or after a short pause, while it is typed. The local copy stays
  // until the box loses focus: the server keeps the text trimmed, and swapping it in mid-typing would eat a space.
  useEffect(() => {
    if (!dirty || state === "saving") return;
    const word = endsWord(fin !== null && fin.trim() !== finNow ? fin : (note ?? ""));
    const tm = setTimeout(() => flushRef.current(), saveDelay(word, 0, state === "failed"));
    return () => clearTimeout(tm);
  }, [dirty, note, fin, state, finNow]);

  if (!d)
    return (
      <section className="panel r4p ck" aria-live="polite">
        <h3 className="h3">{t.title}</h3>
        <span className="hint">{q.ditolak ? t.refused : t.loading}</span>
      </section>
    );

  const closed = readOnly || (locked && !d.semua);
  const c = d.catatan;
  const mine = c.notes.find((n) => n.mine)?.text ?? "";
  const others = c.notes.filter((n) => !n.mine);
  const auto = labelOf({ ...c, label: null }, d.tags);
  const eff = labelOf(c, d.tags);

  const patch = (f: (o: CatatanResponse) => CatatanResponse) => q.ubah((o) => (o ? f(o) : o));
  flushRef.current = () => {
    if (busy.current) return;
    const { note: n, fin: f } = latest.current;
    const body: Record<string, unknown> = {};
    if (n !== null && n.trim() !== mine) body.note = n;
    if (f !== null && f.trim() !== c.final) body.final = f;
    if (!Object.keys(body).length) return;
    busy.current = true;
    void send(body).finally(() => {
      busy.current = false;
    });
  };

  const send = async (body: Record<string, unknown>): Promise<boolean> => {
    setState("saving");
    const r = await recPost<CatatanResponse>("iv-catatan-save", { stage, id, ...body });
    if (isFail(r)) {
      setState("failed");
      q.refresh();
      return false;
    }
    patch((o) => ({ ...o, catatan: r.catatan, auto: r.auto, label: r.label }));
    setState("saved");
    return true;
  };

  const tick = (list: "red" | "plus", key: string, on: boolean) => {
    // Shown at once; the answer of the server replaces it.
    patch((o) => ({
      ...o,
      catatan: {
        ...o.catatan,
        [list]: on
          ? [...o.catatan[list].filter((k) => k !== key), key]
          : o.catatan[list].filter((k) => k !== key),
      },
    }));
    void send({ tick: { list, key, on } });
  };

  const column = (list: "red" | "plus", tags: IvTag[]) => (
    <div className="ck__col" data-tone={list === "red" ? "danger" : "ok"}>
      <b className="ck__h">{list === "red" ? t.red : t.plus}</b>
      <span className="hint">{list === "red" ? t.redHint : t.plusHint}</span>
      {tags.map((g) => (
        <Checkbox
          key={g.key}
          checked={c[list].includes(g.key)}
          disabled={closed}
          onChange={(v) => tick(list, g.key, v)}
          label={bi(g.label, lang)}
        />
      ))}
    </div>
  );

  return (
    <section className="panel r4p ck">
      <div className="ck__top">
        <h3 className="h3">{t.title}</h3>
        <span className="ck__label">
          <LabelPill label={eff} lang={lang} />
          <span className="hint">{t.counts(c.red.length, c.plus.length)}</span>
        </span>
      </div>
      <span className="hint">{t.hint}</span>
      <div className="ck__cols">
        {column("red", d.tags.red)}
        {column("plus", d.tags.plus)}
      </div>

      {!readOnly && (
        <label className="stack stack--sm">
          <b className="ck__h">{t.myNote}</b>
          <textarea
            className="field__input"
            rows={2}
            maxLength={800}
            value={note ?? mine}
            disabled={closed}
            placeholder={t.myNotePh}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note === null || note.trim() === mine) return setNote(null);
              void send({ note }).then((ok) => ok && setNote(null));
            }}
          />
        </label>
      )}

      {(readOnly || others.length > 0) && (
        <div className="stack stack--sm">
          <b className="ck__h">{readOnly ? t.allNotes : t.otherNotes}</b>
          {readOnly && c.notes.length === 0 && <span className="hint">{t.noNotes}</span>}
          {(readOnly ? c.notes : others).map((n) => (
            <p key={n.key} className="ck__note">
              <b>{t.roles[n.who] ?? n.who}</b> {n.text}
            </p>
          ))}
        </div>
      )}

      {readOnly && c.final && (
        <div className="stack stack--sm">
          <b className="ck__h">{t.final}</b>
          <p className="ck__note">{c.final}</p>
        </div>
      )}
      {d.semua && !readOnly && (
        <div className="ck__ctl">
          <div className="ck__pick">
            <Dropdown
              id={`ck-label-${stage}-${id}`}
              label={t.labelPick}
              options={[
                { value: "", label: `${t.labelAuto}: ${t.labels[auto]}` },
                ...(["jago", "perhatian", "banyak", "standar"] as const).map((l) => ({
                  value: l,
                  label: t.labels[l],
                })),
              ]}
              value={c.label ?? ""}
              onChange={(v) => void send({ label: v || null })}
            />
          </div>
          <label className="stack stack--sm">
            <b className="ck__h">{t.final}</b>
            <textarea
              className="field__input"
              rows={3}
              maxLength={1500}
              value={fin ?? c.final}
              placeholder={t.finalPh}
              onChange={(e) => setFin(e.target.value)}
              onBlur={() => {
                if (fin === null || fin.trim() === c.final) return setFin(null);
                void send({ final: fin }).then((ok) => ok && setFin(null));
              }}
            />
          </label>
        </div>
      )}
      <span className="hint ck__state" aria-live="polite">
        {state === "saving"
          ? t.saving
          : state === "saved"
            ? t.saved
            : state === "failed"
              ? t.failed
              : ""}
      </span>
    </section>
  );
}
