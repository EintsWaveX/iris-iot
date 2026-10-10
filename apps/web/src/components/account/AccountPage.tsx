/**
 * /account and /en/account (Phase 8, laid out per mockup a-account in
 * Phase 9).
 *
 * - An assistant's name as the page title, with their code, division, tier
 *   and the Pencipta / DEV badges.
 * - Pendapatan (their own earnings) and the SeeLabs account.
 * - Change password (current, new with a strength meter, repeat) beside
 *   Tampilan (theme, background detail, language, nav clock).
 * - Their week from the schedule and "Umpan balik saya" (feedback about them
 *   only, anonymous).
 * - A praktikan gets PraktikanAccount. Signing out is in the account menu.
 */
import SeelabsAccount from "../console/seelabs/SeelabsAccount";
import PraktikanAccount from "./PraktikanAccount";
import { EarningsCard } from "../bayar/Earnings";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckIcon, SlidersHorizontalIcon, UserIcon } from "@phosphor-icons/react";
import PasswordField, { kekuatanSandi } from "../ui/PasswordField";
import { StateView } from "../ui/Display";
import FeedbackSummary from "../shared/FeedbackSummary";
import { getJson, href, meChanged, postJson, useMe, dict } from "../../lib/app";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { semesterDariTanggal } from "../../lib/jadwal-parser";
import type { Lang } from "../../lib/kelas";
import { divisiLabel } from "../../lib/labels";
import type { BarisJadwal } from "../../lib/jadwal-next";
import type { Ringkasan } from "../../lib/umpan-balik";
import "./AccountPage.css";
import { BUKA_TAMPILAN, DisplaySummary } from "../shell/DisplayPanel";
import PersonBadges from "../ui/PersonBadges";
import TierBadge from "../ui/TierBadge";
import { openSignIn } from "../../lib/signin";
import { useSiaran } from "../../lib/siaran";

const T = dict({
  id: {
    title: "Akun",
    display: "Tampilan",
    displaySub: "Tema, detail latar, bahasa dan jam di navigasi diatur dari panel Tampilan.",
    displayGo: "Buka Tampilan",
    pwH: "Ganti Kata Sandi",
    pwSub: "Minimal 8 karakter. Setelah diganti, sandi awal tidak berlaku lagi.",
    pwFirst: "Kamu masih memakai sandi awal. Sandi sendiri lebih aman, tapi tidak wajib.",
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
    needLogin: "Masuk untuk melihat akunmu.",
    masuk: "Masuk",
  },
  en: {
    title: "Account",
    display: "Display",
    displaySub:
      "Theme, background detail, language and the nav clock are set in the Display panel.",
    displayGo: "Open Display",
    pwH: "Change Password",
    pwSub: "At least 8 characters. Once changed, the starting password stops working.",
    pwFirst: "You are still on the starting password. Your own is safer, but it isn't required.",
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
    needLogin: "Sign in to see your account.",
    masuk: "Sign In",
  },
  zh: {
    title: "账号",
    display: "显示",
    displaySub: "主题、背景细节、语言和导航栏时钟都在“显示”面板里设置。",
    displayGo: "打开显示设置",
    pwH: "修改密码",
    pwSub: "至少 8 个字符。修改后初始密码就会失效。",
    pwFirst: "你还在用初始密码。设置自己的密码更安全，但不是必须的。",
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
    fbSub: "只有你能看到。没有学生姓名或 NIM。",
    fbEmpty: "还没有反馈。",
    fbCount: (n: number) => `${n} 条回应`,
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
  const [jadwal, setJadwal] = useState<BarisJadwal[] | null>(null);
  const [fb, setFb] = useState<Ringkasan | null>(null);

  const muat = () => {
    if (me?.role !== "asisten") return;
    getJson<{ ok: boolean; jadwal: BarisJadwal[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(hariIniWib())}`,
    )
      .then((d) => setJadwal(d.ok ? d.jadwal : []))
      .catch(() => setJadwal([]));
    getJson<{ ok: boolean; ringkasan: Ringkasan }>("/api/session/feedback?scope=mine")
      .then((d) => d.ok && setFb(d.ringkasan))
      .catch(() => {});
  };
  useEffect(muat, [me]);
  useSiaran(["jadwal", "tim", "umpan"], muat, me?.role === "asisten");
  // #sandi (Home's "Setel Sekarang", 2026-10-06): straight to the form,
  // the cursor in its first field, instead of the top of the page.
  useEffect(() => {
    if (me?.role !== "asisten" || location.hash !== "#sandi") return;
    requestAnimationFrame(() => {
      const el = document.getElementById("sandi");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  }, [me]);

  const kode = (me?.kode ?? "").toUpperCase();
  const mine = useMemo(
    () =>
      (jadwal ?? [])
        .filter((j) => j.asisten.some((a) => a.toUpperCase() === kode))
        .sort((a, b) => a.hari - b.hari || a.slot - b.slot),
    [jadwal, kode],
  );

  if (me === undefined) return <span className="skeleton" style={{ height: 360 }} />;
  if (me === null) {
    return (
      <StateView
        icon={<UserIcon size={28} />}
        title={t.needLogin}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => openSignIn()}>
            {t.masuk}
          </button>
        }
      />
    );
  }

  if (me.role !== "asisten") return <PraktikanAccount lang={lang} me={me} />;

  // Mockup a-account: the name as the page title with its badges, then
  // Pendapatan and SeeLabs. Signing out lives in the account menu.
  return (
    <div className="acctpage">
      <header className="page-header">
        <span className="page-header__eyebrow">{t.title}</span>
        <h1 className="page-header__title">{me.nama}</h1>
        <span className="acctpage__badges">
          {kode && <span className="pill pill--accent pill--mono">{kode}</span>}
          {me.divisi && <span className="pill">{divisiLabel(me.divisi, lang)}</span>}
          {me.tier && <TierBadge tier={me.tier} lang={lang} />}
          <PersonBadges badges={me.badges ?? []} lang={lang} />
        </span>
      </header>

      <EarningsCard lang={lang} nim={me.nim} />
      <SeelabsAccount lang={lang} nim={me.nim} />

      {/* Wide screens: Ganti Kata Sandi above Jadwalku on the left, Tampilan
          beside both with the same bottom edge, then Feedback full width. */}
      <div className="acctpage__main">
        <section className="panel acctpage__pwcard" id="sandi">
          <h2 className="panel__title">{t.pwH}</h2>
          <p className="hint">{t.pwSub}</p>
          <PasswordForm t={t} lang={lang} first={Boolean(me.perluAturSandi)} />
        </section>
        <section className="panel acctpage__display">
          <h2 className="panel__title">{t.display}</h2>
          <p className="hint">{t.displaySub}</p>
          <DisplaySummary lang={lang} />
          <button
            type="button"
            className="btn"
            onClick={() => window.dispatchEvent(new Event(BUKA_TAMPILAN))}
          >
            <SlidersHorizontalIcon size={18} aria-hidden="true" />
            {t.displayGo}
          </button>
        </section>
        <section className="panel acctpage__mine">
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

        <section className="panel acctpage__fb">
          <h2 className="panel__title">{t.fbH}</h2>
          <p className="hint">{t.fbSub}</p>
          <FeedbackSummary data={fb} lang={lang} empty={t.fbEmpty} countLabel={t.fbCount} />
        </section>
      </div>
    </div>
  );
}
