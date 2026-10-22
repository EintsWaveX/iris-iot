/**
 * Kirim ke SeeLabs: how the robot puts a session's scores into SeeLabs and
 * reads them back. The scores go from the Score Table (Kirim Nilai) and the
 * robot does the rest, so this page explains it, and holds the one choice
 * that has to be made here: the lender's account for a group that needs one
 * ("Pilih Akun SeeLabs" on the banner and the Konsol home lands on it).
 */
import BackButton from "../../ui/BackButton";
import type { Lang } from "../../../lib/kelas";
import AkunPanel from "./AkunPicker";
import type { SeelabsData } from "./data";
import RobotGuide from "./RobotGuide";
import { SL } from "./strings";
import "./seelabs.css";

export default function SeelabsView({
  lang,
  onBack,
  backLabel,
  seelabs = null,
  meNim = "",
  onChanged,
}: {
  lang: Lang;
  onBack: () => void;
  backLabel?: string;
  /** This session's SeeLabs data, for the lender picker. */
  seelabs?: SeelabsData | null;
  meNim?: string;
  onChanged?: () => void;
}) {
  const t = SL[lang];
  return (
    <div className="seeview">
      <BackButton lang={lang} label={backLabel ?? t.back} onClick={onBack} />
      <div className="page-header__heading">
        <h1 className="page-header__title">{t.title}</h1>
      </div>
      <AkunPanel lang={lang} seelabs={seelabs} meNim={meNim} onChanged={onChanged ?? (() => {})} />
      <RobotGuide lang={lang} />
    </div>
  );
}
