/**
 * /recruitment/qr, the projector view (06, PRD 6 Attendance QR, mockup
 * r2-qr): no navbar, made for a wall. A QR that changes every 20 seconds, the
 * event, a count that rolls and one dot per candidate expected, lit as they
 * arrive. Nobody's name is on the wall; six characters under the QR serve a
 * phone whose camera will not scan. The token comes from the server for the
 * current period (qr-token, the attendance right); the count follows the
 * reccandidates topic, so nothing here polls for it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import gsap from "gsap";
import Dropdown from "../../ui/Dropdown";
import { useMe, useTick } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { isFail, recGet, useRecEdition, useRecQrEvents } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { PERIOD_MS } from "../../../lib/recruitment/qr";
import type { QrTokenResponse } from "../../../lib/recruitment/types";
import { judulAcara, tempatAcara } from "../judul";
import { S2 } from "../s2Strings";
import { kapanAcara } from "../shared";
import { useRevealMotion } from "../reveal/fx";
import { Roll } from "../candidate/PilihJadwal";
import { REC } from "../recruitmentStrings";

function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}

const p2 = (n: number) => String(n).padStart(2, "0");

function WallClock() {
  const now = useTick(1000);
  const w = tanggalWib(new Date(now));
  const [h, m] = w.jam.split(":");
  const s = p2(new Date(now).getSeconds());
  return (
    <b className="r2proj__clock num" role="timer">
      {h}:{m}:{s} <small>WIB</small>
    </b>
  );
}

export default function QrWall({ lang }: { lang: Lang }) {
  const t = S2[lang].qr;
  const me = useMe();
  const edisi = useRecEdition(me?.role === "asisten");
  const izin = edisi.data?.rights?.attendance === true;
  const events = useRecQrEvents(izin);
  const motion = useRevealMotion();
  const [pilih, setPilih] = useState<number | null>(null);
  const [tok, setTok] = useState<QrTokenResponse | null>(null);
  const [gagal, setGagal] = useState(false);
  const ring = useRef<SVGRectElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const prevHere = useRef(0);
  const [baru, setBaru] = useState<number | null>(null);

  const daftar = events.data?.events ?? [];
  const aktif = daftar.find((e) => e.id === pilih) ?? daftar[0] ?? null;
  const eventId = aktif?.id ?? null;

  // The token for the current period: fetched now, and again as the period ends.
  useEffect(() => {
    if (!izin || eventId === null) return;
    let alive = true;
    let timer = 0;
    const ambil = async () => {
      const r = await recGet<QrTokenResponse>("qr-token", { event: String(eventId) });
      if (!alive) return;
      if (isFail(r)) {
        setGagal(true);
        timer = window.setTimeout(ambil, 4000);
        return;
      }
      setGagal(false);
      setTok(r);
      // Counted from the device clock only to time the next fetch: the server decides what a period is.
      const sisa = Date.parse(r.until) - Date.now();
      timer = window.setTimeout(ambil, Math.min(PERIOD_MS + 500, Math.max(1500, sisa)));
    };
    void ambil();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [izin, eventId]);

  const svg = useMemo(
    () => (tok ? qrSvg(`${location.origin}/recruitment/hadir?t=${tok.token}`) : ""),
    [tok?.token],
  );

  // A new code fades in; the ring drains over what is left of its 20 seconds.
  useEffect(() => {
    if (!tok) return;
    const left = Math.max(0, Date.parse(tok.until) - Date.now());
    if (ring.current) {
      ring.current.style.animation = "none";
      void ring.current.getBoundingClientRect();
      ring.current.style.animation = "";
      ring.current.style.animationDelay = `-${PERIOD_MS - left}ms`;
    }
    if (box.current && motion !== "reduce" && prevHere.current > 0)
      gsap.fromTo(
        box.current,
        { opacity: 0, scale: 0.98 },
        { opacity: 1, scale: 1, duration: 0.24, ease: "power3.out" },
      );
  }, [tok?.token, motion]);

  const hadir = aktif?.here ?? tok?.here ?? 0;
  const diharap = aktif?.expected ?? tok?.expected ?? 0;
  useEffect(() => {
    if (hadir > prevHere.current && prevHere.current > 0) setBaru(hadir - 1);
    prevHere.current = hadir;
  }, [hadir]);

  if (me === undefined || (me?.role === "asisten" && edisi.updatedAt === null))
    return <span className="skeleton" style={{ height: 520 }} />;
  if (!me || me.role !== "asisten")
    return (
      <div className="r2proj">
        <div className="r2proj__info">
          <h1 className="r2proj__t">{t.attendance}</h1>
          <span className="r2proj__when">{t.signIn}</span>
        </div>
      </div>
    );
  if (!izin)
    return (
      <div className="r2proj">
        <div className="r2proj__info">
          <h1 className="r2proj__t">{t.attendance}</h1>
          <span className="r2proj__when">{t.noRight}</span>
        </div>
      </div>
    );

  const kode = tok?.code ?? "";
  const titik = Math.min(Math.max(diharap, 0), 160);
  return (
    <div className="r2proj" data-still={motion === "full" ? "no" : "yes"}>
      <div className="r2proj__top">
        <img src="/brand/iris-logo-mark.png" alt={t.logoAlt} />
        <span className="r2proj__ev">{REC[lang].eyebrow}</span>
        <span style={{ flex: 1 }} />
        {daftar.length > 1 && (
          <div style={{ minWidth: 220 }}>
            <Dropdown
              id="qr-acara"
              label={t.pick}
              hideLabel
              value={String(aktif?.id ?? "")}
              options={daftar.map((e) => ({ value: String(e.id), label: judulAcara(e, lang) }))}
              onChange={(v) => {
                setTok(null);
                setPilih(Number(v));
              }}
            />
          </div>
        )}
        <WallClock />
      </div>
      {!aktif ? (
        <div className="r2proj__info">
          <h1 className="r2proj__t">{t.none}</h1>
          <span className="r2proj__when">{t.noneHint}</span>
        </div>
      ) : (
        <div className="r2proj__main">
          <div className="r2proj__qrbox">
            {tok && (
              <div className="r2proj__qr" ref={box} dangerouslySetInnerHTML={{ __html: svg }} />
            )}
            <svg className="r2proj__ring" viewBox="0 0 100 100" aria-hidden="true">
              <rect x="1.5" y="1.5" width="97" height="97" rx="7" pathLength={100} ref={ring} />
            </svg>
          </div>
          <div className="r2proj__info">
            <span className="r2proj__eyebrow">{t.attendance}</span>
            <h1 className="r2proj__t">{judulAcara(aktif, lang)}</h1>
            <span className="r2proj__when">
              {kapanAcara(aktif, lang)}
              {aktif.place ? ` · ${tempatAcara(aktif.place, lang)}` : ""}
            </span>
            <div className="r2proj__count">
              <b className="num">
                <Roll n={hadir} />
              </b>
              <span>{t.outOf(diharap)}</span>
            </div>
            <div className="r2proj__dots" aria-hidden="true">
              {Array.from({ length: titik }, (_, i) => (
                <i
                  key={i}
                  data-on={i < hadir ? "yes" : undefined}
                  data-new={i === baru ? "yes" : undefined}
                />
              ))}
            </div>
            <div className="r2proj__how">
              <span>
                {t.scanHow} <b>{`${location.host}/recruitment/hadir`}</b> {t.andType}
              </span>
              <b className="r2proj__code mono">
                {kode ? `${kode.slice(0, 3)} ${kode.slice(3)}` : "..."}
              </b>
              <span className="hint">{gagal ? t.scan.gagal : t.codeChanges}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
