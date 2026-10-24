/**
 * The oprec account in Admin's Berkas review (2026-10-24). Self sign-up cannot
 * prove who owns a NIM, so this is where a squatter shows: the account's name
 * beside the practicum roster's (batch 24) and the CV. Reset Akun forgets the
 * password, signs every device out and shows a one-time claim code to hand to
 * the NIM's real owner.
 */
import { useState } from "react";
import Dialog from "../../../ui/Dialog";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import type { AccountResetResponse } from "../../../../lib/recruitment/types";
import { AK } from "../../candidate/akunStrings";

const sama = (a: string, b: string) =>
  a.toLocaleLowerCase().replace(/\s+/g, " ").trim() ===
  b.toLocaleLowerCase().replace(/\s+/g, " ").trim();

export default function AkunCek({
  lang,
  nim,
  nama,
  roster,
  judul = "h3",
}: {
  lang: Lang;
  nim: string;
  nama: string;
  roster: string | null;
  /** The heading class of the sheet it sits in (the S1 sheet uses rec-h3). */
  judul?: string;
}) {
  const t = AK[lang].panel;
  const [tanya, setTanya] = useState(false);
  const [kode, setKode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const beda = roster !== null && !sama(roster, nama);

  async function reset() {
    setBusy(true);
    const r = await recPost<AccountResetResponse>("account-reset", { nim });
    setBusy(false);
    if (isFail(r)) {
      window.Toast?.show(t.gagal, "danger");
      return;
    }
    setKode(r.klaim);
  }

  return (
    <section className="stack stack--sm">
      <div className="row row--between" style={{ gap: 8 }}>
        <h3 className={judul}>{t.title}</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTanya(true)}>
          {t.reset}
        </button>
      </div>
      {beda ? (
        <div className="rec-note rec-note--warn">
          <span>{t.beda(roster)}</span>
        </div>
      ) : (
        <span className="hint">{roster === null ? t.tanpaRoster : t.sama}</span>
      )}
      <Dialog
        open={tanya}
        onOpenChange={(o) => {
          setTanya(o);
          if (!o) setKode(null);
        }}
        title={kode ? t.kodeTitle : t.resetTitle}
        description={kode ? t.kodeBody : t.resetBody(nim)}
        size="sm"
        lang={lang}
        actions={
          kode ? (
            <button type="button" className="btn btn--primary" onClick={() => setTanya(false)}>
              {t.tutup}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setTanya(false)}>
                {AK[lang].btn.batal}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => void reset()}
              >
                {t.resetGo}
              </button>
            </>
          )
        }
      >
        {kode && (
          <p className="h2 mono" style={{ textAlign: "center", letterSpacing: "0.18em" }}>
            {kode}
          </p>
        )}
      </Dialog>
    </section>
  );
}
