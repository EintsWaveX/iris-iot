/**
 * Tubes, Presentasi: the tables and the running order (a team is one turn),
 * then the interview engine for the rest: the examiners of each table, "my
 * table", the sheet, Penilaian and the rubric template, all with stage
 * "tubes". The sheet is the one the interview uses (three steps, notes
 * shared by the table, a private level per row, never-dead send).
 */
import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowsLeftRightIcon,
  ArrowUpIcon,
  ShuffleIcon,
} from "@phosphor-icons/react";
import type { Lang } from "../../../lib/kelas";
import { Stepper } from "../../ui/Controls";
import Pill from "../../ui/Pill";
import Dialog from "../../ui/Dialog";
import IconButton from "../../ui/IconButton";
import type { RecRights } from "../../../lib/recruitment/types";
import type { TubesBoardTable, TubesBoardTeam } from "../../../lib/recruitment/tubes-api";
import CrewBoard from "../panel/iv/CrewBoard";
import IvTab from "../panel/iv/IvTab";
import { kapan, StatusPill, wibTime, type PanelCtx } from "./panelShared";

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

const TURN_MIN = 12;

const PX: Record<
  Lang,
  {
    tabOrder: string;
    tabTemplate: string;
    formatTitle: string;
    formatBody: (when: string) => string;
    tables: string;
    tablesLess: string;
    tablesMore: string;
    apply: (n: number) => string;
    shuffle: string;
    perTurn: (min: number) => string;
    placedOf: (p: number, n: number) => string;
    checkTitle: string;
    checkOk: string;
    needCheck: (n: number) => string;
    issueUnplaced: (n: number) => string;
    issueSubmit: (n: number) => string;
    issueEmpty: (n: number) => string;
    submitClosed: string;
    submitOpen: string;
    turns: (n: number) => string;
    range: (a: string, b: string) => string;
    moveTo: string;
  }
> = {
  id: {
    tabOrder: "Urutan Tampil",
    tabTemplate: "Template Rubrik",
    formatTitle: "Format Presentasi",
    formatBody: (when) =>
      `Satu malam, ${when}. Tidak ada pilih slot: Panitia yang menyusun urutannya. Satu tim satu giliran.`,
    tables: "Meja",
    tablesLess: "Kurangi",
    tablesMore: "Tambah",
    apply: (n) => `Terapkan ${n} Meja`,
    shuffle: "Acak Ulang",
    perTurn: (m) => `${m} menit tiap tim`,
    placedOf: (p, n) => `${p} dari ${n} tim sudah dapat meja`,
    checkTitle: "Periksa Urutan",
    checkOk: "Urutan siap",
    needCheck: (n) => `${n} perlu dicek`,
    issueUnplaced: (n) => `${n} tim belum punya meja`,
    issueSubmit: (n) => `${n} tim belum mengumpulkan lengkap`,
    issueEmpty: (n) => `${n} meja masih kosong`,
    submitClosed: "Pengumpulan sudah ditutup.",
    submitOpen: "Pengumpulan masih terbuka.",
    turns: (n) => `${n} giliran`,
    range: (a, b) => `${a} sampai ${b}`,
    moveTo: "Pindah meja",
  },
  en: {
    tabOrder: "Running Order",
    tabTemplate: "Rubric Template",
    formatTitle: "Presentasi Format",
    formatBody: (when) =>
      `One evening, ${when}. No slot picking: the Panitia sets the order. One team, one turn.`,
    tables: "Tables",
    tablesLess: "Less",
    tablesMore: "More",
    apply: (n) => `Apply ${n} Tables`,
    shuffle: "Shuffle Again",
    perTurn: (m) => `${m} minutes per team`,
    placedOf: (p, n) => `${p} of ${n} teams have a table`,
    checkTitle: "Check the Order",
    checkOk: "The order is ready",
    needCheck: (n) => `${n} to check`,
    issueUnplaced: (n) => `${n} teams have no table`,
    issueSubmit: (n) => `${n} teams have not handed in everything`,
    issueEmpty: (n) => `${n} tables are still empty`,
    submitClosed: "The submission is closed.",
    submitOpen: "The submission is still open.",
    turns: (n) => `${n} turns`,
    range: (a, b) => `${a} to ${b}`,
    moveTo: "Move to a table",
  },
  zh: {
    tabOrder: "出场顺序",
    tabTemplate: "评分模板",
    formatTitle: "答辩形式",
    formatBody: (when) => `一个晚上，${when}。不选时段：由委员会安排顺序。一组一轮。`,
    tables: "桌数",
    tablesLess: "减少",
    tablesMore: "增加",
    apply: (n) => `应用 ${n} 桌`,
    shuffle: "重新打乱",
    perTurn: (m) => `每组 ${m} 分钟`,
    placedOf: (p, n) => `${n} 组中 ${p} 组已有桌`,
    checkTitle: "检查顺序",
    checkOk: "顺序已就绪",
    needCheck: (n) => `${n} 项待查`,
    issueUnplaced: (n) => `${n} 组还没有桌`,
    issueSubmit: (n) => `${n} 组尚未完整提交`,
    issueEmpty: (n) => `${n} 桌仍是空的`,
    submitClosed: "提交已截止。",
    submitOpen: "提交仍开放。",
    turns: (n) => `${n} 轮`,
    range: (a, b) => `${a} 至 ${b}`,
    moveTo: "换桌",
  },
};

function TableCard({
  c,
  t,
  onMove,
}: {
  c: PanelCtx;
  t: TubesBoardTable;
  onMove: (team: TubesBoardTeam) => void;
}) {
  const { w, b, lang } = c;
  const x = PX[lang];
  const can = b.rights.order;
  const team = (id: number) => b.teams.find((y) => y.id === id);
  const shift = (i: number, d: -1 | 1) => {
    const ids = t.teamIds.slice();
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void c.post("tubes-order-set", { slotId: t.slotId, teamIds: ids });
  };
  const start = new Date(t.startsAt).getTime();
  const end = new Date(start + t.teamIds.length * TURN_MIN * 60_000).toISOString();
  return (
    <section className="panel tp-tbl">
      <div className="stack" style={{ gap: 2 }}>
        <h3 className="h4" style={{ margin: 0 }}>
          {w.table(t.room)}
        </h3>
        <span className="hint num">
          {x.turns(t.teamIds.length)} · {x.range(wibTime(t.startsAt), wibTime(end))}
        </span>
      </div>
      {t.teamIds.length === 0 ? (
        <p className="hint">{w.emptyTable}</p>
      ) : (
        <ul className="tp-turns">
          {t.teamIds.map((id, i) => {
            const y = team(id);
            if (!y) return null;
            const at = new Date(start + i * TURN_MIN * 60_000).toISOString();
            return (
              <li className="tp-turn" key={id}>
                <span className="tp-turn__n num">{i + 1}</span>
                <span className="tp-turn__t num">{wibTime(at)}</span>
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b style={{ overflowWrap: "anywhere" }}>{y.name}</b>
                  <span className="hint">
                    {b.topics.find((z) => z.id === y.topicId)?.title ?? w.topicNone}
                  </span>
                </span>
                <StatusPill s={y.status} w={w} />
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
                    <IconButton
                      sm
                      icon={ArrowsLeftRightIcon}
                      label={x.moveTo}
                      onClick={() => onMove(y)}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Urutan({ c, rights }: { c: PanelCtx; rights: RecRights | null }) {
  const { w, b, lang } = c;
  const x = PX[lang];
  const can = b.rights.order;
  const [n, setN] = useState(Math.max(1, b.tables.length || 3));
  const [ask, setAsk] = useState<null | "make" | "deal">(null);
  const [place, setPlace] = useState<TubesBoardTeam | null>(null);
  const placed = new Set(b.tables.flatMap((t) => t.teamIds));
  const free = b.teams.filter((t) => t.size > 0 && !placed.has(t.id));
  const make = async (force: boolean) => {
    if (!Number.isInteger(n) || n < 1 || n > 12) return;
    await c.post("tubes-tables-make", { tables: n, force });
  };
  const notDone = b.teams.filter(
    (t) => t.size > 0 && t.status !== "complete" && t.status !== "over",
  );
  const empty = b.tables.filter((t) => t.teamIds.length === 0);
  const issues: { key: string; head: string; sub?: string }[] = [];
  if (b.tables.length > 0 && free.length)
    issues.push({
      key: "un",
      head: x.issueUnplaced(free.length),
      sub: free.map((t) => t.name).join(", "),
    });
  if (notDone.length)
    issues.push({
      key: "sub",
      head: x.issueSubmit(notDone.length),
      sub: b.times.submit === "tutup" || b.times.submit === "izin" ? x.submitClosed : x.submitOpen,
    });
  if (empty.length) issues.push({ key: "em", head: x.issueEmpty(empty.length) });
  const teamsIn = b.teams.filter((t) => t.size > 0).length;
  return (
    <div className="stack">
      <div className="tp-two">
        <section className="panel tp-fmt">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="h4" style={{ margin: 0 }}>
              {x.formatTitle}
            </h3>
            <span className="hint">
              {x.formatBody(b.times.presentasiAt ? kapan(b.times.presentasiAt, lang) : "")}
            </span>
          </div>
          <div className="tp-fmt__g">
            <div className="stack stack--sm">
              <span className="hint">{x.tables}</span>
              <Stepper
                value={n}
                min={1}
                max={12}
                label={x.tables}
                lessLabel={x.tablesLess}
                moreLabel={x.tablesMore}
                disabled={!can}
                onChange={setN}
              />
            </div>
            {n !== b.tables.length && (
              <button
                type="button"
                className="btn btn--inverse"
                disabled={!can || c.busy}
                onClick={() => (b.tables.length ? setAsk("make") : void make(false))}
              >
                <span className="btn__label">{x.apply(n)}</span>
              </button>
            )}
          </div>
          <div className="tp-fmt__p">
            <span className="hint num">
              {x.placedOf(teamsIn - free.length, teamsIn)} · {x.perTurn(TURN_MIN)}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!can || c.busy || b.tables.length === 0 || b.teams.length === 0}
              onClick={() => (placed.size ? setAsk("deal") : void c.post("tubes-order-deal", {}))}
            >
              <ShuffleIcon size={16} aria-hidden="true" />
              <span className="btn__label">{x.shuffle}</span>
            </button>
          </div>
        </section>
        <section className="panel tp-chk">
          <div className="row row--between" style={{ gap: 8 }}>
            <h3 className="h4" style={{ margin: 0 }}>
              {x.checkTitle}
            </h3>
            <Pill tone={issues.length ? "warn" : "ok"}>
              {issues.length ? x.needCheck(issues.length) : x.checkOk}
            </Pill>
          </div>
          {issues.length > 0 && (
            <ul className="tp-chk__l">
              {issues.map((i) => (
                <li key={i.key}>
                  <i aria-hidden="true" />
                  <span className="stack" style={{ gap: 0 }}>
                    <b>{i.head}</b>
                    {i.sub && <span className="hint">{i.sub}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {b.tables.length === 0 ? (
        <p className="hint">{w.noTables}</p>
      ) : (
        <div className="tp-order">
          {b.tables.map((t) => (
            <TableCard key={t.slotId} c={c} t={t} onMove={setPlace} />
          ))}
        </div>
      )}
      <section className="stack">
        <h3 className="h4" style={{ margin: 0 }}>
          {w.examiners}
        </h3>
        <span className="hint">{w.examinersHint}</span>
        {rights && <CrewBoard lang={c.lang} stage="tubes" rights={rights} />}
      </section>
      {ask === "make" && (
        <Ask
          c={c}
          title={x.apply(n)}
          body={w.tablesWarn}
          go={x.apply(n)}
          run={() => make(true)}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === "deal" && (
        <Ask
          c={c}
          title={x.shuffle}
          body={w.dealAsk}
          go={x.shuffle}
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
  const { lang } = c;
  const x = PX[lang];
  return (
    <div className="stack">
      <IvTab
        lang={lang}
        stage="tubes"
        rights={rights}
        lead={{ label: x.tabOrder, node: <Urutan c={c} rights={rights} /> }}
        templateLabel={x.tabTemplate}
      />
    </div>
  );
}
