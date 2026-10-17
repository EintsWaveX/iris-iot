/**
 * The score fields the rubric changed (user ruling 2026-10-17), built on the
 * kit's ScoreInput so the table's arrow and Enter navigation keeps working.
 *
 * - LevelField (D1 to D4, L2): the field takes one of 0, 45, 65, 80, 90.
 *   Typing the first digit picks a level (0, 4, 6, 8, 9), Backspace clears,
 *   clicking opens a list of the five levels with the rubric's words. The
 *   current level's words show in a tooltip on hover and focus.
 * - L1Field: L1 shows the system's value marked "Otomatis" until an
 *   assistant types one; clearing the field returns to automatic.
 */
import { forwardRef, useRef, useState, type ComponentProps } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { ScoreInput } from "../ui/Controls";
import Tooltip from "../ui/Tooltip";
import { useDialogHost } from "../ui/dialogHost";
import type { Lang } from "../../lib/kelas";
import { TINGKAT } from "../../lib/nilai-rubrik";
import { RB } from "./rubrikStrings";
import "./levelField.css";

type Base = Omit<ComponentProps<typeof ScoreInput>, "value" | "onValue">;

/** The level a typed digit stands for: 0, 4 (45), 6 (65), 8 (80), 9 (90). */
const DARI_DIGIT: Record<string, string> = { "0": "0", "4": "45", "6": "65", "8": "80", "9": "90" };

export const LevelField = forwardRef<
  HTMLInputElement,
  Base & {
    komponen: string;
    lang: Lang;
    value: string;
    onValue: (v: string) => void;
    /** A level clicked in the list: save it now. */
    onPick: (v: string) => void;
  }
>(function LevelField(
  { komponen, lang, value, onValue, onPick, readOnlyReason, onKeyDown, onFocus, ...rest },
  ref,
) {
  const r = RB[lang];
  const [open, setOpen] = useState(false);
  // The digits typed since focus: "8" then "0" stays 80, "4" then "5" 45.
  const ketik = useRef("");
  const dialogHost = useDialogHost();
  const teks = r.level[komponen];
  const sekarang = value !== "" ? teks?.[Number(value) as (typeof TINGKAT)[number]] : undefined;
  const titik = lang === "zh" ? "。" : ".";
  const kini = sekarang
    ? `${value}. ${sekarang.replace(/[.。]$/, "")}${titik}`
    : r.levelTip(komponen, r.nama[komponen] ?? "");
  // The digit shortcut is told in the tooltip too.
  const label = `${kini} ${r.levelHint}`;
  const ro = Boolean(readOnlyReason);
  return (
    <RadixPopover.Root open={open && !ro} onOpenChange={setOpen}>
      <RadixPopover.Anchor asChild>
        <span className="levelfield">
          <Tooltip label={label}>
            <ScoreInput
              ref={ref}
              {...rest}
              readOnlyReason={readOnlyReason}
              value={value}
              onClick={() => setOpen(true)}
              onFocus={(e) => {
                ketik.current = "";
                onFocus?.(e);
              }}
              // Digits are read from the key, not the text: the second digit
              // of a level keeps it, any other digit starts a new pick.
              onKeyDown={(e) => {
                if (!ro && /^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault();
                  const terus = ketik.current + e.key;
                  const lanjut = TINGKAT.find((n) => String(n).startsWith(terus));
                  ketik.current = lanjut !== undefined ? terus : e.key;
                  const pilih = lanjut !== undefined ? String(lanjut) : DARI_DIGIT[e.key];
                  if (pilih) onValue(pilih);
                }
                onKeyDown?.(e);
              }}
              onValue={(x) => {
                if (x === "" || x.length < value.length) onValue("");
              }}
            />
          </Tooltip>
        </span>
      </RadixPopover.Anchor>
      {dialogHost.marker}
      <RadixPopover.Portal container={dialogHost.host}>
        <RadixPopover.Content
          className="popover__panel levelfield__panel"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <b className="levelfield__title">
            {r.pickLevel}: {r.nama[komponen] ?? komponen}
          </b>
          <ul className="levelfield__list" role="listbox" aria-label={r.pickLevel}>
            {TINGKAT.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === String(n)}
                  className="levelfield__opt"
                  onClick={() => {
                    setOpen(false);
                    onPick(String(n));
                  }}
                >
                  <span className="levelfield__n mono">{n}</span>
                  <span className="levelfield__d">{teks?.[n]}</span>
                </button>
              </li>
            ))}
          </ul>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
});

export const L1Field = forwardRef<
  HTMLInputElement,
  Base & {
    lang: Lang;
    value: string;
    onValue: (v: string) => void;
    /** True while the shown value is the system's, not one typed. */
    otomatis: boolean;
  }
>(function L1Field({ lang, value, onValue, otomatis, ...rest }, ref) {
  const r = RB[lang];
  return (
    <span className="l1field" data-auto={otomatis ? "yes" : undefined}>
      <Tooltip label={otomatis ? r.autoTip : r.overrideTip}>
        <ScoreInput ref={ref} {...rest} value={value} onValue={onValue} />
      </Tooltip>
      {otomatis && <span className="l1field__auto">{r.auto}</span>}
    </span>
  );
});
