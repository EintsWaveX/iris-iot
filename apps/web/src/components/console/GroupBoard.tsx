/**
 * The console board (P8.1): five group cards and a filter row, plus the live
 * activity feed. Each card carries everything that used to live in three
 * tabs: presence, blanks, stuck questions, a raised hand, the group's device
 * and its assistant. Clicking a card (or pressing 1 to 5) opens it in the
 * inspector.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { HandIcon, WarningIcon } from "@phosphor-icons/react";
import HoverCard from "../ui/HoverCard";
import { namaKelompok, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import type { Strings } from "./strings";
import type { AsistenRef, FeedItem, GroupRow, Stuck } from "./types";

type Filter = "all" | "help" | "hand" | "absent" | "idle" | "mine";

export interface BoardProps {
  t: Strings;
  lang: Lang;
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
  const { t, lang, groups, stuck, tangan, pemilik, asisten, meNim, sel, onSelect } = p;
  const [f, setF] = useState<Filter>("all");
  const now = useTick(15_000);
  const stuckBy = useMemo(() => {
    const m = new Map<number, Stuck[]>();
    for (const s of stuck) m.set(s.kelompokId, [...(m.get(s.kelompokId) ?? []), s]);
    return m;
  }, [stuck]);

  const test: Record<Filter, (g: GroupRow) => boolean> = {
    all: () => true,
    help: (g) => (stuckBy.get(g.id)?.length ?? 0) > 0 || !!tangan[g.id],
    hand: (g) => !!tangan[g.id],
    absent: (g) => g.hadir < g.anggotaTotal,
    idle: (g) => !g.sesiAktif,
    mine: (g) => pemilik[g.id] === meNim,
  };
  const shown = groups.filter(test[f]);
  const filters: Filter[] = ["all", "help", "hand", "absent", "idle", "mine"];

  return (
    <div className="board">
      <div className="board__filters" role="group" aria-label={t.filterLabel}>
        {filters.map((x) => {
          const n = x === "all" ? groups.length : groups.filter(test[x]).length;
          return (
            <button
              key={x}
              type="button"
              className="board__filter"
              aria-pressed={f === x}
              onClick={() => setF(x)}
              disabled={x !== "all" && n === 0 && f !== x}
            >
              {t.filters[x]}
              <span className="board__count num">{n}</span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <p className="empty-note">{t.noGroups}</p>
      ) : shown.length === 0 ? (
        <p className="empty-note">{t.noMatch}</p>
      ) : (
        <ul className="board__list">
          {shown.map((g) => {
            const st = stuckBy.get(g.id) ?? [];
            const owner = pemilik[g.id] ? asisten.get(pemilik[g.id]) : null;
            const pct = g.total ? Math.round((g.benar / g.total) * 100) : 0;
            const hand = tangan[g.id];
            return (
              <li key={g.id} className="rise">
                <HoverCard
                  side="right"
                  card={
                    <div className="stack stack--sm">
                      <b>
                        {t.groupShort(g.nomor)} · {g.nama}
                      </b>
                      <span className="hint">
                        {g.anggota.map((a) => a.nama.split(" ")[0]).join(", ")}
                      </span>
                      <span className="hint">
                        {t.owner}: {owner?.kode ?? t.unassigned}
                        {g.telemetri?.delayMedianMs != null &&
                          ` · ${t.delta} ${g.telemetri.delayMedianMs} ms`}
                      </span>
                      {g.catatan && <span className="hint">“{g.catatan}”</span>}
                    </div>
                  }
                >
                  <button
                    type="button"
                    className="gcard sweep-hover"
                    style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
                    aria-current={sel === g.id}
                    data-idle={g.sesiAktif ? undefined : "yes"}
                    data-hand={hand ? "yes" : undefined}
                    onClick={() => onSelect(g.id)}
                  >
                    <span className="gcard__stripe" aria-hidden="true" />
                    <span className="gcard__main">
                      <span className="gcard__top">
                        <span className="gcard__num" aria-hidden="true">
                          {g.nomor}
                        </span>
                        <b className="gcard__name">{namaKelompok(g.nomor, g.nama)}</b>
                        {hand && (
                          <span className="gcard__hand">
                            <HandIcon size={14} aria-hidden="true" />
                            {sejak(hand, lang, now)}
                          </span>
                        )}
                        {st.length > 0 && (
                          <span className="pill pill--warn">
                            <WarningIcon size={13} aria-hidden="true" /> {t.stuckN(st.length)}
                          </span>
                        )}
                        {!g.sesiAktif && <span className="pill">{t.inactive}</span>}
                      </span>
                      <span className="gcard__meta">
                        <span
                          className="gcard__people"
                          aria-label={t.here(g.hadir, g.anggotaTotal)}
                        >
                          {g.anggota.map((a) => (
                            <span
                              key={a.nim}
                              className={`dot ${a.hadir ? "dot--ok" : "dot--off"}`}
                            />
                          ))}
                          <span className="num hint">{t.here(g.hadir, g.anggotaTotal)}</span>
                        </span>
                        <span className="gcard__progress">
                          <span
                            className="meter"
                            style={
                              {
                                "--meter": pct,
                                "--meter-hue": `var(--group-${g.nomor})`,
                              } as CSSProperties
                            }
                          />
                          <span className="num hint">
                            {g.benar}/{g.total}
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="gcard__side">
                      <span
                        className={`code-badge${owner ? "" : " code-badge--empty"}`}
                        data-me={pemilik[g.id] === meNim ? "yes" : undefined}
                        aria-label={owner ? owner.nama : t.unassigned}
                      >
                        {owner?.kode ?? "?"}
                      </span>
                    </span>
                  </button>
                </HoverCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ feed */

export function ActivityFeed({
  t,
  lang,
  items,
  onPick,
}: {
  t: Strings;
  lang: Lang;
  items: FeedItem[];
  onPick: (g: number) => void;
}) {
  const now = useTick(10_000);
  return (
    <section className="panel panel--tight feed" aria-label={t.feed}>
      <div className="panel__head">
        <h2 className="panel__title">{t.feed}</h2>
        <span className="dot dot--ok dot--pulse" aria-hidden="true" />
      </div>
      {items.length === 0 ? (
        <p className="hint">{t.feedEmpty}</p>
      ) : (
        <ol className="feed__list" aria-live="polite">
          {items.map((it) => {
            return (
              <li key={it.id} className="feed__item" data-kind={it.kind}>
                <button
                  type="button"
                  className="feed__btn"
                  disabled={it.g === null}
                  onClick={() => it.g !== null && onPick(it.g)}
                  style={it.g ? ({ "--g": `var(--group-${it.g})` } as CSSProperties) : undefined}
                >
                  <span className="feed__dot" aria-hidden="true" />
                  <span className="feed__text">{it.text}</span>
                  <span className="feed__at num">
                    {sejak(new Date(it.at).toISOString(), lang, now)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
