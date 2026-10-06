/**
 * Read only, and why (2026-10-06). Module Access, Brief, Slides and
 * Schematics change only with the Jadwal right (Kepala Divisi and Inti,
 * lib/hak.ts). Before, every Asisten saw working controls that answered a
 * plain "failed" on save; now the editors show the content without them
 * and say who can change it.
 */
import { LockSimpleIcon } from "@phosphor-icons/react";
import { dict, useMe } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";

const T = dict({
  id: "Hanya bisa dilihat. Mengubahnya butuh hak Jadwal, yang dipegang Kepala Divisi dan Inti.",
  en: "View only. Changing this needs the Schedule right, held by the Division Heads and the Core team.",
  zh: "只能查看。修改需要排班权限，由各部门负责人和核心团队持有。",
});

/** Whether I may change what the Jadwal right guards. */
export function useBolehJadwal(): boolean {
  return useMe()?.hak?.jadwal === true;
}

export default function TanpaHak({ lang }: { lang: Lang }) {
  return (
    <div className="banner banner--lock" role="note">
      <LockSimpleIcon size={20} aria-hidden="true" />
      <span>{T[lang]}</span>
    </div>
  );
}

export const tanpaHakTeks = (lang: Lang) => T[lang];
