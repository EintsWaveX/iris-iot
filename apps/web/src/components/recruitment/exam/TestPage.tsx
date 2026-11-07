/**
 * /recruitment/test, /en/recruitment/test, /zh/recruitment/test (prompt 10):
 * the candidate's exam. One component decides what to show from three things
 * it always has: GET test (the room, the seat, the part), the relay room's
 * live state, and the server's clock. Nothing here polls while the live link
 * is up: a Master action arrives as a frame, GET test is asked again only
 * when the part on screen is missing, when the seat's own state changed
 * (seat time, Kumpulkan, a move) or when the link comes back. While the link
 * is down it asks every 15 s.
 *
 * The test has no navbar from the first check-in step; only "not open yet"
 * keeps the recruitment shell. Layers portal into the full screen element
 * (the kit's useFullscreenEl), which is this page's root.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pathForLang, type Lang } from "../../../lib/kelas";
import { saveLangPref, usePoll } from "../../../lib/hooks";
import { tri } from "../../../lib/labels";
import { isFail, recGet } from "../../../lib/recruitment/client";
import type { PesanUjian, RoomPublic } from "../../../lib/recruitment/room-relay";
import { useCadanganRuang, useJamRuang } from "../../../lib/recruitment/room-client";
import { useSeatLive } from "../../../lib/recruitment/seat-client";
import { seatPhase, type SeatPhase } from "../../../lib/recruitment/seat-state";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { useRevealMotion } from "../reveal/fx";
import CheckIn from "./CheckIn";
import { useLockdown } from "./lockdown/useLockdown";
import { BigIcon, Gate } from "./parts";
import Runner from "./Runner";
import { Finished, Lobby, NotOpen, Notice } from "./Screens";
import LccPage from "../livecode/LccPage";
import TestDisplay, { TestLangProvider } from "./TestDisplay";
import Watermark from "./Watermark";
import { ackWarning, toast as seatToast } from "./seatApi";
import { ViolationChip, ViolationWarning } from "./ViolationWarning";
import { TS } from "./testStrings";
import Skeleton from "../../ui/Skeleton";

import "../recruitment-s3-runner.css";
import "../recruitment-checkin.css";
import "../recruitment-runner-look.css";
import "../recruitment-lcc-draw.css";
import "../recruitment-runner-v2.css";
import "../recruitment-runner-fs.css";

type Fetched = { tv: TestView } | { err: string };

async function fetchTest(): Promise<Fetched> {
  const r = await recGet<TestView>("test");
  if (!isFail(r)) return { tv: r };
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return { err: r.kode };
}

/** The newer of the two copies of the room (the relay's frame and GET test's) */
const newer = (a: RoomPublic | null, b: RoomPublic | null) =>
  !a ? b : !b ? a : b.seq > a.seq || (b.seq === a.seq && b.now > a.now) ? b : a;

const TIME_UP_MS = 1500;

export default function TestPage({ lang: routeLang }: { lang: Lang }) {
  // The language the page is in. Tampilan changes it in place (a reload would leave full screen and
  // count as a strike), so the route's language is only where it starts.
  const [lang, setLangState] = useState<Lang>(routeLang);
  const setLang = useCallback(
    (to: Lang) => {
      if (to === lang) return;
      saveLangPref(to);
      setLangState(to);
      try {
        history.replaceState(
          history.state,
          "",
          pathForLang(location.pathname + location.search + location.hash, to),
        );
      } catch {
        /* the address bar is cosmetic */
      }
    },
    [lang],
  );
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
    document.title = `${tri(lang, "Tes Tulis dan Koding", "Written and Coding Test", "笔试与编程")} · IRIS IoT`;
  }, [lang]);
  const t = TS[lang];
  const root = useRef<HTMLDivElement | null>(null);
  const motion = useRevealMotion();
  const poll = usePoll<Fetched>(fetchTest, 300_000, true, ["recroom"], 400);
  // A one-off refusal (a session glitch) must not unmount the runner and lose its unsent answers:
  // keep the last good page, and show the refusal only when there never was one.
  const lastGood = useRef<Fetched | null>(null);
  if (poll.data && "tv" in poll.data) lastGood.current = poll.data;
  const data =
    poll.data && "err" in poll.data && lastGood.current && poll.data.err !== "belum_masuk_oprec"
      ? lastGood.current
      : poll.data;
  const tv = data && "tv" in data ? data.tv : null;
  const seat = tv?.seat ?? null;
  const refresh = poll.refresh;

  const [twoTabs, setTwoTabs] = useState(false);
  // Live Coding: the relay says a compile finished or the Master changed the seat's boards (bump), and the queue moved (chips)
  const [lcSignal, setLcSignal] = useState(0);
  const live = useSeatLive(
    seat?.id ?? null,
    !!seat,
    (d) => {
      refresh();
      if (d.lc || d.reroll) setLcSignal((n) => n + 1);
    },
    refresh,
    (m: PesanUjian) => {
      // The judge answered (or the queue moved): ask for the seat's results again
      if (m.j === "antrean" || m.j === "judge" || m.j === "kompilasi") setLcSignal((n) => n + 1);
    },
  );
  useCadanganRuang(refresh, !!seat && live.status !== "live");
  const now = useJamRuang();

  const room = newer(tv?.room ?? null, live.room);
  const phase: SeatPhase = useMemo(
    () =>
      seatPhase(
        room,
        seat
          ? { id: seat.id, extraMs: seat.extraMs, done: seat.done }
          : { id: 0, extraMs: 0, done: {} },
        now,
      ),
    [room, seat, now],
  );
  const checkedIn = !!seat?.checkedIn;
  // A part this seat already started in another room (a Susulan seat): it is closed here, so there
  // is nothing to answer, no lockdown and no strikes. The lobby says so.
  const doneElsewhere =
    phase.k === "work" &&
    phase.part !== "livecode" &&
    (tv?.closedElsewhere ?? []).includes(phase.part as never);

  const working = checkedIn && !doneElsewhere && (phase.k === "work" || phase.k === "spin");
  const lock = useLockdown({
    active: working,
    seatId: seat?.id ?? null,
    part: phase.k === "work" ? phase.part : phase.k === "spin" ? "livecode" : null,
    rootRef: root,
    onScreenshot: () => seatToast(TS[lang].over.shot, "warn"),
    // A strike was answered with the seat's points: ask again, the view carries any new warning
    onTally: refresh,
  });
  // A warning stays until the seat says it saw it; the ones acknowledged here are hidden at once
  const [acked, setAcked] = useState<ReadonlySet<number>>(new Set());
  const pendingWarning = (tv?.warnings ?? []).find((w) => !acked.has(w.id)) ?? null;
  const ackWarn = useCallback(
    (id: number) => {
      setAcked((s) => new Set(s).add(id));
      void ackWarning(id).then(refresh);
    },
    [refresh],
  );

  // The part stays on screen under the time-up card even after the API stops handing it out.
  const lastPart = useRef<NonNullable<TestView["part"]> | null>(null);
  if (tv?.part) lastPart.current = tv.part;
  // The seat's own time runs out: the card shows over the blurred test, then the lobby. Decided in
  // the same render the phase changes in, so the lobby never flashes in between.
  const prev = useRef<SeatPhase>(phase);
  const upUntil = useRef(0);
  if (
    prev.current.k === "work" &&
    phase.k === "wait" &&
    phase.why === "time" &&
    prev.current.part === phase.part
  )
    upUntil.current = Date.now() + TIME_UP_MS;
  prev.current = phase;
  const showUp = upUntil.current > Date.now();

  // A part is running for this seat but its questions are not loaded: ask the API once per part.
  const asked = useRef("");
  const needPart =
    phase.k === "work" &&
    phase.part !== "livecode" &&
    checkedIn &&
    !doneElsewhere &&
    tv?.part?.key !== phase.part;
  useEffect(() => {
    if (!needPart || phase.k !== "work") return;
    const k = `${phase.part}:${room?.seq}`;
    if (asked.current === k) return;
    asked.current = k;
    refresh();
  }, [needPart, phase, room?.seq, refresh]);

  // The other-tab warning clears itself when it stops coming.
  useEffect(() => {
    if (!twoTabs) return;
    const id = setTimeout(() => setTwoTabs(false), 30_000);
    return () => clearTimeout(id);
  }, [twoTabs]);
  const onTwoTabs = useCallback(() => setTwoTabs(true), []);

  /* ------------------------------------------------------------ which screen */
  let screen: React.ReactNode;
  let shell = false;
  if (!data) {
    screen =
      poll.errors >= 2 ? (
        <Notice
          lang={lang}
          motion={motion}
          title={t.errTitle}
          body={t.errBody}
          action={
            <button type="button" className="btn btn--primary" onClick={refresh}>
              {t.retry}
            </button>
          }
        />
      ) : (
        <Gate motion={motion} title={t.loading}>
          <Skeleton height={120} />
        </Gate>
      );
  } else if ("err" in data) {
    screen =
      data.err === "belum_masuk_oprec" ? (
        <Notice lang={lang} motion={motion} title={t.signedOutTitle} body={t.signedOutBody} />
      ) : data.err === "bukan_peserta" ? (
        <Notice lang={lang} motion={motion} title={t.notCandTitle} body={t.notCandBody} />
      ) : (
        <Notice lang={lang} motion={motion} title={t.errTitle} body={t.errBody} />
      );
  } else if (!tv!.room || phase.k === "none" || phase.k === "setup") {
    shell = true;
    screen = <NotOpen lang={lang} tv={tv!} />;
  } else if (phase.k === "finished") {
    screen = <Finished lang={lang} tv={{ ...tv!, room }} motion={motion} />;
  } else if (!checkedIn) {
    screen = (
      <CheckIn
        lang={lang}
        tv={tv!}
        motion={motion}
        link={live.status}
        enter={lock.enter}
        refresh={refresh}
      />
    );
  } else if (phase.k === "spin" || (phase.k === "work" && phase.part === "livecode")) {
    screen = (
      <LccPage
        lang={lang}
        tv={{ ...tv!, room }}
        phase={phase}
        motion={motion}
        signal={lcSignal}
        linkDown={live.status !== "live"}
      />
    );
  } else if (
    !doneElsewhere &&
    (phase.k === "work" || (phase.k === "wait" && showUp)) &&
    (tv!.part ?? (phase.k === "wait" ? lastPart.current : null))?.key === phase.part
  ) {
    const timeUp = phase.k === "wait";
    screen = (
      <Runner
        key={phase.part}
        lang={lang}
        tv={{ ...tv!, room }}
        part={(tv!.part ?? lastPart.current)!}
        left={phase.k === "work" ? phase.left : 0}
        paused={phase.k === "work" && phase.paused}
        timeUp={timeUp}
        cover={working && !lock.fullscreen}
        twoTabs={twoTabs}
        linkDown={live.status !== "live"}
        motion={motion}
        reportProgress={live.progress}
        onTwoTabs={onTwoTabs}
        onRefresh={refresh}
        onEnterFullscreen={() => void lock.enter()}
      />
    );
  } else if (phase.k === "work" && !doneElsewhere) {
    screen = (
      <Gate motion={motion} title={t.loading}>
        <Skeleton height={120} />
      </Gate>
    );
  } else {
    screen = <Lobby lang={lang} tv={{ ...tv!, room }} phase={phase} motion={motion} />;
  }

  return (
    <div ref={root} className={"r3page" + (shell ? " r3page--shell" : "")} data-m={motion}>
      <TestLangProvider lang={lang} setLang={setLang}>
        {screen}
        {/* The room that is not open yet keeps the recruitment navbar, which has its own Tampilan */}
        {!shell && <TestDisplay />}
        {working && <ViolationChip lang={lang} v={tv?.violation ?? null} />}
        {working && seat?.heldAt != null && (
          <div className="r3over r3over--pause" role="alertdialog" aria-labelledby="r3hold-h">
            <div className="r3over__card">
              <BigIcon kind="pause" />
              <h2 className="r3h2" id="r3hold-h">
                {t.viol.held.title}
              </h2>
              <p className="lede">{t.viol.held.body}</p>
            </div>
          </div>
        )}
        <ViolationWarning
          lang={lang}
          warning={working ? pendingWarning : null}
          rule={tv?.violation?.rule}
          onAck={ackWarn}
        />
      </TestLangProvider>
      {working && tv?.me && <Watermark text={`${tv.me.nim} · ${tv.me.nama.split(" ")[0]}`} />}
    </div>
  );
}
