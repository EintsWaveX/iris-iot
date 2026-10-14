/** The Account page's SeeLabs card (Phase 9 Stage 3g, mockup a-account): my
 *  SeeLabs username and the bookmarklet. Never a password: IRIS doesn't sign
 *  in to SeeLabs. The username is saved through the Tim API, which lets
 *  anyone set their own. */
import { useEffect, useRef, useState } from "react";
import { CaretRightIcon, HandIcon } from "@phosphor-icons/react";
import { getJson, href, postJson } from "../../../lib/app";
import { useSegar } from "../../../lib/siaran";
import type { Lang } from "../../../lib/kelas";
import { SL } from "./strings";
import BookmarkletPill from "./BookmarkletPill";
import "./seelabs.css";

export default function SeelabsAccount({ lang, nim }: { lang: Lang; nim: string }) {
  const t = SL[lang];
  const [saved, setSaved] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  // Saved from another device: shown here too, unless this box was edited.
  const segar = useSegar(["tim"]);
  const tersimpan = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getJson<{ ok: boolean; orang: { nim: string; seelabsAkun: string | null }[] }>(
      "/api/session/tim",
    )
      .then((d) => {
        if (!alive || !d.ok) return;
        const v = d.orang.find((o) => o.nim === nim)?.seelabsAkun ?? "";
        const tadi = tersimpan.current;
        tersimpan.current = v;
        setSaved(v);
        setVal((cur) => (tadi === null || cur === tadi ? v : cur));
      })
      .catch(() => alive && setSaved((s) => s ?? ""));
    return () => {
      alive = false;
    };
  }, [nim, segar]);

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
          <HandIcon size={14} aria-hidden="true" />
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
          <span className="row" style={{ gap: 8 }}>
            <BookmarkletPill t={t} />
            <a className="btn btn--ghost btn--sm" href={href(lang, "/session#seelabs=panduan")}>
              {t.howTo}
              <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
            </a>
          </span>
        </div>
      </div>
      <span className="hint">{t.acctNever}</span>
    </section>
  );
}
