/**
 * Gets the painted sky's sprites for scene.ts without blocking the page.
 *
 * Normally a module worker (sky.worker.ts) draws and encodes them on an OffscreenCanvas while the page
 * hydrates; measured at a 6x slower CPU that was 0.7 s of main thread on every full page load, even at Low
 * Detail. If the browser has no Worker or OffscreenCanvas, the worker cannot start (a stricter policy, an
 * old engine), it errors, or it is silent for too long, the same sprites are drawn on the main thread in an
 * idle callback, which is what the page did before. Either way the result is cached per theme.
 */
import { sprites, type SpriteSet, type Theme } from "./painters";
import type { SkyReply, SkyRequest } from "./sky.worker";

/** A worker that has not answered by then is given up on */
const GIVE_UP_MS = 20000;

const pending = new Map<Theme, Promise<SpriteSet>>();
// undefined: not tried yet, null: unavailable or failed
let worker: Worker | null | undefined;
let seq = 0;

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    worker = new Worker(new URL("./sky.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

function viaWorker(T: Theme): Promise<SpriteSet> {
  const w = startWorker();
  if (!w) return Promise.reject(new Error("no worker"));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = window.setTimeout(() => fail(new Error("worker is silent")), GIVE_UP_MS);
    const done = (e: MessageEvent<SkyReply>) => {
      if (e.data.id !== id) return;
      cleanup();
      if ("set" in e.data) resolve(e.data.set);
      else reject(new Error(e.data.error));
    };
    const fail = (err: unknown) => {
      cleanup();
      worker = null; // do not ask a broken worker again
      w.terminate();
      reject(err instanceof Error ? err : new Error("worker failed"));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      w.removeEventListener("message", done);
      w.removeEventListener("error", fail);
      w.removeEventListener("messageerror", fail);
    };
    w.addEventListener("message", done);
    w.addEventListener("error", fail);
    w.addEventListener("messageerror", fail);
    w.postMessage({ id, T } satisfies SkyRequest);
  });
}

function onMainThread(T: Theme): Promise<SpriteSet> {
  return new Promise((resolve) => {
    const run = () => resolve(sprites(T));
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
      .requestIdleCallback;
    if (idle) idle(run);
    else window.setTimeout(run, 30);
  });
}

/** The sprites of a theme: from the worker if it can, else painted here. Cached, so asking twice is free. */
export function loadSprites(T: Theme): Promise<SpriteSet> {
  let p = pending.get(T);
  if (!p) {
    p = viaWorker(T).catch(() => onMainThread(T));
    pending.set(T, p);
  }
  return p;
}
