/**
 * /account and /en/account (Phase 8).
 *
 * - Who you are: an assistant's code, name, NIM and division; a
 *   praktikan's name, NIM and group.
 * - Language: automatic (follows the class type), Indonesian or English,
 *   saved per browser.
 * - Assistants: change password at any time (current, new with a strength
 *   meter, repeat), their week from the schedule, and "Umpan balik saya"
 *   (feedback about them only, anonymous).
 * - Sign out.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, UserRound } from "lucide-react";
import PasswordField, { kekuatanSandi } from "../ui/PasswordField";
import SegmentedControl from "../ui/SegmentedControl";
import { StateView } from "../ui/Display";
import FeedbackSummary from "../shared/FeedbackSummary";
import { getJson, href, KELOMPOK_NAMA, meChanged, postJson, useMe } from "../../lib/app";
import { clearLangPref, readLangPref, saveLangPref } from "../../lib/hooks";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { semesterDariTanggal } from "../../lib/jadwal-parser";
import { pathForLang, type Lang } from "../../lib/kelas";
import type { BarisJadwal } from "../../lib/jadwal-next";
import type { Ringkasan } from "../../lib/umpan-balik";
import "./AccountPage.css";

const T = {
  id: {
    title: "Akun",
    asisten: "Asisten",
    praktikan: "Praktikan",
    nim: "NIM",
    divisi: "Divisi",
    kelompok: (k: number) => `Kelompok ${k}`,
    langH: "Bahasa",
    langSub:
      "Otomatis mengikuti jenis kelas: Reguler memakai Bahasa Indonesia, Internasional memakai English.",
    auto: "Otomatis",
    langSaved: "Bahasa tersimpan.",
    pwH: "Ganti kata sandi",
    pwSub: "Minimal 8 karakter. Setelah diganti, sandi awal tidak berlaku lagi.",
    pwFirst: "Kamu masih memakai sandi awal. Buat sandi sendiri sekarang.",
    lama: "Sandi sekarang",
    baru: "Sandi baru",
    ulang: "Ulangi sandi baru",
    simpan: "Simpan sandi",
    menyimpan: "Menyimpan…",
    beda: "Kedua sandi baru tidak sama.",
    pendek: "Sandi baru minimal 8 karakter.",
    salah: "Sandi sekarang salah.",
    terkunci: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
    gagal: "Gagal menyimpan. Coba lagi.",
    ok: "Kata sandi diganti.",
    jadwalH: "Jadwal saya",
    jadwalNone: "Tidak ada slot mengajar di semester ini.",
    lihatJadwal: "Buka jadwal",
    hari: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
    kGroups: (g: number[]) => `Kelompok ${g.join(", ")}`,
    inter: "INTER",
    fbH: "Umpan balik saya",
    fbSub: "Hanya kamu yang melihat ini. Tanpa nama atau NIM praktikan.",
    fbEmpty: "Belum ada umpan balik.",
    fbCount: (n: number) => `${n} tanggapan`,
    keluar: "Keluar",
    signedOut: "Kamu sudah keluar.",
    needLogin: "Masuk untuk melihat akunmu.",
    masuk: "Masuk",
  },
  en: {
    title: "Account",
    asisten: "Assistant",
    praktikan: "Student",
    nim: "Student ID",
    divisi: "Division",
    kelompok: (k: number) => `Group ${k}`,
    langH: "Language",
    langSub:
      "Automatic follows the class type: Regular uses Indonesian, International uses English.",
    auto: "Automatic",
    langSaved: "Language saved.",
    pwH: "Change password",
    pwSub: "At least 8 characters. Once changed, the starting password stops working.",
    pwFirst: "You are still on the starting password. Set your own now.",
    lama: "Current password",
    baru: "New password",
    ulang: "Repeat the new password",
    simpan: "Save password",
    menyimpan: "Saving…",
    beda: "The two new passwords do not match.",
    pendek: "The new password needs at least 8 characters.",
    salah: "The current password is wrong.",
    terkunci: "Too many attempts. Wait a few minutes and try again.",
    gagal: "Could not save. Try again.",
    ok: "Password changed.",
    jadwalH: "My schedule",
    jadwalNone: "No teaching slots this semester.",
    lihatJadwal: "Open schedule",
    hari: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    kGroups: (g: number[]) => `Group ${g.join(", ")}`,
    inter: "INTER",
    fbH: "My feedback",
    fbSub: "Only you see this. No student names or IDs.",
    fbEmpty: "No feedback yet.",
    fbCount: (n: number) => `${n} ${n === 1 ? "response" : "responses"}`,
    keluar: "Sign out",
    signedOut: "You are signed out.",
    needLogin: "Sign in to see your account.",
    masuk: "Sign in",
  },
};
type Tx = (typeof T)["id"];

function PasswordForm({ t, lang, first }: { t: Tx; lang: Lang; first: boolean }) {
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: "lama" | "baru" | "ulang"; msg: string } | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (baru.length < 8) return setErr({ field: "baru", msg: t.pendek });
    if (baru !== ulang) return setErr({ field: "ulang", msg: t.beda });
    setErr(null);
    setBusy(true);
    try {
      const d = await postJson<{ ok: boolean; kode?: string }>("/api/auth/change-password", {
        lama,
        baru,
      });
      if (d.ok) {
        setLama("");
        setBaru("");
        setUlang("");
        setDone(true);
        window.Toast?.show(t.ok, "ok");
        meChanged();
      } else if (d.kode === "tidak_cocok") setErr({ field: "lama", msg: t.salah });
      else if (d.kode === "terkunci") setErr({ field: "lama", msg: t.terkunci });
      else if (d.kode === "terlalu_pendek") setErr({ field: "baru", msg: t.pendek });
      else setErr({ field: "lama", msg: t.gagal });
    } catch {
      setErr({ field: "lama", msg: t.gagal });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="acctpage__pw" noValidate onSubmit={submit}>
      {first && <p className="acctpage__first">{t.pwFirst}</p>}
      <PasswordField
        label={t.lama}
        value={lama}
        onChange={setLama}
        autoComplete="current-password"
        error={err?.field === "lama" ? err.msg : undefined}
        lang={lang}
      />
      <PasswordField
        label={t.baru}
        value={baru}
        onChange={setBaru}
        autoComplete="new-password"
        meter
        error={err?.field === "baru" ? err.msg : undefined}
        lang={lang}
      />
      <PasswordField
        label={t.ulang}
        value={ulang}
        onChange={setUlang}
        autoComplete="new-password"
        error={err?.field === "ulang" ? err.msg : undefined}
        lang={lang}
      />
      <div className="acctpage__actions">
        {done && (
          <span className="acctpage__done" role="status">
            <Check size={16} aria-hidden="true" />
            {t.ok}
          </span>
        )}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={busy || !lama || kekuatanSandi(baru) === 0 || !ulang}
        >
          {busy ? t.menyimpan : t.simpan}
        </button>
      </div>
    </form>
  );
}

export default function AccountPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const me = useMe();
  const [pref, setPref] = useState<"auto" | Lang>("auto");
  const [jadwal, setJadwal] = useState<BarisJadwal[] | null>(null);
  const [fb, setFb] = useState<Ringkasan | null>(null);

  useEffect(() => setPref(readLangPref() ?? "auto"), []);
  useEffect(() => {
    if (me?.role !== "asisten") return;
    getJson<{ ok: boolean; jadwal: BarisJadwal[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(hariIniWib())}`,
    )
      .then((d) => setJadwal(d.ok ? d.jadwal : []))
      .catch(() => setJadwal([]));
    getJson<{ ok: boolean; ringkasan: Ringkasan }>("/api/session/feedback?scope=mine")
      .then((d) => d.ok && setFb(d.ringkasan))
      .catch(() => {});
  }, [me]);

  const kode = (me?.kode ?? "").toUpperCase();
  const mine = useMemo(
    () =>
      (jadwal ?? [])
        .filter((j) => j.asisten.some((a) => a.toUpperCase() === kode))
        .sort((a, b) => a.hari - b.hari || a.slot - b.slot),
    [jadwal, kode],
  );

  function pilihBahasa(v: string) {
    const next = v as "auto" | Lang;
    setPref(next);
    if (next === "auto") clearLangPref();
    else saveLangPref(next);
    window.Toast?.show(t.langSaved, "ok");
    if (next !== "auto" && next !== lang) location.assign(pathForLang(location.pathname, next));
  }

  async function keluar() {
    try {
      await postJson("/api/auth/logout");
    } finally {
      meChanged();
      location.assign(href(lang, "/"));
    }
  }

  if (me === undefined) return <span className="skeleton" style={{ height: 360 }} />;
  if (me === null) {
    return (
      <StateView
        icon={<UserRound size={28} />}
        title={t.needLogin}
        actions={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.LoginDialog?.open()}
          >
            {t.masuk}
          </button>
        }
      />
    );
  }

  const asisten = me.role === "asisten";
  const k = me.kelompok ?? 0;

  return (
    <div className="acctpage">
      <header className="acctpage__hero sweep-edge">
        <span
          className="acctpage__avatar"
          aria-hidden="true"
          style={asisten ? undefined : ({ "--g": `var(--group-${k || 1})` } as React.CSSProperties)}
        >
          {asisten ? kode || me.nama.slice(0, 2) : me.nama.slice(0, 1)}
        </span>
        <div className="stack stack--sm">
          <span className="label-caps">{asisten ? t.asisten : t.praktikan}</span>
          <h1 className="acctpage__name">{me.nama}</h1>
          <span className="acctpage__facts">
            <span className="pill pill--mono">
              {t.nim} {me.nim}
            </span>
            {asisten && me.divisi && <span className="pill">{me.divisi[lang]}</span>}
            {!asisten && k > 0 && (
              <span
                className="pill pill--group"
                style={{ "--pill-hue": `var(--group-${k})` } as React.CSSProperties}
              >
                {t.kelompok(k)}
                {KELOMPOK_NAMA[k] ? ` · ${KELOMPOK_NAMA[k]}` : ""}
              </span>
            )}
          </span>
        </div>
        <button type="button" className="btn btn--ghost acctpage__out" onClick={keluar}>
          {t.keluar}
        </button>
      </header>

      <div className="acctpage__grid">
        <div className="acctpage__col">
          <section className="panel">
            <h2 className="panel__title">{t.langH}</h2>
            <p className="hint">{t.langSub}</p>
            <SegmentedControl
              value={pref}
              onValueChange={pilihBahasa}
              aria-label={t.langH}
              options={[
                { value: "auto", label: t.auto },
                { value: "id", label: "Bahasa Indonesia" },
                { value: "en", label: "English" },
              ]}
            />
          </section>

          {asisten && (
            <section className="panel">
              <h2 className="panel__title">{t.pwH}</h2>
              <p className="hint">{t.pwSub}</p>
              <PasswordForm t={t} lang={lang} first={Boolean(me.perluAturSandi)} />
            </section>
          )}
        </div>

        {asisten && (
          <div className="acctpage__col">
            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">{t.jadwalH}</h2>
                <a className="btn btn--ghost btn--sm" href={href(lang, "/schedule")}>
                  {t.lihatJadwal}
                </a>
              </div>
              {jadwal === null ? (
                <span className="skeleton" style={{ height: 120 }} />
              ) : mine.length === 0 ? (
                <p className="hint">{t.jadwalNone}</p>
              ) : (
                <ul className="acctpage__slots">
                  {mine.map((j) => {
                    const groups = j.asisten
                      .map((a, i) => (a.toUpperCase() === kode ? i + 1 : 0))
                      .filter(Boolean);
                    return (
                      <li key={`${j.hari}-${j.slot}`}>
                        <b>{t.hari[j.hari]}</b>
                        <span className="mono">{SLOT_MULAI[j.slot]}</span>
                        <span className="hint">{t.kGroups(groups)}</span>
                        {j.kelas === "internasional" && (
                          <span className="pill pill--gold">{t.inter}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2 className="panel__title">{t.fbH}</h2>
              <p className="hint">{t.fbSub}</p>
              <FeedbackSummary data={fb} lang={lang} empty={t.fbEmpty} countLabel={t.fbCount} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
