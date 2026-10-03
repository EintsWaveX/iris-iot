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
 * - Assistants (Phase 9 Stage 6): Pendapatan, their own earnings, on top.
 * - Sign out.
 */
import SeelabsAccount from "../console/seelabs/SeelabsAccount";
import PraktikanAccount from "./PraktikanAccount";
import { EarningsCard } from "../bayar/Earnings";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckIcon, UserIcon } from "@phosphor-icons/react";
import PasswordField, { kekuatanSandi } from "../ui/PasswordField";
import SegmentedControl from "../ui/SegmentedControl";
import { StateView } from "../ui/Display";
import FeedbackSummary from "../shared/FeedbackSummary";
import { getJson, href, KELOMPOK_NAMA, meChanged, postJson, useMe, dict } from "../../lib/app";
import { clearLangPref, readLangPref, saveLangPref } from "../../lib/hooks";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { semesterDariTanggal } from "../../lib/jadwal-parser";
import { bahasaKonten, pathForLang, type Lang } from "../../lib/kelas";
import type { BarisJadwal } from "../../lib/jadwal-next";
import type { Ringkasan } from "../../lib/umpan-balik";
import "./AccountPage.css";
import BetaBadge from "../ui/BetaBadge";

const T = dict({
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
    pwH: "Ganti Kata Sandi",
    pwSub: "Minimal 8 karakter. Setelah diganti, sandi awal tidak berlaku lagi.",
    pwFirst: "Kamu masih memakai sandi awal. Buat sandi sendiri sekarang.",
    lama: "Sandi sekarang",
    baru: "Sandi baru",
    ulang: "Ulangi sandi baru",
    simpan: "Simpan Sandi",
    menyimpan: "Menyimpan…",
    beda: "Kedua sandi baru tidak sama.",
    pendek: "Sandi baru minimal 8 karakter.",
    salah: "Sandi sekarang salah.",
    terkunci: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
    gagal: "Gagal menyimpan. Coba lagi.",
    ok: "Kata sandi diganti.",
    jadwalH: "Jadwal Saya",
    jadwalNone: "Tidak ada slot mengajar di semester ini.",
    lihatJadwal: "Buka Jadwal",
    hari: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
    kGroups: (g: number[]) => `Kelompok ${g.join(", ")}`,
    inter: "Internasional",
    fbH: "Umpan Balik Saya",
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
    pwH: "Change Password",
    pwSub: "At least 8 characters. Once changed, the starting password stops working.",
    pwFirst: "You are still on the starting password. Set your own now.",
    lama: "Current password",
    baru: "New password",
    ulang: "Repeat the new password",
    simpan: "Save Password",
    menyimpan: "Saving…",
    beda: "The two new passwords do not match.",
    pendek: "The new password needs at least 8 characters.",
    salah: "The current password is wrong.",
    terkunci: "Too many attempts. Wait a few minutes and try again.",
    gagal: "Could not save. Try again.",
    ok: "Password changed.",
    jadwalH: "My Schedule",
    jadwalNone: "No teaching slots this semester.",
    lihatJadwal: "Open Schedule",
    hari: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    kGroups: (g: number[]) => `Group ${g.join(", ")}`,
    inter: "International",
    fbH: "My Feedback",
    fbSub: "Only you see this. No student names or IDs.",
    fbEmpty: "No feedback yet.",
    fbCount: (n: number) => `${n} ${n === 1 ? "response" : "responses"}`,
    keluar: "Sign Out",
    signedOut: "You are signed out.",
    needLogin: "Sign in to see your account.",
    masuk: "Sign In",
  },
  zh: {
    title: "账号",
    asisten: "助教",
    praktikan: "学员",
    nim: "NIM",
    divisi: "部门",
    kelompok: (k: number) => `第 ${k} 组`,
    langH: "语言",
    langSub: "自动按班级类型：普通班用印尼语，国际班用英语。",
    auto: "自动",
    langSaved: "语言已保存。",
    pwH: "修改密码",
    pwSub: "至少 8 个字符。修改后初始密码就会失效。",
    pwFirst: "你还在用初始密码。现在设置你自己的。",
    lama: "当前密码",
    baru: "新密码",
    ulang: "再输一次新密码",
    simpan: "保存密码",
    menyimpan: "保存中…",
    beda: "两次输入的新密码不一样。",
    pendek: "新密码至少要 8 个字符。",
    salah: "当前密码不对。",
    terkunci: "尝试次数太多。等几分钟再试。",
    gagal: "保存失败。再试一次。",
    ok: "密码已修改。",
    jadwalH: "我的课表",
    jadwalNone: "本学期没有带课的时段。",
    lihatJadwal: "打开课表",
    hari: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
    kGroups: (g: number[]) => `第 ${g.join("、")} 组`,
    inter: "国际班",
    fbH: "我的反馈",
    fbSub: "只有你能看到。没有学员姓名或 NIM。",
    fbEmpty: "还没有反馈。",
    fbCount: (n: number) => `${n} 条回应`,
    keluar: "退出登录",
    signedOut: "你已经退出登录。",
    needLogin: "登录后查看你的账号。",
    masuk: "登录",
  },
});
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
            <CheckIcon size={16} aria-hidden="true" />
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
        icon={<UserIcon size={28} />}
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
  if (!asisten) return <PraktikanAccount lang={lang} me={me} />;

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
            {asisten && me.divisi && <span className="pill">{me.divisi[bahasaKonten(lang)]}</span>}
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

      {asisten && <EarningsCard lang={lang} nim={me.nim} />}

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
                {
                  value: "zh",
                  label: (
                    <>
                      中文
                      <BetaBadge />
                    </>
                  ),
                },
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

          {asisten && <SeelabsAccount lang={lang} nim={me.nim} />}
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
