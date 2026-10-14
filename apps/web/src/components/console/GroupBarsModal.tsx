/**
 * The inspector's per-group comparison (mockup G2, kinds group_blank,
 * group_delay, group_lost): one bar per group in one colour, the group's
 * name on the left and its value on the right, plus a CSV of the same rows.
 * The blank view also lists the open group's stuck blanks.
 */
import { WarningIcon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import Dialog from "../ui/Dialog";
import Pill from "../ui/Pill";
import { namaKelompok, localeOf } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import type { Strings } from "./strings";
import type { GroupRow, Stuck } from "./types";
import Nil from "../ui/Nil";

export type BarKind = "blank" | "delay" | "lost";

function nilaiOf(g: GroupRow, k: BarKind): number | null {
  if (k === "blank") return g.benar;
  if (k === "delay") return g.telemetri?.delayRataMs ?? null;
  return g.telemetri?.hilangPct ?? null;
}

export default function GroupBarsModal({
  t,
  lang,
  kind,
  modul,
  groups,
  focus,
  stuck,
  open,
  onOpenChange,
}: {
  t: Strings;
  lang: Lang;
  kind: BarKind;
  modul: number;
  groups: GroupRow[];
  /** The inspector's group, marked in the list. */
  focus: number;
  stuck: Stuck[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const fmt = new Intl.NumberFormat(localeOf(lang), {
    maximumFractionDigits: kind === "lost" ? 1 : 0,
  });
  const vals = groups.map((g) => nilaiOf(g, kind));
  const total = groups[0]?.total ?? 0;
  const max = kind === "blank" ? total || 1 : Math.max(1, ...vals.map((v) => v ?? 0));
  const unit = kind === "blank" ? `/${total}` : kind === "delay" ? " ms" : "%";
  const fokus = groups.find((g) => g.id === focus);

  function csv() {
    const rows = [
      [t.viewAsGroup, kind === "blank" ? t.cardBlank : kind === "delay" ? t.cardDelay : t.cardLost],
      ...groups.map((g, i) => [
        `${t.group(g.nomor)} · ${namaKelompok(g.nomor, g.nama)}`,
        vals[i] === null ? "" : String(vals[i]),
      ]),
    ];
    const text = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `kelompok-${kind}-modul${modul}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.perGroup[kind]}
      description={t.perGroupSub(modul)}
      size="lg"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn" onClick={csv}>
            {t.csv}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onOpenChange(false)}>
            {t.done}
          </button>
        </>
      }
    >
      <div className="gbars" role="list">
        {groups.map((g, i) => {
          const v = vals[i];
          return (
            <div
              key={g.id}
              role="listitem"
              className="gbars__row"
              data-focus={g.id === focus ? "yes" : undefined}
            >
              <span className="gbars__name">
                {t.group(g.nomor)} · {namaKelompok(g.nomor, g.nama)}
              </span>
              <span className="gbars__track">
                <span
                  className="gbars__bar"
                  style={{ "--w": `${v === null ? 0 : (v / max) * 100}%` } as CSSProperties}
                />
              </span>
              <span className="gbars__v num">
                {v === null ? <Nil dot /> : `${fmt.format(v)}${unit}`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint">{t.perGroupHint}</p>
      {kind === "blank" && fokus && stuck.length > 0 && (
        <div className="stack stack--sm">
          <b>
            {t.stuckTitle} · {t.group(fokus.nomor)}
          </b>
          <div className="row">
            {stuck.map((s) => (
              <Pill key={s.soalKode} tone="warn">
                <WarningIcon size={13} aria-hidden="true" />
                {s.soalKode.toUpperCase()} · {t.tries(s.percobaan)}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
