/**
 * The Wawancara and Mengajar tabs of the panel (mockup r4-slotku, r4-nilai,
 * r4-template). Everyone with an Asisten session sees Slotku (their own slots
 * and booths, never another examiner's CaAs); Penilaian is for the Ketua,
 * Akademik and Admin seats; Template for the Ketua and Akademik.
 */
import { useState } from "react";
import Pill from "../../../ui/Pill";
import TabLine from "../../../ui/TabLine";
import "../../recruitment-cutting.css";
import type { Lang } from "../../../../lib/kelas";
import { useIvMine, useIvNilai, type IvMineSlot } from "../../../../lib/recruitment/iv-client";
import type { IvStage } from "../../../../lib/recruitment/interview";
import type { RecRights } from "../../../../lib/recruitment/types";
import Lembar from "./Lembar";
import Template from "./Template";
import { IV } from "./ivStrings";
import "../../recruitment-r4.css";

const hari = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
const jam = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(":", ".");

const TONE = { lolos: "ok", ragu: "warn", cut: "danger" } as const;

function SlotCard({
  lang,
  stage,
  s,
  onOpen,
}: {
  lang: Lang;
  stage: IvStage;
  s: IvMineSlot;
  onOpen: (id: number) => void;
}) {
  const w = IV(lang).mine;
  const mine = s.booths.filter((b) => b.mine);
  return (
    <section className="panel r4slot">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h3 className="panel__title">{w.slotTitle(s.room)}</h3>
          <span className="hint num">
            {w.when(hari(s.startsAt, lang), jam(s.startsAt), jam(s.endsAt))}
          </span>
        </div>
        <Pill tone={s.role === "penguji" ? "accent" : "teal"}>{w.role[s.role]}</Pill>
      </div>
      {s.role === "penguji" ? (
        <ul className="r4booths">
          {mine.map((b) => (
            <li key={b.index} className="r4booth">
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{b.candidate?.nama}</b>
                <span className="hint mono">
                  {b.candidate?.nim} · {b.candidate?.kelas}
                </span>
                <span className="hint">
                  {stage === "wawancara" ? `${w.booth(b.index + 1)} · ` : ""}
                  {b.pair.length > 1 ? `${w.with} ${b.pair.join(", ")}` : ""}
                </span>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {b.here ? <Pill tone="ok">{w.here(jam(b.here))}</Pill> : <Pill>{w.notHere}</Pill>}
                {b.case?.status && (
                  <Pill tone={b.case.status === "gugur" ? "danger" : "warn"}>
                    {b.case.status === "gugur" ? w.caseGugur : w.caseSusulan}
                  </Pill>
                )}
                {b.verdict && <Pill tone={TONE[b.verdict]}>{w.verdict[b.verdict]}</Pill>}
                <span className="hint num">{w.sentOf(b.sent, b.need)}</span>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => b.candidate && onOpen(b.candidate.id)}
                >
                  {b.mineSent ? w.mineSent : w.open}
                </button>
              </div>
            </li>
          ))}
          {mine.length === 0 && <li className="hint">{w.otherBooth}</li>}
        </ul>
      ) : (
        <ul className="r4prep r4prep--duty">
          <li>
            <span>
              {w.pjOut}: {s.pjOut.join(", ") || "-"}
            </span>
          </li>
          <li>
            <span>
              {w.pjIn}: {s.pjIn.join(", ") || "-"}
            </span>
          </li>
          <li>
            <span>
              {w.crew}: {s.penguji.map((p) => p.kode).join(", ") || "-"}
            </span>
          </li>
        </ul>
      )}
    </section>
  );
}

function Slotku({
  lang,
  stage,
  onOpen,
}: {
  lang: Lang;
  stage: IvStage;
  onOpen: (id: number) => void;
}) {
  const w = IV(lang).mine;
  const mine = useIvMine(stage);
  if (!mine.data) return <span className="skeleton" style={{ height: 240 }} />;
  if (!mine.data.slots.length)
    return (
      <div className="rec-note">
        <b>{w.none}</b>
        <span>{w.noneHint}</span>
      </div>
    );
  return (
    <div className="stack r4my">
      {mine.data.slots.map((s) => (
        <SlotCard key={s.id} lang={lang} stage={stage} s={s} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Penilaian({
  lang,
  stage,
  onOpen,
}: {
  lang: Lang;
  stage: IvStage;
  onOpen: (id: number) => void;
}) {
  const w = IV(lang).nilai;
  const nilai = useIvNilai(stage);
  const d = nilai.data;
  if (!d) return <span className="skeleton" style={{ height: 240 }} />;
  if (!d.rows.length) return <p className="hint">{w.none}</p>;
  const lebar = d.rows.filter((r) => r.wide).length;
  const f1 = (v: number | null) =>
    v === null
      ? "-"
      : v.toLocaleString(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        });
  return (
    <div className="stack">
      <div className="row row--between" style={{ gap: 12, flexWrap: "wrap" }}>
        <span className="hint">
          {w.avg}: <b className="num">{f1(d.avg)}</b> · {w.cut(d.cut[0], d.cut[1])}
        </span>
        {lebar > 0 && <Pill tone="warn">{w.wide(lebar)}</Pill>}
      </div>
      <div className="scrollx">
        <table className="table">
          <thead>
            <tr>
              <th>{w.cols.name}</th>
              <th>{w.cols.sheets}</th>
              <th>{w.cols.mean}</th>
              <th>{w.cols.spread}</th>
              <th>{w.cols.verdict}</th>
              <th>{w.cols.suggest}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="stack" style={{ gap: 0 }}>
                    <b>{r.nama}</b>
                    <span className="hint mono">{r.nim}</span>
                  </span>
                </td>
                <td className="num">
                  {w.pending(r.sheets.length, r.expected)}
                  {r.sheets.length > 0 && (
                    <span className="hint">
                      {" "}
                      ({r.sheets.map((x) => `${x.by} ${x.score}`).join(", ")})
                    </span>
                  )}
                </td>
                <td className="num">{f1(r.mean)}</td>
                <td className="num">
                  {r.spread === null ? (
                    "-"
                  ) : (
                    <Pill tone={r.wide ? "warn" : undefined}>{r.spread}</Pill>
                  )}
                </td>
                <td>
                  {r.case?.status ? (
                    <Pill tone={r.case.status === "gugur" ? "danger" : "warn"}>
                      {w.case[r.case.status]}
                    </Pill>
                  ) : r.verdict ? (
                    <Pill tone={TONE[r.verdict]}>{w.verdict[r.verdict]}</Pill>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {r.suggested ? (
                    <Pill tone={TONE[r.suggested]}>{w.verdict[r.suggested]}</Pill>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onOpen(r.id)}
                  >
                    {w.open}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.penguji.length > 0 && (
        <section className="panel">
          <h3 className="panel__title">{w.perPenguji}</h3>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {d.penguji.map((p) => (
              <Pill key={p.by} mono>
                {p.by} · {f1(p.avg)} ({p.n})
              </Pill>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function IvTab({
  lang,
  stage,
  rights,
}: {
  lang: Lang;
  stage: IvStage;
  rights: RecRights | null;
}) {
  const w = IV(lang);
  const bisaNilai = rights?.plotting === true;
  const bisaTemplate = rights?.bank === true;
  const [bag, setBag] = useState<"mine" | "nilai" | "template">("mine");
  const [buka, setBuka] = useState<number | null>(null);
  const aktif =
    bag === "nilai" && !bisaNilai ? "mine" : bag === "template" && !bisaTemplate ? "mine" : bag;
  return (
    <div className="stack">
      <div className="n7-bar">
        <TabLine
          label={w.title[stage]}
          value={aktif}
          onChange={(v) => setBag(v)}
          tabs={[
            { v: "mine" as const, label: w.seg.mine },
            ...(bisaNilai ? [{ v: "nilai" as const, label: w.seg.nilai }] : []),
            ...(bisaTemplate ? [{ v: "template" as const, label: w.seg.template }] : []),
          ]}
        />
      </div>
      <p className="hint">{w.lede[stage]}</p>
      {aktif === "mine" ? (
        <Slotku lang={lang} stage={stage} onOpen={setBuka} />
      ) : aktif === "nilai" ? (
        <Penilaian lang={lang} stage={stage} onOpen={setBuka} />
      ) : (
        <Template lang={lang} stage={stage} />
      )}
      {buka !== null && (
        <Lembar lang={lang} stage={stage} id={buka} onClose={() => setBuka(null)} />
      )}
    </div>
  );
}
