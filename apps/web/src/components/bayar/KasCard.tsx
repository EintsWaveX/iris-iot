/**
 * The Uang Kas card (Phase 9 Stage 6, mockup t-pay "Kas"): this semester's
 * rate with a stepper, an example, per-person exceptions and the rate
 * history. The Bendahara and Admins (the Tim right) change it; everyone
 * else reads it. A new rate counts from its start date only.
 */
import { useState } from "react";
import { LockSimpleIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Disclose from "../ui/Disclose";
import Dropdown from "../ui/Dropdown";
import IconButton from "../ui/IconButton";
import Tooltip from "../ui/Tooltip";
import { DatePicker, Stepper } from "../ui/Controls";
import { tanggalPanjang } from "../../lib/app";
import { pisah, rupiah, TARIF_UNIT_AWAL } from "../../lib/bayar";
import type { Lang } from "../../lib/kelas";
import { kirimBayar, type BayarData } from "./data";
import { B, pesanB } from "./strings";

export default function KasCard({
  lang,
  data,
  bisa,
  nama,
  orang,
  reload,
}: {
  lang: Lang;
  data: BayarData;
  bisa: boolean;
  nama: (nim: string | null) => string;
  orang: { nim: string; label: string }[];
  reload: () => void;
}) {
  const t = B[lang];
  const k = data.kas;
  const [rate, setRate] = useState(k.persen);
  const [ask, setAsk] = useState(false);
  const [exc, setExc] = useState(false);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [why, setWhy] = useState("");
  const [excK, setExcK] = useState(orang[0]?.nim ?? "");
  const [excR, setExcR] = useState(5);
  const [excWhy, setExcWhy] = useState("");
  const terakhir = k.riwayat.at(-1);
  const contoh = pisah(data.tarifUnit.reguler || TARIF_UNIT_AWAL.reguler, rate);
  const pct = (v: number) => `${v}%`;

  async function simpanKas() {
    const r = await kirimBayar({ aksi: "kas", persen: rate, berlakuMulai: from, alasan: why });
    if (!r.ok) {
      window.Toast?.show(pesanB(t, r.kode), "danger");
      return false;
    }
    window.Toast?.show(t.kasSaved(rate), "ok");
    setAsk(false);
    reload();
    return true;
  }

  return (
    <section className="panel kascard">
      <div className="panel__head">
        <h2 className="panel__title">{t.kas}</h2>
        {bisa ? (
          <span className="pill pill--ok">
            <PencilSimpleIcon size={13} aria-hidden="true" />
            {t.canEdit}
          </span>
        ) : (
          <Tooltip label={t.viewOnlyTip}>
            <span className="pill" tabIndex={0}>
              <LockSimpleIcon size={13} aria-hidden="true" />
              {t.viewOnly}
            </span>
          </Tooltip>
        )}
      </div>
      <p className="panel__sub">{t.kasHint}</p>
      <div className="kasrate">
        <div className="stack stack--sm">
          <span className="field__label">{t.kasSemester(B[lang].semester(data.semester))}</span>
          {bisa ? (
            <Stepper
              value={rate}
              min={0}
              max={50}
              onChange={setRate}
              fmt={pct}
              label={t.kasPercent}
              lessLabel="-1%"
              moreLabel="+1%"
            />
          ) : (
            <b className="money num">{pct(k.persen)}</b>
          )}
          {terakhir && (
            <span className="hint">
              {t.kasSince(
                tanggalPanjang(terakhir.berlakuMulai, lang),
                terakhir.oleh ? nama(terakhir.oleh) : "",
              )}
            </span>
          )}
        </div>
        <div className="stack stack--sm kasrate__ex">
          <span className="field__label">{t.kasExample}</span>
          <span className="num">
            {t.kasExampleLine(rupiah(contoh.kotor), rupiah(contoh.kas), rupiah(contoh.bersih))}
          </span>
        </div>
      </div>
      {bisa && rate !== k.persen && (
        <div className="row row--end">
          <button type="button" className="btn btn--ghost" onClick={() => setRate(k.persen)}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setAsk(true)}>
            {t.kasSaveNew}
          </button>
        </div>
      )}
      <div className="stack stack--sm">
        <span className="field__label">{t.exc}</span>
        {k.pengecualian.length === 0 ? (
          <p className="hint">{t.excNone}</p>
        ) : (
          <div className="tabstops tabstops--3">
            {k.pengecualian.map((e) => (
              <div key={e.nim} className="tabstops__row">
                <span className="pill pill--violet">{pct(e.persen)}</span>
                <span className="stack" style={{ gap: 0 }}>
                  <b>{nama(e.nim)}</b>
                  {e.alasan && <span className="hint">{e.alasan}</span>}
                </span>
                {bisa ? (
                  <IconButton
                    icon={TrashIcon}
                    sm
                    kind="ghost"
                    label={t.excRemove}
                    onClick={async () => {
                      const r = await kirimBayar({
                        aksi: "hapus_pengecualian",
                        nim: e.nim,
                        semester: data.semester,
                      });
                      window.Toast?.show(
                        r.ok ? t.excRemoved : pesanB(t, r.kode),
                        r.ok ? "ok" : "danger",
                      );
                      reload();
                    }}
                  />
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        )}
        {bisa && (
          <div className="row row--end">
            <button type="button" className="btn btn--sm" onClick={() => setExc(true)}>
              {t.excAdd}
            </button>
          </div>
        )}
      </div>
      {k.riwayat.length > 0 && (
        <Disclose className="kashist" head={t.history}>
          <div className="tabstops tabstops--3">
            {[...k.riwayat].reverse().map((h) => (
              <div key={h.id} className="tabstops__row">
                <span className="pill">{pct(h.persen)}</span>
                <span className="stack" style={{ gap: 0 }}>
                  <b>{t.histFrom(tanggalPanjang(h.berlakuMulai, lang))}</b>
                  {h.alasan && <span className="hint">{h.alasan}</span>}
                </span>
                <span className="hint">{h.oleh ? nama(h.oleh) : ""}</span>
              </div>
            ))}
          </div>
        </Disclose>
      )}
      <span className="hint">{t.kasRule}</span>

      <Dialog
        open={ask}
        onOpenChange={setAsk}
        title={t.kasAsk}
        description={t.kasAskDesc(k.persen, rate, B[lang].semester(data.semester))}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(false)}>
              {t.cancel}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void simpanKas()}>
              {t.save}
            </button>
          </>
        }
      >
        <div className="bayar-g2">
          <DatePicker id="kas-from" label={t.kasFrom} value={from} onChange={setFrom} lang={lang} />
          <div className="field">
            <label className="field__label" htmlFor="kas-why">
              {t.kasWhy}
            </label>
            <input
              id="kas-why"
              className="field__input"
              value={why}
              placeholder={t.kasWhyPh}
              onChange={(e) => setWhy(e.target.value)}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={exc}
        onOpenChange={setExc}
        title={t.excAddTitle}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setExc(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!excK}
              onClick={async () => {
                const r = await kirimBayar({
                  aksi: "pengecualian",
                  nim: excK,
                  persen: excR,
                  alasan: excWhy,
                  semester: data.semester,
                });
                if (!r.ok) return window.Toast?.show(pesanB(t, r.kode), "danger");
                window.Toast?.show(t.excSaved(nama(excK), excR), "ok");
                setExc(false);
                setExcWhy("");
                reload();
              }}
            >
              {t.save}
            </button>
          </>
        }
      >
        <div className="bayar-g2">
          <Dropdown
            id="exc-who"
            label={t.excWho}
            value={excK}
            onChange={setExcK}
            options={orang.map((o) => ({ value: o.nim, label: o.label }))}
          />
          <div className="field">
            <span className="field__label">{t.excPct}</span>
            <Stepper
              value={excR}
              min={0}
              max={50}
              onChange={setExcR}
              fmt={pct}
              label={t.excPct}
              lessLabel="-1%"
              moreLabel="+1%"
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="field__label" htmlFor="exc-why">
              {t.kasWhy}
            </label>
            <input
              id="exc-why"
              className="field__input"
              value={excWhy}
              onChange={(e) => setExcWhy(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </section>
  );
}
