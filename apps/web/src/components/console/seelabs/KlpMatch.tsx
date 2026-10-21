/**
 * Preparation › Cocokkan KLP (Phase 9 Stage 3g): gives each roster group its
 * SeeLabs KLP number. The list is the robot's last Kelompok pull; each group
 * takes the KLP sharing the most NIMs with it. Nothing is saved here: the
 * roster's own Save keeps it.
 */
import { useMemo, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { getJson } from "../../../lib/app";
import { RB } from "./robotStrings";
import { kapanRobot } from "./SeelabsRobotCard";
import Dialog from "../../ui/Dialog";
import Pill from "../../ui/Pill";
import { kelompokLabel } from "../../../lib/labels";
import type { Lang } from "../../../lib/kelas";
import { bedaKlp, cocokkanKlp, type KlpSeelabs } from "../../../lib/seelabs";
import { SL } from "./strings";
import "./seelabs.css";

export default function KlpMatch({
  open,
  onOpenChange,
  lang,
  groups,
  nama,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lang: Lang;
  groups: { nomor: number; nim: string[]; klp: string | null }[];
  /** A NIM's name, from the semester's Praktikan list. */
  nama?: (nim: string) => string | undefined;
  onApply: (klp: Map<number, string>) => void;
}) {
  const t = SL[lang];
  const [daftar, setDaftar] = useState<KlpSeelabs[]>([]);
  // The yellow row whose differing NIMs are open (2026-10-18).
  const [cek, setCek] = useState<number | null>(null);
  const kelompokOf = (nim: string) => groups.find((g) => g.nim.includes(nim))?.nomor ?? null;
  const orang = (nim: string) => (
    <>
      <span className="mono">{nim}</span>
      {nama?.(nim) && <span>{nama(nim)}</span>}
    </>
  );
  const hasil = useMemo(
    () =>
      cocokkanKlp(
        groups.filter((g) => g.nim.length > 0),
        daftar,
      ),
    [groups, daftar],
  );
  const cocok = hasil.filter((h) => h.klp);

  // Phase 14: the robot's last Kelompok pull.
  async function fromRobot() {
    const rb = RB[lang];
    const d = await getJson<{
      ok: boolean;
      pada: string | null;
      kelompok: Record<string, { klp: number; anggota: { nim: string }[] }[]> | null;
    }>("/api/session/robot?kelompok=1").catch(() => null);
    if (!d?.ok || !d.kelompok || !d.pada) {
      window.Toast?.show(rb.klpRobotNone, "warn");
      return;
    }
    setDaftar(
      Object.values(d.kelompok)
        .flat()
        .map((g) => ({ klp: String(g.klp), nim: g.anggota.map((a) => a.nim) })),
    );
    window.Toast?.show(rb.klpRobotAt(kapanRobot(d.pada, lang)), "ok");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDaftar([]);
          setCek(null);
        }
        onOpenChange(o);
      }}
      title={t.matchTitle}
      description={t.matchSub}
      size="lg"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.close}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={cocok.length === 0}
            onClick={() => {
              onApply(new Map(cocok.map((h) => [h.nomor, h.klp!])));
              window.Toast?.show(t.matchApplied, "ok");
              setDaftar([]);
              onOpenChange(false);
            }}
          >
            {t.matchApply}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row row--between">
          <span className="hint">{daftar.length ? t.matchRead(daftar.length) : t.matchNone}</span>
          <button type="button" className="btn btn--sm" onClick={() => void fromRobot()}>
            {RB[lang].klpFromRobot}
          </button>
        </div>
        {daftar.length > 0 && (
          <ul className="klpmatch">
            {hasil.map((h) => {
              const g = groups.find((x) => x.nomor === h.nomor);
              const lama = g?.klp ?? null;
              const kuning = !!h.klp && h.cocok < h.total;
              const beda = kuning && cek === h.nomor ? bedaKlp(g?.nim ?? [], h.klp!, daftar) : null;
              return (
                <li key={h.nomor}>
                  <Pill group={h.nomor}>{kelompokLabel(h.nomor, lang)}</Pill>
                  <span className="grow">
                    {h.klp ? (
                      <>
                        <b className="mono">{t.klpChip(h.klp)}</b>
                        {lama && lama !== h.klp && (
                          <>
                            {" "}
                            <s className="hint mono">{t.klpChip(lama)}</s>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="hint">{t.matchNoKlp}</span>
                    )}
                  </span>
                  {h.klp && (
                    <Pill tone={h.cocok === h.total ? "ok" : "warn"}>
                      {t.matchRow(h.cocok, h.total)}
                    </Pill>
                  )}
                  {kuning && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-expanded={cek === h.nomor}
                      onClick={() => setCek(cek === h.nomor ? null : h.nomor)}
                    >
                      {t.matchCek}
                      <CaretDownIcon
                        size={16}
                        weight="bold"
                        className="btn__turn"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  {beda && (
                    <div className="klpmatch__beda">
                      {beda.hanyaIris.length > 0 && (
                        <div className="stack stack--sm">
                          <b>{t.matchHanyaIris(h.klp!)}</b>
                          <ul>
                            {beda.hanyaIris.map((x) => (
                              <li key={x.nim}>
                                {orang(x.nim)}
                                <span className="hint">
                                  {x.diKlp ? t.matchDiKlp(x.diKlp) : t.matchTanpaKlp}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {beda.hanyaSeelabs.length > 0 && (
                        <div className="stack stack--sm">
                          <b>{t.matchHanyaSeelabs(h.klp!)}</b>
                          <ul>
                            {beda.hanyaSeelabs.map((nim) => {
                              const di = kelompokOf(nim);
                              return (
                                <li key={nim}>
                                  {orang(nim)}
                                  <span className="hint">
                                    {di !== null
                                      ? t.matchDiKelompok(kelompokLabel(di, lang))
                                      : t.matchTanpaKelompok}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
