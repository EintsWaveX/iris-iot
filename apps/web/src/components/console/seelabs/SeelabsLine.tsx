/** "Kelompok 4 dan 5 belum disimpan di SeeLabs · Buka" (Phase 9 Stage 3g,
 *  mockup c-next), for the after-session screens. Groups without scores
 *  don't count; every group saved reads as done. */
import Pill from "../../ui/Pill";
import { kelompokLabel } from "../../../lib/labels";
import type { Lang } from "../../../lib/kelas";
import type { SeelabsData } from "./data";
import { SL } from "./strings";
import "./seelabs.css";

/** Groups with scores that aren't (or are no longer) saved in SeeLabs. */
export function belumTersimpan(data: SeelabsData | null): number[] {
  return (data?.kelompok ?? [])
    .filter((g) => g.status === "siap" || g.status === "berubah" || g.status === "butuh_akun")
    .map((g) => g.nomor);
}

/** "Kelompok 4 dan 5", "Groups 4 and 5", "第 4 组和第 5 组". */
function daftarKelompok(nomor: number[], lang: Lang): string {
  const t = SL[lang];
  if (lang === "zh") return nomor.map((n) => kelompokLabel(n, lang)).join(t.and);
  const kata = lang === "en" ? (nomor.length > 1 ? "Groups" : "Group") : "Kelompok";
  const angka =
    nomor.length > 1
      ? `${nomor.slice(0, -1).join(", ")} ${t.and} ${nomor[nomor.length - 1]}`
      : String(nomor[0]);
  return `${kata} ${angka}`;
}

export default function SeelabsLine({
  lang,
  data,
  onOpen,
  as: Tag = "li",
}: {
  lang: Lang;
  data: SeelabsData | null;
  onOpen: () => void;
  as?: "li" | "div";
}) {
  const t = SL[lang];
  if (!data) return null;
  const belum = belumTersimpan(data);
  const ada = data.kelompok.some((g) => g.status !== "kosong");
  if (!ada) return null;
  return (
    <Tag className="seeline">
      <Pill tone={belum.length ? "warn" : "ok"}>SeeLabs</Pill>
      <span className="grow">
        {belum.length ? t.notSavedRow(daftarKelompok(belum, lang)) : t.allSavedRow}
      </span>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onOpen}>
        {t.open}
      </button>
    </Tag>
  );
}
