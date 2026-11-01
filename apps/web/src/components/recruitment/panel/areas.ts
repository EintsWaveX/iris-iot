/**
 * One colour and one icon per panel area, so a glance says where you are
 * (the mockup's N7.AREA). The page header, the navbar's underline and the
 * tab swap all read it; --tc on .rec-page carries the colour down.
 */
import type { ComponentType } from "react";
import {
  CalendarBlankIcon,
  ChatsCircleIcon,
  ClipboardTextIcon,
  FileTextIcon,
  CpuIcon,
  GraduationCapIcon,
  ListChecksIcon,
  MapPinIcon,
  ScissorsIcon,
  SealCheckIcon,
  TimerIcon,
  UsersThreeIcon,
  type IconProps,
} from "@phosphor-icons/react";
import type { PanelTab } from "../../../lib/recruitment/panel-tab";

export interface Area {
  c: string;
  icon: ComponentType<IconProps>;
}

export const AREA: Record<PanelTab, Area> = {
  ringkasan: { c: "#7dd3fc", icon: ClipboardTextIcon },
  kalender: { c: "#7dd3fc", icon: CalendarBlankIcon },
  kandidat: { c: "#5eead4", icon: ListChecksIcon },
  cutting: { c: "#5eead4", icon: ScissorsIcon },
  plotting: { c: "#5eead4", icon: MapPinIcon },
  tes: { c: "#8fb0ff", icon: TimerIcon },
  bank: { c: "#8fb0ff", icon: FileTextIcon },
  wawancara: { c: "#8fb0ff", icon: ChatsCircleIcon },
  mengajar: { c: "#8fb0ff", icon: GraduationCapIcon },
  tubes: { c: "#8fb0ff", icon: CpuIcon },
  penerimaan: { c: "#e879f9", icon: SealCheckIcon },
  panitia: { c: "#7dd3fc", icon: UsersThreeIcon },
};

/** The order the tabs sit in, which says which way a swap slides (the mockup's ORDER). */
export const AREA_ORDER: PanelTab[] = [
  "ringkasan",
  "kalender",
  "kandidat",
  "cutting",
  "plotting",
  "tes",
  "bank",
  "wawancara",
  "tubes",
  "mengajar",
  "penerimaan",
  "panitia",
];
