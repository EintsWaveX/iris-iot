/**
 * The Ctrl+K / Cmd+K command palette (P8.7), for assistants. Built on cmdk
 * (fuzzy matching, arrow-key selection, grouped results) inside a Radix
 * dialog for the focus trap and Esc. Callers pass plain command objects;
 * `useCommandPaletteHotkey` wires the shortcut on the whole page.
 */
import { useEffect, type ReactNode } from "react";
import { shortcutsOn } from "../../lib/prefs";
import { Command } from "cmdk";
import * as RadixDialog from "@radix-ui/react-dialog";
import "./CommandPalette.css";

export interface PaletteCommand {
  id: string;
  group: string;
  label: string;
  /** Extra words that should match (e.g. the English and Indonesian name). */
  keywords?: string[];
  icon?: ReactNode;
  hint?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
  placeholder: string;
  empty: string;
  title: string;
}

export default function CommandPalette({
  open,
  onOpenChange,
  commands,
  placeholder,
  empty,
  title,
}: Props) {
  const groups = [...new Set(commands.map((c) => c.group))];
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="palette__overlay" />
        <RadixDialog.Content className="palette" aria-describedby={undefined}>
          <RadixDialog.Title className="visually-hidden">{title}</RadixDialog.Title>
          <Command label={title} loop>
            <Command.Input className="palette__input" placeholder={placeholder} autoFocus />
            <Command.List className="palette__list">
              <Command.Empty className="palette__empty">{empty}</Command.Empty>
              {groups.map((g) => (
                <Command.Group key={g} heading={g} className="palette__group">
                  {commands
                    .filter((c) => c.group === g)
                    .map((c) => (
                      <Command.Item
                        key={c.id}
                        value={`${c.label} ${c.group} ${(c.keywords ?? []).join(" ")}`}
                        className="palette__item"
                        onSelect={() => {
                          onOpenChange(false);
                          c.run();
                        }}
                      >
                        {c.icon}
                        <span className="palette__label">{c.label}</span>
                        {c.hint && <kbd className="palette__hint">{c.hint}</kbd>}
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Opens the palette on Ctrl+K (Cmd+K on macOS), from anywhere on the page. */
export function useCommandPaletteHotkey(setOpen: (fn: (o: boolean) => boolean) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && shortcutsOn()) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
