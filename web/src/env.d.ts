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
}
