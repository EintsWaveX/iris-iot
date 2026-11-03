/**
 * Susulan of Wawancara and Mengajar, under the Papan in Plotting (mockup r6
 * Susulan): who the sheets sent to the makeup, where each stands in the offer,
 * and the four things Panitia do: Konfirmasi dan Tawarkan, Catat Jawaban (an
 * answer that came in through a chat app), Pulihkan (a withdrawn CaAs) and
 * Tempatkan (a seat on the Susulan day, a move like any other in Plotting).
 * The standing of every row comes from the server (src/lib/recruitment/makeup.ts).
 */
import { NOUN, Paged } from "../../../ui/Pager";
import { useState } from "react";
import Confirm from "../../../ui/Confirm";
import Dialog from "../../../ui/Dialog";
import Dropdown from "../../../ui/Dropdown";
import Pill from "../../../ui/Pill";
import SegmentedControl from "../../../ui/SegmentedControl";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { tanggalWib } from "../../../../lib/recruitment/gates";
import {
  useMakeupList,
  type MakeupListResponse,
  type MakeupRow,
  type MakeupSlot,
} from "../../../../lib/recruitment/makeup-client";
import {
  ANSWER_VIA,
  NOTE_MIN,
  type AnswerVia,
  type MakeupStage,
} from "../../../../lib/recruitment/makeup";
import { MK } from "../../makeupStrings";
import { tgl } from "../../shared";
import "../../recruitment-r4.css";

const wib = (iso: string) => tanggalWib(new Date(iso));
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const TONE = {
  tunggu: "warn",
  tawar: "gold",
  ya: "accent",
  ditempatkan: "ok",
  mundur: "danger",
} as const;
const first = (nama: string) => nama.split(" ")[0] ?? nama;
const whenOf = (iso: string, lang: Lang) => `${tgl(wib(iso).tanggal, lang)}, ${wib(iso).jam}`;

type Mode = "catat" | "ubah" | "pulihkan";

function AnswerDialog({
  lang,
  stage,
  row,
  mode,
  onClose,
  onDone,
}: {
  lang: Lang;
  stage: MakeupStage;
  row: MakeupRow;
  mode: Mode;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const w = MK(lang).papan;
  const d = w.dlg;
  const [ans, setAns] = useState<"ikut" | "tidak">("ikut");
  const [via, setVia] = useState<AnswerVia>(
    ANSWER_VIA.includes(row.via as AnswerVia) ? (row.via as AnswerVia) : "line",
  );
  const [note, setNote] = useState(mode === "pulihkan" ? "" : row.note);
  const [busy, setBusy] = useState(false);
  const need = mode === "pulihkan" || ans === "tidak";
  const ok = !need || note.trim().length >= NOTE_MIN;

  const save = async () => {
    setBusy(true);
    const r = await recPost<{ ok: true }>("ms-record", {
      id: row.id,
      stage,
      ans: mode === "pulihkan" ? "pulihkan" : ans,
      via,
      note: note.trim(),
    });
    setBusy(false);
    if (isFail(r)) return toast(w.toast.err[r.kode] ?? w.toast.fail, "danger");
    onDone(
      mode === "pulihkan" ? w.toast.reinstated(first(row.nama)) : w.toast.recorded(first(row.nama)),
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={d[mode]}
      description={
        mode === "pulihkan"
          ? d.descReinstate(row.nama, row.unanswered)
          : d.descRecord(first(row.nama))
      }
      size="md"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {d.cancel}
          </button>
          <button type="button" className="btn btn--primary" disabled={!ok || busy} onClick={save}>
            {mode === "pulihkan" ? d.reinstateBtn : d.save}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="stack stack--sm">
          <span className="hint">{d.who}</span>
          <b>{row.nama}</b>
        </div>
        {mode !== "pulihkan" && (
          <div className="stack stack--sm">
            <span className="hint">{d.answer}</span>
            <SegmentedControl
              aria-label={d.answer}
              value={ans}
              onValueChange={(v) => setAns(v as "ikut" | "tidak")}
              options={[
                { value: "ikut", label: d.join },
                { value: "tidak", label: d.cant },
              ]}
            />
          </div>
        )}
        <div className="field">
          <span className="field__label">{d.viaLabel}</span>
          <Dropdown
            id="ms-via"
            label={d.viaLabel}
            hideLabel
            value={via}
            onChange={(v) => setVia(v as AnswerVia)}
            options={ANSWER_VIA.map((v) => ({ value: v, label: MK(lang).via[v] }))}
          />
        </div>
        <label className="stack stack--sm">
          <span className="hint">
            {mode === "pulihkan" ? d.noteReinstate : need ? d.noteReq : d.noteOpt}
          </span>
          <textarea
            className="field__input"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {!ok && <span className="hint">{d.noteMin}</span>}
        </label>
        <span className="hint">{d.logged}</span>
      </div>
    </Dialog>
  );
}

function PlaceDialog({
  lang,
  row,
  slots,
  onClose,
  onPlace,
}: {
  lang: Lang;
  row: MakeupRow;
  slots: MakeupSlot[];
  onClose: () => void;
  onPlace: (slot: MakeupSlot) => void;
}) {
  const w = MK(lang).papan;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={w.placeTitle}
      description={w.placeDesc(row.nama)}
      size="md"
      lang={lang}
      actions={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          {w.dlg.cancel}
        </button>
      }
    >
      {slots.length === 0 ? (
        <span className="hint">{w.noSlots}</span>
      ) : (
        <div className="stack stack--sm">
          {slots.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn--ghost msus__slot"
              disabled={s.id === row.slotId || s.taken >= s.capacity}
              onClick={() => onPlace(s)}
            >
              {w.slotLine(s.room, whenOf(s.startsAt, lang), s.taken, s.capacity)}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function trail(r: MakeupRow, d: MakeupListResponse, lang: Lang): string {
  const w = MK(lang);
  if (r.unanswered && d.deadline) return w.papan.trailUnanswered(whenOf(d.deadline, lang));
  if (r.via && r.via !== "web")
    return (
      w.papan.trailRecorded(w.via[r.via as AnswerVia], r.by ?? "") + (r.note ? ` ${r.note}` : "")
    );
  if (r.via === "web" && r.answeredAt)
    return r.state === "mundur" ? w.papan.trailDeclinedWeb : w.papan.trailAnsweredWeb;
  return "";
}

export default function PapanSusulan({
  lang,
  stage,
  can,
}: {
  lang: Lang;
  stage: MakeupStage;
  can: boolean;
}) {
  const m = MK(lang);
  const w = m.papan;
  const list = useMakeupList(stage);
  const [dlg, setDlg] = useState<{ row: MakeupRow; mode: Mode } | null>(null);
  const [placing, setPlacing] = useState<MakeupRow | null>(null);
  const [retracting, setRetracting] = useState<MakeupRow | null>(null);
  const [busy, setBusy] = useState(false);
  const d = list.data;
  if (!d) return <span className="skeleton" style={{ height: 160 }} />;

  const call = async (aksi: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const r = await recPost<{ ok: true }>(aksi, { stage, ...body });
    setBusy(false);
    if (isFail(r)) {
      toast(w.toast.err[r.kode] ?? w.toast.fail, "danger");
      list.refresh();
      return false;
    }
    toast(ok);
    list.refresh();
    return true;
  };
  const place = async (row: MakeupRow, slot: MakeupSlot) => {
    setPlacing(null);
    setBusy(true);
    const r = await recPost<{ ok: true }>("slot-set", {
      op: "move",
      stage,
      candidateId: row.id,
      toSlot: slot.id,
    });
    setBusy(false);
    if (isFail(r)) toast(w.toast.err[r.kode] ?? w.toast.fail, "danger");
    else toast(w.toast.placed(first(row.nama)));
    list.refresh();
  };
  const count = (s: string) => d.rows.filter((r) => r.state === s).length;
  const needSeat = count("ya") + count("tawar");

  const actions = (r: MakeupRow) => {
    if (!can) return null;
    const b = (label: string, onClick: () => void, kind = "btn--ghost") => (
      <button type="button" className={`btn btn--sm ${kind}`} disabled={busy} onClick={onClick}>
        {label}
      </button>
    );
    // Every row that was offered can be taken back, whatever the answer.
    const tarik = b(w.retract, () => setRetracting(r));
    if (r.state === "tunggu")
      return b(
        w.offer,
        () => call("ms-offer", { id: r.id }, w.toast.offered(first(r.nama))),
        "btn--primary",
      );
    if (r.state === "tawar")
      return (
        <>
          {b(w.record, () => setDlg({ row: r, mode: "catat" }))}
          {b(w.place, () => setPlacing(r))}
          {tarik}
        </>
      );
    if (r.state === "ya")
      return (
        <>
          {b(w.place, () => setPlacing(r), "btn--primary")}
          {b(w.edit, () => setDlg({ row: r, mode: "ubah" }))}
          {tarik}
        </>
      );
    if (r.state === "ditempatkan")
      return (
        <>
          {b(w.release, () => call("ms-release", { id: r.id }, w.toast.released(first(r.nama))))}
          {b(w.edit, () => setDlg({ row: r, mode: "ubah" }))}
          {tarik}
        </>
      );
    return (
      <>
        {b(w.reinstate, () => setDlg({ row: r, mode: "pulihkan" }))}
        {tarik}
      </>
    );
  };

  return (
    <section className="panel stack msus">
      <div className="row row--between" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="stack stack--sm" style={{ minWidth: 0 }}>
          <h3 className="panel__title">{w.title(m.stage[stage])}</h3>
          {d.day ? (
            <>
              <span className="hint">{w.lede(tgl(d.day, lang), d.from ?? "", d.to ?? "")}</span>
              {d.deadline && <span className="hint">{w.due(whenOf(d.deadline, lang))}</span>}
            </>
          ) : (
            <span className="hint">{w.noDay}</span>
          )}
        </div>
        <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {count("tunggu") > 0 && <Pill tone="warn">{w.toConfirm(count("tunggu"))}</Pill>}
          {needSeat > 0 && <Pill tone="gold">{w.needSeat(needSeat)}</Pill>}
        </span>
      </div>
      {d.rows.length === 0 ? (
        <div className="stack stack--sm">
          <b>{w.empty}</b>
          <span className="hint">{w.emptyHint}</span>
        </div>
      ) : (
        <Paged items={d.rows} id="susulan" size={10} noun={NOUN[lang].baris} lang={lang}>
          {(rowsP) => (
            <ul className="msus__l">
              {rowsP.map((r) => {
                const why = r.why ? (w.why[r.why] ?? r.why) : "";
                const t = trail(r, d, lang);
                return (
                  <li key={r.id} className="msus__r" data-st={r.state}>
                    <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <b>{r.nama}</b>
                      <span className="hint">
                        {[
                          r.state !== "ditempatkan" && r.room && r.startsAt
                            ? w.absentIn(r.room, tgl(wib(r.startsAt).tanggal, lang).split(",")[0])
                            : "",
                          why,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {t && <span className="hint">{t}</span>}
                      {r.state === "ditempatkan" && r.room && r.startsAt && (
                        <span className="hint">{`${r.room} · ${whenOf(r.startsAt, lang)}`}</span>
                      )}
                    </span>
                    <Pill tone={TONE[r.state]}>{m.state[r.state]}</Pill>
                    <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {actions(r)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Paged>
      )}
      {dlg && (
        <AnswerDialog
          lang={lang}
          stage={stage}
          row={dlg.row}
          mode={dlg.mode}
          onClose={() => setDlg(null)}
          onDone={(text) => {
            setDlg(null);
            toast(text);
            list.refresh();
          }}
        />
      )}
      {retracting && (
        <Confirm
          open
          onOpenChange={(o) => !o && setRetracting(null)}
          title={w.retractTitle(retracting.nama)}
          body={w.retractBody}
          confirmLabel={w.retractYes}
          lang={lang}
          onConfirm={async () => {
            const ok = await call(
              "ms-retract",
              { id: retracting.id },
              w.toast.retracted(first(retracting.nama)),
            );
            return ok;
          }}
        />
      )}
      {placing && (
        <PlaceDialog
          lang={lang}
          row={placing}
          slots={d.slots}
          onClose={() => setPlacing(null)}
          onPlace={(s) => place(placing, s)}
        />
      )}
    </section>
  );
}
