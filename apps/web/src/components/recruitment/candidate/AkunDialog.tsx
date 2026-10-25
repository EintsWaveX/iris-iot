/**
 * The oprec account dialog (2026-10-24): Masuk or Buat Akun with NIM, name
 * and a password, apart from the practicum sign-in. RecNav hosts one per page
 * and opens it on bukaAkun() (lib/recruitment/client); after signing in the
 * page loads `next` (or itself), so every island reads the new account.
 *
 * After Admin's Reset Akun the server asks for the claim code (perlu_klaim)
 * and the field appears.
 */
import { useEffect, useState, type FormEvent } from "react";
import Dialog from "../../ui/Dialog";
import SegmentedControl from "../../ui/SegmentedControl";
import type { Lang } from "../../../lib/kelas";
import { openSignIn } from "../../../lib/signin";
import { REC_AKUN_EVENT, isFail, recPost, type AkunMode } from "../../../lib/recruitment/client";
import { cekNama, cekNimOprec, cekSandi, NAMA_MAX, SANDI_MAX } from "../../../lib/recruitment/akun";
import type { AccountResponse } from "../../../lib/recruitment/types";
import { FORMULIR } from "../../../lib/recruitment/formulir";
import { AK } from "./akunStrings";

type Salah = Partial<Record<"nim" | "nama" | "sandi" | "ulang" | "klaim", string>>;

export default function AkunDialog({ lang }: { lang: Lang }) {
  const t = AK[lang];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AkunMode>("masuk");
  const [next, setNext] = useState<string | undefined>();
  const [nim, setNim] = useState("");
  const [nama, setNama] = useState("");
  const [sandi, setSandi] = useState("");
  const [ulang, setUlang] = useState("");
  const [klaim, setKlaim] = useState("");
  const [butuhKlaim, setButuhKlaim] = useState(false);
  const [salah, setSalah] = useState<Salah>({});
  const [gagal, setGagal] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);

  useEffect(() => {
    const buka = (e: Event) => {
      const d = (e as CustomEvent<{ mode?: AkunMode; next?: string }>).detail ?? {};
      // While the Google Form is the way in, the Panitia make every account (2026-10-25).
      setMode(FORMULIR ? "masuk" : (d.mode ?? "masuk"));
      setNext(d.next);
      setGagal(null);
      setSalah({});
      setOpen(true);
    };
    window.addEventListener(REC_AKUN_EVENT, buka);
    return () => window.removeEventListener(REC_AKUN_EVENT, buka);
  }, []);

  const daftar = mode === "daftar";

  function periksa(): boolean {
    const s: Salah = {};
    if (!cekNimOprec(nim.trim())) s.nim = t.err.nim;
    if (daftar) {
      if (!cekNama(nama)) s.nama = t.err.nama;
      if (!cekSandi(sandi)) s.sandi = t.err.sandi;
      else if (sandi !== ulang) s.ulang = t.err.ulang;
      if (butuhKlaim && !klaim.trim()) s.klaim = t.err.perluKlaim;
    } else if (!sandi) s.sandi = t.err.sandi;
    setSalah(s);
    return Object.keys(s).length === 0;
  }

  async function kirimForm(e: FormEvent) {
    e.preventDefault();
    setGagal(null);
    if (kirim || !periksa()) return;
    setKirim(true);
    const r = await recPost<AccountResponse>(
      daftar ? "account-signup" : "account-signin",
      daftar
        ? { nim: nim.trim(), nama, sandi, ...(butuhKlaim ? { klaim } : {}) }
        : { nim: nim.trim(), sandi },
    );
    if (!isFail(r)) {
      // A fresh page: the banner, the navbar and the candidate page all read the account.
      location.assign(next ?? location.href);
      return;
    }
    setKirim(false);
    switch (r.kode) {
      case "salah":
        return setGagal(t.err.salah);
      case "terlalu_sering":
        return setGagal(t.err.terkunci);
      case "akun_ada":
        return setGagal(t.err.akunAda);
      case "nim_asisten":
        return setGagal(t.err.nimAsisten);
      case "perlu_klaim":
        setButuhKlaim(true);
        return setSalah({ klaim: t.err.perluKlaim });
      case "klaim_salah":
        return setSalah({ klaim: t.err.klaimSalah });
      case "offline":
        return setGagal(t.err.offline);
      case "data_salah": {
        const f = r.field as keyof Salah | undefined;
        if (f && f in t.err) return setSalah({ [f]: t.err[f as "nim" | "nama" | "sandi"] });
        return setGagal(t.err.lain);
      }
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
      onOpenChange={setOpen}
      title={daftar ? t.title.daftar : t.title.masuk}
      description={t.desc}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
            {t.btn.batal}
          </button>
          <button type="submit" form="rec-akun-form" className="btn btn--primary" disabled={kirim}>
            <span className="btn__label">
              {kirim ? t.btn.tunggu : daftar ? t.btn.daftar : t.btn.masuk}
            </span>
          </button>
        </>
      }
    >
      <form id="rec-akun-form" className="stack" noValidate onSubmit={kirimForm}>
        {FORMULIR ? (
          <p className="hint">{t.formulir}</p>
        ) : (
          <SegmentedControl
            aria-label={t.title.masuk}
            value={mode}
            fill
            onValueChange={(v) => {
              setMode(v as AkunMode);
              setGagal(null);
              setSalah({});
            }}
            options={[
              { value: "masuk", label: t.tabs.masuk },
              { value: "daftar", label: t.tabs.daftar },
            ]}
          />
        )}
        {gagal && (
          <p className="banner banner--warn" role="alert">
            {gagal}
          </p>
        )}
        <label className="field" data-invalid={salah.nim ? "yes" : undefined}>
          <span className="field__label">{t.nim}</span>
          <input
            className="field__input mono"
            value={nim}
            inputMode="numeric"
            autoComplete="username"
            maxLength={12}
            placeholder="1010224XXXXX"
            onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))}
          />
          {err("nim") ?? (daftar && <span className="hint">{t.nimHint}</span>)}
        </label>
        {daftar && (
          <label className="field" data-invalid={salah.nama ? "yes" : undefined}>
            <span className="field__label">{t.nama}</span>
            <input
              className="field__input"
              value={nama}
              autoComplete="name"
              maxLength={NAMA_MAX}
              onChange={(e) => setNama(e.target.value)}
            />
            {err("nama") ?? <span className="hint">{t.namaHint}</span>}
          </label>
        )}
        <label className="field" data-invalid={salah.sandi ? "yes" : undefined}>
          <span className="field__label">{daftar ? t.sandiBaru : t.sandi}</span>
          <input
            className="field__input"
            type="password"
            value={sandi}
            autoComplete={daftar ? "new-password" : "current-password"}
            maxLength={SANDI_MAX}
            onChange={(e) => setSandi(e.target.value)}
          />
          {err("sandi") ?? (daftar && <span className="hint">{t.sandiHint}</span>)}
        </label>
        {daftar && (
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
        )}
        {daftar && butuhKlaim && (
          <label className="field" data-invalid={salah.klaim ? "yes" : undefined}>
            <span className="field__label">{t.klaim}</span>
            <input
              className="field__input mono"
              value={klaim}
              autoComplete="one-time-code"
              maxLength={12}
              onChange={(e) => setKlaim(e.target.value.toUpperCase())}
            />
            {err("klaim") ?? <span className="hint">{t.klaimHint}</span>}
          </label>
        )}
        <span className="hint">{daftar ? t.terpisah : t.lupa}</span>
        {!daftar && (
          <span className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="hint">{t.asisten}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setOpen(false);
                openSignIn(location.pathname + location.search);
              }}
            >
              {t.asistenBtn}
            </button>
          </span>
        )}
      </form>
    </Dialog>
  );
}
