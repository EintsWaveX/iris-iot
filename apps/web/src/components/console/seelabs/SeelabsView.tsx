/**
 * Kirim ke SeeLabs: how the robot puts a session's scores into SeeLabs and
 * reads them back. The scores go from the Score Table (Kirim Nilai) and the
 * robot does the rest, so this page only explains it.
 */
import BackButton from "../../ui/BackButton";
import type { Lang } from "../../../lib/kelas";
import RobotGuide from "./RobotGuide";
import { SL } from "./strings";
import "./seelabs.css";

export default function SeelabsView({
  lang,
  onBack,
  backLabel,
}: {
  lang: Lang;
  onBack: () => void;
  backLabel?: string;
}) {
  const t = SL[lang];
  return (
    <div className="seeview">
      <BackButton lang={lang} label={backLabel ?? t.back} onClick={onBack} />
      <div className="page-header__heading">
        <h1 className="page-header__title">{t.title}</h1>
      </div>
      <RobotGuide lang={lang} />
    </div>
  );
}
