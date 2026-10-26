/** Home's inbox rows for the SeeLabs robot (Phase 14, mockup s14-home): my
 *  jobs that stopped and that nothing newer replaced, each with its way on:
 *  the Account page for a refused password or a changed PC key, the score
 *  table for a Token Khusus, Coba Lagi for the rest. Since 2026-10-17 also
 *  what the read-back flagged: my groups that differ in SeeLabs (to the score
 *  table) and Rekap BAP days that don't match Bayar (flags only). Nothing
 *  when all is well. */
import { useEffect, useState } from "react";
import { getJson, href, postJson, tanggalPanjang } from "../../../lib/app";
import { usePoll } from "../../../lib/hooks";
import type { Lang } from "../../../lib/kelas";
import { kelompokLabel } from "../../../lib/labels";
import type { StatusBaca } from "../../../lib/seelabs-baca";
import { PRAKTIKUM_SEELABS } from "../../../lib/seelabs-robot";
import { BC } from "./bacaStrings";
import { RB } from "./robotStrings";

interface Tugas {
  id: number;
  jenis: string;
  sesiId: number | null;
  kelompok: number | null;
  klp: string | null;
  status: string;
  galat: string | null;
  rinci?: string | null;
  dibuat: string;
}

interface Bacaku {
  beda: {
    sesiId: number;
    kelompokNomor: number;
    modul: number;
    tanggal: string;
    status: StatusBaca;
  }[];
  bap: { id: number; tanggal: string; shift: number; jenis: "hanya_iris" | "hanya_seelabs" }[];
}

const SEPEKAN_MS = 7 * 86_400_000;

/** Failed jobs from the last week with no newer job for the same thing. */
export function tugasMacet(tugas: Tugas[], sekarang = Date.now()): Tugas[] {
  const kunci = (t: Tugas) => `${t.jenis}|${t.sesiId ?? 0}|${t.kelompok ?? 0}|${t.klp ?? ""}`;
  const terbaru = new Map<string, Tugas>();
  for (const t of [...tugas].sort((a, b) => b.id - a.id))
    if (!terbaru.has(kunci(t))) terbaru.set(kunci(t), t);
  return [...terbaru.values()].filter(
    (t) =>
      t.status === "gagal" &&
      t.jenis !== "uji" &&
      sekarang - new Date(t.dibuat).getTime() < SEPEKAN_MS,
  );
}

export default function RobotInbox({
  lang,
  tag,
  onTable,
  onCount,
}: {
  lang: Lang;
  tag: string;
  onTable: (sesiId: number) => void;
  /** How many rows show, so Home's count and empty state include them. */
  onCount?: (n: number) => void;
}) {
  const t = RB[lang];
  const { data, refresh } = usePoll(
    () => getJson<{ ok: boolean; tugas: Tugas[]; bacaku?: Bacaku }>("/api/session/robot"),
    120_000,
    true,
    ["seelabs"],
  );
  const [busy, setBusy] = useState<number | null>(null);
  const macet = data?.ok ? tugasMacet(data.tugas) : [];
  const beda = data?.ok ? (data.bacaku?.beda ?? []) : [];
  const bap = data?.ok ? (data.bacaku?.bap ?? []) : [];
  const b = BC[lang];
  const n = macet.length + beda.length + bap.length;
  useEffect(() => onCount?.(n), [n, onCount]);
  if (!n) return null;

  async function ulang(id: number) {
    setBusy(id);
    const r = await postJson<{ ok: boolean }>("/api/session/robot", {
      aksi: "ulang",
      tugasId: id,
    }).catch(() => ({ ok: false }));
    setBusy(null);
    window.Toast?.show(r.ok ? t.queued : t.failed, r.ok ? "ok" : "danger");
    refresh();
  }

  return (
    <ol className="elog todo10">
      {macet.map((j) => {
        const akun = j.galat === "ditolak" || j.galat === "segel_rusak";
        const token = j.galat === "butuh_token" || j.galat === "token_salah";
        const apa = `${t.kind[j.jenis] ?? j.jenis}${j.kelompok ? ` · ${kelompokLabel(j.kelompok, lang)}` : ""}${j.klp && j.jenis === "nilai" ? ` · KLP ${j.klp}` : ""}${j.klp && j.jenis === "jaga" ? ` · ${j.klp === String(PRAKTIKUM_SEELABS.internasional) ? t.kelas.internasional : t.kelas.reguler}` : ""}`;
        return (
          <li key={j.id} className="elog__row todo10__row">
            <span className="elog__tag mono" data-tone="danger">
              {tag}
            </span>
            <span className="elog__text">
              <b>{apa}</b> {t.err[j.galat ?? "bentuk_berubah"] ?? t.failed}
              {j.galat === "seelabs_menolak" && j.rinci ? ` "${j.rinci}"` : ""}
            </span>
            <span className="todo10__acts">
              {akun ? (
                <a className="btn btn--sm" href={href(lang, "/account")}>
                  {t.enterAgain}
                </a>
              ) : token && j.sesiId !== null ? (
                <button type="button" className="btn btn--sm" onClick={() => onTable(j.sesiId!)}>
                  {t.tokenSend}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={busy !== null}
                  data-loading={busy === j.id ? "yes" : undefined}
                  onClick={() => void ulang(j.id)}
                >
                  {t.tryAgain}
                </button>
              )}
            </span>
          </li>
        );
      })}
      {beda.map((g) => (
        <li key={`baca-${g.sesiId}-${g.kelompokNomor}`} className="elog__row todo10__row">
          <span className="elog__tag mono" data-tone="warn">
            {tag}
          </span>
          <span className="elog__text">
            <b>
              {g.status === "hilang"
                ? b.inboxHilang(g.kelompokNomor)
                : g.status === "hanya_seelabs"
                  ? b.inboxHanya(g.kelompokNomor)
                  : b.inbox(g.kelompokNomor)}
            </b>{" "}
            {b.kolModul} {g.modul} · {tanggalPanjang(g.tanggal, lang)}
          </span>
          <span className="todo10__acts">
            <button type="button" className="btn btn--sm" onClick={() => onTable(g.sesiId)}>
              {b.buka}
            </button>
          </span>
        </li>
      ))}
      {bap.map((f) => (
        <li key={`bap-${f.id}`} className="elog__row todo10__row">
          <span className="elog__tag mono" data-tone="warn">
            {tag}
          </span>
          <span className="elog__text">
            <b>
              {(f.jenis === "hanya_iris" ? b.bapIris : b.bapSeelabs)(
                tanggalPanjang(f.tanggal, lang),
                f.shift,
              )}
            </b>
          </span>
        </li>
      ))}
    </ol>
  );
}
