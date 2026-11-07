/**
 * The runner's soft lockdown as pure rules (EXAM-ENGINE 7): which signals
 * make a kejadian, how they merge, when one closes, and the devtools
 * heuristic. The page feeds it browser events; nothing here touches the DOM.
 * Nothing fails a candidate automatically: the Master decides.
 */

export const STRIKE_KINDS = [
  "layar",
  "tab",
  "fokus",
  "tempel",
  "alat",
  "ganda",
  "foto",
  // Added 9 Nov 2026: a second screen, the page reloaded or reopened inside a part, an automated
  // browser, a copy / cut / print / select-all attempt (seen, weight 0) and a lost connection (weight 0)
  "layar2",
  "muat",
  "otomatis",
  "salin",
  "putus",
] as const;

/**
 * A screenshot key (4 Nov 2026). A page cannot stop a screenshot, only notice the keys that ask for
 * one: PrintScreen, and the Mac shortcuts Cmd+Shift+3, 4 and 5. Windows' Win+Shift+S never reaches
 * the page; the snipping bar taking focus shows as `fokus` instead.
 */
export function isScreenshotKey(e: {
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  if (e.key === "PrintScreen") return true;
  return !!e.metaKey && !!e.shiftKey && ["3", "4", "5", "#", "$", "%"].includes(e.key);
}
export type StrikeKind = (typeof STRIKE_KINDS)[number];

/** A signal within this long of a strike joins it (7: Debounce) */
export const DEBOUNCE_MS = 1500;
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
  /** The browser says the line is up; left out when unknown (a strike for `putus` closes only when this is not false) */
  online?: boolean;
}

export class StrikeTracker {
  private list: Strike[] = [];
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
    const s: Strike = { id: this.newId(), kinds: [kind], at, back: o.instant ? at : null };
    this.list.push(s);
    return { type: o.instant ? "close" : "open", strike: { ...s } };
  }

  /** The page's state changed: close the open strike once everything is right again */
  settle(p: PageState, at: number): StrikeEvent {
    const s = this.open();
    if (!s || !p.fullscreen || !p.visible || !p.focused || p.online === false) return null;
    s.back = at;
    return { type: "close", strike: { ...s } };
  }
}

/** How long the window must stay out of focus before it counts (8 Nov 2026) */
export const FOKUS_GRACE_MS = 600;
/** After a fullscreen change the window manager may blur and refocus the window; this long, blur is not news */
export const FS_QUIET_MS = 800;
/** How often the page looks at its own state, so a browser that drops an event cannot leave a strike stuck */
export const WATCH_MS = 500;

/**
 * What the page's state calls for right now, whichever events did or did not arrive (8 Nov 2026).
 * Linux and Firefox blur and refocus the window around fullscreen changes and tab switches, and some
 * window managers never send `focus` back, so the events alone mislabel every strike as `fokus` and
 * can leave one open for good (an open strike swallows every later signal, so nothing counts again).
 * The hook asks this on every event and on a timer, and the strike follows the state.
 *
 * `fokus` is only asked for when nothing else explains it: the page is visible and full screen, the
 * focus has been gone for FOKUS_GRACE_MS and no fullscreen change just happened.
 */
export class PageWatch {
  private since: number | null = null;
  private quietUntil = 0;

  /** A fullscreen change happened at `now`: blur around it is the window manager's, not the seat's */
  quiet(now: number): void {
    this.quietUntil = now + FS_QUIET_MS;
    this.since = null;
  }

  /**
   * Things that count once when they begin, not while they last (9 Nov 2026): a second screen
   * appearing (or already there when the part began) and an automated browser. The caller sends them
   * as instant strikes. A browser that cannot say gives `undefined`, which counts nothing.
   */
  private seen = { extended: false, automated: false };
  edges(p: { extended?: boolean; automated?: boolean }): StrikeKind[] {
    const out: StrikeKind[] = [];
    if (p.extended && !this.seen.extended) out.push("layar2");
    this.seen.extended = !!p.extended;
    if (p.automated && !this.seen.automated) out.push("otomatis");
    this.seen.automated = !!p.automated;
    return out;
  }

  read(p: PageState, now: number): StrikeKind[] {
    const out: StrikeKind[] = [];
    if (p.online === false) out.push("putus");
    if (!p.visible) out.push("tab");
    if (!p.fullscreen) out.push("layar");
    if (p.focused || !p.visible || !p.fullscreen || now < this.quietUntil) {
      this.since = null;
    } else {
      this.since ??= now;
      if (now - this.since >= FOKUS_GRACE_MS) out.push("fokus");
    }
    return out;
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

/**
 * How many screens the browser says are attached (9 Nov 2026): Chromium tells (`screen.isExtended`),
 * other browsers do not. The check-in row and the second-screen strike both read it.
 */
export function screenCount(s: { isExtended?: boolean } | null): "one" | "more" | "unknown" {
  if (!s || typeof s.isExtended !== "boolean") return "unknown";
  return s.isExtended ? "more" : "one";
}

/**
 * Whether the page came back to a part it was already in (9 Nov 2026): a reload, a reopened tab or a
 * return from another page. `life` is this page's own id; the same id seen again is the same page
 * life (an effect running twice), a different one is a new page. Best effort: false where storage is
 * blocked.
 */
export function reopened(
  store: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null,
  key: string,
  life: string,
): boolean {
  try {
    const old = store?.getItem(key) ?? null;
    store?.setItem(key, life);
    return old !== null && old !== life;
  } catch {
    return false;
  }
}
