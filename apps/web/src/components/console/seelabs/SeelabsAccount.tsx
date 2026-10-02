/** The Account page's SeeLabs card (Phase 9 Stage 3g, mockup a-account): my
 *  SeeLabs username and the bookmarklet. Never a password: IRIS doesn't sign
 *  in to SeeLabs. The username is saved through the Tim API, which lets
 *  anyone set their own. */
import { useEffect, useState } from "react";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { getJson, postJson } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { SL } from "./strings";
import BookmarkletPill from "./BookmarkletPill";
import "./seelabs.css";

export default function SeelabsAccount({ lang, nim }: { lang: Lang; nim: string }) {
  const t = SL[lang];
  const [saved, setSaved] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getJson<{ ok: boolean; orang: { nim: string; seelabsAkun: string | null }[] }>(
      "/api/session/tim",
    )
      .then((d) => {
        if (!alive || !d.ok) return;
        const v = d.orang.find((o) => o.nim === nim)?.seelabsAkun ?? "";
        setSaved(v);
        setVal(v);
      })
      .catch(() => alive && setSaved(""));
    return () => {
      alive = false;
    };
  }, [nim]);

  async function save() {
    setBusy(true);
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/tim", {
        aksi: "ubah",
        nim,
        seelabs: val.trim(),
      });
      if (!r.ok) throw new Error();
      setSaved(val.trim());
      window.Toast?.show(t.acctSaved, "ok");
    } catch {
      window.Toast?.show(t.codeFallback, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel seeacct">
      <div className="panel__head">
        <h2 className="panel__title">{t.acctTitle}</h2>
        <span className="pill">
          <LockSimpleIcon size={14} aria-hidden="true" />
          {t.acctNoPw}
        </span>
      </div>
      <div className="seeacct__row">
        <form
          className="seeacct__name"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="field">
            <span className="field__label">{t.acctName}</span>
            <input
              className="field__input mono"
              value={val}
              placeholder={t.acctNamePh}
              autoComplete="off"
              spellCheck={false}
              disabled={saved === null}
              onChange={(e) => setVal(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn--secondary"
            disabled={busy || saved === null || val.trim() === saved}
          >
            {t.save}
          </button>
        </form>
        <div className="stack stack--sm">
          <span className="field__label">{t.acctBm}</span>
          <BookmarkletPill t={t} />
        </div>
      </div>
      <span className="hint">{t.acctNever}</span>
    </section>
  );
}
