/**
 * The examiner pieces of the Plotting board (mockup r4-plot / r6-plot): the Penguji pool card, the lane inside
 * every slot card and the chips that are dragged between them. They live inside the board's own DndContext
 * (PlottingTab's Papan), so an examiner drags from the pool onto a lane exactly like a candidate onto a slot.
 *
 *   pool chip   id `exp:<nim>`          data { ex, nim, from: "pool" }
 *   lane chip   id `exl:<slot>:<nim>`   data { ex, nim, from: slotId }   (also a drop target: lands before it)
 *   lane        id `ex:<slot>`          drop at the end
 *   pool        id `expool`             drop here to take someone out of a lane
 */
import { useRef, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import Disclose from "../../../ui/Disclose";
import IconButton from "../../../ui/IconButton";
import Pill from "../../../ui/Pill";
import { useMinWidth } from "../../../../lib/hooks";
import type { IvCrewResponse, IvCrewSlot } from "../../../../lib/recruitment/iv-client";
import { warnaDivisi } from "../divisi";
import { CB, type CrewBoardWords } from "./crewBoardStrings";
import { IV } from "./ivStrings";
import type { Lang } from "../../../../lib/kelas";

export interface ExData {
  ex: true;
  nim: string;
  from: number | "pool";
}

export interface CrewFlag {
  tone: "danger" | "warn";
  text: string;
  at: string;
  /** The slot to bring into view for Lihat */
  go: number;
  /** Set when the flag belongs to one slot's column (a PJ shortage belongs to the shift) */
  slotId: number | null;
}

/** What CrewBoard hands to the board: pieces to place, and the handler for an examiner drop. */
export interface CrewCtx {
  /** The check card and the pool; `extra` are flags the board adds (a candidate with two slots at once) */
  top: (extra: CrewFlag[]) => ReactNode;
  lane: (slotId: number) => ReactNode;
  flagsOf: (slotId: number) => CrewFlag[];
  drop: (data: ExData, overId: string | null) => void;
  overlay: (data: ExData) => ReactNode;
  picker: ReactNode;
  stage: string;
}

export interface LaneEnv {
  d: IvCrewResponse;
  lang: Lang;
  can: boolean;
  busy: boolean;
  kodeOf: (nim: string) => string;
  clashAt: (nim: string, s: IvCrewSlot) => IvCrewSlot | undefined;
  want: (s: IvCrewSlot) => number;
  when: (s: IvCrewSlot) => string;
  onRemove: (s: IvCrewSlot, nim: string) => void;
  onPlus: (s: IvCrewSlot) => void;
}

function useBoth<T extends HTMLElement>(a: (n: T | null) => void, b: (n: T | null) => void) {
  const aRef = useRef(a);
  const bRef = useRef(b);
  aRef.current = a;
  bRef.current = b;
  return useRef((n: T | null) => {
    aRef.current(n);
    bRef.current(n);
  }).current;
}

function LaneChip({ env, s, nim, i }: { env: LaneEnv; s: IvCrewSlot; nim: string; i: number }) {
  const t = CB(env.lang);
  const panel = env.d.template.mode === "panel";
  const per = Math.max(1, env.d.template.per);
  const drag = useDraggable({
    id: `exl:${s.id}:${nim}`,
    data: { ex: true, nim, from: s.id } satisfies ExData,
    disabled: !env.can,
  });
  const drop = useDroppable({ id: `exc:${s.id}:${nim}`, disabled: !env.can });
  const ref = useBoth<HTMLSpanElement>(drag.setNodeRef, drop.setNodeRef);
  const code = env.kodeOf(nim);
  const clash = env.clashAt(nim, s);
  return (
    <span
      ref={ref}
      className="r4ex"
      data-clash={clash ? "yes" : undefined}
      data-b={!panel && i % per === 0 ? Math.floor(i / per) + 1 : undefined}
      data-static={env.can ? undefined : "yes"}
      style={drag.isDragging ? { opacity: 0.4 } : undefined}
      {...(env.can ? { ...drag.attributes, ...drag.listeners } : {})}
    >
      <b>{code}</b>
      {env.can && (
        <button
          type="button"
          className="r4ex__x"
          aria-label={t.remove(code)}
          disabled={env.busy}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => env.onRemove(s, nim)}
        >
          <XIcon size={14} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** The row under a slot's head: who examines it, with a plus for the dialog on a phone. */
export function CrewLane({ env, s }: { env: LaneEnv; s: IvCrewSlot }) {
  const t = CB(env.lang);
  const panel = env.d.template.mode === "panel";
  const want = env.want(s);
  const zone = useDroppable({ id: `ex:${s.id}`, disabled: !env.can });
  return (
    <div
      className={`r4lane${panel ? " r6lane" : ""}`}
      data-short={s.penguji.length < want ? "yes" : undefined}
    >
      <span className="r4lane__l">
        {panel ? t.lanePanel : t.laneBooth}{" "}
        <span className="r4lane__n num">
          {s.penguji.length}/{want || env.d.template.per}
        </span>
      </span>
      <div
        ref={zone.setNodeRef}
        className="r4lane__z"
        data-over={zone.isOver && env.can ? "yes" : undefined}
      >
        {s.penguji.map((n, i) => (
          <LaneChip key={n} env={env} s={s} nim={n} i={i} />
        ))}
        {!s.penguji.length && <span className="r4lane__none">{t.empty}</span>}
      </div>
      {env.can && (
        <span className="r4lane__add">
          <IconButton
            sm
            icon={PlusIcon}
            label={t.add(s.room, env.when(s))}
            onClick={() => env.onPlus(s)}
          />
        </span>
      )}
    </div>
  );
}

function PoolChip({
  nim,
  code,
  n,
  div,
  can,
  tip,
}: {
  nim: string;
  code: string;
  n: number;
  div: string | null;
  can: boolean;
  tip: string;
}) {
  const drag = useDraggable({
    id: `exp:${nim}`,
    data: { ex: true, nim, from: "pool" } satisfies ExData,
    disabled: !can,
  });
  return (
    <span
      ref={drag.setNodeRef}
      className="r4pc"
      style={
        {
          "--c": warnaDivisi(div),
          ...(drag.isDragging ? { opacity: 0.4 } : null),
        } as React.CSSProperties
      }
      data-zero={n ? undefined : "yes"}
      data-static={can ? undefined : "yes"}
      title={tip}
      {...(can ? { ...drag.attributes, ...drag.listeners } : {})}
    >
      <b>{code}</b>
      <span className="num">{n}</span>
    </span>
  );
}

export function CrewTop({
  env,
  flags,
  jump,
}: {
  env: LaneEnv;
  flags: CrewFlag[];
  jump: (slotId: number) => void;
}) {
  const t = CB(env.lang);
  const tt = IVT(env.lang);
  const { d } = env;
  const panel = d.template.mode === "panel";
  const roomy = useMinWidth(820);
  const nD = flags.filter((f) => f.tone === "danger").length;
  const nW = flags.length - nD;
  const pool = useDroppable({ id: "expool", disabled: !env.can });
  const n = (nim: string) => d.slots.filter((s) => s.penguji.includes(nim)).length;
  const chips = (
    <div
      ref={pool.setNodeRef}
      className="r4pool__z"
      data-over={pool.isOver && env.can ? "yes" : undefined}
    >
      {d.pool.map((p) => (
        <PoolChip
          key={p.nim}
          nim={p.nim}
          code={p.kode}
          n={n(p.nim)}
          div={p.div}
          can={env.can}
          tip={`${p.nama} · ${panel ? tt.nightsOf(n(p.nim)) : tt.slotsOf(n(p.nim))}`}
        />
      ))}
    </div>
  );
  return (
    <div className="r4top">
      <section
        className="panel r4check"
        data-ok={flags.length ? undefined : "yes"}
        aria-live="polite"
      >
        <div className="panel__head">
          <h3 className="panel__title">{tt.check}</h3>
          <span className="row" style={{ gap: 6 }}>
            {nD > 0 && <Pill tone="danger">{tt.clashes(nD)}</Pill>}
            {nW > 0 && <Pill tone="warn">{tt.toFill(nW)}</Pill>}
            {!flags.length && <Pill tone="ok">{tt.ready}</Pill>}
          </span>
        </div>
        {flags.length > 0 ? (
          <ul className="r4check__list">
            {flags.map((f, i) => (
              <li key={i} data-t={f.tone}>
                <span className="r4check__dot" aria-hidden="true" />
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b>{f.text}</b>
                  <span className="hint">{f.at}</span>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => jump(f.go)}>
                  <span className="btn__label">{t.show}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="hint">{tt.allGood}</span>
        )}
      </section>
      <section className="panel r4pool">
        <div className="panel__head">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="panel__title">{t.poolTitle}</h3>
            <span className="hint">
              {roomy ? t.poolHint(d.template.per, panel) : t.poolHintPhone}
            </span>
          </div>
        </div>
        {roomy ? chips : <Disclose head={<b>{t.poolAll(d.pool.length)}</b>}>{chips}</Disclose>}
      </section>
    </div>
  );
}

/** Words the existing crew strings already carry, read through IV() so there is one source for them. */
function IVT(lang: Lang) {
  const c = IV(lang).crew;
  return {
    check: c.check,
    ready: c.ready,
    clashes: c.clashes,
    toFill: c.toFill,
    allGood: ALL_GOOD[lang],
    nightsOf: (n: number) => NIGHTS[lang](n),
    slotsOf: (n: number) => SLOTS_OF[lang](n),
  };
}
const ALL_GOOD: Record<Lang, string> = {
  id: "Tidak ada penguji atau kandidat yang bentrok, tidak ada ruang yang melebihi kapasitas, dan tiap ruang punya penguji.",
  en: "No examiner or candidate clashes, no room over capacity, and every room has its examiners.",
  zh: "没有考官或候选人冲突，没有教室超出容量，每个教室都有考官。",
};
const SLOTS_OF: Record<Lang, (n: number) => string> = {
  id: (n) => `${n} slot`,
  en: (n) => `${n} slots`,
  zh: (n) => `${n} 个时段`,
};
const NIGHTS: Record<Lang, (n: number) => string> = {
  id: (n) => `${n} malam`,
  en: (n) => `${n} evenings`,
  zh: (n) => `${n} 晚`,
};

export type { CrewBoardWords };
