/**
 * /recruitment/qr, the projector view (06, PRD 6 Attendance QR, mockup
 * r2-qr): no navbar, made for a wall. A QR that changes every 20 seconds, the
 * event, a count that rolls and one dot per candidate expected, lit as they
 * arrive, and a lobby with the full name of each CaAs who has checked in (the
 * attendance keepers' screen only; the user chose full names, 4 Nov). Six
 * characters under the QR serve a phone whose camera will not scan. The token comes from the server for the
 * current period (qr-token, the attendance right); the count follows the
 * reccandidates topic, so nothing here polls for it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import gsap from "gsap";
import { GearSixIcon, XIcon } from "@phosphor-icons/react";
import Dropdown from "../../ui/Dropdown";
import IconButton from "../../ui/IconButton";
import { href, useTick } from "../../../lib/app";
import { useRecOrang } from "../../../lib/recruitment/latihan-client";
import type { Lang } from "../../../lib/kelas";
import {
  isFail,
  recGet,
  recPost,
  useRecAttendance,
  useRecEdition,
  useRecQrEvents,
  useRecQrRecent,
} from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { PERIOD_MS } from "../../../lib/recruitment/qr";
import type { QrTokenResponse, SettingsResponse } from "../../../lib/recruitment/types";
import { QR_DEFAULT, qrUntuk, type QrMap, type QrSetting } from "../../../lib/recruitment/qr-luar";
import { judulAcara, tempatAcara } from "../judul";
import { S2 } from "../s2Strings";
import { kapanAcara } from "../shared";
import { useRevealMotion } from "../reveal/fx";
import { Roll } from "../candidate/PilihJadwal";
import { REC } from "../recruitmentStrings";
import QrAtur from "./QrAtur";
import { Lobby, Stars, Ticker } from "./QrWallFx";
import Skeleton from "../../ui/Skeleton";

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
  const me = useRecOrang();
  const edisi = useRecEdition(me?.role === "asisten");
  // The attendance keepers, or the outside PJ of a shift (the server then lists only their own shifts)
  const izin = edisi.data?.rights?.attendance === true || edisi.data?.qrShift === true;
  const events = useRecQrEvents(izin);
  const motion = useRevealMotion();
  const [pilih, setPilih] = useState<number | null>(null);
  const [tok, setTok] = useState<QrTokenResponse | null>(null);
  const [gagal, setGagal] = useState(false);
  const ring = useRef<SVGRectElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const prevHere = useRef(0);
  /** server clock minus this device's, measured at the last token */
  const selisih = useRef(0);
  const [baru, setBaru] = useState<number | null>(null);
  const [atur, setAtur] = useState(false);
  /** counts up on every new check-in; each step plays one rainbow pulse around the QR */
  const [pulse, setPulse] = useState(0);
  const [sibukBuka, setSibukBuka] = useState(false);

  const daftar = events.data?.events ?? [];
  const aktif = daftar.find((e) => e.id === pilih) ?? daftar[0] ?? null;
  const eventId = aktif?.id ?? null;
  // A Google Form QR: made from the pasted link, no IRIS token, the last scans read from its sheet
  const luar = aktif?.qr.mode === "luar";
  // Not running yet: an Asisten may open the wall a few days ahead to prepare the QR (no token, no count)
  const belum = aktif !== null && !aktif.live;
  // A gathering takes attendance at its end: until its closing window (or Panitia opening it) there is no QR
  const jamBuka = aktif?.opensAt ?? null;
  const tutupAkhir = aktif !== null && aktif.opensAt !== null && !aktif.open;
  const linkLuar = luar ? aktif.qr.link : "";
  const adaSheet = luar && aktif.qr.sheet !== "";
  const terbaru = useRecQrRecent(eventId, izin && adaSheet);
  // The lobby lists who has checked in (the attendance keepers only; an outside PJ sees the count)
  const bisaDaftar = edisi.data?.rights?.attendance === true;
  const kehadiran = useRecAttendance(eventId, izin && bisaDaftar && !luar && !belum);

  // The token for the current period: fetched now, and again as the period ends.
  useEffect(() => {
    if (!izin || eventId === null || luar || belum || tutupAkhir) return;
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
      // The swap is timed from the server's clock: the code just replaced counts for only
      // a few seconds more, so a projector whose own clock is off must not show it late.
      selisih.current = Date.parse(r.now) - Date.now();
      setTok(r);
      const sisa = Date.parse(r.until) - Date.parse(r.now);
      timer = window.setTimeout(ambil, Math.min(PERIOD_MS + 500, Math.max(250, sisa + 150)));
    };
    void ambil();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [izin, eventId, luar, belum, tutupAkhir]);

  const svg = useMemo(
    () =>
      linkLuar
        ? qrSvg(linkLuar)
        : tok
          ? qrSvg(`${location.origin}/recruitment/hadir?t=${tok.token}`)
          : "",
    [tok?.token, linkLuar],
  );

  // A new code fades in; the ring drains over what is left of its 20 seconds.
  useEffect(() => {
    if (!tok) return;
    const left = Math.max(0, Date.parse(tok.until) - (Date.now() + selisih.current));
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
    if (hadir > prevHere.current && prevHere.current > 0) {
      setBaru(hadir - 1);
      setPulse((p) => p + 1);
    }
    prevHere.current = hadir;
  }, [hadir]);

  if (me === undefined || (me?.role === "asisten" && edisi.updatedAt === null))
    return <Skeleton height={520} />;
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

  /** Panitia open the attendance early, or hand it back to the schedule (the `buka` flag of the event's QR setting) */
  const ubahBuka = async (v: boolean) => {
    if (!aktif) return;
    setSibukBuka(true);
    const s = await recGet<SettingsResponse>("settings");
    if (isFail(s)) {
      setSibukBuka(false);
      return void window.Toast?.show(t.openFail, "danger");
    }
    const peta: QrMap = {
      ...((s.settings.find((x) => x.key === "qr")?.value as QrMap | undefined) ?? QR_DEFAULT),
    };
    const baru: QrSetting = { ...qrUntuk(peta, aktif.id) };
    if (v) baru.buka = true;
    else delete baru.buka;
    if (baru.mode === "iris" && !baru.buka) delete peta[String(aktif.id)];
    else peta[String(aktif.id)] = baru;
    const r = await recPost<{ ok: true }>("setting-save", { key: "qr", value: peta });
    setSibukBuka(false);
    if (isFail(r)) return void window.Toast?.show(t.openFail, "danger");
    setTok(null);
    events.refresh();
  };
  const tombolManual =
    bisaDaftar && aktif && aktif.opensAt !== null && aktif.live ? (
      aktif.open ? (
        aktif.manual && (
          <div className="r2proj__manual">
            <span className="hint">{t.manualOn}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={sibukBuka}
              onClick={() => void ubahBuka(false)}
            >
              <span className="btn__label">{t.backToSchedule}</span>
            </button>
          </div>
        )
      ) : (
        <button
          type="button"
          className="btn btn--primary"
          disabled={sibukBuka}
          onClick={() => void ubahBuka(true)}
        >
          <span className="btn__label">{t.openNow}</span>
        </button>
      )
    ) : null;
  const kode = tok?.code ?? "";
  const titik = Math.min(Math.max(diharap, 0), 160);
  return (
    <div
      className="r2proj"
      data-still={motion === "full" ? "no" : "yes"}
      data-calm={motion === "reduce" ? "yes" : "no"}
    >
      {motion !== "reduce" && <Stars />}
      <div className="r2proj__top">
        <img src="/brand/iris-logo-mark.png" alt={t.logoAlt} width="198" height="90" />
        <span className="r2proj__ev">{REC[lang].eyebrow}</span>
        <span style={{ flex: 1 }} />
        {daftar.length > 1 && (
          <div style={{ minWidth: 220 }}>
            <Dropdown
              id="qr-acara"
              label={t.pick}
              hideLabel
              value={String(aktif?.id ?? "")}
              options={daftar.map((e) => ({
                value: String(e.id),
                label: e.live ? judulAcara(e, lang) : `${judulAcara(e, lang)} · ${t.soon}`,
              }))}
              onChange={(v) => {
                setTok(null);
                setPilih(Number(v));
              }}
            />
          </div>
        )}
        <WallClock />
        {edisi.data?.rights?.attendance === true && aktif && (
          <IconButton
            icon={GearSixIcon}
            label={t.luar.settings}
            tipSide="bottom"
            onClick={() => setAtur(true)}
          />
        )}
        <IconButton
          icon={XIcon}
          label={t.close}
          tipSide="bottom"
          onClick={() => location.assign(href(lang, "/recruitment/panel"))}
        />
      </div>
      {!aktif ? (
        <div className="r2proj__info">
          <h1 className="r2proj__t">{t.none}</h1>
          <span className="r2proj__when">{t.noneHint}</span>
        </div>
      ) : (
        <div className="r2proj__main">
          <div className="r2proj__qrbox">
            {(tok || luar) && !tutupAkhir && (
              <div className="r2proj__qr" ref={box} dangerouslySetInnerHTML={{ __html: svg }} />
            )}
            {((belum && !luar) || tutupAkhir) && (
              <div className="r2proj__qr r2proj__qr--wait">
                <span>{belum ? t.soon : t.waitBox(jamBuka ?? "")}</span>
              </div>
            )}
            {pulse > 0 && motion !== "reduce" && !luar && !belum && !tutupAkhir && (
              <span key={pulse} className="r2proj__pulse" aria-hidden="true" />
            )}
            {!luar && !belum && !tutupAkhir && (
              <svg className="r2proj__ring" viewBox="0 0 100 100" aria-hidden="true">
                <rect x="1.5" y="1.5" width="97" height="97" rx="7" pathLength={100} ref={ring} />
              </svg>
            )}
          </div>
          <div className="r2proj__info">
            <span className="r2proj__eyebrow">
              {aktif.stage ? `${t.attendance} · ${REC[lang].stage[aktif.stage]}` : t.attendance}
              {belum ? ` · ${t.soon}` : tutupAkhir ? ` · ${t.waitTag}` : ""}
            </span>
            <h1 className="r2proj__t">{judulAcara(aktif, lang)}</h1>
            <span className="r2proj__when">
              {kapanAcara(aktif, lang)}
              {aktif.place ? ` · ${tempatAcara(aktif.place, lang)}` : ""}
            </span>
            {tutupAkhir ? (
              <div className="r2proj__how">
                <span>{belum ? t.soonHintAkhir(jamBuka) : t.waitHint(jamBuka)}</span>
                {tombolManual}
              </div>
            ) : luar ? (
              <>
                <div className="r2proj__recent" aria-live="polite">
                  <span className="r2proj__eyebrow">{t.luar.recent}</span>
                  {!adaSheet ? (
                    <p className="empty-note empty-note--sm">{t.luar.recentNoSheet}</p>
                  ) : terbaru.data && terbaru.data.scans.length > 0 ? (
                    <ol>
                      {terbaru.data.scans.map((x, i) => (
                        <li
                          key={`${x.nama}-${x.jam}-${i}`}
                          data-first={i === 0 ? "yes" : undefined}
                        >
                          <b>{x.nama}</b>
                          <span className="num">{x.jam}</span>
                        </li>
                      ))}
                    </ol>
                  ) : terbaru.data ? (
                    <p className="empty-note empty-note--sm">{t.luar.recentNone}</p>
                  ) : terbaru.errors > 0 ? (
                    <span className="hint">{t.luar.recentFail}</span>
                  ) : (
                    <Skeleton height={120} />
                  )}
                </div>
                <div className="r2proj__how">
                  <span>{t.luar.scanForm}</span>
                  <span className="hint">{belum ? t.soonHintLuar : t.luar.formNote}</span>
                </div>
                {tombolManual}
              </>
            ) : belum ? (
              <div className="r2proj__how">
                <span>{t.soonHint}</span>
              </div>
            ) : (
              <>
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
                {tombolManual}
              </>
            )}
          </div>
        </div>
      )}
      {aktif && !luar && (belum || bisaDaftar) && (
        <Lobby
          title={t.lobby}
          empty={belum ? t.lobbySoon : t.lobbyEmpty}
          rows={belum ? null : (kehadiran.data?.rows ?? null)}
          waiting={belum}
        />
      )}
      {aktif && (
        <Ticker
          still={motion === "reduce"}
          lines={
            tutupAkhir
              ? belum
                ? t.tickSoonAkhir(judulAcara(aktif, lang), jamBuka)
                : t.tickWait(judulAcara(aktif, lang), jamBuka)
              : luar
                ? t.tickLuar(judulAcara(aktif, lang))
                : belum
                  ? t.tickSoon(judulAcara(aktif, lang))
                  : t.tickIris(judulAcara(aktif, lang), location.host)
          }
        />
      )}
      {aktif && (
        <QrAtur
          lang={lang}
          open={atur}
          onOpenChange={setAtur}
          eventId={aktif.id}
          judul={judulAcara(aktif, lang)}
          mode={aktif.qr.mode}
          link={aktif.qr.link}
          sheet={aktif.qr.sheet}
          onSaved={() => {
            setTok(null);
            events.refresh();
          }}
        />
      )}
    </div>
  );
}
