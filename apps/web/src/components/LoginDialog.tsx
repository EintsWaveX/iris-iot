/**
 * Login, as a Radix dialog over any page (P7.3 rewrite). Replaces
 * LoginModal.astro's Modal.astro + Tabs pair: the role switch is now a
 * SegmentedControl, and the assistant's "set a real password" follow-up is
 * a second stage of the SAME dialog (swapping title/content) rather than a
 * second Modal.astro instance closed-then-reopened, which used to flicker.
 *
 * Mounted once, globally, in Base.astro -- Nav's Masuk button, the mobile
 * Akun sheet's Masuk button, and the landing page's hero button all need
 * it, and Nav's Masuk button is on every page since P7.3 centralized it
 * there. A single React-state-driven dialog can't be opened by a plain
 * `data-modal-open` attribute the way Modal.astro's panels are (there is no
 * DOM node to address before it's open), so this exposes window.LoginDialog
 * = {open, close} instead -- every trigger site calls that directly.
 *
 * Errors surface inside the panel next to the field that caused them,
 * carried over from the original.
 */
import { useEffect, useState, type FormEvent } from "react";
import { navigate } from "astro:transitions/client";
import Dialog from "./ui/Dialog";
import SegmentedControl from "./ui/SegmentedControl";
import "./LoginDialog.css";

type Role = "praktikan" | "asisten";
type Stage = "login" | "set-password";

type LoginFailure = { ok: false; kode: string };
type LoginSuccess = { ok: true; role?: string; perluAturSandi?: boolean };

const KODE_PESAN: Record<string, string> = {
  format_salah: "Formatnya belum benar. Periksa kembali isiannya.",
  terkunci: "Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.",
  tidak_cocok: "NIM atau kata sandi tidak cocok.",
  tidak_ada_sesi: "Belum ada sesi yang berjalan. Tunggu asisten membukanya.",
  tidak_terdaftar: "NIM ini tidak terdaftar di sesi yang sedang berjalan.",
  terlalu_pendek: "Kata sandi minimal 8 karakter.",
  galat_server: "Server sedang bermasalah. Coba lagi sesaat lagi.",
};

function pesanUntuk(kode: string): string {
  return KODE_PESAN[kode] ?? "Masuk gagal. Coba lagi.";
}

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

export default function LoginDialog() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("login");
  const [role, setRole] = useState<Role>("praktikan");

  const [nim, setNim] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [newPasswordAgain, setNewPasswordAgain] = useState("");
  const [setPasswordError, setSetPasswordError] = useState("");
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);

  const sheet = useIsMobile();

  useEffect(() => {
    window.LoginDialog = {
      open: () => {
        setStage("login");
        setOpen(true);
      },
      close: () => setOpen(false),
    };
  }, []);

  async function submitLogin(ev: FormEvent) {
    ev.preventDefault();
    if (loginLoading) return;
    setLoginError("");
    setLoginLoading(true);
    try {
      const url = role === "praktikan" ? "/api/auth/student" : "/api/auth/assistant";
      const body = role === "praktikan" ? { nim } : { nim, password };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as LoginSuccess | LoginFailure;
      if (!data.ok) {
        setLoginError(pesanUntuk(data.kode));
        return;
      }
      if (role === "asisten" && data.perluAturSandi) {
        setStage("set-password");
        return;
      }
      setOpen(false);
      navigate(role === "asisten" ? "/session" : "/dashboard");
    } catch {
      setLoginError("Tidak dapat menghubungi server.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function submitSetPassword(ev: FormEvent) {
    ev.preventDefault();
    if (setPasswordLoading) return;
    setSetPasswordError("");

    if (newPassword !== newPasswordAgain) {
      setSetPasswordError("Kedua kata sandi belum sama.");
      return;
    }

    setSetPasswordLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = (await res.json()) as { ok: true } | LoginFailure;
      if (!data.ok) {
        setSetPasswordError(pesanUntuk(data.kode));
        return;
      }
      setOpen(false);
      navigate("/session");
    } catch {
      setSetPasswordError("Tidak dapat menghubungi server.");
    } finally {
      setSetPasswordLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={stage === "login" ? "Masuk" : "Setel kata sandi asli"}
      sheet={sheet}
    >
      {stage === "login" ? (
        <>
          <p className="lede">
            Praktikan memakai NIM saja &middot; asisten memakai NIM dan kata sandi
          </p>

          <SegmentedControl
            value={role}
            onValueChange={(next) => {
              setRole(next as Role);
              setLoginError("");
            }}
            options={[
              { value: "praktikan", label: "Praktikan" },
              { value: "asisten", label: "Asisten" },
            ]}
            aria-label="Peran"
          />

          <form onSubmit={submitLogin} className="login-form">
            <div className="field">
              <label className="field__label" htmlFor="login-nim">
                NIM
              </label>
              <input
                id="login-nim"
                className="field__input mono"
                value={nim}
                onChange={(ev) => setNim(ev.target.value)}
                placeholder={role === "praktikan" ? "2311102001" : "NIM asisten"}
                required
                autoComplete="username"
              />
              {role === "praktikan" && (
                <p className="field__hint">4 sampai 20 karakter, huruf dan angka.</p>
              )}
            </div>

            {role === "asisten" && (
              <div className="field">
                <label className="field__label" htmlFor="login-password">
                  Kata sandi
                </label>
                <input
                  id="login-password"
                  type="password"
                  className="field__input mono"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            )}

            {loginError && <p className="field__error">{loginError}</p>}

            <button
              type="submit"
              className="btn btn--primary"
              data-loading={loginLoading ? "yes" : "no"}
              disabled={loginLoading}
            >
              Masuk
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="lede">
            Kata sandi awal akun ini mudah ditebak. Setel kata sandi asli sekali di sini, dan kata
            sandi awal berhenti berfungsi untuk akun ini.
          </p>

          <form onSubmit={submitSetPassword} className="login-form">
            <div className="field">
              <label className="field__label" htmlFor="set-password-baru">
                Kata sandi baru
              </label>
              <input
                id="set-password-baru"
                type="password"
                className="field__input"
                value={newPassword}
                onChange={(ev) => setNewPassword(ev.target.value)}
                required
                autoComplete="new-password"
              />
              <p className="field__hint">Minimal 8 karakter.</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="set-password-ulang">
                Ulangi kata sandi baru
              </label>
              <input
                id="set-password-ulang"
                type="password"
                className="field__input"
                value={newPasswordAgain}
                onChange={(ev) => setNewPasswordAgain(ev.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            {setPasswordError && <p className="field__error">{setPasswordError}</p>}

            <div className="login-form__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setOpen(false);
                  navigate("/session");
                }}
              >
                Lewati untuk sekarang
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                data-loading={setPasswordLoading ? "yes" : "no"}
                disabled={setPasswordLoading}
              >
                Setel kata sandi
              </button>
            </div>
          </form>
        </>
      )}
    </Dialog>
  );
}
