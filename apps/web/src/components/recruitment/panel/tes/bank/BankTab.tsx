/**
 * The panel's Bank Soal tab (prompt 09, mockup r3-bank; Akademik and the
 * Ketua, the bank right). A line of tabs: one for each part with its count,
 * then Referensi and Pengaturan. A question is chosen in the address
 * (?soal=12, or ?soal=baru for a new one in the open part), so the back
 * button and a shared link both work. The Live Coding tab (topics, templates
 * and rubric) is prompt 12's LcPoolTab, a place of its own in the tab line.
 */
import { useCallback, useEffect, useState } from "react";
import Fade from "../../../../ui/Fade";
import TabLine from "../../../../ui/TabLine";
import type { Lang } from "../../../../../lib/kelas";
import {
  useBankConfig,
  useBankQuestions,
  useBankReferences,
} from "../../../../../lib/recruitment/bank-client";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { PHASE1_PARTS, type Phase1Part } from "../../../../../lib/recruitment/exam-types";
import BankConfig from "./BankConfig";
import BankEditor from "./BankEditor";
import BankImport from "./BankImport";
import BankList from "./BankList";
import BankRefs from "./BankRefs";
import LcPoolTab from "../../../livecode/LcPoolTab";
import { BK } from "./bankStrings";

import "../../../recruitment-s3-bank.css";

/** The tabs of the line, in order. */
export const BANK_VIEWS = [...PHASE1_PARTS, "livecode", "refs", "config"] as const;
export type BankView = (typeof BANK_VIEWS)[number];

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const BANK_EVENT = "rec:bank";

interface Where {
  view: BankView;
  /** A question id, "baru" for a new one, or none */
  soal: number | "baru" | null;
}

function readWhere(): Where {
  const q = new URLSearchParams(location.search);
  const v = q.get("bank");
  const view = (BANK_VIEWS as readonly string[]).includes(v ?? "") ? (v as BankView) : "logika";
  const s = q.get("soal");
  const n = Number(s);
  return { view, soal: s === "baru" ? "baru" : Number.isInteger(n) && n > 0 ? n : null };
}

/** The open part and question, kept in step with the address. */
function useWhere(): [Where, (w: Partial<Where>, push?: boolean) => void] {
  const [w, setW] = useState<Where>({ view: "logika", soal: null });
  useEffect(() => {
    const on = () => setW(readWhere());
    on();
    window.addEventListener(BANK_EVENT, on);
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener(BANK_EVENT, on);
      window.removeEventListener("popstate", on);
    };
  }, []);
  const go = useCallback((next: Partial<Where>, push = true) => {
    const cur = readWhere();
    const to = { ...cur, ...next };
    const u = new URL(location.href);
    if (to.view === "logika") u.searchParams.delete("bank");
    else u.searchParams.set("bank", to.view);
    if (to.soal === null) u.searchParams.delete("soal");
    else u.searchParams.set("soal", String(to.soal));
    (push ? history.pushState : history.replaceState).call(history, history.state, "", u);
    window.dispatchEvent(new Event(BANK_EVENT));
  }, []);
  return [w, go];
}

export default function BankTab({ lang }: { lang: Lang }) {
  const t = BK[lang];
  const config = useBankConfig(true);
  const questions = useBankQuestions(true);
  const refs = useBankReferences(true);
  const [where, go] = useWhere();
  const [imp, setImp] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function pasang() {
    setSeeding(true);
    const r = await recPost<{ ok: true; created: number; skipped: number; failed: string[] }>(
      "bank-seed",
      {},
    );
    setSeeding(false);
    if (isFail(r)) return toast(t.seedFail, "danger");
    toast(
      r.failed.length ? t.seedFail : t.seeded(r.created, r.skipped),
      r.failed.length ? "warn" : "ok",
    );
    config.refresh();
    questions.refresh();
  }

  if (!config.data || !questions.data) {
    return config.updatedAt !== null && questions.updatedAt !== null ? (
      <p className="empty-note">{t.loadFail}</p>
    ) : (
      <span className="skeleton" style={{ height: 420 }} aria-label={t.loading} />
    );
  }

  const rows = questions.data.questions;
  const count = (p: Phase1Part) => rows.filter((r) => r.part === p && !r.voided).length;
  const view = where.view;
  const isPart = (PHASE1_PARTS as readonly string[]).includes(view);
  const part = (isPart ? view : "logika") as Phase1Part;
  const editing = isPart && where.soal !== null;

  return (
    <div className="stack r3bank">
      <div className="stack" style={{ gap: 2 }}>
        <div className="row rec-head__row">
          <h2 className="h-title" style={{ margin: 0 }}>
            {t.title}
          </h2>
        </div>
        <span className="hint">{t.lede}</span>
      </div>

      {!editing && (
        <div className="row r3bank__bar">
          <TabLine
            label={t.tabsLabel}
            value={view}
            onChange={(v) => go({ view: v, soal: null })}
            tabs={[
              ...PHASE1_PARTS.map((p) => ({ v: p as BankView, label: t.parts[p], n: count(p) })),
              { v: "livecode" as BankView, label: t.tabLive },
              { v: "refs" as BankView, label: t.tabRefs, n: refs.data?.references.length },
              { v: "config" as BankView, label: t.tabConfig },
            ]}
          />
          {isPart && rows.length > 0 && (
            <div className="row r3bank__acts">
              <button type="button" className="btn btn--inverse" onClick={() => setImp(true)}>
                {t.import}
              </button>
              <a
                className="btn btn--inverse"
                href={`/api/recruitment/bank-export?part=${part}`}
                download={t.exportFile(part)}
              >
                {t.export}
              </a>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => go({ soal: "baru" })}
              >
                {t.add}
              </button>
            </div>
          )}
        </div>
      )}

      <Fade k={editing ? `ed${where.soal}` : view}>
        {editing ? (
          <BankEditor
            key={String(where.soal)}
            lang={lang}
            id={where.soal === "baru" ? null : where.soal}
            part={part}
            config={config.data}
            refs={refs.data?.references ?? []}
            onBack={() => go({ soal: null })}
            onOpen={(id) => go({ soal: id }, false)}
          />
        ) : view === "config" ? (
          <BankConfig
            lang={lang}
            data={config.data}
            refresh={config.refresh}
            seeding={seeding}
            onSeed={() => void pasang()}
          />
        ) : view === "livecode" ? (
          <LcPoolTab lang={lang} />
        ) : view === "refs" ? (
          refs.data ? (
            <BankRefs lang={lang} data={refs.data} refresh={refs.refresh} />
          ) : (
            <span className="skeleton" style={{ height: 240 }} />
          )
        ) : rows.length === 0 ? (
          <section className="panel r3empty">
            <h3 className="panel__title">{t.emptyBankTitle}</h3>
            <p className="hint" style={{ maxWidth: 560 }}>
              {t.emptyBankBody}
            </p>
            <div className="row">
              <button
                type="button"
                className="btn btn--primary"
                disabled={seeding}
                onClick={() => void pasang()}
              >
                {seeding ? t.seedBusy : t.seed}
              </button>
              <button type="button" className="btn btn--inverse" onClick={() => setImp(true)}>
                {t.import}
              </button>
              <button
                type="button"
                className="btn btn--inverse"
                onClick={() => go({ soal: "baru" })}
              >
                {t.add}
              </button>
            </div>
          </section>
        ) : (
          <BankList
            lang={lang}
            part={part}
            rows={rows}
            pools={config.data.pools[part]}
            onOpen={(id) => go({ soal: id })}
          />
        )}
      </Fade>

      <BankImport
        lang={lang}
        open={imp}
        onClose={() => setImp(false)}
        onDone={() => {
          questions.refresh();
          config.refresh();
        }}
      />
    </div>
  );
}
