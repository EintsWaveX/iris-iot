/**
 * Pengaturan (mockup r3-bank): minutes, how many questions a seat is shown
 * and the pool target for each part and language, Live Coding's minutes and
 * the room's budget. It locks when the first real room starts: after that
 * only the budget moves (EXAM-ENGINE 2). Also where the default questions are
 * installed again.
 */
import { useEffect, useState } from "react";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { Stepper } from "../../../../ui/Controls";
import type { Lang } from "../../../../../lib/kelas";
import type { ExamConfigResponse } from "../../../../../lib/recruitment/bank-api";
import { canon } from "../../../../../lib/recruitment/bank-rules";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import {
  PART_CAP,
  PHASE1_PARTS,
  LIVECODE_CAP,
  type ExamConfig,
  type PartCount,
  type Phase1Part,
} from "../../../../../lib/recruitment/exam-types";
import { useBelumSimpan } from "../../../../../lib/belum-simpan";
import { BK } from "./bankStrings";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);

export default function BankConfig({
  lang,
  data,
  refresh,
  seeding,
  onSeed,
}: {
  lang: Lang;
  data: ExamConfigResponse;
  refresh: () => void;
  seeding: boolean;
  onSeed: () => void;
}) {
  const t = BK[lang];
  const [cfg, setCfg] = useState<ExamConfig>(data.config);
  const [busy, setBusy] = useState(false);
  const stored = canon(data.config);
  useEffect(() => setCfg(data.config), [stored]);
  const dirty = canon(cfg) !== stored;
  useBelumSimpan(dirty);
  const lock = data.locked;

  const setPart = (p: Phase1Part, patch: Partial<ExamConfig["parts"][Phase1Part]>) =>
    setCfg({ ...cfg, parts: { ...cfg.parts, [p]: { ...cfg.parts[p], ...patch } } });
  const setCount = (p: Phase1Part, l: "cpp" | "py" | "any", c: PartCount) =>
    setPart(p, { counts: { ...cfg.parts[p].counts, [l]: c } });

  const total = PHASE1_PARTS.reduce((a, p) => a + cfg.parts[p].minutes, 0) + cfg.livecode.minutes;

  async function simpan() {
    setBusy(true);
    const r = await recPost<{ ok: true }>("exam-config-save", { config: cfg });
    setBusy(false);
    if (isFail(r)) return toast(t.err[r.kode] ?? t.err.other, "danger");
    toast(t.cfgSaved);
    refresh();
  }

  const pair = (p: Phase1Part, l: "cpp" | "py" | "any") => {
    const c = cfg.parts[p].counts[l];
    if (!c) return <span className="hint">-</span>;
    return (
      <span className="r3cfg__pair">
        <Stepper
          value={c.shown}
          min={1}
          max={c.pool}
          disabled={lock}
          label={`${t.parts[p]} ${t.langs[l]} ${t.cfgShown}`}
          lessLabel={t.stepLess}
          moreLabel={t.stepMore}
          onChange={(v) => !lock && setCount(p, l, { ...c, shown: v })}
        />
        <span className="hint">/</span>
        <Stepper
          value={c.pool}
          min={c.shown}
          max={60}
          label={`${t.parts[p]} ${t.langs[l]} ${t.cfgTarget}`}
          disabled={lock}
          lessLabel={t.stepLess}
          moreLabel={t.stepMore}
          onChange={(v) => !lock && setCount(p, l, { ...c, pool: v })}
        />
      </span>
    );
  };

  return (
    <div className="stack">
      <div className="rec-note">
        <b>{lock ? t.cfgLockTitle : t.cfgOpenTitle}</b>
        <span>{lock ? t.cfgLockBody : t.cfgOpenBody}</span>
        {lock && (
          <span className="hint r3lockline">
            <LockSimpleIcon size={16} aria-hidden="true" /> {t.cfgLockTitle}
          </span>
        )}
      </div>
      <section className="panel rec-tablecard">
        <div className="scrollx">
          <table className="rec-table r3cfg" data-lock={lock ? "yes" : "no"}>
            <thead>
              <tr>
                <th>{t.cfgPart}</th>
                <th>{t.cfgMinutes}</th>
                <th>{t.cfgCpp}</th>
                <th>{t.cfgPy}</th>
                <th>{t.cfgMax}</th>
              </tr>
            </thead>
            <tbody>
              {PHASE1_PARTS.map((p) => (
                <tr key={p} style={{ cursor: "default" }}>
                  <td>
                    <b>{t.partsLong[p]}</b>
                  </td>
                  <td data-l={t.cfgMinutes}>
                    <Stepper
                      value={cfg.parts[p].minutes}
                      min={1}
                      max={60}
                      label={`${t.parts[p]} ${t.cfgMinutes}`}
                      disabled={lock}
                      lessLabel={t.stepLess}
                      moreLabel={t.stepMore}
                      onChange={(v) => !lock && setPart(p, { minutes: v })}
                    />
                  </td>
                  {cfg.parts[p].counts.any ? (
                    <td colSpan={2} data-l={t.cfgShownTarget}>
                      <span className="r3cfg__pair">
                        <span className="hint">{t.cfgEither}</span>
                        {pair(p, "any")}
                      </span>
                    </td>
                  ) : (
                    <>
                      <td data-l={t.cfgCpp}>{pair(p, "cpp")}</td>
                      <td data-l={t.cfgPy}>{pair(p, "py")}</td>
                    </>
                  )}
                  <td className="num hint" data-l={t.cfgMax}>
                    {PART_CAP[p]}
                  </td>
                </tr>
              ))}
              <tr style={{ cursor: "default" }}>
                <td>
                  <b>{t.cfgLive}</b>
                </td>
                <td data-l={t.cfgMinutes}>
                  <Stepper
                    value={cfg.livecode.minutes}
                    min={10}
                    max={120}
                    label={`${t.cfgLive} ${t.cfgMinutes}`}
                    disabled={lock}
                    lessLabel={t.stepLess}
                    moreLabel={t.stepMore}
                    onChange={(v) =>
                      !lock && setCfg({ ...cfg, livecode: { ...cfg.livecode, minutes: v } })
                    }
                  />
                </td>
                <td colSpan={2}>
                  <span className="hint">{t.cfgLiveBody}</span>
                </td>
                <td className="num hint" data-l={t.cfgMax}>
                  {LIVECODE_CAP}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel r3cfg__foot">
        <div className="stack" style={{ gap: 2 }}>
          <b>{t.cfgBudget}</b>
          <span className="hint">{t.cfgBudgetBody(total)}</span>
        </div>
        <Stepper
          value={cfg.budgetMin}
          min={60}
          max={240}
          step={5}
          label={t.cfgBudgetAria}
          fmt={t.minutes}
          lessLabel={t.stepLess}
          moreLabel={t.stepMore}
          onChange={(v) => setCfg({ ...cfg, budgetMin: v })}
        />
        <button
          type="button"
          className="btn btn--primary"
          disabled={!dirty || busy}
          onClick={() => void simpan()}
        >
          {busy ? t.saving : t.cfgSave}
        </button>
      </section>
      <section className="panel r3cfg__foot">
        <div className="stack" style={{ gap: 2 }}>
          <b>{t.cfgSeedTitle}</b>
          <span className="hint">{t.cfgSeedBody}</span>
        </div>
        <button type="button" className="btn btn--inverse" disabled={seeding} onClick={onSeed}>
          {seeding ? t.seedBusy : t.seed}
        </button>
      </section>
    </div>
  );
}
