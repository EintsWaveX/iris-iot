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
import type { Lang } from "../../../lib/kelas";
import { usePoll } from "../../../lib/hooks";
import { isFail, recGet } from "../../../lib/recruitment/client";
import type { PesanUjian, RoomPublic } from "../../../lib/recruitment/room-relay";
import { useCadanganRuang, useJamRuang } from "../../../lib/recruitment/room-client";
import { useSeatLive } from "../../../lib/recruitment/seat-client";
import { seatPhase, type SeatPhase } from "../../../lib/recruitment/seat-state";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { useRevealMotion } from "../reveal/fx";
import CheckIn from "./CheckIn";
import { useLockdown } from "./lockdown/useLockdown";
import { Gate } from "./parts";
import Runner from "./Runner";
import { Finished, Lobby, NotOpen, Notice } from "./Screens";
import LccPage from "../livecode/LccPage";
import { TS } from "./testStrings";

import "../recruitment-s3-runner.css";

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

export default function TestPage({ lang }: { lang: Lang }) {
  const t = TS[lang];
  const root = useRef<HTMLDivElement | null>(null);
  const motion = useRevealMotion();
  const poll = usePoll<Fetched>(fetchTest, 300_000, true, ["recroom"], 400);
  const data = poll.data;
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

  const working = checkedIn && (phase.k === "work" || phase.k === "spin");
  const lock = useLockdown({
    active: working,
    seatId: seat?.id ?? null,
    part: phase.k === "work" ? phase.part : phase.k === "spin" ? "livecode" : null,
    rootRef: root,
  });

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
    phase.k === "work" && phase.part !== "livecode" && checkedIn && tv?.part?.key !== phase.part;
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
          <span className="skeleton" style={{ height: 120 }} />
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
  } else if (phase.k === "work") {
    screen = (
      <Gate motion={motion} title={t.loading}>
        <span className="skeleton" style={{ height: 120 }} />
      </Gate>
    );
  } else {
    screen = (
      <Lobby lang={lang} tv={{ ...tv!, room }} phase={phase} motion={motion} onChanged={refresh} />
    );
  }

  return (
    <div ref={root} className={"r3page" + (shell ? " r3page--shell" : "")} data-m={motion}>
      {screen}
    </div>
  );
}
