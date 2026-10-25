/**
 * The candidate's envelopes on /recruitment (06, mockup r2-caas): the sealed
 * hero card at the top of the page, the inbox in the side column, and the
 * thank-you card after a Gagal. A sealed envelope never says what is in it;
 * the page keeps the journey, the badge and Pilih Jadwal as they were until
 * the envelope is opened (the parent decides that from `opened`).
 */
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import type { Lang } from "../../../lib/kelas";
import { tanggalWib } from "../../../lib/recruitment/gates";
import type { CutStage, EnvelopeView, RecEvent } from "../../../lib/recruitment/types";
import { S2 } from "../s2Strings";
import { Kartu, tgl } from "../shared";

/** The mini envelope: sealed (the rainbow edge), opened, or still to come. */
export function Mini({ st, motion }: { st: "sealed" | "opened" | "coming"; motion?: string }) {
  return (
    <span className="r2mini" data-st={st} data-motion={motion} aria-hidden="true">
      <i className="r2mini__flap" />
      <i className="r2mini__seal" />
    </span>
  );
}

const wibTgl = (iso: string, lang: Lang) => tgl(tanggalWib(new Date(iso)).tanggal, lang);
const wibJam = (iso: string) => tanggalWib(new Date(iso)).jam;

interface Row {
  stage: CutStage;
  st: "sealed" | "opened" | "coming";
  env?: EnvelopeView;
  at?: string;
}

/** One row per announced stage: the revealed ones, then what is on its way. */
function rows(
  envelopes: EnvelopeView[],
  pending: { stage: CutStage; revealAt: string }[],
  events: RecEvent[],
  hariIni: string,
): Row[] {
  const out: Row[] = envelopes.map((env) => ({
    stage: env.stage,
    st: env.opened ? "opened" : "sealed",
    env,
  }));
  const have = new Set(out.map((r) => r.stage));
  for (const p of pending)
    if (!have.has(p.stage)) {
      out.push({ stage: p.stage, st: "coming", at: p.revealAt });
      have.add(p.stage);
    }
  for (const e of events) {
    const s = e.stage as CutStage | null;
    if (e.kind !== "announcement" || !s || have.has(s) || e.startsOn < hariIni) continue;
    out.push({ stage: s, st: "coming", at: `${e.startsOn}T${e.dayStart ?? "12:00"}:00+07:00` });
    have.add(s);
  }
  return out;
}

export function Inbox({
  lang,
  envelopes,
  pending,
  events,
  hariIni,
  motion,
  onOpen,
}: {
  lang: Lang;
  envelopes: EnvelopeView[];
  pending: { stage: CutStage; revealAt: string }[];
  events: RecEvent[];
  hariIni: string;
  motion: string;
  onOpen: (env: EnvelopeView) => void;
}) {
  const t = S2[lang].inbox;
  const list = rows(envelopes, pending, events, hariIni);
  const sealed = list.filter((r) => r.st === "sealed").length;
  return (
    <Kartu
      title={t.title}
      className="r2inbox"
      aside={sealed > 0 ? <Pill tone="warn">{t.sealedBadge(sealed)}</Pill> : undefined}
    >
      {list.length === 0 ? (
        <span className="hint">{t.empty}</span>
      ) : (
        <ul className="r2inbox__list">
          {list.map((r) => (
            <li className="r2inbox__row" data-st={r.st} key={r.stage}>
              <Mini st={r.st} motion={motion} />
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{t.stage[r.stage]}</b>
                {r.st === "opened" && r.env ? (
                  <span className="r2inbox__meta">
                    <Pill tone={r.env.result === "lolos" ? "ok" : undefined}>
                      {r.env.result === "lolos" ? t.lolos : t.gagal}
                    </Pill>
                    <span className="hint">{t.opened(wibTgl(r.env.revealAt, lang))}</span>
                  </span>
                ) : (
                  <span className="hint">
                    {r.st === "sealed"
                      ? t.sealed
                      : r.at
                        ? t.comingAt(wibTgl(r.at, lang), wibJam(r.at))
                        : ""}
                  </span>
                )}
              </span>
              <span className="r2inbox__act">
                {r.st === "sealed" && r.env && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => onOpen(r.env!)}
                  >
                    <span className="btn__label">{t.open}</span>
                  </button>
                )}
                {r.st === "opened" && r.env && (
                  <IconButton
                    icon={ArrowCounterClockwiseIcon}
                    label={t.replay}
                    onClick={() => onOpen(r.env!)}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Kartu>
  );
}

/** The card at the top of the page while an envelope waits. */
export function SealedHero({
  lang,
  stage,
  onOpen,
  motion,
}: {
  lang: Lang;
  stage: CutStage;
  onOpen: () => void;
  motion: string;
}) {
  const t = S2[lang].inbox;
  return (
    <section className="panel r2hero">
      <div className="r2hero__env" aria-hidden="true">
        <Mini st="sealed" motion={motion} />
      </div>
      <div className="stack stack--sm" style={{ minWidth: 0 }}>
        <span className="eyebrow rec-eyebrow">{t.heroEyebrow}</span>
        <b className="r2hero__t">{t.heroTitle(t.stage[stage])}</b>
        <span className="hint">{t.heroHint}</span>
      </div>
      <button type="button" className="btn btn--primary btn--lg" onClick={onOpen}>
        <span className="btn__label">{t.heroBtn}</span>
      </button>
    </section>
  );
}

/** After a Gagal: what they got through, and that the page stays. */
export function ThanksCard({ lang, stage }: { lang: Lang; stage: CutStage }) {
  const t = S2[lang].inbox;
  return (
    <section className="panel r2thanks">
      <span className="eyebrow">{t.thanksEyebrow(t.stage[stage])}</span>
      <b className="r2thanks__t">{t.thanksTitle}</b>
      <span className="hint">{t.thanksBody}</span>
    </section>
  );
}
