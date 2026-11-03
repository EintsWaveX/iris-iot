/**
 * Slotku of the teaching test (mockup r6-slotku): an evening is one card with
 * your panel, the running order of the turns and a button on the turn that
 * is on; a PJ gets the evening's duties with the QR screen and the stand-in.
 */
import { useState } from "react";
import { UserSwitchIcon } from "@phosphor-icons/react";
import Dialog from "../../../ui/Dialog";
import Disclose from "../../../ui/Disclose";
import Dropdown from "../../../ui/Dropdown";
import { Checkbox } from "../../../ui/Controls";
import Pill from "../../../ui/Pill";
import Tooltip from "../../../ui/Tooltip";
import { dict, href, localeOf, useTick } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import type { IvMineResponse, IvMineSlot } from "../../../../lib/recruitment/iv-client";
import { IV } from "./ivStrings";

interface TsWords {
  top: (n: number, pj: number) => string;
  sample: string;
  sampleTip: string;
  running: string;
  done: string;
  notStarted: string;
  panel: string;
  turnOf: (a: number, b: number) => string;
  absent: string;
  sentBadge: string;
  notSent: string;
  nowBadge: (t: string | null) => string;
  hereWaiting: string;
  open: (n: string) => string;
  finish: string;
  view: string;
  qr: string;
  prep: string;
  prepItems: string[];
  allSent: string;
  opens: (d: string, t: string) => string;
  pjTitle: string;
  pjBadge: string;
  duties: string[];
  standIn: string;
  standTitle: string;
  standDesc: string;
  standPick: string;
  standGo: string;
  cancel: string;
  standDone: (who: string) => string;
  standFail: string;
}

const TS = dict<TsWords>({
  id: {
    top: (n, pj) =>
      `Kamu menguji di ${n} malam${pj ? ` dan jadi PJ di ${pj}` : ""}. Hanya malam dan kandidatmu sendiri yang tampil di sini.`,
    sample: "Rubrik Contoh",
    sampleTip:
      "Baris rubrik dan tingkat 1 sampai 5 masih contoh. Akademik menetapkannya di tab Template.",
    running: "Berjalan",
    done: "Selesai",
    notStarted: "Belum mulai",
    panel: "Panelmu",
    turnOf: (a, b) => `Giliran ${a} dari ${b}`,
    absent: "Tidak hadir, Susulan",
    sentBadge: "Lembar terkirim",
    notSent: "Belum kamu kirim",
    nowBadge: (t) => (t ? `Giliran sekarang · QR ${t}` : "Giliran sekarang"),
    hereWaiting: "Hadir, menunggu",
    open: (n) => `Buka Lembar ${n}`,
    finish: "Lengkapi",
    view: "Lihat",
    qr: "Layar QR Malam Ini",
    prep: "Persiapan",
    prepItems: [
      "Datang 30 menit sebelum mulai, briefing panel",
      "Baca rubrik dan indikatornya (lembar membukanya di langkah Kesimpulan)",
      "Sepakati siapa yang memegang waktu di panel",
      "Bawa laptop untuk mengisi lembar",
      "Pastikan proyektor dan papan tulis siap",
    ],
    allSent: "Semua lembar malam ini sudah kamu kirim.",
    opens: (d, t) => `Lembarnya terbuka saat malam mulai, ${d} pukul ${t}.`,
    pjTitle: "Kamu PJ malam ini",
    pjBadge: "PJ",
    duties: [
      "Hadir 30 menit sebelum malam mulai dan pastikan semua penguji siap",
      "Presensi penguji dan CaAs, buka ruangan, pimpin briefing singkat",
      "Pegang layar QR malam ini dan urutan giliran",
      "Siap menggantikan penguji yang mendadak tidak datang",
    ],
    standIn: "Gantikan Penguji",
    standTitle: "Gantikan Penguji",
    standDesc:
      "Hanya untuk penguji yang mendadak tidak hadir malam ini. Yang izin sehari sebelumnya digantikan lewat Plotting, bukan di sini.",
    standPick: "Pilih penguji",
    standGo: "Gantikan",
    cancel: "Batal",
    standDone: (w) => `Kamu menggantikan ${w}. Panelnya diberi tahu.`,
    standFail: "Belum bisa diganti. Coba lagi.",
  },
  en: {
    top: (n, pj) =>
      `You examine on ${n} evenings${pj ? ` and are the PJ on ${pj}` : ""}. Only your own evenings and candidates show here.`,
    sample: "Sample Rubric",
    sampleTip:
      "The rubric rows and the 1 to 5 levels are still samples. The Akademik sets them in the Template tab.",
    running: "Running",
    done: "Done",
    notStarted: "Not started",
    panel: "Your panel",
    turnOf: (a, b) => `Turn ${a} of ${b}`,
    absent: "Absent, makeup",
    sentBadge: "Sheet sent",
    notSent: "Not sent by you",
    nowBadge: (t) => (t ? `Now · QR ${t}` : "Now"),
    hereWaiting: "Here, waiting",
    open: (n) => `Open ${n}'s Sheet`,
    finish: "Finish",
    view: "View",
    qr: "This Evening's QR Screen",
    prep: "Before you start",
    prepItems: [
      "Arrive 30 minutes before the start, panel briefing",
      "Read the rubric and its indicators (the sheet shows them in the Conclusions step)",
      "Agree who keeps time in the panel",
      "Bring a laptop to fill the sheet",
      "Check the projector and the board",
    ],
    allSent: "You sent every sheet of this evening.",
    opens: (d, t) => `Its sheets open when the evening starts, ${d} at ${t}.`,
    pjTitle: "You're the PJ this evening",
    pjBadge: "PJ",
    duties: [
      "Arrive 30 minutes before the evening and make sure every examiner is ready",
      "Take attendance of examiners and CaAs, open the rooms, lead a short briefing",
      "Hold tonight's QR screen and the running order",
      "Ready to stand in for an examiner who suddenly does not come",
    ],
    standIn: "Stand in for an Examiner",
    standTitle: "Stand In for an Examiner",
    standDesc:
      "Only for an examiner who suddenly doesn't show tonight. One who excused themselves the day before is replaced in Plotting, not here.",
    standPick: "Pick an examiner",
    standGo: "Stand In",
    cancel: "Cancel",
    standDone: (w) => `You stand in for ${w}. Their panel is told.`,
    standFail: "Couldn't stand in. Try again.",
  },
  zh: {
    top: (n, pj) =>
      `你在 ${n} 个晚上担任考官${pj ? `，并在 ${pj} 个晚上担任 PJ` : ""}。这里只显示你自己的晚上和候选人。`,
    sample: "示例评分表",
    sampleTip: "评分行和 1 至 5 级仍是示例。Akademik 在“模板”页确定它们。",
    running: "进行中",
    done: "已完成",
    notStarted: "未开始",
    panel: "你的评审组",
    turnOf: (a, b) => `第 ${a} 位，共 ${b} 位`,
    absent: "缺席，补考",
    sentBadge: "表格已提交",
    notSent: "你还没提交",
    nowBadge: (t) => (t ? `当前 · 扫码 ${t}` : "当前"),
    hereWaiting: "已到，等待",
    open: (n) => `打开 ${n} 的表格`,
    finish: "补完",
    view: "查看",
    qr: "今晚的二维码屏幕",
    prep: "开始之前",
    prepItems: [
      "开始前 30 分钟到场，评审组简报",
      "阅读评分表及其指标（表格在“结论”步骤中显示）",
      "商定评审组中谁掌握时间",
      "带笔记本电脑填写表格",
      "检查投影仪和白板",
    ],
    allSent: "你已提交今晚所有表格。",
    opens: (d, t) => `表格在晚上开始时开放，${d} ${t}。`,
    pjTitle: "你是今晚的 PJ",
    pjBadge: "PJ",
    duties: [
      "晚上开始前 30 分钟到场，确保所有考官就绪",
      "考官和 CaAs 点名，开门，带领简短简报",
      "掌管今晚的二维码屏幕和出场顺序",
      "随时准备替换临时缺席的考官",
    ],
    standIn: "顶替考官",
    standTitle: "顶替考官",
    standDesc: "仅用于今晚临时缺席的考官。前一天请假的考官在排表页替换，不在这里。",
    standPick: "选择考官",
    standGo: "顶替",
    cancel: "取消",
    standDone: (w) => `你顶替了 ${w}。他们的评审组已收到通知。`,
    standFail: "暂时无法顶替。请重试。",
  },
});

const day = (iso: string, lang: Lang, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(localeOf(lang), { timeZone: "Asia/Jakarta", ...o }).format(new Date(iso));
const hm = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
const first = (n?: string) => (n ?? "").split(" ")[0];

function Prep({ lang, id }: { lang: Lang; id: number }) {
  const t = TS[lang];
  const kunci = `iris:rec:prep6:${id}`;
  const [on, setOn] = useState<boolean[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(kunci) ?? "null");
      if (Array.isArray(v) && v.length === t.prepItems.length) return v.map(Boolean);
    } catch {
      /* no storage: start with the first ticked */
    }
    return t.prepItems.map((_, i) => i === 0);
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
          <b>{t.prep}</b>
          <span className="hint num" style={{ marginLeft: 8 }}>
            {on.filter(Boolean).length}/{t.prepItems.length}
          </span>
        </>
      }
    >
      <ul className="r4prep">
        {t.prepItems.map((p, i) => (
          <li key={p}>
            <Checkbox checked={on[i]} onChange={() => ubah(i)} label={p} />
          </li>
        ))}
      </ul>
    </Disclose>
  );
}

/** One evening of the teaching test where you sit in the panel. */
export function TeachCard({
  lang,
  s,
  tpl,
  me,
  qr,
  onOpen,
}: {
  lang: Lang;
  s: IvMineSlot;
  tpl: IvMineResponse["template"];
  me: string | null;
  qr: boolean;
  onOpen: (id: number) => void;
}) {
  const t = TS[lang];
  const now = useTick(30_000);
  const start = Date.parse(s.startsAt);
  const end = Date.parse(s.endsAt);
  const running = now >= start && now <= end;
  const turnMs = (tpl.minutes + tpl.gap) * 60_000;
  const queue = s.booths.filter((b) => b.candidate);
  const cur = running
    ? Math.max(0, Math.min(queue.length - 1, Math.floor((now - start) / Math.max(1, turnMs))))
    : -1;
  const allSent = queue.length > 0 && queue.every((b) => b.mineSent);
  const finished = allSent || (!running && now > end);
  const status = running ? t.running : finished ? t.done : t.notStarted;
  const weekday = day(s.startsAt, lang, { weekday: "long" });
  const mates = s.penguji.filter((p) => p.kode !== me);
  return (
    <section className="panel r4slot r6slot" data-live={running ? "yes" : undefined}>
      <div className="panel__head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h3 className="panel__title">
            {s.room} · {weekday}
          </h3>
          <span className="hint num">
            {day(s.startsAt, lang, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · {hm(start)} {lang === "id" ? "sampai" : lang === "zh" ? "至" : "to"} {hm(end)}
          </span>
        </div>
        <Pill tone={running ? "accent" : finished ? "ok" : undefined}>{status}</Pill>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="hint">{t.panel}</span>
        {me && <span className="acode acode--me">{me}</span>}
        {mates.map((p) => (
          <span key={p.nim} className="acode">
            {p.kode}
          </span>
        ))}
      </div>
      {running && queue.length > 0 && (
        <div className="r2cap">
          <span className="r2cap__bar">
            <i style={{ width: `${((cur + 0.6) / queue.length) * 100}%` }} />
          </span>
          <span className="hint num">{t.turnOf(cur + 1, queue.length)}</span>
        </div>
      )}
      <ol className="r6q">
        {queue.map((b, i) => {
          const c = b.candidate!;
          const ab = !!b.case?.status && !b.mineSent;
          const st = ab
            ? "absen"
            : b.mineSent || (running && i < cur) || finished
              ? "selesai"
              : running && i === cur
                ? "sekarang"
                : "tunggu";
          return (
            <li key={b.index} data-st={st}>
              <span className="num r6q__t">{hm(start + b.index * turnMs)}</span>
              <span className="stack" style={{ gap: 3, minWidth: 0 }}>
                <b>{c.nama}</b>
                <span className="hint mono">
                  {c.nim} · {c.kelas}
                </span>
                <span className="r6q__s">
                  {st === "absen" ? (
                    <Pill>{t.absent}</Pill>
                  ) : st === "selesai" ? (
                    <Pill tone="ok">{b.mineSent ? t.sentBadge : t.notSent}</Pill>
                  ) : st === "sekarang" ? (
                    <Pill tone="accent">{t.nowBadge(b.here ? hm(Date.parse(b.here)) : null)}</Pill>
                  ) : (
                    <Pill>{running ? t.hereWaiting : t.notStarted}</Pill>
                  )}
                </span>
              </span>
              {st === "sekarang" ? (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => onOpen(c.id)}
                >
                  {t.open(first(c.nama))}
                </button>
              ) : st === "selesai" ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => onOpen(c.id)}
                >
                  {b.mineSent ? t.view : t.finish}
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ol>
      {running ? (
        qr && (
          <div className="row r4slot__acts">
            <a className="btn btn--inverse" href={href(lang, "/recruitment/qr")}>
              <span className="btn__label">{t.qr}</span>
            </a>
          </div>
        )
      ) : (
        <>
          {!finished && <Prep lang={lang} id={s.id} />}
          <span className="hint">
            {finished
              ? t.allSent
              : t.opens(
                  day(s.startsAt, lang, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }),
                  hm(start),
                )}
          </span>
        </>
      )}
    </section>
  );
}

/** The evening where this person is the PJ: the duties, the QR screen and the stand-in. */
export function TeachPj({
  lang,
  s,
  qr,
  refresh,
}: {
  lang: Lang;
  s: IvMineSlot;
  qr: boolean;
  refresh: () => void;
}) {
  const t = TS[lang];
  const w = IV(lang);
  const [dlg, setDlg] = useState(false);
  const [siapa, setSiapa] = useState("");
  const [sibuk, setSibuk] = useState(false);
  async function ganti() {
    setSibuk(true);
    const r = await recPost<{ ok: true }>("iv-standin", {
      stage: "mengajar",
      slotId: s.id,
      from: siapa,
    });
    setSibuk(false);
    if (isFail(r)) return void window.Toast?.show(t.standFail, "danger");
    const kode = s.penguji.find((p) => p.nim === siapa)?.kode ?? siapa;
    window.Toast?.show(t.standDone(kode), "ok");
    setDlg(false);
    setSiapa("");
    refresh();
  }
  const when = day(s.startsAt, lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <section className="panel r4slot r4slot--pj">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h3 className="panel__title">{t.pjTitle}</h3>
          <span className="hint num">
            {when} · {hm(Date.parse(s.startsAt))}{" "}
            {lang === "id" ? "sampai" : lang === "zh" ? "至" : "to"} {hm(Date.parse(s.endsAt))}
          </span>
        </div>
        <Pill>{t.pjBadge}</Pill>
      </div>
      <ul className="r4prep r4prep--duty">
        {t.duties.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <div className="row r4slot__acts">
        {qr && (
          <a className="btn btn--inverse" href={href(lang, "/recruitment/qr")}>
            <span className="btn__label">{t.qr}</span>
          </a>
        )}
        {s.penguji.length > 0 && (
          <Tooltip label={t.standDesc}>
            <button type="button" className="btn btn--inverse" onClick={() => setDlg(true)}>
              <UserSwitchIcon size={18} aria-hidden="true" />
              <span className="btn__label">{t.standIn}</span>
            </button>
          </Tooltip>
        )}
      </div>
      <Dialog
        open={dlg}
        onOpenChange={setDlg}
        title={t.standTitle}
        description={t.standDesc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDlg(false)}>
              <span className="btn__label">{t.cancel}</span>
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!siapa || sibuk}
              onClick={() => void ganti()}
            >
              <span className="btn__label">{t.standGo}</span>
            </button>
          </>
        }
      >
        <Dropdown
          id={`iv-standin6-${s.id}`}
          label={w.crew.examiners}
          hideLabel
          value={siapa}
          onChange={setSiapa}
          options={[
            { value: "", label: t.standPick },
            ...s.penguji.map((p) => ({ value: p.nim, label: `${p.kode} · ${s.room}` })),
          ]}
        />
      </Dialog>
    </section>
  );
}

export const teachTop = (lang: Lang, n: number, pj: number) => TS[lang].top(n, pj);
export const teachSample = (lang: Lang) => ({ label: TS[lang].sample, tip: TS[lang].sampleTip });
