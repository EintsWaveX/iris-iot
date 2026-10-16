/**
 * Tim › Penugasan Slot's Tambah Slot and Ubah Slot (2026-10-12): the slots
 * come from the JADWAL sheet's import, and this changes them later by hand.
 *
 * - Hari and Sesi pick the cell. Adding takes a free one (a cell with no
 *   slot, or one the sheet marked Tidak Ada Praktikum); editing another one
 *   moves the slot there, with its roster and its holidays, izin and covers
 *   still to come (POST /api/session/schedule { pindah }).
 * - Below is the Schedule's own slot editor (schedule/SlotEditor.tsx): class,
 *   status, start window, group count, and each group's Asisten as Tetap
 *   (the semester's, from now on: sessions already held keep who taught
 *   them) with that date's Pengganti, Sukarela or Izin.
 */
import { useMemo, useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import { postJson } from "../../lib/app";
import { SLOT_MULAI } from "../../lib/jadwal";
import { hariLabel, slotLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import SlotEditor, { type SlotEditorHandle } from "../schedule/SlotEditor";
import { J, pesanJ } from "../schedule/strings";
import { HARI, SLOTS, type DataJadwal } from "../schedule/types";
import { A } from "./AssignBoard";

export default function SlotDialog({
  lang,
  open,
  onOpenChange,
  semester,
  kini,
  data,
  awal,
  geserUntuk,
  meKode,
  meNim,
  onSaved,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  semester: string;
  kini: boolean;
  data: DataJadwal;
  /** The slot being edited; null adds one */
  awal: { hari: number; slot: number } | null;
  /** Weeks past a day's next meeting, for the board's picked week */
  geserUntuk: (hari: number) => number;
  meKode: string;
  meNim: string;
  onSaved: () => void;
}) {
  const t = A[lang];
  const tj = J[lang];
  const at = (h: number, s: number) => data.jadwal.find((j) => j.hari === h && j.slot === s);
  // A cell is free when nothing runs there (no row, or the sheet's No Practicum).
  const bebas = (h: number, s: number) =>
    (awal?.hari === h && awal.slot === s) || (at(h, s)?.status ?? "kosong") === "kosong";
  const pertama = useMemo(() => {
    for (const h of HARI) for (const s of SLOTS) if (bebas(h, s)) return { hari: h, slot: s };
    return { hari: 1, slot: 1 };
  }, [data]);
  const [hari, setHari] = useState(awal?.hari ?? pertama.hari);
  const [slot, setSlot] = useState(awal?.slot ?? pertama.slot);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const editor = useRef<SlotEditorHandle>(null);

  const asal = awal ? at(awal.hari, awal.slot) : at(hari, slot);
  const pindah = !!awal && (awal.hari !== hari || awal.slot !== slot);
  const bisa = bebas(hari, slot);

  async function simpan() {
    if (!bisa) return;
    setBusy(true);
    try {
      if (pindah && awal) {
        const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/schedule", {
          semester,
          pindah: { dari: awal, ke: { hari, slot } },
        }).catch(() => ({ ok: false, kode: undefined }));
        if (!r.ok) {
          window.Toast?.show(pesanJ(tj, r.kode), "danger");
          return;
        }
      }
      // The editor saves to the slot's (new) cell; unchanged, a move is all.
      const ok = dirty || !awal ? await editor.current?.save() : true;
      if (!ok) {
        if (pindah) onSaved();
        return;
      }
      const label = `${hariLabel(hari, lang)} · ${slotLabel(slot, lang)}`;
      window.Toast?.show(
        pindah ? t.slotMoved(label) : awal ? t.slotSaved : t.slotAdded(label),
        "ok",
      );
      onSaved();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const hariOpts = HARI.map((h) => ({
    value: String(h),
    label: hariLabel(h, lang),
    disabled: !SLOTS.some((s) => bebas(h, s)),
    note: SLOTS.some((s) => bebas(h, s)) ? undefined : t.dayFull,
  }));
  const slotOpts = SLOTS.map((s) => ({
    value: String(s),
    label: `${slotLabel(s, lang)} · ${SLOT_MULAI[s]}`,
    disabled: !bebas(hari, s),
    note: bebas(hari, s) ? undefined : t.taken,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={awal ? t.editSlot : t.addSlot}
      description={awal ? t.editSlotDesc : t.addSlotDesc}
      size="lg"
      lang={lang}
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !bisa || (!!awal && !pindah && !dirty)}
            onClick={() => void simpan()}
          >
            {awal ? t.save : t.addSlot}
          </button>
        </>
      }
    >
      <div className="slotdlg">
        <div className="slotdlg__where">
          <Dropdown
            id="slotdlg-hari"
            label={t.day}
            value={String(hari)}
            options={hariOpts}
            onChange={(v) => {
              const h = Number(v);
              setHari(h);
              if (!bebas(h, slot)) setSlot(SLOTS.find((s) => bebas(h, s)) ?? slot);
            }}
          />
          <Dropdown
            id="slotdlg-slot"
            label={t.session}
            value={String(slot)}
            options={slotOpts}
            onChange={(v) => setSlot(Number(v))}
          />
        </div>
        <p className="hint">{pindah ? t.moveHint : t.tetapHint}</p>
        <SlotEditor
          ref={editor}
          // Adding: each cell starts from its own row. Editing: the slot's
          // draft stays while its cell changes.
          key={awal ? `e${asal?.id ?? 0}` : `n${hari}-${slot}`}
          t={tj}
          lang={lang}
          semester={semester}
          kini={kini}
          hari={hari}
          slot={slot}
          row={asal}
          minggu={asal ? data.minggu[String(asal.id)] : undefined}
          orang={data.asisten}
          jendela={data.jendela}
          meKode={meKode}
          meNim={meNim}
          klp={data.klp?.[`${hari}-${slot}`]}
          bolehJadwal
          geser={geserUntuk(hari)}
          baru={!awal}
          diam
          onDirty={setDirty}
          onSaved={() => {}}
        />
      </div>
    </Dialog>
  );
}
