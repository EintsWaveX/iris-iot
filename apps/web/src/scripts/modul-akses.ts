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
}

let cached: Promise<AksesState> | null = null;

/** Fetched once per page (astro:page-load resets the module-level cache
 *  via the `reset` param some callers pass), never per card -- the index
 *  page alone can have four module cards asking the same question. */
export function getAksesState(reset = false): Promise<AksesState> {
  if (reset) cached = null;
  if (!cached) {
    cached = Promise.all([
      fetch("/api/session/akses")
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/auth/me")
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([akses, me]) => ({
      terbuka: Array.isArray(akses?.terbuka) ? akses.terbuka : [1],
      asisten: Boolean(me?.ok && me?.role === "asisten"),
    }));
  }
  return cached;
}

export function terkunciUntuk(state: AksesState, modul: number): boolean {
  return !state.asisten && !state.terbuka.includes(modul);
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
 * Detail/live-page locking: replaces `main`'s content with a full-screen
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
  if (!terkunciUntuk(state, modul)) return false;

  const main = document.querySelector("main");
  if (!main) return false;
  // Phase 8: the app's own lock screen (icon, title, message, a way back)
  // instead of a bare paragraph. Built with DOM calls, never innerHTML.
  const en = document.documentElement.lang === "en";
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
  h.textContent = en ? `Module ${modul} is not open yet` : `Modul ${modul} belum dibuka`;
  const p = document.createElement("p");
  p.textContent = message;
  const back = document.createElement("a");
  back.className = "btn btn--secondary";
  back.href = en ? "/en/modules" : "/modules";
  back.textContent = en ? "All modules" : "Semua modul";
  wrap.append(icon, h, p, back);
  main.appendChild(wrap);
  return true;
}
