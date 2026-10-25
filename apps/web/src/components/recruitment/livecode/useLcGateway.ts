/**
 * The page's socket to the exam gateway (prompt 12, EXAM-ENGINE 9.6, 9.7):
 * `wss://ws.irisiotlab.com/rec/web?tiket=...` with a 60 second single use
 * ticket from `lc-ticket`. A seat hears its own boards' traffic and may send
 * to them; a grader hears every seat of the room and only watches. The
 * socket reconnects with a new ticket after 1, 2, 5, 10, then every 15 s, and
 * asks for the history again each time (the room keeps the lines).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isFail, recGet } from "../../../lib/recruitment/client";
import { addLines, socketUrl, type TrafficLine } from "../../../lib/recruitment/lc-ui";

export type GwStatus = "off" | "connecting" | "live" | "down";
export interface BoardOn {
  s: number;
  b: number;
  via: "ws" | "http";
}
export interface Nak {
  at: number;
  b: number;
  via: string;
  why: string;
}
export interface Ack {
  at: number;
  b: number;
  via: string;
  queued: number;
}

export interface GwOut {
  t: "send";
  b: number;
  via: "ws" | "http" | "mqtt";
  k?: string;
  d: string;
}
export interface GwBle {
  t: "ble";
  b: number;
  dir: "up" | "down";
  k: string;
  d: string;
  b64?: boolean;
}

const RETRY = [1000, 2000, 5000, 10_000, 15_000];
const PING_MS = 25_000;
const HTTP_ON_MS = 30_000;

export function useLcGateway(opts: {
  enabled: boolean;
  role: "seat" | "grader";
  /** The room, for a grader's ticket */
  roomId?: number;
  /** A grader keeps the lines of one seat only, so a busy room never pushes them out */
  watch?: number;
}) {
  const { enabled, role, roomId, watch } = opts;
  const watchRef = useRef(watch);
  watchRef.current = watch;
  const keep = (l: TrafficLine) => watchRef.current === undefined || l.s === watchRef.current;
  const [status, setStatus] = useState<GwStatus>("off");
  const [lines, setLines] = useState<TrafficLine[]>([]);
  const [boards, setBoards] = useState<BoardOn[]>([]);
  const [mqtt, setMqtt] = useState<boolean | null>(null);
  const [nak, setNak] = useState<Nak | null>(null);
  const [ack, setAck] = useState<Ack | null>(null);
  const [secret, setSecret] = useState(false);
  const sock = useRef<WebSocket | null>(null);
  const httpSeen = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return;
    let stop = false;
    let ws: WebSocket | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let beat: ReturnType<typeof setInterval> | null = null;

    const again = () => {
      if (stop || timer) return;
      timer = setTimeout(
        () => {
          timer = null;
          void open();
        },
        RETRY[Math.min(tries++, RETRY.length - 1)],
      );
    };
    async function open() {
      if (stop || ws || document.hidden) return;
      setStatus("connecting");
      const r = await recGet<{ ok: true; url: string; tiket: string }>(
        "lc-ticket",
        role === "grader" && roomId ? { id: String(roomId) } : {},
      );
      if (stop || ws) return;
      if (isFail(r)) {
        if ((r.kode as string) === "gateway_belum_diatur" || r.status === 403 || r.status === 401) {
          setSecret((r.kode as string) === "gateway_belum_diatur");
          return setStatus("off");
        }
        setStatus("down");
        return again();
      }
      let s: WebSocket;
      try {
        s = new WebSocket(socketUrl(r.url, r.tiket));
      } catch {
        setStatus("down");
        return again();
      }
      ws = s;
      s.onopen = () => {
        if (ws !== s) return;
        sock.current = s;
        tries = 0;
        setStatus("live");
        beat = setInterval(() => {
          if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ t: "ping" }));
        }, PING_MS);
      };
      s.onmessage = (e) => {
        if (ws !== s || typeof e.data !== "string") return;
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(e.data) as Record<string, unknown>;
        } catch {
          return;
        }
        if (m.j === "hello") {
          const b = (m.boards as BoardOn[] | undefined) ?? [];
          setBoards(b.filter((x) => x.via === "ws" || x.via === "http"));
          setMqtt(typeof m.mqtt === "boolean" ? m.mqtt : null);
          if (Array.isArray(m.lines))
            setLines((l) => addLines(l, (m.lines as TrafficLine[]).filter(keep)));
        } else if (m.j === "line") {
          if (keep(m.l as TrafficLine)) setLines((l) => addLines(l, [m.l as TrafficLine]));
        } else if (m.j === "lines") {
          setLines((l) => addLines(l, ((m.l as TrafficLine[]) ?? []).filter(keep)));
        } else if (m.j === "board") {
          const x = m as unknown as BoardOn & { on: boolean };
          if (x.via === "http") httpSeen.current.set(`${x.s}:${x.b}`, Date.now());
          setBoards((list) => {
            const rest = list.filter((y) => !(y.s === x.s && y.b === x.b && y.via === x.via));
            return x.on ? [...rest, { s: x.s, b: x.b, via: x.via }] : rest;
          });
        } else if (m.j === "mon") setMqtt(m.on === true);
        else if (m.j === "nak")
          setNak({ at: Date.now(), b: Number(m.b), via: String(m.via), why: String(m.why) });
        else if (m.j === "ack")
          setAck({ at: Date.now(), b: Number(m.b), via: String(m.via), queued: Number(m.queued) });
      };
      const gone = () => {
        if (ws !== s) return;
        ws = null;
        sock.current = null;
        if (beat) clearInterval(beat);
        beat = null;
        if (stop) return;
        setStatus("down");
        setBoards([]);
        again();
      };
      s.onclose = gone;
      s.onerror = () => {
        try {
          s.close();
        } catch {
          /* gone */
        }
      };
    }
    const wake = () => {
      if (document.hidden || stop || (ws && ws.readyState === WebSocket.OPEN)) return;
      if (timer) clearTimeout(timer);
      timer = null;
      tries = 0;
      void open();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    void open();
    // An HTTP board shows as on for 30 s after its last request
    const sweep = setInterval(() => {
      const now = Date.now();
      setBoards((list) =>
        list.filter(
          (x) =>
            x.via !== "http" || now - (httpSeen.current.get(`${x.s}:${x.b}`) ?? now) < HTTP_ON_MS,
        ),
      );
    }, 5000);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      clearInterval(sweep);
      if (timer) clearTimeout(timer);
      if (beat) clearInterval(beat);
      sock.current = null;
      ws?.close();
    };
  }, [enabled, role, roomId]);

  const send = useCallback(
    (m: GwOut | GwBle | { t: "history"; s?: number; n?: number } | { t: "mon" }) => {
      const s = sock.current;
      if (!s || s.readyState !== WebSocket.OPEN) return false;
      try {
        s.send(JSON.stringify(m));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  return { status, lines, boards, mqtt, nak, ack, send, secretMissing: secret };
}
