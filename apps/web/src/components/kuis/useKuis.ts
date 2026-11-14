/**
 * The quiz socket (`/kuis/ws` on the games host) as a hook: reconnects with a
 * short backoff, keeps an offset to the server's clock (every countdown on
 * screen is measured against the server, never against this device), and
 * hands the components the latest view for this person.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lihat } from "../../lib/kuis/engine";

export type StatusSambung = "menyambung" | "terhubung" | "putus" | "ditutup";
export type AlasanTutup = "sesi-selesai" | "dikeluarkan" | "penuh" | "lain";

export interface Aku {
  nim: string;
  nama: string;
  peran: "host" | "penonton" | "pemain";
  hostNama: string;
}

export interface GalatKuis {
  kode: string;
  /** Bumps with each one, so the same message twice still shows. */
  n: number;
}

export interface Kuis {
  status: StatusSambung;
  alasan: AlasanTutup | null;
  aku: Aku | null;
  lihat: Lihat | null;
  galat: GalatKuis | null;
  /** The server's clock now, in ms. */
  sekarang: () => number;
  kirim: (pesan: Record<string, unknown>) => void;
  sambungUlang: () => void;
}

const JEDA = [500, 1000, 2000, 4000, 8000];

export function useKuis(aktif: boolean, bahasa: string): Kuis {
  const [status, setStatus] = useState<StatusSambung>("menyambung");
  const [alasan, setAlasan] = useState<AlasanTutup | null>(null);
  const [aku, setAku] = useState<Aku | null>(null);
  const [lihat, setLihat] = useState<Lihat | null>(null);
  const [galat, setGalat] = useState<GalatKuis | null>(null);
  const [ulang, setUlang] = useState(0);
  const offset = useRef(0);
  const ws = useRef<WebSocket | null>(null);
  // The language is told to the server once on connect; a later change is a message, not a reconnect.
  const bahasaKini = useRef(bahasa);
  bahasaKini.current = bahasa;

  useEffect(() => {
    if (!aktif) return;
    let mati = false;
    let percobaan = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let denyut: ReturnType<typeof setInterval> | undefined;
    let galatN = 0;

    const buka = () => {
      if (mati) return;
      setStatus("menyambung");
      const skema = location.protocol === "https:" ? "wss" : "ws";
      const s = new WebSocket(
        `${skema}://${location.host}/kuis/ws?b=${encodeURIComponent(bahasaKini.current)}`,
      );
      ws.current = s;
      s.onopen = () => {
        percobaan = 0;
        setStatus("terhubung");
        denyut = setInterval(() => {
          if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ t: "ping" }));
        }, 15_000);
      };
      s.onmessage = (e) => {
        let m: { t?: string; [k: string]: unknown };
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.t === "lihat") setLihat(m.d as Lihat);
        else if (m.t === "aku") setAku(m as unknown as Aku);
        else if (m.t === "jam") offset.current = Number(m.waktu) - Date.now();
        else if (m.t === "galat") setGalat({ kode: String(m.kode), n: ++galatN });
      };
      s.onclose = (e) => {
        clearInterval(denyut);
        if (mati) return;
        const tutup = (a: AlasanTutup) => {
          setAlasan(a);
          setStatus("ditutup");
        };
        if (e.code === 4001) return tutup("sesi-selesai");
        if (e.code === 4003) return tutup("dikeluarkan");
        if (e.code === 1008) return tutup("penuh");
        setStatus("putus");
        timer = setTimeout(buka, JEDA[Math.min(percobaan++, JEDA.length - 1)]);
      };
      s.onerror = () => s.close();
    };
    buka();
    return () => {
      mati = true;
      clearTimeout(timer);
      clearInterval(denyut);
      ws.current?.close();
    };
  }, [aktif, ulang]);

  useEffect(() => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ t: "bahasa", b: bahasa }));
  }, [bahasa]);

  const kirim = useCallback((pesan: Record<string, unknown>) => {
    const s = ws.current;
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify(pesan));
  }, []);

  const sekarang = useCallback(() => Date.now() + offset.current, []);
  const sambungUlang = useCallback(() => {
    setAlasan(null);
    setUlang((n) => n + 1);
  }, []);

  return { status, alasan, aku, lihat, galat, sekarang, kirim, sambungUlang };
}
