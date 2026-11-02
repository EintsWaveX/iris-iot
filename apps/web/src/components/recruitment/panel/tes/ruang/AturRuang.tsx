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
import { Switch } from "../../../../ui/Controls";
import { dict } from "../../../../../lib/app";
import type { Lang } from "../../../../../lib/kelas";
import { usePoll } from "../../../../../lib/hooks";
import { isFail, recGet, recPost } from "../../../../../lib/recruitment/client";
import type { LccRoom } from "../../../../../lib/recruitment/lcc-api";
import { useRecRoom } from "../../../../../lib/recruitment/room-client";

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
  },
  en: {
    title: "Set Up the Room",
    tabPengawas: "Proctors",
    tabJudge: "Judge",
    tabs: "Room setup parts",
    lede: "Two Asisten a night. One of them presses Make Master on the night.",
    practice: "Practice Room",
    practiceHint: "Draws from the same bank, locks no question, and counts toward nobody's score.",
    saved: "Proctors saved.",
    fail: "Not saved. Try again.",
    close: "Close",
    resize: "Resize",
    judgeLede:
      "Live Coding is graded by a program on the PC Lab. Check that the PC Lab answers before the exam starts; if it goes down during the exam, candidates' submissions wait and are not lost.",
    judgeReady: "Ready",
    judgeNot: "Not ready",
    queue: "Queue",
    waiting: (n: number) => `${n} waiting`,
    running: (n: number) => `${n} being graded`,
    check: "Check the Judge",
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
  const pilih = v?.pengawas.map((p) => p.nim) ?? [];
  const selesai = v?.view === "finished";

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
    if (isFail(r)) return void window.Toast?.show(t.fail, "danger");
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
      minWidth={420}
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
          <span className="skeleton" style={{ height: 240 }} />
        ) : tab === "pengawas" ? (
          <>
            <span className="hint">{t.lede}</span>
            <div className="r6set">
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{t.practice}</b>
                <span className="hint">{t.practiceHint}</span>
              </span>
              <Switch
                on={v.room.rehearsal}
                label={t.practice}
                disabled
                onChange={() => undefined}
              />
            </div>
            <ul className="r3pick" role="group" aria-label={t.tabPengawas}>
              {people.map((p) => {
                const on = pilih.includes(p.nim);
                return (
                  <li key={p.nim}>
                    <button
                      type="button"
                      className="r3pick__row"
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
            <section className="panel">
              <div className="panel__head">
                <h3 className="panel__title">C Judge</h3>
                <Pill tone={juri.data?.judgeReady ? "ok" : "warn"}>
                  {juri.data?.judgeReady ? t.judgeReady : t.judgeNot}
                </Pill>
              </div>
              <div className="rec-sum">
                <span className="hint">{t.queue}</span>
                <b>
                  {juri.data
                    ? `${t.waiting(juri.data.queue.waiting)} · ${t.running(juri.data.queue.running)}`
                    : "-"}
                </b>
              </div>
              <div className="row row--end">
                <button type="button" className="btn btn--inverse" onClick={() => juri.refresh()}>
                  <span className="btn__label">{t.check}</span>
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </Drawer>
  );
}
