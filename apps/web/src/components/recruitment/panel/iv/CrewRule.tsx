/**
 * "Susunan Tiap Shift" (mockup r4-plot, Slot tab): how many interviewers sit
 * with each CaAs and how many PJ each shift has, as three steppers. They are the
 * same numbers as in the Template tab; a change saves at once through the
 * settings API, like the Template does.
 */
import { useState } from "react";
import { Stepper } from "../../../ui/Controls";
import { dict } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost, useRecSettings } from "../../../../lib/recruitment/client";
import {
  checkTemplate,
  type IvStage,
  type IvTemplate,
} from "../../../../lib/recruitment/interview";
import { STEP } from "./ivStrings";

interface Words {
  title: string;
  hint: string;
  per: string;
  perPanel: string;
  out: string;
  inn: string;
  foot: string;
  saved: string;
  fail: string;
}

const W = dict<Words>({
  id: {
    title: "Susunan Tiap Shift",
    hint: "Bawaan dari template, semuanya bisa diubah: jumlah penguji untuk tiap CaAs atau panel, dan PJ di luar dan di dalam ruangan untuk tiap shift.",
    per: "Pewawancara per CaAs",
    perPanel: "Penguji per panel",
    out: "PJ luar ruangan",
    inn: "PJ dalam ruangan",
    foot: "PJ luar: presensi asisten dan CaAs, briefing, membuka ruangan, kontak PJ. PJ dalam: mengawasi, mendokumentasikan, dan menggantikan penguji yang mendadak tidak hadir. Penguji dipilih dari Asisten aktif; mereka hanya melihat slot dan kandidatnya sendiri, dan kandidat tidak melihat siapa pengujinya.",
    saved: "Susunan tersimpan.",
    fail: "Susunan belum tersimpan. Coba lagi.",
  },
  en: {
    title: "Crew per Shift",
    hint: "Defaults from the template, all adjustable: how many examiners for each CaAs or panel, and the PJ outside and inside the room for every shift.",
    per: "Interviewers per CaAs",
    perPanel: "Examiners per panel",
    out: "PJ outside the room",
    inn: "PJ inside the room",
    foot: "Outside PJ: attendance for assistants and CaAs, the briefing, opening the room, the link to the PJ. Inside PJ: watching, documenting, and standing in for an examiner who suddenly can't come. Examiners come from the active Asisten; they see only their own slots and candidates, and candidates never see who examines them.",
    saved: "Crew saved.",
    fail: "The crew was not saved. Try again.",
  },
  zh: {
    title: "每个时段的人员",
    hint: "沿用模板的默认值，均可调整：每位 CaAs 或每个评审组的考官人数，以及每个时段室外和室内的 PJ 人数。",
    per: "每位 CaAs 的面试官数",
    perPanel: "每个评审组的考官数",
    out: "室外 PJ",
    inn: "室内 PJ",
    foot: "室外 PJ：助教与 CaAs 点名、简报、开门、联络 PJ。室内 PJ：监督、记录，并顶替临时缺席的考官。考官从在职助教中选择；他们只看到自己的场次和候选人，候选人看不到谁在评审他们。",
    saved: "人员已保存。",
    fail: "人员未保存，请重试。",
  },
});

export default function CrewRule({ lang, stage }: { lang: Lang; stage: IvStage }) {
  const w = W[lang];
  const set = useRecSettings(true);
  const view = set.data?.settings.find((s) => s.key === stage) ?? null;
  const saved = view ? (view.value as IvTemplate) : null;
  const [busy, setBusy] = useState(false);
  if (!view || !saved) return null;
  const can = view.canEdit;
  const save = async (patch: Partial<IvTemplate>) => {
    const clean = checkTemplate({ ...saved, ...patch });
    if (!clean) return;
    setBusy(true);
    const r = await recPost<{ ok: true }>("setting-save", { key: stage, value: clean });
    setBusy(false);
    if (isFail(r)) return void window.Toast?.show(w.fail, "danger");
    window.Toast?.show(w.saved, "ok");
    set.refresh();
  };
  const num = (
    label: string,
    v: number,
    min: number,
    max: number,
    patch: (n: number) => Partial<IvTemplate>,
  ) => (
    <label className="stack stack--sm">
      <span className="hint">{label}</span>
      <Stepper
        value={v}
        min={min}
        max={max}
        label={label}
        disabled={!can || busy}
        onChange={(n) => void save(patch(n))}
        {...STEP(lang)}
      />
    </label>
  );
  return (
    <section className="panel r4rule">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="panel__title">{w.title}</h2>
          <span className="hint">{w.hint}</span>
        </div>
      </div>
      <div className="r4rule__g">
        {num(saved.mode === "panel" ? w.perPanel : w.per, saved.per, 1, 8, (n) => ({ per: n }))}
        {num(w.out, saved.pjOut, 0, 6, (n) => ({ pjOut: n }))}
        {num(w.inn, saved.pjIn, 0, 10, (n) => ({ pjIn: n }))}
      </div>
      <span className="hint">{w.foot}</span>
    </section>
  );
}
