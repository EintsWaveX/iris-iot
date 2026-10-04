/**
 * The "?" keyboard shortcut sheet (Phase 9, the mockup's g-keys): the keys
 * in groups (Anywhere, In a Session, Score Table...), each key as its own
 * chip, and a switch to turn the shortcuts off. Shortcuts stay quiet while
 * the reader types in a field. A dialog on wide screens, a bottom sheet on
 * phones. List only keys the app really handles.
 */
import { useEffect, useState } from "react";
import Dialog from "./Dialog";
import { Switch } from "./Controls";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { keyHintsOn, setKeyHints, setShortcuts, shortcutsOn } from "../../lib/prefs";
import "./ShortcutSheet.css";

export interface ShortcutRow {
  /** Each key on its own, e.g. ["G", "K"] or ["Ctrl", "K"]. */
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

const T = dict({
  id: {
    desc: "Tekan ? kapan saja untuk membuka daftar ini.",
    on: "Pintasan Aktif",
    hints: "Tampilkan Tombol Pintasan",
    hintsHint: "Huruf pintasan tampil di tombolnya.",
    quiet: "Pintasan diam saat kamu sedang mengetik di kolom isian.",
  },
  en: {
    desc: "Press ? any time to open this list.",
    on: "Shortcuts On",
    hints: "Show Shortcut Keys",
    hintsHint: "Shortcut letters show on their buttons.",
    quiet: "Shortcuts stay quiet while you type in a field.",
  },
  zh: {
    desc: "随时按 ? 打开这个列表。",
    on: "启用快捷键",
    hints: "显示快捷键提示",
    hintsHint: "在按钮上显示对应的快捷键。",
    quiet: "在输入框里打字时，快捷键不会触发。",
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  groups: ShortcutGroup[];
  lang: Lang;
}

export default function ShortcutSheet({ open, onOpenChange, title, groups, lang }: Props) {
  const t = T[lang];
  const [on, setOn] = useState(true);
  const [hints, setHints] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (!open) return;
    setOn(shortcutsOn());
    setHints(keyHintsOn());
    setPhone(window.matchMedia("(max-width: 639px)").matches);
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={phone ? undefined : t.desc}
      size="xl"
      sheet={phone}
      lang={lang}
    >
      <div className="keys">
        <div className="keys__grid">
          {groups.map((g) => (
            <section key={g.title} className="keys__group">
              <h3 className="keys__title">{g.title}</h3>
              <div className="keys__rows">
                {g.rows.map((r) => (
                  <div key={r.keys.join(" ")} className="keys__row">
                    <span className="keys__keys">
                      {r.keys.map((k, i) => (
                        <kbd key={i} className="ctl-kbd">
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span>{r.label}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="keys__set">
          <Switch
            on={on}
            label={t.on}
            showLabel
            onChange={(v) => {
              setOn(v);
              setShortcuts(v);
            }}
          />
          <Switch
            on={hints}
            label={t.hints}
            showLabel
            onChange={(v) => {
              setHints(v);
              setKeyHints(v);
            }}
          />
          <span className="hint">{t.hintsHint}</span>
        </div>
        <span className="hint">{t.quiet}</span>
      </div>
    </Dialog>
  );
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** "?" opens the sheet from anywhere that is not a text field. It works even
 *  with shortcuts off, so the switch can be turned back on. */
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
