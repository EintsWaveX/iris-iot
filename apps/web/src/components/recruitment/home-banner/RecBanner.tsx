/**
 * The Home recruitment banner (prompt 03, PRD 5.1, mockup r1-home). One card
 * tall, above the hero and the practicum's own top (user, 2026-10-26: under
 * them it sat below the fold); its edge is the kit's rainbow sweep as a
 * 1.5 px ring (still at Low Detail and with reduced motion). The line it
 * shows follows who is looking: GET /api/recruitment/banner, refetched on the
 * recruitment topics. Nothing shows while no edition runs, while Sembunyikan
 * Oprec is on, before the daftar gate, or when the viewer has nothing to be
 * told. Home passes `state` (its own useRecBanner) so it can hold its first
 * paint until the banner has answered, and the hero never jumps down.
 */
import type { ReactNode } from "react";
import type { PollState } from "../../../lib/hooks";
import type { BannerResponse } from "../../../lib/recruitment/types";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { href } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { useRecBanner, useRecCandidates, useRecEdition } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { useRevealClock } from "../../../lib/recruitment/reveal-clock";
import { STAGES, type StageKey } from "../../../lib/recruitment/types";
import { alamatBagian } from "../../../lib/recruitment/panel-tab";
import Pill from "../../ui/Pill";
import { REC } from "../recruitmentStrings";
import { Countdown, kapanAcara, tgl } from "../shared";
import { BN } from "./bannerStrings";
import { FORMULIR } from "../../../lib/recruitment/formulir";
import { judulAcara } from "../judul";

const JOURNEY: (StageKey | "daftar")[] = ["daftar", ...STAGES];

function Langkah({ cur, lang }: { cur: StageKey; lang: Lang }) {
  const ci = JOURNEY.indexOf(cur);
  return (
    <ol className="rec-bn__steps" aria-label={BN[lang].candidate.stages}>
      {JOURNEY.map((s, i) => (
        <li
          key={s}
          data-st={i < ci ? "done" : i === ci ? "cur" : "next"}
          data-tip={REC[lang].stage[s]}
        >
          <i />
        </li>
      ))}
    </ol>
  );
}

function Statistik({ lang }: { lang: Lang }) {
  const t = BN[lang].panitia;
  const edisi = useRecEdition();
  const boleh = edisi.data?.rights?.candidates === true;
  const daftar = useRecCandidates(boleh);
  const baris = daftar.data?.candidates;
  // Every seated Panitia may see the candidates (rights.ts), so while the counts load they
  // keep their room, hidden: above the practicum top the banner must not grow after it drew.
  if (edisi.updatedAt !== null && !boleh) return null;
  const tunggu = baris ? undefined : ({ visibility: "hidden" } as const);
  const menunggu = baris ? baris.filter((c) => c.status === "applied").length : 0;
  return (
    <>
      <div className="rec-bn__stat" style={tunggu} aria-hidden={baris ? undefined : true}>
        <b className="num">{baris?.length ?? 0}</b>
        <span className="hint">{t.applicants}</span>
      </div>
      <div className="rec-bn__stat" style={tunggu} aria-hidden={baris ? undefined : true}>
        <b className="num">{menunggu}</b>
        <span className="hint">{t.waiting}</span>
      </div>
    </>
  );
}

export default function RecBanner({
  lang,
  state,
}: {
  lang: Lang;
  state?: PollState<BannerResponse | null>;
}) {
  const sendiri = useRecBanner(!state);
  const bn = state ?? sendiri;
  const d = bn.data;
  // The sealed envelope chip arrives on time: the banner asks again the moment a locked reveal comes.
  useRevealClock(
    d && d.kind === "candidate" ? d.now : null,
    d && d.kind === "candidate" && d.nextReveal ? [d.nextReveal] : [],
    bn.refresh,
  );
  if (!d || d.kind === "none") return null;
  const t = BN[lang];
  const r = REC[lang];
  const link = (path: string) => href(lang, path);

  const box = (body: ReactNode, cta: ReactNode, extra?: ReactNode) => (
    <section className="rec-bn rec-bn--home" aria-label={t.label}>
      <div className="rec-bn__in">
        <div className="rec-bn__body">{body}</div>
        {extra && <div className="rec-bn__extra">{extra}</div>}
        <div className="rec-bn__cta">{cta}</div>
      </div>
    </section>
  );
  const eyebrow = <span className="rec-bn__eyebrow">{t.label}</span>;

  if (d.kind === "visitor") {
    const a = d.opens ? tgl(d.opens, lang) : "";
    const b = d.closes ? tgl(d.closes, lang) : "";
    return box(
      <>
        {eyebrow}
        <b className="rec-bn__title">{t.visitor.title}</b>
        <span className="hint">{d.daftarOpen ? t.visitor.hint(a, b) : t.visitor.soon(a)}</span>
      </>,
      <>
        <a className="btn btn--ghost" href={link("/recruitment")}>
          {t.visitor.stages}
        </a>
        {/* Anyone may apply with an oprec account (2026-10-24): the page opens the account dialog.
            While the Google Form is the way in (2026-10-25), Daftar opens the form. */}
        {FORMULIR && d.daftarOpen ? (
          <a
            className="btn btn--primary"
            href={FORMULIR.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="btn__label">{t.visitor.signIn}</span>
          </a>
        ) : (
          <a className="btn btn--primary" href={link("/recruitment?daftar=1")}>
            <span className="btn__label">{t.visitor.signIn}</span>
          </a>
        )}
      </>,
    );
  }

  if (d.kind === "praktikan") {
    const tutup = d.closesAt ? Date.parse(d.closesAt) : null;
    // Daftar closes at the end of the last registration day: say that day, 23:59.
    const akhir = tutup ? tanggalWib(new Date(tutup - 60_000)) : null;
    return box(
      <>
        {eyebrow}
        <b className="rec-bn__title">{t.praktikan.title}</b>
        {akhir && (
          <span className="hint">{t.praktikan.hint(tgl(akhir.tanggal, lang), "23:59")}</span>
        )}
      </>,
      <>
        <a className="btn btn--ghost" href={link("/recruitment")}>
          {t.praktikan.stages}
        </a>
        {FORMULIR ? (
          <a
            className="btn btn--primary"
            href={FORMULIR.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="btn__label">{t.praktikan.apply}</span>
          </a>
        ) : (
          <a className="btn btn--primary" href={link("/recruitment?daftar=1")}>
            <span className="btn__label">{t.praktikan.apply}</span>
          </a>
        )}
      </>,
      tutup ? (
        <>
          <span className="rec-bn__label">{t.praktikan.closesIn}</span>
          <Countdown ke={tutup} label={t.praktikan.closesAria} lang={lang} />
        </>
      ) : undefined,
    );
  }

  if (d.kind === "candidate") {
    const judul =
      d.status === "revision"
        ? t.candidate.revision
        : d.status === "applied"
          ? t.candidate.applied
          : d.status === "accepted"
            ? t.candidate.accepted
            : t.candidate.stage(r.stage[d.stage]);
    const hint = d.envelope
      ? t.candidate.envelope
      : d.next
        ? t.candidate.next(judulAcara(d.next, lang), kapanAcara(d.next, lang))
        : t.candidate.nothing;
    return box(
      <>
        {eyebrow}
        <span className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <b className="rec-bn__title">{judul}</b>
          {d.envelope && <Pill tone="warn">{t.candidate.sealedChip}</Pill>}
        </span>
        <span className="hint">{hint}</span>
      </>,
      d.status === "revision" ? (
        <a className="btn btn--primary" href={link("/recruitment?berkas=1")}>
          <span className="btn__label">{t.candidate.fix}</span>
        </a>
      ) : (
        <a className="btn btn--primary" href={link("/recruitment")}>
          <span className="btn__label">{t.candidate.open}</span>
          <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
        </a>
      ),
      <Langkah cur={d.stage} lang={lang} />,
    );
  }

  if (d.kind === "cut") {
    return box(
      <>
        {eyebrow}
        <b className="rec-bn__title">{t.cut.title(r.stageShort[d.stage])}</b>
        <span className="hint">{t.cut.hint}</span>
      </>,
      <a className="btn" href={link("/recruitment")}>
        {t.cut.journey}
      </a>,
    );
  }

  if (d.kind === "panitia") {
    const hari = d.today.map((e) => judulAcara(e, lang)).join(", ");
    return box(
      <>
        {eyebrow}
        <b className="rec-bn__title">{t.panitia.title(d.seat ?? "")}</b>
        <span className="hint">{hari ? t.panitia.today(hari) : t.panitia.none}</span>
      </>,
      <a
        className="btn btn--primary"
        href={alamatBagian(lang === "id" ? "" : `/${lang}`, "ringkasan")}
      >
        <span className="btn__label">{t.panitia.panel}</span>
        <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
      </a>,
      <Statistik lang={lang} />,
    );
  }

  // Another Asisten: today's events, read only.
  const hari = d.today.map((e) => judulAcara(e, lang)).join(", ");
  return box(
    <>
      {eyebrow}
      <b className="rec-bn__title">{t.asisten.title}</b>
      <span className="hint">{t.asisten.today(hari)}</span>
    </>,
    <a className="btn" href={alamatBagian(lang === "id" ? "" : `/${lang}`, "kalender")}>
      {t.asisten.calendar}
    </a>,
  );
}
