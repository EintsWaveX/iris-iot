import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../app";

/** A server that answers after `ms`, or gives up when the page aborts. */
function lambat(ms: number) {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(new Response('{"ok":true}', { status: 200 })), ms);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  );
}

describe("how long a POST waits", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives up after 15 s by default", async () => {
    vi.stubGlobal("fetch", lambat(20_000));
    const r = postJson("/api/x").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await r).toBeInstanceOf(DOMException);
  });

  // A slow action may ask for longer (10-18: a 39 s read once said "Belum
  // berhasil" for a run that went through).
  it("waits longer when asked to", async () => {
    vi.stubGlobal("fetch", lambat(39_000));
    const r = postJson("/api/x", {}, 60_000);
    await vi.advanceTimersByTimeAsync(39_000);
    expect(await r).toEqual({ ok: true });
  });
});
