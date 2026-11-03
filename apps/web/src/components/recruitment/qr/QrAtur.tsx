/**
 * Which QR an event's wall shows (user, 2026-11-03): the IRIS one, or one made
 * from a Google Form link. For the form, the Panitia paste two links: the form
 * (the QR is made from it) and its responses spreadsheet (the wall reads the
 * last four rows from it). Saved as the `qr` setting, one entry per event.
 */
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import Dialog from "../../ui/Dialog";
import SegmentedControl from "../../ui/SegmentedControl";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost, useRecSettings } from "../../../lib/recruitment/client";
import { QR_DEFAULT, bacaSheet, cekLinkQr, type QrMap } from "../../../lib/recruitment/qr-luar";
import { S2 } from "../s2Strings";

function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export default function QrAtur({
  lang,
  open,
  onOpenChange,
  eventId,
  judul,
  mode: modeAwal,
  link: linkAwal,
  sheet: sheetAwal,
  onSaved,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: number;
  judul: string;
  mode: "iris" | "luar";
  link: string;
  sheet: string;
  onSaved: () => void;
}) {
  const t = S2[lang].qr.luar;
  const settings = useRecSettings(open);
  const [mode, setMode] = useState(modeAwal);
  const [link, setLink] = useState(linkAwal);
  const [sheet, setSheet] = useState(sheetAwal);
  const [salah, setSalah] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(modeAwal);
    setLink(linkAwal);
    setSheet(sheetAwal);
    setSalah(null);
  }, [open, modeAwal, linkAwal, sheetAwal]);

  const linkOk = cekLinkQr(link);
  const sheetOk = sheet.trim() === "" || bacaSheet(sheet) !== null;
  const pratinjau = useMemo(() => (linkOk ? qrSvg(linkOk) : ""), [linkOk]);

  const simpan = async () => {
    if (mode === "luar" && !linkOk) return setSalah(t.errLink);
    if (mode === "luar" && !sheetOk) return setSalah(t.errSheet);
    const lama = settings.data?.settings.find((s) => s.key === "qr")?.value as QrMap | undefined;
    const peta: QrMap = { ...(lama ?? QR_DEFAULT) };
    if (mode === "iris") delete peta[String(eventId)];
    else peta[String(eventId)] = { mode, link: linkOk ?? "", sheet: sheet.trim() };
    setSibuk(true);
    const r = await recPost<{ ok: true }>("setting-save", { key: "qr", value: peta });
    setSibuk(false);
    if (isFail(r)) return setSalah(r.kode === "tanpa_hak" ? t.errHak : t.errSave);
    settings.refresh();
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      lang={lang}
      size="lg"
      title={t.title}
      description={judul}
      actions={
        <>
          <button type="button" className="btn" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={sibuk}
            onClick={() => void simpan()}
          >
            <span className="btn__label">{t.save}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <SegmentedControl
          aria-label={t.title}
          value={mode}
          fill
          onValueChange={(v) => {
            setMode(v === "luar" ? "luar" : "iris");
            setSalah(null);
          }}
          options={[
            { value: "iris", label: t.iris },
            { value: "luar", label: t.luar },
          ]}
        />
        {mode === "iris" ? (
          <p className="hint">{t.irisHint}</p>
        ) : (
          <>
            <label className="field" data-invalid={link && !linkOk ? "yes" : undefined}>
              <span className="field__label">{t.formLink}</span>
              <input
                className="field__input"
                value={link}
                placeholder="https://forms.gle/..."
                inputMode="url"
                autoComplete="off"
                onChange={(e) => {
                  setLink(e.target.value);
                  setSalah(null);
                }}
              />
              <span className="hint">{t.formHint}</span>
            </label>
            <label className="field" data-invalid={!sheetOk ? "yes" : undefined}>
              <span className="field__label">{t.sheetLink}</span>
              <input
                className="field__input"
                value={sheet}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                inputMode="url"
                autoComplete="off"
                onChange={(e) => {
                  setSheet(e.target.value);
                  setSalah(null);
                }}
              />
              <span className="hint">{t.sheetHint}</span>
            </label>
            {pratinjau && (
              <div className="r2proj__prev">
                <div dangerouslySetInnerHTML={{ __html: pratinjau }} aria-hidden="true" />
                <span className="hint">{t.preview}</span>
              </div>
            )}
          </>
        )}
        {salah && (
          <span className="field__error" role="alert">
            {salah}
          </span>
        )}
      </div>
    </Dialog>
  );
}
