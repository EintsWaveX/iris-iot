/**
 * The first step of the Tubes presentation sheet (mockup r5-lembar): "Catatan",
 * one text the pair of examiners writes together and the list of questions that
 * were asked. Both live in the shared sheet as answers (`_catatan` and
 * `_q:<id>`), so the other examiner reads them at once and nothing new is stored.
 */
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import IconButton from "../../../ui/IconButton";
import { dict } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";

export const CATATAN_KEY = "_catatan";
export const ASKED_PREFIX = "_q:";

export interface AskedQ {
  id: string;
  text: string;
}

/** The questions that were asked, oldest first. One removed is an answer set to empty text. */
export function readAsked(ans: Record<string, string>): AskedQ[] {
  return Object.entries(ans)
    .filter(([k, v]) => k.startsWith(ASKED_PREFIX) && v)
    .map(([k, v]) => ({ id: k.slice(ASKED_PREFIX.length), text: v }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

interface Words {
  title: string;
  mate: (m: string) => string;
  ph: string;
  asked: string;
  none: string;
  add: string;
  addAria: string;
  remove: string;
  start: string;
  steps: [string, string, string];
  count: (n: number) => string;
  turn: (room: string, n: number, t: string) => string;
  sheet: string;
  toScoring: string;
}

export const T5 = dict<Words>({
  id: {
    title: "Catatan Bersama",
    mate: (m) => `${m} mengisi dokumen yang sama.`,
    ph: "Tulis apa yang kamu lihat selama presentasi dan demo. Tersimpan sendiri dan terbaca oleh penguji satunya.",
    asked: "Pertanyaan yang Diajukan",
    none: "Belum ada.",
    add: "Tambah pertanyaan",
    addAria: "Tambah pertanyaan",
    remove: "Hapus pertanyaan",
    start: "Mulai Presentasi",
    steps: ["Catatan", "Penilaian", "Keputusan"],
    count: (n) => `${n} pertanyaan`,
    turn: (room, n, t) => `${room} · Giliran ${n} · ${t}`,
    sheet: "Lembar Presentasi",
    toScoring: "Ke Penilaian",
  },
  en: {
    title: "Shared Notes",
    mate: (m) => `${m} is in the same document.`,
    ph: "Write what you see during the presentation and the demo. It saves itself and your partner can read it.",
    asked: "Questions Asked",
    none: "None yet.",
    add: "Add a question",
    addAria: "Add a question",
    remove: "Remove question",
    start: "Start the Presentation",
    steps: ["Notes", "Scoring", "Verdict"],
    count: (n) => `${n} questions`,
    turn: (room, n, t) => `${room} · Turn ${n} · ${t}`,
    sheet: "Presentation Sheet",
    toScoring: "To Scoring",
  },
  zh: {
    title: "共同记录",
    mate: (m) => `${m} 在同一份文件中。`,
    ph: "写下你在展示和演示中看到的内容。自动保存，搭档也能看到。",
    asked: "已提出的问题",
    none: "暂无。",
    add: "添加问题",
    addAria: "添加问题",
    remove: "删除问题",
    start: "开始展示",
    steps: ["记录", "评分", "结果"],
    count: (n) => `${n} 个问题`,
    turn: (room, n, t) => `${room} · 第 ${n} 位 · ${t}`,
    sheet: "展示评分表",
    toScoring: "前往评分",
  },
});

export function Catatan({
  lang,
  text,
  asked,
  draft,
  locked,
  mates,
  setText,
  setDraft,
  add,
  remove,
}: {
  lang: Lang;
  text: string;
  asked: AskedQ[];
  draft: string;
  locked: boolean;
  mates: string[];
  setText: (v: string) => void;
  setDraft: (v: string) => void;
  add: () => void;
  remove: (id: string) => void;
}) {
  const t = T5[lang];
  return (
    <div className="r5notes">
      <section className="panel r4qc">
        <div className="row row--between" style={{ gap: 8 }}>
          <h3 className="h3">{t.title}</h3>
          {mates.length > 0 && <span className="hint">{t.mate(mates.join(", "))}</span>}
        </div>
        <textarea
          className="field__input r4qc__a"
          rows={10}
          value={text}
          disabled={locked}
          placeholder={t.ph}
          onChange={(e) => setText(e.target.value)}
        />
      </section>
      <section className="panel r4qc">
        <h3 className="h3">{t.asked}</h3>
        {asked.length ? (
          <ul className="r6nl">
            {asked.map((q) => (
              <li key={q.id}>
                <span className="r6nl__x">{q.text}</span>
                {!locked && (
                  <IconButton sm icon={XIcon} label={t.remove} onClick={() => remove(q.id)} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="hint">{t.none}</span>
        )}
        {!locked && (
          <div className="r6add" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <input
              className="field__input input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                add();
              }}
              placeholder={t.add}
              aria-label={t.addAria}
            />
            <IconButton icon={PlusIcon} label={t.add} onClick={add} disabled={!draft.trim()} />
          </div>
        )}
      </section>
    </div>
  );
}
