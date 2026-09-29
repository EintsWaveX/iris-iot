/**
 * A password field with a show/hide toggle and, for new passwords, a
 * strength meter (Phase 8). Shared by the login dialog's set-password stage
 * and the /account page.
 */
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./PasswordField.css";

type Lang = "id" | "en";

const T = {
  id: {
    show: "Tampilkan kata sandi",
    hide: "Sembunyikan kata sandi",
    levels: ["Terlalu pendek", "Lemah", "Cukup", "Kuat", "Sangat kuat"],
  },
  en: {
    show: "Show password",
    hide: "Hide password",
    levels: ["Too short", "Weak", "Fair", "Strong", "Very strong"],
  },
};

/** 0 (under 8 characters) to 4. */
export function kekuatanSandi(pw: string): number {
  if (pw.length < 8) return 0;
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 0.5;
  return Math.min(4, Math.floor(s));
}

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  meter = false,
  hint,
  error,
  lang = "id",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  meter?: boolean;
  hint?: string;
  error?: string;
  lang?: Lang;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const t = T[lang];
  const level = kekuatanSandi(value);
  return (
    <div className="field" data-invalid={error ? "yes" : undefined}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <span className="pwfield">
        <input
          id={id}
          type={shown ? "text" : "password"}
          className="field__input pwfield__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="pwfield__toggle"
          aria-label={shown ? t.hide : t.show}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
      {meter && value.length > 0 && (
        <span className="pwfield__meter" data-level={level} aria-live="polite">
          <span className="pwfield__bars" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <i key={i} data-on={level >= i ? "yes" : undefined} />
            ))}
          </span>
          <span className="pwfield__level">{t.levels[level]}</span>
        </span>
      )}
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
