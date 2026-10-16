/**
 * Phase 18, the slot PJ's two dialogs on Yang Mengajar Slot Ini (mockup
 * k18-mengajar): Geser Jam Sesi moves the whole slot's clock inside the first
 * hour, Ubah Status overrides one Asisten's status. Both ask for a reason of
 * at least 5 characters, which Reports and Audit show.
 */
import { useEffect, useState } from "react";
import Dialog from "../ui/Dialog";
import { Stepper, Switch, TimeField } from "../ui/Controls";
import { Aturan } from "../shell/HadirNotice";
import type { Lang } from "../../lib/kelas";
import { POTONGAN_AWAL, TELAT_MAKS, hitungHadir, potonganHadir } from "../../lib/hadir-mengajar";
import type { StatusLive } from "../../lib/hadir-mengajar";
import type { Strings } from "./strings";
import { bayarBaris, labelStatus, rupiahSingkat, type BarisHadir } from "./HadirTrack";

const dua = (n: number) => String(n).padStart(2, "0");
const keMenit = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const keJam = (m: number) => `${dua(Math.floor(m / 60) % 24)}:${dua(m % 60)}`;

function Alasan({
  h,
  v,
  set,
  ph,
}: {
  h: Strings["lp"]["hd"];
  v: string;
  set: (v: string) => void;
  ph: string;
}) {
  return (
    <label className="field">
      <span className="field__label">{h.reason}</span>
      <textarea
        className="field__input field__textarea"
        rows={2}
        maxLength={300}
        placeholder={ph}
        value={v}
        onChange={(e) => set(e.target.value)}
      />
      <span className="hint">{h.reasonHint}</span>
    </label>
  );
}

/* ---------------------------------------------------------- Geser Jam */

export function GeserJam({
  t,
  lang,
  open,
  onOpenChange,
  normal,
  sekarang,
  alasanAwal,
  onSave,
}: {
  t: Strings;
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The slot's own clock, "HH:MM". */
  normal: string;
  /** The clock now in force, "HH:MM". */
  sekarang: string;
  alasanAwal: string;
  /** jam null puts the clock back; resolves true when it was saved. */
  onSave: (jam: string | null, alasan: string) => Promise<boolean>;
}) {
  const h = t.lp.hd;
  const dari = keMenit(normal);
  const [ke, setKe] = useState(sekarang);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    if (!open) return;
    setKe(sekarang === normal ? keJam(dari + 20) : sekarang);
    setAlasan(alasanAwal);
  }, [open]);
  const k = keMenit(ke);
  const dalam = k > dari && k <= dari + 60;
  const alasanOk = alasan.trim().length >= 5;
  const geser = sekarang !== normal;
  const jalan = async (jam: string | null) => {
    setSibuk(true);
    const ok = await onSave(jam, alasan.trim());
    setSibuk(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={h.gTitle}
      description={h.gDesc}
      size="md"
      lang={lang}
      alt={
        geser ? (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!alasanOk || sibuk}
            title={alasanOk ? undefined : h.gBackNeed}
            onClick={() => void jalan(null)}
          >
            {h.gBack(normal)}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dalam || !alasanOk || sibuk}
            onClick={() => void jalan(ke)}
          >
            {h.gSave}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="hadirdlg__two">
          <div className="field">
            <span className="field__label" id="hadir-geser-baru">
              {h.gNew}
            </span>
            <TimeField
              value={ke}
              onChange={setKe}
              label={h.gNew}
              labelledBy="hadir-geser-baru"
              lang={lang}
              from={Math.floor(dari / 60)}
              step={5}
            />
            <span className="hint">{h.gRange(normal, keJam(dari + 60))}</span>
          </div>
          <div className="field">
            <span className="field__label">{h.gWas}</span>
            <span className="hadirdlg__was mono">{normal}</span>
          </div>
        </div>
        <Alasan h={h} v={alasan} set={setAlasan} ph={h.gPh} />
        <div className="stack stack--sm">
          <span className="field__label">{h.gBecomes}</span>
          <Aturan lang={lang} base={(dalam ? k : dari) * 60_000 - 7 * 3600_000} jumat={false} />
        </div>
        <p className="hint">{h.gNote}</p>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------- Ubah Status */

type Pilihan = "ikut" | "tepat" | "telat" | "mm" | "mangkir" | "izin";

export function UbahStatus({
  t,
  lang,
  row,
  base,
  sesiLabel,
  onOpenChange,
  onSave,
}: {
  t: Strings;
  lang: Lang;
  /** The row being changed; null keeps the dialog closed. */
  row: BarisHadir | null;
  /** The clock now in force (ISO). */
  base: string;
  sesiLabel: string;
  onOpenChange: (o: boolean) => void;
  onSave: (body: {
    status: Pilihan;
    menit?: number;
    hitungMangkir?: boolean;
    alasan: string;
  }) => Promise<boolean>;
}) {
  const h = t.lp.hd;
  const [s, setS] = useState<Pilihan>("ikut");
  const [m, setM] = useState(3);
  const [hm, setHm] = useState(true);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    if (!row) return;
    setS(row.ubah?.status ?? "ikut");
    setM(Math.min(TELAT_MAKS, Math.max(1, row.ubah?.menit ?? row.menit ?? 3)));
    setHm(row.hitungMangkir);
    setAlasan("");
  }, [row?.nim]);
  if (!row) return null;

  // What the clock alone says, so "Follow the Clock" can name it.
  const ikut = hitungHadir({
    hadir: row.hadirPada ? new Date(row.hadirPada) : null,
    base: new Date(base),
    izin: row.izin && !row.ubah,
    diharapkan: true,
    selesai: false,
    now: new Date(),
  });
  const hasil: { status: StatusLive; menit: number | null } =
    s === "ikut" ? ikut : { status: s, menit: s === "telat" ? m : s === "mm" ? TELAT_MAKS : null };
  const pot = potonganHadir(hasil, hm, POTONGAN_AWAL);
  const bayar = bayarBaris(h, { ...hasil, ...pot });
  const ops: [Pilihan, string, string][] = [
    ["ikut", h.uFollow, labelStatus(h, ikut.status, ikut.menit)],
    ["tepat", h.sTepat, h.uTepatH],
    ["telat", h.uTelat, h.uTelatH(rupiahSingkat(POTONGAN_AWAL.perMenit), POTONGAN_AWAL.maks)],
    ["mm", h.sMm, h.uMmH],
    ["mangkir", h.sMangkir, h.uMangkirH],
    ["izin", h.sIzin, h.uIzinH],
  ];
  const ok = alasan.trim().length >= 5;
  const simpan = async () => {
    setSibuk(true);
    const sukses = await onSave({
      status: s,
      ...(s === "telat" ? { menit: m } : {}),
      ...(s === "mm" ? { hitungMangkir: hm } : {}),
      alasan: alasan.trim(),
    });
    setSibuk(false);
    if (sukses) onOpenChange(false);
  };
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={h.uTitle(row.kode)}
      description={h.uDesc(row.nama, sesiLabel)}
      size="md"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!ok || sibuk}
            onClick={() => void simpan()}
          >
            {h.uSave}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="hadiropts" role="radiogroup" aria-label="Status">
          {ops.map(([v, label, hint]) => (
            <button
              key={v}
              type="button"
              role="radio"
              className="hadiropt"
              aria-checked={v === s}
              onClick={() => setS(v)}
            >
              <span className="hadiropt__dot" aria-hidden="true" />
              <span className="stack" style={{ gap: 2 }}>
                <b>{label}</b>
                <span className="hint">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {s === "telat" && (
          <div className="hadirdlg__line">
            <span>{h.uMinutes}</span>
            <Stepper
              value={m}
              min={1}
              max={TELAT_MAKS}
              onChange={setM}
              fmt={h.uMin}
              label={h.uMinLabel}
              lessLabel={h.uLess}
              moreLabel={h.uMore}
            />
          </div>
        )}
        {s === "mm" && (
          <div className="hadirdlg__line">
            <span className="stack" style={{ gap: 2 }}>
              <b>{h.uCount}</b>
              <span className="hint">{h.uCountH}</span>
            </span>
            <Switch on={hm} onChange={setHm} label={h.uCount} />
          </div>
        )}
        <div className="hadirdlg__line">
          <span className="field__label">{h.uToPay}</span>
          <span className="hadirpay" data-tone={bayar.tone || undefined}>
            {bayar.tx}
          </span>
        </div>
        <Alasan h={h} v={alasan} set={setAlasan} ph={h.uPh} />
      </div>
    </Dialog>
  );
}
