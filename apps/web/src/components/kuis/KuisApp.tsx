/**
 * The Module 4 quiz game (games.irisiotlab.com). One island: it checks who
 * is here and whether a Module 4 session is running, opens the socket, and
 * shows the host's projector screens or the player's phone screens.
 *
 * Reference look: the Tes Tulis exam (a fixed full-screen page with a top
 * bar, big mono timer, option rows), turned up: drifting colour, twinkling
 * stars, chunky answer tiles, springy entrances, confetti. Motion follows the
 * site's levels (useRevealMotion): reduced motion gets the same screens still.
 */
import { useEffect, useState } from "react";
import "./kuis.css";
import { useMe, useSessionNow } from "../../lib/app";
import { readLangPref, saveLangPref } from "../../lib/hooks";
import { bahasaKonten, resolveLang, type Lang } from "../../lib/kelas";
import { tiketDariAlamat } from "../../lib/kuis";
import { setSound, soundOn } from "../../lib/prefs";
import { useRevealMotion } from "../recruitment/reveal/fx";
import { bunyi } from "./fx";
import HostLayar from "./Host";
import { K, type KuisTeks } from "./kuisStrings";
import { Latar } from "./parts";
import PemainLayar from "./Pemain";
import { useKuis } from "./useKuis";

function Info({
  judul,
  sub,
  aksi,
  ikon = "bintang",
}: {
  judul: string;
  sub?: string;
  aksi?: { label: string; jalan: () => void; tip?: string };
  ikon?: string;
}) {
  return (
    <main className="kz__tubuh kz__tubuh--info" data-anim="1">
      <div className="kz__info">
        <span className="kz__info-ikon" data-ikon={ikon} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <h2 className="kz__judul-besar">{judul}</h2>
        {sub && <p>{sub}</p>}
        {aksi && (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            data-tip={aksi.tip}
            onClick={aksi.jalan}
          >
            {aksi.label}
          </button>
        )}
      </div>
    </main>
  );
}

function useBahasa(
  kelas: "reguler" | "internasional" | null | undefined,
): [Lang, (l: Lang) => void] {
  const [pref, setPref] = useState<Lang | null>(null);
  useEffect(() => setPref(readLangPref()), []);
  const lang = resolveLang(pref, kelas ?? null);
  return [
    lang,
    (l) => {
      saveLangPref(l);
      setPref(l);
    },
  ];
}

function Atas({
  t,
  lang,
  ganti,
  status,
}: {
  t: KuisTeks;
  lang: Lang;
  ganti: (l: Lang) => void;
  status: string;
}) {
  const [bunyiNyala, setBunyi] = useState(false);
  const [penuh, setPenuh] = useState(false);
  useEffect(() => {
    setBunyi(soundOn());
    const f = () => setPenuh(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  return (
    <header className="kz__atas">
      <div className="kz__atas-id">
        <img src="/brand/iris-logo-mark.png" alt="IRIS" width="62" height="28" />
        <div>
          <b>{t.nama}</b>
          <small>{t.sub}</small>
        </div>
      </div>
      <div className="kz__atas-kanan">
        <span className="kz__status" data-status={status} aria-hidden="true" />
        <button
          type="button"
          className="kz__ikon"
          aria-pressed={bunyiNyala}
          title={bunyiNyala ? t.bunyiOn : t.bunyiOff}
          aria-label={bunyiNyala ? t.bunyiOn : t.bunyiOff}
          onClick={() => {
            setSound(!bunyiNyala);
            setBunyi(!bunyiNyala);
            if (!bunyiNyala) window.setTimeout(() => bunyi("masuk"), 30);
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
            {bunyiNyala ? (
              <path
                d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M16 9.5l5 5M21 9.5l-5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
        <button
          type="button"
          className="kz__ikon"
          title={t.layarPenuh}
          aria-label={t.layarPenuh}
          aria-pressed={penuh}
          onClick={() =>
            document.fullscreenElement
              ? void document.exitFullscreen()
              : void document.documentElement.requestFullscreen?.()
          }
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="kz__ikon kz__ikon--teks"
          aria-label="Language"
          onClick={() => ganti(bahasaKonten(lang) === "id" ? "en" : "id")}
        >
          {bahasaKonten(lang) === "id" ? "EN" : "ID"}
        </button>
      </div>
    </header>
  );
}

export default function KuisApp({ lang: bahasaHalaman = "id" }: { lang?: Lang }) {
  const me = useMe();
  const masuk = me !== undefined && me !== null;
  const sesiPoll = useSessionNow(masuk);
  const sesi = sesiPoll.data;
  const [lang, ganti] = useBahasa(sesi?.kelas);
  const t = K[lang];
  const m = useRevealMotion();

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
  }, [lang]);

  // Arrived from the main site's "Open Game": trade the ticket in the link for this host's own cookie.
  const [tukar, setTukar] = useState<"cek" | "tukar" | "selesai">("cek");
  useEffect(() => {
    const tiket = tiketDariAlamat(location.hash);
    history.replaceState(null, "", location.pathname + location.search);
    if (!tiket) return setTukar("selesai");
    setTukar("tukar");
    void fetch("/api/auth/kuis-masuk", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiket }),
    })
      .then((r) => (r.ok ? location.reload() : setTukar("selesai")))
      .catch(() => setTukar("selesai"));
  }, []);

  // Signed out: the site's own sign-in, then back here.
  useEffect(() => {
    if (me === null && tukar === "selesai")
      location.replace(`/login?next=${encodeURIComponent("/")}`);
  }, [me, tukar]);

  const adaSesi = !!sesi && sesi.modul === 4;
  const asisten = me?.role === "asisten";
  const boleh = adaSesi && (asisten || (sesi?.milikSaya !== false && !sesi?.lihatSaja));
  const kuis = useKuis(!!me && boleh, bahasaKonten(lang));
  const { lihat, aku, status } = kuis;

  // A pop of sound when a game reaches the player's screen.
  useEffect(() => {
    if (status === "terhubung") bunyi("masuk");
  }, [status]);

  const [pesan, setPesan] = useState<string | null>(null);
  useEffect(() => {
    if (!kuis.galat) return;
    setPesan(t.galat[kuis.galat.kode] ?? kuis.galat.kode);
    const id = window.setTimeout(() => setPesan(null), 3200);
    return () => window.clearTimeout(id);
  }, [kuis.galat, t]);

  let isi;
  if (
    tukar !== "selesai" ||
    me === undefined ||
    (masuk && sesiPoll.updatedAt === null && !sesiPoll.ditolak)
  ) {
    isi = <Info judul={t.memuat} />;
  } else if (me === null) {
    isi = (
      <Info
        judul={t.masukDulu}
        aksi={{ label: t.masukBtn, jalan: () => location.assign("/login?next=%2F") }}
      />
    );
  } else if (!adaSesi) {
    isi = <Info ikon="jam" judul={t.belumAdaTitle} sub={t.belumAdaSub} />;
  } else if (!asisten && sesi?.lihatSaja) {
    isi = (
      <Info
        judul={t.lihatSajaTitle}
        sub={t.lihatSajaSub}
        aksi={{ label: t.masukBtn, jalan: () => location.assign("/login?next=%2F&ulang=1") }}
      />
    );
  } else if (!asisten && sesi?.milikSaya === false) {
    isi = (
      <Info
        judul={t.bukanSesimuTitle}
        sub={t.bukanSesimuSub}
        aksi={{ label: t.masukBtn, jalan: () => location.assign("/login?next=%2F&ulang=1") }}
      />
    );
  } else if (status === "ditutup") {
    const a = kuis.alasan;
    isi = (
      <Info
        ikon={a === "sesi-selesai" ? "bintang" : "jam"}
        judul={
          a === "sesi-selesai"
            ? t.sesiSelesai
            : a === "dikeluarkan"
              ? t.dikeluarkan
              : a === "penuh"
                ? t.penuh
                : t.terputus
        }
        aksi={
          a === "sesi-selesai"
            ? undefined
            : { label: t.coba, tip: t.tip.coba, jalan: kuis.sambungUlang }
        }
      />
    );
  } else if (!lihat || !aku) {
    isi = <Info judul={t.menyambung} />;
  } else if (lihat.peran === "host") {
    isi = <HostLayar v={lihat} k={kuis} aku={aku} t={t} m={m} kodeSesi={sesi?.kodeMasuk} />;
  } else {
    isi = <PemainLayar v={lihat} k={kuis} aku={aku} t={t} m={m} />;
  }

  return (
    <div
      className="kz"
      data-m={m}
      data-peran={lihat?.peran ?? "host"}
      data-fase={lihat?.fase ?? "lobi"}
      data-halaman={bahasaHalaman}
    >
      <Latar m={m} fase={lihat?.fase ?? "lobi"} />
      <Atas t={t} lang={lang} ganti={ganti} status={status} />
      {(status === "putus" || status === "menyambung") && lihat && (
        <div className="kz__banner" role="status">
          {status === "putus" ? t.terputus : t.menyambung}
        </div>
      )}
      {pesan && (
        <div className="kz__banner kz__banner--galat" role="alert">
          {pesan}
        </div>
      )}
      {isi}
    </div>
  );
}
