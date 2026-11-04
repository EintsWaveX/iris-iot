/**
 * The Tubes tab of the Panitia (R5): four sections, one job each. Topik dan
 * Brief (Akademik), Tim dan Malam (teams, the lock, the lab evenings and who
 * came), Pengumpulan (what each team handed in) and Presentasi (the order,
 * the tables' examiners and the sheets). Live on `rectubes`.
 */
import type { Lang } from "../../../lib/kelas";
import type { RecRights } from "../../../lib/recruitment/types";
import { useTubesBoard } from "../../../lib/recruitment/tubes-client";
import { useUrlState } from "../../../lib/recruitment/url-state";
import TabLine from "../../ui/TabLine";
import KumpulSection from "./KumpulSection";
import PresentasiSection from "./PresentasiSection";
import TimSection from "./TimSection";
import TopikSection from "./TopikSection";
import { useCtx } from "./panelShared";
import { TUBES } from "./tubesStrings";
import Skeleton from "../../ui/Skeleton";
import "../recruitment-tubes.css";

type Sec = "topik" | "tim" | "kumpul" | "presentasi";
const SECS: Sec[] = ["topik", "tim", "kumpul", "presentasi"];

export default function TubesTab({ lang, rights }: { lang: Lang; rights: RecRights | null }) {
  const q = useTubesBoard(true);
  const [sec, setSec] = useUrlState<Sec>("tb", "topik", SECS);
  const w = TUBES[lang].panel;
  const b = q.data;
  const c = useCtx(lang, b ?? ({} as never), q.refresh);
  if (!b) return <Skeleton height={360} />;
  const cc = { ...c, b };
  return (
    <div className="tp n7-plot" style={{ "--sc": "#a3e635" } as React.CSSProperties}>
      <div className="n7-bar">
        <TabLine
          label={w.title}
          value={sec}
          onChange={(v) => setSec(v)}
          tabs={SECS.map((k) => ({ v: k, label: w.sections[k] }))}
        />
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
