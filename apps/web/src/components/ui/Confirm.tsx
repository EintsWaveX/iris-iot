/**
 * The app's confirm dialog (Phase 8), replacing window.confirm and the old
 * vanilla Modal#modal-konfirmasi. Controlled like Dialog: the caller owns
 * `open`. While `onConfirm` runs the confirm button shows a spinner and both
 * buttons are disabled; the dialog closes itself when it resolves true (or
 * undefined) and stays open on false so the caller can show an error.
 */
import { useState, type ReactNode } from "react";
import Dialog from "./Dialog";
import type { Lang } from "../../lib/kelas";

export default function Confirm({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  onConfirm,
  lang = "id",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<boolean | void> | boolean | void;
  lang?: Lang;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const r = await onConfirm();
      if (r !== false) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={body}
      size="sm"
      lang={lang}
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? (lang !== "id" ? "Cancel" : "Batal")}
          </button>
          <button
            type="button"
            className={`btn ${tone === "danger" ? "btn--danger" : "btn--primary"}`}
            data-loading={busy ? "yes" : undefined}
            disabled={busy}
            onClick={() => void go()}
          >
            <span className="btn__label">{confirmLabel}</span>
            <span className="btn__spinner" aria-hidden="true" />
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
