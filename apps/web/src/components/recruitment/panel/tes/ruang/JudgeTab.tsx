/**
 * Malam Ujian, the Live Coding part (B7.5, mockup n7-malam): is the judge ready, how
 * long is its queue, and what every seat has so far. There is nothing to grade by hand:
 * a seat's points come from the tests its best Submit passed. Staff of the room see it
 * while the Live Coding timer runs and afterwards.
 */
import { ArrowsClockwiseIcon, PlugsIcon, ProhibitIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../../../lib/kelas";
import { dict } from "../../../../../lib/app";
import { usePoll } from "../../../../../lib/hooks";
import { isFail, recGet } from "../../../../../lib/recruitment/client";
import type { LccRoom } from "../../../../../lib/recruitment/lcc-api";

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
  },
});

export default function JudgeTab({ lang, roomId }: { lang: Lang; roomId: number }) {
  const t = JT[lang];
  const poll = usePoll<LccRoom | null>(
    async () => {
      const r = await recGet<LccRoom & { ok: true }>("lcc-room", { id: String(roomId) });
      if (isFail(r)) throw new Error(String(r.status || 408));
      return r;
    },
    60_000,
    true,
    ["recroom"],
    300,
  );
  const d = poll.data;
  if (!d)
    return poll.errors >= 2 ? (
      <section className="panel">
        <p className="hint" style={{ margin: 0 }}>
          {t.fail}
        </p>
      </section>
    ) : (
      <span className="skeleton" style={{ height: 200 }} />
    );

  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h3 className="panel__title">{t.title}</h3>
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

      {d.seats.length === 0 ? (
        <section className="panel">
          <p className="hint" style={{ margin: 0 }}>
            {t.empty}
          </p>
        </section>
      ) : (
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
                {d.seats.map((s) => (
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
                              data-full={p.passed !== null && p.passed === p.total ? "yes" : "no"}
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
    </section>
  );
}
