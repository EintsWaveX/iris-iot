/**
 * A Radix-backed dialog (P7.1, Phase 9 kit), driven by the caller's `open`
 * state. Modal.astro stays for the old vanilla, ID-addressed dialogs.
 *
 * Layers (Phase 9 overlay rules). Radix keeps one stack for every dialog,
 * drawer, popover and menu, so Esc and outside clicks reach only the top
 * layer. On top of that:
 * - every dialog animates in and out (data-state="closed" plays before
 *   Radix unmounts it);
 * - `blocking` marks a dialog that answers for the layer under it (a
 *   required confirm, unsaved changes): while it is open that layer cannot
 *   close, since it is the top layer. The dialog itself keeps its close
 *   button, and Esc or a click outside closes it like Cancel (mockup G10:
 *   a blocking child only stops its parent closing underneath it);
 * - popovers and menus sit above dialogs, and toasts and tooltips above
 *   everything.
 *
 * Footer rule (`actions`): the buttons keep their normal size. Two buttons
 * sit right, Cancel then the main action. An alternative action goes in
 * `alt`, on the left. `foot="12"` is the three-button form: the main action
 * across the top row, the other two sharing the row below; pass the main
 * action first. Under 520px wide the buttons stack full width with the
 * main action on top.
 *
 * `sheet` renders a bottom sheet (the phone Akun menu and login dialog).
 *
 * Enter presses the main footer button (ui/enterKey.ts) unless the focused
 * control uses Enter itself.
 *
 * Without a Radix Trigger, focus would drop to <body> on close, so the
 * element that opened the dialog is remembered and focused again. The
 * capture ref starts at `false` so a dialog the parent mounts already open
 * (`open` always true) still counts as "just opened".
 *
 * Usage:
 *   <Dialog open={open} onOpenChange={setOpen} title="Masuk" actions={...}>
 *     <p>...</p>
 *   </Dialog>
 */
import { useRef, type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { XIcon } from "@phosphor-icons/react";
import IconButton from "./IconButton";
import { enterPressesMain } from "./enterKey";
import { useFullscreenEl } from "./fullscreen";
import { dict } from "../../lib/app";
import "./Dialog.css";
import type { Lang } from "../../lib/kelas";

const T = dict({ id: "Tutup", en: "Close", zh: "关闭" });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  sheet?: boolean;
  /** sm 540px (confirms), md 680px (default), lg 740px, xl 1040px, wide
   *  1560px (slides, nearly the whole screen). */
  size?: "sm" | "md" | "lg" | "xl" | "wide";
  lang?: Lang;
  children?: ReactNode;
  /** The footer's buttons: Cancel, then the main action. */
  actions?: ReactNode;
  /** An alternative action, on the left of the footer. */
  alt?: ReactNode;
  /** "12": three buttons, the main one (first) across the top. */
  foot?: "row" | "12";
  /** Must be answered: Esc and outside clicks shake it instead. */
  blocking?: boolean;
}

export default function Dialog({
  open,
  onOpenChange,
  title,
  description,
  sheet = false,
  size = "md",
  lang = "id",
  children,
  actions,
  alt,
  foot = "row",
  blocking = false,
}: Props) {
  const openedFromRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) {
    openedFromRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;
  // A full-screen element inside a dialog (the slides' PDF viewer) is already
  // on screen; moving the dialog into its own child would unmount it.
  const fsEl = useFullscreenEl();
  const fs = fsEl && !fsEl.closest('[role="dialog"]') ? fsEl : null;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={fs ?? undefined}>
        <RadixDialog.Overlay className="dialog__overlay" />
        <RadixDialog.Content
          className={[
            "dialog__panel",
            sheet && "dialog__panel--sheet",
            `dialog__panel--${size}`,
            alt != null && "dialog__panel--alt",
          ]
            .filter(Boolean)
            .join(" ")}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            // Focus the panel, as the mockup does: landing on the close
            // button would pop its tooltip the moment the dialog opens.
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          onFocusOutside={(e) => blocking && e.preventDefault()}
          onKeyDown={(e) => enterPressesMain(e, e.currentTarget, ".dialog__actions")}
          onCloseAutoFocus={(e) => {
            if (openedFromRef.current) {
              e.preventDefault();
              openedFromRef.current.focus();
            }
          }}
        >
          <header className="dialog__head">
            <div className="dialog__titles">
              <RadixDialog.Title className="dialog__title">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="dialog__lede">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton icon={XIcon} label={T[lang]} />
            </RadixDialog.Close>
          </header>
          {children != null && <div className="dialog__body">{children}</div>}
          {(actions || alt) && (
            <footer
              className={foot === "12" ? "dialog__actions dialog__actions--12" : "dialog__actions"}
            >
              {alt != null && <span className="dialog__alt">{alt}</span>}
              {actions}
            </footer>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
