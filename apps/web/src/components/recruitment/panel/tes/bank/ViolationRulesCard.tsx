/**
 * Aturan Pelanggaran (9 Nov 2026), a card of Pengaturan: which violations count and how heavy each
 * is, the points forgiven, the cut a point suggests, when the candidate is warned and how many
 * strikes are stored per part. Locked with the rest of the config when the first real room starts.
 */
import { Stepper, Switch } from "../../../../ui/Controls";
import type { ExamConfig, ViolationRules } from "../../../../../lib/recruitment/exam-types";
import { STRIKE_KINDS } from "../../../../../lib/recruitment/seat-lockdown";
import type { BK } from "./bankStrings";

type Text = (typeof BK)["id"];

export default function ViolationRulesCard({
  t,
  cfg,
  setCfg,
  lock,
}: {
  t: Text;
  cfg: ExamConfig;
  setCfg: (c: ExamConfig) => void;
  lock: boolean;
}) {
  const v = cfg.violations;
  const set = (patch: Partial<ViolationRules>) =>
    setCfg({ ...cfg, violations: { ...v, ...patch } });
  const step = (
    label: string,
    value: number,
    min: number,
    max: number,
    on: (n: number) => void,
    o: { step?: number; fmt?: (n: number) => string; off?: boolean } = {},
  ) => (
    <label className="stack stack--sm">
      <span className="label-caps">{label}</span>
      <Stepper
        value={value}
        min={min}
        max={max}
        step={o.step}
        label={label}
        fmt={o.fmt}
        disabled={lock || o.off}
        lessLabel={t.stepLess}
        moreLabel={t.stepMore}
        onChange={(n) => !lock && on(n)}
      />
    </label>
  );
  const warn = (i: 0 | 1 | 2, label: string) =>
    step(label, v.warnAt[i], 1, 200, (n) => {
      // The three thresholds stay in order: moving one pushes the others along
      const w: [number, number, number] = [...v.warnAt];
      w[i] = n;
      for (let j = i + 1; j < 3; j++) w[j] = Math.max(w[j], w[j - 1] + 1);
      for (let j = i - 1; j >= 0; j--) w[j] = Math.min(w[j], w[j + 1] - 1);
      set({ warnAt: [Math.max(1, w[0]), w[1], w[2]] });
    });
  return (
    <section className="panel r3cfg__score r3cfg__vio">
      <div className="stack" style={{ gap: 2 }}>
        <b>{t.vioTitle}</b>
        <span className="hint">{t.vioBody}</span>
      </div>
      <div className="scrollx">
        <table className="rec-table r3cfg" data-lock={lock ? "yes" : "no"}>
          <thead>
            <tr>
              <th>{t.vioKind}</th>
              <th>{t.vioCounts}</th>
              <th>{t.vioWeight}</th>
            </tr>
          </thead>
          <tbody>
            {STRIKE_KINDS.map((k) => (
              <tr key={k} style={{ cursor: "default" }}>
                <td>{t.vioKinds[k] ?? k}</td>
                <td data-l={t.vioCounts}>
                  <Switch
                    on={v.kinds[k].counts}
                    label={`${t.vioKinds[k] ?? k}: ${t.vioCounts}`}
                    disabled={lock}
                    onChange={(on) =>
                      set({ kinds: { ...v.kinds, [k]: { ...v.kinds[k], counts: on } } })
                    }
                  />
                </td>
                <td data-l={t.vioWeight}>
                  <Stepper
                    value={v.kinds[k].weight}
                    min={0}
                    max={5}
                    label={`${t.vioKinds[k] ?? k}: ${t.vioWeight}`}
                    disabled={lock || !v.kinds[k].counts}
                    lessLabel={t.stepLess}
                    moreLabel={t.stepMore}
                    onChange={(n) =>
                      !lock && set({ kinds: { ...v.kinds, [k]: { ...v.kinds[k], weight: n } } })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="r3cfg__grid">
        {step(t.vioFree, v.free, 0, 50, (n) => set({ free: n }))}
        {step(t.vioStep, v.step, 0, 50, (n) => set({ step: n, max: Math.max(v.max, n) }), {
          fmt: (n) => (n === 0 ? t.vioNoCut : `${n}%`),
        })}
        {step(t.vioMax, v.max, v.step, 100, (n) => set({ max: n }), {
          step: 5,
          fmt: (n) => `${n}%`,
          off: v.step === 0,
        })}
        {warn(0, t.vioWarn1)}
        {warn(1, t.vioWarn2)}
        {warn(2, t.vioWarn3)}
        {step(t.vioCap, v.capPerPart, 10, 500, (n) => set({ capPerPart: n }), { step: 10 })}
      </div>
      <p className="hint r3cfg__penalty">{t.vioSummary(v.free, v.step, v.max, v.warnAt)}</p>
    </section>
  );
}
