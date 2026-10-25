/**
 * A candidate's answers as the page keeps them (EXAM-ENGINE 5.5, 5.6):
 * what counts as answered, and the saver that sends each change to the API.
 * Each question keeps only its latest value; an answer the server has not
 * taken lives in localStorage and goes out again on return, so a dropped
 * connection or a reload loses nothing. The server alone decides whether a
 * write is still allowed (`answerOpen`). Pure apart from the timers and the
 * storage it is handed.
 */
import type { PartKey, Value } from "./exam-types.js";

/** True when the value holds something the candidate picked or typed */
export function isAnswered(v: unknown): boolean {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if ("pick" in o) return typeof o.pick === "string" && o.pick !== "";
  if ("order" in o) return Array.isArray(o.order) && o.order.length > 0;
  if (Array.isArray(o.picks)) return o.picks.length > 0;
  if (o.picks && typeof o.picks === "object")
    return Object.values(o.picks as Record<string, unknown>).some((x) => x != null && x !== "");
  if (o.pairs && typeof o.pairs === "object")
    return Object.values(o.pairs as Record<string, unknown>).some((x) => x != null && x !== "");
  if (o.blanks && typeof o.blanks === "object")
    return Object.values(o.blanks as Record<string, unknown>).some(
      (x) => typeof x === "string" && x.trim() !== "",
    );
  return false;
}

export type SaveState = "ok" | "ing" | "wait" | "closed";

export type SaveResult =
  | { ok: true; rev: number; at: number; warn?: "tab_lain" }
  | { ok: false; offline: true }
  | { ok: false; kode: string };

export interface SaverStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface SaveBody {
  part: PartKey;
  q: number;
  value: Value;
  rev: number;
  tab: string;
}

const DEBOUNCE_MS = 400;
const RETRY_MS = [2000, 5000, 10_000, 15_000];

export class AnswerSaver {
  private pending = new Map<number, Value>();
  private flying = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retry = 0;
  private dead = false;
  private readonly o: {
    seat: number;
    part: PartKey;
    tab: string;
    send: (b: SaveBody) => Promise<SaveResult>;
    storage: SaverStorage | null;
    revs: Record<number, number>;
    onState: (s: SaveState) => void;
    onWarn?: (w: "tab_lain") => void;
    onRefused?: (kode: string) => void;
  };

  constructor(o: AnswerSaver["o"]) {
    this.o = o;
  }

  private get key() {
    return `iris-rec-ans:${this.o.seat}:${this.o.part}`;
  }

  private persist() {
    try {
      if (!this.pending.size) this.o.storage?.removeItem(this.key);
      else this.o.storage?.setItem(this.key, JSON.stringify(Object.fromEntries(this.pending)));
    } catch {
      /* storage can be full or blocked: the answer still goes out */
    }
  }

  private plan(ms: number) {
    if (this.dead) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, ms);
  }

  set(q: number, value: Value) {
    this.pending.set(q, value);
    this.persist();
    this.o.onState("ing");
    this.plan(DEBOUNCE_MS);
  }

  /** Answers an old page left in storage go out again */
  resume() {
    try {
      const raw = this.o.storage?.getItem(this.key);
      if (!raw) return;
      for (const [q, v] of Object.entries(JSON.parse(raw) as Record<string, Value>))
        if (!this.pending.has(Number(q))) this.pending.set(Number(q), v);
    } catch {
      return;
    }
    if (this.pending.size) {
      this.o.onState("ing");
      this.plan(DEBOUNCE_MS);
    }
  }

  /** Send everything now, for the instant a seat's time ends */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.drain();
  }

  dispose() {
    this.dead = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async drain() {
    let offline = false;
    let refused = false;
    for (const [q, value] of [...this.pending]) {
      if (this.flying.has(q)) continue;
      this.flying.add(q);
      let r: SaveResult;
      try {
        r = await this.o.send({
          part: this.o.part,
          q,
          value,
          rev: this.o.revs[q] ?? 0,
          tab: this.o.tab,
        });
      } catch {
        r = { ok: false, offline: true };
      }
      this.flying.delete(q);
      if (r.ok) {
        this.o.revs[q] = r.rev;
        // A newer value for this question may have come in while this one flew.
        if (this.pending.get(q) === value) this.pending.delete(q);
        if (r.warn) this.o.onWarn?.(r.warn);
      } else if ("offline" in r) offline = true;
      else {
        this.pending.delete(q);
        refused = true;
        this.o.onRefused?.(r.kode);
      }
    }
    this.persist();
    if (this.dead) return;
    if (offline) {
      this.o.onState("wait");
      this.plan(RETRY_MS[Math.min(this.retry++, RETRY_MS.length - 1)]);
    } else if (this.pending.size) {
      this.o.onState("ing");
      this.plan(DEBOUNCE_MS);
    } else {
      this.retry = 0;
      this.o.onState(refused ? "closed" : "ok");
    }
  }
}
