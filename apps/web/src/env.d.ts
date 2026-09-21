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
    show(message: string, tone?: "info" | "ok" | "warn" | "danger"): void;
  };
  // packages/kosmik/js/*.core.js -- shared with apps/games, so these stay
  // untyped `.js` sources rather than gaining a local `.d.ts` there; the
  // ambient shape lives here instead, apps/web's own side of the contract.
  Cosmos?: {
    warpTo(scene: string): void;
    setScene(scene: string): void;
    converge(options?: { inDuration?: number; outDuration?: number; hold?: number }): void;
    redraw(): void;
  };
  Motion?: {
    isReduced(): boolean;
    setReduced(value: boolean | null): void;
    onReducedChange(fn: (isReduced: boolean) => void): void;
  };
  gsap?: unknown;
  CustomEase?: unknown;
  // src/scripts/cosmos-router.js
  CosmosRouter?: {
    setKurangiEfek(value: boolean): void;
    isKurangiEfek(): boolean;
  };
}
