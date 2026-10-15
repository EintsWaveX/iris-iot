/**
 * The Asisten sign-in field: their three-letter code in three boxes, the
 * same look as the session code's four (2026-10-09). Letters only, shown
 * upper case; typing or pasting runs across the boxes. The value keeps a
 * space for an empty box, so clearing the middle one keeps the third.
 */
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  label: string;
  letter: (i: number) => string;
  error?: string;
  disabled?: boolean;
};

const N = 3;

export default function KodeAsistenField(p: Props) {
  const kotak = useRef<(HTMLInputElement | null)[]>([]);
  const huruf = Array.from({ length: N }, (_, i) => (p.value[i] ?? "").trim());
  const kirim = (n: string[]) =>
    p.onChange(
      n
        .map((x) => x || " ")
        .join("")
        .trimEnd(),
    );

  const isi = (i: number, v: string) => {
    const masuk = v.replace(/[^a-z]/gi, "").toUpperCase();
    const n = [...huruf];
    if (!masuk) {
      n[i] = "";
      kirim(n);
      return;
    }
    for (let k = 0; k < masuk.length && i + k < N; k++) n[i + k] = masuk[k];
    kirim(n);
    kotak.current[Math.min(i + masuk.length, N - 1)]?.focus();
  };

  const tombol = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !huruf[i] && i > 0) {
      e.preventDefault();
      kirim(huruf.map((y, j) => (j === i - 1 ? "" : y)));
      kotak.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      kotak.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < N - 1) {
      e.preventDefault();
      kotak.current[i + 1]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      p.onEnter();
    }
  };

  const tempel = (e: ClipboardEvent<HTMLInputElement>) => {
    const masuk = e.clipboardData
      .getData("text")
      .replace(/[^a-z]/gi, "")
      .toUpperCase()
      .slice(0, N);
    if (!masuk) return;
    e.preventDefault();
    p.onChange(masuk);
    kotak.current[Math.min(masuk.length, N - 1)]?.focus();
  };

  return (
    <div className="field" data-invalid={p.error ? "yes" : undefined}>
      <span className="field__label" id="login-kode-l">
        {p.label}
      </span>
      <div className="kodesesi__boxes login-kode" role="group" aria-labelledby="login-kode-l">
        {huruf.map((x, i) => (
          <input
            key={i}
            ref={(el) => {
              kotak.current[i] = el;
            }}
            id={`login-kode-${i}`}
            className="kodesesi__box"
            value={x}
            onChange={(e) => isi(i, e.target.value)}
            onKeyDown={(e) => tombol(i, e)}
            onPaste={tempel}
            onFocus={(e) => e.target.select()}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete={i === 0 ? "username" : "off"}
            autoFocus={i === 0}
            maxLength={N}
            disabled={p.disabled}
            aria-label={p.letter(i + 1)}
            aria-invalid={p.error ? true : undefined}
            aria-describedby={p.error ? "login-kode-msg" : undefined}
          />
        ))}
      </div>
      {p.error && (
        <p id="login-kode-msg" className="field__error" role="alert">
          {p.error}
        </p>
      )}
    </div>
  );
}
