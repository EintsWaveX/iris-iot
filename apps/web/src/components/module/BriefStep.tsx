/**
 * The module page's Brief step (Phase 9 Stage 7, mockups m-browse and
 * m-ideas): the Asisten's own Ringkasan from modul_brief over the
 * handbook's text, in the page language (Mandarin falls back to the English
 * override, then to the handbook). An Asisten with the Schedule right edits
 * it in place in a drawer that keeps all three languages, each saved with
 * Full Name (CODE) and time.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, InfoIcon } from "@phosphor-icons/react";
import Drawer from "../ui/Drawer";
import SegmentedControl from "../ui/SegmentedControl";
import Fade from "../ui/Fade";
import Pill from "../ui/Pill";
import BetaBadge from "../ui/BetaBadge";
import { getJson, postJson, useMe } from "../../lib/app";
import { useTampil } from "../../lib/proyektor";
import SlidesDialog, { useSlides } from "../shell/SlidesDialog";
import { useDirektori } from "../../lib/people";
import type { Lang } from "../../lib/kelas";
import { M } from "./moduleStrings";
import id1 from "../../content/modules/id/1.json";
import id2 from "../../content/modules/id/2.json";
import id3 from "../../content/modules/id/3.json";
import id4 from "../../content/modules/id/4.json";
import en1 from "../../content/modules/en/1.json";
import en2 from "../../content/modules/en/2.json";
import en3 from "../../content/modules/en/3.json";
import en4 from "../../content/modules/en/4.json";
import zh1 from "../../content/modules/zh/1.json";
import zh2 from "../../content/modules/zh/2.json";
import zh3 from "../../content/modules/zh/3.json";
import zh4 from "../../content/modules/zh/4.json";
import { useSiaran } from "../../lib/siaran";
import Lalu from "../ui/Lalu";

const BAWAAN: Record<"id" | "en" | "zh", Record<number, { ringkasan: string[] }>> = {
  id: { 1: id1, 2: id2, 3: id3, 4: id4 },
  en: { 1: en1, 2: en2, 3: en3, 4: en4 },
  zh: { 1: zh1, 2: zh2, 3: zh3, 4: zh4 },
};

type Bahasa = "id" | "en" | "zh";
const BAHASA: Bahasa[] = ["id", "en", "zh"];

export interface BriefRow {
  modul: number;
  bahasa: string;
  isi: { ringkasan: string; langkah: string[] };
  diubahOleh: string;
  diubahOlehNama: string | null;
  diubahPada: string;
}

interface Props {
  lang: Lang;
  modul: number;
  ringkasan: string[];
  permainan?: string[];
  fakta: string[];
  toolchain: { label: string; alat: string }[];
  canEdit: boolean;
}

const paragraphs = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);

export default function BriefStep({
  lang,
  modul,
  ringkasan,
  permainan,
  fakta,
  toolchain,
  canEdit,
}: Props) {
  const t = M[lang];
  const dir = useDirektori(canEdit);
  const [rows, setRows] = useState<BriefRow[] | null>(null);
  const [edit, setEdit] = useState(false);
  // Projector mode: the Asisten-only footer stays off the screen.
  const me = useTampil(useMe());
  const slides = useSlides(modul, !!me);
  const [slidesOpen, setSlidesOpen] = useState(false);

  // Uncached (`segar`) for an editor and after a live update: the edge
  // copy would show the text from before the save.
  const load = (segar = canEdit) =>
    getJson<{ ok: boolean; brief: BriefRow[] }>(
      segar ? "/api/session/brief?segar=1" : "/api/session/brief",
    )
      .then((d) => setRows(d.ok ? d.brief.filter((r) => r.modul === modul) : []))
      .catch(() => setRows([]));
  useEffect(() => void load(), [modul, canEdit]);
  useSiaran(["brief"], () => void load(true));

  const row =
    rows?.find((r) => r.bahasa === lang) ??
    (lang === "zh" ? rows?.find((r) => r.bahasa === "en") : undefined) ??
    null;
  const sum = row?.isi.ringkasan ? paragraphs(row.isi.ringkasan) : ringkasan;
  const langkah = row?.isi.langkah ?? [];

  return (
    <div className="modbrief">
      <section className={langkah.length > 0 ? "panel" : "panel modbrief__wide"}>
        <div className="panel__head">
          <h2 className="panel__title">{t.summary}</h2>
          {/* Only once the module's practicum is done (2026-10-08), so a
              guest and a Praktikan who hasn't attended it get nothing. */}
          {slides.list.length > 0 && (
            <button type="button" className="btn btn--sm" onClick={() => setSlidesOpen(true)}>
              {t.viewSlides}
            </button>
          )}
        </div>
        <div className={langkah.length > 0 ? undefined : "modbrief__cols"}>
          <div className="stack">
            {sum.map((p) => (
              <p key={p} className="modbrief__p">
                {p}
              </p>
            ))}
          </div>
          {/* No list of steps yet: the at a glance facts sit beside the
              summary in the same card instead of a half empty one. */}
          {langkah.length === 0 && (
            <aside className="modbrief__glance">
              <h3 className="label-caps">{t.atAGlance}</h3>
              <ul className="modfakta">
                {fakta.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <ul className="modpage__kv">
                {toolchain.map((tc) => (
                  <li key={tc.label}>
                    <span className="hint">{tc.label}</span>
                    <b>{tc.alat}</b>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </section>
      {langkah.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">{t.whatYouDo}</h2>
          <ul className="modticks">
            {langkah.map((x) => (
              <li key={x}>
                <CheckIcon size={16} weight="bold" aria-hidden="true" />
                {x}
              </li>
            ))}
          </ul>
        </section>
      )}
      {permainan && permainan.length > 0 && (
        <section className="panel modbrief__wide">
          <h2 className="panel__title">{t.game}</h2>
          {permainan.map((p) => (
            <p key={p} className="hint">
              {p}
            </p>
          ))}
        </section>
      )}
      {/* Where this brief comes from: the handbook, or the Asisten's own
          version (2026-10-07: "Teks dari modul." alone said too little). */}
      {me?.role === "asisten" && (
        <div className="panel modbrief__wide modbrief__foot">
          <span className="hint modbrief__src">
            <InfoIcon size={18} aria-hidden="true" />
            <span>
              {row ? (
                <Lalu
                  iso={row.diubahPada}
                  lang={lang}
                  fmt={(s) => t.lastBy(row.diubahOlehNama ?? dir.nama(row.diubahOleh), s)}
                />
              ) : (
                t.fromHandbook
              )}
              {canEdit && <> {t.editHint}</>}
            </span>
          </span>
          {canEdit && (
            <button type="button" className="btn btn--sm" onClick={() => setEdit(true)}>
              {t.editBrief}
            </button>
          )}
        </div>
      )}
      <SlidesDialog
        open={slidesOpen}
        onOpenChange={setSlidesOpen}
        list={slides.list}
        modul={modul}
        lang={lang}
      />
      {edit && rows && (
        <BriefDrawer
          lang={lang}
          modul={modul}
          rows={rows}
          onClose={() => setEdit(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

function BriefDrawer({
  lang,
  modul,
  rows,
  onClose,
  onSaved,
}: {
  lang: Lang;
  modul: number;
  rows: BriefRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = M[lang];
  const awal = useMemo(() => {
    const out = {} as Record<Bahasa, { sum: string; steps: string }>;
    for (const b of BAHASA) {
      const r = rows.find((x) => x.bahasa === b);
      out[b] = r
        ? { sum: r.isi.ringkasan, steps: r.isi.langkah.join("\n") }
        : { sum: BAWAAN[b][modul].ringkasan.join("\n\n"), steps: "" };
    }
    return out;
  }, [rows, modul]);
  const [lg, setLg] = useState<Bahasa>(lang);
  const [txt, setTxt] = useState(awal);
  const [busy, setBusy] = useState(false);
  const dirty = BAHASA.filter((b) => txt[b].sum !== awal[b].sum || txt[b].steps !== awal[b].steps);

  const put = (k: "sum" | "steps", v: string) =>
    setTxt((x) => ({ ...x, [lg]: { ...x[lg], [k]: v } }));

  async function save() {
    setBusy(true);
    let ok = true;
    for (const b of dirty) {
      const r = await postJson<{ ok: boolean }>("/api/session/brief", {
        modul,
        bahasa: b,
        ringkasan: txt[b].sum,
        langkah: txt[b].steps.split("\n"),
      }).catch(() => ({ ok: false }));
      ok = ok && r.ok;
    }
    setBusy(false);
    if (!ok) return window.Toast?.show(t.saveFail, "danger");
    window.Toast?.show(t.saved, "ok");
    onSaved();
    onClose();
  }

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.drawerTitle(modul)}
      description={t.langNames[lg]}
      storeKey="modul-brief"
      closeLabel={t.close}
      resizeLabel={t.resize}
      foot={
        <>
          {dirty.length > 0 && (
            <span className="drawer__alt">
              <Pill tone="warn">{t.notSaved}</Pill>
            </span>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || dirty.length === 0}
            onClick={() => void save()}
          >
            {t.save}
          </button>
        </>
      }
    >
      <SegmentedControl
        fill
        aria-label={t.lang}
        value={lg}
        onValueChange={(v) => setLg(v as Bahasa)}
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
      <Fade k={lg}>
        <div className="stack">
          <label className="field">
            <span className="field__label">{t.summary}</span>
            <textarea
              className="field__input field__textarea"
              rows={8}
              lang={lg === "zh" ? "zh-CN" : lg}
              value={txt[lg].sum}
              onChange={(e) => put("sum", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{t.whatYouDo}</span>
            <textarea
              className="field__input field__textarea"
              rows={6}
              lang={lg === "zh" ? "zh-CN" : lg}
              value={txt[lg].steps}
              onChange={(e) => put("steps", e.target.value)}
            />
            <span className="field__hint">{t.stepsHint}</span>
          </label>
        </div>
      </Fade>
    </Drawer>
  );
}
