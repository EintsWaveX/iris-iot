/**
 * Phase 8: the app's own form controls, replacing every native browser
 * widget that renders in the operating system's style (the user asked for
 * all of them, the date picker first):
 *
 * - Checkbox: a real role="checkbox" button, big enough to hit (48px row)
 * - Switch:   role="switch", for settings that apply immediately
 * - DateField / DatePicker: a calendar in the app's own popover
 *   (react-day-picker), the date written out in full in the page language;
 *   TimeField: a grid of times (Phase 9)
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
  useId,
  useRef,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { id as localeId, enGB, zhCN } from "date-fns/locale";
import { format, parseISO, isValid } from "date-fns";
import {
  CalendarBlankIcon,
  CheckIcon,
  CircleNotchIcon,
  ClockIcon,
  LockSimpleIcon,
  MinusIcon,
  PlusIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import Popover from "./Popover";
import "./Controls.css";
import type { Lang } from "../../lib/kelas";
import { dict, tanggalPanjang, waktuPilihan } from "../../lib/app";

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
   full ("Kamis, 1 Oktober 2026"); TimeField opens a grid of times. Both
   take the API's formats: "2026-10-01" and "09:30". */

const DP_TEXT = dict({
  id: { pick: "Pilih tanggal", pickTime: "Pilih jam", today: "Hari ini" },
  en: { pick: "Pick a date", pickTime: "Pick a time", today: "Today" },
  zh: { pick: "选择日期", pickTime: "选择时间", today: "今天" },
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
  labelledBy,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const t = DP_TEXT[lang];
  const parsed = value ? parseISO(value) : undefined;
  const date = parsed && isValid(parsed) ? parsed : undefined;
  const today = format(new Date(), "yyyy-MM-dd");
  const todayOk = (!min || today >= min) && (!max || today <= max);
  const disabled = [
    ...(min ? [{ before: parseISO(min) }] : []),
    ...(max ? [{ after: parseISO(max) }] : []),
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

export function TimeField({
  value,
  onChange,
  label,
  lang = "id",
  id,
  from = 6,
  to = 18,
  step = 30,
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
  const opts = waktuPilihan(from, to, step);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          id={id}
          className="ctl-date__trigger"
          aria-haspopup="listbox"
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy && id ? `${labelledBy} ${id}` : labelledBy}
        >
          <span className="num">{value || DP_TEXT[lang].pickTime}</span>
          <ClockIcon size={20} aria-hidden="true" />
        </button>
      }
    >
      <div className="ctl-time" role="listbox" aria-label={label}>
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            role="option"
            className="ctl-time__o num"
            aria-selected={o === value}
            onClick={() => {
              onChange(o);
              setOpen(false);
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </Popover>
  );
}

/* ------------------------------------------------------------- FileDrop */

const FD_TEXT = dict({
  id: {
    drop: "Seret berkas ke sini",
    or: "atau",
    choose: "Pilih berkas",
    busy: "Mengunggah…",
    max: (mb: number) => `Maksimal ${mb} MB`,
    type: "Jenis berkas ini tidak diterima.",
    size: (mb: number) => `Berkas terlalu besar. Maksimal ${mb} MB.`,
  },
  en: {
    drop: "Drag a file here",
    or: "or",
    choose: "Choose a file",
    busy: "Uploading…",
    max: (mb: number) => `Up to ${mb} MB`,
    type: "This file type is not accepted.",
    size: (mb: number) => `The file is too large. Up to ${mb} MB.`,
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
}: {
  /** MIME types, e.g. ["application/pdf"]. */
  accept: string[];
  maxBytes: number;
  onFile: (f: File) => void;
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

  function take(f: File | undefined) {
    if (!f) return;
    if (!accept.includes(f.type)) return setErr(t.type);
    if (f.size > maxBytes) return setErr(t.size(mb));
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
        <MinusIcon size={18} aria-hidden="true" />
      </button>
      <output aria-live="polite">{fmt(value)}</output>
      <button
        type="button"
        aria-label={moreLabel}
        disabled={value >= max}
        onClick={() => set(value + step)}
      >
        <PlusIcon size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
