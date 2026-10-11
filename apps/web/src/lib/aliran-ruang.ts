/**
 * Session streams, the page side (Phase 12): one socket per room per tab,
 * to the relay's session room (`sesi`, while a session runs) or the Server
 * pages' room (`pi`). Each enters with a ticket from GET /api/session/aliran.
 * Messages carry their data (src/lib/aliran.ts), so a view updates from the
 * message itself instead of asking the API again.
 *
 * Like lib/siaran.ts: every ping must be answered within PONG_MS or the
 * socket is replaced; a dropped socket comes back after 1, 2, 4 ... 30 s;
 * after any reconnect each view catches up once (`sambung`), since messages
 * sent while away are not replayed. While a room is down a view keeps
 * itself current with `useCadangan`, a poll that runs only then.
 */
import { useEffect, useRef, useState } from "react";

import type { JenisAliran, PesanAliran } from "./aliran";
import { dengar, useSiaran, type Topik } from "./siaran";

export type RuangAliran = "sesi" | "pi";

/** live: open; putus: should be open, trying again; mati: no room (no
 *  session, or the relay isn't set up) */
export type StatusAliran = "live" | "putus" | "mati";

/** Others looking at this socket's own group, and how many are Asisten */
export interface Penonton {
  semua: number;
  asisten: number;
}

const TANPA_PENONTON: Penonton = { semua: 0, asisten: 0 };

export interface OpsiAliran {
  ruang: RuangAliran;
  /** The running session's id (the `sesi` room only) */
  sesiId?: number | null;
  /** An Asisten acting for a group they hold, to send its laptop's lines */
  kelompok?: number | null;
}

interface Langganan {
  jenis: ReadonlySet<string>;
  fn: (m: PesanAliran) => void;
  sambung?: () => void;
}

interface Koneksi {
  opsi: OpsiAliran;
  ws: WebSocket | null;
  status: StatusAliran;
  coba: number;
  ulang: ReturnType<typeof setTimeout> | null;
  detak: ReturnType<typeof setInterval> | null;
  tungguPong: ReturnType<typeof setTimeout> | null;
  pernah: boolean;
  subs: Set<Langganan>;
  lihat: Map<symbol, number | null>;
  lihatTerkirim: number | null | undefined;
  penonton: Penonton;
  pemantau: Set<() => void>;
  /** Closing waits a moment: the next page of a navigation reuses it */
  tutupNanti: ReturnType<typeof setTimeout> | null;
  lepasSesi: (() => void) | null;
}

const PING_MS = 20_000;
const PONG_MS = 8_000;

const koneksi = new Map<string, Koneksi>();

function kunciDari(o: OpsiAliran): string | null {
  if (o.ruang === "pi") return "pi";
  if (!o.sesiId) return null;
  return `sesi:${o.sesiId}:${o.kelompok ?? ""}`;
}

// ---------- One Socket ----------
// ---------- One Socket ----------
// ---------- One Socket ----------

function kabari(k: Koneksi) {
  for (const f of k.pemantau) f();
}

function setStatus(k: Koneksi, s: StatusAliran) {
  if (k.status === s) return;
  k.status = s;
  kabari(k);
}

function hentiDetak(k: Koneksi) {
  if (k.detak) clearInterval(k.detak);
  k.detak = null;
  if (k.tungguPong) clearTimeout(k.tungguPong);
  k.tungguPong = null;
}

function kirimLihat(k: Koneksi) {
  // The newest view's group wins (a tab looks at one group at a time).
  const g = [...k.lihat.values()].reverse().find((x) => x !== null) ?? null;
  if (g === k.lihatTerkirim || !k.ws || k.status !== "live") return;
  try {
    k.ws.send(JSON.stringify({ j: "lihat", g }));
    k.lihatTerkirim = g;
  } catch {
    /* the next open sends it */
  }
}

function jadwalUlang(k: Koneksi) {
  if (k.ulang || !k.subs.size) return;
  const ms = Math.min(30_000, 1000 * 2 ** k.coba++);
  k.ulang = setTimeout(() => {
    k.ulang = null;
    void sambung(k);
  }, ms);
}

function buang(k: Koneksi, s: WebSocket) {
  if (k.ws !== s) return;
  k.ws = null;
  hentiDetak(k);
  try {
    s.close();
  } catch {
    /* already gone */
  }
  setStatus(k, "putus");
  jadwalUlang(k);
}

/** No room to enter: wait for a session change, not a timer */
function tidur(k: Koneksi) {
  setStatus(k, "mati");
  if (!k.lepasSesi) k.lepasSesi = dengar(["sesi"], () => void sambung(k));
}

async function sambung(k: Koneksi) {
  if (k.ws || !k.subs.size || typeof WebSocket === "undefined" || document.hidden) return;
  const q = new URLSearchParams({ ruang: k.opsi.ruang });
  if (k.opsi.kelompok) q.set("kelompok", String(k.opsi.kelompok));
  let t: { ok: boolean; kode?: string; url?: string; tiket?: string; sesiId?: number };
  try {
    const r = await fetch(`/api/session/aliran?${q}`);
    t = await r.json();
  } catch {
    setStatus(k, "putus");
    return jadwalUlang(k);
  }
  if (!k.subs.size || k.ws) return;
  if (!t.ok || !t.url || !t.tiket) return tidur(k);
  // The page thinks of another session than the one running: wait for it
  // to catch up (its own "sesi" refetch gives the new id).
  if (k.opsi.ruang === "sesi" && t.sesiId !== k.opsi.sesiId) return tidur(k);
  k.lepasSesi?.();
  k.lepasSesi = null;

  let s: WebSocket;
  try {
    s = new WebSocket(`${t.url}?tiket=${encodeURIComponent(t.tiket)}`);
  } catch {
    setStatus(k, "putus");
    return jadwalUlang(k);
  }
  k.ws = s;
  s.onopen = () => {
    if (k.ws !== s) return;
    k.coba = 0;
    k.lihatTerkirim = undefined;
    setStatus(k, "live");
    kirimLihat(k);
    // Anything sent while this tab wasn't in the room: each view once.
    if (k.pernah) for (const sub of k.subs) sub.sambung?.();
    k.pernah = true;
    k.detak = setInterval(() => ping(k, s), PING_MS);
  };
  s.onmessage = (e) => {
    if (k.ws !== s) return;
    if (k.tungguPong) clearTimeout(k.tungguPong);
    k.tungguPong = null;
    if (typeof e.data !== "string" || e.data === "pong") return;
    let x: { m?: PesanAliran[]; penonton?: number; asisten?: number };
    try {
      x = JSON.parse(e.data);
    } catch {
      return;
    }
    if (typeof x.penonton === "number") {
      k.penonton = { semua: x.penonton, asisten: x.asisten ?? 0 };
      kabari(k);
    }
    for (const m of x.m ?? []) {
      for (const sub of k.subs) {
        if (!sub.jenis.has(m.j)) continue;
        try {
          sub.fn(m);
        } catch {
          /* one view failing doesn't stop the others */
        }
      }
    }
  };
  s.onclose = () => {
    if (k.ws !== s) return;
    k.ws = null;
    k.penonton = TANPA_PENONTON;
    hentiDetak(k);
    setStatus(k, "putus");
    jadwalUlang(k);
  };
}

function ping(k: Koneksi, s: WebSocket) {
  if (s.readyState !== WebSocket.OPEN || k.tungguPong) return;
  try {
    s.send("ping");
  } catch {
    return buang(k, s);
  }
  k.tungguPong = setTimeout(() => {
    k.tungguPong = null;
    buang(k, s);
  }, PONG_MS);
}

function tutup(kunci: string, k: Koneksi) {
  if (k.ulang) clearTimeout(k.ulang);
  k.ulang = null;
  hentiDetak(k);
  k.lepasSesi?.();
  k.lepasSesi = null;
  const s = k.ws;
  k.ws = null;
  s?.close();
  koneksi.delete(kunci);
}

/** Back in view, back online, awake again: reconnect at once */
function bangunSemua() {
  for (const k of koneksi.values()) {
    if (k.ws && k.status === "live") {
      ping(k, k.ws);
      continue;
    }
    if (k.status === "mati") continue;
    if (k.ulang) clearTimeout(k.ulang);
    k.ulang = null;
    k.coba = 0;
    void sambung(k);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) bangunSemua();
  });
  window.addEventListener("online", bangunSemua);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) bangunSemua();
  });
}

function ambil(o: OpsiAliran): Koneksi | null {
  const kunci = kunciDari(o);
  if (!kunci) return null;
  let k = koneksi.get(kunci);
  if (!k) {
    k = {
      opsi: { ...o },
      ws: null,
      status: "putus",
      coba: 0,
      ulang: null,
      detak: null,
      tungguPong: null,
      pernah: false,
      subs: new Set(),
      lihat: new Map(),
      lihatTerkirim: undefined,
      penonton: TANPA_PENONTON,
      pemantau: new Set(),
      lepasSesi: null,
      tutupNanti: null,
    };
    koneksi.set(kunci, k);
  }
  return k;
}

function lepas(o: OpsiAliran, sub: Langganan) {
  const kunci = kunciDari(o);
  const k = kunci ? koneksi.get(kunci) : undefined;
  if (!kunci || !k) return;
  k.subs.delete(sub);
  if (k.subs.size || k.tutupNanti) return;
  // A navigation unmounts the views a moment before the next page's mount:
  // the socket waits for them instead of closing and opening again.
  k.tutupNanti = setTimeout(() => {
    k.tutupNanti = null;
    if (!k.subs.size) tutup(kunci, k);
  }, TUTUP_TUNDA_MS);
}

const TUTUP_TUNDA_MS = 4000;

// ---------- React ----------
// ---------- React ----------
// ---------- React ----------

/**
 * Hears `jenis` messages of a room. `sambung` runs after a reconnect (not the
 * first connect), for a view to fetch what it missed. Returns the room's
 * status, so a view can stand in with `useCadangan` while it is down.
 */
export function useAliran(
  opsi: OpsiAliran & { aktif?: boolean },
  jenis: readonly JenisAliran[],
  fn: (m: PesanAliran) => void,
  sambungUlang?: () => void,
): StatusAliran {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const sambungRef = useRef(sambungUlang);
  sambungRef.current = sambungUlang;
  const [status, setS] = useState<StatusAliran>("putus");
  const kunci = opsi.aktif === false ? null : kunciDari(opsi);
  const jenisKey = jenis.join(",");
  useEffect(() => {
    if (!kunci) {
      setS("mati");
      return;
    }
    const o: OpsiAliran = { ruang: opsi.ruang, sesiId: opsi.sesiId, kelompok: opsi.kelompok };
    const k = ambil(o)!;
    const sub: Langganan = {
      jenis: new Set(jenisKey.split(",")),
      fn: (m) => fnRef.current(m),
      sambung: () => sambungRef.current?.(),
    };
    const ikut = () => setS(k.status);
    k.subs.add(sub);
    if (k.tutupNanti) clearTimeout(k.tutupNanti);
    k.tutupNanti = null;
    k.pemantau.add(ikut);
    ikut();
    void sambung(k);
    return () => {
      k.pemantau.delete(ikut);
      lepas(o, sub);
    };
  }, [kunci, jenisKey]);
  return status;
}

/** Says which group this view looks at, so that group's laptop streams */
export function useLihat(opsi: OpsiAliran & { aktif?: boolean }, g: number | null): void {
  const kunci = opsi.aktif === false ? null : kunciDari(opsi);
  useEffect(() => {
    if (!kunci) return;
    const k = koneksi.get(kunci);
    if (!k) return;
    const id = Symbol("lihat");
    k.lihat.set(id, g);
    kirimLihat(k);
    return () => {
      k.lihat.delete(id);
      kirimLihat(k);
    };
  }, [kunci, g]);
}

/** Who else looks at this socket's own group (laptops send only then) */
export function usePenonton(opsi: OpsiAliran & { aktif?: boolean }): Penonton {
  const kunci = opsi.aktif === false ? null : kunciDari(opsi);
  const [n, setN] = useState<Penonton>(TANPA_PENONTON);
  useEffect(() => {
    if (!kunci) return;
    const k = koneksi.get(kunci);
    if (!k) return;
    const ikut = () => setN(k.status === "live" ? k.penonton : TANPA_PENONTON);
    k.pemantau.add(ikut);
    ikut();
    return () => {
      k.pemantau.delete(ikut);
    };
  }, [kunci]);
  return n;
}

/** Sends a laptop's lines or readings up; false when the room is down */
export function kirimNaik(opsi: OpsiAliran, j: "tel" | "serial", d: unknown[]): boolean {
  const kunci = kunciDari(opsi);
  const k = kunci ? koneksi.get(kunci) : undefined;
  if (!k?.ws || k.status !== "live" || !d.length) return false;
  try {
    k.ws.send(JSON.stringify({ j, d }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs `fn` every `ms` while `aktif` (the room is down and the view still
 * needs its stream), and stops the moment the room is back.
 */
export function useCadangan(fn: () => void, ms: number, aktif: boolean): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!aktif) return;
    const id = setInterval(() => {
      if (!document.hidden) ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, aktif]);
}

/**
 * Calls `fn` when a `jenis` message arrives in the room, and, while the room
 * is down (or there is no session room), on the plain `cadangan` topics as
 * before. For views of a Praktikan's own group: the room sends them only
 * their group's blank results and hints, where a topic fires for every
 * group in the lab.
 */
export function useAliranAtauTopik(
  opsi: OpsiAliran & { aktif?: boolean },
  jenis: readonly JenisAliran[],
  cadangan: readonly Topik[],
  /** The room's message, or nothing for a topic or a catch-up */
  fn: (m?: PesanAliran) => void,
  enabled = true,
  /** Only this group's messages (an Asisten's socket hears every group) */
  kelompok: number | null = null,
  /** Only messages this view shows (say, one file's blanks) */
  saring?: (m: PesanAliran) => boolean,
): void {
  const saringRef = useRef(saring);
  saringRef.current = saring;
  const ref = useRef(fn);
  ref.current = fn;
  const status = useAliran(
    { ...opsi, aktif: enabled && opsi.aktif !== false },
    jenis,
    (m) => {
      if (kelompok !== null && m.g !== kelompok) return;
      if (saringRef.current && !saringRef.current(m)) return;
      ref.current(m);
    },
    () => ref.current(),
  );
  useSiaran(cadangan, () => ref.current(), enabled && status !== "live");
}
