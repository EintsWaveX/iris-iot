/**
 * Preparation's Module Brief tab (Phase 9 Stage 3, mockup c-prep): the
 * Asisten's own Ringkasan per module and language, shown over the
 * handbook's text on the module page. It starts from the handbook's summary
 * (Mandarin starts from the English one); clearing both fields and saving
 * brings the handbook's text back.
 */
import { useEffect, useRef, useState } from "react";
import { FloppyDiskIcon } from "@phosphor-icons/react";
import SegmentedControl from "../../ui/SegmentedControl";
import Fade from "../../ui/Fade";
import { dict, getJson, postJson, sejak } from "../../../lib/app";
import { modulLabel } from "../../../lib/labels";
import { useDirektori } from "../../../lib/people";
import type { Lang } from "../../../lib/kelas";
import id1 from "../../../content/modules/id/1.json";
import id2 from "../../../content/modules/id/2.json";
import id3 from "../../../content/modules/id/3.json";
import id4 from "../../../content/modules/id/4.json";
import en1 from "../../../content/modules/en/1.json";
import en2 from "../../../content/modules/en/2.json";
import en3 from "../../../content/modules/en/3.json";
import en4 from "../../../content/modules/en/4.json";
import BetaBadge from "../../ui/BetaBadge";
import { useSiaran } from "../../../lib/siaran";

const BAWAAN: Record<"id" | "en", Record<number, { ringkasan: string[] }>> = {
  id: { 1: id1, 2: id2, 3: id3, 4: id4 },
  en: { 1: en1, 2: en2, 3: en3, 4: en4 },
};

const T = dict({
  id: {
    title: "Ringkasan Modul",
    lastBy: (who: string, when: string) => `Terakhir diubah oleh ${who} · ${when}`,
    fromHandbook: "Masih teks bawaan modul.",
    summary: "Gambaran umum",
    steps: "Yang dikerjakan",
    stepsHint: "Satu langkah per baris.",
    save: "Simpan Ringkasan",
    saved: "Ringkasan disimpan.",
    reset: "Kosongkan keduanya lalu simpan untuk kembali ke teks bawaan.",
    fail: "Ringkasan gagal disimpan.",
    module: "Modul",
    lang: "Bahasa",
  },
  en: {
    title: "Module Brief",
    lastBy: (who: string, when: string) => `Last changed by ${who} · ${when}`,
    fromHandbook: "Still the module's own text.",
    summary: "Summary",
    steps: "What you do",
    stepsHint: "One step per line.",
    save: "Save Brief",
    saved: "Brief saved.",
    reset: "Clear both and save to go back to the module's own text.",
    fail: "Couldn't save the Brief.",
    module: "Module",
    lang: "Language",
  },
  zh: {
    title: "模块简介",
    lastBy: (who: string, when: string) => `最后由 ${who} 修改 · ${when}`,
    fromHandbook: "还是模块自带的文字。",
    summary: "概述",
    steps: "要做的事",
    stepsHint: "每行一个步骤。",
    save: "保存简介",
    saved: "简介已保存。",
    reset: "两栏都清空后保存，就会回到模块自带的文字。",
    fail: "简介保存失败。",
    module: "模块",
    lang: "语言",
  },
});

interface Row {
  modul: number;
  bahasa: string;
  isi: { ringkasan: string; langkah: string[] };
  diubahOleh: string;
  diubahPada: string;
}

export default function BriefEditor({ lang }: { lang: Lang }) {
  const t = T[lang];
  const dir = useDirektori();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [m, setM] = useState(1);
  const [lg, setLg] = useState<"id" | "en" | "zh">(lang);
  const [sum, setSum] = useState("");
  const [steps, setSteps] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    // Uncached: the edge copy would show the text from before a save.
    getJson<{ ok: boolean; brief: Row[] }>("/api/session/brief?segar=1")
      .then((d) => setRows(d.ok ? d.brief : []))
      .catch(() => setRows([]));
  useEffect(() => void load(), []);
  // Another Asisten's save shows here too, unless this one is mid-edit.
  const diubah = useRef(false);
  useSiaran(["brief"], () => !diubah.current && void load());

  const row = rows?.find((r) => r.modul === m && r.bahasa === lg) ?? null;
  useEffect(() => {
    if (!rows) return;
    const base = BAWAAN[lg === "id" ? "id" : "en"][m];
    diubah.current = false;
    setSum(row ? row.isi.ringkasan : base.ringkasan.join("\n\n"));
    setSteps(row ? row.isi.langkah.join("\n") : "");
  }, [rows, m, lg]);

  async function save() {
    setBusy(true);
    const r = await postJson<{ ok: boolean }>("/api/session/brief", {
      modul: m,
      bahasa: lg,
      ringkasan: sum,
      langkah: steps.split("\n"),
    }).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) return window.Toast?.show(t.fail, "danger");
    window.Toast?.show(t.saved, "ok");
    void load();
  }

  return (
    <section className="panel panel--solo briefcard">
      <div className="panel__head">
        <h3 className="panel__title">{t.title}</h3>
        <span className="hint">
          {row ? t.lastBy(dir.nama(row.diubahOleh), sejak(row.diubahPada, lang)) : t.fromHandbook}
        </span>
      </div>
      <div className="briefbar">
        <SegmentedControl
          fill
          aria-label={t.module}
          value={String(m)}
          onValueChange={(v) => setM(Number(v))}
          options={[1, 2, 3, 4].map((x) => ({ value: String(x), label: modulLabel(x, lang) }))}
        />
        <SegmentedControl
          fill
          aria-label={t.lang}
          value={lg}
          onValueChange={(v) => setLg(v as "id" | "en" | "zh")}
          options={[
            { value: "id", label: "ID" },
            { value: "en", label: "EN" },
            {
              value: "zh",
              label: (
                <>
                  中文
                  <BetaBadge />
                </>
              ),
            },
          ]}
        />
      </div>
      {!rows ? (
        <span className="skeleton" style={{ height: 220 }} />
      ) : (
        <Fade k={`${m}-${lg}`}>
          <div className="stack">
            <label className="field">
              <span className="field__label">{t.summary}</span>
              <textarea
                className="field__input field__textarea"
                rows={6}
                lang={lg === "zh" ? "zh-CN" : lg}
                value={sum}
                onChange={(e) => {
                  diubah.current = true;
                  setSum(e.target.value);
                }}
              />
            </label>
            <label className="field">
              <span className="field__label">{t.steps}</span>
              <textarea
                className="field__input field__textarea"
                rows={5}
                lang={lg === "zh" ? "zh-CN" : lg}
                value={steps}
                onChange={(e) => {
                  diubah.current = true;
                  setSteps(e.target.value);
                }}
              />
              <span className="field__hint">
                {t.stepsHint} {t.reset}
              </span>
            </label>
            <div className="panel__actions panel__actions--end">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void save()}
              >
                <FloppyDiskIcon size={18} aria-hidden="true" />
                {t.save}
              </button>
            </div>
          </div>
        </Fade>
      )}
    </section>
  );
}
