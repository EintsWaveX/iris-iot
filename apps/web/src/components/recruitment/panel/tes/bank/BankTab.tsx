/**
 * The panel's Bank Soal tab (prompt 09, mockup r3-bank; Akademik and the
 * Ketua, the bank right). A line of tabs: one for each part with its count,
 * then Live Coding and Pengaturan. A question is chosen in the address
 * (?soal=12, or ?soal=baru for a new one in the open part), so the back
 * button and a shared link both work. The Live Coding tab is the C problem
 * bank (ProblemsTab) and works the same way: a count on its tab, a C pool card, Impor, Ekspor
 * and Tambah Soal up here, and the tab line gone while a problem is open.
 * There are no references: candidates see none.
 */
import { useCallback, useEffect, useState, type ComponentType } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import {
  DownloadSimpleIcon,
  FileArrowUpIcon,
  CpuIcon,
  DotsThreeIcon,
  GearSixIcon,
  LightbulbIcon,
  LightningIcon,
  PencilSimpleIcon,
  PlusIcon,
  type IconProps,
} from "@phosphor-icons/react";
import Fade from "../../../../ui/Fade";
import TabLine from "../../../../ui/TabLine";
import type { Lang } from "../../../../../lib/kelas";
import { usePoll } from "../../../../../lib/hooks";
import { useBankConfig, useBankQuestions } from "../../../../../lib/recruitment/bank-client";
import type { PoolCount } from "../../../../../lib/recruitment/bank-rules";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { PHASE1_PARTS, type Phase1Part } from "../../../../../lib/recruitment/exam-types";
import BankConfig from "./BankConfig";
import BankEditor from "./BankEditor";
import BankImport from "./BankImport";
import BankList from "./BankList";
import ProblemsTab, { fetchList } from "./ProblemsTab";
import { BK } from "./bankStrings";
import Skeleton from "../../../../ui/Skeleton";

import "../../../recruitment-s3-bank.css";
import "../../../recruitment-cutting.css";

/** The tabs of the line, in order. */
export const BANK_VIEWS = [...PHASE1_PARTS, "livecode", "config"] as const;
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

const BANK_MORE: Record<Lang, string> = {
  id: "Impor dan Ekspor",
  en: "Import and Export",
  zh: "导入和导出",
};

const IK_PART: Record<Phase1Part, ComponentType<IconProps>> = {
  logika: LightbulbIcon,
  fitb: PencilSimpleIcon,
  kodingan: CpuIcon,
};

/** A tab label with its icon, as the mockup draws the Bank Soal tab line */
const tab = (Ik: ComponentType<IconProps>, text: string) => (
  <>
    <Ik size={16} aria-hidden="true" />
    {text}
  </>
);

export default function BankTab({ lang }: { lang: Lang }) {
  const t = BK[lang];
  const config = useBankConfig(true);
  const questions = useBankQuestions(true);
  const [where, go] = useWhere();
  const probs = usePoll(fetchList, 300_000, true, ["recbank"], 300);
  const [imp, setImp] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function pasang() {
    setSeeding(true);
    const r = await recPost<{
      ok: true;
      created: number;
      skipped: number;
      updated?: number;
      removed?: number;
      mended?: number;
      failed: string[];
    }>("bank-seed", {});
    setSeeding(false);
    if (isFail(r)) return toast(t.seedFail, "danger");
    toast(
      r.failed.length ? t.seedFail : t.seeded(r.created, r.skipped, r.updated, r.removed),
      r.failed.length ? "warn" : "ok",
    );
    if (r.mended) toast(t.mended(r.mended), "ok");
    config.refresh();
    questions.refresh();
    probs.refresh();
  }

  if (!config.data || !questions.data) {
    return config.updatedAt !== null && questions.updatedAt !== null ? (
      <p className="empty-note">{t.loadFail}</p>
    ) : (
      <Skeleton height={420} label={t.loading} />
    );
  }

  const rows = questions.data.questions;
  const count = (p: Phase1Part) => rows.filter((r) => r.part === p && !r.voided).length;
  const view = where.view;
  const isPart = (PHASE1_PARTS as readonly string[]).includes(view);
  const part = (isPart ? view : "logika") as Phase1Part;
  const live = view === "livecode";
  const editing = (isPart || live) && where.soal !== null;
  const problems = probs.data?.problems ?? null;
  /** The C pool card of Live Coding, counted the way the written parts' cards are: a problem is dealt when Siap and Terverifikasi */
  const lc = config.data.config.livecode;
  const lcShown = lc.draw.easy + lc.draw.medium + lc.draw.hard;
  const lcReady = problems?.filter((p) => p.status === "ready" && p.checkOk === true) ?? [];
  const lcPool: PoolCount = {
    lang: "c",
    ready: lcReady.length,
    draft: (problems?.length ?? 0) - lcReady.length,
    seed: lcReady.filter((p) => p.sample).length,
    voided: 0,
    shown: lcShown,
    pool: lc.pool,
    missing: Math.max(0, lcShown - lcReady.length),
  };

  return (
    <div className="stack r3bank">
      {!editing && (
        <div className="row r3bank__bar n7-bar">
          <TabLine
            label={t.tabsLabel}
            value={view}
            onChange={(v) => go({ view: v, soal: null })}
            tabs={[
              ...PHASE1_PARTS.map((p) => ({
                v: p as BankView,
                label: tab(IK_PART[p], t.parts[p]),
                n: count(p),
              })),
              {
                v: "livecode" as BankView,
                label: tab(LightningIcon, t.tabLive),
                n: problems?.length,
              },
              { v: "config" as BankView, label: tab(GearSixIcon, t.tabConfig) },
            ]}
          />
          <span className="grow" />
          {((isPart && rows.length > 0) || live) && (
            <div className="row r3bank__acts">
              <RadixPopover.Root>
                <RadixPopover.Trigger asChild>
                  <button type="button" className="iconbtn" aria-label={BANK_MORE[lang]}>
                    <DotsThreeIcon size={20} weight="bold" aria-hidden="true" />
                  </button>
                </RadixPopover.Trigger>
                <RadixPopover.Portal>
                  <RadixPopover.Content
                    className="popover__panel"
                    style={{ width: 240 }}
                    align="end"
                    sideOffset={8}
                    collisionPadding={12}
                  >
                    <div className="stack stack--sm">
                      <button
                        type="button"
                        className="btn btn--inverse btn--block"
                        onClick={() => setImp(true)}
                      >
                        <FileArrowUpIcon size={18} aria-hidden="true" />
                        <span className="btn__label">{t.import}</span>
                      </button>
                      <a
                        className="btn btn--inverse btn--block"
                        href={
                          live
                            ? "/api/recruitment/problem-export"
                            : `/api/recruitment/bank-export?part=${part}`
                        }
                        download={live ? "bank-live-coding.md" : t.exportFile(part)}
                      >
                        <DownloadSimpleIcon size={18} aria-hidden="true" />
                        <span className="btn__label">{t.export}</span>
                      </a>
                    </div>
                  </RadixPopover.Content>
                </RadixPopover.Portal>
              </RadixPopover.Root>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => go({ soal: "baru" })}
              >
                <PlusIcon size={18} aria-hidden="true" />
                <span className="btn__label">{t.add}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <Fade k={editing ? `ed${where.soal}` : view}>
        {editing && !live ? (
          <BankEditor
            key={String(where.soal)}
            lang={lang}
            id={where.soal === "baru" ? null : where.soal}
            part={part}
            config={config.data}
            onBack={() => go({ soal: null })}
            onOpen={(id) => go({ soal: id }, false)}
            rows={rows.filter((r) => r.part === part)}
          />
        ) : view === "config" ? (
          <BankConfig
            lang={lang}
            data={config.data}
            refresh={config.refresh}
            seeding={seeding}
            onSeed={() => void pasang()}
          />
        ) : live ? (
          <ProblemsTab
            lang={lang}
            config={config.data}
            problems={problems}
            pool={lcPool}
            open={where.soal}
            // from the list a click adds an address entry; inside an editor the arrows replace it
            onOpen={(o) => go({ soal: o }, where.soal === null)}
            onBack={() => {
              go({ soal: null });
              probs.refresh();
            }}
          />
        ) : rows.length === 0 ? (
          <section className="panel bkempty">
            <h2 className="panel__title">{t.emptyBankTitle}</h2>
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
        problems={live}
        onClose={() => setImp(false)}
        onDone={() => {
          questions.refresh();
          config.refresh();
          probs.refresh();
        }}
      />
    </div>
  );
}
