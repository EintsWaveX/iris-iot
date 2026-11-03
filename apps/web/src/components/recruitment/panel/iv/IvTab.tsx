/**
 * The Wawancara and Mengajar tabs of the panel (mockup r4-slotku, r4-nilai,
 * r4-template). Everyone with an Asisten session sees Slotku (their own slots
 * and booths, never another examiner's CaAs); Penilaian is for the Ketua,
 * Akademik and Admin seats; Template for the Ketua and Akademik.
 */
import { useState, type ReactNode } from "react";
import { UserSwitchIcon } from "@phosphor-icons/react";
import Dialog from "../../../ui/Dialog";
import Disclose from "../../../ui/Disclose";
import Dropdown from "../../../ui/Dropdown";
import { Checkbox } from "../../../ui/Controls";
import Pill from "../../../ui/Pill";
import TabLine from "../../../ui/TabLine";
import { href, useTick } from "../../../../lib/app";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import "../../recruitment-cutting.css";
import type { Lang } from "../../../../lib/kelas";
import { useIvMine, type IvMineSlot } from "../../../../lib/recruitment/iv-client";
import type { IvStage } from "../../../../lib/recruitment/interview";
import type { RecRights } from "../../../../lib/recruitment/types";
import Lembar from "./Lembar";
import Penilaian from "./Penilaian";
import Template from "./Template";
import { TeachCard, TeachPj, teachSample, teachTop } from "./TeachSlotku";
import { PN } from "./penilaianStrings";
import { IV } from "./ivStrings";
import { SK } from "./slotStrings";
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
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const TONE = { lolos: "ok", ragu: "warn", cut: "danger" } as const;

const first = (nama?: string) => (nama ?? "").split(" ")[0];
const weekday = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
  }).format(new Date(iso));

/** The checklist an examiner ticks off before the shift (a reading aid: it is kept on this browser only). */
function Persiapan({ lang, id }: { lang: Lang; id: number }) {
  const w = SK[lang];
  const kunci = `iris:rec:prep:${id}`;
  const [on, setOn] = useState<boolean[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(kunci) ?? "null");
      if (Array.isArray(v) && v.length === w.prepItems.length) return v.map(Boolean);
    } catch {
      /* no storage: start unticked */
    }
    return w.prepItems.map(() => false);
  });
  const ubah = (i: number) => {
    const n = on.map((x, j) => (j === i ? !x : x));
    setOn(n);
    try {
      localStorage.setItem(kunci, JSON.stringify(n));
    } catch {
      /* the tick still shows */
    }
  };
  return (
    <Disclose
      head={
        <>
          <b>{w.prep}</b>
          <span className="hint num" style={{ marginLeft: 8 }}>
            {on.filter(Boolean).length}/{w.prepItems.length}
          </span>
        </>
      }
    >
      <ul className="r4prep">
        {w.prepItems.map((p, i) => (
          <li key={p}>
            <Checkbox checked={on[i]} onChange={() => ubah(i)} label={p} />
          </li>
        ))}
      </ul>
    </Disclose>
  );
}

function SlotCard({
  lang,
  stage,
  s,
  onOpen,
  qr,
}: {
  lang: Lang;
  stage: IvStage;
  s: IvMineSlot;
  onOpen: (id: number) => void;
  /** May open the QR screen (the attendance right) */
  qr: boolean;
}) {
  const w = IV(lang).mine;
  const k = SK[lang];
  const now = useTick(30_000);
  const mulai = Date.parse(s.startsAt);
  const selesai = Date.parse(s.endsAt);
  const live = now >= mulai && now <= selesai;
  const mine = s.booths.filter((b) => b.mine);
  const lamaMnt = Math.max(1, Math.round((selesai - mulai) / 60_000));
  const jalanMnt = Math.min(lamaMnt, Math.max(0, Math.round((now - mulai) / 60_000)));
  const kandidat = mine.find((b) => b.candidate)?.candidate;
  const judul =
    stage === "wawancara" && mine.length
      ? k.boothTitle(s.room, mine[0].index + 1)
      : w.slotTitle(s.room);
  return (
    <section className="panel r4slot" data-live={live ? "yes" : undefined}>
      <div className="panel__head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h3 className="panel__title">{judul}</h3>
          <span className="hint num">
            {w.when(hari(s.startsAt, lang), jam(s.startsAt), jam(s.endsAt))}
          </span>
        </div>
        <Pill tone={live ? "accent" : undefined}>
          {live ? k.running : weekday(s.startsAt, lang)}
        </Pill>
      </div>
      {s.role === "penguji" ? (
        <>
          {mine.map((b) =>
            b.candidate ? (
              <div key={b.index} className="stack r4booth" style={{ gap: 10 }}>
                <div className="r4cd">
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <b className="r4cd__n">{b.candidate.nama}</b>
                    <span className="hint mono">
                      {b.candidate.nim} · {b.candidate.kelas}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {b.here ? (
                      <Pill tone="ok">{k.hereQr(jam(b.here))}</Pill>
                    ) : (
                      live && <Pill>{w.notHere}</Pill>
                    )}
                    {b.case?.status && (
                      <Pill tone={b.case.status === "gugur" ? "danger" : "warn"}>
                        {b.case.status === "gugur" ? w.caseGugur : w.caseSusulan}
                      </Pill>
                    )}
                    {b.verdict && <Pill tone={TONE[b.verdict]}>{w.verdict[b.verdict]}</Pill>}
                  </span>
                </div>
                {b.pair.length > 0 && (
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="hint">{k.withLabel}</span>
                    {b.pair.map((c) => (
                      <span key={c} className="acode">
                        {c}
                      </span>
                    ))}
                    {b.pair.length < 2 && stage === "wawancara" && (
                      <span className="hint">{k.noPartner}</span>
                    )}
                    <span className="hint num">{w.sentOf(b.sent, b.need)}</span>
                  </div>
                )}
              </div>
            ) : (
              <div key={b.index} className="rec-note">
                <span>{k.standby}</span>
              </div>
            ),
          )}
          {mine.length === 0 && (
            <div className="rec-note">
              <span>{w.otherBooth}</span>
            </div>
          )}
          {live && (
            <div className="r2cap">
              <span className="r2cap__bar">
                <i style={{ width: `${(jalanMnt / lamaMnt) * 100}%` }} />
              </span>
              <span className="hint num">{k.progress(jalanMnt, lamaMnt)}</span>
            </div>
          )}
          <div className="row r4slot__acts">
            {live && qr && (
              <a className="btn btn--inverse" href={href(lang, "/recruitment/qr")}>
                <span className="btn__label">{k.qrShift}</span>
              </a>
            )}
            {kandidat && (
              <button
                type="button"
                className={`btn ${live ? "btn--primary" : "btn--inverse"}`}
                onClick={() => onOpen(kandidat.id)}
              >
                <span className="btn__label">
                  {mine.find((b) => b.candidate)?.mineSent
                    ? w.mineSent
                    : stage === "wawancara"
                      ? k.openSheet(first(kandidat.nama))
                      : w.open}
                </span>
              </button>
            )}
          </div>
          {!live && now < mulai && (
            <>
              <Persiapan lang={lang} id={s.id} />
              <span className="hint">{k.opensAt(hari(s.startsAt, lang), jam(s.startsAt))}</span>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

/** A shift where this person is PJ, not an examiner: the duties, the QR screen or the stand-in. */
function PjCard({
  lang,
  stage,
  s,
  qr,
  refresh,
}: {
  lang: Lang;
  stage: IvStage;
  s: IvMineSlot;
  qr: boolean;
  refresh: () => void;
}) {
  const k = SK[lang];
  const luar = s.role === "pj_luar";
  const [dlg, setDlg] = useState(false);
  const [siapa, setSiapa] = useState("");
  const [sibuk, setSibuk] = useState(false);
  async function ganti() {
    setSibuk(true);
    const r = await recPost<{ ok: true }>("iv-standin", { stage, slotId: s.id, from: siapa });
    setSibuk(false);
    if (isFail(r)) return void window.Toast?.show(k.standFail, "danger");
    const kode = s.penguji.find((p) => p.nim === siapa)?.kode ?? siapa;
    window.Toast?.show(k.standDone(kode), "ok");
    setDlg(false);
    setSiapa("");
    refresh();
  }
  return (
    <section className="panel r4slot r4slot--pj">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h3 className="panel__title">{luar ? k.pjOutTitle : k.pjInTitle}</h3>
          <span className="hint num">
            {k.shift(hari(s.startsAt, lang), jam(s.startsAt), jam(s.endsAt))}
          </span>
        </div>
        <Pill>{luar ? k.pjOutBadge : k.pjInBadge}</Pill>
      </div>
      <ul className="r4prep r4prep--duty">
        {(luar ? k.dutyOut : k.dutyIn).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <div className="row r4slot__acts">
        {luar ? (
          qr && (
            <a className="btn btn--inverse" href={href(lang, "/recruitment/qr")}>
              <span className="btn__label">{k.qrShift}</span>
            </a>
          )
        ) : (
          <button type="button" className="btn btn--inverse" onClick={() => setDlg(true)}>
            <UserSwitchIcon size={18} aria-hidden="true" />
            <span className="btn__label">{k.standIn}</span>
          </button>
        )}
      </div>
      <Dialog
        open={dlg}
        onOpenChange={setDlg}
        title={k.standTitle}
        description={k.standDesc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDlg(false)}>
              <span className="btn__label">{k.cancel}</span>
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!siapa || sibuk}
              onClick={() => void ganti()}
            >
              <span className="btn__label">{k.standGo}</span>
            </button>
          </>
        }
      >
        <Dropdown
          id={`iv-standin-${s.id}`}
          label={k.standPick}
          hideLabel
          value={siapa}
          onChange={setSiapa}
          options={[
            { value: "", label: k.standPick },
            ...s.penguji.map((p) => ({ value: p.nim, label: `${p.kode} · ${s.room}` })),
          ]}
        />
      </Dialog>
    </section>
  );
}

function Slotku({
  lang,
  stage,
  onOpen,
  qr,
  qrPj,
  onNilai,
}: {
  lang: Lang;
  stage: IvStage;
  onOpen: (id: number) => void;
  /** Who may read everyone's scores gets a way there from an empty Slotku. */
  onNilai?: () => void;
  /** The outside PJ's own shift may show its QR screen even without the attendance right */
  qrPj: boolean;
  qr: boolean;
}) {
  const w = IV(lang).mine;
  const k = SK[lang];
  const mine = useIvMine(stage);
  if (!mine.data) return <span className="skeleton" style={{ height: 240 }} />;
  if (!mine.data.slots.length)
    return (
      <div className="rec-note">
        <b>{w.none}</b>
        <span>{w.noneHint}</span>
        {onNilai && (
          <span>
            <button type="button" className="btn btn--inverse btn--sm" onClick={onNilai}>
              <span className="btn__label">{IV(lang).seg.nilai}</span>
            </button>
          </span>
        )}
      </div>
    );
  const slots = mine.data.slots;
  const pj = slots.filter((s) => s.role !== "penguji");
  const own = slots.filter((s) => s.role === "penguji");
  if (stage === "mengajar") {
    const sample = teachSample(lang);
    return (
      <div className="stack">
        <div className="row row--between r4my__top">
          <span className="hint">{teachTop(lang, own.length, pj.length)}</span>
          {mine.data.template.example && (
            <span title={sample.tip}>
              <Pill tone="warn">{sample.label}</Pill>
            </span>
          )}
        </div>
        {pj.length > 0 && (
          <div className="r4my">
            {pj.map((s) => (
              <TeachPj key={`${s.id}-${s.role}`} lang={lang} s={s} qr={qr} refresh={mine.refresh} />
            ))}
          </div>
        )}
        <div className="r4my">
          {own.map((s) => (
            <TeachCard
              key={s.id}
              lang={lang}
              s={s}
              tpl={mine.data!.template}
              me={mine.data!.me.kode}
              qr={qr}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="row row--between r4my__top">
        <span className="hint">
          {k.top(own.length, pj.length, stage === "wawancara" ? k.verbIv : k.verbTeach)}
        </span>
        {stage === "wawancara" && (
          <span title={k.proposalTip}>
            <Pill tone="warn">{k.proposal}</Pill>
          </span>
        )}
      </div>
      <div className="r4my">
        {own.map((s) => (
          <SlotCard key={s.id} lang={lang} stage={stage} s={s} onOpen={onOpen} qr={qr} />
        ))}
        {pj.map((s) => (
          <PjCard
            key={`${s.id}-${s.role}`}
            lang={lang}
            stage={stage}
            s={s}
            qr={qr || (qrPj && s.role === "pj_luar")}
            refresh={mine.refresh}
          />
        ))}
      </div>
    </div>
  );
}

export default function IvTab({
  lang,
  stage,
  rights,
  qrShift,
  lead,
  templateLabel,
}: {
  lang: Lang;
  stage: IvStage;
  rights: RecRights | null;
  /** Outside PJ of a shift: may open that shift's QR screen without the attendance right */
  qrShift?: boolean;
  /** A tab in front of Slotku (Tubes: the running order). */
  lead?: { label: string; node: ReactNode };
  /** Overrides the Template tab's label. */
  templateLabel?: string;
}) {
  const w = IV(lang);
  const bisaNilai = rights?.plotting === true;
  const bisaTemplate = rights?.bank === true;
  const [bag, setBag] = useState<"lead" | "mine" | "nilai" | "template">(lead ? "lead" : "mine");
  const [buka, setBuka] = useState<number | null>(null);
  const aktif =
    bag === "template" && !bisaTemplate ? "mine" : bag === "lead" && !lead ? "mine" : bag;
  return (
    <div className="stack">
      <div className="n7-bar">
        <TabLine
          label={w.title[stage]}
          value={aktif}
          onChange={(v) => setBag(v)}
          tabs={[
            ...(lead ? [{ v: "lead" as const, label: lead.label }] : []),
            { v: "mine" as const, label: w.seg.mine },
            { v: "nilai" as const, label: bisaNilai ? w.seg.nilai : PN[lang].tabMine },
            ...(bisaTemplate
              ? [
                  {
                    v: "template" as const,
                    label:
                      templateLabel ?? (stage === "wawancara" ? w.seg.templateWaw : w.seg.template),
                  },
                ]
              : []),
          ]}
        />
      </div>
      {aktif === "lead" && lead ? (
        lead.node
      ) : aktif === "mine" ? (
        <Slotku
          lang={lang}
          stage={stage}
          onOpen={setBuka}
          qr={rights?.attendance === true}
          qrPj={qrShift === true}
          onNilai={bisaNilai ? () => setBag("nilai") : undefined}
        />
      ) : aktif === "nilai" ? (
        <Penilaian lang={lang} stage={stage} />
      ) : (
        <Template lang={lang} stage={stage} />
      )}
      {buka !== null && (
        <Lembar
          lang={lang}
          stage={stage}
          id={buka}
          key={buka}
          onClose={() => setBuka(null)}
          onNext={setBuka}
        />
      )}
    </div>
  );
}
