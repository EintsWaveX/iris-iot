/**
 * Preparation › Cocokkan KLP (Phase 9 Stage 3g): gives each roster group its
 * SeeLabs KLP number. The Asisten pastes the bookmarklet's list mode
 * (`IRIS-KLP/1 …`, from SeeLabs' Input Nilai page) or that page's text; each
 * group takes the KLP sharing the most NIMs with it. Nothing is saved here:
 * the roster's own Save keeps it.
 */
import { useMemo, useState } from "react";
import { getJson } from "../../../lib/app";
import { KLP_AWALAN } from "../../../lib/seelabs";
import { RB } from "./robotStrings";
import { kapanRobot } from "./SeelabsRobotCard";
import Dialog from "../../ui/Dialog";
import Pill from "../../ui/Pill";
import { kelompokLabel } from "../../../lib/labels";
import type { Lang } from "../../../lib/kelas";
import { bacaDaftarKlp, cocokkanKlp } from "../../../lib/seelabs";
import { SL } from "./strings";
import "./seelabs.css";

export default function KlpMatch({
  open,
  onOpenChange,
  lang,
  groups,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lang: Lang;
  groups: { nomor: number; nim: string[]; klp: string | null }[];
  onApply: (klp: Map<number, string>) => void;
}) {
  const t = SL[lang];
  const [text, setText] = useState("");
  const daftar = useMemo(() => bacaDaftarKlp(text), [text]);
  const hasil = useMemo(
    () =>
      cocokkanKlp(
        groups.filter((g) => g.nim.length > 0),
        daftar,
      ),
    [groups, daftar],
  );
  const cocok = hasil.filter((h) => h.klp);

  // Phase 14: the robot's last Kelompok pull, as the bookmarklet's list mode.
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
    const kelompok = Object.values(d.kelompok)
      .flat()
      .map((g) => ({ klp: String(g.klp), nim: g.anggota.map((a) => a.nim) }));
    setText(KLP_AWALAN + JSON.stringify({ kelompok }));
    window.Toast?.show(rb.klpRobotAt(kapanRobot(d.pada, lang)), "ok");
  }

  async function fromClipboard() {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      window.Toast?.show(t.copyFail, "warn");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setText("");
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
              setText("");
              onOpenChange(false);
            }}
          >
            {t.matchApply}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{t.matchPaste}</span>
          <textarea
            className="field__input mono"
            rows={4}
            value={text}
            placeholder={t.matchPastePh}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="row row--between">
          <span className="hint">{daftar.length ? t.matchRead(daftar.length) : t.matchNone}</span>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => void fromRobot()}>
              {RB[lang].klpFromRobot}
            </button>
            <button type="button" className="btn btn--sm" onClick={() => void fromClipboard()}>
              {t.matchFromClip}
            </button>
          </span>
        </div>
        {daftar.length > 0 && (
          <ul className="klpmatch">
            {hasil.map((h) => {
              const lama = groups.find((g) => g.nomor === h.nomor)?.klp ?? null;
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
