/**
 * Which QR an event's wall shows (user, 2026-11-03): the IRIS one, or one made
 * from a Google Form link. For the form, the Panitia paste two links: the form
 * (the QR is made from it) and its responses spreadsheet (the wall reads the
 * last four rows from it). Saved as the `qr` setting, one entry per event.
 */
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import Confirm from "../../ui/Confirm";
import Dialog from "../../ui/Dialog";
import SegmentedControl from "../../ui/SegmentedControl";
import { Switch } from "../../ui/Controls";
import type { Lang } from "../../../lib/kelas";
import { isFail, recGet, recPost, useRecSettings } from "../../../lib/recruitment/client";
import {
  bacaSheet,
  cekLinkQr,
  qrDengan,
  qrUntuk,
  type QrMap,
} from "../../../lib/recruitment/qr-luar";
import type { QrTestResetResponse, SettingsResponse } from "../../../lib/recruitment/types";
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
  uji,
  ujiCount,
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
  /** Test mode is on for this event (saved, not the draft) */
  uji: boolean;
  /** Test scans saved for this event */
  ujiCount: number;
  onSaved: () => void;
}) {
  const t = S2[lang].qr.luar;
  const settings = useRecSettings(open);
  const [mode, setMode] = useState(modeAwal);
  const [link, setLink] = useState(linkAwal);
  const [sheet, setSheet] = useState(sheetAwal);
  const [salah, setSalah] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [sibukUji, setSibukUji] = useState(false);
  const [tanyaReset, setTanyaReset] = useState(false);

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
    // A hand-opened attendance (buka) and the test mode (uji) survive a change of QR
    const ada = qrUntuk(lama, eventId);
    const bendera = { ...(ada.buka ? { buka: true } : {}), ...(ada.uji ? { uji: true } : {}) };
    const peta = qrDengan(
      lama,
      eventId,
      mode === "iris"
        ? { mode, link: "", sheet: "", ...bendera }
        : { mode, link: linkOk ?? "", sheet: sheet.trim(), ...bendera },
    );
    setSibuk(true);
    const r = await recPost<{ ok: true }>("setting-save", { key: "qr", value: peta });
    setSibuk(false);
    if (isFail(r)) return setSalah(r.kode === "tanpa_hak" ? t.errHak : t.errSave);
    settings.refresh();
    onSaved();
    onOpenChange(false);
  };

  /** Test mode on or off. Off also deletes the test data first, so the real attendance starts clean. */
  const ubahUji = async (v: boolean) => {
    setSibukUji(true);
    setSalah(null);
    if (!v) {
      const h = await recPost<QrTestResetResponse>("qr-test-reset", { event: eventId });
      if (isFail(h)) {
        setSibukUji(false);
        return setSalah(t.testFail);
      }
    }
    // Read the setting fresh: another tab may have changed the other events' entries meanwhile
    const s = await recGet<SettingsResponse>("settings");
    if (isFail(s)) {
      setSibukUji(false);
      return setSalah(t.testFail);
    }
    const lama = s.settings.find((x) => x.key === "qr")?.value as QrMap | undefined;
    const baru = { ...qrUntuk(lama, eventId) };
    if (v) baru.uji = true;
    else delete baru.uji;
    const r = await recPost<{ ok: true }>("setting-save", {
      key: "qr",
      value: qrDengan(lama, eventId, baru),
    });
    setSibukUji(false);
    if (isFail(r)) return setSalah(r.kode === "tanpa_hak" ? t.errHak : t.testFail);
    settings.refresh();
    onSaved();
  };

  const resetUji = async (): Promise<boolean> => {
    const r = await recPost<QrTestResetResponse>("qr-test-reset", { event: eventId });
    if (isFail(r)) {
      window.Toast?.show(t.testFail, "danger");
      return false;
    }
    window.Toast?.show(t.testResetDone(r.removed), "ok");
    onSaved();
    return true;
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        lang={lang}
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
                  autoCapitalize="none"
                  spellCheck={false}
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
                  autoCapitalize="none"
                  spellCheck={false}
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
          {/* Test mode works for both QRs. It follows the saved QR (modeAwal), not the draft above, because the switch
              saves at once. A Google Form keeps nothing in IRIS, so there is nothing to count or reset for it. */}
          <section className="r2proj__uji" aria-label={t.testTitle}>
            <Switch
              on={uji}
              onChange={(v) => void ubahUji(v)}
              label={t.testSwitch}
              showLabel
              busy={sibukUji}
              disabled={sibukUji}
            />
            <p className="hint">{modeAwal === "luar" ? t.testHintLuar : t.testHint}</p>
            {modeAwal === "iris" && (
              <div className="r2proj__ujirow">
                <span className="hint" aria-live="polite">
                  {t.testCount(ujiCount)}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={sibukUji || ujiCount === 0}
                  onClick={() => setTanyaReset(true)}
                >
                  <span className="btn__label">{t.testReset}</span>
                </button>
              </div>
            )}
            {uji && (
              <p className="hint">{modeAwal === "luar" ? t.testOffNoteLuar : t.testOffNote}</p>
            )}
          </section>
          {salah && (
            <span className="field__error" role="alert">
              {salah}
            </span>
          )}
        </div>
      </Dialog>
      <Confirm
        open={tanyaReset}
        onOpenChange={setTanyaReset}
        lang={lang}
        title={t.testResetAsk}
        body={t.testResetBody}
        confirmLabel={t.testResetYes}
        onConfirm={resetUji}
      />
    </>
  );
}
