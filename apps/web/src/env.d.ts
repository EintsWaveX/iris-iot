/// <reference types="astro/client" />

/**
 * Ambient globals installed by the client-side scripts in
 * src/components/ui/*.astro. Declared once here rather than cast with
 * `as any` at every call site, so a typo in a call to window.Modal.open()
 * or window.Toast.show() is still caught by the checker.
 */
interface Window {
  Modal?: {
    open(id: string): void;
    close(id?: string): void;
  };
  Toast?: {
    show(
      message: string,
      tone?: "info" | "ok" | "warn" | "danger",
      opts?: { action?: { label: string; onClick: () => void }; duration?: number },
    ): void;
  };
  // src/components/LoginDialog.tsx (P7.3): a React-state-driven dialog, not
  // an id-addressed Modal.astro panel, so it exposes this instead of
  // relying on data-modal-open -- the same reasoning window.Modal itself
  // documents just above.
  LoginDialog?: {
    open(): void;
    close(): void;
  };
  // packages/kosmik/js/*.core.js -- shared with apps/games, so these stay
  // untyped `.js` sources rather than gaining a local `.d.ts` there; the
  // ambient shape lives here instead, apps/web's own side of the contract.
  Cosmos?: {
    warpTo(scene: string): void;
    setScene(scene: string): void;
    // Stage 6: the reactive per-module tint for the "sesi" scene only --
    // see cosmos.core.js's own comment for why this is a separate concept
    // from each scene's static (and otherwise still unused) hueShift field.
    setModuleTint(modul: number): void;
    converge(options?: { inDuration?: number; outDuration?: number; hold?: number }): void;
    redraw(): void;
  };
  Motion?: {
    isReduced(): boolean;
    setReduced(value: boolean | null): void;
    onReducedChange(fn: (isReduced: boolean) => void): void;
    // src/scripts/motion-tier.ts is the only caller of setTier/getTier;
    // cosmos.core.js and Nav's toggle only ever read via getTier/onTierChange.
    getTier(): 0 | 1 | 2;
    setTier(value: 0 | 1 | 2): void;
    onTierChange(fn: (tier: 0 | 1 | 2) => void): void;
    // The house entrance/reveal helpers (Stage 6 wires these into every
    // apps/web page for the first time -- previously called by nothing).
    // Return types are loose (GSAP tween/timeline/SplitText instances)
    // since no caller in this app needs to chain off them today.
    enter(
      targets: string | Element | Element[] | NodeListOf<Element>,
      options?: {
        distance?: number;
        duration?: number;
        ease?: string;
        stagger?: number;
        delay?: number;
      },
    ): unknown;
    countUp(
      el: Element | null,
      to: number,
      options?: { format?: (n: number) => string; duration?: number; ease?: string },
    ): void;
    revealText(
      el: Element | null,
      options?: {
        type?: "chars" | "words";
        distance?: string | number;
        duration?: number;
        ease?: string;
        stagger?: number;
        delay?: number;
        keepSplit?: boolean;
      },
    ): unknown;
  };
  gsap?: unknown;
  CustomEase?: unknown;
  // src/scripts/cosmos-router.js
  CosmosRouter?: {
    setMotionPref(pref: "auto" | "penuh" | "kurangi"): void;
    getMotionPref(): "auto" | "penuh" | "kurangi";
    cycleMotionPref(): "auto" | "penuh" | "kurangi";
  };
  // src/scripts/motion-tier.ts (P6.4/B10): forces one fresh capability
  // measurement, clearing the cached tier first. cosmos-router.js calls
  // this when the "Otomatis" setting is (re-)selected, so a device stuck
  // at a stale or wrong verdict is not limited to waiting out the 7-day
  // cache expiry.
  IrisMotionTier?: {
    reprobe(): void;
  };
}
