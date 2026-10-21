/**
 * A seat that isn't the default pairing that date (user, 2026-10-21): a
 * cover's badge (violet like the Schedule's cover chips, dashed for a
 * Volunteer) saying whose seat it is, or a Regular's own seat handed over
 * (grey) or excused with nobody covering (amber).
 */
import type { Lang } from "../../lib/kelas";
import { kelompokLabel } from "../../lib/labels";
import type { GantiKursi, KursiSaya } from "../../lib/penugasan-minggu";
import Pill from "./Pill";
import Tooltip from "./Tooltip";

const S = {
  id: {
    pengganti: (k: string | null) => (k ? `Pengganti ${k}` : "Pengganti"),
    sukarela: (k: string | null) => (k ? `Sukarela ${k}` : "Sukarela"),
    gantiTip: (jenis: string, k: string | null) =>
      k
        ? `Bukan pasangan bawaan. Menggantikan ${k} sebagai ${jenis}.`
        : `Bukan pasangan bawaan. Mengisi kursi kosong sebagai ${jenis}.`,
    kind: { pengganti: "Pengganti", sukarela: "Sukarela" },
    lepas: (k: string) => `Diganti ${k}`,
    lepasTip: (k: string) => `Kelompok bawaanmu, dipegang ${k} hari itu.`,
    izin: "Izin",
    izinTip: "Kelompok bawaanmu. Kamu izin dan belum ada pengganti.",
  },
  en: {
    pengganti: (k: string | null) => (k ? `Sub for ${k}` : "Substitute"),
    sukarela: (k: string | null) => (k ? `Volunteer for ${k}` : "Volunteer"),
    gantiTip: (jenis: string, k: string | null) =>
      k
        ? `Not the default pairing. Covering ${k} as a ${jenis}.`
        : `Not the default pairing. Filling an open seat as a ${jenis}.`,
    kind: { pengganti: "Substitute", sukarela: "Volunteer" },
    lepas: (k: string) => `Covered by ${k}`,
    lepasTip: (k: string) => `Your own group, held by ${k} that day.`,
    izin: "Excused",
    izinTip: "Your own group. You're excused and nobody covers it yet.",
  },
  zh: {
    pengganti: (k: string | null) => (k ? `代课 ${k}` : "代课"),
    sukarela: (k: string | null) => (k ? `志愿 ${k}` : "志愿"),
    gantiTip: (jenis: string, k: string | null) =>
      k ? `非默认分配。以${jenis}身份替 ${k} 上课。` : `非默认分配。以${jenis}身份填补空位。`,
    kind: { pengganti: "代课", sukarela: "志愿" },
    lepas: (k: string) => `由 ${k} 代课`,
    lepasTip: (k: string) => `你的固定小组，当天由 ${k} 负责。`,
    izin: "请假",
    izinTip: "你的固定小组。你已请假，暂时没有人代课。",
  },
} as const;

/** `nomor`: name the group too, for a slot with several of mine. */
export function PillGanti({
  ganti,
  lang,
  nomor,
}: {
  ganti: GantiKursi;
  lang: Lang;
  nomor?: number;
}) {
  const t = S[lang];
  return (
    <Tooltip label={t.gantiTip(t.kind[ganti.jenis], ganti.untuk)}>
      <span tabIndex={-1} className="pillganti">
        <Pill tone="violet" className={ganti.jenis === "sukarela" ? "pill--dashed" : undefined}>
          {nomor ? `${kelompokLabel(nomor, lang)} · ` : ""}
          {t[ganti.jenis](ganti.untuk)}
        </Pill>
      </span>
    </Tooltip>
  );
}

/** A "my slots" entry's badge: a cover, or my own seat handed over.
 *  `sebut`: name the group, when the slot has several of mine. */
export function PillKursi({ k, lang, sebut }: { k: KursiSaya; lang: Lang; sebut?: boolean }) {
  const t = S[lang];
  const nomor = sebut ? k.nomor : undefined;
  if (k.ganti) return <PillGanti ganti={k.ganti} lang={lang} nomor={nomor} />;
  if (!k.lepas) return null;
  const awal = nomor ? `${kelompokLabel(nomor, lang)} · ` : "";
  return (
    <Tooltip label={k.lepas.kode ? t.lepasTip(k.lepas.kode) : t.izinTip}>
      <span tabIndex={-1} className="pillganti">
        {k.lepas.kode ? (
          <Pill>{awal + t.lepas(k.lepas.kode)}</Pill>
        ) : (
          <Pill tone="warn">{awal + t.izin}</Pill>
        )}
      </span>
    </Tooltip>
  );
}
