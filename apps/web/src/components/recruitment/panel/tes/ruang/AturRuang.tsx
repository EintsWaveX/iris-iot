/**
 * Atur Ruang, the mockup's side drawer (n7-malam): two tabs, Pengawas and Judge. Pengawas picks who watches the room
 * tonight (two Asisten, one of whom presses Jadi Master on the night) from every active Asisten, and shows that a
 * practice room never touches the bank. Judge shows whether the C judge on the PC Lab answers.
 */
import { useState } from "react";
import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import Drawer from "../../../../ui/Drawer";
import Pill from "../../../../ui/Pill";
import TabLine from "../../../../ui/TabLine";
import { Stepper } from "../../../../ui/Controls";
import { dict } from "../../../../../lib/app";
import type { Lang } from "../../../../../lib/kelas";
import { usePoll } from "../../../../../lib/hooks";
import { isFail, recGet, recPost } from "../../../../../lib/recruitment/client";
import type { LccRoom } from "../../../../../lib/recruitment/lcc-api";
import { useRecRoom } from "../../../../../lib/recruitment/room-client";
import Skeleton from "../../../../ui/Skeleton";
import { RG } from "./ruangStrings";
import { KS } from "./malamStrings";
import { useCekJudge } from "./useCekJudge";

const W = dict({
  id: {
    title: "Atur Ruang",
    tabPengawas: "Pengawas",
    tabJudge: "Judge",
    tabs: "Bagian Atur Ruang",
    lede: "Dua Asisten per malam. Salah satu menekan Jadi Master di malam ujian.",
    practice: "Ruang Latihan",
    practiceHint:
      "Menarik dari bank yang sama, tidak mengunci soal, dan tidak dihitung ke nilai siapa pun.",
    saved: "Pengawas disimpan.",
    fail: "Belum tersimpan. Coba lagi.",
    close: "Tutup",
    resize: "Ubah lebar",
    judgeLede:
      "Live Coding dinilai oleh program di PC Lab. Cek bahwa PC Lab menjawab sebelum ujian dimulai; kalau mati saat ujian, submission kandidat menunggu dan tidak hilang.",
    judgeReady: "Siap",
    judgeNot: "Belum siap",
    queue: "Queue",
    waiting: (n: number) => `${n} menunggu`,
    running: (n: number) => `${n} sedang dinilai`,
    check: "Cek Judge",
    judgeSub: (host: string | null, gcc: string | null, sandbox: string | null) =>
      [host, gcc, sandbox && `sandbox ${sandbox}`].filter(Boolean).join(" · "),
    workers: "Judge berjalan bersamaan",
    workersWho: "Akademik dan Ketua",
    workersNote:
      "Batas atas. PC Lab menjalankan sebanyak yang ia sanggup, tidak lebih dari angka ini.",
    workersSet: (n: number) => `Judge worker jadi ${n}. Tercatat di log.`,
    typical: "Waktu rata-rata",
    perSub: (s: string) => `${s} detik per submission`,
    limits: "Batas program",
    limitsVal: (ms: number, kb: number) =>
      `${ms >= 1000 ? `${(ms / 1000).toString().replace(".", ",")} detik` : `${ms} ms`}, ${Math.round(kb / 1024)} MB per test`,
    noData: "Belum ada",
    stepLess: "Kurangi",
    stepMore: "Tambah",
  },
  en: {
    title: "Set Up the Room",
    tabPengawas: "Pengawas",
    tabJudge: "Judge",
    tabs: "Room setup parts",
    lede: "Two Asisten per night. One of them presses Become Master on the exam night.",
    practice: "Practice Room",
    practiceHint: "Draws from the same bank, locks no question, and counts toward nobody's score.",
    saved: "Pengawas saved.",
    fail: "Not saved. Try again.",
    close: "Close",
    resize: "Resize",
    judgeLede:
      "Live Coding is graded by a program on the lab PC. Check that the lab PC answers before the exam starts; if it goes down during the exam, candidates' submissions wait and are not lost.",
    judgeReady: "Ready",
    judgeNot: "Not ready",
    queue: "Queue",
    waiting: (n: number) => `${n} waiting`,
    running: (n: number) => `${n} being graded`,
    check: "Check the Judge",
    judgeSub: (host: string | null, gcc: string | null, sandbox: string | null) =>
      [host, gcc, sandbox && `${sandbox} sandbox`].filter(Boolean).join(" · "),
    workers: "Parallel workers",
    workersWho: "Akademik and Ketua",
    workersNote:
      "An upper limit. The lab PC runs as many as it can handle, never more than this number.",
    workersSet: (n: number) => `Judge workers set to ${n}. Logged.`,
    typical: "Typical time",
    perSub: (s: string) => `${s} seconds per submission`,
    limits: "Program limits",
    limitsVal: (ms: number, kb: number) =>
      `${ms >= 1000 ? `${ms / 1000} second${ms === 1000 ? "" : "s"}` : `${ms} ms`}, ${Math.round(kb / 1024)} MB per test`,
    noData: "None yet",
    stepLess: "Fewer",
    stepMore: "More",
  },
  zh: {
    title: "设置考场",
    tabPengawas: "监考",
    tabJudge: "评测",
    tabs: "考场设置分页",
    lede: "每晚两名助教，其中一人在考试当晚按下“成为主考”。",
    practice: "练习考场",
    practiceHint: "从同一题库抽题，不锁定题目，也不计入任何人的成绩。",
    saved: "监考已保存。",
    fail: "未保存，请重试。",
    close: "关闭",
    resize: "调整宽度",
    judgeLede:
      "实时编程由机房电脑上的程序评分。考试开始前确认它有响应；考试中若它离线，候选人的提交会排队等待，不会丢失。",
    judgeReady: "就绪",
    judgeNot: "未就绪",
    queue: "队列",
    waiting: (n: number) => `${n} 个等待`,
    running: (n: number) => `${n} 个评分中`,
    check: "检查评测",
    judgeSub: (host: string | null, gcc: string | null, sandbox: string | null) =>
      [host, gcc, sandbox && `沙箱 ${sandbox}`].filter(Boolean).join(" · "),
    workers: "并行线程",
    workersWho: "学术组和主席",
    workersNote: "这是上限。实验室电脑按自身能力运行，不会超过这个数字。",
    workersSet: (n: number) => `评测线程已设为 ${n}，已记录。`,
    typical: "平均耗时",
    perSub: (s: string) => `每次提交 ${s} 秒`,
    limits: "程序限制",
    limitsVal: (ms: number, kb: number) =>
      `${ms >= 1000 ? `${ms / 1000} 秒` : `${ms} 毫秒`}，每个测试 ${Math.round(kb / 1024)} MB`,
    noData: "暂无",
    stepLess: "减少",
    stepMore: "增加",
  },
});

type Orang = { nim: string; nama: string; kode: string };

export default function AturRuang({
  lang,
  id,
  people,
  onClose,
  refresh,
}: {
  lang: Lang;
  id: number;
  people: Orang[];
  onClose: () => void;
  refresh: () => void;
}) {
  const t = W[lang];
  const rv = useRecRoom(id, true);
  const v = rv.data;
  const [tab, setTab] = useState<"pengawas" | "judge">("pengawas");
  const [busy, setBusy] = useState(false);
  const [workers, setWorkers] = useState<number | null>(null);
  const juri = usePoll<LccRoom | null>(
    async () => {
      const r = await recGet<LccRoom & { ok: true }>("lcc-room", { id: String(id) });
      if (isFail(r)) throw new Error(String(r.status || 408));
      return r;
    },
    60_000,
    true,
    ["recroom", "recjudge"],
    300,
  );
  const cek = useCekJudge(lang, juri.refresh);
  const pilih = v?.pengawas.map((p) => p.nim) ?? [];
  const selesai = v?.view === "finished";

  /** The judge's parallel workers live in the exam config; this changes just that number. */
  async function ubahPekerja(n: number) {
    setWorkers(n);
    const cur = await recGet<{ ok: true; config: { livecode: { workers: number } } }>(
      "exam-config",
    );
    if (isFail(cur)) return window.Toast?.show(t.fail, "danger");
    const cfg = { ...cur.config, livecode: { ...cur.config.livecode, workers: n } };
    const r = await recPost<{ ok: true }>("exam-config-save", { config: cfg });
    if (isFail(r)) {
      setWorkers(null);
      return window.Toast?.show(t.fail, "danger");
    }
    window.Toast?.show(t.workersSet(n), "ok");
    juri.refresh();
  }

  async function ubah(nim: string) {
    if (!v || busy || selesai) return;
    const next = pilih.includes(nim) ? pilih.filter((x) => x !== nim) : [...pilih, nim];
    setBusy(true);
    const r = await recPost<{ ok: true }>("room-setup", {
      id: v.room.id,
      slotId: v.room.slot?.id,
      rehearsal: v.room.rehearsal,
      title: v.room.title,
      pengawas: next,
    });
    setBusy(false);
    if (isFail(r)) {
      window.Toast?.show(RG[lang].setup.bad[r.kode] ?? t.fail, "danger");
      rv.refresh();
      return;
    }
    window.Toast?.show(t.saved, "ok");
    rv.refresh();
    refresh();
  }

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.title}
      description={v?.room.title}
      storeKey="rec-aturruang"
      minWidth={460}
      size="half"
      closeLabel={t.close}
      resizeLabel={t.resize}
      foot={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          <span className="btn__label">{t.close}</span>
        </button>
      }
    >
      <div className="stack">
        <TabLine
          label={t.tabs}
          value={tab}
          onChange={(x) => setTab(x as typeof tab)}
          tabs={[
            { v: "pengawas", label: t.tabPengawas, n: pilih.length },
            { v: "judge", label: t.tabJudge },
          ]}
        />
        {!v ? (
          <Skeleton height={240} />
        ) : tab === "pengawas" ? (
          <>
            <span className="hint">{t.lede}</span>
            <ul className="n7-pengpick" role="group" aria-label={t.tabPengawas}>
              {people.map((p) => {
                const on = pilih.includes(p.nim);
                return (
                  <li key={p.nim}>
                    <button
                      type="button"
                      className="n7-pengpick__row"
                      aria-pressed={on}
                      disabled={busy || selesai}
                      onClick={() => void ubah(p.nim)}
                    >
                      <b className="mono">{p.kode}</b>
                      <span>{p.nama}</span>
                      <span className="grow" />
                      {on ? (
                        <CheckIcon size={18} aria-hidden="true" />
                      ) : (
                        <PlusIcon size={18} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="stack">
            <span className="hint">{t.judgeLede}</span>
            <section className="panel lc-judge" data-st={juri.data?.judgeReady ? "ok" : "off"}>
              <div className="panel__head">
                <div className="stack" style={{ gap: 2 }}>
                  <h2 className="panel__title">C Judge</h2>
                  {juri.data && (
                    <span className="hint">
                      {t.judgeSub(juri.data.info.host, juri.data.info.gcc, juri.data.info.sandbox)}
                    </span>
                  )}
                </div>
                <Pill tone={juri.data?.judgeReady ? "ok" : "warn"}>
                  {juri.data?.judgeReady ? t.judgeReady : t.judgeNot}
                </Pill>
              </div>
              <div className="rec-sum">
                <span className="hint">{t.workers}</span>
                <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {juri.data?.info.canWorkers ? (
                    <Stepper
                      value={workers ?? juri.data.info.workers}
                      min={1}
                      max={8}
                      label={t.workers}
                      lessLabel={t.stepLess}
                      moreLabel={t.stepMore}
                      onChange={(v) => void ubahPekerja(v)}
                    />
                  ) : (
                    <b className="num">{juri.data?.info.workers ?? "-"}</b>
                  )}
                  <span className="hint">{t.workersWho}</span>
                  <span className="hint" style={{ flexBasis: "100%" }}>
                    {t.workersNote}
                  </span>
                </span>
                <span className="hint">{t.typical}</span>
                <b className="num">
                  {juri.data?.info.avgMs
                    ? t.perSub(
                        (juri.data.info.avgMs / 1000)
                          .toFixed(1)
                          .replace(".", lang === "id" ? "," : "."),
                      )
                    : t.noData}
                </b>
                <span className="hint">{t.limits}</span>
                <b>
                  {juri.data?.info.timeMs && juri.data.info.memKb
                    ? t.limitsVal(juri.data.info.timeMs, juri.data.info.memKb)
                    : t.noData}
                </b>
                <span className="hint">{t.queue}</span>
                <b>
                  {juri.data
                    ? `${t.waiting(juri.data.queue.waiting)} · ${t.running(juri.data.queue.running)}`
                    : "-"}
                </b>
              </div>
              {cek.hasil && (
                <div className="stack" style={{ gap: 2 }} role="status">
                  <span className="hint">{cek.sinyal}</span>
                  <span className="hint">{cek.terakhirMenilai}</span>
                </div>
              )}
              <div className="row row--end">
                <button
                  type="button"
                  className="btn btn--inverse"
                  disabled={cek.busy}
                  aria-busy={cek.busy}
                  onClick={() => void cek.jalankan()}
                >
                  <span className="btn__label">{cek.busy ? KS[lang].checking : t.check}</span>
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </Drawer>
  );
}
