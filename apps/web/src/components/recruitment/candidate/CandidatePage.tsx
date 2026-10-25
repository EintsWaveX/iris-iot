/**
 * /recruitment, the candidate's page (prompt 03, PRD 5.2, mockup r1-caas):
 * the journey as a constellation, the next public event with a countdown,
 * the public calendar, the documents card and drawer, the envelope inbox
 * (empty until S2) and Mundur behind a HoldButton. The same page serves a
 * visitor (the stages and a way in), a Praktikan before and after applying,
 * and an Asisten (read only). Everything is live: it refetches on the
 * recruitment topics, never on a timer.
 *
 * ?daftar=1 opens the application, ?berkas=1 the documents, #kalender
 * scrolls to the calendar (the banner and the navbar link to them).
 */
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import HoldButton from "../../ui/HoldButton";
import SegmentedControl from "../../ui/SegmentedControl";
import { href, useMe } from "../../../lib/app";
import { useMinWidth } from "../../../lib/hooks";
import type { Lang } from "../../../lib/kelas";
import {
  bukaAkun,
  isFail,
  recPost,
  useRecAkun,
  useRecCalendar,
  useRecEdition,
  useRecMe,
  useRecSlots,
} from "../../../lib/recruitment/client";
import { useRevealClock } from "../../../lib/recruitment/reveal-clock";
import { pickEvent, pickWindow } from "../../../lib/recruitment/slots";
import {
  gateClosesAt,
  gateOpen,
  nextPublicEvent,
  tanggalWib,
} from "../../../lib/recruitment/gates";
import { alamatBagian } from "../../../lib/recruitment/panel-tab";
import {
  CUT_STAGES,
  DOC_REQUIRED,
  type CutStage,
  type EnvelopeOpenResponse,
  type EnvelopeView,
  type EventLite,
  type Proposal,
  type RecEvent,
  type StageKey,
  type WithdrawResponse,
} from "../../../lib/recruitment/types";
import { FORMULIR } from "../../../lib/recruitment/formulir";
import { REC } from "../recruitmentStrings";
import { Agenda, RecCalendar } from "../calendar/RecCalendar";
import {
  Countdown,
  KepalaHalaman,
  Kartu,
  StatusPill,
  kapanAcara,
  tgl,
  useHariIni,
  wibMs,
} from "../shared";
import { CAL } from "../calendar/calendarStrings";
import { useTick } from "../../../lib/app";
import { useRevealMotion } from "../reveal/fx";
import type { NextText } from "../reveal/RevealStage";
import { S2 } from "../s2Strings";
import { Inbox, SealedHero, ThanksCard } from "./Envelopes";
import { ChangeDialog, PickCard, PickDialog } from "./PilihJadwal";
import Daftar from "./Daftar";
import DocsDrawer from "./DocsDrawer";
import Journey from "./Journey";
import { CP } from "./candidateStrings";
import { judulAcara, tempatAcara } from "../judul";

// GSAP and canvas-confetti only ship when an envelope is opened.
const RevealStage = lazy(() => import("../reveal/RevealStage"));

/** The stage whose result unlocks each Pilih Jadwal: picking stays hidden until that envelope is opened. */
const GERBANG: Partial<Record<StageKey, CutStage>> = {
  tes_tulis: "berkas",
  wawancara: "tes_tulis",
  mengajar: "tubes",
};
/** The stage with a Pilih Jadwal that follows a Lolos at each cut stage. */
const LANJUT_PILIH: Partial<Record<CutStage, StageKey>> = {
  berkas: "tes_tulis",
  tes_tulis: "wawancara",
  tubes: "mengajar",
};

function Kartu404({ lang, onRetry }: { lang: Lang; onRetry: () => void }) {
  return (
    <div className="stack">
      <p className="banner banner--warn" role="alert">
        {CP[lang].error}
      </p>
      <div>
        <button type="button" className="btn" onClick={onRetry}>
          {REC[lang].retry}
        </button>
      </div>
    </div>
  );
}

export default function CandidatePage({ lang }: { lang: Lang }) {
  const t = CP[lang];
  const r = REC[lang];
  const me = useMe();
  const asisten = me?.role === "asisten";
  // The candidate is their oprec account, never the practicum sign-in (2026-10-24).
  const akun = useRecAkun(me !== undefined && !asisten);
  const caas = asisten ? null : (akun.data?.account ?? null);
  const praktikan = !!caas;
  const tamu = !asisten && !caas;
  const [reveal, setReveal] = useState<EnvelopeView | null>(null);
  const dibuka = useRef<{ stage: CutStage; result: Proposal } | null>(null);
  // While the envelope opens, the page behind it does not refetch: opening it
  // sets off the candidates topic, and a re-render under the reveal stutters
  // the swap on a slow phone. Turning the hooks back on fetches once on close.
  const rec = useRecMe(praktikan && !reveal);
  const cal = useRecCalendar(me !== undefined);
  const edisi = useRecEdition(me !== undefined);
  const hariIni = useHariIni();
  const tick = useTick(30_000);
  const lebar = useMinWidth(1100);
  const [view, setView] = useState<"bulan" | "agenda">("bulan");
  const [daftar, setDaftar] = useState(false);
  const [docs, setDocs] = useState(false);
  const [mundur, setMundur] = useState(false);
  const diminta = useRef<{ daftar: boolean; berkas: boolean; masuk: boolean } | null>(null);
  const [pickStage, setPickStage] = useState<StageKey | null>(null);
  const [chgStage, setChgStage] = useState<StageKey | null>(null);
  const motion = useRevealMotion();

  // ?daftar=1, ?berkas=1 and ?masuk=1 are read once, then dropped from the address.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    diminta.current = {
      daftar: q.get("daftar") === "1",
      berkas: q.get("berkas") === "1",
      masuk: q.get("masuk") === "1",
    };
    if (q.has("daftar") || q.has("berkas") || q.has("masuk")) {
      q.delete("daftar");
      q.delete("berkas");
      q.delete("masuk");
      const rest = q.toString();
      history.replaceState(
        history.state,
        "",
        `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`,
      );
    }
  }, []);

  const events: RecEvent[] = cal.data?.events ?? [];
  const now = new Date(tick);
  const cand = rec.data?.candidate ?? null;
  const applied = !!cand && cand.status !== "withdrawn";
  const withdrawn = cand?.status === "withdrawn";
  const regs = events.filter((e) => e.gates.includes("daftar"));
  const opensOn = regs.length
    ? regs.reduce((m, e) => (e.startsOn < m ? e.startsOn : m), regs[0].startsOn)
    : null;
  // While open, the last day is the day before the gate closes, so a gap
  // between Open Recruitment and Extend never promises a day that is shut.
  const tutupAt = gateClosesAt(events, "daftar", now);
  const closesOn = tutupAt
    ? tanggalWib(new Date(Date.parse(tutupAt) - 1)).tanggal
    : regs.length
      ? regs.reduce((m, e) => (e.endsOn > m ? e.endsOn : m), regs[0].endsOn)
      : null;
  const buka = praktikan && rec.data ? rec.data.daftarOpen : gateOpen(events, "daftar", now);
  const sebelum = !buka && !!opensOn && hariIni < opensOn;
  const panitia = asisten && edisi.data?.viewer === "panitia";
  const slots = useRecSlots(praktikan && applied && !reveal);
  // The envelope arrives on time without a refresh, counting from the server's clock.
  useRevealClock(
    rec.data?.now,
    (rec.data?.pending ?? []).map((p) => p.revealAt),
    rec.refresh,
  );

  // Open what the address asked for, once the data to decide it is in. Not
  // signed in to oprec yet: the account dialog first, then back here for it.
  const akunSiap = asisten || akun.updatedAt !== null;
  useEffect(() => {
    const d = diminta.current;
    if (!d || me === undefined || !akunSiap) return;
    if (tamu && !asisten) {
      // The Google Form is the way in: ?daftar=1 lands on the page's form card, not an account dialog.
      if (FORMULIR && d.daftar && !d.masuk && !d.berkas) {
        diminta.current = null;
        return;
      }
      if (d.daftar || d.berkas || d.masuk)
        bukaAkun(
          d.masuk ? "masuk" : "daftar",
          d.daftar ? href(lang, "/recruitment?daftar=1") : undefined,
        );
      diminta.current = null;
      return;
    }
    if (!praktikan || !rec.data) return;
    if (d.daftar && buka && !cand) setDaftar(true);
    if (d.berkas && cand) setDocs(true);
    diminta.current = null;
  }, [me, akunSiap, tamu, asisten, praktikan, rec.data, buka, cand, lang]);
  // #kalender: the browser jumped before the card existed.
  const jump = useRef(false);
  useEffect(() => {
    if (jump.current || !cal.data || location.hash !== "#kalender") return;
    jump.current = true;
    document.getElementById("kalender")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cal.data]);

  if (
    me === undefined ||
    !akunSiap ||
    cal.updatedAt === null ||
    (praktikan && rec.updatedAt === null)
  )
    return <span className="skeleton" style={{ height: 520 }} />;
  if (cal.errors > 0 && !cal.data) return <Kartu404 lang={lang} onRetry={cal.refresh} />;
  if (!cal.data)
    return (
      <div className="rec-page">
        <KepalaHalaman lang={lang} title={t.titleOpen} />
        <p className="hint">{r.noEdition}</p>
      </div>
    );

  const first = events.length
    ? events.reduce((m, e) => (e.startsOn < m ? e.startsOn : m), events[0].startsOn)
    : null;
  const bar = (
    <div className="rec-calwrap" id="kalender">
      <Kartu
        className="rec-calcard"
        title={CAL[lang].title}
        aside={
          <SegmentedControl
            aria-label={CAL[lang].view}
            value={view}
            onValueChange={(v) => setView(v as "bulan" | "agenda")}
            options={[
              { value: "bulan", label: CAL[lang].month },
              { value: "agenda", label: CAL[lang].agenda },
            ]}
          />
        }
      >
        {view === "bulan" ? (
          <RecCalendar events={events} lang={lang} hariIni={hariIni} viewer="candidate" />
        ) : (
          <Agenda events={events} lang={lang} hariIni={hariIni} viewer="candidate" />
        )}
      </Kartu>
    </div>
  );

  // ---- the side cards
  const lanjut = nextPublicEvent(
    applied ? events.filter((e) => !e.gates.includes("daftar")) : events,
    now,
  );
  const next = (() => {
    if (!applied && buka && tutupAt)
      return {
        title: t.next.closes,
        when: t.next.at(tgl(closesOn ?? hariIni, lang), "23:59 WIB"),
        ke: Date.parse(tutupAt),
      };
    if (!applied && sebelum && opensOn)
      return { title: t.next.opens, when: tgl(opensOn, lang), ke: wibMs(opensOn) };
    if (lanjut)
      return {
        title: judulAcara(lanjut, lang),
        when: t.next.at(kapanAcara(lanjut, lang), tempatAcara(lanjut.place, lang)),
        ke: wibMs(lanjut.startsOn, lanjut.dayStart ?? "00:00"),
      };
    return null;
  })();
  const nextCard = (
    <section className="panel rec-next">
      <span className="eyebrow">{t.next.eyebrow}</span>
      {next ? (
        <>
          <b className="rec-next__t">{next.title}</b>
          <span className="hint">{next.when}</span>
          {next.ke > tick && <Countdown ke={next.ke} label={next.title} lang={lang} />}
        </>
      ) : (
        <span className="hint">{t.next.nothing}</span>
      )}
    </section>
  );

  const docsMasuk = rec.data
    ? DOC_REQUIRED.filter((k) => rec.data!.documents.some((d) => d.kind === k)).length
    : 0;
  const docsCard = applied && cand && rec.data && (
    <Kartu
      title={t.docs.title}
      className="rec-docs"
      aside={
        cand.status === "revision" ? (
          <span className="pill pill--danger">{`1 ${t.docs.fix}`}</span>
        ) : (
          <span className="pill pill--ok">{`${docsMasuk}/${DOC_REQUIRED.length}`}</span>
        )
      }
    >
      <ul className="rec-docs__list">
        {DOC_REQUIRED.map((k) => (
          <li key={k} data-bad={!rec.data!.documents.some((d) => d.kind === k) ? "yes" : undefined}>
            <i />
            <span>{t.docs.kind[k]}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`btn btn--block ${cand.status === "revision" ? "btn--primary" : ""}`.trim()}
        onClick={() => setDocs(true)}
      >
        {cand.status === "revision" ? t.docs.fixBtn : t.docs.see}
      </button>
    </Kartu>
  );

  // ---- envelopes and Pilih Jadwal (S2)
  const envs = rec.data?.envelopes ?? [];
  const sealedEnv = envs.find((e) => !e.opened) ?? null;
  const out = cand?.status === "out";
  const stageOut =
    out && cand && (CUT_STAGES as readonly string[]).includes(cand.stage)
      ? (cand.stage as CutStage)
      : null;
  const describeNext =
    (stage: CutStage) =>
    (next: EventLite | null): NextText | null => {
      if (!next) return null;
      const lanjut = LANJUT_PILIH[stage];
      const pe = lanjut ? pickEvent(events, lanjut) : null;
      let extra: string | null = null;
      if (pe) {
        const w = pickWindow(pe);
        const o = tanggalWib(w.opensAt);
        const c = tanggalWib(new Date(w.closesAt.getTime() - 1));
        extra = S2[lang].reveal.pickOpens(
          `${tgl(o.tanggal, lang)}, ${o.jam}`,
          tgl(c.tanggal, lang),
        );
      }
      return {
        title: judulAcara(next, lang),
        when: t.next.at(kapanAcara(next, lang), tempatAcara(next.place, lang)),
        extra,
      };
    };
  const inbox = praktikan && applied && rec.data && (
    <Inbox
      lang={lang}
      envelopes={envs}
      pending={rec.data.pending}
      events={events}
      hariIni={hariIni}
      motion={motion}
      onOpen={setReveal}
    />
  );
  const pickCards =
    praktikan && slots.data
      ? slots.data.stages
          .filter((sd) => {
            const prev = GERBANG[sd.window.stage];
            // Picking stays hidden until the envelope that unlocks it is opened: no spoilers.
            return !prev || envs.some((e) => e.stage === prev && e.opened && e.result === "lolos");
          })
          .map((sd) => (
            <PickCard
              key={sd.window.stage}
              lang={lang}
              tahap={r.stage[sd.window.stage]}
              data={sd}
              onPick={() => setPickStage(sd.window.stage)}
              onChange={() => setChgStage(sd.window.stage)}
              onChanged={() => {
                slots.refresh();
                rec.refresh();
              }}
            />
          ))
      : null;
  const pengumuman = events.find((e) => e.kind === "announcement" && e.stage === "berkas");
  const envCard = praktikan && !applied && (
    <Kartu title={t.env.title} className="rec-env">
      <div className="rec-env__empty">
        <span className="rec-env__seal" aria-hidden="true" />
        <span className="hint">
          {applied
            ? pengumuman
              ? t.env.empty(kapanAcara(pengumuman, lang))
              : t.env.emptyNoDate
            : t.env.before}
        </span>
      </div>
    </Kartu>
  );

  // ---- the main column
  const revisi = cand?.status === "revision" && (
    <div className="rec-note rec-note--warn">
      <b>{t.revision.title}</b>
      <span>{cand.reviewNote ?? t.revision.noNote}</span>
      <span>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setDocs(true)}>
          {t.revision.fix}
        </button>
      </span>
    </div>
  );

  // The Google Form is the way in (2026-10-25): the form, the LINE group, and
  // signing in for whoever the Panitia already added.
  const ctaFormulir = FORMULIR && !asisten && !withdrawn && !applied && (
    <section className="panel rec-apply">
      <div className="stack stack--sm">
        <b className="rec-apply__t">
          {buka
            ? t.apply.formTitle
            : sebelum && opensOn
              ? t.apply.before(tgl(opensOn, lang))
              : t.apply.closed}
        </b>
        <span className="hint">{t.apply.formHint}</span>
      </div>
      <span className="row rec-apply__btn" style={{ gap: 8, flexWrap: "wrap" }}>
        {tamu && (
          <button
            type="button"
            className="btn btn--ghost btn--lg"
            onClick={() => bukaAkun("masuk")}
          >
            {t.apply.masuk}
          </button>
        )}
        <a
          className="btn btn--ghost btn--lg"
          href={FORMULIR.grupLine}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.apply.line}
        </a>
        {buka && (
          <a
            className="btn btn--primary btn--lg"
            href={FORMULIR.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="btn__label">{t.apply.form}</span>
            <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
          </a>
        )}
      </span>
    </section>
  );

  const cta =
    ctaFormulir ||
    (!applied && (
      <section className="panel rec-apply">
        <div className="stack stack--sm">
          <b className="rec-apply__t">
            {asisten
              ? t.ledeStaff
              : withdrawn
                ? t.apply.withdrawn
                : tamu
                  ? t.apply.guest
                  : buka
                    ? t.apply.open(closesOn ? tgl(closesOn, lang) : "")
                    : sebelum && opensOn
                      ? t.apply.before(tgl(opensOn, lang))
                      : t.apply.closed}
          </b>
          {!asisten && (
            <span className="hint">{withdrawn ? t.apply.hintWithdrawn : t.apply.hint}</span>
          )}
        </div>
        {asisten ? (
          panitia && (
            <a
              className="btn btn--primary btn--lg"
              href={alamatBagian(lang === "id" ? "" : `/${lang}`, "ringkasan")}
            >
              <span className="btn__label">{t.staff.panel}</span>
              <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
            </a>
          )
        ) : withdrawn ? null : tamu ? (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => bukaAkun("daftar", href(lang, "/recruitment?daftar=1"))}
          >
            <span className="btn__label">{t.apply.signIn}</span>
          </button>
        ) : (
          <span className="stack stack--sm rec-apply__btn">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={!buka}
              onClick={() => setDaftar(true)}
            >
              <span className="btn__label">{t.apply.now}</span>
            </button>
            {!buka && sebelum && <span className="hint">{t.apply.later}</span>}
          </span>
        )}
      </section>
    ));

  const journey = (
    <Kartu
      title={t.journey.title}
      className="rec-jcard"
      aside={<span className="hint">{t.journey.hint}</span>}
    >
      <Journey
        cur={applied && cand ? cand.stage : "daftar"}
        events={events}
        lang={lang}
        hariIni={hariIni}
        out={out}
      />
    </Kartu>
  );

  const lede =
    applied && caas && cand
      ? `${caas.nama} · ${caas.nim} · ${cand.biodata.kelas}`
      : first
        ? t.ledeOpen(tgl(first, lang))
        : undefined;

  return (
    <div className="rec-page">
      <KepalaHalaman
        lang={lang}
        title={applied ? t.titleApplied : asisten ? t.titleStaff : t.titleOpen}
        badge={applied && cand ? <StatusPill status={cand.status} lang={lang} lg /> : undefined}
        lede={lede}
      />
      <div className="rec-caas">
        <div className="stack stack--lg rec-caas__main">
          {!lebar && nextCard}
          {revisi}
          {cta}
          {sealedEnv && (
            <SealedHero
              lang={lang}
              stage={sealedEnv.stage}
              motion={motion}
              onOpen={() => setReveal(sealedEnv)}
            />
          )}
          {stageOut && <ThanksCard lang={lang} stage={stageOut} />}
          {pickCards}
          {!lebar && inbox}
          {journey}
          {bar}
        </div>
        <aside className="stack rec-caas__side">
          {lebar && nextCard}
          {lebar && inbox}
          {docsCard}
          {envCard}
          {applied && (
            <button type="button" className="rec-quit" onClick={() => setMundur(true)}>
              {t.withdraw.link}
            </button>
          )}
        </aside>
      </div>

      {caas && (
        <Daftar
          lang={lang}
          open={daftar}
          onOpenChange={setDaftar}
          me={caas}
          closesOn={closesOn}
          onApplied={rec.refresh}
        />
      )}
      {applied && cand && rec.data && (
        <DocsDrawer
          lang={lang}
          open={docs}
          onOpenChange={setDocs}
          candidate={cand}
          documents={rec.data.documents}
          canReplace={rec.data.daftarOpen || cand.status === "revision"}
          onChanged={rec.refresh}
        />
      )}
      {reveal && caas && (
        <Suspense fallback={null}>
          <RevealStage
            lang={lang}
            stage={reveal.stage}
            name={caas.nama.split(" ")[0]}
            result={reveal.opened ? reveal.result : null}
            through={reveal.through}
            open={async () => {
              const res = await recPost<EnvelopeOpenResponse>("envelope-open", {
                stage: reveal.stage,
              });
              if (isFail(res)) return null;
              dibuka.current = { stage: reveal.stage, result: res.result };
              return { result: res.result, next: res.next };
            }}
            describeNext={describeNext(reveal.stage)}
            onClose={() => {
              // The page behind did not refetch while the envelope opened, so
              // it still holds the sealed envelope: mark it opened here, or the
              // sealed hero shows again until the refetch on close lands.
              const d = dibuka.current;
              dibuka.current = null;
              if (d)
                rec.ubah((m) =>
                  m
                    ? {
                        ...m,
                        envelopes: m.envelopes.map((e) =>
                          e.stage === d.stage ? { ...e, opened: true, result: d.result } : e,
                        ),
                      }
                    : m,
                );
              setReveal(null);
            }}
          />
        </Suspense>
      )}
      {pickStage && slots.data?.stages.find((x) => x.window.stage === pickStage) && (
        <PickDialog
          lang={lang}
          data={slots.data.stages.find((x) => x.window.stage === pickStage)!}
          tahap={r.stage[pickStage]}
          onClose={() => setPickStage(null)}
          onDone={() => {
            slots.refresh();
            rec.refresh();
          }}
        />
      )}
      {chgStage && slots.data?.stages.find((x) => x.window.stage === chgStage) && (
        <ChangeDialog
          lang={lang}
          data={slots.data.stages.find((x) => x.window.stage === chgStage)!}
          onClose={() => setChgStage(null)}
          onSent={() => {
            slots.refresh();
            rec.refresh();
          }}
        />
      )}
      <Dialog
        open={mundur}
        onOpenChange={setMundur}
        title={t.withdraw.title}
        size="sm"
        lang={lang}
        actions={
          <button type="button" className="btn btn--ghost" onClick={() => setMundur(false)}>
            {r.cancel}
          </button>
        }
      >
        <div className="stack">
          <p>{t.withdraw.body}</p>
          <HoldButton
            label={t.withdraw.hold}
            onDone={async () => {
              const res = await recPost<WithdrawResponse>("withdraw");
              if (isFail(res)) {
                window.Toast?.show(t.withdraw.fail, "danger");
                return;
              }
              setMundur(false);
              window.Toast?.show(t.withdraw.done, "warn");
              rec.refresh();
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}
