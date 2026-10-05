/**
 * Phase 8: the app's own form controls, replacing every native browser
 * widget that renders in the operating system's style (the user asked for
 * all of them, the date picker first):
 *
 * - Checkbox: a real role="checkbox" button, big enough to hit (48px row)
 * - Switch:   role="switch", for settings that apply immediately
 * - DateField / DatePicker: a calendar in the app's own popover
 *   (react-day-picker), the date written out in full in the page language;
 *   TimeField: hours and minutes as two boxes, plus an Hour and Minute picker (Phase 9)
 * - FileDrop: a drop zone with a big "choose file" button. The file dialog
 *   itself belongs to the operating system and cannot be restyled, but the
 *   control around it is ours, with type and size checks before upload
 * - ScoreInput: the 56px score field (text + inputmode numeric, never a
 *   number spinner), with saving / saved / error / read-only states
 *
 * Dropdown.tsx remains the select replacement; Dialog.tsx and Confirm.tsx
 * replace alert/confirm/prompt.
 */
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { id as localeId, enGB, zhCN } from "date-fns/locale";
import { format, parseISO, isValid } from "date-fns";
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CircleNotchIcon,
  ClockIcon,
  LockSimpleIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import * as RadixPopover from "@radix-ui/react-popover";
import Popover from "./Popover";
import { useDialogHost } from "./dialogHost";
import "./Controls.css";
import type { Lang } from "../../lib/kelas";
import { dict, tanggalPanjang } from "../../lib/app";

/* ------------------------------------------------------------- Checkbox */

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className="ctl-check"
      onClick={() => onChange(!checked)}
    >
      <span className="ctl-check__box" aria-hidden="true">
        <CheckIcon size={16} weight="bold" />
      </span>
      <span className="ctl-check__text">
        <span className="ctl-check__label">{label}</span>
        {hint && <span className="ctl-check__hint">{hint}</span>}
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- Switch */

export function Switch({
  on,
  onChange,
  label,
  showLabel = false,
  disabled,
  busy,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={showLabel ? undefined : label}
      aria-busy={busy || undefined}
      disabled={disabled}
      className="ctl-switch"
      onClick={() => onChange(!on)}
    >
      <span className="ctl-switch__track" aria-hidden="true">
        <span className="ctl-switch__thumb" />
      </span>
      {showLabel && <span className="ctl-switch__label">{label}</span>}
    </button>
  );
}

/* ------------------------------------------- DateField, TimeField, DatePicker
   Phase 9 kit: the site's own pickers, never the browser's date and time
   inputs. DateField opens a calendar popover and writes the date out in
   full ("Kamis, 1 Oktober 2026"); TimeField edits hours and minutes apart. Both
   take the API's formats: "2026-10-01" and "09:30". */

const DP_TEXT = dict({
  id: {
    pick: "Pilih tanggal",
    pickTime: "Pilih jam",
    today: "Hari ini",
    hour: "Jam",
    minute: "Menit",
    now: "Sekarang",
    done: "Selesai",
  },
  en: {
    pick: "Pick a date",
    pickTime: "Pick a time",
    today: "Today",
    hour: "Hour",
    minute: "Minute",
    now: "Now",
    done: "Done",
  },
  zh: {
    pick: "选择日期",
    pickTime: "选择时间",
    today: "今天",
    hour: "时",
    minute: "分",
    now: "现在",
    done: "完成",
  },
});

const DP_LOCALE = { id: localeId, en: enGB, zh: zhCN } as const;

interface DateFieldProps {
  value: string;
  onChange: (iso: string) => void;
  /** The field's name, read out by screen readers. */
  label: string;
  lang?: Lang;
  id?: string;
  /** Earliest and latest dates that can be picked (ISO). */
  min?: string;
  max?: string;
  /** Only these dates can be picked, when given (e.g. days that had a session). */
  boleh?: (iso: string) => boolean;
  /** Points at a visible label instead of `label`. */
  labelledBy?: string;
}

export function DateField({
  value,
  onChange,
  label,
  lang = "id",
  id,
  min,
  max,
  boleh,
  labelledBy,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const t = DP_TEXT[lang];
  const parsed = value ? parseISO(value) : undefined;
  const date = parsed && isValid(parsed) ? parsed : undefined;
  const today = format(new Date(), "yyyy-MM-dd");
  const todayOk = (!min || today >= min) && (!max || today <= max) && (!boleh || boleh(today));
  const disabled = [
    ...(min ? [{ before: parseISO(min) }] : []),
    ...(max ? [{ after: parseISO(max) }] : []),
    ...(boleh ? [(d: Date) => !boleh(format(d, "yyyy-MM-dd"))] : []),
  ];
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          id={id}
          className="ctl-date__trigger"
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy && id ? `${labelledBy} ${id}` : labelledBy}
        >
          <span>{date ? tanggalPanjang(value, lang) : t.pick}</span>
          <CalendarBlankIcon size={20} aria-hidden="true" />
        </button>
      }
    >
      <div className="ctl-date__panel">
        <DayPicker
          mode="single"
          selected={date}
          defaultMonth={date}
          disabled={disabled}
          onSelect={(d) => {
            if (!d) return;
            onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          locale={DP_LOCALE[lang]}
          weekStartsOn={1}
          showOutsideDays
        />
        {todayOk && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
          >
            {t.today}
          </button>
        )}
      </div>
    </Popover>
  );
}

/** A DateField with its visible label above it. */
export function DatePicker(props: DateFieldProps) {
  const autoId = useId();
  const fieldId = props.id ?? autoId;
  return (
    <div className="ctl-field">
      <span className="ctl-field__label" id={`${fieldId}-label`}>
        {props.label}
      </span>
      <DateField {...props} id={fieldId} labelledBy={`${fieldId}-label`} />
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The clock in Jakarta right now, "HH:MM" (every time on the site is WIB). */
function jamSekarang(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

/** One half of the clock: a two-digit box that takes typing and arrows. */
function ClockPart({
  value,
  min,
  max,
  step,
  label,
  inputRef,
  onSet,
  onNext,
  onPrev,
}: {
  value: number | null;
  min: number;
  max: number;
  step: number;
  label: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSet: (n: number) => void;
  onNext?: () => void;
  onPrev?: () => void;
}) {
  // The digits typed so far. A ref as well as state: focus jumps to the next
  // box in the same tick as a commit, and that blur must see the cleared draft.
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (d: string | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const fit = (n: number) => {
    const c = Math.min(max, Math.max(min, n));
    return Math.min(max, min + Math.round((c - min) / step) * step);
  };
  const commit = (raw: string | null) => {
    setDraft(null);
    if (raw) onSet(fit(Number(raw)));
  };
  const geser = (arah: 1 | -1) => {
    setDraft(null);
    if (value == null) return onSet(arah > 0 ? min : fit(max));
    const n = value + arah * step;
    onSet(n > max ? min : n < min ? fit(max) : n);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      geser(e.key === "ArrowUp" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setDraft(null);
      onSet(e.key === "Home" ? min : fit(max));
    } else if (e.key === "Enter") {
      if (draft != null) commit(draft);
    } else if (
      onNext &&
      (e.key === ":" || (e.key === "ArrowRight" && el.selectionStart === el.value.length))
    ) {
      e.preventDefault();
      commit(draft);
      onNext();
    } else if (onPrev && e.key === "ArrowLeft" && el.selectionStart === 0) {
      e.preventDefault();
      commit(draft);
      onPrev();
    } else if (onPrev && e.key === "Backspace" && el.value === "") {
      e.preventDefault();
      onPrev();
    }
  };
  return (
    <input
      ref={inputRef}
      className="ctl-clock__part num"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      role="spinbutton"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value == null ? undefined : pad2(value)}
      placeholder="--"
      maxLength={2}
      value={draft ?? (value == null ? "" : pad2(value))}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={onKey}
      onBlur={() => commit(draftRef.current)}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "").slice(0, 2);
        // Two digits, or one digit that cannot start a two-digit value in
        // range ("7" for minutes means 07): the box is done.
        if (d.length === 2 || (d.length === 1 && Number(d) * 10 > max)) {
          commit(d);
          onNext?.();
        } else setDraft(d);
      }}
    />
  );
}

const WHEEL_H = 44; // one row of the wheel, px (matches .ctl-wheel__o)
const WHEEL_COPIES = 7; // the list repeats so the wheel turns round forever

/**
 * One drum of the clock picker, in the style of a phone's alarm clock: the
 * value under the centre line is big and bright, its neighbours shrink and
 * fade. Scroll, swipe, click a neighbour or use the arrow keys; it snaps to
 * a row and loops past the ends.
 */
function Wheel({
  items,
  value,
  label,
  onPick,
  wheelRef,
}: {
  items: number[];
  value: number;
  label: string;
  onPick: (n: number) => void;
  wheelRef?: RefObject<HTMLDivElement | null>;
}) {
  const own = useRef<HTMLDivElement>(null);
  const ref = wheelRef ?? own;
  const n = items.length;
  const mid = Math.floor(WHEEL_COPIES / 2) * n;
  const want = Math.max(0, items.indexOf(value));
  const [c, setC] = useState(mid + want);
  const timer = useRef(0);
  // The latest props for the settle timer, which outlives the render it came from.
  const live = useRef({ value, onPick });
  live.current = { value, onPick };
  const row = () => Math.round((ref.current?.scrollTop ?? 0) / WHEEL_H);
  const mod = (i: number) => ((i % n) + n) % n;

  /* Show the value (on open, or after the boxes were typed into). */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const i = row();
    if (mod(i) === want && i >= n && i < (WHEEL_COPIES - 1) * n) return;
    el.scrollTop = (mid + want) * WHEEL_H;
    setC(mid + want);
  }, [want, n]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onScroll = () => {
    setC(row());
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const j = row();
      const k = mod(j);
      // Near either end of the copies: jump back to the middle copy unseen.
      if (j < n || j >= (WHEEL_COPIES - 1) * n) {
        el.scrollTop = (mid + k) * WHEEL_H;
        setC(mid + k);
      }
      if (items[k] !== live.current.value) live.current.onPick(items[k]);
    }, 120);
  };
  const turn = (rows: number) => ref.current?.scrollBy({ top: rows * WHEEL_H, behavior: "smooth" });
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const by: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    if (e.key in by) {
      e.preventDefault();
      turn(by[e.key]);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      turn((e.key === "Home" ? 0 : n - 1) - mod(row()));
    }
  };

  return (
    <div
      ref={ref}
      className="ctl-wheel"
      tabIndex={0}
      role="spinbutton"
      aria-label={label}
      aria-valuemin={items[0]}
      aria-valuemax={items[n - 1]}
      aria-valuenow={value}
      aria-valuetext={pad2(value)}
      onScroll={onScroll}
      onKeyDown={onKey}
    >
      {Array.from({ length: WHEEL_COPIES * n }, (_, i) => (
        <div
          key={i}
          className="ctl-wheel__o num"
          data-d={Math.min(Math.abs(i - c), 3)}
          aria-hidden="true"
          onClick={() => turn(i - row())}
        >
          {pad2(items[i % n])}
        </div>
      ))}
    </div>
  );
}

/**
 * The site's clock control (Phase 9): hours and minutes as two separate
 * boxes. Type into either (a phone shows the number pad), use the arrow
 * keys, or open the picker for an Hour column and a Minute column. Takes
 * and gives "HH:MM". `from` and `to` bound the hours; `step` is the minute
 * step (every minute by default).
 */
export function TimeField({
  value,
  onChange,
  label,
  lang = "id",
  id,
  from = 0,
  to = 23,
  step = 1,
  labelledBy,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  label: string;
  lang?: Lang;
  id?: string;
  from?: number;
  to?: number;
  step?: number;
  labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogHost = useDialogHost();
  const t = DP_TEXT[lang];
  const ok = /^\d{2}:\d{2}$/.test(value);
  const h = ok ? Number(value.slice(0, 2)) : null;
  const m = ok ? Number(value.slice(3, 5)) : null;
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const hWheel = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  const now = jamSekarang();
  const nowH = Number(now.slice(0, 2));
  const nowOk = nowH >= from && nowH <= to;
  /** The hour used when only the minute is picked. */
  const jamAsal = h ?? (nowOk ? nowH : from);
  const set = (hh: number, mm: number) => onChange(`${pad2(hh)}:${pad2(mm)}`);
  const fieldRef = useRef<HTMLDivElement>(null);
  /** Opened by a mouse click on HH or MM: the box keeps focus for typing. */
  const tetapDiKotak = useRef(false);

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      {dialogHost.marker}
      <RadixPopover.Anchor asChild>
        <div
          className="ctl-clock"
          id={id}
          role="group"
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy}
          data-state={open ? "open" : "closed"}
          ref={fieldRef}
          // A tap anywhere on the field opens the picker. A mouse click on a
          // box also leaves the caret there for typing; a touch does not
          // focus the box, so no keyboard covers the drums.
          onPointerDown={(e) => {
            const kotak = (e.target as HTMLElement).closest(".ctl-clock__part");
            tetapDiKotak.current = !!kotak && e.pointerType === "mouse";
            if (kotak && e.pointerType !== "mouse") e.preventDefault();
          }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".ctl-clock__open")) return;
            if (!open) setOpen(true);
          }}
        >
          <ClockPart
            value={h}
            min={from}
            max={to}
            step={1}
            label={t.hour}
            inputRef={hRef}
            onSet={(x) => set(x, m ?? 0)}
            onNext={() => mRef.current?.focus()}
          />
          <span className="ctl-clock__sep" aria-hidden="true">
            :
          </span>
          <ClockPart
            value={m}
            min={0}
            max={60 - step}
            step={step}
            label={t.minute}
            inputRef={mRef}
            onSet={(x) => set(jamAsal, x)}
            onPrev={() => hRef.current?.focus()}
          />
          <RadixPopover.Trigger asChild>
            <button
              type="button"
              className="ctl-clock__open"
              aria-label={`${t.pickTime}: ${label}`}
            >
              <ClockIcon size={20} aria-hidden="true" />
            </button>
          </RadixPopover.Trigger>
        </div>
      </RadixPopover.Anchor>
      <RadixPopover.Portal container={dialogHost.host}>
        <RadixPopover.Content
          className="popover__panel ctl-clockpick"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={label}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (tetapDiKotak.current) return;
            requestAnimationFrame(() => hWheel.current?.focus({ preventScroll: true }));
          }}
          // Clicks on the field itself never count as outside.
          onInteractOutside={(e) => {
            if (fieldRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <div className="ctl-clockpick__heads" aria-hidden="true">
            <span className="label-caps">{t.hour}</span>
            <span className="label-caps">{t.minute}</span>
          </div>
          <div className="ctl-clockpick__wheels">
            <Wheel
              items={hours}
              value={h ?? (nowOk ? nowH : from)}
              label={t.hour}
              wheelRef={hWheel}
              onPick={(x) => set(x, m ?? 0)}
            />
            <span className="ctl-clockpick__sep" aria-hidden="true">
              :
            </span>
            <Wheel
              items={minutes}
              value={m ?? 0}
              label={t.minute}
              onPick={(x) => set(jamAsal, x)}
            />
          </div>
          <div className="ctl-clockpick__foot">
            {nowOk && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  set(nowH, Math.floor(Number(now.slice(3, 5)) / step) * step);
                  setOpen(false);
                }}
              >
                {t.now}
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setOpen(false)}
            >
              {t.done}
            </button>
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

/* ------------------------------------------------------------- FileDrop */

const FD_TEXT = dict({
  id: {
    drop: "Seret berkas ke sini",
    or: "atau",
    choose: "Pilih Berkas",
    busy: "Mengunggah…",
    max: (mb: number) => `Maksimal ${mb} MB`,
    type: "Jenis berkas ini tidak diterima.",
    size: (mb: number) => `Berkas terlalu besar. Maksimal ${mb} MB.`,
  },
  en: {
    drop: "Drag a file here",
    or: "or",
    choose: "Choose a File",
    busy: "Uploading…",
    max: (mb: number) => `Up to ${mb} MB`,
    type: "This file type is not accepted.",
    size: (mb: number) => `The file is too large. Up to ${mb} MB.`,
  },
  zh: {
    drop: "把文件拖到这里",
    or: "或",
    choose: "选择文件",
    busy: "上传中…",
    max: (mb: number) => `最大 ${mb} MB`,
    type: "不接受这种文件类型。",
    size: (mb: number) => `文件太大。最大 ${mb} MB。`,
  },
});

export function FileDrop({
  accept,
  maxBytes,
  onFile,
  busy,
  lang = "id",
  kinds,
  compact,
  onTooBig,
  pick,
}: {
  /** MIME types, e.g. ["application/pdf"], or extensions (".ino"). */
  accept: string[];
  maxBytes: number;
  onFile: (f: File) => void;
  /** Hands an oversized file to the caller (the 413 view) instead of the
   *  inline error. */
  onTooBig?: (f: File) => void;
  /** Bump to open the file picker (e.g. the 413 view's "Pilih Berkas Lain"). */
  pick?: number;
  busy?: boolean;
  lang?: Lang;
  /** Human label of the accepted kinds, e.g. "PDF" or "PNG, JPG". */
  kinds: string;
  compact?: boolean;
}) {
  const t = FD_TEXT[lang];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mb = Math.floor(maxBytes / 1024 / 1024);
  useEffect(() => {
    if (pick) inputRef.current?.click();
  }, [pick]);

  function take(f: File | undefined) {
    if (!f) return;
    const cocok = (x: string) =>
      x.startsWith(".") ? f.name.toLowerCase().endsWith(x) : x === f.type;
    if (!accept.some(cocok)) return setErr(t.type);
    if (f.size > maxBytes) {
      if (onTooBig) return onTooBig(f);
      return setErr(t.size(mb));
    }
    setErr(null);
    onFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (!busy) take(e.dataTransfer.files?.[0]);
  }

  return (
    <div
      className="ctl-drop"
      data-over={over ? "yes" : undefined}
      data-busy={busy ? "yes" : undefined}
      data-compact={compact ? "yes" : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(",")}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <span className="ctl-drop__icon" aria-hidden="true">
        {busy ? <CircleNotchIcon className="ctl-spin" size={22} /> : <UploadSimpleIcon size={22} />}
      </span>
      {!compact && <span className="ctl-drop__title">{busy ? t.busy : t.drop}</span>}
      <button
        type="button"
        className="btn btn--secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy && compact ? t.busy : t.choose}
      </button>
      <span className="ctl-drop__hint">
        {kinds} · {t.max(mb)}
      </span>
      {err && (
        <span className="ctl-drop__error" role="alert">
          <WarningCircleIcon size={16} aria-hidden="true" /> {err}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- ScoreInput */

export type SaveState = "idle" | "saving" | "saved" | "error";

type ScoreProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  state?: SaveState;
  readOnlyReason?: string;
  flash?: boolean;
  onValue?: (v: string) => void;
};

/** The big score field. Digits only, 0 to 100 is validated by the caller. */
export const ScoreInput = forwardRef<HTMLInputElement, ScoreProps>(function ScoreInput(
  { state = "idle", readOnlyReason, flash, onValue, className, onKeyDown, ...rest },
  ref,
) {
  const ro = Boolean(readOnlyReason);
  return (
    <span
      className={["ctl-score", className].filter(Boolean).join(" ")}
      data-state={state}
      data-flash={flash ? "yes" : undefined}
      data-readonly={ro ? "yes" : undefined}
    >
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        autoComplete="off"
        readOnly={ro}
        aria-readonly={ro || undefined}
        aria-description={readOnlyReason}
        onChange={(e) => onValue?.(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
          }
          onKeyDown?.(e);
        }}
        {...rest}
      />
      <span className="ctl-score__mark" aria-hidden="true">
        {ro ? (
          <LockSimpleIcon size={13} />
        ) : state === "saving" ? (
          <CircleNotchIcon className="ctl-spin" size={13} />
        ) : state === "saved" ? (
          <CheckIcon size={13} weight="bold" />
        ) : state === "error" ? (
          <WarningCircleIcon size={13} />
        ) : null}
      </span>
    </span>
  );
});

/* ------------------------------------------------------------------ Kbd */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ctl-kbd">{children}</kbd>;
}

/* -------------------------------------------------------------- Stepper */

/** A number picked with minus and plus (Phase 9 kit, mockup Stepper): a
 *  session's length, a group count, a start window. The ends disable their
 *  button; `fmt` writes the value ("90 menit"). */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  fmt = String,
  lessLabel,
  moreLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  fmt?: (v: number) => string;
  lessLabel: string;
  moreLabel: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="ctl-stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={lessLabel}
        disabled={value <= min}
        onClick={() => set(value - step)}
      >
        <CaretLeftIcon size={18} aria-hidden="true" />
      </button>
      <output aria-live="polite">{fmt(value)}</output>
      <button
        type="button"
        aria-label={moreLabel}
        disabled={value >= max}
        onClick={() => set(value + step)}
      >
        <CaretRightIcon size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
