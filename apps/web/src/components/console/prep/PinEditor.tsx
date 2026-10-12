/**
 * Persiapan › Skema › Pin Modul (2026-10-12, was Tabel Pin): one card per
 * module with its board and pins at a glance, and Atur Pin, the pin
 * settings dialog (module/PinDialog.tsx) where the board is picked and the
 * pins are moved with jumpers, never typed. A saved change reaches every
 * Pin dan Skema card and the code (src/lib/pin-kode.ts).
 */
import { useState, type CSSProperties } from "react";
import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import Pill from "../../ui/Pill";
import { dict, MODUL_NAMA } from "../../../lib/app";
import { modulLabel } from "../../../lib/labels";
import { angkaPin, gabungPin, papanModul, tautanSel, type BarisPin } from "../../../lib/pin-kode";
import { PAPAN, type PapanId } from "../../../lib/papan";
import { usePin } from "../../module/usePin";
import PinDialog, { kindOf } from "../../module/PinDialog";
import "../../module/PinSchematic.css";
import type { Lang } from "../../../lib/kelas";

const T = dict({
  id: {
    title: "Pin Modul",
    sub: "Papan dan pin tiap modul. Ubah lewat Atur Pin: kartu Pin dan Skema dan konstanta pin di kode ikut berubah untuk semua orang.",
    changed: "Diubah",
    open: "Atur Pin",
    view: "Lihat Pin",
  },
  en: {
    title: "Module Pins",
    sub: "Each module's board and pins. Change them with Set Pins: every Pin dan Skema card and the pin constants in the code follow for everyone.",
    changed: "Changed",
    open: "Set Pins",
    view: "View Pins",
  },
  zh: {
    title: "模块引脚",
    sub: "每个模块的开发板和引脚。用“设置引脚”修改：所有人的引脚与电路图卡片和代码里的引脚常量都会跟着变。",
    changed: "已修改",
    open: "设置引脚",
    view: "查看引脚",
  },
});

export default function PinEditor({ lang, boleh }: { lang: Lang; boleh: boolean }) {
  const t = T[lang];
  const data = usePin();
  const [buka, setBuka] = useState<number | null>(null);
  if (!data) return <span className="skeleton" style={{ height: 240 }} />;
  return (
    <section className="panel pinedit">
      <div className="stack stack--sm">
        <h2 className="panel__title">{t.title}</h2>
        <span className="hint">{t.sub}</span>
      </div>
      <div className="pinedit__grid">
        {[1, 2, 3, 4].map((m) =>
          data.bawaan[String(m)] ? (
            <PinCard
              key={m}
              lang={lang}
              modul={m}
              boleh={boleh}
              bawaan={data.bawaan[String(m)]}
              simpan={data.pin[String(m)] ?? null}
              papan={data.papan[String(m)] ?? papanModul(m)}
              onOpen={() => setBuka(m)}
            />
          ) : null,
        )}
      </div>
      {buka !== null && (
        <PinDialog lang={lang} modul={buka} open onOpenChange={(o) => !o && setBuka(null)} />
      )}
    </section>
  );
}

function PinCard({
  lang,
  modul,
  boleh,
  bawaan,
  simpan,
  papan,
  onOpen,
}: {
  lang: Lang;
  modul: number;
  boleh: boolean;
  bawaan: BarisPin;
  simpan: BarisPin | null;
  papan: PapanId[];
  onOpen: () => void;
}) {
  const t = T[lang];
  const baris = gabungPin(bawaan, simpan);
  const sel: { r: number; k: number }[] = [];
  bawaan.forEach((row, r) =>
    row.forEach((_, k) => k % 2 === 1 && row[k - 1] && sel.push({ r, k })),
  );
  return (
    <div className="pinedit__card" style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}>
      <div className="row row--between">
        <span className="row" style={{ gap: 8 }}>
          <Pill modul={modul}>{modulLabel(modul, lang)}</Pill>
          <b className="truncate">{MODUL_NAMA[modul]}</b>
        </span>
        {simpan && <Pill tone="accent">{t.changed}</Pill>}
      </div>
      <span className="hint">{[...new Set(papan.map((id) => PAPAN[id].nama))].join(" · ")}</span>
      <ul className="pinedit__list">
        {sel.map(({ r, k }) => {
          const v = baris[r][k];
          const tt = tautanSel(modul, r, k);
          return (
            <li key={`${r}:${k}`}>
              <span className="truncate">{bawaan[r][k - 1]}</span>
              <span className="pintable__pin mono" data-kind={kindOf(v)}>
                {v}
              </span>
              {tt && (
                <span className="mono hint">
                  {tt.jenis === "adc" ? `ADC(${angkaPin(v) ?? "?"})` : tt.nama}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="pinedit__actions pinedit__actions--one">
        <button type="button" className={`btn ${boleh ? "btn--inverse" : ""}`} onClick={onOpen}>
          <SlidersHorizontalIcon size={18} aria-hidden="true" />
          {boleh ? t.open : t.view}
        </button>
      </div>
    </div>
  );
}
