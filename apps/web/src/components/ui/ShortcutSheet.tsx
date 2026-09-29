/**
 * The "?" keyboard shortcut sheet (P8.7). Callers pass the rows for their
 * role and page; `useQuestionMarkHotkey` opens it from anywhere that is not
 * a text field.
 */
import { useEffect } from "react";
import Dialog from "./Dialog";

export interface ShortcutRow {
  keys: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: ShortcutRow[];
}

export default function ShortcutSheet({ open, onOpenChange, title, rows }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <table className="shortcut-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.keys}>
              <td>
                <kbd>{r.keys}</kbd>
              </td>
              <td>{r.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function useQuestionMarkHotkey(open: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
