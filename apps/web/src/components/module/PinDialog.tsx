/**
 * The pin settings dialog (2026-10-12), replacing Persiapan's Tabel Pin:
 * one module's boards and pins, set with the mouse only.
 *
 * - Board: ESP32 DevKitC, ESP32-S2, S3, C3, C6 or Pico W per board in the
 *   module (Module 1 has a Central and a Peripheral). Picking another board
 *   moves every connection onto it: a pin the new board can take stays,
 *   the rest get the first free pin that suits them (pin-kode.ts).
 * - The jumper board (BoardJumper.tsx): drag a wire, or click it and then
 *   a pin; only the pins that suit the board and the part light up.
 * - Connections: each part's pin, the constant it sets in the code, and
 *   what changed against the built-in table.
 *
 * Saving needs the Jadwal right (Pengelola, Admin); everyone's code and
 * every Pin dan Skema card follow (api/_lib/pin.ts).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowCounterClockwiseIcon, FloppyDiskIcon, WarningIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { postJson, useMe } from "../../lib/app";
import { modulLabel } from "../../lib/labels";
import {
  angkaPin,
  arahSel,
  cekBarisPin,
  gabungPin,
  papanModul,
  pindahPapan,
  tautanSel,
  type BarisPin,
} from "../../lib/pin-kode";
import { labelPad, PAPAN, PAPAN_ID, type PapanId } from "../../lib/papan";
import type { Lang } from "../../lib/kelas";
import BoardJumper, { type Jumper } from "./BoardJumper";
import { ambilPin, usePin } from "./usePin";
import { PJ } from "./pinStrings";

/** The board's short name for the picker */
const PENDEK: Record<PapanId, string> = {
  esp32: "ESP32",
  esp32s2: "S2",
  esp32s3: "S3",
  esp32c3: "C3",
  esp32c6: "C6",
  picow: "Pico W",
};

/** "Tombol (kaki 2)" -> ["Tombol", "kaki 2"] */
function bagi(s: string): [string, string] {
  const m = /^(.*?)\s*[(（](.*)[)）]\s*$/.exec(s);
  return m ? [m[1].trim(), m[2].trim()] : [s.trim(), ""];
}

export function kindOf(pin: string): "pwr" | "gnd" | "sig" {
  const p = pin.toUpperCase();
  if (p.includes("GND")) return "gnd";
  if (/3V3|5V|VCC|VIN|VBUS|VSYS/.test(p)) return "pwr";
  return "sig";
}

/** Each board's jumpers from a table (names from `nama`, pins from `baris`).
 *  With `terpasang`, a wire it leaves out waits unplugged (label ""), and
 *  `rumah` gives each wire the module's own pin to ring while it is held. */
export function jumpersDari(
  modul: number,
  bawaan: BarisPin,
  nama: BarisPin,
  baris: BarisPin,
  pasang: number,
  terpasang?: (row: number, kolom: number) => boolean,
  rumah?: BarisPin,
): Jumper[] {
  const k = pasang * 2 + 1;
  const out: Jumper[] = [];
  nama.forEach((row, r) => {
    const comp = row[k - 1];
    const pin = baris[r]?.[k];
    if (!comp || !pin) return;
    const [part, sig] = bagi(comp);
    out.push({
      row: r,
      part,
      signal: sig.split(/[,，]/)[0].trim() || part,
      label: !terpasang || terpasang(r, k) ? pin : "",
      bawaan: rumah?.[r]?.[k],
      arah: arahSel(modul, bawaan, r, k),
      kind: kindOf(pin),
    });
  });
  return out;
}

export default function PinDialog({
  lang,
  modul,
  open,
  onOpenChange,
  nama,
  kolom,
}: {
  lang: Lang;
  modul: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The table in the page's language, for the part names */
  nama?: BarisPin;
  /** Its column heads ("Komponen (Central)"), for each board's name */
  kolom?: string[];
}) {
  const t = PJ[lang];
  const me = useMe();
  const boleh = me?.hak?.jadwal === true;
  const data = usePin();
  const bawaan = data?.bawaan[String(modul)] ?? null;
  const simpan = data?.pin[String(modul)] ?? null;
  const papanSimpan = data?.papan[String(modul)] ?? papanModul(modul);
  const kini = useMemo(() => (bawaan ? gabungPin(bawaan, simpan) : null), [bawaan, simpan]);
  const [baris, setBaris] = useState<BarisPin | null>(null);
  const [papan, setPapan] = useState<PapanId[]>(papanSimpan);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  // Each opening starts from what is saved.
  useEffect(() => {
    if (!open || !kini) return;
    setBaris(kini);
    setPapan(papanSimpan);
  }, [open, kini && JSON.stringify(kini), papanSimpan.join()]);

  if (!bawaan || !baris) return null;
  const label = modulLabel(modul, lang);
  const namaTabel = nama ?? bawaan;
  const salah = new Set(cekBarisPin(modul, bawaan, baris, papan));
  const berubah =
    JSON.stringify(baris) !== JSON.stringify(kini) || papan.join() !== papanSimpan.join();
  const bawaanPapan = papanModul(modul);
  const bedaBawaan =
    JSON.stringify(baris) !== JSON.stringify(bawaan) || papan.join() !== bawaanPapan.join();

  async function kirim(isi: BarisPin | null) {
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/presentasi/pin-simpan", {
      modul,
      baris: isi,
      papan: isi ? papan : undefined,
    }).catch(() => ({ ok: false }) as { ok: boolean; kode?: string });
    setBusy(false);
    if (!r.ok) return window.Toast?.show(r.kode === "pin_salah" ? t.bad : t.fail, "danger");
    window.Toast?.show(isi ? t.saved(label) : t.restored(label), "ok");
    void ambilPin(true);
    onOpenChange(false);
  }

  const kepala = (p: number) => {
    const h = kolom?.[p * 2] ?? "";
    return /[(（](.*)[)）]/.exec(h)?.[1] ?? null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title(label)}
      description={t.desc}
      size="xl"
      lang={lang}
      alt={
        boleh ? (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || !bedaBawaan}
            onClick={() => (simpan ? void kirim(null) : (setBaris(bawaan), setPapan(bawaanPapan)))}
          >
            <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
            {t.restore}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          {boleh && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !berubah || salah.size > 0}
              data-loading={busy ? "yes" : undefined}
              onClick={() => void kirim(baris)}
            >
              <FloppyDiskIcon size={18} aria-hidden="true" />
              {t.save}
            </button>
          )}
        </>
      }
    >
      <div className="pindlg" style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}>
        {!boleh && (
          <div className="banner banner--lock" role="note">
            <span>{t.noRight}</span>
          </div>
        )}
        {papan.map((id, p) => {
          const k = kepala(p);
          return (
            <section key={p} className="pindlg__board">
              <div className="field">
                <span className="field__label">{k ? t.mcuFor(k) : t.mcu}</span>
                <SegmentedControl
                  fill
                  aria-label={k ? t.mcuFor(k) : t.mcu}
                  value={id}
                  onValueChange={(v) => {
                    const ke = papan.map((x, i) => (i === p ? (v as PapanId) : x));
                    setPapan(ke);
                    setBaris((b) => (b ? pindahPapan(modul, bawaan, b, ke) : b));
                  }}
                  options={PAPAN_ID.map((x) => ({ value: x, label: PENDEK[x] }))}
                />
              </div>
              <BoardJumper
                papan={PAPAN[id]}
                judul={k ? `${PAPAN[id].nama} · ${k}` : PAPAN[id].nama}
                jumpers={jumpersDari(modul, bawaan, namaTabel, baris, p)}
                modul={modul}
                active={active}
                setActive={setActive}
                t={t}
                onMove={(row, pad) =>
                  setBaris((b) =>
                    b
                      ? b.map((r, i) =>
                          i === row
                            ? r.map((c, j) => (j === p * 2 + 1 ? labelPad(PAPAN[id], pad) : c))
                            : r,
                        )
                      : b,
                  )
                }
              />
            </section>
          );
        })}
        <p className="hint">{t.dragHint}</p>

        <table className="pindlg__table">
          <caption className="label-caps">{t.links}</caption>
          <thead>
            <tr>
              <th scope="col">{t.part}</th>
              <th scope="col">{t.pin}</th>
              <th scope="col">{t.inCode}</th>
              <th scope="col">
                <span className="visually-hidden">{t.changed}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {baris.flatMap((row, r) =>
              row
                .map((v, k) => ({ v, k }))
                .filter(({ k }) => k % 2 === 1 && namaTabel[r]?.[k - 1])
                .map(({ v, k }) => {
                  const tt = tautanSel(modul, r, k);
                  const bad = salah.has(`${r}:${k}`);
                  return (
                    <tr
                      key={`${r}:${k}`}
                      data-on={active === r ? "yes" : undefined}
                      onMouseEnter={() => setActive(r)}
                      onMouseLeave={() => setActive(null)}
                    >
                      <td>{namaTabel[r][k - 1]}</td>
                      <td>
                        <span className="pintable__pin mono" data-kind={kindOf(v)}>
                          {v}
                        </span>
                      </td>
                      <td>
                        {tt ? (
                          <span className="mono hint">
                            {tt.jenis === "adc"
                              ? `ADC(${angkaPin(v) ?? "?"})`
                              : `${tt.nama} = ${angkaPin(v) ?? "?"}`}
                          </span>
                        ) : (
                          <span className="hint">·</span>
                        )}
                      </td>
                      <td>
                        {bad ? (
                          <WarningIcon size={18} aria-label={t.bad} className="pindlg__bad" />
                        ) : v !== bawaan[r][k] ? (
                          <Pill tone="accent">{t.changed}</Pill>
                        ) : null}
                      </td>
                    </tr>
                  );
                }),
            )}
          </tbody>
        </table>
        {salah.size > 0 && <p className="hint pindlg__badline">{t.bad}</p>}
      </div>
    </Dialog>
  );
}
