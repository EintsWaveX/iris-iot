/**
 * One block per event kind (Workshop, ToT, Rekruitasi), each a Swiper 3D
 * coverflow of its editions like the reference's certificate deck (rotate
 * 12, depth 120): drag, swipe, the arrows or the keyboard, the newest
 * edition starting in the centre. Reduced motion gets a plain sideways
 * row with the same cards.
 */
import { useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, EffectCoverflow, Keyboard } from "swiper/modules";
import type { Swiper as SwiperT } from "swiper";
import "swiper/css";
import "swiper/css/effect-coverflow";
import { CaretLeftIcon, CaretRightIcon, CaretRightIcon as Caret } from "@phosphor-icons/react";
import IconButton from "../../ui/IconButton";
import { tanggalPanjang } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { sampulAcara, teksDi, type Acara, type JenisAcara } from "../../../lib/profil";
import { Gambar } from "./parts";
import { P } from "./profilStrings";

const WARNA: Record<JenisAcara, string> = {
  workshop: "#40b0ff",
  tot: "#a78bfa",
  rekrutasi: "#f5b544",
};

function Kartu({ lang, a, onOpen }: { lang: Lang; a: Acara; onOpen: () => void }) {
  const t = P[lang];
  const sampul = sampulAcara(a);
  const judul = teksDi(a.judul, lang);
  return (
    <button type="button" className="pl-ev sweep-hover" onClick={onOpen}>
      <span className="pl-ev__photo">
        {sampul && <Gambar foto={sampul} alt={judul} sizes="(max-width: 640px) 80vw, 400px" />}
      </span>
      <span className="pl-ev__body">
        <span className="hint mono">{tanggalPanjang(a.tanggal, lang)}</span>
        <b>{judul}</b>
        <span className="hint">
          {teksDi(a.tempat, lang)} · {t.nFoto(a.foto.length)}
        </span>
      </span>
    </button>
  );
}

export function BlokAcara({
  lang,
  jenis,
  list,
  tier,
  editor,
  onOpen,
}: {
  lang: Lang;
  jenis: JenisAcara;
  /** Oldest first. */
  list: Acara[];
  tier: 0 | 2;
  editor: string | null;
  onOpen: (a: Acara) => void;
}) {
  const t = P[lang];
  const [sw, setSw] = useState<SwiperT | null>(null);
  const [ujung, setUjung] = useState({ awal: false, akhir: true });
  const head = (
    <span className="stack stack--sm">
      <span className="eyebrow" style={{ color: WARNA[jenis] }}>
        {t.jenisEyebrow[jenis]}
      </span>
      <h3 className="home__h2">{t.jenis[jenis]}</h3>
    </span>
  );

  if (!list.length) {
    if (!editor) return null;
    return (
      <div className="pl-ev-block" data-rv>
        <div className="pl-ev-block__head">{head}</div>
        <div className="panel pl-emptyed">
          <span className="hint">{t.edisiKosong}</span>
          <a className="btn btn--ghost btn--sm" href={editor}>
            <span className="btn__label">{t.tambahEdisi}</span>
            <Caret size={16} weight="bold" aria-hidden="true" />
          </a>
        </div>
      </div>
    );
  }

  const diam = tier === 0 || list.length < 2;
  const ikut = (s: SwiperT) => setUjung({ awal: s.isBeginning, akhir: s.isEnd });
  return (
    <div
      className={`pl-ev-block${diam ? " pl-ev-block--still" : ""}`}
      data-rv
      style={{ ["--c" as string]: WARNA[jenis] }}
    >
      <div className="pl-ev-block__head">
        {head}
        <span className="grow" />
        <span className="hint mono">{t.nEdisi(list.length)}</span>
        {!diam && (
          <span className="row pl-flow__btns">
            <IconButton
              icon={CaretLeftIcon}
              label={t.sebelumnya}
              disabled={ujung.awal}
              onClick={() => sw?.slidePrev()}
            />
            <IconButton
              icon={CaretRightIcon}
              label={t.berikutnya}
              disabled={ujung.akhir}
              onClick={() => sw?.slideNext()}
            />
          </span>
        )}
      </div>
      {diam ? (
        <div className="pl-flow pl-flow--row">
          {list.map((a) => (
            <div className="pl-slide" key={a.id}>
              <Kartu lang={lang} a={a} onOpen={() => onOpen(a)} />
            </div>
          ))}
        </div>
      ) : (
        <Swiper
          className="pl-flow"
          modules={[EffectCoverflow, Keyboard, A11y]}
          effect="coverflow"
          coverflowEffect={{ rotate: 12, stretch: 0, depth: 120, modifier: 1, slideShadows: false }}
          grabCursor
          centeredSlides
          slidesPerView="auto"
          spaceBetween={24}
          speed={520}
          initialSlide={list.length - 1}
          keyboard={{ enabled: true, onlyInViewport: true }}
          a11y={{ prevSlideMessage: t.sebelumnya, nextSlideMessage: t.berikutnya }}
          onSwiper={(s) => {
            setSw(s);
            ikut(s);
          }}
          onSlideChange={ikut}
          onReachBeginning={ikut}
          onReachEnd={ikut}
        >
          {list.map((a) => (
            <SwiperSlide className="pl-slide" key={a.id}>
              <Kartu lang={lang} a={a} onOpen={() => onOpen(a)} />
            </SwiperSlide>
          ))}
        </Swiper>
      )}
    </div>
  );
}
