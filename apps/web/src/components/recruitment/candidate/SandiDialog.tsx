/**
 * The candidate changes their own oprec password (6 Nov 2026): current password, a new one twice.
 * RecNav hosts one and opens it from the account menu (bukaGantiSandi). The server signs every other
 * device out and hands this one a fresh cookie, so the page stays signed in.
 */
import { useEffect, useState, type FormEvent } from "react";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import { REC_SANDI_EVENT, isFail, recPost } from "../../../lib/recruitment/client";
import { SANDI_MAX, cekSandi } from "../../../lib/recruitment/akun";
import { AK } from "./akunStrings";

type Salah = Partial<Record<"lama" | "baru" | "ulang", string>>;

export default function SandiDialog({ lang }: { lang: Lang }) {
  const t = AK[lang].ganti;
  const [open, setOpen] = useState(false);
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [salah, setSalah] = useState<Salah>({});
  const [gagal, setGagal] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);

  useEffect(() => {
    const buka = () => {
      setLama("");
      setBaru("");
      setUlang("");
      setSalah({});
      setGagal(null);
      setOpen(true);
    };
    window.addEventListener(REC_SANDI_EVENT, buka);
    return () => window.removeEventListener(REC_SANDI_EVENT, buka);
  }, []);

  function periksa(): boolean {
    const s: Salah = {};
    if (!lama) s.lama = t.err.lama;
    if (!cekSandi(baru)) s.baru = t.err.baru;
    else if (baru !== ulang) s.ulang = t.err.ulang;
    setSalah(s);
    return Object.keys(s).length === 0;
  }

  async function simpan(e: FormEvent) {
    e.preventDefault();
    setGagal(null);
    if (kirim || !periksa()) return;
    setKirim(true);
    const r = await recPost<{ ok: true }>("account-password", { lama, baru });
    setKirim(false);
    if (!isFail(r)) {
      setOpen(false);
      window.Toast?.show(t.ok, "ok");
      return;
    }
    switch (r.kode) {
      case "sandi_salah":
        return setSalah({ lama: t.err.salah });
      case "sandi_sama":
        return setSalah({ baru: t.err.sama });
      case "terlalu_sering":
        return setGagal(t.err.terkunci);
      case "offline":
        return setGagal(t.err.offline);
      default:
        return setGagal(t.err.lain);
    }
  }

  const err = (k: keyof Salah) =>
    salah[k] ? (
      <span className="field__error" role="alert">
        {salah[k]}
      </span>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !kirim && setOpen(o)}
      title={t.title}
      description={t.desc}
      size="sm"
      lang={lang}
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={kirim}
            onClick={() => setOpen(false)}
          >
            {AK[lang].btn.batal}
          </button>
          <button type="submit" form="rec-sandi-form" className="btn btn--primary" disabled={kirim}>
            <span className="btn__label">{kirim ? t.tunggu : t.simpan}</span>
          </button>
        </>
      }
    >
      <form id="rec-sandi-form" className="stack" noValidate onSubmit={simpan}>
        {gagal && (
          <p className="banner banner--warn" role="alert">
            {gagal}
          </p>
        )}
        <label className="field" data-invalid={salah.lama ? "yes" : undefined}>
          <span className="field__label">{t.lama}</span>
          <input
            className="field__input"
            type="password"
            value={lama}
            autoComplete="current-password"
            maxLength={SANDI_MAX}
            onChange={(e) => setLama(e.target.value)}
          />
          {err("lama")}
        </label>
        <label className="field" data-invalid={salah.baru ? "yes" : undefined}>
          <span className="field__label">{t.baru}</span>
          <input
            className="field__input"
            type="password"
            value={baru}
            autoComplete="new-password"
            maxLength={SANDI_MAX}
            onChange={(e) => setBaru(e.target.value)}
          />
          {err("baru")}
        </label>
        <label className="field" data-invalid={salah.ulang ? "yes" : undefined}>
          <span className="field__label">{t.ulang}</span>
          <input
            className="field__input"
            type="password"
            value={ulang}
            autoComplete="new-password"
            maxLength={SANDI_MAX}
            onChange={(e) => setUlang(e.target.value)}
          />
          {err("ulang")}
        </label>
      </form>
    </Dialog>
  );
}
