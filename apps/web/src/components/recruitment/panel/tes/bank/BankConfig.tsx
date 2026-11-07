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
  capsOf,
  dealtCount,
  dealtPoints,
  maxWithBonus,
  spreadDraw,
} from "../../../../../lib/recruitment/exam-config";
import {
  PHASE1_PARTS,
  TIERS,
  TOTAL_SCORE,
  type ExamConfig,
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
  const caps = capsOf(cfg);
  const max = maxWithBonus(cfg);

  const setLive = (patch: Partial<ExamConfig["livecode"]>) =>
    setCfg({ ...cfg, livecode: { ...cfg.livecode, ...patch } });
  const setShares = (part: Phase1Part, v: number) => {
    // The other two parts keep their ratio and the last one takes the rest, so the three always add up to 100
    const rest = PHASE1_PARTS.filter((p) => p !== part);
    const left = 100 - v;
    const a = rest[0];
    const b = rest[1];
    const sa = cfg.shares[a];
    const sb = cfg.shares[b];
    const na = sa + sb === 0 ? Math.floor(left / 2) : Math.round((left * sa) / (sa + sb));
    setCfg({ ...cfg, shares: { ...cfg.shares, [part]: v, [a]: na, [b]: left - na } });
  };
  const handPoints = dealtPoints(cfg);
  const scoreOk = handPoints === caps.livecode;

  const total = PHASE1_PARTS.reduce((a, p) => a + cfg.parts[p].minutes, 0) + cfg.livecode.minutes;

  async function simpan() {
    setBusy(true);
    const r = await recPost<{ ok: true }>("exam-config-save", { config: cfg });
    setBusy(false);
    if (isFail(r)) {
      const bad = (r as { errors?: { kode: string }[] }).errors?.[0]?.kode;
      return toast(
        bad ? (t.cfgErr[bad] ?? t.cfgErr.other) : (t.err[r.kode] ?? t.err.other),
        "danger",
      );
    }
    toast(t.cfgSaved);
    refresh();
  }

  const pair = (p: Phase1Part) => {
    const c = cfg.parts[p];
    return (
      <span className="r3cfg__pair">
        <Stepper
          value={c.shown}
          min={1}
          max={c.pool}
          disabled={lock}
          label={`${t.parts[p]} ${t.cfgShown}`}
          lessLabel={t.stepLess}
          moreLabel={t.stepMore}
          onChange={(v) => !lock && setPart(p, { shown: v })}
        />
        <span className="hint">/</span>
        <Stepper
          value={c.pool}
          min={c.shown}
          max={60}
          label={`${t.parts[p]} ${t.cfgTarget}`}
          disabled={lock}
          lessLabel={t.stepLess}
          moreLabel={t.stepMore}
          onChange={(v) => !lock && setPart(p, { pool: v })}
        />
      </span>
    );
  };

  const pointsLabel = (tier: (typeof TIERS)[number]) =>
    tier === "easy" ? t.cfgPointsEasy : tier === "medium" ? t.cfgPointsMedium : t.cfgPointsHard;
  const drawLabel = (tier: (typeof TIERS)[number]) =>
    tier === "easy" ? t.cfgDrawEasy : tier === "medium" ? t.cfgDrawMedium : t.cfgDrawHard;
  const bonusStep = (label: string, value: number, on: (v: number) => void) => (
    <Stepper
      value={value}
      min={0}
      max={60}
      label={label}
      fmt={(n) => (n === 0 ? t.cfgBonusOff : t.cfgBonusFmt(n))}
      disabled={lock}
      lessLabel={t.stepLess}
      moreLabel={t.stepMore}
      onChange={(v) => !lock && on(v)}
    />
  );

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
                <th>{t.cfgShownTarget}</th>
                <th>{t.cfgMax}</th>
                <th title={t.cfgBonusTip}>{t.cfgBonus}</th>
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
                  <td data-l={t.cfgShownTarget}>{pair(p)}</td>
                  <td className="num r3cfg__max" data-l={t.cfgMax}>
                    <b>{max.parts[p]}</b>
                    <span className="hint r3cfg__base">{t.cfgMaxBase(caps.parts[p])}</span>
                  </td>
                  <td data-l={t.cfgBonus}>
                    {bonusStep(`${t.parts[p]} ${t.cfgBonus}`, cfg.parts[p].bonusMin, (v) =>
                      setPart(p, { bonusMin: v }),
                    )}
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
                <td data-l={t.cfgShownTarget}>
                  <span className="r3cfg__pair">
                    <Stepper
                      value={dealtCount(cfg)}
                      min={1}
                      max={cfg.livecode.pool}
                      disabled={lock}
                      label={`${t.cfgLive} ${t.cfgShown}`}
                      lessLabel={t.stepLess}
                      moreLabel={t.stepMore}
                      onChange={(v) => !lock && setLive({ draw: spreadDraw(v) })}
                    />
                    <span className="hint">/</span>
                    <Stepper
                      value={cfg.livecode.pool}
                      min={dealtCount(cfg)}
                      max={100}
                      label={`${t.cfgLive} ${t.cfgTarget}`}
                      disabled={lock}
                      lessLabel={t.stepLess}
                      moreLabel={t.stepMore}
                      onChange={(v) => !lock && setLive({ pool: v })}
                    />
                  </span>
                </td>
                <td className="num r3cfg__max" data-l={t.cfgMax}>
                  <b>{max.livecode}</b>
                  <span className="hint r3cfg__base">{t.cfgMaxBase(caps.livecode)}</span>
                </td>
                <td data-l={t.cfgBonus}>
                  {bonusStep(`${t.cfgLive} ${t.cfgBonus}`, cfg.livecode.bonusMin, (v) =>
                    setLive({ bonusMin: v }),
                  )}
                </td>
              </tr>
              <tr style={{ cursor: "default" }} className="r3cfg__total">
                <td>
                  <b>{t.cfgTotal}</b>
                </td>
                <td className="num" data-l={t.cfgMinutes}>
                  <b>{t.minutes(total)}</b>
                </td>
                <td className="num" data-l={t.cfgShownTarget}>
                  <b>{PHASE1_PARTS.reduce((a, p) => a + cfg.parts[p].shown, dealtCount(cfg))}</b>
                  <span className="hint"> / </span>
                  <b>{PHASE1_PARTS.reduce((a, p) => a + cfg.parts[p].pool, cfg.livecode.pool)}</b>
                </td>
                <td className="num r3cfg__max" data-l={t.cfgMax}>
                  <b>{max.total}</b>
                  <span className="hint r3cfg__base">{t.cfgMaxBase(caps.total)}</span>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="hint r3cfg__note">{t.cfgMaxNote}</p>
        <p className="hint r3cfg__note">{t.cfgTotalNote}</p>
      </section>
      <section className="panel r3cfg__score" data-ok={scoreOk ? "yes" : "no"}>
        <div className="stack" style={{ gap: 2 }}>
          <b>{t.cfgScoreTitle}</b>
          <span className="hint">{t.cfgScoreBody}</span>
        </div>
        <div className="r3cfg__grid">
          <label className="stack stack--sm">
            <span className="label-caps">{t.cfgWeightWritten}</span>
            <Stepper
              value={cfg.weights.written}
              min={10}
              max={90}
              step={5}
              label={t.cfgWeightWritten}
              fmt={(n) => `${n}% · ${Math.round((TOTAL_SCORE * n) / 100)} ${t.ptsUnit}`}
              disabled={lock}
              lessLabel={t.stepLess}
              moreLabel={t.stepMore}
              onChange={(v) =>
                !lock && setCfg({ ...cfg, weights: { written: v, livecode: 100 - v } })
              }
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.cfgWeightLive}</span>
            <Stepper
              value={cfg.weights.livecode}
              min={10}
              max={90}
              step={5}
              label={t.cfgWeightLive}
              fmt={(n) => `${n}% · ${Math.round((TOTAL_SCORE * n) / 100)} ${t.ptsUnit}`}
              disabled={lock}
              lessLabel={t.stepLess}
              moreLabel={t.stepMore}
              onChange={(v) =>
                !lock && setCfg({ ...cfg, weights: { written: 100 - v, livecode: v } })
              }
            />
          </label>
          {PHASE1_PARTS.map((p) => (
            <label key={p} className="stack stack--sm">
              <span className="label-caps">
                {t.cfgShare}: {t.parts[p]}
              </span>
              <Stepper
                value={cfg.shares[p]}
                min={0}
                max={100}
                step={5}
                label={`${t.cfgShare} ${t.parts[p]}`}
                fmt={(n) => `${n}% · ${Math.round((caps.written * n) / 100)} ${t.ptsUnit}`}
                disabled={lock}
                lessLabel={t.stepLess}
                moreLabel={t.stepMore}
                onChange={(v) => !lock && setShares(p, v)}
              />
            </label>
          ))}
          {TIERS.map((tier) => (
            <label key={`pts-${tier}`} className="stack stack--sm">
              <span className="label-caps">{pointsLabel(tier)}</span>
              <Stepper
                value={cfg.livecode.points[tier]}
                min={50}
                max={2400}
                step={50}
                label={pointsLabel(tier)}
                disabled={lock}
                lessLabel={t.stepLess}
                moreLabel={t.stepMore}
                onChange={(v) =>
                  !lock && setLive({ points: { ...cfg.livecode.points, [tier]: v } })
                }
              />
            </label>
          ))}
          {TIERS.map((tier) => (
            <label key={`draw-${tier}`} className="stack stack--sm">
              <span className="label-caps">{drawLabel(tier)}</span>
              <Stepper
                value={cfg.livecode.draw[tier]}
                min={0}
                max={10}
                label={drawLabel(tier)}
                disabled={lock}
                lessLabel={t.stepLess}
                moreLabel={t.stepMore}
                onChange={(v) => !lock && setLive({ draw: { ...cfg.livecode.draw, [tier]: v } })}
              />
            </label>
          ))}
          <label className="stack stack--sm">
            <span className="label-caps">{t.cfgRunLimit}</span>
            <Stepper
              value={cfg.livecode.runLimit}
              min={0}
              max={100}
              label={t.cfgRunLimit}
              fmt={(n) => (n === 0 ? t.cfgRunLimitNone : String(n))}
              disabled={lock}
              lessLabel={t.stepLess}
              moreLabel={t.stepMore}
              onChange={(v) => !lock && setLive({ runLimit: v })}
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.cfgPenaltyFree}</span>
            <Stepper
              value={cfg.livecode.penaltyFree}
              min={0}
              max={20}
              label={t.cfgPenaltyFree}
              disabled={lock}
              lessLabel={t.stepLess}
              moreLabel={t.stepMore}
              onChange={(v) => !lock && setLive({ penaltyFree: v })}
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.cfgPenaltyStep}</span>
            <Stepper
              value={cfg.livecode.penaltyStep}
              min={0}
              max={50}
              label={t.cfgPenaltyStep}
              fmt={(n) => (n === 0 ? t.cfgPenaltyNone : `${n}%`)}
              disabled={lock}
              lessLabel={t.stepLess}
              moreLabel={t.stepMore}
              onChange={(v) =>
                !lock &&
                setLive({
                  penaltyStep: v,
                  penaltyMax: Math.max(cfg.livecode.penaltyMax, v),
                })
              }
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.cfgPenaltyMax}</span>
            <Stepper
              value={cfg.livecode.penaltyMax}
              min={cfg.livecode.penaltyStep}
              max={100}
              step={5}
              label={t.cfgPenaltyMax}
              fmt={(n) => `${n}%`}
              disabled={lock || cfg.livecode.penaltyStep === 0}
              lessLabel={t.stepLess}
              moreLabel={t.stepMore}
              onChange={(v) => !lock && setLive({ penaltyMax: v })}
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.cfgWorkers}</span>
            <Stepper
              value={cfg.livecode.workers}
              min={1}
              max={16}
              label={t.cfgWorkers}
              disabled={lock}
              lessLabel={t.stepLess}
              moreLabel={t.stepMore}
              onChange={(v) => !lock && setLive({ workers: v })}
            />
          </label>
        </div>
        <p className="hint r3cfg__penalty">
          {t.cfgPenaltyBody(
            cfg.livecode.penaltyFree,
            cfg.livecode.penaltyStep,
            cfg.livecode.penaltyMax,
          )}
        </p>
        <p className="hint r3cfg__sum" role="status" data-ok={scoreOk ? "yes" : "no"}>
          {t.cfgScoreSum(caps.livecode, handPoints)} {scoreOk ? t.cfgScoreOk : t.cfgScoreOff}
        </p>
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
