/**
 * Who runs the site: the lab's identity for the footer, the privacy notice
 * and link previews. Contact channels are shown only when filled in.
 */
import type { Lang } from "./kelas.js";

// ---------- Identity ----------
// ---------- Identity ----------
// ---------- Identity ----------

export const SITE_URL = "https://irisiotlab.com";
export const LAB_SHORT = "IRIS Laboratory";
export const LAB_FULL = "IoT Runtime and Integration System (IRIS) Laboratory";

/** Official channels; an empty value keeps that line off the page */
export const LAB_CONTACT = {
  email: "",
  instagram: "iris__laboratory",
};

/** How long practicum records are kept: one semester (src/lib/retensi.ts) */
export const RETENTION_MONTHS = 6;

/** How long the encrypted nightly backups keep a copy (.github/workflows/backup.yml) */
export const BACKUP_DAYS = 30;

const PLACE: Record<Lang, { unit: string; room: string }> = {
  id: {
    unit: "Divisi ASIC, S1 Teknik Elektro, Fakultas Teknik Elektro, Telkom University",
    room: "Ruang Praktikum di P313, Ruang Asisten di P303, Gedung P (Deli), Telkom University, Bandung",
  },
  en: {
    unit: "ASIC Division, Electrical Engineering, School of Electrical Engineering, Telkom University",
    room: "Practicum Room at P313, Assistant Room at P303, Building P (Deli), Telkom University, Bandung",
  },
  zh: {
    unit: "Telkom University 电气工程学院 电气工程专业 ASIC 部门",
    room: "实验室在 P313，助教室在 P303，Telkom University P 楼（Deli），万隆",
  },
};

// ---------- Identity ----------
// ---------- Identity ----------
// ---------- Identity ----------

export function labPlace(lang: Lang): { unit: string; room: string } {
  return PLACE[lang];
}

export function instagramUrl(): string {
  const handle = LAB_CONTACT.instagram.replace(/^@/, "");
  return handle ? `https://www.instagram.com/${handle}/` : "";
}
