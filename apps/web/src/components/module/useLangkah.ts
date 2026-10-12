/**
 * A Praktikan's way through the module's steps in a running session
 * (2026-10-12): Modul, Ringkasan, Persiapan Alat, Kode, Live (and Module 4's
 * Perburuan, which keeps its own lock).
 *
 * - A step opens only once every step before it is finished.
 * - Finished: Modul and Ringkasan once left with Next, Persiapan Alat when
 *   every checklist item is ticked, Kode when every blank is right, Live
 *   after one capture, Perburuan when the hunt is over.
 * - A finished step stays open for good, even if a tick is undone later,
 *   so a group never gets locked out mid-session.
 * - Each tab's tint: green while finished, yellow when visited and left
 *   unfinished, none when not touched yet.
 *
 * What was visited and left with Next is kept per session in localStorage.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson } from "../../lib/app";
import { useSiaran } from "../../lib/siaran";
import { readSetup, SETUP_BERUBAH } from "./SetupChecklist";
import { KODE_PROGRES } from "./BlankFile";

export type StepId = "modul" | "brief" | "praktikum" | "setup" | "code" | "live" | "hunt";
export type Nada = "ok" | "warn";

interface Catatan {
  lihat: StepId[];
  selesai: StepId[];
}

const kunci = (sesiId: number, modul: number) => `iris-langkah-s${sesiId}-m${modul}`;

function baca(sesiId: number, modul: number): Catatan {
  try {
    const v = JSON.parse(localStorage.getItem(kunci(sesiId, modul)) || "null");
    if (v && Array.isArray(v.lihat) && Array.isArray(v.selesai)) return v;
  } catch {
    /* private mode */
  }
  return { lihat: [], selesai: [] };
}

function tulis(sesiId: number, modul: number, c: Catatan) {
  try {
    localStorage.setItem(kunci(sesiId, modul), JSON.stringify(c));
  } catch {
    /* private mode: this visit still follows it */
  }
}

export interface Langkah {
  /** Is the step finished now? */
  selesai: (s: StepId) => boolean;
  /** May the step be opened? */
  terbuka: (s: StepId) => boolean;
  /** The first step not finished before `s` (why `s` is locked), if any */
  penghalang: (s: StepId) => StepId | null;
  nada: (s: StepId) => Nada | undefined;
  /** The step a session should open on: the first one not finished */
  awal: StepId;
  /** The saved visits and the drafts are read */
  siap: boolean;
  /** Left with Next: Modul and Ringkasan count as finished */
  lanjut: (s: StepId) => void;
}

export function useLangkah({
  aktif,
  sesiId,
  modul,
  steps,
  step,
  persiapan,
  berkas,
  tangkapan,
  huntSelesai,
}: {
  /** A Praktikan in this module's running session */
  aktif: boolean;
  sesiId: number | null;
  modul: number;
  steps: StepId[];
  step: StepId;
  /** The checklist's item count */
  persiapan: number;
  /** Each code file with its blank count */
  berkas: { slug: string; blanks: number }[];
  /** Captures saved for the group (null while unknown) */
  tangkapan: number | null;
  huntSelesai: boolean;
}): Langkah | null {
  const [cat, setCat] = useState<Catatan>({ lihat: [], selesai: [] });
  const [catSiap, setCatSiap] = useState(false);
  useEffect(() => {
    if (!aktif || !sesiId) return;
    setCat(baca(sesiId, modul));
    setCatSiap(true);
  }, [aktif, sesiId, modul]);

  const ubah = useCallback(
    (fn: (c: Catatan) => Catatan) =>
      setCat((c) => {
        const n = fn(c);
        if (n !== c && sesiId) tulis(sesiId, modul, n);
        return n;
      }),
    [sesiId, modul],
  );

  // The checklist, read again on every tick.
  const [setupN, setSetupN] = useState(0);
  useEffect(() => {
    if (!aktif) return;
    const muat = () => setSetupN(readSetup(modul).filter((i) => i < persiapan).length);
    muat();
    window.addEventListener(SETUP_BERUBAH, muat);
    return () => window.removeEventListener(SETUP_BERUBAH, muat);
  }, [aktif, modul, persiapan]);

  // Blanks right per file: the saved drafts at first, then each file's own
  // count as the Kode step checks answers.
  const [kode, setKode] = useState<Record<string, number>>({});
  const [kodeSiap, setKodeSiap] = useState(false);
  const [segarKode, setSegarKode] = useState(0);
  useSiaran(["jawaban", "jurnal"], () => setSegarKode((n) => n + 1), aktif);
  useEffect(() => {
    if (!aktif) return;
    let alive = true;
    void Promise.all(
      berkas.map((b) =>
        getJson<{ ok: boolean; jawaban?: Record<string, { benar: boolean }> }>(
          `/api/modul/draft?modul=${modul}&berkas=${b.slug}`,
        )
          .then((d) => [b.slug, Object.values(d.jawaban ?? {}).filter((x) => x.benar).length])
          .catch(() => [b.slug, 0]),
      ),
    ).then((rows) => {
      if (!alive) return;
      setKode(Object.fromEntries(rows));
      setKodeSiap(true);
    });
    return () => {
      alive = false;
    };
  }, [aktif, modul, berkas.map((b) => b.slug).join(), segarKode]);
  const [total, setTotal] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!aktif) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ slug: string; benar: number; total: number }>).detail;
      setKode((k) => (k[d.slug] === d.benar ? k : { ...k, [d.slug]: d.benar }));
      setTotal((t) => (t[d.slug] === d.total ? t : { ...t, [d.slug]: d.total }));
    };
    window.addEventListener(KODE_PROGRES, on);
    return () => window.removeEventListener(KODE_PROGRES, on);
  }, [aktif]);
  const kodeSelesai =
    berkas.length > 0 &&
    berkas.every((b) => {
      const t = total[b.slug] ?? b.blanks;
      return t === 0 || (kode[b.slug] ?? 0) >= t;
    });

  const sekarang = useCallback(
    (s: StepId): boolean => {
      if (s === "modul" || s === "brief") return cat.selesai.includes(s);
      if (s === "setup") return persiapan === 0 || setupN >= persiapan;
      if (s === "code") return kodeSelesai;
      if (s === "live") return (tangkapan ?? 0) > 0;
      if (s === "hunt") return huntSelesai;
      return true;
    },
    [cat.selesai, persiapan, setupN, kodeSelesai, tangkapan, huntSelesai],
  );

  // Once finished, a step stays open for good.
  useEffect(() => {
    if (!aktif || !catSiap) return;
    const baru = steps.filter((s) => sekarang(s) && !cat.selesai.includes(s));
    if (baru.length) ubah((c) => ({ ...c, selesai: [...c.selesai, ...baru] }));
  }, [aktif, catSiap, steps.join(), sekarang, cat.selesai, ubah]);

  // Visiting a step.
  useEffect(() => {
    if (!aktif || !catSiap || cat.lihat.includes(step)) return;
    ubah((c) => ({ ...c, lihat: [...c.lihat, step] }));
  }, [aktif, catSiap, step, cat.lihat, ubah]);

  return useMemo(() => {
    if (!aktif) return null;
    const pernah = (s: StepId) => cat.selesai.includes(s) || sekarang(s);
    // The hunt keeps its own lock (it opens when the Asisten starts it).
    const penghalang = (s: StepId): StepId | null => {
      if (s === "hunt") return null;
      const i = steps.indexOf(s);
      return steps.slice(0, Math.max(0, i)).find((x) => x !== "hunt" && !pernah(x)) ?? null;
    };
    return {
      selesai: sekarang,
      terbuka: (s) => penghalang(s) === null,
      penghalang,
      nada: (s) => (sekarang(s) ? "ok" : cat.lihat.includes(s) && s !== step ? "warn" : undefined),
      awal: steps.find((s) => s !== "hunt" && !pernah(s)) ?? steps[steps.length - 1],
      siap: catSiap && kodeSiap && tangkapan !== null,
      lanjut: (s) => {
        if ((s === "modul" || s === "brief") && !cat.selesai.includes(s))
          ubah((c) => ({ ...c, selesai: [...c.selesai, s] }));
      },
    };
  }, [aktif, cat, sekarang, steps.join(), step, ubah, catSiap, kodeSiap, tangkapan]);
}
