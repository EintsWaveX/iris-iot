/**
 * The Tubes tab of the Panitia (R5): four sections, one job each. Topik dan
 * Brief (Akademik), Tim dan Malam (teams, the lock, the lab evenings and who
 * came), Pengumpulan (what each team handed in) and Presentasi (the order,
 * the tables' examiners and the sheets). Live on `rectubes`.
 */
import { useState } from "react";
import type { Lang } from "../../../lib/kelas";
import type { RecRights } from "../../../lib/recruitment/types";
import { useTubesBoard } from "../../../lib/recruitment/tubes-client";
import KumpulSection from "./KumpulSection";
import PresentasiSection from "./PresentasiSection";
import TimSection from "./TimSection";
import TopikSection from "./TopikSection";
import { useCtx } from "./panelShared";
import { TUBES } from "./tubesStrings";
import "../recruitment-tubes.css";

type Sec = "topik" | "tim" | "kumpul" | "presentasi";
const SECS: Sec[] = ["topik", "tim", "kumpul", "presentasi"];

export default function TubesTab({ lang, rights }: { lang: Lang; rights: RecRights | null }) {
  const q = useTubesBoard(true);
  const [sec, setSec] = useState<Sec>("topik");
  const w = TUBES[lang].panel;
  const b = q.data;
  const c = useCtx(lang, b ?? ({} as never), q.refresh);
  if (!b) return <span className="skeleton" style={{ height: 360 }} />;
  const cc = { ...c, b };
  return (
    <div className="tp">
      <div className="tp-bar">
        <div className="tp-seg" role="radiogroup" aria-label={w.title}>
          {SECS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={sec === k}
              className="tp-seg__b"
              onClick={() => setSec(k)}
            >
              {w.sections[k]}
            </button>
          ))}
        </div>
      </div>
      {sec === "topik" ? (
        <TopikSection c={cc} />
      ) : sec === "tim" ? (
        <TimSection c={cc} />
      ) : sec === "kumpul" ? (
        <KumpulSection c={cc} />
      ) : (
        <PresentasiSection c={cc} rights={rights} />
      )}
    </div>
  );
}
