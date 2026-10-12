/**
 * The Persiapan checklist, tickable (P8.6). Saved per student and module in
 * localStorage (a personal to-do, not something an assistant needs to see),
 * counted toward the dashboard's "next step", and when every item is ticked
 * it offers the jump to the Kode step.
 */
import { useEffect, useState } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import type { Lang } from "../../lib/kelas";
import { dict } from "../../lib/app";

const T = dict({
  id: { done: "Persiapan lengkap. Saatnya menulis kode.", go: "Lanjut ke Kode", reset: "Ulangi" },
  en: { done: "Setup complete. Time to write the code.", go: "Go to Code", reset: "Reset" },
  zh: { done: "准备完成。该写代码了。", go: "去代码", reset: "重置" },
});

export const setupKey = (modul: number) => `iris-setup-m${modul}`;

/** Fired on every tick, so the module's steps follow the checklist. */
export const SETUP_BERUBAH = "iris:setup";

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
  title,
}: {
  lang: Lang;
  modul: number;
  items: string[];
  title: string;
}) {
  const t = T[lang];
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => setDone(readSetup(modul)), [modul]);

  function flip(i: number) {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...new Set([...done, i])];
    setDone(next);
    try {
      localStorage.setItem(setupKey(modul), JSON.stringify(next));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(SETUP_BERUBAH, { detail: { modul, n: next.length } }));
  }

  const n = items.filter((_, i) => done.includes(i)).length;
  const all = n === items.length && items.length > 0;
  // Mockup p-module Setup: the count sits in the card head, each item is a
  // row with a hairline above it, and a ticked item is struck through.
  return (
    <section className="panel setupcheck">
      <div className="panel__head">
        <h2 className="panel__title">{title}</h2>
        <Pill tone={all ? "ok" : undefined}>
          {n}/{items.length}
        </Pill>
      </div>
      <div className="setupcheck__list">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            role="checkbox"
            aria-checked={done.includes(i)}
            className="checkitem"
            onClick={() => flip(i)}
          >
            <span className="checkitem__box" aria-hidden="true">
              <CheckIcon size={14} weight="bold" />
            </span>
            <span>{it}</span>
          </button>
        ))}
      </div>
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
    </section>
  );
}
