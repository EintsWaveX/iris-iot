/**
 * Every action explains itself (2026-10-14): hovering a button, a
 * button-like link, a tab or a menu item (or reaching it with the keyboard,
 * or a long press on a phone) shows what it does, in the kit's tooltip
 * style. One listener for the whole page, so a new button needs no wiring:
 *
 * - its own `data-tip` wins;
 * - else its `title` (moved aside so the browser's own tooltip never shows);
 * - else the explanation for its label in src/lib/tips.ts.
 *
 * A control that already carries a kit Tooltip (data-tip-own, icon buttons)
 * keeps that one. Renders nothing itself; the panel lives on <body>, or in
 * the full-screen element while one is up.
 *
 * The table of explanations (lib/tips-data.ts, about 70 KB) is not part of
 * the page's scripts: it is fetched when the page is idle on a mouse
 * device, or at the first hover, focus or long press, whichever is first.
 */
import { useEffect } from "react";
import "../ui/Tooltip.css";

const SASARAN =
  'button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="switch"], [role="radio"], [role="combobox"], a.btn, a[class*="btn--"], summary, [data-tip]';

/** The page language from <html lang>. */
function bahasa(): "id" | "en" | "zh" {
  const l = document.documentElement.lang.toLowerCase();
  return l.startsWith("en") ? "en" : l.startsWith("zh") ? "zh" : "id";
}

type TipUntuk = typeof import("../../lib/tips").tipUntuk;
let tipUntuk: TipUntuk | null = null;
let muatan: Promise<void> | null = null;

/** Fetches the explanations once. If that fails, no label has one (data-tip and title still show). */
function muatTips(): Promise<void> {
  muatan ??= import("../../lib/tips").then(
    (m) => {
      tipUntuk = m.tipUntuk;
    },
    () => {
      tipUntuk = () => null;
    },
  );
  return muatan;
}

/** The tip for a control; `undefined` while the explanations are still on their way. */
function teksTip(el: HTMLElement): string | null | undefined {
  if (el.closest("[data-tip-own]") || el.dataset.tip === "") return null;
  if (el.dataset.tip) return el.dataset.tip;
  const title = el.getAttribute("title");
  if (title) {
    el.dataset.tipTitle = title;
    el.removeAttribute("title");
  }
  if (el.dataset.tipTitle) return el.dataset.tipTitle;
  if (!tipUntuk) return undefined;
  const label = el.getAttribute("aria-label") || el.innerText || "";
  return tipUntuk(label, bahasa(), {
    role: el.getAttribute("role"),
    pilih: el.hasAttribute("aria-pressed") || el.hasAttribute("aria-checked"),
  });
}

export default function TipLayer() {
  useEffect(() => {
    const panel = document.createElement("div");
    panel.className = "tooltip__panel tiplayer";
    panel.setAttribute("role", "tooltip");
    panel.id = "iris-tip";
    panel.hidden = true;
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastHide = 0;

    const sembunyi = () => {
      clearTimeout(timer);
      if (!panel.hidden) lastHide = Date.now();
      panel.hidden = true;
      if (target?.getAttribute("aria-describedby") === panel.id)
        target.removeAttribute("aria-describedby");
      target = null;
    };

    const taruh = (el: HTMLElement, teks: string, segera = false) => {
      const host = document.fullscreenElement ?? document.body;
      if (panel.parentElement !== host) host.appendChild(panel);
      panel.textContent = teks;
      // The next tip after one just shown skips the entrance too.
      if (segera) panel.dataset.instant = "";
      else delete panel.dataset.instant;
      panel.hidden = false;
      panel.style.left = "0px";
      panel.style.top = "0px";
      const r = el.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const gap = 8;
      const atas = r.top - p.height - gap >= 8;
      panel.dataset.side = atas ? "top" : "bottom";
      const top = atas ? r.top - p.height - gap : r.bottom + gap;
      const left = Math.min(
        Math.max(8, r.left + r.width / 2 - p.width / 2),
        window.innerWidth - p.width - 8,
      );
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      if (!el.hasAttribute("aria-describedby")) el.setAttribute("aria-describedby", panel.id);
    };

    const mulai = (el: HTMLElement, tunda: number) => {
      const teks = teksTip(el);
      if (teks === undefined) {
        // The first one only: once the explanations are here, ask again if
        // the pointer or the focus is still on that control.
        void muatTips().then(() => {
          if (el.isConnected && (el.matches(":hover") || el.matches(":focus-visible")))
            mulai(el, tunda);
        });
        return;
      }
      if (!teks) return sembunyi();
      // Already shown, or already waiting: moving over its icon or words
      // must not start the wait again.
      if (el === target) return;
      sembunyi();
      target = el;
      // Moving from one tip straight to the next skips the wait.
      const segera = Date.now() - lastHide < 400;
      timer = setTimeout(
        () => target === el && el.isConnected && taruh(el, teks, segera),
        segera ? 0 : tunda,
      );
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest?.(SASARAN) as HTMLElement | null;
      if (!el) return sembunyi();
      mulai(el, 450);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !target) return;
      const ke = e.relatedTarget as Node | null;
      if (ke && target.contains(ke)) return;
      sembunyi();
    };
    const fokus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.(SASARAN) as HTMLElement | null;
      if (!el || !el.matches(":focus-visible")) return;
      mulai(el, 300);
    };

    // A long press on a touch screen shows it; the tap itself still acts.
    let tekan: ReturnType<typeof setTimeout> | undefined;
    let ditekan: HTMLElement | null = null;
    let awal = { x: 0, y: 0 };
    const tahan = (el: HTMLElement) => {
      const teks = teksTip(el);
      if (teks === undefined) {
        void muatTips().then(() => ditekan === el && el.isConnected && tahan(el));
        return;
      }
      if (!teks) return;
      target = el;
      taruh(el, teks);
      setTimeout(() => target === el && sembunyi(), 2500);
    };
    const down = (e: PointerEvent) => {
      sembunyi();
      if (e.pointerType === "mouse") return;
      const el = (e.target as Element | null)?.closest?.(SASARAN) as HTMLElement | null;
      if (!el) return;
      awal = { x: e.clientX, y: e.clientY };
      clearTimeout(tekan);
      ditekan = el;
      tekan = setTimeout(() => tahan(el), 550);
    };
    const hentikan = () => {
      clearTimeout(tekan);
      ditekan = null;
    };
    const gerak = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - awal.x, e.clientY - awal.y) > 10) hentikan();
    };
    const lepas = () => hentikan();
    const kunci = (e: KeyboardEvent) => e.key === "Escape" && sembunyi();

    // A mouse device will want tips soon: fetch them once the page is quiet.
    // A phone fetches them at the first long press instead.
    let siapIdle: number | undefined;
    let siapTunggu: ReturnType<typeof setTimeout> | undefined;
    if (window.matchMedia?.("(hover: hover)").matches) {
      if (window.requestIdleCallback) siapIdle = window.requestIdleCallback(() => void muatTips());
      else siapTunggu = setTimeout(() => void muatTips(), 1500);
    }

    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerout", out, true);
    document.addEventListener("focusin", fokus, true);
    document.addEventListener("focusout", sembunyi, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", gerak, true);
    document.addEventListener("pointerup", lepas, true);
    document.addEventListener("pointercancel", lepas, true);
    document.addEventListener("keydown", kunci, true);
    window.addEventListener("scroll", sembunyi, true);
    window.addEventListener("resize", sembunyi);
    document.addEventListener("astro:before-swap", sembunyi);
    return () => {
      if (siapIdle !== undefined) window.cancelIdleCallback?.(siapIdle);
      clearTimeout(siapTunggu);
      hentikan();
      sembunyi();
      panel.remove();
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerout", out, true);
      document.removeEventListener("focusin", fokus, true);
      document.removeEventListener("focusout", sembunyi, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", gerak, true);
      document.removeEventListener("pointerup", lepas, true);
      document.removeEventListener("pointercancel", lepas, true);
      document.removeEventListener("keydown", kunci, true);
      window.removeEventListener("scroll", sembunyi, true);
      window.removeEventListener("resize", sembunyi);
      document.removeEventListener("astro:before-swap", sembunyi);
    };
  }, []);
  return null;
}
