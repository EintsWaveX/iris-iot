/**
 * Login, as one dialog over any page (P7.3, rebuilt in Phase 8).
 *
 * - One dialog, two roles: a praktikan types only the NIM (shown in big
 *   monospace digits), an assistant adds a password.
 * - Validation is the dialog's own (no browser "please fill in this field"
 *   bubbles): the form is noValidate and errors sit under their field.
 * - A student's successful check-in shows the module, their group and its
 *   assistant (Phase 9 mockup p-login: never a slot or a time), then one
 *   button into the practicum, or to the dashboard when no session runs.
 * - An assistant still on the starting password gets the set-password
 *   stage, now with show/hide and a strength meter; "Later" keeps working
 *   and the Asisten home keeps a reminder until it is done.
 * - Where to go next: `?next=` if present; otherwise the page the dialog was
 *   opened on, unless that was the landing page, in which case the role's
 *   home (Dasbor or Konsol). A student in the International class with no
 *   language choice of their own lands on the English pages.
 *
 * Opened from anywhere with window.LoginDialog.open() (the nav, the landing
 * hero, a module page's "sign in to save" note).
 */
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { navigate } from "astro:transitions/client";
import Dialog from "./ui/Dialog";
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
import "./LoginDialog.css";

type Role = "praktikan" | "asisten";
type Stage = "login" | "set-password" | "welcome";

const T = dict({
  id: {
    title: "Masuk",
    setTitle: "Setel kata sandi asli",
    lede: "Praktikan cukup NIM. Asisten memakai NIM dan kata sandi.",
    role: "Peran",
    praktikan: "Praktikan",
    asisten: "Asisten",
    nim: "NIM",
    nimHint: "4 sampai 20 huruf dan angka, seperti di kartu mahasiswa.",
    nimPh: "2311102001",
    nimPhA: "NIM asisten",
    pwLabel: "Kata sandi",
    submit: "Masuk",
    needNim: "Isi NIM dulu.",
    needPw: "Isi kata sandi dulu.",
    setLede:
      "Kata sandi awal akun ini mudah ditebak. Setel kata sandi asli sekali di sini, dan kata sandi awal berhenti berlaku.",
    newPw: "Kata sandi baru",
    newPw2: "Ulangi kata sandi baru",
    min8: "Minimal 8 karakter.",
    mismatch: "Kedua kata sandi belum sama.",
    later: "Nanti saja",
    setBtn: "Setel kata sandi",
    welcome: (nama: string) => `Halo, ${nama.split(" ")[0]}`,
    inSession: "Kamu masuk ke sesi",
    noSession:
      "Belum ada sesi berjalan. Kamu tetap bisa melihat nilai dan jurnal yang sudah kamu kerjakan.",
    modul: (m: number) => `Modul ${m}`,
    group: (n: number, nama?: string) => `Kelompok ${n}${nama ? ` · ${nama}` : ""}`,
    asistenL: "Asisten",
    belumAda: "belum ada",
    go: "Masuk ke Praktikum",
    goDash: "Ke Dasbor",
    offline: "Tidak dapat menghubungi server.",
    codes: {
      format_salah: "Formatnya belum benar. Periksa kembali isiannya.",
      terkunci: "Terlalu banyak percobaan gagal. Tunggu beberapa menit lalu coba lagi.",
      tidak_cocok: "NIM atau kata sandi tidak cocok.",
      tidak_ada_sesi:
        "Belum ada sesi yang berjalan. Masuk bisa dilakukan begitu asisten memulai sesi di jam praktikummu.",
      tidak_terdaftar: "NIM ini tidak ada di roster sesi yang berjalan. Tanyakan ke asistenmu.",
      terlalu_pendek: "Kata sandi minimal 8 karakter.",
      galat_server: "Server sedang bermasalah. Coba lagi sesaat lagi.",
    } as Record<string, string>,
    fallback: "Masuk gagal. Coba lagi.",
  },
  en: {
    title: "Sign in",
    setTitle: "Set your own password",
    lede: "Students need only their NIM. Assistants add a password.",
    role: "Role",
    praktikan: "Student",
    asisten: "Assistant",
    nim: "NIM",
    nimHint: "4 to 20 letters and digits, as on your student card.",
    nimPh: "2311102001",
    nimPhA: "Assistant NIM",
    pwLabel: "Password",
    submit: "Sign in",
    needNim: "Enter your NIM first.",
    needPw: "Enter your password first.",
    setLede:
      "This account's starting password is easy to guess. Set your own once here and the starting one stops working.",
    newPw: "New password",
    newPw2: "Repeat the new password",
    min8: "At least 8 characters.",
    mismatch: "The two passwords do not match yet.",
    later: "Later",
    setBtn: "Set password",
    welcome: (nama: string) => `Hi, ${nama.split(" ")[0]}`,
    inSession: "You are in the session",
    noSession:
      "No session is running. You can still see your scores and the journals you have done.",
    modul: (m: number) => `Module ${m}`,
    group: (n: number, nama?: string) => `Group ${n}${nama ? ` · ${nama}` : ""}`,
    asistenL: "Assistant",
    belumAda: "not yet",
    go: "Go to the Practicum",
    goDash: "To the Dashboard",
    offline: "Could not reach the server.",
    codes: {
      format_salah: "That format is not right. Check what you typed.",
      terkunci: "Too many failed attempts. Wait a few minutes and try again.",
      tidak_cocok: "The NIM or password does not match.",
      tidak_ada_sesi:
        "No session is running yet. You can sign in once an assistant starts the session for your slot.",
      tidak_terdaftar: "This NIM isn't on the running session's roster. Ask your assistant.",
      terlalu_pendek: "The password needs at least 8 characters.",
      galat_server: "The server is having trouble. Try again in a moment.",
    } as Record<string, string>,
    fallback: "Sign-in failed. Try again.",
  },
  zh: {
    title: "登录",
    setTitle: "设置你自己的密码",
    lede: "学员只需要 NIM。助教还要输入密码。",
    role: "角色",
    praktikan: "学员",
    asisten: "助教",
    nim: "NIM",
    nimHint: "4 到 20 个字母和数字，和学生证上一样。",
    nimPh: "2311102001",
    nimPhA: "助教 NIM",
    pwLabel: "密码",
    submit: "登录",
    needNim: "先填 NIM。",
    needPw: "先填密码。",
    setLede: "这个账号的初始密码很容易猜到。在这里设置一次你自己的密码，初始密码就会失效。",
    newPw: "新密码",
    newPw2: "再输一次新密码",
    min8: "至少 8 个字符。",
    mismatch: "两次密码还不一样。",
    later: "以后再说",
    setBtn: "设置密码",
    welcome: (nama: string) => `你好，${nama.split(" ")[0]}`,
    inSession: "你正在上课",
    noSession: "现在没有课。你仍然可以看你的分数和做过的日志。",
    modul: (m: number) => `模块 ${m}`,
    group: (n: number, nama?: string) => `第 ${n} 组${nama ? ` · ${nama}` : ""}`,
    asistenL: "助教",
    belumAda: "还没有",
    go: "去实验页",
    goDash: "去仪表盘",
    offline: "连不上服务器。",
    codes: {
      format_salah: "格式不对。检查一下你输入的内容。",
      terkunci: "失败次数太多。等几分钟再试。",
      tidak_cocok: "NIM 或密码不对。",
      tidak_ada_sesi: "现在还没有课。助教开始你那节课后就能登录。",
      tidak_terdaftar: "这个 NIM 不在正在进行的这节课名单里。问问你的助教。",
      terlalu_pendek: "密码至少要 8 个字符。",
      galat_server: "服务器出了点问题。稍后再试。",
    } as Record<string, string>,
    fallback: "登录失败，再试一次。",
  },
});

function useIsMobile(breakpointPx = 639): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpointPx]);
  return isMobile;
}

function destination(role: Role, lang: Lang, kelas: string | null): string {
  const next = new URLSearchParams(location.search).get("next");
  let path: string;
  if (next && next.startsWith("/") && !next.startsWith("//")) path = next;
  else {
    const here = location.pathname;
    const onLanding = here === "/" || here === "/en" || here === "/en/";
    path = onLanding ? (role === "asisten" ? "/session" : "/dashboard") : here;
  }
  const pref = readLangPref();
  const want: Lang = pref ?? (kelas ? langForKelas(kelas as "reguler" | "internasional") : lang);
  return pathForLang(path, want);
}

export default function LoginDialog({ lang = "id" }: { lang?: Lang }) {
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("login");
  const [role, setRole] = useState<Role>("praktikan");
  const [nim, setNim] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<{ field: "nim" | "pw" | "form"; msg: string } | null>(null);
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
  const sheet = useIsMobile();

  useEffect(() => {
    window.LoginDialog = {
      open: () => {
        setStage("login");
        setErr(null);
        setOpen(true);
      },
      close: () => setOpen(false),
    };
    const params = new URLSearchParams(location.search);
    if (params.get("login") === "1") {
      // Drop the flag at once, so a reload or the language redirect after
      // signing in can't reopen the dialog. "next" stays for destination().
      params.delete("login");
      const q = params.toString();
      history.replaceState(
        history.state,
        "",
        location.pathname + (q ? `?${q}` : "") + location.hash,
      );
      getJson<{ ok: boolean }>("/api/auth/me")
        .then((me) => {
          if (!me.ok) setOpen(true);
        })
        .catch(() => setOpen(true));
    }
  }, []);

  function finish(r: Role, kelas: string | null, path?: string) {
    setOpen(false);
    meChanged();
    const to = path
      ? pathForLang(
          path,
          readLangPref() ?? (kelas ? langForKelas(kelas as "reguler" | "internasional") : lang),
        )
      : destination(r, lang, kelas);
    if (to === location.pathname + location.search) location.reload();
    else navigate(to);
  }

  async function submitLogin(ev: FormEvent) {
    ev.preventDefault();
    if (loading) return;
    const n = nim.trim();
    if (!n) return setErr({ field: "nim", msg: t.needNim });
    if (role === "asisten" && !password) return setErr({ field: "pw", msg: t.needPw });
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
        ...(role === "asisten" ? { password } : {}),
      });
      if (!data.ok) {
        const msg = t.codes[data.kode ?? ""] ?? t.fallback;
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
    <Dialog open={open} onOpenChange={setOpen} title={title} sheet={sheet} size="lg" lang={lang}>
      {stage === "login" && (
        <form onSubmit={submitLogin} className="login-form" noValidate>
          <p className="login-form__lede">{t.lede}</p>
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
              {err?.field === "nim" ? err.msg : role === "praktikan" ? t.nimHint : ""}
            </p>
          </div>

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
          {welcome.sesi && (
            <span className="pill pill--ok login-welcome__badge">
              <span className="dot dot--ok" aria-hidden="true" />
              {t.inSession}
            </span>
          )}
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
                  {t.asistenL}: {welcome.asisten ? namaAsisten(welcome.asisten) : t.belumAda}
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
    </Dialog>
  );
}
