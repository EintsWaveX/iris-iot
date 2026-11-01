/**
 * Tubes, Presentasi: the tables and the running order (a team is one turn),
 * then the interview engine for the rest: the examiners of each table, "my
 * table", the sheet, Penilaian and the rubric template, all with stage
 * "tubes". The sheet is the one the interview uses (three steps, notes
 * shared by the table, a private level per row, never-dead send).
 */
import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import IconButton from "../../ui/IconButton";
import type { RecRights } from "../../../lib/recruitment/types";
import type { TubesBoardTable, TubesBoardTeam } from "../../../lib/recruitment/tubes-api";
import CrewBoard from "../panel/iv/CrewBoard";
import IvTab from "../panel/iv/IvTab";
import { kapan, wibTime, type PanelCtx } from "./panelShared";

function Ask({
  c,
  title,
  body,
  go,
  run,
  onClose,
}: {
  c: PanelCtx;
  title: string;
  body: string;
  go: string;
  run: () => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={body}
      lang={c.lang}
      size="sm"
      blocking
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{c.w.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={c.busy}
            onClick={async () => {
              await run();
              onClose();
            }}
          >
            <span className="btn__label">{go}</span>
          </button>
        </>
      }
    />
  );
}

/** Pick a table for a team without one. */
function PlaceDialog({
  c,
  team,
  onClose,
}: {
  c: PanelCtx;
  team: TubesBoardTeam;
  onClose: () => void;
}) {
  const { w, b } = c;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${w.place} · ${team.name}`}
      lang={c.lang}
      size="md"
      actions={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          <span className="btn__label">{w.close}</span>
        </button>
      }
    >
      <div className="tp-list">
        {b.tables.map((t) => (
          <button
            key={t.slotId}
            type="button"
            className="tp-pick"
            disabled={c.busy}
            onClick={() =>
              void c
                .post("tubes-order-set", { slotId: t.slotId, teamIds: [...t.teamIds, team.id] })
                .then((ok) => ok && onClose())
            }
          >
            <b>{t.room}</b>
            <span className="hint num">
              {t.teamIds.length} / {t.capacity}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function TableCard({
  c,
  t,
  onMove,
}: {
  c: PanelCtx;
  t: TubesBoardTable;
  onMove: (team: TubesBoardTeam) => void;
}) {
  const { w, b } = c;
  const can = b.rights.order;
  const turnMin = 12;
  const team = (id: number) => b.teams.find((x) => x.id === id);
  const shift = (i: number, d: -1 | 1) => {
    const ids = t.teamIds.slice();
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void c.post("tubes-order-set", { slotId: t.slotId, teamIds: ids });
  };
  return (
    <section className="panel tp-tbl">
      <div className="row row--between">
        <h3 className="h4" style={{ margin: 0 }}>
          {w.table(t.room)}
        </h3>
        <span className="hint num">
          {wibTime(t.startsAt)} · {t.teamIds.length} / {t.capacity}
        </span>
      </div>
      {t.teamIds.length === 0 ? (
        <p className="hint">{w.emptyTable}</p>
      ) : (
        t.teamIds.map((id, i) => {
          const x = team(id);
          if (!x) return null;
          const at = new Date(new Date(t.startsAt).getTime() + i * turnMin * 60_000).toISOString();
          return (
            <div className="tp-turn" key={id}>
              <span className="tp-turn__n num">{i + 1}</span>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <b style={{ overflowWrap: "anywhere" }}>{x.name}</b>
                <span className="hint num">
                  {wibTime(at)} · {w.size(x.size)}
                </span>
              </span>
              {can && (
                <span className="row" style={{ gap: 2 }}>
                  <IconButton
                    sm
                    icon={ArrowUpIcon}
                    label={w.up}
                    disabled={i === 0 || c.busy}
                    onClick={() => shift(i, -1)}
                  />
                  <IconButton
                    sm
                    icon={ArrowDownIcon}
                    label={w.down}
                    disabled={i === t.teamIds.length - 1 || c.busy}
                    onClick={() => shift(i, 1)}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onMove(x)}
                  >
                    <span className="btn__label">{w.toTable}</span>
                  </button>
                </span>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

function Urutan({ c }: { c: PanelCtx }) {
  const { w, b } = c;
  const can = b.rights.order;
  const [n, setN] = useState(String(Math.max(1, b.tables.length || 3)));
  const [ask, setAsk] = useState<null | "make" | "deal">(null);
  const [place, setPlace] = useState<TubesBoardTeam | null>(null);
  const placed = new Set(b.tables.flatMap((t) => t.teamIds));
  const free = b.teams.filter((t) => t.size > 0 && !placed.has(t.id));
  const make = async (force: boolean) => {
    const k = Number(n);
    if (!Number.isInteger(k) || k < 1 || k > 12) return;
    await c.post("tubes-tables-make", { tables: k, force });
  };
  return (
    <div className="stack">
      <section className="panel tp-ctl">
        <div className="tp-ctl__g">
          <label className="field">
            <span className="field__label">{w.tablesCount}</span>
            <input
              className="field__input"
              type="number"
              min={1}
              max={12}
              value={n}
              disabled={!can}
              style={{ width: 96 }}
              onChange={(e) => setN(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!can || c.busy}
            onClick={() => (b.tables.length ? setAsk("make") : void make(false))}
          >
            <span className="btn__label">{w.tablesMake}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!can || c.busy || b.tables.length === 0 || b.teams.length === 0}
            onClick={() => (placed.size ? setAsk("deal") : void c.post("tubes-order-deal", {}))}
          >
            <span className="btn__label">{w.deal}</span>
          </button>
        </div>
        {b.times.presentasiAt && (
          <span className="hint">{kapan(b.times.presentasiAt, c.lang)}</span>
        )}
      </section>
      {b.tables.length === 0 ? (
        <p className="hint">{w.noTables}</p>
      ) : (
        <>
          {free.length > 0 && (
            <p className="hint tb-warn">
              {w.unplaced(free.length)}:{" "}
              {free.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={!can}
                    onClick={() => setPlace(t)}
                  >
                    <span className="btn__label">{t.name}</span>
                  </button>
                </span>
              ))}
            </p>
          )}
          <div className="tp-order">
            {b.tables.map((t) => (
              <TableCard key={t.slotId} c={c} t={t} onMove={setPlace} />
            ))}
          </div>
        </>
      )}
      {ask === "make" && (
        <Ask
          c={c}
          title={w.tablesMake}
          body={w.tablesWarn}
          go={w.tablesMake}
          run={() => make(true)}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === "deal" && (
        <Ask
          c={c}
          title={w.deal}
          body={w.dealAsk}
          go={w.deal}
          run={() => c.post("tubes-order-deal", {})}
          onClose={() => setAsk(null)}
        />
      )}
      {place && <PlaceDialog c={c} team={place} onClose={() => setPlace(null)} />}
    </div>
  );
}

export default function PresentasiSection({
  c,
  rights,
}: {
  c: PanelCtx;
  rights: RecRights | null;
}) {
  const { w, lang } = c;
  const [sub, setSub] = useState<"urutan" | "nilai">("urutan");
  return (
    <div className="stack">
      <div className="tp-bar">
        <div className="tp-seg" role="radiogroup" aria-label={w.sections.presentasi}>
          {(["urutan", "nilai"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={sub === k}
              className="tp-seg__b"
              onClick={() => setSub(k)}
            >
              {k === "urutan" ? w.sub.order : `${w.sub.mine}, ${w.sub.nilai}, ${w.sub.template}`}
            </button>
          ))}
        </div>
      </div>
      {sub === "urutan" ? (
        <>
          <Urutan c={c} />
          <section className="stack">
            <h3 className="h4" style={{ margin: 0 }}>
              {w.examiners}
            </h3>
            <span className="hint">{w.examinersHint}</span>
            {rights && <CrewBoard lang={lang} stage="tubes" rights={rights} />}
          </section>
        </>
      ) : (
        <>
          <p className="hint">{w.rubricNote}</p>
          <IvTab lang={lang} stage="tubes" rights={rights} />
        </>
      )}
    </div>
  );
}
