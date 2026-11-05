/**
 * Malam Ujian, the Live Coding part (B7.5, mockup n7-malam): is the judge ready, how
 * long is its queue, and what every seat has so far. There is nothing to grade by hand:
 * a seat's points come from the tests its best Submit passed. Staff of the room see it
 * while the Live Coding timer runs and afterwards.
 */
import { useState } from "react";
import Dialog from "../../../../ui/Dialog";
import { NOUN, Paged } from "../../../../ui/Pager";
import { ArrowsClockwiseIcon, PlugsIcon, ProhibitIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../../../lib/kelas";
import { dict } from "../../../../../lib/app";
import { usePoll } from "../../../../../lib/hooks";
import { isFail, recGet, recPost } from "../../../../../lib/recruitment/client";
import type { LccRoom } from "../../../../../lib/recruitment/lcc-api";
import Skeleton from "../../../../ui/Skeleton";

const JT = dict({
  id: {
    title: "Live Coding",
    lede: "Nilainya otomatis dari test yang lolos pada Submit terbaik tiap soal. Tidak ada yang perlu dinilai manual.",
    judge: "Judge",
    ready: "Siap",
    notReady: "Belum siap",
    notReadyBody:
      "PC Lab belum menjawab. Kiriman peserta menunggu di queue dan dinilai begitu judge hidup. Cek PC Lab.",
    queue: "Queue",
    waiting: (n: number) => `${n} menunggu`,
    running: (n: number) => `${n} sedang dinilai`,
    refresh: "Muat Ulang",
    seat: "Kursi",
    name: "Peserta",
    problems: "Soal",
    score: "Nilai",
    pending: "menunggu judge",
    noHand: "belum dapat soal",
    none: "belum ada kiriman",
    pass: (p: number | null, t: number | null) => (p === null || t === null ? "-" : `${p}/${t}`),
    empty: "Belum ada kursi di ruang ini.",
    fail: "Belum bisa dimuat. Coba lagi.",
    outOf: (n: number) => `dari ${n}`,
    flush: "Tutup Antrean",
    flushTitle: "Tutup antrean judge?",
    flushBody: (n: number) =>
      `${n} kiriman di ruang ini masih menunggu judge yang tidak menjawab. Kalau ditutup, kiriman itu dianggap gagal dan bernilai 0, supaya Finalkan tidak tertahan. Ini tidak bisa dibatalkan.`,
    flushAuto: "Kiriman yang masih menunggu 15 menit setelah ruang selesai ditutup sendiri.",
    flushYes: "Tutup Antrean",
    flushNo: "Batal",
    flushDone: (n: number) => `${n} kiriman ditutup.`,
    flushFail: "Belum bisa ditutup. Coba lagi.",
  },
  en: {
    title: "Live Coding",
    lede: "Scores come automatically from the tests passed by each problem's best Submit. Nothing needs grading by hand.",
    judge: "Judge",
    ready: "Ready",
    notReady: "Not ready",
    notReadyBody:
      "The lab PC has not answered. Candidates' submissions wait in the queue and are judged as soon as the judge is back. Check the lab PC.",
    queue: "Queue",
    waiting: (n: number) => `${n} waiting`,
    running: (n: number) => `${n} being judged`,
    refresh: "Refresh",
    seat: "Seat",
    name: "Candidate",
    problems: "Problems",
    score: "Score",
    pending: "waiting for the judge",
    noHand: "no problems dealt yet",
    none: "nothing sent yet",
    pass: (p: number | null, t: number | null) => (p === null || t === null ? "-" : `${p}/${t}`),
    empty: "There are no seats in this room yet.",
    fail: "It could not load. Try again.",
    outOf: (n: number) => `of ${n}`,
    flush: "Close Queue",
    flushTitle: "Close the judge queue?",
    flushBody: (n: number) =>
      `${n} submission(s) in this room are still waiting for a judge that does not answer. Closing them counts them as failed, worth 0, so Finalkan is not held up. This cannot be undone.`,
    flushAuto:
      "Submissions still waiting 15 minutes after the room finished are closed by themselves.",
    flushYes: "Close Queue",
    flushNo: "Cancel",
    flushDone: (n: number) => `${n} submission(s) closed.`,
    flushFail: "It could not be closed. Try again.",
  },
  zh: {
    title: "现场编程",
    lede: "分数由每道题最好一次提交通过的测试自动计算，无需手动评分。",
    judge: "评测机",
    ready: "就绪",
    notReady: "未就绪",
    notReadyBody:
      "实验室电脑没有响应。考生的提交在队列中等待，评测机恢复后会立即评测。请检查实验室电脑。",
    queue: "队列",
    waiting: (n: number) => `${n} 个等待`,
    running: (n: number) => `${n} 个评测中`,
    refresh: "刷新",
    seat: "座位",
    name: "考生",
    problems: "题目",
    score: "得分",
    pending: "等待评测",
    noHand: "尚未发题",
    none: "尚未提交",
    pass: (p: number | null, t: number | null) => (p === null || t === null ? "-" : `${p}/${t}`),
    empty: "这个房间还没有座位。",
    fail: "无法加载，请重试。",
    outOf: (n: number) => `满分 ${n}`,
    flush: "关闭队列",
    flushTitle: "关闭评测队列？",
    flushBody: (n: number) =>
      `本考场还有 ${n} 个提交在等待没有响应的评测机。关闭后它们按失败处理、记 0 分，这样“定稿”不会被卡住。此操作无法撤销。`,
    flushAuto: "考场结束 15 分钟后仍在等待的提交会自动关闭。",
    flushYes: "关闭队列",
    flushNo: "取消",
    flushDone: (n: number) => `已关闭 ${n} 个提交。`,
    flushFail: "无法关闭，请重试。",
  },
});

export default function JudgeTab({
  lang,
  roomId,
  selesai = false,
}: {
  lang: Lang;
  roomId: number;
  /** The room has finished: only then can its waiting jobs be given up on */
  selesai?: boolean;
}) {
  const t = JT[lang];
  const [tanya, setTanya] = useState(false);
  const poll = usePoll<LccRoom | null>(
    async () => {
      const r = await recGet<LccRoom & { ok: true }>("lcc-room", { id: String(roomId) });
      if (isFail(r)) throw new Error(String(r.status || 408));
      return r;
    },
    60_000,
    true,
    ["recroom", "recjudge"],
    300,
  );
  const d = poll.data;
  async function tutup() {
    setTanya(false);
    const r = await recPost<{ ok: true; count: number }>("lcc-flush", { id: roomId });
    if (isFail(r)) window.Toast?.show(t.flushFail, "danger");
    else window.Toast?.show(t.flushDone(r.count), "ok");
    poll.refresh();
  }
  if (!d)
    return poll.errors >= 2 ? (
      <section className="panel">
        <p className="hint" style={{ margin: 0 }}>
          {t.fail}
        </p>
      </section>
    ) : (
      <Skeleton height={200} />
    );

  const menunggu = d.seats.reduce((n, x) => n + x.waiting, 0);
  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="panel__title">{t.title}</h2>
          <span className="hint">{t.lede}</span>
        </div>
        <button type="button" className="btn btn--inverse btn--sm" onClick={poll.refresh}>
          <ArrowsClockwiseIcon size={16} aria-hidden="true" />
          {t.refresh}
        </button>
      </div>

      <div className="judgebar">
        <div className="judgebar__cell" data-tone={d.judgeReady ? "ok" : "warn"}>
          {d.judgeReady ? (
            <PlugsIcon size={20} aria-hidden="true" />
          ) : (
            <ProhibitIcon size={20} aria-hidden="true" />
          )}
          <span className="stack" style={{ gap: 0 }}>
            <span className="label-caps">{t.judge}</span>
            <b>{d.judgeReady ? t.ready : t.notReady}</b>
          </span>
        </div>
        <div className="judgebar__cell">
          <span className="stack" style={{ gap: 0 }}>
            <span className="label-caps">{t.queue}</span>
            <b>
              {t.waiting(d.queue.waiting)} · {t.running(d.queue.running)}
            </b>
          </span>
        </div>
      </div>
      {!d.judgeReady && (
        <div className="rec-note rec-note--warn" role="alert">
          <span>{t.notReadyBody}</span>
        </div>
      )}
      {selesai && d.info.canWorkers && menunggu > 0 && (
        <div className="rec-note rec-note--warn">
          <span className="stack" style={{ gap: 6 }}>
            <span>{t.flushAuto}</span>
            <span>
              <button
                type="button"
                className="btn btn--inverse btn--sm"
                onClick={() => setTanya(true)}
              >
                {t.flush}
              </button>
            </span>
          </span>
        </div>
      )}
      <Dialog
        open={tanya}
        onOpenChange={setTanya}
        size="sm"
        lang={lang}
        title={t.flushTitle}
        description={t.flushBody(menunggu)}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setTanya(false)}>
              {t.flushNo}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void tutup()}>
              {t.flushYes}
            </button>
          </>
        }
      />

      {d.seats.length === 0 ? (
        <section className="panel">
          <p className="hint" style={{ margin: 0 }}>
            {t.empty}
          </p>
        </section>
      ) : (
        <Paged items={d.seats} id="judge-seats" size={20} noun={NOUN[lang].peserta} lang={lang}>
          {(rowsP) => (
            <section className="panel rec-tablecard">
              <div className="scrollx">
                <table className="rec-table">
                  <thead>
                    <tr>
                      <th className="num">{t.seat}</th>
                      <th>{t.name}</th>
                      <th>{t.problems}</th>
                      <th className="num">
                        {t.score} ({t.outOf(d.cap)})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsP.map((s) => (
                      <tr key={s.seatId} style={{ cursor: "default" }}>
                        <td className="num">{s.no ?? "-"}</td>
                        <td>{s.nama}</td>
                        <td>
                          {!s.dealt ? (
                            <span className="hint">{t.noHand}</span>
                          ) : s.problems.every((p) => p.passed === null) && s.waiting === 0 ? (
                            <span className="hint">{t.none}</span>
                          ) : (
                            <span className="judgeprobs">
                              {s.problems.map((p) => (
                                <span
                                  key={p.problemId}
                                  className="judgeprob"
                                  data-full={
                                    p.passed !== null && p.passed === p.total ? "yes" : "no"
                                  }
                                  title={`${p.title}: ${p.got} / ${p.points}`}
                                >
                                  {t.pass(p.passed, p.total)}
                                </span>
                              ))}
                              {s.waiting > 0 && <span className="pill">{t.pending}</span>}
                            </span>
                          )}
                        </td>
                        <td className="num">
                          <b>{s.got}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </Paged>
      )}
    </section>
  );
}
