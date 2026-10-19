import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../app";
import { TUNGGU_SINKRON_MS } from "../tp";

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

  // 10-18 21:14 on prod: forced LMS reads took 13 to 26 s (39 s at most in
  // three days), so Sinkron Sekarang said "Belum berhasil" for runs that went through.
  it("waits out a forced LMS read when asked to", async () => {
    vi.stubGlobal("fetch", lambat(39_000));
    const r = postJson("/api/tp/sinkron", {}, TUNGGU_SINKRON_MS);
    await vi.advanceTimersByTimeAsync(39_000);
    expect(await r).toEqual({ ok: true });
    expect(TUNGGU_SINKRON_MS).toBeGreaterThan(39_000);
  });
});
