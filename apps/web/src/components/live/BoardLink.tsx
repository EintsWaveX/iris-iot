/**
 * Module 1's "connect the board" panel on the live page. The group PC
 * opens the central ESP32 (and, optionally, the peripheral) over Web
 * Serial; the central's send/echo lines become real readings, shown here
 * at once and uploaded so the assistant console and groupmates see them.
 * Replaces Arduino's Serial Monitor for the session, time sync included.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modul1Pairer, parseModul1Line } from "../../lib/serial-modul1";
import type { Reading } from "../../lib/telemetry-sim";
import type { Lang } from "../../lib/kelas";
import type { Telemetry } from "./useTelemetry";
import { serialSupported, useSerialBoard, type BoardStatus } from "./useSerialBoard";
import { dict } from "../../lib/app";

const HISTORY_MAX = 80;
const UPLOAD_MS = 1500;
const QUEUE_MAX = 200;

const T = dict({
  id: {
    title: "Papan di PC ini",
    intro:
      "Colokkan ESP32 Central ke PC ini lalu hubungkan. Halaman ini mengirim waktu PC ke papan dan menggantikan Serial Monitor, jadi tutup Serial Monitor Arduino terlebih dahulu.",
    unsupported:
      "Menghubungkan papan butuh Chrome atau Edge di PC. Halaman ini tetap menampilkan data kelompok yang dikirim dari PC lain.",
    board: (n: number) => `Papan ${n}`,
    connect: "Hubungkan papan",
    connectSecond: "Hubungkan papan kedua",
    disconnect: "Putuskan",
    reset: "Mulai ulang papan",
    sendTime: "Kirim waktu PC",
    status: {
      idle: "belum terhubung",
      open: "terhubung",
      lost: "terputus",
      busy: "port sedang dipakai",
      error: "galat",
    } as Record<BoardStatus, string>,
    busyHint: "Port ini sedang dipakai aplikasi lain. Tutup Serial Monitor Arduino lalu coba lagi.",
    lostHint: "Kabel papan terlepas atau papan dimulai ulang dari luar. Hubungkan lagi.",
    central: "Central",
    peripheral: "Peripheral",
    synced: "waktu PC tersinkron",
    notSynced: "menunggu waktu PC",
    logEmpty: "Belum ada keluaran dari papan. Tekan Mulai ulang papan atau tombol EN di papan.",
    sent: (n: number) => `${n} bacaan terkirim ke asisten`,
    localOnly:
      "Bacaan hanya tampil di PC ini. Masuk sebagai praktikan agar asisten ikut melihatnya.",
    noSession: "Belum terkirim: tidak ada sesi Modul 1 berjalan yang kamu ikuti.",
    offline: "Belum terkirim, mencoba lagi…",
    log: "Keluaran papan",
  },
  en: {
    title: "Boards on this PC",
    intro:
      "Plug the Central ESP32 into this PC and connect it. This page sends the PC time to the board and replaces the Serial Monitor, so close Arduino's Serial Monitor first.",
    unsupported:
      "Connecting a board needs Chrome or Edge on a PC. This page still shows the group's data sent from another PC.",
    board: (n: number) => `Board ${n}`,
    connect: "Connect board",
    connectSecond: "Connect a second board",
    disconnect: "Disconnect",
    reset: "Restart board",
    sendTime: "Send PC time",
    status: {
      idle: "not connected",
      open: "connected",
      lost: "disconnected",
      busy: "port in use",
      error: "error",
    } as Record<BoardStatus, string>,
    busyHint: "Another app is using this port. Close Arduino's Serial Monitor and try again.",
    lostHint:
      "The board's cable came out or the board was restarted outside this page. Connect again.",
    central: "Central",
    peripheral: "Peripheral",
    synced: "PC time synced",
    notSynced: "waiting for PC time",
    logEmpty: "No output from the board yet. Press Restart board or the EN button on the board.",
    sent: (n: number) => `${n} readings sent to the assistant`,
    localOnly:
      "Readings show on this PC only. Sign in as a student so the assistant sees them too.",
    noSession: "Not sent: there is no running Module 1 session you joined.",
    offline: "Not sent yet, retrying…",
    log: "Board output",
  },
});
type Tx = (typeof T)["id"];

function BoardSlot({
  n,
  t,
  onLine,
  onOpen,
}: {
  n: number;
  t: Tx;
  onLine: (line: string) => void;
  onOpen: (n: number, open: boolean) => void;
}) {
  const b = useSerialBoard(onLine);
  const logRef = useRef<HTMLDivElement>(null);
  const open = b.status === "open";

  useEffect(() => onOpen(n, open), [n, open, onOpen]);

  // Follow the newest line unless the reader has scrolled up to look back.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTop = el.scrollHeight;
  }, [b.log]);

  return (
    <section className="board" data-status={b.status}>
      <div className="board__head">
        <h3 className="board__name">{t.board(n)}</h3>
        <span className={`pill ${open ? "pill--ok" : "pill--mono"}`}>
          <span className={`dot ${open ? "dot--ok dot--pulse" : "dot--off"}`} aria-hidden="true" />
          {t.status[b.status]}
        </span>
        {b.role && <span className="pill pill--mono">{t[b.role]}</span>}
        {open && <span className="board__sync">{b.synced ? t.synced : t.notSynced}</span>}
        <div className="board__actions">
          {open ? (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void b.reset()}
              >
                {t.reset}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void b.sendTime()}
              >
                {t.sendTime}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => void b.close()}
              >
                {t.disconnect}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void b.connect()}
            >
              {n === 1 ? t.connect : t.connectSecond}
            </button>
          )}
        </div>
      </div>
      {b.status === "busy" && <p className="hint board__warn">{t.busyHint}</p>}
      {b.status === "lost" && <p className="hint board__warn">{t.lostHint}</p>}
      {(open || b.log.length > 0) && (
        <div ref={logRef} className="board__log mono" role="log" aria-label={t.log} tabIndex={0}>
          {b.log.length === 0 ? (
            <p className="board__empty">{t.logEmpty}</p>
          ) : (
            b.log.map((l) => (
              <div key={l.id} className="board__line">
                {l.text}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

type Upload =
  { kind: "idle" } | { kind: "sent"; n: number } | { kind: "noSession" } | { kind: "offline" };

export default function BoardLink({
  lang,
  group,
  canUpload,
  onTelemetry,
}: {
  lang: Lang;
  /** The group these readings belong to: the student's own. */
  group: number;
  canUpload: boolean;
  onTelemetry: (tel: Telemetry | null) => void;
}) {
  const t = T[lang];
  const [supported, setSupported] = useState<boolean | null>(null);
  const [second, setSecond] = useState(false);
  const [openSlots, setOpenSlots] = useState<Record<number, boolean>>({});
  const [history, setHistory] = useState<Reading[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [upload, setUpload] = useState<Upload>({ kind: "idle" });
  const pairer = useRef(new Modul1Pairer(group));
  const queue = useRef<Reading[]>([]);
  const sent = useRef(0);

  useEffect(() => setSupported(serialSupported()), []);

  useEffect(() => {
    pairer.current = new Modul1Pairer(group);
    setHistory([]);
  }, [group]);

  const onLine = useCallback((line: string) => {
    const readings = pairer.current.push(parseModul1Line(line));
    if (!readings.length) return;
    setHistory((h) => [...h, ...readings].slice(-HISTORY_MAX));
    setUpdatedAt(Date.now());
    queue.current = [...queue.current, ...readings].slice(-QUEUE_MAX);
  }, []);

  const onOpen = useCallback((n: number, open: boolean) => {
    setOpenSlots((s) => (s[n] === open ? s : { ...s, [n]: open }));
  }, []);

  const anyOpen = Object.values(openSlots).some(Boolean);

  useEffect(() => {
    onTelemetry(anyOpen ? { history, live: true, updatedAt } : null);
  }, [anyOpen, history, updatedAt, onTelemetry]);

  useEffect(() => () => onTelemetry(null), [onTelemetry]);

  useEffect(() => {
    if (!canUpload) return;
    const id = window.setInterval(async () => {
      const batch = queue.current.slice(0, 50);
      if (!batch.length) return;
      try {
        const r = await fetch("/api/session/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            readings: batch.map((x) => ({
              tx: x.tx,
              rx: x.rx,
              delayMs: x.delayMs,
              nilai: x.nilai,
            })),
          }),
        });
        const d = (await r.json()) as { ok: boolean; kode?: string };
        if (d.ok) {
          queue.current = queue.current.slice(batch.length);
          sent.current += batch.length;
          setUpload({ kind: "sent", n: sent.current });
        } else {
          // Not in a running Module 1 session: nothing to retry into.
          queue.current = queue.current.slice(batch.length);
          setUpload({ kind: "noSession" });
        }
      } catch {
        setUpload({ kind: "offline" });
      }
    }, UPLOAD_MS);
    return () => window.clearInterval(id);
  }, [canUpload]);

  if (supported === null) return null;

  return (
    <div className="livews__card boardlink">
      <div className="livews__cardhead">
        <h2 className="livews__h">{t.title}</h2>
        {anyOpen && (
          <span className="boardlink__upload">
            {!canUpload
              ? t.localOnly
              : upload.kind === "sent"
                ? t.sent(upload.n)
                : upload.kind === "noSession"
                  ? t.noSession
                  : upload.kind === "offline"
                    ? t.offline
                    : null}
          </span>
        )}
      </div>
      {!supported ? (
        <p className="hint">{t.unsupported}</p>
      ) : (
        <>
          <p className="hint">{t.intro}</p>
          <BoardSlot n={1} t={t} onLine={onLine} onOpen={onOpen} />
          {second ? (
            <BoardSlot n={2} t={t} onLine={onLine} onOpen={onOpen} />
          ) : (
            openSlots[1] && (
              <button
                type="button"
                className="btn btn--ghost btn--sm boardlink__more"
                onClick={() => setSecond(true)}
              >
                {t.connectSecond}
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}
