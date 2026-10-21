/**
 * The Praktikan Dasbor's TP additions (Phase 13, mockup p13-dash): a TP
 * card while a window is open, about to open or just closed (countdown,
 * compact track, status, Buka TP), with the semester's TP trail beside it.
 * Nilaiku's TP score opens each question's mark (TpRincian), still only
 * after the group's scores are sent.
 */
import { CaretRightIcon } from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import { href } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import { TP_MENUNGGU, poinNomor } from "../../lib/tp";
import { TPS } from "./tpStrings";
import {
  Countdown,
  StatusPill,
  WinTrack,
  hariJam,
  judulJendela,
  modulStyle,
  waktuPanjang,
  type TpSaya,
  type TpSayaModul,
} from "./shared";

const HARI = 86_400_000;

/** The module the card is about: open now, else opening within a week,
 *  else closed in the last three days. */
export function modulKartu(d: TpSaya | null): TpSayaModul | null {
  if (!d) return null;
  const now = Date.now();
  const m = d.modul;
  return (
    m.find((x) => x.keadaan === "buka") ??
    m.find(
      (x) => x.keadaan === "belum" && x.jendela && Date.parse(x.jendela.buka) - now < 7 * HARI,
    ) ??
    m.find(
      (x) => x.keadaan === "tutup" && x.jendela && now - Date.parse(x.jendela.tutup) < 3 * HARI,
    ) ??
    null
  );
}

export function TpKartu({ lang, d }: { lang: Lang; d: TpSaya | null }) {
  const t = TPS[lang];
  const m = modulKartu(d);
  if (!d || !m) return null;
  const j = m.jendela;
  const judul =
    m.keadaan === "buka" && TP_MENUNGGU.includes(m.status)
      ? m.status === "telat"
        ? t.telatH
        : t.masukH
      : judulJendela(m.keadaan, j, lang);
  return (
    <div className="tpdash">
      <section className="panel panel--raised panel--key tpdcard" style={modulStyle(m.modul)}>
        <div className="row">
          <Pill modul={m.modul}>
            {t.tp} · {modulLabel(m.modul, lang)}
          </Pill>
          {m.keadaan !== "belum" && (
            <StatusPill
              s={m.keadaan === "tutup" && m.status === "belum" ? "kosong" : m.status}
              lang={lang}
            />
          )}
        </div>
        <h2 className="tphero__h">{judul}</h2>
        {j && m.keadaan !== "tutup" && (
          <div className="tphero__left">
            <span className="label-caps">{m.keadaan === "buka" ? t.tutupDalam : t.bukaDalam}</span>
            <Countdown
              to={m.keadaan === "buka" ? j.tutup : j.buka}
              lang={lang}
              pelangi
              keTutup={m.keadaan === "buka"}
            />
          </div>
        )}
        {j && <WinTrack j={j} lang={lang} compact />}
        {m.berkas.length > 0 && m.dikirimPada && (
          <p className="hint">
            {t.diterimaPada(waktuPanjang(m.dikirimPada, lang))}
            {m.tandaTerima ? ` · ${t.kodeTerima(m.tandaTerima.kode)}` : ""}
          </p>
        )}
        <div className="row">
          <a className="btn btn--inverse" href={href(lang, `/modules/${m.modul}?step=tp`)}>
            {t.bukaTp}
          </a>
        </div>
      </section>
      <section className="panel tptrail">
        <h2 className="panel__title">{t.tpSemester}</h2>
        <ul className="tptrail__l">
          {d.modul.map((x) => (
            <li key={x.modul} style={modulStyle(x.modul)}>
              <span className="tptrail__dot" aria-hidden="true" />
              <a className="grow" href={href(lang, `/modules/${x.modul}?step=tp`)}>
                {modulLabel(x.modul, lang)}
              </a>
              {x.total != null ? (
                <b className="mono">{x.total}</b>
              ) : x.keadaan === "belum" && x.jendela ? (
                <span className="hint">{hariJam(x.jendela.buka, lang)}</span>
              ) : x.keadaan === null ? (
                <span className="hint">{t.tanpaJendela}</span>
              ) : (
                <StatusPill
                  s={x.keadaan === "tutup" && x.status === "belum" ? "kosong" : x.status}
                  lang={lang}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** In a session (Phase 21, f5): the TP card and the semester's trail as one
 *  slim row under the session's own cards. A missed TP is red text, not a
 *  pill (f4), so it never outshouts the session. */
export function TpBaris({ lang, d }: { lang: Lang; d: TpSaya | null }) {
  const t = TPS[lang];
  const m = modulKartu(d);
  if (!d || !m) return null;
  const j = m.jendela;
  const judul =
    m.keadaan === "buka" && TP_MENUNGGU.includes(m.status)
      ? m.status === "telat"
        ? t.telatH
        : t.masukH
      : judulJendela(m.keadaan, j, lang);
  return (
    <section className="panel tpbaris" style={modulStyle(m.modul)}>
      <div className="tpbaris__now">
        <span className="modlabel">
          <span className="modlabel__dot" aria-hidden="true" />
          {t.tp} · {modulLabel(m.modul, lang)}
        </span>
        <b className="tpbaris__h">{judul}</b>
        {j && m.keadaan !== "tutup" && (
          <Countdown to={m.keadaan === "buka" ? j.tutup : j.buka} lang={lang} />
        )}
      </div>
      <ul className="tpbaris__l">
        {d.modul.map((x) => {
          const kosong = x.keadaan === "tutup" && x.status === "belum";
          return (
            <li key={x.modul} style={modulStyle(x.modul)}>
              <span className="modlabel__dot" aria-hidden="true" />
              <span>{modulLabel(x.modul, lang)}</span>
              {x.total != null ? (
                <b className="mono">{x.total}</b>
              ) : x.keadaan === "belum" && x.jendela ? (
                <span className="hint">{hariJam(x.jendela.buka, lang)}</span>
              ) : x.keadaan === null ? (
                <span className="hint">{t.tanpaJendela}</span>
              ) : (
                <span className={kosong ? "tpbaris__bad" : "hint"}>
                  {t.status[kosong ? "kosong" : x.status]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <a className="btn btn--sm btn--ghost" href={href(lang, `/modules/${m.modul}?step=tp`)}>
        {t.bukaTp}
        <CaretRightIcon size={14} weight="bold" aria-hidden="true" />
      </a>
    </section>
  );
}

/** Each question's mark of one module's TP, for Nilaiku. */
export function TpRincian({ lang, d, modul }: { lang: Lang; d: TpSaya | null; modul: number }) {
  const t = TPS[lang];
  const m = d?.modul.find((x) => x.modul === modul);
  if (!d || !m?.skor) return null;
  return (
    <div className="tpbreak">
      {d.nomor.map((no) => (
        <span key={no} className="tpbreak__i" title={m.skor?.[no]?.catatan ?? undefined}>
          <small>
            {t.no} {no}
          </small>
          <b className="mono">
            {m.skor?.[no]?.skor ?? "-"}/{poinNomor(no)}
          </b>
        </span>
      ))}
    </div>
  );
}
