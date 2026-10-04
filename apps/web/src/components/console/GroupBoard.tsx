/**
 * The console board's group list (Phase 9, mockup c-run): one row per
 * group with its colour stripe, "Kelompok N · Name", the badges that ask
 * for attention (hand up, stuck blanks, inactive) or say it is yours, the
 * paired Asisten as "Full Name (CODE)", and presence plus the blank bar.
 * Clicking a row (or pressing its number, 0 for Group 10) opens it in the
 * inspector beside it.
 */
import { useMemo, type CSSProperties } from "react";
import { HandIcon } from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import KeyHint from "../ui/KeyHint";
import { namaKelompok } from "../../lib/app";
import { namaAsisten } from "../../lib/people";
import type { Strings } from "./strings";
import type { AsistenRef, GroupRow, Stuck } from "./types";

export interface BoardProps {
  t: Strings;
  groups: GroupRow[];
  stuck: Stuck[];
  tangan: Record<string, string>;
  pemilik: Record<string, string>;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  sel: number | null;
  onSelect: (id: number) => void;
}

export default function GroupBoard(p: BoardProps) {
  const { t, groups, stuck, tangan, pemilik, asisten, meNim, sel, onSelect } = p;
  const stuckBy = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of stuck) m.set(s.kelompokId, (m.get(s.kelompokId) ?? 0) + 1);
    return m;
  }, [stuck]);

  if (groups.length === 0) return <p className="empty-note">{t.noGroups}</p>;

  return (
    <div className="board" role="list" aria-label={t.boardTitle}>
      {groups.map((g) => {
        const nStuck = stuckBy.get(g.id) ?? 0;
        const ownerNim = pemilik[g.id] ?? null;
        const owner = ownerNim ? asisten.get(ownerNim) : null;
        const pct = g.total ? Math.round((g.benar / g.total) * 100) : 0;
        return (
          <button
            key={g.id}
            type="button"
            role="listitem"
            className="grow-row"
            style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
            aria-current={sel === g.id}
            data-idle={g.sesiAktif ? undefined : "yes"}
            onClick={() => onSelect(g.id)}
          >
            <span className="grow-row__stripe" aria-hidden="true" />
            <span className="grow-row__main">
              <span className="grow-row__top">
                <b>
                  {t.group(g.nomor)} · {namaKelompok(g.nomor, g.nama)}
                  {g.nomor <= 10 && <KeyHint k={String(g.nomor % 10)} />}
                </b>
                {tangan[g.id] && (
                  <Pill tone="warn">
                    <HandIcon size={13} aria-hidden="true" />
                    {t.handBadge}
                  </Pill>
                )}
                {nStuck > 0 && <Pill tone="warn">{t.stuckN(nStuck)}</Pill>}
                {ownerNim === meNim && <Pill tone="accent">{t.yours}</Pill>}
                {!g.sesiAktif && <Pill>{t.idleBadge}</Pill>}
              </span>
              <span className="hint">
                {t.assistantOf(owner ? namaAsisten(owner) : ownerNim ? ownerNim : t.noAssistant)}
              </span>
              <span className="grow-row__meter">
                <span className="num hint">{t.here(g.hadir, g.anggotaTotal)}</span>
                <span
                  className="meter"
                  style={
                    { "--meter": pct, "--meter-hue": `var(--group-${g.nomor})` } as CSSProperties
                  }
                />
                <span className="num hint">
                  {g.benar}/{g.total}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
