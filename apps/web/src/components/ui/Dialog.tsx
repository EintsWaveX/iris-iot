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
 *
 * None of this file's call sites use `RadixDialog.Trigger` (every one is
 * opened from a plain button via this controlled `open` prop instead, since
 * the trigger sometimes lives outside this component's own tree entirely --
 * LoginDialog's is a vanilla nav script calling `window.LoginDialog.open()`).
 * Without a Trigger, Radix has no element to return focus to on close, so it
 * drops to <body> -- this component tracks and restores it itself instead.
 * Two call-site shapes both need this to work: a component that persists
 * and toggles its own `open` state (LoginDialog, AkunSheet, SessionConsole's
 * confirms), and one the parent only mounts while it should be open
 * (ServerCenter's DaftarServerModal, `open` always literally `true`) -- the
 * capture ref below starts at `false` regardless of `open`'s own initial
 * value specifically so the latter's first-and-only render still counts as
 * "just opened".
 */
import { useRef, type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import "./Dialog.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  sheet?: boolean;
  /** "md" (default, 32rem) fits a confirm dialog; "lg" (38rem) gives a
   *  form with its own role switch and field hints (the login dialog) room
   *  to breathe instead of wrapping every line. */
  size?: "md" | "lg";
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
  size = "md",
  children,
  actions,
}: Props) {
  const openedFromRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) {
    openedFromRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog__overlay" />
        <RadixDialog.Content
          className={[
            "dialog__panel",
            sheet && "dialog__panel--sheet",
            size === "lg" && "dialog__panel--lg",
          ]
            .filter(Boolean)
            .join(" ")}
          onCloseAutoFocus={(e) => {
            if (openedFromRef.current) {
              e.preventDefault();
              openedFromRef.current.focus();
            }
          }}
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
