/**
 * The Lab Profile on Home (Phase 23): Divisi, Foto Bersama, then the events
 * Workshop, ToT and Rekruitasi, all from GET /api/profil/baca and edited at
 * /lab-profile. A visitor gets the hero above it (HeroLab); a signed-in
 * reader keeps Beranda's own top and finds the profile under it. A save in
 * the editor reaches every open Home through the "profil" topic.
 *
 * While the profile loads its sections keep their room, so nothing below
 * jumps when it lands.
 */
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from "react";
import { DoorOpenIcon } from "@phosphor-icons/react";
import { getJson, href, tanggalPanjang, type Me } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { openSignIn } from "../../../lib/signin";
import { useSegar } from "../../../lib/siaran";
import {
  INFO_DIVISI,
  JENIS_ACARA,
  teksDi,
  type Acara,
  type DivisiProfil,
  type OrangProfil,
  type ProfilData,
} from "../../../lib/profil";
import Dialog from "../../ui/Dialog";
import Lightbox, { type FotoLihat } from "./Lightbox";
import { Avatar, Gambar, Hitung, Kepala, miring, useGerakProfil, useMuncul } from "./parts";
import { P } from "./profilStrings";
import "./profil.css";

// Swiper loads only when the events come into the page, not with every
// page's shared chunk.
const BlokAcara = lazy(() => import("./Acara").then((m) => ({ default: m.BlokAcara })));

/** The profile, fetched again (past the edge cache) when an editor saves. */
function useProfil(): ProfilData | null | undefined {
  const segar = useSegar(["profil"]);
  const [data, setData] = useState<ProfilData | null | undefined>(undefined);
  useEffect(() => {
    let hidup = true;
    getJson<ProfilData>(`/api/profil/baca${segar ? `?v=${Date.now()}` : ""}`)
      .then((d) => hidup && setData(d.ok ? d : null))
      .catch(() => hidup && setData((x) => x ?? null));
    return () => {
      hidup = false;
    };
  }, [segar]);
  return data;
}

function peranLabel(o: OrangProfil, lang: Lang) {
  return P[lang].peran[o.peran];
}

/* ================================================================ hero */

export function HeroLab({ lang, data }: { lang: Lang; data: ProfilData | null | undefined }) {
  const t = P[lang];
  const tier = useGerakProfil();
  const asisten = data
    ? data.inti.length + data.divisi.reduce((n, d) => n + d.anggota.length, 0)
    : null;
  const acara = data ? data.acara.length : null;
  // Once a line is sharp it drops its filter, so no blur layer stays.
  const set = (e: AnimationEvent<HTMLElement>) =>
    (e.target as HTMLElement).classList.contains("pl-blend") &&
    (e.target as HTMLElement).classList.add("is-set");
  return (
    <section className="pl-hero" onAnimationEnd={set} aria-labelledby="pl-hero-title">
      <div
        className="pl-hero__mark pl-blend"
        style={{ "--i": 0 } as CSSProperties}
        aria-hidden="true"
      >
        <span className="pl-hero__aura">
          <i />
          <i />
          <i />
        </span>
        <img
          src="/brand/iris-logo-1200.webp"
          srcSet="/brand/iris-logo-640.webp 640w, /brand/iris-logo-1200.webp 1200w"
          sizes="(max-width: 720px) 78vw, 560px"
          alt=""
          width={1200}
          height={567}
          fetchPriority="high"
        />
        <span className="pl-hero__shine" />
      </div>
      <h1
        className="home__display pl-hero__title pl-blend"
        id="pl-hero-title"
        style={{ "--i": 1 } as CSSProperties}
      >
        {t.heroTitleA}
        <span className="pl-sweep">IRIS</span>
        {t.heroTitleB}
      </h1>
      <p className="home__lede pl-blend" style={{ "--i": 2 } as CSSProperties}>
        {t.heroLede}
      </p>
      <div className="pl-hero__cta pl-blend" style={{ "--i": 3 } as CSSProperties}>
        <a className="btn btn--lg" href={href(lang, "/modules")}>
          {t.browse}
        </a>
        <button type="button" className="btn btn--primary btn--lg" onClick={() => openSignIn()}>
          <span className="btn__label">{t.praktikum}</span>
          <DoorOpenIcon size={20} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <dl className="pl-stats pl-blend" style={{ "--i": 4 } as CSSProperties}>
        <div className="pl-stat">
          <Hitung to={asisten} tier={tier} />
          <dt>{t.statAsisten}</dt>
        </div>
        <div className="pl-stat">
          <Hitung to={6} tier={tier} />
          <dt>{t.statDivisi}</dt>
        </div>
        <div className="pl-stat">
          <Hitung to={4} tier={tier} />
          <dt>{t.statModul}</dt>
        </div>
        {acara !== 0 && (
          <div className="pl-stat">
            <Hitung to={acara} tier={tier} />
            <dt>{t.statAcara}</dt>
          </div>
        )}
      </dl>
    </section>
  );
}

/* ============================================================== Divisi */

function KartuDivisi({
  lang,
  d,
  i,
  tier,
  onOpen,
}: {
  lang: Lang;
  d: DivisiProfil;
  i: number;
  tier: 0 | 2;
  onOpen: () => void;
}) {
  const t = P[lang];
  const info = INFO_DIVISI[d.kode];
  const shown = d.anggota.slice(0, 4);
  return (
    <button
      type="button"
      className="pl-div sweep-hover"
      style={{ "--c": info.warna, "--i": i } as CSSProperties}
      data-rv
      onClick={onOpen}
      aria-label={`${d.kode}, ${info.nama}`}
      {...miring(tier)}
    >
      <span className="pl-div__photo">
        {d.foto ? (
          <Gambar
            foto={d.foto}
            alt={t.divFoto(d.kode)}
            sizes="(max-width: 767px) 82vw, (max-width: 1099px) 46vw, 400px"
          />
        ) : (
          <span className="pl-div__empty mono" aria-hidden="true">
            {d.kode}
          </span>
        )}
        <span className="pl-div__code mono">{d.kode}</span>
      </span>
      <span className="pl-div__body">
        <b className="pl-div__name">{info.nama}</b>
        <span className="hint">{teksDi(d.baris, lang)}</span>
        <span className="pl-div__foot">
          <span className="pl-stack">
            {shown.map((o) => (
              <Avatar key={o.kode} o={o} size={34} />
            ))}
            {d.anggota.length > shown.length && (
              <span className="pl-stack__more mono">+{d.anggota.length - shown.length}</span>
            )}
          </span>
          <span className="hint">{t.nAsisten(d.anggota.length)}</span>
        </span>
      </span>
    </button>
  );
}

function Orang({ lang, o, big }: { lang: Lang; o: OrangProfil; big?: boolean }) {
  return (
    <figure className={`pl-person${big ? " pl-person--big" : ""}`}>
      {o.foto ? (
        <Gambar foto={o.foto} alt={o.nama} sizes="(max-width: 640px) 45vw, 200px" />
      ) : (
        <span className="pl-person__kode mono" role="img" aria-label={o.nama}>
          {o.kode}
        </span>
      )}
      <figcaption>
        <b>{o.nama}</b>
        <span className="mono">{o.kode}</span>
        <span className="hint">{peranLabel(o, lang)}</span>
      </figcaption>
    </figure>
  );
}

function DialogDivisi({ lang, d, onClose }: { lang: Lang; d: DivisiProfil; onClose: () => void }) {
  const t = P[lang];
  const info = INFO_DIVISI[d.kode];
  const [lb, setLb] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${d.kode} · ${info.nama}`}
      size="wide"
      lang={lang}
    >
      <div className="pl-dd" style={{ "--c": info.warna } as CSSProperties}>
        {d.foto && (
          <button
            type="button"
            className="pl-dd__photo"
            onClick={() => setLb(true)}
            aria-label={t.perbesarDivisi}
          >
            <Gambar
              foto={d.foto}
              alt={t.divFoto(d.kode)}
              sizes="(max-width: 1600px) 94vw, 1500px"
            />
          </button>
        )}
        <p className="pl-dd__text">{teksDi(d.deskripsi, lang)}</p>
        {d.anggota.length ? (
          <div className="pl-people">
            {d.anggota.map((o) => (
              <Orang key={o.kode} lang={lang} o={o} big={o.peran === "kepala"} />
            ))}
          </div>
        ) : (
          <p className="hint">{t.belumAnggota}</p>
        )}
      </div>
      {lb && d.foto && (
        <Lightbox
          lang={lang}
          pics={[{ ...d.foto, alt: t.divFoto(d.kode), cap: `${d.kode} · ${info.nama}` }]}
          start={0}
          onClose={() => setLb(false)}
        />
      )}
    </Dialog>
  );
}

/* ======================================================== Foto Bersama */

function FotoBersama({
  lang,
  data,
  editor,
}: {
  lang: Lang;
  data: ProfilData;
  editor: string | null;
}) {
  const t = P[lang];
  const [y, setY] = useState(0);
  const [lb, setLb] = useState(false);
  const ys = data.bersama;
  const ubah = editor ? { href: `${editor}?tab=bersama`, label: t.ubah } : undefined;
  if (!ys.length) {
    if (!editor) return null;
    return (
      <section className="pl-sec" aria-labelledby="pl-bersama">
        <Kepala id="pl-bersama" eyebrow={t.bersamaEyebrow} title={t.bersamaTitle} ubah={ubah} />
        <div className="panel pl-emptyed" data-rv>
          <span className="hint">{t.bersamaKosong}</span>
          <a className="btn btn--ghost btn--sm" href={`${editor}?tab=bersama`}>
            <span className="btn__label">{t.tambahFoto}</span>
          </a>
        </div>
      </section>
    );
  }
  const cur = ys[Math.min(y, ys.length - 1)];
  const cap = teksDi(cur.keterangan, lang);
  return (
    <section className="pl-sec" aria-labelledby="pl-bersama">
      <Kepala id="pl-bersama" eyebrow={t.bersamaEyebrow} title={t.bersamaTitle} ubah={ubah} />
      {ys.length > 1 && (
        <div className="pl-years" data-rv role="tablist" aria-label={t.tahunLabel}>
          {ys.map((q, j) => (
            <button
              key={q.id}
              type="button"
              role="tab"
              aria-selected={j === y}
              onClick={() => setY(j)}
            >
              {q.tahun}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="pl-group"
        data-rv
        onClick={() => setLb(true)}
        aria-label={t.perbesarBersama}
      >
        <span className="pl-group__frame" key={cur.id}>
          <Gambar foto={cur.foto} alt={cap} sizes="(max-width: 1440px) 94vw, 1360px" />
        </span>
        <span className="pl-group__cap">
          <b className="mono">{cur.tahun}</b>
          <span>{cap}</span>
        </span>
      </button>
      {lb && (
        <Lightbox
          lang={lang}
          pics={ys.map((q) => ({
            ...q.foto,
            alt: teksDi(q.keterangan, lang),
            cap: `${q.tahun} · ${teksDi(q.keterangan, lang)}`,
          }))}
          start={Math.min(y, ys.length - 1)}
          onClose={() => setLb(false)}
        />
      )}
    </section>
  );
}

/* ================================================================ Acara */

function DialogAcara({ lang, a, onClose }: { lang: Lang; a: Acara; onClose: () => void }) {
  const t = P[lang];
  const [lb, setLb] = useState<number | null>(null);
  const judul = teksDi(a.judul, lang);
  const pics: FotoLihat[] = a.foto.map((f, q) => ({
    besar: f.besar,
    kecil: f.kecil,
    alt: f.alt ? teksDi(f.alt, lang) : t.fotoKe(judul, q + 1),
    cap: judul,
  }));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={judul}
      description={`${tanggalPanjang(a.tanggal, lang)} · ${teksDi(a.tempat, lang)}`}
      size="xl"
      lang={lang}
    >
      <div className="pl-ed">
        <span className="eyebrow">{t.jenis[a.jenis]}</span>
        <p>{teksDi(a.ringkasan, lang)}</p>
        <div className="pl-gal">
          {pics.map((p, q) => (
            <button
              key={a.foto[q].id}
              type="button"
              className={q === 0 ? "pl-gal__wide" : undefined}
              onClick={() => setLb(q)}
              aria-label={p.alt}
            >
              <img src={p.kecil} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      </div>
      {lb !== null && <Lightbox lang={lang} pics={pics} start={lb} onClose={() => setLb(null)} />}
    </Dialog>
  );
}

/* ================================================================ page */

export default function ProfilLab({
  lang,
  me,
  hero,
}: {
  lang: Lang;
  me: Me | null;
  /** A visitor's Home opens with the hero. */
  hero?: boolean;
}) {
  const t = P[lang];
  const data = useProfil();
  const tier = useGerakProfil();
  const ref = useMuncul<HTMLDivElement>(tier, data);
  const [div, setDiv] = useState<DivisiProfil | null>(null);
  const [ev, setEv] = useState<Acara | null>(null);
  const editor =
    me?.role === "asisten" && me.hak?.profil === true ? href(lang, "/lab-profile") : null;
  const ubah = (tab: string) =>
    editor ? { href: `${editor}?tab=${tab}`, label: t.ubah } : undefined;

  const perJenis = useMemo(
    () => JENIS_ACARA.map((j) => [j, (data?.acara ?? []).filter((a) => a.jenis === j)] as const),
    [data],
  );
  // A save elsewhere can change the open dialog's division or edition.
  const divNow = div && data ? (data.divisi.find((d) => d.kode === div.kode) ?? null) : div;
  const evNow = ev && data ? (data.acara.find((a) => a.id === ev.id) ?? null) : ev;
  const adaAcara = perJenis.some(([, l]) => l.length > 0);

  return (
    <div className={`pl${tier === 0 ? " pl--still" : ""}`} ref={ref} data-tier={tier}>
      {hero && <HeroLab lang={lang} data={data} />}
      {data === undefined ? (
        <div className="pl-wait" aria-busy="true" />
      ) : data === null ? (
        <p className="hint pl-gagal">{t.gagal}</p>
      ) : (
        <>
          <section className="pl-sec" aria-labelledby="pl-divisi">
            <Kepala
              id="pl-divisi"
              eyebrow={t.divEyebrow}
              title={t.divTitle}
              lede={t.divLede}
              ubah={ubah("divisi")}
            />
            {data.inti.length > 0 && (
              <div className="pl-inti" data-rv>
                <span className="eyebrow">{t.inti}</span>
                <div className="pl-inti__row">
                  {data.inti.map((o) => (
                    <div className="pl-inti__p" key={o.kode}>
                      <Avatar o={o} size={48} />
                      <span>
                        <b>{o.nama}</b>
                        <span className="hint">
                          {peranLabel(o, lang)} · <span className="mono">{o.kode}</span>
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="pl-divgrid">
              {data.divisi.map((d, i) => (
                <KartuDivisi
                  key={d.kode}
                  lang={lang}
                  d={d}
                  i={i}
                  tier={tier}
                  onOpen={() => setDiv(d)}
                />
              ))}
            </div>
          </section>

          <FotoBersama lang={lang} data={data} editor={editor} />

          {(adaAcara || editor) && (
            <section className="pl-sec" aria-labelledby="pl-acara">
              <Kepala
                id="pl-acara"
                eyebrow={t.acaraEyebrow}
                title={t.acaraTitle}
                lede={t.acaraLede}
                ubah={ubah("acara")}
              />
              <Suspense fallback={<div className="pl-ev-wait" aria-busy="true" />}>
                {perJenis.map(([j, list]) => (
                  <BlokAcara
                    key={j}
                    lang={lang}
                    jenis={j}
                    list={list}
                    tier={tier}
                    editor={editor ? `${editor}?tab=acara&jenis=${j}` : null}
                    onOpen={setEv}
                  />
                ))}
              </Suspense>
            </section>
          )}
        </>
      )}
      {divNow && <DialogDivisi lang={lang} d={divNow} onClose={() => setDiv(null)} />}
      {evNow && <DialogAcara lang={lang} a={evNow} onClose={() => setEv(null)} />}
    </div>
  );
}
