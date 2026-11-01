/**
 * Small pieces the Tubes tab's sections share: the answer to say for an error
 * kode, the post-and-refresh helper, the status pill, and date helpers.
 */
import { useState } from "react";
import Pill from "../../ui/Pill";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import type { SubmissionStatus } from "../../../lib/recruitment/tubes";
import type { TubesBoard } from "../../../lib/recruitment/tubes-api";
import { tgl } from "../shared";
import { TUBES, type TubesWords } from "./tubesStrings";

export const toast = (msg: string, tone?: "danger" | "warn") => window.Toast?.show(msg, tone);

export interface PanelCtx {
  lang: Lang;
  w: TubesWords["panel"];
  all: TubesWords;
  b: TubesBoard;
  say: (kode: unknown) => string;
  /** Posts, shows the error or `ok`, refreshes; resolves true when it worked. */
  post: (aksi: string, body?: unknown, ok?: string) => Promise<boolean>;
  busy: boolean;
}

export function useCtx(lang: Lang, b: TubesBoard, refresh: () => void): PanelCtx {
  const [busy, setBusy] = useState(false);
  const all = TUBES[lang];
  const say = (k: unknown) => (all.err as Record<string, string>)[String(k)] ?? all.err.lain ?? "";
  const post = async (aksi: string, body: unknown = {}, ok?: string) => {
    setBusy(true);
    const r = await recPost<{ ok: true }>(aksi, body);
    setBusy(false);
    if (isFail(r)) toast(say(r.kode), "danger");
    else if (ok) toast(ok);
    refresh();
    return !isFail(r);
  };
  return { lang, w: all.panel, all, b, say, post, busy };
}

const wib = (iso: string) => tanggalWib(new Date(iso));
export const wibDate = (iso: string) => wib(iso).tanggal;
export const wibTime = (iso: string) => wib(iso).jam;
export const kapan = (iso: string, lang: Lang) => `${tgl(wib(iso).tanggal, lang)}, ${wib(iso).jam}`;

/** An `<input type=datetime-local>` value (WIB) for an instant, and back to an instant. */
export const keLokal = (iso: string) => `${wib(iso).tanggal}T${wib(iso).jam}`;
export const dariLokal = (v: string) => new Date(`${v}:00+07:00`).toISOString();

export function StatusPill({ s, w }: { s: SubmissionStatus; w: TubesWords["panel"] }) {
  return (
    <Pill
      tone={
        s === "complete"
          ? "ok"
          : s === "late"
            ? "danger"
            : s === "partial" || s === "over"
              ? "warn"
              : undefined
      }
    >
      {w.status[s]}
    </Pill>
  );
}

export const depan = (nama: string) => nama.trim().split(/\s+/)[0] ?? nama;
