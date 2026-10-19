/**
 * The module page's Code step (Phase 9 Stage 7d, mockup p-module › Code).
 * One sketch at a time behind the file switch; both stay mounted so a
 * blank being typed in survives switching files. Pin dan Skema is one row
 * (Phase 21, f6) beside the code from 1280 wide and under it below that;
 * Lihat opens it as a sheet. From 1280 the editor can widen over the side
 * column (remembered). An Asisten gets Show Answers on top, and picks
 * whose file to read: each group's file carries its own identity lines
 * (GROUP_ID, Module 4's sync word) and per-group answers.
 *
 * Mounted client:only (through ModuleSteps), so the first render already
 * knows the width and the saved dock state.
 *
 * The files come baked into the page (version 1); once ASO publish a newer
 * version, the published Praktikan files replace them (GET /api/modul/kode,
 * again whenever a version is published).
 *
 * A group that rewired its pins in a Pin dan Skema card (lib/pin-grup.ts)
 * reads its own pins in the code; the blanks and their answers stay the
 * same, since a pin line never holds a blank.
 */
import { useEffect, useMemo, useState } from "react";
import { CaretRightIcon, EyeIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { Switch } from "../ui/Controls";
import SegmentedControl from "../ui/SegmentedControl";
import PinSchematic, { type PinData } from "./PinSchematic";
import BlankFile, { type BerkasEntry, type CodeMode } from "./BlankFile";
import { useMinWidth } from "../../lib/hooks";
import { getJson } from "../../lib/app";
import { parseBlanks } from "../../lib/blanks";
import { useSiaran } from "../../lib/siaran";
import { gabungPin, gantiPinTeks } from "../../lib/pin-kode";
import { usePinGrup } from "../../lib/pin-grup";
import { usePin } from "./usePin";
import type { Lang } from "../../lib/kelas";
import { C } from "./codeStrings";
import "./code.css";

const LEBAR_KEY = "iris-code-lebar";

/** `?blank=<file slug>.<n>` (the Konsol's Open in Code): that file, that blank. */
function blankDariUrl(): { slug: string; nomor: number } | null {
  try {
    const m = /^([a-z0-9_]+)\.(\d+)$/.exec(new URLSearchParams(location.search).get("blank") ?? "");
    return m ? { slug: m[1], nomor: Number(m[2]) } : null;
  } catch {
    return null;
  }
}

export interface CodeProps {
  modul: number;
  bahasa: "id" | "en";
  berkas: BerkasEntry[];
}

interface Props {
  lang: Lang;
  mode: CodeMode;
  pin: PinData;
  mcu: string;
  skema: string;
  code: CodeProps;
  /** Lihat Sebagai Praktikan: the group an Asisten acts for. */
  wakil?: { nomor: number; own: boolean; pemegang?: string | null };
}

interface KodeTerbit {
  ok: boolean;
  versi: number | null;
  /** A pin table changed in Persiapan: the served files carry its pins */
  pin?: boolean;
  berkas: { slug: string; templat: Record<"id" | "en", string> }[];
}

/** The module's files as published, over the baked ones. */
function useBerkasTerbit(code: CodeProps): BerkasEntry[] {
  const [berkas, setBerkas] = useState(code.berkas);
  const muat = () =>
    getJson<KodeTerbit>(`/api/modul/kode?modul=${code.modul}`)
      .then((d) => {
        if (!d.ok || (d.versi === null && !d.pin)) return;
        setBerkas(
          code.berkas.map((f) => {
            const t = d.berkas.find((b) => b.slug === f.slug)?.templat[code.bahasa];
            return t === undefined ? f : { ...f, segments: parseBlanks(t) };
          }),
        );
      })
      .catch(() => {});
  useEffect(() => void muat(), [code.modul, code.bahasa]);
  useSiaran(["kode", "presentasi"], muat);
  return berkas;
}

export default function CodeStep({ lang, mode, pin, mcu, skema, code: baked, wakil }: Props) {
  const t = C[lang];
  const terbit = useBerkasTerbit(baked);
  // The group's own wiring over the module's pins
  const pinData = usePin();
  const grup = usePinGrup(baked.modul);
  const berkas = useMemo(() => {
    const bawaan = pinData?.bawaan[String(baked.modul)];
    if (!grup.baris || !bawaan) return terbit;
    const dari = gabungPin(bawaan, pinData?.pin[String(baked.modul)] ?? null);
    return terbit.map((f) => ({
      ...f,
      segments: f.segments.map((s) =>
        s.kind === "text"
          ? { ...s, text: gantiPinTeks(baked.modul, f.slug, s.text, dari, grup.baris!) }
          : s,
      ),
    }));
  }, [terbit, grup.baris, pinData, baked.modul]);
  const code = { ...baked, berkas };
  const wide = useMinWidth(1280, true);
  const [awal] = useState(blankDariUrl);
  const [active, setActive] = useState(
    awal && code.berkas.some((f) => f.slug === awal.slug)
      ? awal.slug
      : (code.berkas[0]?.slug ?? ""),
  );
  const [showKeys, setShowKeys] = useState(false);
  const [grupLihat, setGrupLihat] = useState(1);
  const [lebar, setLebar] = useState(() => {
    try {
      return localStorage.getItem(LEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sheet, setSheet] = useState(false);

  function toggleLebar() {
    setLebar((v) => {
      try {
        localStorage.setItem(LEBAR_KEY, v ? "0" : "1");
      } catch {
        /* private mode: the toggle still works for this visit */
      }
      return !v;
    });
  }

  const panel = (
    <PinSchematic lang={lang} modul={code.modul} pin={pin} mcu={mcu} skema={skema} variant="dock" />
  );
  // The board's pins at a glance, e.g. "3V3 · GPIO16 · GND".
  const ringkas = [...new Set(pin.baris.map((r) => r[1]).filter(Boolean))].slice(0, 4).join(" · ");
  const side = (
    <section className="panel pinrow">
      <span className="stack stack--sm grow">
        <b>{t.pins}</b>
        {ringkas && <span className="hint mono">{ringkas}</span>}
      </span>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setSheet(true)}>
        {t.view}
        <CaretRightIcon size={14} weight="bold" aria-hidden="true" />
      </button>
    </section>
  );

  return (
    <div className="stack codestep">
      {mode === "asisten" && (
        <div className="banner codestep__keys">
          <Switch on={showKeys} onChange={setShowKeys} label={t.showKeys} />
          <b>{t.showKeys}</b>
          <span className="hint codestep__keys-hint">{t.keysOnly}</span>
          <span className="grow" />
          <span className="codestep__grup">
            <span className="field__label">{t.groupPick}</span>
            <SegmentedControl
              value={String(grupLihat)}
              onValueChange={(v) => setGrupLihat(Number(v))}
              aria-label={t.groupPick}
              options={[1, 2, 3, 4, 5].map((n) => ({
                value: String(n),
                label: <span title={t.groupN(n)}>{n}</span>,
              }))}
            />
          </span>
        </div>
      )}
      {wakil && !wakil.own && (
        <div className="banner banner--lock">
          <EyeIcon aria-hidden="true" />
          <span>{wakil.pemegang ? t.viewOnly : t.viewOnlyFree}</span>
        </div>
      )}
      {code.berkas.map((f) => (
        <div key={f.slug} hidden={f.slug !== active}>
          <BlankFile
            lang={lang}
            mode={mode}
            modul={code.modul}
            bahasa={code.bahasa}
            file={f}
            files={code.berkas}
            onPick={setActive}
            showKeys={showKeys}
            lebar={lebar}
            onLebar={toggleLebar}
            wide={wide}
            side={f.slug === active ? side : undefined}
            wakil={wakil}
            grupLihat={grupLihat}
            awal={awal?.slug === f.slug ? awal.nomor : undefined}
          />
        </div>
      ))}
      <Dialog open={sheet} onOpenChange={setSheet} title={t.pins} sheet size="xl" lang={lang}>
        {panel}
      </Dialog>
    </div>
  );
}
