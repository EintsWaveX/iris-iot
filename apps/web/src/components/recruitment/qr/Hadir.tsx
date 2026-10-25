/**
 * /recruitment/hadir, where a phone lands after scanning the wall (06, mockup
 * r2-qr scan results): it sends the token in the address with the person's own
 * session, and answers one of four ways: marked present, already marked, not
 * your slot (with their own), or the QR changed (type the code from the wall).
 * Not signed in to their oprec account, they sign in first and come back to
 * this same address, so the scan still counts. The server decides everything; this page only shows it.
 */
import { useEffect, useRef, useState } from "react";
import { href } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { bukaAkun, isFail, recPost, useRecAkun } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import type { AttendResponse } from "../../../lib/recruitment/types";
import { judulAcara } from "../judul";
import { KepalaHalaman, kapanAcara, tgl } from "../shared";
import { S2 } from "../s2Strings";

type Hasil =
  | { v: "hadir" | "sudah"; acara: string; kapan: string }
  | { v: "bukan"; mine: string | null }
  | { v: "berganti" | "tahap" | "tutup" | "belum" | "gagal" };

const NADA: Record<Hasil["v"], "ok" | "warn"> = {
  hadir: "ok",
  sudah: "ok",
  bukan: "warn",
  berganti: "warn",
  tahap: "warn",
  tutup: "warn",
  belum: "warn",
  gagal: "warn",
};

export default function Hadir({ lang }: { lang: Lang }) {
  const t = S2[lang].qr;
  // The scan counts for the candidate's oprec account (2026-10-24): undefined while it loads.
  const akun = useRecAkun();
  const me = akun.updatedAt === null ? undefined : (akun.data?.account ?? null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [kode, setKode] = useState("");
  const [busy, setBusy] = useState(false);
  const sudahKirim = useRef(false);

  async function kirim(body: { token?: string; code?: string }) {
    setBusy(true);
    const r = await recPost<AttendResponse>("attend", body);
    setBusy(false);
    if (!isFail(r)) {
      const w = tanggalWib(new Date());
      setHasil({
        v: r.sudah ? "sudah" : "hadir",
        acara: judulAcara(r.event, lang),
        kapan: `${kapanAcara(r.event, lang)} · ${w.jam} WIB`,
      });
      return;
    }
    const peta: Record<string, Hasil> = {
      qr_berganti: { v: "berganti" },
      bukan_tahapmu: { v: "tahap" },
      jendela_tutup: { v: "tutup" },
      tidak_ditemukan: { v: "belum" },
      bukan_jadwalmu: {
        v: "bukan",
        mine:
          typeof r.mine === "string"
            ? `${tgl(tanggalWib(new Date(r.mine)).tanggal, lang)}, ${tanggalWib(new Date(r.mine)).jam}`
            : null,
      },
    };
    setHasil(peta[r.kode] ?? { v: "gagal" });
  }

  // The token in the address is read once, sent once, then dropped from the address.
  useEffect(() => {
    if (!me || sudahKirim.current) return;
    const token = new URLSearchParams(location.search).get("t");
    if (!token) return;
    sudahKirim.current = true;
    history.replaceState(history.state, "", location.pathname);
    void kirim({ token });
  }, [me]);

  if (me === undefined) return <span className="skeleton" style={{ height: 320 }} />;
  const tone = hasil ? NADA[hasil.v] : "warn";
  const judul = hasil ? t.scan[hasil.v] : t.title;
  const sub = !hasil
    ? t.typeCode
    : hasil.v === "hadir"
      ? t.scanSub.hadir(hasil.acara, hasil.kapan)
      : hasil.v === "sudah"
        ? t.scanSub.sudah(hasil.acara)
        : hasil.v === "bukan"
          ? t.scanSub.bukan(hasil.mine)
          : t.scanSub[hasil.v];
  const bisaKetik = !hasil || hasil.v === "berganti" || hasil.v === "gagal";

  return (
    <div className="rec-page">
      <KepalaHalaman lang={lang} title={t.title} />
      <div className="r2scan">
        <div className="panel r2scan__card" data-tone={tone}>
          {hasil && (
            <span className="r2scan__ic" aria-hidden="true">
              {tone === "ok" ? (
                <svg viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" pathLength={100} />
                  <path d="M20 33 l8 8 l16 -18" pathLength={100} />
                </svg>
              ) : (
                <svg viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" pathLength={100} />
                  <path d="M32 18 v18 M32 44 v2" pathLength={100} />
                </svg>
              )}
            </span>
          )}
          <h2 className="h2" role="status">
            {judul}
          </h2>
          <p className="hint">{sub}</p>
          {me === null ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => bukaAkun("masuk", `${location.pathname}${location.search}`)}
            >
              <span className="btn__label">{t.signIn2}</span>
            </button>
          ) : (
            bisaKetik && (
              <form
                className="row r2scan__code"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (kode.replace(/\s/g, "").length >= 6) void kirim({ code: kode });
                }}
              >
                <input
                  className="input mono"
                  maxLength={7}
                  value={kode}
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={(e) => setKode(e.target.value.toUpperCase())}
                  placeholder={t.codePh}
                  aria-label={t.code}
                />
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={busy || kode.replace(/\s/g, "").length < 6}
                >
                  <span className="btn__label">{t.sendCode}</span>
                </button>
              </form>
            )
          )}
          {me && hasil && (
            <a className="btn btn--block" href={href(lang, "/recruitment")}>
              <span className="btn__label">{t.myJourney}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
