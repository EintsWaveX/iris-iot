/// <reference types="astro/client" />

/**
 * Ambient globals installed by the client-side scripts in
 * src/components/ui/*.astro. Declared once here rather than cast with
 * `as any` at every call site, so a typo in a call to window.Toast.show()
 * or window.LoginDialog.open() is still caught by the checker.
 */
interface Window {
  Toast?: {
    show(
      message: string,
      tone?: "info" | "ok" | "warn" | "danger",
      opts?: { action?: { label: string; onClick: () => void }; duration?: number },
    ): void;
  };
  // src/components/LoginDialog.tsx (P7.3): opened from anywhere, including
  // islands that do not share its React tree.
  LoginDialog?: {
    open(): void;
    close(): void;
  };
  // packages/kosmik/js/*.core.js -- shared with apps/games, so these stay
  // untyped `.js` sources rather than gaining a local `.d.ts` there; the
  // ambient shape lives here instead, apps/web's own side of the contract.
  // src/scripts/sky.ts: scenes no longer change the sky; a running
  // module's session still tints it faintly.
  Cosmos?: {
    setScene(scene: string): void;
    setModuleTint(modul: number): void;
  };
  Motion?: {
    isReduced(): boolean;
    setReduced(value: boolean | null): void;
    onReducedChange(fn: (isReduced: boolean) => void): void;
    // src/scripts/motion-tier.ts is the only caller of setTier; the web
    // app's readers use getTier/onTierChange (hooks.ts useMotionTier).
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
    setDetail(level: "ldm" | "normal" | "hd"): void;
    getDetail(): "ldm" | "normal" | "hd";
  };
  // public/theme-init.js: re-stamps data-theme, data-detail and
  // data-zh-weight on <html> after a display choice is saved.
  IrisPrefs?: {
    apply(): void;
    theme(): "dark" | "light";
    detail(): "ldm" | "normal" | "hd";
  };
  // src/scripts/motion-tier.ts (P6.4/B10): forces one fresh capability
  // measurement, clearing the cached tier first. cosmos-router.js calls
  // this when the "Otomatis" setting is (re-)selected, so a device stuck
  // at a stale or wrong verdict is not limited to waiting out the 7-day
  // cache expiry.
  IrisMotionTier?: {
    reprobe(): void;
    reapply(): void;
  };
}

// Phase 9 Stage 9: noVNC ships plain ES modules without types. Konsol Pi
// (components/server/konsol/Layar.tsx) types the few members it uses.
declare module "@novnc/novnc" {
  const RFB: new (
    target: HTMLElement,
    channel: WebSocket | string,
    options?: { credentials?: { password?: string }; shared?: boolean },
  ) => unknown;
  export default RFB;
}
