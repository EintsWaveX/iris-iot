/**
 * Pilih Jadwal on the candidate page (06, PRD 6 Shifts, mockup r2-caas and
 * r2-jadwal): the card in each of its states, the picker dialog (the
 * evenings side by side, then a confirm step) and Ajukan Perubahan.
 *
 * The seat counts are live (a siaran recplotting message refetches the
 * parent's data; nothing polls) and the page only ever sees counts, never
 * who holds a seat. The server is the judge: a pick that loses the race
 * comes back as `penuh`, and the list returns with a note.
 */
import { useState } from "react";
import Dialog from "../../ui/Dialog";
import { Roll } from "../Roll";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { seatsLeft } from "../../../lib/recruitment/slots";
import type { CandidateSlotsStage, SlotSeat } from "../../../lib/recruitment/types";
import { S2 } from "../s2Strings";
import { REC } from "../recruitmentStrings";
import { tgl } from "../shared";

const wib = (iso: string) => tanggalWib(new Date(iso));
const jam = (a: string, b: string) => `${wib(a).jam}|${wib(b).jam}`;

function kapan(iso: string, lang: Lang) {
  const w = wib(iso);
  return `${tgl(w.tanggal, lang)}, ${w.jam}`;
}

/** Seats as pips: taken ones filled, so a full slot reads at a glance. */
export function Pips({ s }: { s: SlotSeat }) {
  return (
    <span className="r2pips" aria-hidden="true">
      {Array.from({ length: Math.min(s.capacity, 60) }, (_, i) => (
        <i key={i} data-on={i < s.taken ? "yes" : undefined} />
      ))}
    </span>
  );
}

export { Roll };

function SlotBtn({
  s,
  lang,
  picked,
  mine,
  onPick,
}: {
  s: SlotSeat;
  lang: Lang;
  picked: boolean;
  mine?: boolean;
  onPick: (id: number) => void;
}) {
  const t = S2[lang].pick;
  const left = seatsLeft(s, s.taken);
  const full = left === 0;
  const [a, b] = jam(s.startsAt, s.endsAt).split("|");
  return (
    <button
      type="button"
      className="r2slot"
      aria-pressed={picked}
      disabled={full || mine}
      data-full={full ? "yes" : undefined}
      data-mine={mine ? "yes" : undefined}
      onClick={() => onPick(s.id)}
      aria-label={`${tgl(wib(s.startsAt).tanggal, lang)}, ${s.room}, ${full ? t.full : `${left} ${t.seatsLeft(left)}`}`}
    >
      <span className="row row--between" style={{ flexWrap: "nowrap", gap: 8 }}>
        <b className="r2slot__room">{s.room}</b>
        {mine ? (
          <span className="pill pill--ok">{t.yours}</span>
        ) : full ? (
          <span className="pill">{t.full}</span>
        ) : null}
      </span>
      <span className="hint">{t.hours(a, b)}</span>
      <Pips s={s} />
      <span className="r2slot__left">
        {full ? (
          t.noSeats
        ) : (
          <>
            <Roll n={left} /> {t.seatsLeft(left)}
          </>
        )}
      </span>
    </button>
  );
}

/** The evenings side by side, each with its rooms. */
export function Evenings({
  slots,
  lang,
  pick,
  setPick,
  mine,
}: {
  slots: SlotSeat[];
  lang: Lang;
  pick: number | null;
  setPick: (id: number) => void;
  mine?: number | null;
}) {
  const hari = [...new Set(slots.map((s) => wib(s.startsAt).tanggal))].sort();
  return (
    <div className="r2eves">
      {hari.map((d) => (
        <section className="r2eve" key={d}>
          <div className="r2eve__head">
            <b>{tgl(d, lang)}</b>
          </div>
          <div className="r2eve__slots">
            {slots
              .filter((s) => wib(s.startsAt).tanggal === d)
              .map((s) => (
                <SlotBtn
                  key={s.id}
                  s={s}
                  lang={lang}
                  picked={pick === s.id}
                  mine={mine === s.id}
                  onPick={setPick}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- picker */

export function PickDialog({
  lang,
  data,
  tahap,
  onClose,
  onDone,
}: {
  lang: Lang;
  data: CandidateSlotsStage;
  tahap: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = S2[lang].pick;
  const [step, setStep] = useState<"list" | "confirm">("list");
  const [pick, setPick] = useState<number | null>(null);
  const [lost, setLost] = useState<SlotSeat | null>(null);
  const [busy, setBusy] = useState(false);
  const s = data.slots.find((x) => x.id === pick) ?? null;
  const sisa = data.slots.reduce((a, x) => a + seatsLeft(x, x.taken), 0);
  const tutup = tgl(wib(data.window.closesAt).tanggal, lang);

  async function take() {
    if (!s) return;
    setBusy(true);
    const r = await recPost<{ ok: true; slotId: number }>("slot-pick", { slotId: s.id });
    setBusy(false);
    if (isFail(r)) {
      if (r.kode === "penuh") {
        setLost(s);
        setPick(null);
        setStep("list");
      } else if (r.kode === "sudah_pilih") {
        onDone();
        onClose();
      } else window.Toast?.show(r.kode === "jendela_tutup" ? t.closed : t.pickFail, "danger");
      onDone();
      return;
    }
    window.Toast?.show(t.taken(s.room, kapan(s.startsAt, lang)), "ok");
    onDone();
    onClose();
  }

  const foot =
    step === "list" ? (
      <>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          {t.later2}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!pick}
          onClick={() => setStep("confirm")}
        >
          {t.next}
        </button>
      </>
    ) : (
      <>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setStep("list")}
          disabled={busy}
        >
          {t.back}
        </button>
        <button type="button" className="btn btn--primary" onClick={take} disabled={busy}>
          {busy ? t.taking : t.take}
        </button>
      </>
    );
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.dialogTitle(tahap)}
      description={step === "list" ? t.dialogList(sisa) : t.dialogConfirm}
      size="xl"
      lang={lang}
      actions={foot}
    >
      {step === "list" ? (
        <div className="stack">
          {lost && (
            <div className="rec-note rec-note--warn" role="alert">
              <b>{t.lostTitle}</b>
              <span>{t.lostBody(lost.room, tgl(wib(lost.startsAt).tanggal, lang))}</span>
            </div>
          )}
          <Evenings slots={data.slots} lang={lang} pick={pick} setPick={setPick} />
          <p className="hint">{t.afterPick(tgl(firstCutoff(data), lang))}</p>
        </div>
      ) : (
        s && (
          <div className="stack">
            <div className="r2ticket" data-tone="pick">
              <span className="eyebrow">{t.seatPicked}</span>
              <b className="r2ticket__t">{tgl(wib(s.startsAt).tanggal, lang)}</b>
              <span className="r2ticket__row">
                <span>
                  {t.hours(...(jam(s.startsAt, s.endsAt).split("|") as [string, string]))}
                </span>
                <span>{s.room}</span>
                <span>
                  <Roll n={seatsLeft(s, s.taken)} /> {t.seatsLeft(seatsLeft(s, s.taken))}
                </span>
              </span>
            </div>
            <ul className="r2rules">
              {t.rules(tgl(cutoffDay(s), lang), tutup).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )
      )}
    </Dialog>
  );
}

/** The day before a slot's evening: the last day to ask for a change. */
function cutoffDay(s: SlotSeat): string {
  const d = new Date(`${wib(s.startsAt).tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
/** The day changes close for someone in the first evening. */
function firstCutoff(data: CandidateSlotsStage): string {
  const first = [...data.slots].sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))[0];
  return first ? cutoffDay(first) : wib(data.window.closesAt).tanggal;
}

/* ---------------------------------------------------------------- change */

export function ChangeDialog({
  lang,
  data,
  onClose,
  onSent,
}: {
  lang: Lang;
  data: CandidateSlotsStage;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = S2[lang].pick;
  const [to, setTo] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = data.slots.find((s) => s.id === data.mine?.slotId) ?? null;
  const ok = to !== null && why.trim().length >= 10;
  const sampai = mine ? tgl(cutoffDay(mine), lang) : "";

  async function kirim() {
    if (!ok) return;
    setBusy(true);
    const r = await recPost<{ ok: true }>("slot-change", { toSlot: to, reason: why.trim() });
    setBusy(false);
    if (isFail(r)) {
      window.Toast?.show(r.kode === "penuh" ? t.penuh : t.sentFail, "danger");
      onSent();
      return;
    }
    window.Toast?.show(t.sent, "ok");
    onSent();
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.changeTitle}
      description={t.changeDesc}
      size="xl"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn--primary" disabled={!ok || busy} onClick={kirim}>
            {t.send}
          </button>
        </>
      }
    >
      <div className="stack">
        {mine && (
          <div className="r2ticket" data-tone="muted">
            <span className="eyebrow">{t.now}</span>
            <b className="r2ticket__t">{tgl(wib(mine.startsAt).tanggal, lang)}</b>
            <span className="r2ticket__row">
              <span>
                {t.hours(...(jam(mine.startsAt, mine.endsAt).split("|") as [string, string]))}
              </span>
              <span>{mine.room}</span>
            </span>
          </div>
        )}
        <section className="stack stack--sm">
          <h3 className="h3">{t.moveTo}</h3>
          <Evenings
            slots={data.slots}
            lang={lang}
            pick={to}
            setPick={setTo}
            mine={mine?.id ?? null}
          />
        </section>
        <section className="stack stack--sm">
          <h3 className="h3">
            <label htmlFor="r2-why">{t.reason}</label>
          </h3>
          <div className="rec-chips">
            {t.reasons.map((r) => (
              <button
                type="button"
                className="chipbtn"
                key={r}
                aria-pressed={why === r}
                onClick={() => setWhy(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            className="textarea"
            id="r2-why"
            rows={3}
            value={why}
            maxLength={200}
            onChange={(e) => setWhy(e.target.value)}
            placeholder={t.reasonPh}
          />
          <span className="hint num">
            {why.trim().length < 10 ? t.reasonMin(why.trim().length) : t.reasonOk}
          </span>
        </section>
        <p className="hint">{t.changeFoot(sampai)}</p>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ card */

export function PickCard({
  lang,
  tahap,
  data,
  onPick,
  onChange,
  onChanged,
}: {
  lang: Lang;
  tahap: string;
  data: CandidateSlotsStage;
  onPick: () => void;
  onChange: () => void;
  onChanged: () => void;
}) {
  const t = S2[lang].pick;
  const w = data.window;
  const mine = data.slots.find((s) => s.id === data.mine?.slotId) ?? null;
  const pend =
    data.change?.status === "open" ? data.slots.find((s) => s.id === data.change?.toSlot) : null;
  const hari = [...new Set(data.slots.map((s) => wib(s.startsAt).tanggal))].sort();
  const buka = tgl(wib(w.opensAt).tanggal, lang);
  const bukaFull = `${buka}, ${wib(w.opensAt).jam}`;
  const tutupFull = `${tgl(wib(new Date(Date.parse(w.closesAt) - 1).toISOString()).tanggal, lang)}, ${wib(new Date(Date.parse(w.closesAt) - 1).toISOString()).jam}`;
  const withdraw = async () => {
    const res = await recPost<{ ok: true }>("slot-change", { withdraw: true });
    window.Toast?.show(isFail(res) ? t.sentFail : t.withdrawn, isFail(res) ? "danger" : undefined);
    onChanged();
  };

  if (!mine) {
    if (!w.open)
      return (
        <section className="panel r2pick" data-st="open">
          <div className="stack stack--sm">
            <span className="eyebrow rec-eyebrow">{t.eyebrow(tahap)}</span>
            <b className="r2pick__t">
              {Date.now() < Date.parse(w.opensAt) ? t.later(bukaFull) : t.closed}
            </b>
          </div>
        </section>
      );
    return (
      <section className="panel r2pick" data-st="open">
        <div className="stack stack--sm">
          <span className="eyebrow rec-eyebrow">{t.eyebrow(tahap)}</span>
          <b className="r2pick__t">{t.openTitle}</b>
          <span className="hint">
            {t.openBody(
              hari.length > 1
                ? REC[lang].time.range(tgl(hari[0], lang), tgl(hari[hari.length - 1], lang))
                : hari[0]
                  ? tgl(hari[0], lang)
                  : "",
              bukaFull,
              tutupFull,
            )}
          </span>
          <span className="hint r2pick__lab">{t.left}</span>
          <span className="r2pick__sum">
            {hari.map((d) => (
              <span key={d}>
                <b className="num">
                  {data.slots
                    .filter((s) => wib(s.startsAt).tanggal === d)
                    .reduce((a, s) => a + seatsLeft(s, s.taken), 0)}
                </b>
                <span className="hint">{tgl(d, lang).split(",")[0]}</span>
              </span>
            ))}
          </span>
        </div>
        <button type="button" className="btn btn--primary btn--lg" onClick={onPick}>
          <span className="btn__label">{t.btn}</span>
        </button>
      </section>
    );
  }

  const ch = data.change;
  const via = data.mine!.via;
  const terakhir = ch && ch.status !== "open" && ch.status !== "withdrawn" ? ch : null;
  const lewat = !data.canChange;
  return (
    <section className="panel r2pick" data-st="picked">
      <div className="stack stack--sm">
        <div className="row row--between" style={{ gap: 8 }}>
          <span className="eyebrow rec-eyebrow">{t.yourTitle(tahap)}</span>
          {terakhir?.status === "approved" && <span className="pill pill--ok">{t.justMoved}</span>}
        </div>
        {terakhir?.status === "approved" && (
          <div className="rec-note r2note--ok" role="status">
            <b>{t.approved}</b>
            <span>{t.approvedBody(`${mine.room}, ${tgl(wib(mine.startsAt).tanggal, lang)}`)}</span>
            {terakhir.decidedAt && <span className="hint">{kapan(terakhir.decidedAt, lang)}</span>}
          </div>
        )}
        {terakhir?.status === "declined" && (
          <div className="rec-note rec-note--warn" role="status">
            <b>{t.declined}</b>
            <span>{terakhir.note ? `"${terakhir.note}"` : t.declinedBody}</span>
            {terakhir.decidedAt && <span className="hint">{kapan(terakhir.decidedAt, lang)}</span>}
          </div>
        )}
        <div
          className="r2ticket"
          data-tone={terakhir?.status === "approved" ? "ok" : "pick"}
          data-flash={terakhir?.status === "approved" ? "yes" : undefined}
        >
          <b className="r2ticket__t">{tgl(wib(mine.startsAt).tanggal, lang)}</b>
          <span className="r2ticket__row">
            <span>
              {t.hours(...(jam(mine.startsAt, mine.endsAt).split("|") as [string, string]))}
            </span>
            <span>{mine.room}</span>
          </span>
          <span className="hint">
            {via === "self"
              ? t.youPicked(kapan(data.mine!.at, lang))
              : via === "auto"
                ? t.byAuto
                : t.byPanitia}
          </span>
        </div>
        {pend && (
          <div className="r2pend" role="status">
            <span className="r2pend__dot" aria-hidden="true" />
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{t.pending}</b>
              <span className="hint">
                {t.pendingLine(
                  `${pend.room}, ${tgl(wib(pend.startsAt).tanggal, lang)}`,
                  data.change?.reason ?? "",
                )}
              </span>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={withdraw}>
              {t.withdraw}
            </button>
          </div>
        )}
      </div>
      {!pend && (
        <span className="stack stack--sm r2pick__btn">
          <button type="button" className="btn" disabled={lewat} onClick={onChange}>
            <span className="btn__label">{t.ask}</span>
          </button>
          <span className="hint">
            {lewat && data.changeUntil
              ? t.afterCutoff(tgl(wib(data.changeUntil).tanggal, lang))
              : data.changeUntil
                ? t.until(
                    tgl(
                      wib(new Date(Date.parse(data.changeUntil) - 1).toISOString()).tanggal,
                      lang,
                    ),
                  )
                : ""}
          </span>
        </span>
      )}
    </section>
  );
}
