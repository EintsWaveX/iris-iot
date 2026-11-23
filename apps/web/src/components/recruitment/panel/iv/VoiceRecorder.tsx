/**
 * The voice recording of a Wawancara, on the interview sheet. It records the microphone of the examiner's
 * device in parts of five minutes (a new recorder starts before the old one stops, so no word falls between
 * two parts) and uploads each part as it ends, with retries; a part that cannot be sent stays on the page to
 * send again or save to the device. The parts are the evidence Penilaian plays back (AudioEvidence).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadSimpleIcon, MicrophoneIcon, StopIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../../lib/kelas";
import {
  BAGIAN_MS,
  BITRATE,
  fetchIvAudio,
  lamaAudio,
  pilihMime,
  unggahBagian,
} from "../../../../lib/recruitment/iv-audio";
import { isFail } from "../../../../lib/recruitment/client";
import { RK } from "./rekamStrings";

interface Bagian {
  blob: Blob;
  ms: number;
  at: string;
}
type Fase = "diam" | "minta" | "rekam";

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ekstensi = (t: string) => (t.includes("mp4") ? "m4a" : t.includes("ogg") ? "ogg" : "webm");

export default function VoiceRecorder({
  lang,
  id,
  disabled,
  onStart,
}: {
  lang: Lang;
  /** The CaAs being interviewed */
  id: number;
  /** The sheet is sent or its stage is locked: a recording may not begin */
  disabled: boolean;
  /** The recording began: the sheet's "recording" marker goes on */
  onStart: () => void;
}) {
  const w = RK[lang];
  const mime = useRef<string | null>(null);
  const [fase, setFase] = useState<Fase>("diam");
  const [galat, setGalat] = useState<"ditolak" | "tak_bisa" | null>(null);
  const [lama, setLama] = useState(0);
  const [kirim, setKirim] = useState(0);
  const [gagal, setGagal] = useState<Bagian[]>([]);
  const [tersimpan, setTersimpan] = useState<{ n: number; ms: number } | null>(null);
  const kini = useRef<{
    stream: MediaStream | null;
    rec: MediaRecorder | null;
    mulai: number;
    ganti: ReturnType<typeof setTimeout> | null;
    tik: ReturnType<typeof setInterval> | null;
    kunci: { release: () => Promise<void> } | null;
    berhenti: boolean;
  }>({ stream: null, rec: null, mulai: 0, ganti: null, tik: null, kunci: null, berhenti: false });

  useEffect(() => {
    mime.current = pilihMime();
    if (!mime.current) setGalat("tak_bisa");
  }, []);

  /** The parts already on the server (this device's earlier takes, another examiner's) */
  const muat = useCallback(async () => {
    const r = await fetchIvAudio(id);
    if (isFail(r)) return;
    setTersimpan({ n: r.parts.length, ms: r.parts.reduce((a, p) => a + p.ms, 0) });
  }, [id]);
  useEffect(() => void muat(), [muat]);

  /** Sends one part, trying again on a lost network or a server error; a refusal is final. */
  const kirimBagian = useCallback(
    async (b: Bagian) => {
      setKirim((n) => n + 1);
      let ok = false;
      for (let i = 0; i < 4 && !ok; i++) {
        const r = await unggahBagian(id, b.blob, b.ms, b.at);
        if (r.ok) ok = true;
        else if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) break;
        else await tidur(2000 * 2 ** i);
      }
      setKirim((n) => n - 1);
      if (ok) void muat();
      else setGagal((g) => [...g, b]);
    },
    [id, muat],
  );

  const mulaiBagian = (stream: MediaStream, tipe: string): MediaRecorder => {
    const potong: Blob[] = [];
    const t0 = Date.now();
    const rec = new MediaRecorder(stream, { mimeType: tipe, audioBitsPerSecond: BITRATE });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) potong.push(e.data);
    };
    rec.onstop = () => {
      if (potong.length)
        void kirimBagian({
          blob: new Blob(potong, { type: tipe }),
          ms: Date.now() - t0,
          at: new Date(t0).toISOString(),
        });
      if (kini.current.berhenti && kini.current.rec === rec) {
        kini.current.stream?.getTracks().forEach((t) => t.stop());
        kini.current.stream = null;
      }
    };
    rec.start();
    return rec;
  };

  const putar = (stream: MediaStream, tipe: string) => {
    const k = kini.current;
    k.ganti = setTimeout(() => {
      if (k.berhenti) return;
      const lama_ = k.rec;
      k.rec = mulaiBagian(stream, tipe);
      lama_?.stop();
      putar(stream, tipe);
    }, BAGIAN_MS);
  };

  const mulai = async () => {
    const tipe = mime.current;
    if (!tipe || disabled) return;
    setFase("minta");
    setGalat(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const k = kini.current;
      k.stream = stream;
      k.berhenti = false;
      k.mulai = Date.now();
      k.rec = mulaiBagian(stream, tipe);
      putar(stream, tipe);
      k.tik = setInterval(() => setLama(Date.now() - k.mulai), 1000);
      // A phone that dims its screen may stop the page; ask it not to (not everywhere supported).
      const wl = (
        navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
        }
      ).wakeLock;
      wl?.request("screen").then(
        (l) => (k.kunci = l),
        () => undefined,
      );
      setLama(0);
      setFase("rekam");
      onStart();
    } catch (e) {
      setFase("diam");
      setGalat((e as DOMException)?.name === "NotAllowedError" ? "ditolak" : "tak_bisa");
    }
  };

  const berhenti = useCallback(() => {
    const k = kini.current;
    if (k.berhenti || !k.rec) return;
    k.berhenti = true;
    if (k.ganti) clearTimeout(k.ganti);
    if (k.tik) clearInterval(k.tik);
    void k.kunci?.release().catch(() => undefined);
    k.kunci = null;
    if (k.rec.state !== "inactive") k.rec.stop();
    else k.stream?.getTracks().forEach((t) => t.stop());
    setFase("diam");
  }, []);

  // Leaving the sheet ends the recording and sends what there is.
  useEffect(() => berhenti, [berhenti]);

  // Closing the tab mid-recording, or with a part unsent, asks first.
  const rawan = fase === "rekam" || kirim > 0 || gagal.length > 0;
  useEffect(() => {
    if (!rawan) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = w.leave;
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [rawan, w.leave]);

  const ulang = () => {
    const sisa = gagal;
    setGagal([]);
    for (const b of sisa) void kirimBagian(b);
  };
  const simpan = () =>
    gagal.forEach((b, i) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b.blob);
      a.download = `wawancara-${id}-${i + 1}.${ekstensi(b.blob.type)}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    });

  return (
    <div className="r4voice" data-on={fase === "rekam" ? "yes" : undefined}>
      {fase === "rekam" ? (
        <button type="button" className="r4rec r4voice__btn" aria-pressed="true" onClick={berhenti}>
          <StopIcon size={18} aria-hidden="true" />
          <span>{w.stop}</span>
        </button>
      ) : (
        <button
          type="button"
          className="r4rec r4voice__btn"
          aria-pressed="false"
          disabled={disabled || fase === "minta" || galat === "tak_bisa"}
          onClick={() => void mulai()}
        >
          <MicrophoneIcon size={18} aria-hidden="true" />
          <span>{fase === "minta" ? w.asking : w.start}</span>
        </button>
      )}
      <span className="hint num r4voice__st" aria-live="polite">
        {fase === "rekam"
          ? w.recording(lamaAudio(lama))
          : kirim > 0
            ? w.uploading(kirim)
            : tersimpan && tersimpan.n > 0
              ? `${w.saved(tersimpan.n)} · ${lamaAudio(tersimpan.ms)}`
              : ""}
      </span>
      {gagal.length > 0 && (
        <span className="r4voice__fail" role="alert">
          <b>{w.failed(gagal.length)}</b>
          <button type="button" className="btn btn--ghost btn--sm" onClick={ulang}>
            <span className="btn__label">{w.retry}</span>
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={simpan}>
            <DownloadSimpleIcon size={14} aria-hidden="true" />
            <span className="btn__label">{w.download}</span>
          </button>
        </span>
      )}
      {galat === "ditolak" && <span className="hint r4voice__err">{w.denied}</span>}
      {galat === "tak_bisa" && <span className="hint r4voice__err">{w.unsupported}</span>}
      {fase === "rekam" && <span className="hint r4voice__err">{w.hint}</span>}
    </div>
  );
}
