/**
 * The Persiapan checklist, tickable (P8.6). Saved per student and module in
 * localStorage (a personal to-do, not something an assistant needs to see),
 * counted toward the dashboard's "next step", and when every item is ticked
 * it offers the jump to the Kode step.
 */
import { useEffect, useState } from "react";
import { Checkbox } from "../ui/Controls";
import { ProgressRing } from "../ui/Display";
import type { Lang } from "../../lib/kelas";
import { dict } from "../../lib/app";

const T = dict({
  id: { done: "Persiapan lengkap. Saatnya menulis kode.", go: "Lanjut ke Kode", reset: "Ulangi" },
  en: { done: "Setup complete. Time to write the code.", go: "Go to Code", reset: "Reset" },
  zh: { done: "准备完成。该写代码了。", go: "去代码", reset: "重置" },
});

export const setupKey = (modul: number) => `iris-setup-m${modul}`;

export function readSetup(modul: number): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(setupKey(modul)) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export default function SetupChecklist({
  lang,
  modul,
  items,
}: {
  lang: Lang;
  modul: number;
  items: string[];
}) {
  const t = T[lang];
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => setDone(readSetup(modul)), [modul]);

  function flip(i: number, v: boolean) {
    const next = v ? [...new Set([...done, i])] : done.filter((x) => x !== i);
    setDone(next);
    try {
      localStorage.setItem(setupKey(modul), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const all = done.length >= items.length && items.length > 0;
  return (
    <div className="setupcheck">
      <div className="setupcheck__head">
        <ProgressRing
          value={Math.min(done.length, items.length)}
          max={items.length}
          size="lg"
          color={all ? "var(--ok)" : "var(--accent)"}
        />
        {all && (
          <div className="setupcheck__done" role="status">
            <span className="grow">{t.done}</span>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("iris:go-step", { detail: "code" }))
              }
            >
              {t.go}
            </button>
          </div>
        )}
      </div>
      <div className="setupcheck__list">
        {items.map((it, i) => (
          <Checkbox key={i} checked={done.includes(i)} onChange={(v) => flip(i, v)} label={it} />
        ))}
      </div>
    </div>
  );
}
