/**
 * Konsol Pi (Phase 9 Stage 9): the shapes GET /api/server/:id?aksi=konsol
 * returns, the actions, and useSambung, the browser's end of the relay.
 *
 * The relay passes the Pi's frames on. From the Pi's bridge, binary frames
 * are the terminal's output or the RFB stream, and text frames are its
 * notes: {"t":"siap",...} each time the page joins (and, on a screen, again
 * whenever control moves), or {"t":"galat","kode":...}. From the page,
 * binary frames are keystrokes or RFB, and text frames are {"t":"r",c,r}
 * (terminal size) and {"t":"hidup"} (still here).
 *
 * Rooms (2026-10-05): the relay adds "\0relay:ruang:{json}" (who is in, who
 * controls, who asked) and "\0relay:ditolak", and takes "\0relay:minta",
 * "batal", "beri:<id>" and "tolak:<id>" (see apps/relay).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "../../../lib/app";
import type { KonsolStatus, KonsolTarget } from "../../../lib/konsol";

export interface KonsolRow {
  id: number;
  target: KonsolTarget;
  alasan: string;
  status: KonsolStatus;
  oleh: string;
  olehNama: string;
  disetujuiOleh: string | null;
  tanpaPersetujuan: boolean;
  paksa: { oleh: string; alasan: string | null } | null;
  dimintaPada: string;
  mulai: string | null;
  selesai: string | null;
  alasanSelesai: string | null;
  diputusOleh: string | null;
  transkripBytes: number | null;
  sisaDetik: number | null;
}

export interface Keberatan {
  konsolId: number;
  jenis: "oke" | "tanya" | "tolak";
  teks: string | null;
  olehNama: string;
  pada: string;
}

export interface PesertaRow {
  id: number;
  konsolId: number;
  nim: string;
  nama: string;
  status: "diminta" | "disetujui" | "ditolak";
  alasan: string | null;
  tanpaPersetujuan: boolean;
  disetujuiOleh: string | null;
  dimintaPada: string;
}

export interface KonsolData {
  ok: true;
  siap: boolean;
  /** Opens and joins without an approver (the Pencipta, the Inti, DEV). */
  dev: boolean;
  istimewa?: boolean;
  /** May ask at all (every active Asisten). */
  boleh?: boolean;
  aktif: (KonsolRow & { peserta?: PesertaRow[] }) | null;
  /** My place in the open console. */
  saya?: {
    peran: "pemilik" | "peserta" | "diminta" | "ditolak" | null;
    pesertaId?: number;
  } | null;
  /** Join requests I can answer. */
  gabungUntukku?: (PesertaRow & { target: KonsolTarget; pemilikNama: string })[];
  sesi?: { modul: number; slot: number | null; tanggal: string; mulai: string } | null;
  pemeriksa?: { kode: string | null; nama: string }[];
  milikku?: KonsolRow | null;
  untukku?: KonsolRow[];
  keberatan?: Keberatan[];
  riwayat?: KonsolRow[];
}

export type Hasil = { ok: boolean; kode?: string; [k: string]: unknown };

export async function aksiKonsol(tipe: string, body: Record<string, unknown>): Promise<Hasil> {
  try {
    return await postJson<Hasil>("/api/action", { tipe, ...body });
  } catch (e) {
    return { ok: false, kode: String(e).includes("403") ? "tanpa_hak" : "jaringan" };
  }
}

export const TERBUKA: KonsolStatus[] = ["diminta", "disetujui", "aktif"];

/** "PK-0007" */
export const nomorKonsol = (id: number) => `PK-${String(id).padStart(4, "0")}`;

/* ------------------------------------------------------------ the relay */

/** The room as the relay tells it. */
export interface Ruang {
  aku: number;
  pengendali: number | null;
  minta: number[];
  orang: { id: number; nim: string; nama: string; pemilik: boolean }[];
  pi: boolean;
}

const KONTROL = "\u0000relay:";

export type Keadaan =
  | { k: "tiket" }
  | { k: "pi"; sejak: number }
  | { k: "siap"; sandi?: string }
  | { k: "galat"; kode: string }
  | { k: "putus"; kode: number; alasan: string };

interface Opsi {
  id: number;
  /** Called for every binary frame (terminal output, RFB). */
  onData: (d: ArrayBuffer) => void;
  /** Called when the Pi side says it's ready, once per join. */
  onSiap?: (o: Record<string, unknown>) => void;
  /** The console ended on the relay (cut off, idle, the cap), with why. */
  onTutup?: (why: string) => void;
  /** My request for control was declined. */
  onDitolak?: () => void;
}

/** One live connection to the relay for an approved console. `kirim` sends
 *  a frame; `sambung(ulangPi)` asks for a fresh ticket (and, when the Pi side
 *  is gone, for the Pi to join again). */
export function useSambung({ id, onData, onSiap, onTutup, onDitolak }: Opsi) {
  const [keadaan, setKeadaan] = useState<Keadaan>({ k: "tiket" });
  const [ruang, setRuang] = useState<Ruang | null>(null);
  const ws = useRef<WebSocket | null>(null);
  // Each call bumps this; an older call still waiting for its ticket stops.
  const gen = useRef(0);
  const cb = useRef({ onData, onSiap, onTutup, onDitolak });
  cb.current = { onData, onSiap, onTutup, onDitolak };

  const sambung = useCallback(
    async (ulangPi = false) => {
      const g = ++gen.current;
      ws.current?.close(1000);
      ws.current = null;
      setKeadaan({ k: "tiket" });
      const r = await aksiKonsol("konsol_tiket", { id, ulangPi });
      if (g !== gen.current) return;
      if (!r.ok || typeof r.url !== "string") {
        setKeadaan({ k: "galat", kode: String(r.kode ?? "jaringan") });
        return;
      }
      const s = new WebSocket(r.url);
      s.binaryType = "arraybuffer";
      ws.current = s;
      setKeadaan({ k: "pi", sejak: Date.now() });
      s.onmessage = (e) => {
        if (ws.current !== s) return;
        if (typeof e.data === "string") {
          if (e.data.startsWith(KONTROL)) {
            const isi = e.data.slice(KONTROL.length);
            if (isi.startsWith("ruang:")) {
              try {
                setRuang(JSON.parse(isi.slice(6)) as Ruang);
              } catch {
                /* a broken note changes nothing */
              }
            } else if (isi === "ditolak") cb.current.onDitolak?.();
            return;
          }
          let o: Record<string, unknown> = {};
          try {
            o = JSON.parse(e.data) as Record<string, unknown>;
          } catch {
            return;
          }
          if (o.t === "siap") {
            setKeadaan({ k: "siap", sandi: typeof o.sandi === "string" ? o.sandi : undefined });
            cb.current.onSiap?.(o);
          } else if (o.t === "galat") setKeadaan({ k: "galat", kode: String(o.kode ?? "") });
          return;
        }
        cb.current.onData(e.data as ArrayBuffer);
      };
      s.onclose = (e) => {
        if (ws.current !== s) return;
        ws.current = null;
        setKeadaan({ k: "putus", kode: e.code, alasan: e.reason });
        // 4003: the relay closed the room for good (cut off, idle, the cap).
        if (e.code === 4003) cb.current.onTutup?.(e.reason);
      };
    },
    [id],
  );

  useEffect(() => {
    void sambung(false);
    return () => {
      gen.current++;
      const s = ws.current;
      ws.current = null;
      s?.close(1000);
    };
  }, [sambung]);

  const kirim = useCallback((d: string | ArrayBufferLike | ArrayBufferView) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(d as string);
  }, []);

  /** The room's own notes: minta, batal, beri:<id>, tolak:<id>. */
  const kontrol = useCallback((cmd: string) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(KONTROL + cmd);
  }, []);

  return { keadaan, sambung, kirim, ws, ruang, kontrol };
}

/** Minutes left, rounded up, from the row's seconds and when it was read. */
export function sisaMenit(row: KonsolRow | null | undefined, dibaca: number, now: number) {
  if (!row || row.sisaDetik === null) return null;
  const s = row.sisaDetik - (now - dibaca) / 1000;
  return Math.max(0, Math.ceil(s / 60));
}
