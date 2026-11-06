/**
 * Rollback controls for one CaAs, in the Kandidat sheet (5 Nov 2026): a CaAs
 * who withdrew comes back, or any CaAs is put back at a stage (their outcome
 * from that stage on, and what they did after it, is deleted). Shown to the
 * seats that hold rollback (the cuttingLock right).
 */
import { useState } from "react";
import Confirm from "../../../ui/Confirm";
import Dropdown from "../../../ui/Dropdown";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { STAGES } from "../../../../lib/recruitment/types";
import RollbackDialog, { ringkasCounts } from "./RollbackDialog";
import { RB } from "./rollbackStrings";

export default function CandidateRollback({
  lang,
  id,
  nim,
  nama,
  status,
  onChanged,
}: {
  lang: Lang;
  id: number;
  nim: string;
  nama: string;
  status: string;
  onChanged: () => void;
}) {
  const t = RB[lang];
  const [stage, setStage] = useState<string>("tes_tulis");
  const [reset, setReset] = useState(false);
  const [pulih, setPulih] = useState(false);

  if (status === "withdrawn")
    return (
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPulih(true)}>
          {t.candidate.reinstateButton}
        </button>
        <Confirm
          open={pulih}
          onOpenChange={setPulih}
          title={t.candidate.reinstateTitle}
          body={t.candidate.reinstateBody}
          confirmLabel={t.candidate.reinstateButton}
          tone="primary"
          lang={lang}
          onConfirm={async () => {
            const r = await recPost<{ ok: true }>("candidate-reinstate", { id });
            if (isFail(r)) {
              window.Toast?.show(r.kode === "tanpa_hak" ? t.noRight : t.failed, "danger");
              return false;
            }
            window.Toast?.show(t.candidate.reinstateDone, "ok");
            onChanged();
          }}
        />
      </div>
    );

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <Dropdown
        id={`rb-stage-${id}`}
        label={t.toStage}
        value={stage}
        onChange={setStage}
        options={STAGES.map((s) => ({ value: s, label: t.stage[s] }))}
      />
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReset(true)}>
        {t.candidate.resetButton}
      </button>
      <RollbackDialog
        open={reset}
        onOpenChange={setReset}
        lang={lang}
        aksi="candidate-reset"
        body={{ id, toStage: stage }}
        title={t.candidate.resetTitle(nama, t.stage[stage])}
        intro={t.candidate.resetIntro(t.stage[stage])}
        kata={nim}
        jalankan={t.candidate.resetRun}
        selesai={t.candidate.resetDone}
        ringkas={ringkasCounts as never}
        onDone={onChanged}
      />
    </div>
  );
}
