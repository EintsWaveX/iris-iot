/**
 * "Hotspot Ponsel Kamu" (prompt 10, EXAM-ENGINE 9.6a, mockup r3-putar): the
 * candidate types their own phone's SSID and password so their boards join it
 * first. POST test-hotspot takes { ssid, pass } and answers { ssid } only; the
 * password is sealed in the room's row and the page never has it back, so a
 * saved hotspot shows the SSID and dots with no field to echo into. Change
 * (Ganti) opens an empty form. A seat with no phone uses the pengawas'
 * hotspots and is never blocked. 12's editor page reuses this card.
 */
import { useState } from "react";
import PasswordField from "../../ui/PasswordField";
import type { Lang } from "../../../lib/kelas";
import { validHotspot } from "../../../lib/recruitment/hotspot";
import { saveHotspot, toast } from "./seatApi";
import { TS } from "./testStrings";

export default function HotspotCard({
  lang,
  saved,
  compact,
  onChanged,
}: {
  lang: Lang;
  saved: { ssid: string } | null;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const t = TS[lang].hotspot;
  const [open, setOpen] = useState(false);
  const [none, setNone] = useState(false);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = validHotspot(ssid, pass).length === 0;
  const form = !saved ? !none : open;

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await saveHotspot({ ssid: ssid.trim(), pass });
    setBusy(false);
    if (!r.ok) return setErr(t.fail);
    setPass("");
    setSsid("");
    setOpen(false);
    toast(t.saveOk);
    onChanged?.();
  }
  async function clear() {
    setBusy(true);
    const r = await saveHotspot({ clear: true });
    setBusy(false);
    if (!r.ok) return setErr(t.fail);
    setOpen(false);
    setNone(true);
    toast(t.clearOk);
    onChanged?.();
  }

  return (
    <section
      className={"panel r3hot" + (compact ? " r3hot--compact" : "")}
      aria-labelledby="r3hot-h"
    >
      <div className="panel__head">
        <h2 className="panel__title" id="r3hot-h">
          {t.title}
        </h2>
      </div>
      {saved && !open ? (
        <div className="stack stack--sm">
          <div className="rec-sum">
            <span className="hint">{t.ssid}</span>
            <b>{saved.ssid}</b>
            <span className="hint">{t.pass}</span>
            <b className="r3dots" aria-label={t.saved}>
              ••••••••
              <small className="hint"> {t.saved}</small>
            </b>
          </div>
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
              {t.change}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={clear}>
              {t.usePengawas}
            </button>
          </div>
          <span className="hint">{t.note}</span>
        </div>
      ) : form ? (
        <div className="stack stack--sm">
          <p className="hint">{t.lede}</p>
          <label className="field">
            <span className="field__label">{t.ssid}</span>
            <input
              className="field__input"
              value={ssid}
              maxLength={32}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setSsid(e.target.value)}
            />
          </label>
          <PasswordField
            label={t.pass}
            value={pass}
            onChange={setPass}
            autoComplete="new-password"
            hint={t.passHint}
            lang={lang}
          />
          <span className="hint">{t.mixed}</span>
          {err && (
            <span className="field__error" role="alert">
              {err}
            </span>
          )}
          <div className="row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !ok}
              onClick={save}
            >
              {t.save}
            </button>
            {saved ? (
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
                {t.cancel}
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => setNone(true)}>
                {t.usePengawas}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="stack stack--sm">
          <b>{t.none}</b>
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={() => setNone(false)}>
              {t.usePhone}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
