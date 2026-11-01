/**
 * The Susulan offer on the CaAs's own page (mockup r6 SusulanCard): offered,
 * thanks (said yes), the slot once Panitia placed them, and the end of the
 * road if they declined or the deadline passed. The server decides every state
 * (src/lib/recruitment/makeup.ts); this card only shows it and sends the answer.
 */
import { useState } from "react";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import type { MakeupOffer } from "../../../lib/recruitment/makeup-client";
import { MK } from "../makeupStrings";
import { tgl } from "../shared";

const wib = (iso: string) => tanggalWib(new Date(iso));

export default function MakeupCard({
  lang,
  offer,
  onChanged,
}: {
  lang: Lang;
  offer: MakeupOffer;
  onChanged: () => void;
}) {
  const w = MK(lang);
  const t = w.caas;
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const stage = w.stage[offer.stage];
  const by = offer.deadline ? wib(offer.deadline) : null;

  const answer = async (ans: "ikut" | "tidak") => {
    setBusy(true);
    const r = await recPost<{ ok: true }>("ms-answer", { stage: offer.stage, ans });
    setBusy(false);
    setAsk(false);
    if (isFail(r)) {
      const kode = r.kode;
      window.Toast?.show(
        kode === "lewat_batas" ? t.late : kode === "sudah_dijawab" ? t.done : t.fail,
        "danger",
      );
    } else window.Toast?.show(t.sent);
    onChanged();
  };

  if (offer.state === "mundur")
    return (
      <section className="panel r2pick" data-st="out">
        <div className="stack stack--sm">
          <span className="eyebrow rec-eyebrow">{t.eyebrow(stage)}</span>
          <b className="r2pick__t">{t.outTitle}</b>
          <span className="hint">{offer.unanswered ? t.outLate : t.outDeclined}</span>
          <span className="hint">{t.outBody}</span>
        </div>
      </section>
    );

  if (offer.state === "ditempatkan" && offer.seat) {
    const a = wib(offer.seat.startsAt);
    const b = wib(offer.seat.endsAt);
    return (
      <section className="panel r2pick" data-st="picked">
        <div className="stack stack--sm">
          <span className="eyebrow rec-eyebrow">{t.eyebrow(stage)}</span>
          <div className="r2ticket" data-tone="ok">
            <span className="eyebrow">{t.seatTitle}</span>
            <b className="r2ticket__t">{tgl(a.tanggal, lang)}</b>
            <span className="r2ticket__row">
              <span>{t.hours(a.jam, b.jam)}</span>
              <span>{offer.seat.room}</span>
            </span>
            <span className="hint">{t.seatBody}</span>
          </div>
          {offer.via && <span className="hint">{t.byPanitia(w.via[offer.via as "line"])}</span>}
        </div>
      </section>
    );
  }

  if (offer.state === "ya" || offer.state === "ditempatkan")
    return (
      <section className="panel r2pick" data-st="picked">
        <div className="stack stack--sm">
          <span className="eyebrow rec-eyebrow">{t.eyebrow(stage)}</span>
          <b className="r2pick__t">{t.joinedTitle}</b>
          <span className="hint">{t.joinedBody}</span>
          {offer.via && <span className="hint">{t.byPanitia(w.via[offer.via as "line"])}</span>}
        </div>
      </section>
    );

  // tawar: offered, waiting for the answer.
  return (
    <section className="panel r2pick" data-st="open">
      <div className="stack stack--sm">
        <span className="eyebrow rec-eyebrow">{t.eyebrow(stage)}</span>
        <b className="r2pick__t">{t.offerTitle}</b>
        <span className="hint">
          {offer.day && by
            ? t.offerBody(
                tgl(offer.day, lang),
                offer.from ?? "",
                offer.to ?? "",
                `${tgl(by.tanggal, lang)}, ${by.jam}`,
              )
            : t.joinedBody}
        </span>
      </div>
      <span className="stack stack--sm r2pick__btn">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          disabled={busy}
          onClick={() => answer("ikut")}
        >
          <span className="btn__label">{t.join}</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => setAsk(true)}
        >
          <span className="btn__label">{t.decline}</span>
        </button>
      </span>
      <Dialog
        open={ask}
        onOpenChange={setAsk}
        title={t.askTitle(stage)}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => answer("tidak")}
            >
              {t.askYes}
            </button>
          </>
        }
      >
        <p>{t.askBody}</p>
      </Dialog>
    </section>
  );
}
