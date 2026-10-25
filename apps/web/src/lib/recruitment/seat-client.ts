/**
 * The candidate's page and its two connections (prompt 10, EXAM-ENGINE 6):
 * the API (GET test, the writes) and one WebSocket to the relay's `rec-<id>`
 * room for a seat. The API is the truth; the socket only says something
 * changed and carries the room's public state, so 35 seats never refetch at
 * once. A page that lost the socket keeps its timers from the last state and
 * the server's clock, shows "Sambungan langsung putus", and reconnects with a
 * new ticket after 1, 2, 5, 10, then every 15 s. Only while the socket is down
 * does the caller ask the API on a timer (useCadanganRuang in room-client).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PartKey } from "./exam-types";
import type { KursiPesan } from "./room-api";
import type { PesanUjian, RoomPublic } from "./room-relay";

export type SeatLink = "live" | "putus" | "mati";

const PING_MS = 25_000;
const PONG_MS = 8_000;
const ULANG = [1000, 2000, 5000, 10_000, 15_000];
/** At most one progress frame in this long (EXAM-ENGINE 6.3) */
const PROGRESS_MS = 2000;

export interface Progress {
  part: PartKey;
  answered: number;
  total: number;
}

export function useSeatLive(
  seatId: number | null,
  enabled: boolean,
  onKursi: (d: KursiPesan) => void,
  onBack: () => void,
  /** Live Coding's messages (a compile finished, the queue moved): only the seat's own compile and the room's queue reach it */
  onOther?: (m: PesanUjian) => void,
): { status: SeatLink; room: RoomPublic | null; progress: (p: Progress) => void } {
  const [status, setStatus] = useState<SeatLink>("putus");
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const kursi = useRef(onKursi);
  kursi.current = onKursi;
  const back = useRef(onBack);
  back.current = onBack;
  const other = useRef(onOther);
  other.current = onOther;
  const sock = useRef<WebSocket | null>(null);
  const last = useRef<Progress | null>(null);
  const sentAt = useRef(0);
  const sendT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || seatId === null || typeof WebSocket === "undefined") return;
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
      sock.current = null;
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
        t = await (await fetch("/api/recruitment/test-ticket", { cache: "no-store" })).json();
      } catch {
        setStatus("putus");
        return jadwalUlang();
      }
      if (tutup || ws) return;
      if (!t.ok || !t.url || !t.tiket) {
        // No relay set, or the seat is not in: the page runs on the API alone.
        setStatus(t.kode === "relay_belum_diatur" ? "mati" : "putus");
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
        sock.current = s;
        coba = 0;
        setStatus("live");
        // What came while the socket was away: ask the API once.
        if (pernah) back.current();
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
          if (m.j === "ruang") setRoom(m.d as RoomPublic);
          else if (m.j === "kursi") {
            try {
              kursi.current(m.d as KursiPesan);
            } catch {
              /* one view failing does not stop the next message */
            }
          } else if (m.j === "kompilasi" || m.j === "antrean") {
            try {
              other.current?.(m);
            } catch {
              /* as above */
            }
          }
        }
      };
      s.onclose = (e) => {
        if (ws !== s) return;
        ws = null;
        sock.current = null;
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
      if (sendT.current) clearTimeout(sendT.current);
      hentiDetak();
      sock.current = null;
      ws?.close();
    };
  }, [seatId, enabled]);

  /** Display only, at most once in PROGRESS_MS: the console's real counts come from GET room */
  const progress = useCallback((p: Progress) => {
    last.current = p;
    if (sendT.current) return;
    const wait = Math.max(0, PROGRESS_MS - (Date.now() - sentAt.current));
    sendT.current = setTimeout(() => {
      sendT.current = null;
      const s = sock.current;
      if (!s || s.readyState !== WebSocket.OPEN || !last.current) return;
      sentAt.current = Date.now();
      try {
        s.send(JSON.stringify({ j: "kemajuan", d: last.current }));
      } catch {
        /* the next change sends it */
      }
    }, wait);
  }, []);

  return { status, room, progress };
}
