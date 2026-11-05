/**
 * Mode Latihan on the page (mockup n7-latihan): the bar that stays under the
 * nav while it is on, the card on Ringkasan, and the entry in the Account
 * menu. The state is the server's `iris_latihan` cookie (lib/recruitment/
 * latihan-client.ts); every switch reloads the page onto the right edition.
 */
import { useState } from "react";
import {
  ArrowsClockwiseIcon,
  ArrowsLeftRightIcon,
  FastForwardIcon,
  SparkleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import type { Lang } from "../../lib/kelas";
import { isFail } from "../../lib/recruitment/client";
import {
  latihanGanti,
  latihanKeluar,
  latihanLompat,
  latihanMasuk,
  latihanSamakan,
  latihanSiapkan,
  latihanUlang,
  useLatihanMode,
  useLatihanRingkas,
} from "../../lib/recruitment/latihan-client";
import type { LatihanMode } from "../../lib/recruitment/latihan";
import { STAGES, type StageKey } from "../../lib/recruitment/types";
import { REC } from "./recruitmentStrings";
import { LAT } from "./latihanStrings";
import "./recruitment-latihan.css";

const awalan = (lang: Lang) => (lang === "id" ? "" : `/${lang}`);

type AksiReset = "ulang" | "samakan";

/**
 * The confirmation of the two resets. Mulai Ulang wipes what was done in practice and keeps the practice
 * setup; Samakan dengan Oprec Asli copies the real Oprec's setup over the practice one again. Both act on
 * the one practice edition every Asisten shares, so the dialog says so.
 */
function KonfirmasiReset({
  lang,
  aksi,
  onClose,
}: {
  lang: Lang;
  aksi: AksiReset | null;
  onClose: () => void;
}) {
  const t = LAT[lang];
  const ulang = aksi !== "samakan";
  return (
    <Confirm
      open={aksi !== null}
      onOpenChange={(o) => !o && onClose()}
      title={ulang ? t.ulangTitle : t.samakanTitle}
      body={ulang ? t.ulangBody : t.samakanBody}
      confirmLabel={ulang ? t.ulangYes : t.samakanYes}
      cancelLabel={t.cancel}
      tone="primary"
      lang={lang}
      onConfirm={async () => !(await (ulang ? latihanUlang : latihanSamakan)(awalan(lang)))}
    >
      <span className="hint">{t.resetHint}</span>
    </Confirm>
  );
}

/** The bar under the nav; nothing when practice is off. */
export function LatihanBar({ lang }: { lang: Lang }) {
  const t = LAT[lang];
  const mode = useLatihanMode();
  const [tanya, setTanya] = useState<AksiReset | null>(null);
  const [lompat, setLompat] = useState(false);
  const [tahap, setTahap] = useState<StageKey>("tes_tulis");
  const [galat, setGalat] = useState(false);
  if (!mode) return null;
  const pindah = async (to: LatihanMode) => {
    if (to === mode) return;
    setGalat(!!(await latihanGanti(to, awalan(lang))));
  };
  return (
    <div className="lat-bar" role="region" aria-label={t.title}>
      <span className="lat-bar__ic" aria-hidden="true">
        <SparkleIcon size={20} weight="fill" />
      </span>
      <div className="lat-bar__txt">
        <b>{t.title}</b>
        <span className="hint">{galat ? t.failed : t.bar}</span>
      </div>
      <span className="lat-bar__grow" />
      <span className="lat-seg" role="group" aria-label={t.actAs}>
        <button
          type="button"
          aria-pressed={mode === "asisten"}
          onClick={() => void pindah("asisten")}
        >
          {t.asAsisten}
        </button>
        <button type="button" aria-pressed={mode === "caas"} onClick={() => void pindah("caas")}>
          {t.asCaas}
        </button>
      </span>
      <div className="lat-bar__acts">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLompat(true)}>
          <FastForwardIcon size={16} aria-hidden="true" />
          <span className="btn__label">{t.jump}</span>
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTanya("ulang")}>
          <ArrowsClockwiseIcon size={16} aria-hidden="true" />
          <span className="btn__label">{t.ulang}</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setTanya("samakan")}
        >
          <ArrowsLeftRightIcon size={16} aria-hidden="true" />
          <span className="btn__label">{t.samakan}</span>
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => setGalat(!!(await latihanKeluar(awalan(lang))))}
        >
          <span className="btn__label">{t.leave}</span>
        </button>
      </div>
      <Confirm
        open={lompat}
        onOpenChange={setLompat}
        title={t.jumpTitle}
        body={t.jumpBody}
        confirmLabel={t.jumpYes}
        cancelLabel={t.cancel}
        tone="primary"
        lang={lang}
        onConfirm={async () => !(await latihanLompat(tahap, awalan(lang)))}
      >
        <Dropdown
          id="lat-tahap"
          label={t.jumpPick}
          options={STAGES.map((s) => ({
            value: s,
            label: REC[lang].stage[s],
          }))}
          value={tahap}
          onChange={(v) => setTahap(v as StageKey)}
        />
        <span className="hint">{t.jumpHint}</span>
      </Confirm>
      <KonfirmasiReset lang={lang} aksi={tanya} onClose={() => setTanya(null)} />
    </div>
  );
}

/** The card on Ringkasan: what it is, the counts, and the way in. */
export function LatihanCard({ lang }: { lang: Lang }) {
  const t = LAT[lang];
  const mode = useLatihanMode();
  const ringkas = useLatihanRingkas(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [tanya, setTanya] = useState<AksiReset | null>(null);
  const r = ringkas.data;
  const masuk = async (as: LatihanMode) => {
    const g = await latihanMasuk(as, awalan(lang));
    setGalat(g ? (isFail(g) && g.kode === "tidak_ada_edisi" ? t.noEdition : t.failed) : null);
  };
  const siapkan = async () => {
    const g = await latihanSiapkan();
    if (isFail(g)) return setGalat(g.kode === "tidak_ada_edisi" ? t.noEdition : t.failed);
    setGalat(null);
    ringkas.refresh();
    window.Toast?.show(t.prepared(g.latihan.asisten));
  };
  return (
    <section className="panel lat-card" data-on={mode ? "yes" : "no"}>
      <div className="panel__head">
        <h2 className="panel__title">{t.title}</h2>
        <Pill tone={mode ? "gold" : undefined}>{mode ? t.on : t.off}</Pill>
      </div>
      <span className="hint">{t.cardText}</span>
      <div className="lat-card__stats">
        <div>
          <b className="num">{r?.asisten ?? "-"}</b>
          <small>{t.statAsisten}</small>
        </div>
        <div>
          <b className="num">{r?.siap ? r.caas : "-"}</b>
          <small>{t.statCaas}</small>
        </div>
        <div>
          <b className="num">{r?.siap ? 1 : 0}</b>
          <small>{t.statEdition}</small>
        </div>
      </div>
      {galat && <span className="hint">{galat}</span>}
      <div className="lat-card__row">
        {mode ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={async () => setGalat((await latihanKeluar(awalan(lang))) ? t.failed : null)}
          >
            <SparkleIcon size={18} aria-hidden="true" />
            <span className="btn__label">{t.leaveMenu}</span>
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => void masuk("asisten")}>
            <SparkleIcon size={18} aria-hidden="true" />
            <span className="btn__label">{t.enter}</span>
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => void siapkan()}>
          <UsersThreeIcon size={18} aria-hidden="true" />
          <span className="btn__label">{t.prepare}</span>
        </button>
      </div>
      {r?.siap && (
        <div className="lat-card__row">
          <button type="button" className="btn btn--ghost" onClick={() => setTanya("ulang")}>
            <ArrowsClockwiseIcon size={18} aria-hidden="true" />
            <span className="btn__label">{t.ulang}</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setTanya("samakan")}>
            <ArrowsLeftRightIcon size={18} aria-hidden="true" />
            <span className="btn__label">{t.samakan}</span>
          </button>
        </div>
      )}
      <KonfirmasiReset lang={lang} aksi={tanya} onClose={() => setTanya(null)} />
    </section>
  );
}

/** The Account menu row (Asisten only). */
export function LatihanBaris({ lang, onDone }: { lang: Lang; onDone?: () => void }) {
  const t = LAT[lang];
  const mode = useLatihanMode();
  return (
    <button
      type="button"
      className="acct__row"
      onClick={async () => {
        onDone?.();
        if (mode) await latihanKeluar(awalan(lang));
        else await latihanMasuk("asisten", awalan(lang));
      }}
    >
      <span>{mode ? t.leaveMenu : t.enterMenu}</span>
      <SparkleIcon size={20} aria-hidden="true" />
    </button>
  );
}
