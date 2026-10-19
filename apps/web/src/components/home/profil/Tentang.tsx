/**
 * The Lab Profile's About and Logo Philosophy (2026-10-20), from the lab's
 * own Instagram posts (About, Logo Philosophy), in all three languages.
 * Both are fixed texts, not edited at /lab-profile.
 *
 * The logo's parts light up one at a time: a card picked (or hovered with a
 * mouse) dims the rest of the logo around that part.
 */
import { useState, type CSSProperties } from "react";
import type { Lang } from "../../../lib/kelas";
import { Kepala } from "./parts";
import { BAGIAN_LOGO, P, type BagianLogo } from "./profilStrings";

/* ================================================================ About */

export function TentangLab({ lang }: { lang: Lang }) {
  const t = P[lang];
  return (
    <section className="pl-sec" aria-labelledby="pl-tentang">
      <Kepala id="pl-tentang" eyebrow={t.tentangEyebrow} title={t.tentangTitle} />
      <div className="pl-about">
        <div className="pl-about__text" data-rv>
          <p className="pl-about__lede">{t.tentangA}</p>
          <p>{t.tentangB}</p>
          <span className="pl-about__label">{t.bidangLabel}</span>
          <ul className="pl-about__fields">
            {t.bidang.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <div className="pl-about__pics" data-rv>
          <img
            src="/profil/tentang-jaket-640.webp"
            srcSet="/profil/tentang-jaket-640.webp 640w, /profil/tentang-jaket.webp 1036w"
            sizes="(max-width: 899px) 92vw, 560px"
            alt={t.fotoJaket}
            width={1036}
            height={588}
            loading="lazy"
            decoding="async"
          />
          <img
            src="/profil/tentang-papan-640.webp"
            srcSet="/profil/tentang-papan-640.webp 640w, /profil/tentang-papan.webp 1036w"
            sizes="(max-width: 899px) 92vw, 560px"
            alt={t.fotoPapan}
            width={1036}
            height={588}
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}

/* ====================================================== Logo Philosophy */

/** Where each part sits on the 1200 x 567 logo: the spotlight's centre and
 *  radii in percent. Colour lights the whole logo. */
const SOROT: Record<BagianLogo, [number, number, number, number] | null> = {
  awan: [79, 30, 27, 40],
  wifi: [65.5, 31, 8, 13],
  warna: null,
  huruf: [43, 66, 50, 30],
};

export function FilosofiLogo({ lang }: { lang: Lang }) {
  const t = P[lang];
  const [pilih, setPilih] = useState<BagianLogo | null>(null);
  const [arah, setArah] = useState<BagianLogo | null>(null);
  const aktif = arah ?? pilih;
  const s = aktif ? SOROT[aktif] : null;
  const gaya = (
    s ? { "--sx": `${s[0]}%`, "--sy": `${s[1]}%`, "--srx": `${s[2]}%`, "--sry": `${s[3]}%` } : {}
  ) as CSSProperties;

  const kartu = (b: BagianLogo) => (
    <button
      key={b}
      type="button"
      className="pl-logo__card"
      aria-pressed={pilih === b}
      onClick={() => setPilih((x) => (x === b ? null : b))}
      onPointerEnter={(e) => e.pointerType === "mouse" && setArah(b)}
      onPointerLeave={() => setArah(null)}
    >
      <b>{t.logoBagian[b].judul}</b>
      {b === "warna" && <span className="pl-logo__swatch" aria-hidden="true" />}
      <span>{t.logoBagian[b].isi}</span>
    </button>
  );

  return (
    <section className="pl-sec" aria-labelledby="pl-logo">
      <Kepala id="pl-logo" eyebrow={t.logoEyebrow} title={t.logoTitle} lede={t.logoLede} />
      <div className="pl-logo" data-rv>
        <div className="pl-logo__side">{BAGIAN_LOGO.slice(0, 2).map(kartu)}</div>
        <div
          className="pl-logo__stage"
          data-sorot={s ? "ya" : aktif === "warna" ? "warna" : undefined}
          style={gaya}
        >
          <img
            src="/brand/iris-logo-1200.webp"
            srcSet="/brand/iris-logo-640.webp 640w, /brand/iris-logo-1200.webp 1200w"
            sizes="(max-width: 1099px) 86vw, 520px"
            alt={t.logoAlt}
            width={1200}
            height={567}
            loading="lazy"
            decoding="async"
          />
          <span className="pl-logo__dim" aria-hidden="true" />
        </div>
        <div className="pl-logo__side">{BAGIAN_LOGO.slice(2).map(kartu)}</div>
      </div>
    </section>
  );
}
