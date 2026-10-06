/**
 * Konsol Pi's terminal (mockup v-console "term"): xterm.js on the relay.
 * Keystrokes go out as binary frames, the Pi's output comes back as binary,
 * and the size goes out as {"t":"r",c,r} whenever the pane changes. The bar
 * has the font size, Copy (the selection), Paste and Full Screen. Only the
 * one in control of the room types (the relay drops anyone else's keys);
 * the others watch the same shell.
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  ClipboardTextIcon,
  CopyIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react";
import type { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import IconButton from "../../ui/IconButton";
import type { KStrings } from "./strings";

const UKURAN_KEY = "iris-konsol-huruf";
const enc = new TextEncoder();

export interface TermApi {
  tulis: (d: ArrayBuffer) => void;
  ukur: () => void;
  fokus: () => void;
}

export default function Terminal({
  t,
  host,
  kirim,
  onKetik,
  apiRef,
  bisaKetik,
  onFull,
  full,
  onSiap,
}: {
  t: KStrings;
  host: string;
  kirim: (d: string | Uint8Array) => void;
  /** Any keystroke, for the idle timer. */
  onKetik: () => void;
  apiRef: { current: TermApi | null };
  /** I control the room: my keys reach the shell. */
  bisaKetik: boolean;
  /** Full screen on the whole pane, so the room's prompts show there too. */
  onFull: () => void;
  /** The pane is full screen now: the button leaves it. */
  full: boolean;
  /** The terminal is drawn and can take output. */
  onSiap?: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const term = useRef<XTerm | null>(null);
  const [huruf, setHuruf] = useState(() => {
    try {
      const n = Number(localStorage.getItem(UKURAN_KEY));
      return n >= 11 && n <= 20 ? n : 14;
    } catch {
      return 14;
    }
  });
  const cb = useRef({ kirim, onKetik, bisaKetik });
  cb.current = { kirim, onKetik, bisaKetik };

  useEffect(() => {
    if (!box.current) return;
    // xterm.js loads in the browser only (its package entry is CommonJS,
    // which the server render can't take), and only when a console opens.
    let mati = false;
    let bersihkan = () => {};
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(
      ([{ Terminal: XTermClass }, { FitAddon }]) => {
        if (mati || !box.current) return;
        bersihkan = pasang(box.current, XTermClass, FitAddon);
      },
    );
    return () => {
      mati = true;
      bersihkan();
    };
  }, []);

  function pasang(
    el: HTMLDivElement,
    XTermClass: typeof XTerm,
    FitAddon: typeof import("@xterm/addon-fit").FitAddon,
  ) {
    const css = getComputedStyle(document.documentElement);
    const x = new XTermClass({
      fontFamily: css.getPropertyValue("--font-mono").trim() || "monospace",
      fontSize: huruf,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: {
        background: "#0b0f17",
        foreground: "#d8e1f0",
        cursor: "#d8e1f0",
        selectionBackground: "#2c4a7a",
      },
    });
    const fit = new FitAddon();
    x.loadAddon(fit);
    x.open(el);
    term.current = x;
    const ukur = () => {
      try {
        fit.fit();
      } catch {
        /* hidden or zero size */
      }
    };
    ukur();
    const d1 = x.onData((s) => {
      if (!cb.current.bisaKetik) return;
      cb.current.onKetik();
      cb.current.kirim(enc.encode(s));
    });
    const d2 = x.onResize(({ cols, rows }) =>
      cb.current.kirim(JSON.stringify({ t: "r", c: cols, r: rows })),
    );
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    apiRef.current = {
      tulis: (d) => x.write(new Uint8Array(d)),
      ukur: () => {
        ukur();
        cb.current.kirim(JSON.stringify({ t: "r", c: x.cols, r: x.rows }));
      },
      fokus: () => x.focus(),
    };
    x.focus();
    onSiap?.();
    return () => {
      apiRef.current = null;
      ro.disconnect();
      d1.dispose();
      d2.dispose();
      x.dispose();
      term.current = null;
    };
  }

  useEffect(() => {
    const x = term.current;
    if (!x) return;
    x.options.fontSize = huruf;
    apiRef.current?.ukur();
    try {
      localStorage.setItem(UKURAN_KEY, String(huruf));
    } catch {
      /* private mode */
    }
  }, [huruf, apiRef]);

  async function salin() {
    const s = term.current?.getSelection() ?? "";
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
      window.Toast?.show(t.copied, "ok");
    } catch {
      window.Toast?.show(t.noClip, "danger");
    }
  }

  useEffect(() => {
    const x = term.current;
    if (x) x.options.disableStdin = !bisaKetik;
  }, [bisaKetik]);

  async function tempel() {
    if (!bisaKetik) return;
    try {
      const s = await navigator.clipboard.readText();
      if (s) {
        onKetik();
        kirim(enc.encode(s));
      }
    } catch {
      window.Toast?.show(t.noClip, "danger");
    }
    term.current?.focus();
  }

  return (
    <div className="term">
      <div className="term__bar">
        <span className="term__who">
          <span className="dot dot--ok" aria-hidden="true" />
          <b className="mono">{host}</b>
          <span className="hint term__hint">{bisaKetik ? t.termHint : t.termWatch}</span>
        </span>
        <span className="term__tools">
          <IconButton
            sm
            kind="ghost"
            icon={MagnifyingGlassMinusIcon}
            label={t.smaller}
            disabled={huruf <= 11}
            onClick={() => setHuruf((n) => Math.max(11, n - 1))}
          />
          <IconButton
            sm
            kind="ghost"
            icon={MagnifyingGlassPlusIcon}
            label={t.bigger}
            disabled={huruf >= 20}
            onClick={() => setHuruf((n) => Math.min(20, n + 1))}
          />
          <IconButton sm kind="ghost" icon={CopyIcon} label={t.copy} onClick={() => void salin()} />
          <IconButton
            sm
            kind="ghost"
            icon={ClipboardTextIcon}
            label={t.paste}
            disabled={!bisaKetik}
            onClick={() => void tempel()}
          />
          <IconButton
            sm
            kind="ghost"
            icon={full ? ArrowsInIcon : ArrowsOutIcon}
            label={full ? t.exitFull : t.full}
            onClick={onFull}
          />
        </span>
      </div>
      <div className="term__xterm" ref={box} role="region" aria-label={t.termOut} />
    </div>
  );
}
