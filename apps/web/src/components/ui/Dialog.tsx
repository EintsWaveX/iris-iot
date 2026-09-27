/**
 * A Radix-backed dialog (P7.1). This is a NEW primitive, separate from
 * Modal.astro: Modal.astro is a vanilla-JS, ID-addressed dialog opened by
 * `src/scripts/modal.ts`'s global API from anywhere, including plain HTML
 * `data-modal-open` attributes -- that contract has real call sites today
 * and stays exactly as it is. This component is for React-island call
 * sites that want a dialog driven by component state instead (the login
 * dialog's eventual rewrite, a confirm dialog embedded in a React island
 * like SessionConsole's Akhiri/Batalkan actions, and the mobile "Akun"
 * sheet). Adopting it in any of those places is P7.3/P7.4 work, not this
 * stage's -- P7.1 only builds the primitive.
 *
 * `sheet` renders as a bottom sheet (slides up from the bottom edge,
 * rounded top corners only) instead of a centred panel -- used for the
 * mobile Akun menu and the mobile login dialog. Centring for the non-sheet
 * case is grid placement (`place-items: center`), not
 * `transform: translate(-50%, -50%)` -- see Modal.astro's own docblock for
 * the exact GSAP-clobbering bug that rule avoids; the same reasoning
 * applies here.
 *
 * Usage:
 *   <Dialog open={open} onOpenChange={setOpen} title="Masuk">
 *     <p>...</p>
 *   </Dialog>
 */
import type { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import "./Dialog.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  sheet?: boolean;
  children: ReactNode;
  /** Rendered right-aligned in the footer, e.g. action buttons. */
  actions?: ReactNode;
}

export default function Dialog({
  open,
  onOpenChange,
  title,
  description,
  sheet = false,
  children,
  actions,
}: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog__overlay" />
        <RadixDialog.Content
          className={sheet ? "dialog__panel dialog__panel--sheet" : "dialog__panel"}
        >
          <header className="dialog__head">
            <RadixDialog.Title className="dialog__title">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="dialog__lede">
                {description}
              </RadixDialog.Description>
            )}
            <RadixDialog.Close
              className="btn btn--ghost btn--icon dialog__close"
              aria-label="Tutup"
            >
              ×
            </RadixDialog.Close>
          </header>
          <div className="dialog__body">{children}</div>
          {actions && <footer className="dialog__actions">{actions}</footer>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
