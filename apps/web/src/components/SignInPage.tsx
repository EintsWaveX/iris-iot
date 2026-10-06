/**
 * Sign-in, its own page at /login (Phase 9 mockup p-login; a dialog over
 * any page until then).
 *
 * - One card, two roles: a praktikan types only the NIM (shown in big
 *   monospace digits), an assistant adds a password. While a session runs
 *   the server also asks a praktikan for its 4-digit code (perlu_kode),
 *   and the code field appears under the NIM.
 * - Validation is the page's own (no browser "please fill in this field"
 *   bubbles): the form is noValidate and errors sit under their field.
 * - A student's successful check-in shows the module, their group and its
 *   assistant (never a slot or a time), then one button into the practicum,
 *   or to the dashboard when no session runs.
 * - An assistant still on the starting password gets the set-password
 *   stage, with show/hide and a strength meter; "Later" keeps working and
 *   the Asisten home keeps a reminder until it is done.
 * - Where to go next: `?next=` if present (every "Masuk" button sets it to
 *   the page it was pressed on, see lib/signin.ts), otherwise the role's
 *   home (Dasbor or Konsol). A student in the International class with no
 *   language choice of their own lands on the English pages.
 * - Someone already signed in who opens /login goes straight on.
 */
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import SegmentedControl from "./ui/SegmentedControl";
import PasswordField from "./ui/PasswordField";
import {
  dict,
  getJson,
  KELOMPOK_NAMA,
  meChanged,
  postJson,
  MODUL_NAMA,
  type SesiNow,
} from "../lib/app";
import { langForKelas, pathForLang, type Lang } from "../lib/kelas";
import { readLangPref } from "../lib/hooks";
import { namaAsisten } from "../lib/people";
import { isSignInPath } from "../lib/signin";
import "./SignIn.css";

type Role = "praktikan" | "asisten";
type Stage = "login" | "set-password" | "welcome";

const T = dict({
  id: {
    title: "Masuk",
    setTitle: "Setel kata sandi asli",
    role: "Peran",
    praktikan: "Praktikan",
    asisten: "Asisten",
    nim: "NIM",
    nimPh: "2311102001",
    nimPhA: "NIM asisten",
    pwLabel: "Kata sandi",
    submit: "Masuk",
    needNim: "Isi NIM dulu.",
    needPw: "Isi kata sandi dulu.",
    kodeL: "Kode sesi",
    kodeHint: "4 angka di layar depan kelas.",
    needKode: "Isi 4 angka kode sesi.",
    setLede:
      "Kata sandi awal akun ini mudah ditebak. Setel kata sandi asli sekali di sini, dan kata sandi awal berhenti berlaku.",
    newPw: "Kata sandi baru",
    newPw2: "Ulangi kata sandi baru",
    min8: "Minimal 8 karakter.",
    mismatch: "Kedua kata sandi belum sama.",
    later: "Nanti saja",
    setBtn: "Setel kata sandi",
    welcome: (nama: string) => `Halo, ${nama}`,
    inSession: "Kamu masuk ke sesi",
    noSession:
      "Belum ada sesi berjalan. Kamu tetap bisa melihat nilai dan jurnal yang sudah kamu kerjakan.",
    modul: (m: number) => `Modul ${m}`,
    group: (n: number, nama?: string) => `Kelompok ${n}${nama ? ` · ${nama}` : ""}`,
    asistenL: (n: string) => `Asisten: ${n}`,
    belumAda: "belum ada",
    go: "Masuk ke Praktikum",
    goDash: "Ke Dasbor",
    offline: "Tidak dapat menghubungi server.",
    codes: {
      format_salah: "Formatnya belum benar. Periksa kembali isiannya.",
      terkunci: "Terlalu banyak percobaan gagal. Tunggu beberapa menit lalu coba lagi.",
      tidak_cocok: "NIM atau kata sandi tidak cocok.",
      perlu_kode: "Sesi sedang berjalan. Masukkan juga kode sesi dari layar depan.",
      kode_salah: "Kode sesinya belum cocok. Lihat lagi di layar depan.",
      tidak_ada_sesi:
        "Belum ada sesi yang berjalan. Masuk bisa dilakukan begitu asisten memulai sesi di jam praktikummu.",
      tidak_terdaftar: "NIM ini tidak ada di roster sesi yang berjalan. Tanyakan ke asistenmu.",
      mode_tot:
        "Asisten sedang latihan TOT, jadi akun Praktikan belum bisa dipakai. Coba lagi setelah latihannya selesai.",
      terlalu_pendek: "Kata sandi minimal 8 karakter.",
      galat_server: "Server sedang bermasalah. Coba lagi sesaat lagi.",
    } as Record<string, string>,
    fallback: "Masuk gagal. Coba lagi.",
  },
  en: {
    title: "Sign in",
    setTitle: "Set your own password",
    role: "Role",
    praktikan: "Student",
    asisten: "Assistant",
    nim: "NIM",
    nimPh: "2311102001",
    nimPhA: "Assistant NIM",
    pwLabel: "Password",
    submit: "Sign in",
    needNim: "Enter your NIM first.",
    needPw: "Enter your password first.",
    kodeL: "Session code",
    kodeHint: "The 4 digits on the screen at the front of the class.",
    needKode: "Enter the 4-digit session code.",
    setLede:
      "This account's starting password is easy to guess. Set your own once here and the starting one stops working.",
    newPw: "New password",
    newPw2: "Repeat the new password",
    min8: "At least 8 characters.",
    mismatch: "The two passwords do not match yet.",
    later: "Later",
    setBtn: "Set password",
    welcome: (nama: string) => `Hi, ${nama}`,
    inSession: "You are in the session",
    noSession:
      "No session is running. You can still see your scores and the journals you have done.",
    modul: (m: number) => `Module ${m}`,
    group: (n: number, nama?: string) => `Group ${n}${nama ? ` · ${nama}` : ""}`,
    asistenL: (n: string) => `Assistant: ${n}`,
    belumAda: "not yet",
    go: "Go to the Practicum",
    goDash: "To the Dashboard",
    offline: "Could not reach the server.",
    codes: {
      format_salah: "That format is not right. Check what you typed.",
      terkunci: "Too many failed attempts. Wait a few minutes and try again.",
      tidak_cocok: "The NIM or password does not match.",
      perlu_kode: "A session is running. Also enter the session code from the front screen.",
      kode_salah: "That session code doesn't match. Check the front screen again.",
      tidak_ada_sesi:
        "No session is running yet. You can sign in once an assistant starts the session for your slot.",
      tidak_terdaftar: "This NIM isn't on the running session's roster. Ask your assistant.",
      mode_tot:
        "The Asisten are in a TOT practice run, so Praktikan accounts can't be used yet. Try again once it's over.",
      terlalu_pendek: "The password needs at least 8 characters.",
      galat_server: "The server is having trouble. Try again in a moment.",
    } as Record<string, string>,
    fallback: "Sign-in failed. Try again.",
  },
  zh: {
    title: "登录",
    setTitle: "设置你自己的密码",
    role: "角色",
    praktikan: "学员",
    asisten: "助教",
    nim: "NIM",
    nimPh: "2311102001",
    nimPhA: "助教 NIM",
    pwLabel: "密码",
    submit: "登录",
    needNim: "先填 NIM。",
    needPw: "先填密码。",
    kodeL: "课程代码",
    kodeHint: "教室前方屏幕上的 4 位数字。",
    needKode: "请输入 4 位课程代码。",
    setLede: "这个账号的初始密码很容易猜到。在这里设置一次你自己的密码，初始密码就会失效。",
    newPw: "新密码",
    newPw2: "再输一次新密码",
    min8: "至少 8 个字符。",
    mismatch: "两次密码还不一样。",
    later: "以后再说",
    setBtn: "设置密码",
    welcome: (nama: string) => `你好，${nama}`,
    inSession: "你正在上课",
    noSession: "现在没有课。你仍然可以看你的分数和做过的日志。",
    modul: (m: number) => `模块 ${m}`,
    group: (n: number, nama?: string) => `第 ${n} 组${nama ? ` · ${nama}` : ""}`,
    asistenL: (n: string) => `助教：${n}`,
    belumAda: "还没有",
    go: "去实验页",
    goDash: "去仪表盘",
    offline: "连不上服务器。",
    codes: {
      format_salah: "格式不对。检查一下你输入的内容。",
      terkunci: "失败次数太多。等几分钟再试。",
      tidak_cocok: "NIM 或密码不对。",
      perlu_kode: "课程正在进行。请同时输入前方屏幕上的课程代码。",
      kode_salah: "课程代码不对。再看一下前方屏幕。",
      tidak_ada_sesi: "现在还没有课。助教开始你那节课后就能登录。",
      tidak_terdaftar: "这个 NIM 不在正在进行的这节课名单里。问问你的助教。",
      mode_tot: "助教正在进行 TOT 练习，学员账号暂时不能使用。练习结束后再试。",
      terlalu_pendek: "密码至少要 8 个字符。",
      galat_server: "服务器出了点问题。稍后再试。",
    } as Record<string, string>,
    fallback: "登录失败，再试一次。",
  },
});

function destination(role: Role, lang: Lang, kelas: string | null): string {
  const next = new URLSearchParams(location.search).get("next");
  const path =
    next && next.startsWith("/") && !next.startsWith("//") && !isSignInPath(next.split("?")[0])
      ? next
      : role === "asisten"
        ? "/session"
        : "/dashboard";
  const pref = readLangPref();
  const want: Lang = pref ?? (kelas ? langForKelas(kelas as "reguler" | "internasional") : lang);
  return pathForLang(path, want);
}

export default function SignInPage({ lang = "id" }: { lang?: Lang }) {
  const t = T[lang];
  const [stage, setStage] = useState<Stage>("login");
  const [role, setRole] = useState<Role>("praktikan");
  const [nim, setNim] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<{
    field: "nim" | "pw" | "kode" | "form";
    msg: string;
  } | null>(null);
  // Shown once the server says a session runs (perlu_kode).
  const [perluKode, setPerluKode] = useState(false);
  const [kode, setKode] = useState("");
  const [kodePesan, setKodePesan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [setErrMsg, setSetErrMsg] = useState<{ field: 1 | 2 | 0; msg: string } | null>(null);
  const [welcome, setWelcome] = useState<{
    nama: string;
    kelompok?: number;
    kelompokNama?: string;
    sesi: SesiNow | null;
    asisten: { kode: string; nama: string } | null;
  } | null>(null);

  // Already signed in: nothing to do here, go on to where they were headed.
  // Unless the app sent them to sign in again (?ulang=1, lib/signin).
  useEffect(() => {
    if (new URLSearchParams(location.search).has("ulang")) return;
    getJson<{ ok: boolean; role?: string }>("/api/auth/me")
      .then((me) => {
        if (me.ok && (me.role === "asisten" || me.role === "praktikan"))
          location.replace(destination(me.role, lang, null));
      })
      .catch(() => {});
  }, [lang]);

  function finish(r: Role, kelas: string | null, path?: string) {
    meChanged();
    const to = path
      ? pathForLang(
          path,
          readLangPref() ?? (kelas ? langForKelas(kelas as "reguler" | "internasional") : lang),
        )
      : destination(r, lang, kelas);
    if (to === location.pathname + location.search) location.reload();
    else location.assign(to);
  }

  async function submitLogin(ev: FormEvent) {
    ev.preventDefault();
    if (loading) return;
    const n = nim.trim();
    if (!n) return setErr({ field: "nim", msg: t.needNim });
    if (role === "asisten" && !password) return setErr({ field: "pw", msg: t.needPw });
    if (role === "praktikan" && perluKode && !/^\d{4}$/.test(kode))
      return setErr({ field: "kode", msg: t.needKode });
    setErr(null);
    setLoading(true);
    try {
      const data = await postJson<{
        ok: boolean;
        kode?: string;
        nama?: string;
        kelompok?: number;
        kelompokNama?: string;
        perluAturSandi?: boolean;
      }>(role === "praktikan" ? "/api/auth/student" : "/api/auth/assistant", {
        nim: n,
        ...(role === "asisten" ? { password } : perluKode ? { kodeSesi: kode } : {}),
      });
      if (!data.ok) {
        const msg = t.codes[data.kode ?? ""] ?? t.fallback;
        if (data.kode === "perlu_kode" || data.kode === "kode_salah") {
          setPerluKode(true);
          // Being asked for the code isn't a mistake: say why under the
          // field, in the hint's colour. A wrong code is an error.
          if (data.kode === "perlu_kode") {
            setErr(null);
            setKodePesan(msg);
          } else setErr({ field: "kode", msg });
          setTimeout(() => document.getElementById("login-kode")?.focus(), 0);
          return;
        }
        setErr({ field: data.kode === "tidak_cocok" && role === "asisten" ? "pw" : "nim", msg });
        return;
      }
      if (role === "asisten") {
        if (data.perluAturSandi) {
          setStage("set-password");
          return;
        }
        finish("asisten", null);
        return;
      }
      const [now, hasil] = await Promise.all([
        getJson<{ ok: boolean; sesi: SesiNow | null }>("/api/session/now").catch(() => ({
          ok: false,
          sesi: null,
        })),
        getJson<{ ok: boolean; asisten?: { kode: string; nama: string } | null }>(
          "/api/session/results",
        ).catch(() => ({ ok: false, asisten: null })),
      ]);
      const mine = now.sesi && now.sesi.milikSaya !== false ? now.sesi : null;
      setWelcome({
        nama: data.nama ?? n,
        kelompok: data.kelompok,
        kelompokNama: data.kelompokNama,
        sesi: mine,
        asisten: mine ? (hasil.asisten ?? null) : null,
      });
      setStage("welcome");
    } catch {
      setErr({ field: "form", msg: t.offline });
    } finally {
      setLoading(false);
    }
  }

  async function submitSetPassword(ev: FormEvent) {
    ev.preventDefault();
    if (loading) return;
    if (pw1.length < 8) return setSetErrMsg({ field: 1, msg: t.min8 });
    if (pw1 !== pw2) return setSetErrMsg({ field: 2, msg: t.mismatch });
    setSetErrMsg(null);
    setLoading(true);
    try {
      const data = await postJson<{ ok: boolean; kode?: string }>("/api/auth/set-password", {
        password: pw1,
      });
      if (!data.ok) {
        setSetErrMsg({ field: 1, msg: t.codes[data.kode ?? ""] ?? t.fallback });
        return;
      }
      finish("asisten", null);
    } catch {
      setSetErrMsg({ field: 0, msg: t.offline });
    } finally {
      setLoading(false);
    }
  }

  const title =
    stage === "set-password"
      ? t.setTitle
      : stage === "welcome" && welcome
        ? t.welcome(welcome.nama)
        : t.title;

  return (
    <section className="panel panel--key panel--raised signin">
      {stage === "welcome" && welcome?.sesi && (
        <span className="pill pill--ok signin__badge">
          <span className="dot dot--ok" aria-hidden="true" />
          {t.inSession}
        </span>
      )}
      <h1 className="signin__title">{title}</h1>
      {stage === "login" && (
        <form onSubmit={submitLogin} className="login-form" noValidate>
          <SegmentedControl
            value={role}
            onValueChange={(next) => {
              setRole(next as Role);
              setErr(null);
            }}
            options={[
              { value: "praktikan", label: t.praktikan },
              { value: "asisten", label: t.asisten },
            ]}
            aria-label={t.role}
          />

          <div className="field" data-invalid={err?.field === "nim" ? "yes" : undefined}>
            <label className="field__label" htmlFor="login-nim">
              {t.nim}
            </label>
            <input
              id="login-nim"
              className="field__input login-form__nim"
              value={nim}
              onChange={(ev) => setNim(ev.target.value.replace(/\s/g, ""))}
              placeholder={role === "praktikan" ? t.nimPh : t.nimPhA}
              autoComplete="username"
              inputMode={role === "praktikan" ? "numeric" : "text"}
              autoFocus
              aria-invalid={err?.field === "nim" || undefined}
              aria-describedby="login-nim-msg"
            />
            <p
              id="login-nim-msg"
              className={err?.field === "nim" ? "field__error" : "field__hint"}
              role={err?.field === "nim" ? "alert" : undefined}
            >
              {err?.field === "nim" ? err.msg : ""}
            </p>
          </div>

          {role === "praktikan" && perluKode && (
            <div className="field" data-invalid={err?.field === "kode" ? "yes" : undefined}>
              <label className="field__label" htmlFor="login-kode">
                {t.kodeL}
              </label>
              <input
                id="login-kode"
                className="field__input login-form__nim"
                value={kode}
                onChange={(ev) => setKode(ev.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={4}
                aria-invalid={err?.field === "kode" || undefined}
                aria-describedby="login-kode-msg"
              />
              <p
                id="login-kode-msg"
                className={err?.field === "kode" ? "field__error" : "field__hint"}
                role={err?.field === "kode" ? "alert" : undefined}
              >
                {err?.field === "kode" ? err.msg : (kodePesan ?? t.kodeHint)}
              </p>
            </div>
          )}

          {role === "asisten" && (
            <PasswordField
              label={t.pwLabel}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              error={err?.field === "pw" ? err.msg : undefined}
              lang={lang}
            />
          )}

          {err?.field === "form" && (
            <p className="field__error" role="alert">
              {err.msg}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--lg login-form__submit"
            data-loading={loading ? "yes" : "no"}
            disabled={loading}
          >
            <span className="btn__label">{t.submit}</span>
            <span className="btn__spinner" aria-hidden="true" />
          </button>
        </form>
      )}

      {stage === "set-password" && (
        <form onSubmit={submitSetPassword} className="login-form" noValidate>
          <p className="login-form__lede">{t.setLede}</p>
          <PasswordField
            label={t.newPw}
            value={pw1}
            onChange={setPw1}
            autoComplete="new-password"
            meter
            hint={t.min8}
            error={setErrMsg?.field === 1 ? setErrMsg.msg : undefined}
            lang={lang}
            autoFocus
          />
          <PasswordField
            label={t.newPw2}
            value={pw2}
            onChange={setPw2}
            autoComplete="new-password"
            error={setErrMsg?.field === 2 ? setErrMsg.msg : undefined}
            lang={lang}
          />
          {setErrMsg?.field === 0 && (
            <p className="field__error" role="alert">
              {setErrMsg.msg}
            </p>
          )}
          <div className="login-form__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => finish("asisten", null)}
            >
              {t.later}
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              data-loading={loading ? "yes" : "no"}
              disabled={loading}
            >
              <span className="btn__label">{t.setBtn}</span>
              <span className="btn__spinner" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {stage === "welcome" && welcome && (
        <div className="login-welcome" aria-live="polite">
          {welcome.sesi ? (
            <div className="login-welcome__stats">
              <div className="stat">
                <b>{t.modul(welcome.sesi.modul)}</b>
                <span className="stat__label">{MODUL_NAMA[welcome.sesi.modul]}</span>
              </div>
              <div className="stat">
                <b
                  style={
                    welcome.kelompok ? { color: `var(--group-${welcome.kelompok})` } : undefined
                  }
                >
                  {welcome.kelompok
                    ? t.group(welcome.kelompok, KELOMPOK_NAMA[welcome.kelompok])
                    : "-"}
                </b>
                <span className="stat__label">
                  {t.asistenL(welcome.asisten ? namaAsisten(welcome.asisten) : t.belumAda)}
                </span>
              </div>
            </div>
          ) : (
            <div className="banner">
              <span>{t.noSession}</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={() =>
              welcome.sesi
                ? finish(
                    "praktikan",
                    welcome.sesi.kelas ?? null,
                    `/modules/${welcome.sesi.modul}?step=setup`,
                  )
                : finish("praktikan", null, "/dashboard")
            }
          >
            {welcome.sesi ? t.go : t.goDash}
            <ArrowRightIcon size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
