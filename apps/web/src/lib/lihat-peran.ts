/**
 * Lihat sebagai Peran: an Admin (the Tim right) previews IRIS as one of the
 * eight role presets. The preset is kept in sessionStorage, so only this tab
 * changes, and the signed-in person's rights are swapped for the preset's
 * in the browser only. Nothing is granted: while previewing, every write to
 * the API is refused here before it leaves the tab, and the API still checks
 * the real person.
 */
import type { Me } from "./app.js";
import { isPresetPeran, petaHak, presetOrang, type PresetPeran } from "./hak.js";

const KUNCI = "iris-lihat-peran";

export function bacaLihatPeran(): PresetPeran | null {
  try {
    const v = sessionStorage.getItem(KUNCI);
    return isPresetPeran(v) ? v : null;
  } catch {
    return null;
  }
}

/** Starts the preview and reloads, so every island draws the preset. */
export function mulaiLihatPeran(p: PresetPeran): void {
  try {
    sessionStorage.setItem(KUNCI, p);
  } catch {
    return; // private mode: no preview
  }
  location.reload();
}

/** Ends the preview; `muat` reloads the page back to the real rights. */
export function selesaiLihatPeran(muat = true): void {
  try {
    sessionStorage.removeItem(KUNCI);
  } catch {
    /* ignore */
  }
  if (muat) location.reload();
}

/**
 * The signed-in person as the preset sees IRIS: tier, badges, division and
 * every right from the preset. Only a holder of the Tim right previews; for
 * anyone else a stored preset is dropped.
 */
export function sebagaiPeran(me: Me): Me {
  const p = bacaLihatPeran();
  if (!p || me.role !== "asisten") return me;
  if (me.hak?.tim !== true) {
    selesaiLihatPeran(false);
    return me;
  }
  const o = presetOrang(p);
  pasangPenjaga();
  return {
    ...me,
    tier: o.tier,
    badges: [...o.badges],
    kodeDivisi: o.divisi ?? null,
    hak: petaHak(o),
    lihatPeran: p,
  };
}

/* ------------------------------------------------------- the write guard */

const TOLAK = {
  id: "Pratinjau hanya untuk melihat. Perubahan ditolak.",
  en: "The preview is view only. The change was refused.",
  zh: "预览只能查看。修改已被拒绝。",
};

/** A request that would change something: any method but GET and HEAD to
 *  the API, except signing in and out. */
export function tulisanApi(url: string, method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  if (m === "GET" || m === "HEAD") return false;
  const path = new URL(url, "http://iris.local").pathname;
  return path.startsWith("/api/") && !path.startsWith("/api/auth/");
}

let terpasang = false;

/** Wraps fetch once for this tab: a write is answered 403 with a toast. */
function pasangPenjaga(): void {
  if (terpasang || typeof window === "undefined") return;
  terpasang = true;
  const asli = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : undefined);
    if (!tulisanApi(url, method)) return asli(input, init);
    const l = document.documentElement.lang;
    const lang = l === "en" ? "en" : l.startsWith("zh") ? "zh" : "id";
    window.Toast?.show(TOLAK[lang], "warn");
    return Promise.resolve(
      new Response(JSON.stringify({ ok: false, kode: "lihat_peran" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
}
