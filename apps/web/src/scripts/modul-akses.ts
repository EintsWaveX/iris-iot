/**
 * P6.5: module access, the client side. The API (api/session/[aksi].ts's
 * "akses" branch, api/modul/[aksi].ts's "modul_terkunci" checks) is the
 * real gate -- everything here is UX only, telling a visitor or a student
 * a module is not open yet before they try and get a locked response back,
 * and never itself deciding what a request is allowed to do.
 *
 * Assistants see every module regardless of `terbuka`, per the plan's
 * decision -- they get a "terkunci untuk praktikan" badge instead of a
 * lock screen, everywhere a lock would otherwise render.
 */

export interface AksesState {
  terbuka: number[];
  asisten: boolean;
  /** Phase 8: modules whose full journal this viewer may open (open AND a
   *  practicum they did; all four for an assistant, none signed out). */
  jurnal: number[];
}

let cached: Promise<AksesState> | null = null;

/** The public list is cached at Vercel's edge for up to 45 s, so an Asisten
 *  reads the uncached `?meta=1` one: right after a switch flips, the cached
 *  copy still holds the old list and would flip it back on screen. */
async function terbukaUntuk(asisten: boolean, segar: boolean): Promise<number[] | null> {
  const url = asisten
    ? "/api/session/akses?meta=1"
    : `/api/session/akses${segar ? "?segar=1" : ""}`;
  const d = await fetch(url)
    .then((r) => r.json())
    .catch(() => null);
  return Array.isArray(d?.terbuka) ? d.terbuka : null;
}

/** Fetched once per page (astro:page-load resets the module-level cache
 *  via the `reset` param some callers pass), never per card -- the index
 *  page alone can have four module cards asking the same question. */
/** `segar`: after a live update, read past the edge cache. */
export function getAksesState(reset = false, segar = false): Promise<AksesState> {
  if (reset) cached = null;
  if (!cached) {
    cached = Promise.all([
      fetch("/api/auth/me")
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/session/jurnal")
        .then((r) => r.json())
        .catch(() => null),
    ]).then(async ([me, jurnal]) => {
      const asisten = Boolean(me?.ok && me?.role === "asisten");
      const bisa: number[] = Array.isArray(jurnal?.jurnal) ? jurnal.jurnal : [];
      const umum = (await terbukaUntuk(asisten, segar)) ?? [1];
      // A Praktikan's own journals count as open to them: for a real one
      // they always are already; for a Mode TOT dummy they are the TOT
      // session's module, which may be closed to everyone else.
      const terbuka = asisten ? umum : [...new Set([...umum, ...bisa])].sort((a, b) => a - b);
      return { terbuka, asisten, jurnal: bisa };
    });
  }
  return cached;
}

export function terkunciUntuk(state: AksesState, modul: number): boolean {
  return !state.asisten && !state.terbuka.includes(modul);
}

/** The journal (setup, code, live) is closed to this viewer. */
export function jurnalTertutup(state: AksesState, modul: number): boolean {
  return !state.asisten && !state.jurnal.includes(modul);
}

/**
 * Index-page card locking: finds every link into a module (an href ending
 * in /modules/<N>, in either language prefix) inside `root`, and for any
 * module not yet open, marks the card `data-locked="yes"` (cosmos.css-
 * adjacent styling lives on each page's own <style> block, since the two
 * card markups differ slightly) and appends a small "Belum dibuka"/"Not
 * open yet" badge rather than removing the link -- an assistant using the
 * same markup still needs to click through, and the API enforces the real
 * gate either way, so leaving the link live costs nothing.
 */
export async function lockCards(root: ParentNode, label: string): Promise<void> {
  const state = await getAksesState();
  const links = root.querySelectorAll<HTMLAnchorElement>('a[href*="/modules/"]');
  for (const link of links) {
    const match = /\/modules\/(\d)(?:\/|$)/.exec(link.getAttribute("href") || "");
    if (!match) continue;
    const modul = Number(match[1]);
    if (!terkunciUntuk(state, modul)) continue;
    link.dataset.locked = "yes";
    if (!link.querySelector(".modul-lock-badge")) {
      const badge = document.createElement("span");
      badge.className = "modul-lock-badge";
      badge.textContent = label;
      link.appendChild(badge);
    }
  }
}

/**
 * Live-page locking (Phase 8: the journal rule, jurnalTertutup): replaces `main`'s content with a full-screen
 * lock message when `modul` is not open for this visitor, or does nothing
 * at all for an assistant (who instead gets `badgeLabel` appended to
 * `badgeTarget`, if given, as a plain informational note rather than a
 * block). Returns whether it locked the page, so a caller can skip other
 * per-page setup (starting a poll, etc.) that would be wasted work behind
 * a lock screen nobody click past.
 */
export async function applyLockScreen(
  modul: number,
  message: string,
  badgeLabel?: string,
  badgeTarget?: Element | null,
): Promise<boolean> {
  const state = await getAksesState();
  if (state.asisten) {
    if (badgeLabel && badgeTarget && !badgeTarget.querySelector(".modul-lock-badge")) {
      const badge = document.createElement("span");
      badge.className = "modul-lock-badge";
      badge.textContent = badgeLabel;
      badgeTarget.appendChild(badge);
    }
    return false;
  }
  if (!jurnalTertutup(state, modul)) return false;
  const belumDibuka = terkunciUntuk(state, modul);

  const main = document.querySelector("main");
  if (!main) return false;
  // Phase 8: the app's own lock screen (icon, title, message, a way back)
  // instead of a bare paragraph. Built with DOM calls, never innerHTML.
  const en = document.documentElement.lang !== "id";
  main.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "lockscreen";
  wrap.setAttribute("role", "status");
  const icon = document.createElement("span");
  icon.className = "lockscreen__icon";
  icon.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "34");
  svg.setAttribute("height", "34");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  for (const d of ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  icon.appendChild(svg);
  const h = document.createElement("h1");
  h.className = "lockscreen__title";
  h.textContent = belumDibuka
    ? en
      ? `Module ${modul} is not open yet`
      : `Modul ${modul} belum dibuka`
    : en
      ? `The Module ${modul} journal is not open for you yet`
      : `Jurnal Modul ${modul} belum terbuka untukmu`;
  const p = document.createElement("p");
  p.textContent = message;
  const back = document.createElement("a");
  back.className = "btn btn--secondary";
  back.href = en ? `/en/modules/${modul}` : `/modules/${modul}`;
  back.textContent = en ? `Read Module ${modul}` : `Baca Modul ${modul}`;
  wrap.append(icon, h, p, back);
  main.appendChild(wrap);
  return true;
}
