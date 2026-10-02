/**
 * Phase 8: the app's own form controls, replacing every native browser
 * widget that renders in the operating system's style (the user asked for
 * all of them, the date picker first):
 *
 * - Checkbox: a real role="checkbox" button, big enough to hit (48px row)
 * - Switch:   role="switch", for settings that apply immediately
 * - DatePicker: a calendar in the app's own popover (react-day-picker),
 *   with the date shown the Indonesian or English way, never mm/dd/yyyy
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
import { id as localeId, enUS } from "date-fns/locale";
import { format, parseISO, isValid } from "date-fns";
import { CalendarDays, Check, Upload, Loader2, AlertCircle, Lock } from "lucide-react";
import Popover from "./Popover";
import "./Controls.css";
import type { Lang } from "../../lib/kelas";
import { dict } from "../../lib/app";

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
        <Check size={16} strokeWidth={3} />
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

/* ----------------------------------------------------------- DatePicker */

const DP_TEXT = dict({
  id: { pick: "Pilih tanggal", today: "Hari ini", fmt: "EEEE, d MMMM yyyy" },
  en: { pick: "Pick a date", today: "Today", fmt: "EEEE, d MMMM yyyy" },
});

/** `value` and `onChange` use ISO dates ("2026-09-29"), the API's format. */
export function DatePicker({
  value,
  onChange,
  label,
  lang = "id",
  id,
}: {
  value: string;
  onChange: (iso: string) => void;
  label: string;
  lang?: Lang;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = DP_TEXT[lang];
  const locale = lang !== "id" ? enUS : localeId;
  const parsed = value ? parseISO(value) : undefined;
  const date = parsed && isValid(parsed) ? parsed : undefined;
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="ctl-field">
      <span className="ctl-field__label" id={`${fieldId}-label`}>
        {label}
      </span>
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            id={fieldId}
            className="ctl-date__trigger"
            aria-labelledby={`${fieldId}-label ${fieldId}`}
          >
            <CalendarDays size={18} aria-hidden="true" />
            <span>{date ? format(date, t.fmt, { locale }) : t.pick}</span>
          </button>
        }
      >
        <div className="ctl-date__panel">
          <DayPicker
            mode="single"
            selected={date}
            defaultMonth={date}
            onSelect={(d) => {
              if (!d) return;
              onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }}
            locale={locale}
            weekStartsOn={1}
            showOutsideDays
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              onChange(format(new Date(), "yyyy-MM-dd"));
              setOpen(false);
            }}
          >
            {t.today}
          </button>
        </div>
      </Popover>
    </div>
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
        {busy ? <Loader2 className="ctl-spin" size={22} /> : <Upload size={22} />}
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
          <AlertCircle size={16} aria-hidden="true" /> {err}
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
          <Lock size={13} />
        ) : state === "saving" ? (
          <Loader2 className="ctl-spin" size={13} />
        ) : state === "saved" ? (
          <Check size={13} strokeWidth={3} />
        ) : state === "error" ? (
          <AlertCircle size={13} />
        ) : null}
      </span>
    </span>
  );
});

/* ------------------------------------------------------------------ Kbd */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ctl-kbd">{children}</kbd>;
}
