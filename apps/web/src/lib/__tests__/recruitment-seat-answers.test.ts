import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnswerSaver,
  isAnswered,
  type SaveResult,
  type SaverStorage,
} from "../recruitment/seat-answers";

describe("isAnswered", () => {
  it("is false for null and for values with nothing picked", () => {
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered({ pick: null })).toBe(false);
    expect(isAnswered({ picks: [] })).toBe(false);
    expect(isAnswered({ picks: { 3: null } })).toBe(false);
    expect(isAnswered({ pairs: { a: null, b: null } })).toBe(false);
    expect(isAnswered({ blanks: { 1: "  ", 2: "" } })).toBe(false);
  });
  it("is true when any part is set", () => {
    expect(isAnswered({ pick: "ab12cd" })).toBe(true);
    expect(isAnswered({ picks: [4] })).toBe(true);
    expect(isAnswered({ picks: ["x"] })).toBe(true);
    expect(isAnswered({ picks: { 3: "id" } })).toBe(true);
    expect(isAnswered({ order: ["a", "b"] })).toBe(true);
    expect(isAnswered({ pairs: { a: "r1", b: null } })).toBe(true);
    expect(isAnswered({ blanks: { 1: "OUTPUT" } })).toBe(true);
  });
});

function memory(): SaverStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("AnswerSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (
    send: (b: unknown) => Promise<SaveResult>,
    storage = memory(),
    rev: Record<number, number> = {},
  ) => {
    const states: string[] = [];
    const saver = new AnswerSaver({
      seat: 7,
      part: "logika",
      tab: "tabA",
      send: send as never,
      storage,
      revs: rev,
      onState: (s) => states.push(s),
    });
    return { saver, storage, states };
  };

  it("sends only the last value after the debounce, with the rev it last saw", async () => {
    const send = vi.fn(async () => ({ ok: true as const, rev: 4, at: 1 }));
    const { saver } = make(send, memory(), { 11: 3 });
    saver.set(11, { pick: "a" });
    saver.set(11, { pick: "b" });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      part: "logika",
      q: 11,
      value: { pick: "b" },
      rev: 3,
      tab: "tabA",
    });
  });

  it("goes saving, then saved, and takes the rev the server gave", async () => {
    const send = vi.fn(async () => ({ ok: true as const, rev: 9, at: 1 }));
    const { saver, states } = make(send);
    saver.set(1, { pick: "a" });
    expect(states.at(-1)).toBe("ing");
    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toBe("ok");
    saver.set(1, { pick: "b" });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ rev: 9 }));
  });

  it("keeps an unsent answer in storage and retries until the server takes it", async () => {
    let up = false;
    const send = vi.fn(async (): Promise<SaveResult> =>
      up ? { ok: true, rev: 1, at: 1 } : { ok: false, offline: true },
    );
    const { saver, storage, states } = make(send);
    saver.set(5, { picks: [2] });
    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toBe("wait");
    expect([...storage.data.keys()][0]).toContain("7:logika");
    up = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(states.at(-1)).toBe("ok");
    expect(storage.data.size).toBe(0);
  });

  it("a fresh saver sends what an old page left in storage", async () => {
    const storage = memory();
    const down = vi.fn(async (): Promise<SaveResult> => ({ ok: false, offline: true }));
    const a = make(down, storage);
    a.saver.set(5, { picks: [2] });
    await vi.advanceTimersByTimeAsync(500);
    a.saver.dispose();
    const up = vi.fn(async (): Promise<SaveResult> => ({ ok: true, rev: 1, at: 1 }));
    const b = make(up, storage);
    b.saver.resume();
    await vi.advanceTimersByTimeAsync(500);
    expect(up).toHaveBeenCalledWith(expect.objectContaining({ q: 5, value: { picks: [2] } }));
  });

  it("drops a refused answer (time is over) instead of retrying, and says so", async () => {
    const send = vi.fn(async (): Promise<SaveResult> => ({ ok: false, kode: "waktu_habis" }));
    const { saver, storage, states } = make(send);
    saver.set(5, { pick: "x" });
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.data.size).toBe(0);
    expect(states.at(-1)).toBe("closed");
  });

  it("passes the other-tab warning on", async () => {
    const send = vi.fn(async (): Promise<SaveResult> => ({
      ok: true,
      rev: 2,
      at: 1,
      warn: "tab_lain",
    }));
    const warned = vi.fn();
    const saver = new AnswerSaver({
      seat: 1,
      part: "fitb",
      tab: "t",
      send: send as never,
      storage: memory(),
      revs: {},
      onState: () => {},
      onWarn: warned,
    });
    saver.set(2, { blanks: { 1: "x" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(warned).toHaveBeenCalledWith("tab_lain");
  });

  it("flush sends at once, for the instant a seat's time ends", async () => {
    const send = vi.fn(async () => ({ ok: true as const, rev: 1, at: 1 }));
    const { saver } = make(send);
    saver.set(3, { pick: "z" });
    await saver.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
