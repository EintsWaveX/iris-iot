/**
 * The four tools under a CaAs's top card (mockup n7-caas): Jadwalku, Berkasku,
 * Amplop and Mundur. Each opens a centered dialog; the badge says when
 * something waits for them. Phone first, two across at 390px.
 */
import type { ComponentType } from "react";
import {
  CalendarCheckIcon,
  EnvelopeSimpleIcon,
  FolderOpenIcon,
  SignOutIcon,
} from "@phosphor-icons/react";
import Pill from "../../ui/Pill";
import "../recruitment-b1.css";
import type { Lang } from "../../../lib/kelas";

const T = {
  id: {
    list: "Alat untukmu",
    jadwal: "Jadwalku",
    berkas: "Berkasku",
    amplop: "Amplop",
    mundur: "Mundur",
    jadwalNone: "Belum ada yang dipilih",
    jadwalOpen: "Ada jadwal yang bisa dipilih",
    jadwalSet: (n: number) => `${n} jadwal terpilih`,
    berkasFix: "Ada yang perlu diperbaiki",
    berkasCount: (n: number, of: number) => `${n} dari ${of} berkas masuk`,
    amplopSealed: (n: number) => `${n} amplop menunggu`,
    amplopNone: "Belum ada amplop",
    amplopRead: "Semua sudah dibuka",
    munduSub: "Berhenti dari seleksi",
  },
  en: {
    list: "Your tools",
    jadwal: "My Schedule",
    berkas: "My Documents",
    amplop: "Envelopes",
    mundur: "Withdraw",
    jadwalNone: "Nothing picked yet",
    jadwalOpen: "A slot is open to pick",
    jadwalSet: (n: number) => `${n} slot${n === 1 ? "" : "s"} picked`,
    berkasFix: "Something needs fixing",
    berkasCount: (n: number, of: number) => `${n} of ${of} documents in`,
    amplopSealed: (n: number) => `${n} envelope${n === 1 ? "" : "s"} waiting`,
    amplopNone: "No envelopes yet",
    amplopRead: "All opened",
    munduSub: "Leave the selection",
  },
} as const;

type Tool = {
  key: "jadwal" | "berkas" | "amplop" | "mundur";
  icon: ComponentType<{
    size?: number;
    weight?: "regular" | "bold" | "fill";
    "aria-hidden"?: boolean;
  }>;
  sub: string;
  badge?: number | string;
  quiet?: boolean;
  onOpen: () => void;
};

export default function CaasTools({
  lang,
  jadwal,
  berkas,
  amplop,
  onJadwal,
  onBerkas,
  onAmplop,
  onMundur,
}: {
  lang: Lang;
  jadwal: { open: number; picked: number };
  berkas: { fix: boolean; have: number; need: number };
  amplop: { sealed: number; total: number };
  onJadwal: () => void;
  onBerkas: () => void;
  onAmplop: () => void;
  onMundur: () => void;
}) {
  const t = T[lang === "id" ? "id" : "en"];
  const tools: Tool[] = [
    {
      key: "jadwal",
      icon: CalendarCheckIcon,
      sub: jadwal.open ? t.jadwalOpen : jadwal.picked ? t.jadwalSet(jadwal.picked) : t.jadwalNone,
      badge: jadwal.open || undefined,
      onOpen: onJadwal,
    },
    {
      key: "berkas",
      icon: FolderOpenIcon,
      sub: berkas.fix ? t.berkasFix : t.berkasCount(berkas.have, berkas.need),
      badge: berkas.fix ? "!" : undefined,
      onOpen: onBerkas,
    },
    {
      key: "amplop",
      icon: EnvelopeSimpleIcon,
      sub: amplop.sealed
        ? t.amplopSealed(amplop.sealed)
        : amplop.total
          ? t.amplopRead
          : t.amplopNone,
      badge: amplop.sealed || undefined,
      onOpen: onAmplop,
    },
    { key: "mundur", icon: SignOutIcon, sub: t.munduSub, quiet: true, onOpen: onMundur },
  ];
  return (
    <ul
      className="b3-tools"
      aria-label={t.list}
      style={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      {tools.map((x) => (
        <li key={x.key} style={{ display: "contents" }}>
          <button
            type="button"
            className="b3-tool"
            data-tone={x.quiet ? "quiet" : undefined}
            onClick={x.onOpen}
          >
            <x.icon size={22} weight="regular" aria-hidden />
            <span className="b3-tool__t">{t[x.key]}</span>
            <span className="b3-tool__s">{x.sub}</span>
            {x.badge !== undefined && (
              <span className="b3-tool__badge">
                <Pill tone="warn">{String(x.badge)}</Pill>
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
