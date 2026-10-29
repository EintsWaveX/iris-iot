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
import { capsOf } from "../../../../../lib/recruitment/exam-config";
import {
  PHASE1_PARTS,
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

  const total = PHASE1_PARTS.reduce((a, p) => a + cfg.parts[p].minutes, 0) + cfg.livecode.minutes;

  async function simpan() {
    setBusy(true);
    const r = await recPost<{ ok: true }>("exam-config-save", { config: cfg });
    setBusy(false);
    if (isFail(r)) return toast(t.err[r.kode] ?? t.err.other, "danger");
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
                  <td className="num hint" data-l={t.cfgMax}>
                    {caps.parts[p]}
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
                <td>
                  <span className="hint">{t.cfgLiveBody}</span>
                </td>
                <td className="num hint" data-l={t.cfgMax}>
                  {caps.livecode}
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
