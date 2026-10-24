/**
 * The exam rooms on the page (prompt 11): the list and the console through the
 * recruitment API, and the live room, one WebSocket to the relay's
 * `rec-<id>` room (EXAM-ENGINE 6).
 *
 * The API is the truth; the socket only says something changed and carries
 * the room's state and who is connected. A page that lost the socket keeps
 * its timers from the last state and the server's clock, shows
 * "Sambungan langsung putus", reconnects with a new ticket after 1, 2, 5, 10,
 * then every 15 s, and only while it is down refetches the console every 15 s.
 * Nothing here polls on a timer while the socket is up.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePoll, usePollBersama } from "../hooks";
import { jamServer } from "../jam";
import { isFail, recGet, recPost, type RecResult } from "./client";
import type { PartKey } from "./exam-types";
import type { ConsoleView, RoomLogLine, RoomsResponse } from "./room-api";
import type { RoomPublic, PesanUjian } from "./room-relay";

async function leaf<T extends { ok: true }>(p: Promise<RecResult<T>>): Promise<T | null> {
  const r = await p;
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return null;
}

/** The rooms the caller may watch. One shared fetch for the navbar and the panel. */
export function useRecRooms(enabled: boolean) {
  return usePollBersama("rec-rooms", () => leaf(recGet<RoomsResponse>("rooms")), 300_000, enabled, [
    "recroom",
    "recplotting",
    "reccalendar",
  ]);
}

/** One room's console. */
export function useRecRoom(id: number | null, enabled: boolean) {
  return usePoll(
    () => leaf(recGet<ConsoleView>("room", { id: String(id) })),
    300_000,
    enabled && id !== null,
    ["recroom"],
    400,
    id,
  );
}

export function useRecRoomLog(id: number | null, enabled: boolean) {
  return usePoll(
    () => leaf(recGet<{ ok: true; log: RoomLogLine[] }>("room-log", { id: String(id) })),
    300_000,
    enabled && id !== null,
    ["recroom"],
    1_000,
    id,
  );
}

export { recPost };

/* ----------------------------------------------------------------- live */

export interface Hadir {
  kursi: number[];
  panitia: string[];
}

/** What a seat last said of its progress over the socket (display only, between two reads of the console) */
export type Kemajuan = Record<number, { part: PartKey; answered: number; total: number }>;

export type StatusLangsung = "live" | "putus" | "mati";

const PING_MS = 25_000;
const PONG_MS = 8_000;
const ULANG = [1000, 2000, 5000, 10_000, 15_000];
/** While the socket is down the console asks the API again this often */
export const CADANGAN_MS = 15_000;

/**
 * The room's socket for the Panitia. `onKabar` hears every message that is
 * not the room state or the presence list (a note, a Master change, a
 * kejadian): the page asks the API again. `ruang` is the latest state the
 * relay sent; the console's own fetch remains the source when it is null.
 */
export function useRuangLangsung(
  id: number | null,
  enabled: boolean,
  onKabar: (m: PesanUjian) => void,
  sambungUlang: () => void,
): { status: StatusLangsung; hadir: Hadir | null; ruang: RoomPublic | null; kemajuan: Kemajuan } {
  const [status, setStatus] = useState<StatusLangsung>("putus");
  const [hadir, setHadir] = useState<Hadir | null>(null);
  const [kemajuan, setKemajuan] = useState<Kemajuan>({});
  const [ruang, setRuang] = useState<RoomPublic | null>(null);
  const kabar = useRef(onKabar);
  kabar.current = onKabar;
  const ulang = useRef(sambungUlang);
  ulang.current = sambungUlang;

  useEffect(() => {
    if (!enabled || id === null || typeof WebSocket === "undefined") return;
    let tutup = false;
    let ws: WebSocket | null = null;
    let coba = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let detak: ReturnType<typeof setInterval> | null = null;
    let tungguPong: ReturnType<typeof setTimeout> | null = null;
    let pernah = false;

    const hentiDetak = () => {
      if (detak) clearInterval(detak);
      if (tungguPong) clearTimeout(tungguPong);
      detak = tungguPong = null;
    };
    const jadwalUlang = () => {
      if (tutup || timer) return;
      timer = setTimeout(
        () => {
          timer = null;
          void sambung();
        },
        ULANG[Math.min(coba++, ULANG.length - 1)],
      );
    };
    const buang = (s: WebSocket) => {
      if (ws !== s) return;
      ws = null;
      hentiDetak();
      try {
        s.close();
      } catch {
        /* gone already */
      }
      setStatus("putus");
      jadwalUlang();
    };
    async function sambung() {
      if (tutup || ws || document.hidden) return;
      let t: { ok: boolean; kode?: string; url?: string; tiket?: string };
      try {
        t = await (await fetch(`/api/recruitment/room-ticket?id=${id}`)).json();
      } catch {
        setStatus("putus");
        return jadwalUlang();
      }
      if (tutup || ws) return;
      if (!t.ok || !t.url || !t.tiket) {
        setStatus("mati");
        return;
      }
      let s: WebSocket;
      try {
        s = new WebSocket(`${t.url}?tiket=${encodeURIComponent(t.tiket)}`);
      } catch {
        setStatus("putus");
        return jadwalUlang();
      }
      ws = s;
      s.onopen = () => {
        if (ws !== s) return;
        coba = 0;
        setStatus("live");
        // What came while the socket was away: ask the API once.
        if (pernah) ulang.current();
        pernah = true;
        detak = setInterval(() => {
          if (s.readyState !== WebSocket.OPEN || tungguPong) return;
          try {
            s.send("ping");
          } catch {
            return buang(s);
          }
          tungguPong = setTimeout(() => {
            tungguPong = null;
            buang(s);
          }, PONG_MS);
        }, PING_MS);
      };
      s.onmessage = (e) => {
        if (ws !== s) return;
        if (tungguPong) clearTimeout(tungguPong);
        tungguPong = null;
        if (typeof e.data !== "string" || e.data === "pong") return;
        let x: { m?: PesanUjian[] };
        try {
          x = JSON.parse(e.data);
        } catch {
          return;
        }
        for (const m of x.m ?? []) {
          if (m.j === "ruang") setRuang(m.d as RoomPublic);
          else if (m.j === "hadir") setHadir(m.d as Hadir);
          else if (m.j === "kemajuan" && typeof m.s === "number") {
            // Moves the tile between two reads; it never asks the API again.
            const d = m.d as Kemajuan[number];
            setKemajuan((k) => ({ ...k, [m.s as number]: d }));
            continue;
          }
          try {
            kabar.current(m);
          } catch {
            /* one view failing does not stop the next message */
          }
        }
      };
      s.onclose = (e) => {
        if (ws !== s) return;
        ws = null;
        hentiDetak();
        // 4000: the room is finished, the page stays closed.
        if (e.code === 4000) return setStatus("mati");
        setStatus("putus");
        jadwalUlang();
      };
    }
    const bangun = () => {
      if (document.hidden || tutup) return;
      if (ws && ws.readyState === WebSocket.OPEN) return;
      if (timer) clearTimeout(timer);
      timer = null;
      coba = 0;
      void sambung();
    };
    document.addEventListener("visibilitychange", bangun);
    window.addEventListener("online", bangun);
    void sambung();
    return () => {
      tutup = true;
      document.removeEventListener("visibilitychange", bangun);
      window.removeEventListener("online", bangun);
      if (timer) clearTimeout(timer);
      hentiDetak();
      ws?.close();
    };
  }, [id, enabled]);

  return { status, hadir, ruang, kemajuan };
}

/** Runs `fn` every CADANGAN_MS, only while the live room is down and the page is in view. */
export function useCadanganRuang(fn: () => void, aktif: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!aktif) return;
    const t = setInterval(() => {
      if (!document.hidden) ref.current();
    }, CADANGAN_MS);
    return () => clearInterval(t);
  }, [aktif]);
}

/** Server now, redrawn once a second (the room's clocks), from jamServer() and nothing on the laptop. */
export function useJamRuang(aktif = true): number {
  const [now, setNow] = useState(() => jamServer());
  useEffect(() => {
    if (!aktif) return;
    const t = setInterval(() => setNow(jamServer()), 1000);
    setNow(jamServer());
    return () => clearInterval(t);
  }, [aktif]);
  return now;
}

/** A write to a room action, with the page's busy flag and a refresh after. */
export function useAksiRuang(roomId: number, refresh: () => void) {
  const [sibuk, setSibuk] = useState(false);
  const jalan = useCallback(
    async <T extends { ok: true }>(aksi: string, body: Record<string, unknown>) => {
      setSibuk(true);
      const r = await recPost<T>(aksi, { id: roomId, ...body });
      setSibuk(false);
      refresh();
      return r;
    },
    [roomId, refresh],
  );
  return { sibuk, jalan };
}

export type { PartKey };
