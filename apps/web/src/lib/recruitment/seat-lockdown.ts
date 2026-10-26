/**
 * The runner's soft lockdown as pure rules (EXAM-ENGINE 7): which signals
 * make a kejadian, how they merge, when one closes, and the devtools
 * heuristic. The page feeds it browser events; nothing here touches the DOM.
 * Nothing fails a candidate automatically: the Master decides.
 */

export const STRIKE_KINDS = ["layar", "tab", "fokus", "tempel", "alat", "ganda"] as const;
export type StrikeKind = (typeof STRIKE_KINDS)[number];

/** A signal within this long of a strike joins it (7: Debounce) */
export const DEBOUNCE_MS = 1500;
/** Records kept per seat and part; after that only the page's count grows */
export const MAX_STRIKES_PER_PART = 50;

export interface Strike {
  id: string;
  kinds: StrikeKind[];
  /** Server time it began */
  at: number;
  /** Server time the page was back; null while it is out */
  back: number | null;
}

export type StrikeEvent = { type: "open" | "update" | "close"; strike: Strike } | null;

export interface PageState {
  fullscreen: boolean;
  visible: boolean;
  focused: boolean;
}

export class StrikeTracker {
  private list: Strike[] = [];
  capped = false;
  private readonly newId: () => string;

  constructor(newId: () => string) {
    this.newId = newId;
  }

  all(): readonly Strike[] {
    return this.list;
  }

  /** The strike the seat is out on right now, if any */
  open(): Strike | null {
    const last = this.list[this.list.length - 1];
    return last && last.back === null ? last : null;
  }

  /**
   * A signal at server time `at`. `instant` strikes (a paste) have no away
   * time: they open and close at once.
   */
  signal(kind: StrikeKind, at: number, o: { instant?: boolean } = {}): StrikeEvent {
    const last = this.list[this.list.length - 1];
    const joins = last && (last.back === null || at - last.back <= DEBOUNCE_MS);
    if (joins) {
      if (last.kinds.includes(kind)) return null;
      last.kinds = [...last.kinds, kind];
      // A signal after the strike closed puts the seat back out, unless it has no away time.
      if (last.back !== null && !o.instant) last.back = null;
      return { type: "update", strike: { ...last } };
    }
    if (this.list.length >= MAX_STRIKES_PER_PART) {
      this.capped = true;
      return null;
    }
    const s: Strike = { id: this.newId(), kinds: [kind], at, back: o.instant ? at : null };
    this.list.push(s);
    return { type: o.instant ? "close" : "open", strike: { ...s } };
  }

  /** The page's state changed: close the open strike once everything is right again */
  settle(p: PageState, at: number): StrikeEvent {
    const s = this.open();
    if (!s || !p.fullscreen || !p.visible || !p.focused) return null;
    s.back = at;
    return { type: "close", strike: { ...s } };
  }
}

/** 7: outer minus inner above 160 px wide or 200 px tall while fullscreen */
export function devtoolsLikelyOpen(w: {
  outerWidth: number;
  innerWidth: number;
  outerHeight: number;
  innerHeight: number;
}): boolean {
  return w.outerWidth - w.innerWidth > 160 || w.outerHeight - w.innerHeight > 200;
}

/** F12, Ctrl+Shift+I/J/C, Cmd+Opt+I/J */
export function isDevtoolsKey(e: {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): boolean {
  if (e.key === "F12") return true;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && e.shiftKey && (k === "i" || k === "j" || k === "c")) return true;
  if (e.metaKey && e.altKey && (k === "i" || k === "j")) return true;
  return false;
}
