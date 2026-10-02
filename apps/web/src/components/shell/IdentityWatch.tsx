/**
 * Watches the signed-in identity on every page (Phase 8; the old
 * identity-watch.ts ran on the dashboard only). The session cookie is
 * shared by every tab, so a sign-in in another tab silently changes who
 * this tab acts as. When that happens, or the sign-in simply ends, this
 * says so in a dialog instead of letting the page keep acting as someone
 * else.
 *
 * It also catches the praktikan case the API reports as "sesi_berganti": a
 * student still signed in to an earlier session (the mini-bar's `now` says
 * `milikSaya: false`) is asked to sign in again so this session counts them.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowsCounterClockwiseIcon, SignInIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { dict, getJson, meChanged, type Me, type SesiNow } from "../../lib/app";
import { startPolling } from "../../scripts/polling";
import type { Lang } from "../../lib/kelas";

const T = dict({
  id: {
    swapH: "Akun di tab ini berganti",
    swap: (n: string) =>
      `${n} masuk di tab lain pada peramban ini, jadi tab ini sekarang memakai akun tersebut.`,
    goneH: "Kamu sudah keluar",
    gone: "Sesi masuk berakhir atau kamu keluar di tab lain. Masuk lagi untuk melanjutkan.",
    newH: "Sesi baru sudah dimulai",
    newB: "Kamu masih tercatat di sesi sebelumnya. Masuk lagi supaya jawaban dan kehadiranmu masuk ke sesi ini.",
    masuk: "Masuk lagi",
    muat: "Muat ulang halaman",
    nanti: "Nanti",
  },
  en: {
    swapH: "This tab switched accounts",
    swap: (n: string) =>
      `${n} signed in on another tab in this browser, so this tab now uses that account.`,
    goneH: "You are signed out",
    gone: "Your sign-in ended or you signed out on another tab. Sign in again to continue.",
    newH: "A new session has started",
    newB: "You are still signed in to the previous session. Sign in again so your answers and attendance count in this one.",
    masuk: "Sign in again",
    muat: "Reload the page",
    nanti: "Later",
  },
});

type Keadaan = { jenis: "swap"; nama: string } | { jenis: "gone" } | { jenis: "baru" } | null;

export default function IdentityWatch({
  lang,
  me,
  now,
}: {
  lang: Lang;
  me: Me | null | undefined;
  now: SesiNow | null;
}) {
  const t = T[lang];
  const [k, setK] = useState<Keadaan>(null);
  const dismissedBaru = useRef<string | null>(null);
  const nim = me?.nim ?? null;

  useEffect(() => {
    if (!nim) return;
    return startPolling(async () => {
      let d: { ok?: boolean; nim?: string; nama?: string };
      try {
        d = await getJson("/api/auth/me");
      } catch {
        return; // a failed check is not evidence of a swap
      }
      if (d.ok && d.nim === nim) return;
      setK(d.ok ? { jenis: "swap", nama: d.nama ?? d.nim ?? "" } : { jenis: "gone" });
    }, 20_000);
  }, [nim]);

  const sesiKey = now ? `${now.tanggal}-${now.slot ?? now.mulai}` : null;
  useEffect(() => {
    if (me?.role !== "praktikan" || now?.milikSaya !== false || !sesiKey) return;
    if (dismissedBaru.current === sesiKey) return;
    setK((prev) => prev ?? { jenis: "baru" });
  }, [me?.role, now?.milikSaya, sesiKey]);

  if (!k) return null;
  const close = () => {
    if (k.jenis === "baru") dismissedBaru.current = sesiKey;
    setK(null);
  };
  const title = k.jenis === "swap" ? t.swapH : k.jenis === "gone" ? t.goneH : t.newH;
  const body = k.jenis === "swap" ? t.swap(k.nama) : k.jenis === "gone" ? t.gone : t.newB;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title={title}
      lang={lang}
      actions={
        <>
          {k.jenis === "baru" && (
            <button type="button" className="btn btn--ghost" onClick={close}>
              {t.nanti}
            </button>
          )}
          {k.jenis === "swap" ? (
            <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
              <ArrowsCounterClockwiseIcon size={17} aria-hidden="true" />
              {t.muat}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                close();
                meChanged();
                window.LoginDialog?.open();
              }}
            >
              <SignInIcon size={17} aria-hidden="true" />
              {t.masuk}
            </button>
          )}
        </>
      }
    >
      <div className="row row--nowrap" style={{ alignItems: "flex-start", gap: "var(--space-3)" }}>
        <p style={{ margin: 0 }}>{body}</p>
      </div>
    </Dialog>
  );
}
