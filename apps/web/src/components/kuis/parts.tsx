/**
 * Small pieces the host and player screens share: answer shapes, the timer
 * ring, count-up numbers, the animated backdrop, the answer tiles and the
 * leaderboard. Motion follows the site's three levels (`m`): full and ldm
 * animate (ldm with less), reduce shows the end state at once.
 */
import gsap from "gsap";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { BarisPapan } from "../../lib/kuis/engine";
import type { SoalPublik } from "../../lib/kuis/types";
import { warnaUntuk, type WarnaPilihan } from "../../lib/kuis/warna";
import type { MotionLevel } from "../recruitment/reveal/fx";
import type { KuisTeks } from "./kuisStrings";

// ---------------------------------------------------------------- shapes

export function Bentuk({ bentuk, size = 26 }: { bentuk: WarnaPilihan["bentuk"]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {bentuk === "segitiga" && <polygon points="12,3 22.5,21 1.5,21" />}
      {bentuk === "belah-ketupat" && <polygon points="12,1 23,12 12,23 1,12" />}
      {bentuk === "lingkaran" && <circle cx="12" cy="12" r="10" />}
      {bentuk === "kotak" && <rect x="3" y="3" width="18" height="18" rx="2.5" />}
    </svg>
  );
}

// ------------------------------------------------------------ the clock

/** Whole seconds left on a timed phase, ticking at 10 Hz; frozen at `sisaJeda` while paused. */
export function useDetikSisa(
  akhir: number | null,
  sisaJeda: number | null,
  sekarang: () => number,
  aktif: boolean,
): number | null {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (!aktif) return setMs(null);
    if (akhir === null) return setMs(sisaJeda);
    const tik = () => setMs(Math.max(0, akhir - sekarang()));
    tik();
    const id = window.setInterval(tik, 100);
    return () => window.clearInterval(id);
  }, [akhir, sisaJeda, aktif, sekarang]);
  return ms === null ? null : Math.ceil(ms / 1000);
}

/**
 * The countdown ring. The sweep is a CSS animation that starts part way in
 * (a negative delay) when the page opens mid question, so it is smooth and
 * costs no re-render; it stands still while the clock is paused.
 */
export function Cincin({
  totalMs,
  sisaMs,
  dijeda,
  detik,
  kunci,
}: {
  totalMs: number;
  sisaMs: number | null;
  dijeda: boolean;
  detik: number | null;
  kunci: string | number;
}) {
  const lewat = sisaMs === null ? 0 : Math.max(0, totalMs - sisaMs);
  const gaya = {
    "--kz-dur": `${totalMs}ms`,
    "--kz-tunda": `${-lewat}ms`,
  } as CSSProperties;
  const genting = detik !== null && detik <= 5 && !dijeda;
  return (
    <div
      className="kz__cincin"
      data-genting={genting ? "1" : undefined}
      data-jeda={dijeda ? "1" : undefined}
      style={gaya}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="kz__cincin-alas" cx="50" cy="50" r="44" />
        <circle key={kunci} className="kz__cincin-isi" cx="50" cy="50" r="44" pathLength="100" />
      </svg>
      <b className="kz__cincin-angka" aria-live="off">
        {detik ?? "·"}
      </b>
    </div>
  );
}

// --------------------------------------------------------------- numbers

/** A number that counts up to its value. */
export function Angka({
  nilai,
  m,
  durasi = 0.9,
  awal,
}: {
  nilai: number;
  m: MotionLevel;
  durasi?: number;
  awal?: number;
}) {
  const [tampil, setTampil] = useState(m === "reduce" ? nilai : (awal ?? nilai));
  const dari = useRef(awal ?? nilai);
  useEffect(() => {
    if (m === "reduce") {
      setTampil(nilai);
      dari.current = nilai;
      return;
    }
    const o = { v: dari.current };
    const tw = gsap.to(o, {
      v: nilai,
      duration: durasi,
      ease: "power2.out",
      onUpdate: () => setTampil(Math.round(o.v)),
      onComplete: () => {
        dari.current = nilai;
      },
    });
    return () => {
      tw.kill();
      dari.current = o.v;
    };
  }, [nilai, m, durasi]);
  return <>{tampil.toLocaleString()}</>;
}

// ------------------------------------------------------------- backdrop

const BINTANG = Array.from({ length: 22 }, (_, i) => {
  const r = (n: number) => Math.abs((Math.sin((i + 3) * n) * 10000) % 1);
  return {
    x: Math.round(r(12.9898) * 100),
    y: Math.round(r(78.233) * 100),
    s: 7 + Math.round(r(39.346) * 11),
    d: Math.round(r(11.135) * 60) / 10,
    t: 3 + Math.round(r(93.989) * 40) / 10,
  };
});

/** Drifting colour blobs and twinkling stars behind everything. Decorative only. */
export function Latar({ m, fase }: { m: MotionLevel; fase: string }) {
  return (
    <div className="kz__latar" aria-hidden="true" data-fase={fase}>
      <i className="kz__blob kz__blob--a" />
      <i className="kz__blob kz__blob--b" />
      <i className="kz__blob kz__blob--c" />
      {m !== "reduce" &&
        BINTANG.slice(0, m === "full" ? 22 : 10).map((b, i) => (
          <svg
            key={i}
            className="kz__bintang"
            viewBox="0 0 24 24"
            width={b.s}
            height={b.s}
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              animationDelay: `${b.d}s`,
              animationDuration: `${b.t}s`,
            }}
          >
            <path
              d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z"
              fill="currentColor"
            />
          </svg>
        ))}
    </div>
  );
}

// ----------------------------------------------------------- the tiles

export interface PropsPilihan {
  soal: SoalPublik;
  t: KuisTeks;
  /** Reveal: which is right, and (for the host) how many chose each. */
  benar?: number;
  sebaran?: number[];
  totalJawab?: number;
  /** The option this player chose. */
  dipilih?: number | null;
  /** Tap handler; omitted on the host's screen and once locked. */
  onPilih?: (i: number) => void;
  ukuran: "besar" | "ponsel";
}

/** The 2x2 (or 1x2) answer tiles, the same for the projector and the phone. */
export function Pilihan({
  soal,
  t,
  benar,
  sebaran,
  totalJawab = 0,
  dipilih,
  onPilih,
  ukuran,
}: PropsPilihan) {
  const buka = benar !== undefined;
  const n = soal.pilihan.length;
  return (
    <ul className="kz__pilihan" data-n={n} data-u={ukuran} data-buka={buka ? "1" : undefined}>
      {soal.pilihan.map((teks, i) => {
        const w = warnaUntuk(n, i);
        const st = buka ? (i === benar ? "benar" : "salah") : dipilih === i ? "pilih" : undefined;
        const jumlah = sebaran?.[i] ?? 0;
        const bagian = totalJawab > 0 ? jumlah / totalJawab : 0;
        const gaya = { "--kz-bg": w.bg, "--kz-ink": w.ink, "--i": i } as CSSProperties;
        const isi = (
          <>
            <span className="kz__pil-bentuk">
              <Bentuk bentuk={w.bentuk} size={ukuran === "besar" ? 30 : 24} />
            </span>
            <span className="kz__pil-teks">{teks}</span>
            {buka && sebaran && (
              <span className="kz__pil-jumlah" aria-label={`${jumlah}`}>
                {jumlah}
              </span>
            )}
            {buka && i === benar && (
              <svg
                className="kz__pil-centang"
                viewBox="0 0 24 24"
                width="30"
                height="30"
                aria-hidden="true"
              >
                <path
                  d="M4 12.5l5 5L20 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {buka && sebaran && (
              <i className="kz__pil-batang" style={{ transform: `scaleX(${bagian})` }} />
            )}
          </>
        );
        return (
          <li key={i} style={gaya} data-st={st}>
            {onPilih ? (
              <button
                type="button"
                className="kz__pil"
                onClick={() => onPilih(i)}
                aria-label={`${t.bentuk[w.bentuk]}: ${teks}`}
              >
                {isi}
              </button>
            ) : (
              <div className="kz__pil" data-st={st}>
                {isi}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------- leaderboard

function inisial(nama: string): string {
  const k = nama.trim().split(/\s+/);
  return ((k[0]?.[0] ?? "?") + (k.length > 1 ? (k[k.length - 1][0] ?? "") : "")).toUpperCase();
}

/** A stable colour from a NIM, so a person keeps one colour the whole game. */
export function warnaOrang(nim: string): string {
  let h = 0;
  for (let i = 0; i < nim.length; i++) h = (h * 31 + nim.charCodeAt(i)) >>> 0;
  return ["#c92a3a", "#1a6fd1", "#7b4de0", "#0e8f7e", "#b86a00", "#a3358f"][h % 6];
}

export function Avatar({ nim, nama, ukuran = 38 }: { nim: string; nama: string; ukuran?: number }) {
  return (
    <span
      className="kz__avatar"
      style={{
        background: warnaOrang(nim),
        width: ukuran,
        height: ukuran,
        fontSize: ukuran * 0.38,
      }}
      aria-hidden="true"
    >
      {inisial(nama)}
    </span>
  );
}

/** The ranked rows. When the order changes the rows glide to their new places (FLIP). */
export function DaftarPapan({
  baris,
  m,
  t,
  saya,
  maks = 5,
}: {
  baris: BarisPapan[];
  m: MotionLevel;
  t: KuisTeks;
  saya?: string | null;
  maks?: number;
}) {
  const ol = useRef<HTMLOListElement>(null);
  const posisi = useRef(new Map<string, number>());
  const tampil = baris.slice(0, maks);

  useLayoutEffect(() => {
    const el = ol.current;
    if (!el) return;
    const baru = new Map<string, number>();
    const anak = [...el.children] as HTMLElement[];
    for (const c of anak) baru.set(c.dataset.nim ?? "", c.offsetTop);
    if (m !== "reduce") {
      anak.forEach((c, idx) => {
        const nim = c.dataset.nim ?? "";
        const lama = posisi.current.get(nim);
        if (lama === undefined) {
          gsap.fromTo(
            c,
            { opacity: 0, x: -40 },
            { opacity: 1, x: 0, duration: 0.5, delay: idx * 0.07, ease: "back.out(1.6)" },
          );
        } else if (lama !== c.offsetTop) {
          gsap.fromTo(c, { y: lama - c.offsetTop }, { y: 0, duration: 0.8, ease: "power3.out" });
        }
      });
    }
    posisi.current = baru;
  });

  return (
    <ol className="kz__papan" ref={ol}>
      {tampil.map((b) => (
        <li
          key={b.nim}
          data-nim={b.nim}
          data-saya={b.nim === saya ? "1" : undefined}
          data-top={b.peringkat <= 3 ? b.peringkat : undefined}
        >
          <span className="kz__papan-rank">{b.peringkat}</span>
          <Avatar nim={b.nim} nama={b.nama} />
          <span className="kz__papan-nama">
            <b>{b.nama}</b>
            {b.kelompok !== null && <small>{t.rataKelompok(b.kelompok)}</small>}
          </span>
          {b.naik !== 0 && (
            <span
              className="kz__papan-delta"
              data-arah={b.naik > 0 ? "naik" : "turun"}
              title={b.naik > 0 ? t.naikN(b.naik) : t.turunN(-b.naik)}
            >
              {b.naik > 0 ? "▲" : "▼"}
              {Math.abs(b.naik)}
            </span>
          )}
          {b.streak >= 2 && (
            <span className="kz__papan-api" title={t.streakN(b.streak)}>
              {"🔥"}
              {b.streak}
            </span>
          )}
          <b className="kz__papan-skor">
            <Angka nilai={b.skor} m={m} />
          </b>
        </li>
      ))}
    </ol>
  );
}

/** A child that fades and rises in when it mounts; `kunci` re-runs it. */
export function Masuk({
  children,
  kunci,
  m,
  kelas = "",
}: {
  children: ReactNode;
  kunci: string | number;
  m: MotionLevel;
  kelas?: string;
}) {
  return (
    <div key={kunci} className={`kz__layar ${kelas}`} data-anim={m === "reduce" ? undefined : "1"}>
      {children}
    </div>
  );
}
