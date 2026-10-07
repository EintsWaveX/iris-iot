/**
 * The session code, asked in its own dialog once the NIM is in (2026-10-07,
 * user): four boxes, one digit each, two tries a round. After a round of
 * wrong codes the server locks this NIM for 30 s, then 60, 120...; the
 * dialog counts it down and the server refuses any try before it ends
 * (lib/auth statusKode), so a reload or another tab changes nothing.
 * Typing moves to the next box, Backspace on an empty box goes back, the
 * arrows move, and pasting all four digits fills every box. It never sends
 * by itself: a slip on the fourth digit would cost a try.
 */
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import Dialog from "./ui/Dialog";
import type { Lang } from "../lib/kelas";
import "./KodeSesiDialog.css";

export interface KodeSesiT {
  title: string;
  desc: string;
  digit: (i: number) => string;
  submit: string;
  cancel: string;
  checking: string;
  triesLeft: (n: number) => string;
  locked: (detik: string) => string;
  lockedNote: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
  t: KodeSesiT;
  /** Tries left this round and seconds until the lock ends (server's word). */
  sisaPercobaan: number;
  sisaDetik: number;
  /** The last wrong-code message, shown under the boxes. */
  pesan: string | null;
  busy: boolean;
  onSubmit: (kode: string) => void;
}

const KOSONG = ["", "", "", ""];

const jamDetik = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function KodeSesiDialog(p: Props) {
  const [d, setD] = useState<string[]>(KOSONG);
  const kotak = useRef<(HTMLInputElement | null)[]>([]);
  const [sisa, setSisa] = useState(p.sisaDetik);

  // The lock counts down here; the server's number restarts it.
  useEffect(() => {
    setSisa(p.sisaDetik);
    if (p.sisaDetik <= 0) return;
    const sampai = Date.now() + p.sisaDetik * 1000;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((sampai - Date.now()) / 1000));
      setSisa(s);
      if (s === 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [p.sisaDetik]);
  const terkunci = sisa > 0;

  // A fresh round (opened, a wrong code, the lock just ended): empty boxes,
  // the first one focused.
  useEffect(() => {
    if (!p.open || terkunci || p.busy) return;
    setD(KOSONG);
    const id = window.setTimeout(() => kotak.current[0]?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [p.open, terkunci, p.busy, p.pesan]);

  const lengkap = d.every((x) => /^\d$/.test(x));
  const kirim = () => {
    if (lengkap && !terkunci && !p.busy) p.onSubmit(d.join(""));
  };

  const isi = (i: number, v: string) => {
    const angka = v.replace(/\D/g, "");
    if (!angka) {
      setD((x) => x.map((y, j) => (j === i ? "" : y)));
      return;
    }
    // Typing over a box, or a phone keyboard dropping several digits in one.
    setD((x) => {
      const n = [...x];
      for (let k = 0; k < angka.length && i + k < 4; k++) n[i + k] = angka[k];
      return n;
    });
    kotak.current[Math.min(i + angka.length, 3)]?.focus();
  };

  const tombol = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !d[i] && i > 0) {
      e.preventDefault();
      setD((x) => x.map((y, j) => (j === i - 1 ? "" : y)));
      kotak.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      kotak.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 3) {
      e.preventDefault();
      kotak.current[i + 1]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      kirim();
    }
  };

  const tempel = (e: ClipboardEvent<HTMLInputElement>) => {
    const angka = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!angka) return;
    e.preventDefault();
    setD(KOSONG.map((_, j) => angka[j] ?? ""));
    kotak.current[Math.min(angka.length, 3)]?.focus();
  };

  return (
    <Dialog
      open={p.open}
      onOpenChange={p.onOpenChange}
      title={p.t.title}
      description={p.t.desc}
      size="sm"
      lang={p.lang}
      actions={
        <>
          <button type="button" className="btn" onClick={() => p.onOpenChange(false)}>
            {p.t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={kirim}
            disabled={!lengkap || terkunci || p.busy}
          >
            {p.busy ? p.t.checking : p.t.submit}
          </button>
        </>
      }
    >
      <div className="kodesesi" data-locked={terkunci ? "yes" : undefined}>
        <div className="kodesesi__boxes" role="group" aria-label={p.t.title}>
          {d.map((x, i) => (
            <input
              key={i}
              ref={(el) => {
                kotak.current[i] = el;
              }}
              id={`kode-sesi-${i}`}
              className="kodesesi__box"
              value={x}
              onChange={(e) => isi(i, e.target.value)}
              onKeyDown={(e) => tombol(i, e)}
              onPaste={tempel}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={4}
              disabled={terkunci || p.busy}
              aria-label={p.t.digit(i + 1)}
              aria-invalid={p.pesan && !terkunci ? true : undefined}
            />
          ))}
        </div>
        <p
          className={
            terkunci || p.pesan ? "field__error kodesesi__msg" : "field__hint kodesesi__msg"
          }
          role={terkunci || p.pesan ? "alert" : undefined}
        >
          {terkunci
            ? p.t.locked(jamDetik(sisa))
            : p.pesan
              ? `${p.pesan} ${p.t.triesLeft(p.sisaPercobaan)}`
              : p.t.triesLeft(p.sisaPercobaan)}
        </p>
        {terkunci && <p className="hint kodesesi__note">{p.t.lockedNote}</p>}
      </div>
    </Dialog>
  );
}
