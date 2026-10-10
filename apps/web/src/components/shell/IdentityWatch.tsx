/**
 * Watches the signed-in identity on every page (Phase 8; the old
 * identity-watch.ts ran on the dashboard only). The session cookie is
 * shared by every tab, so a sign-in in another tab silently changes who
 * this tab acts as. When that happens, or the sign-in simply ends, this
 * says so in a dialog instead of letting the page keep acting as someone
 * else.
 *
 * It also catches the praktikan case the API reports as "sesi_berganti": a
 * student whose own session runs but who isn't signed in to it (an earlier
 * session's sign-in, or one from before it started: `milikSaya: false`,
 * `bisaIkut: true`) is asked to join it. Not someone who chose to look
 * around, and not a student of another slot (2026-10-07).
 */
import { useEffect, useRef, useState } from "react";
import { ArrowsCounterClockwiseIcon, SignInIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { dengarAkunLain, dict, getJson, meChanged, type Me, type SesiNow } from "../../lib/app";
import { dengar } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";
import { isSignInPath, openSignIn } from "../../lib/signin";

const T = dict({
  id: {
    swapH: "Akun di tab ini berganti",
    swap: (n: string) =>
      `${n} masuk di tab lain pada peramban ini, jadi tab ini sekarang memakai akun tersebut.`,
    goneH: "Kamu sudah keluar",
    gone: "Sesi masuk berakhir atau kamu keluar di tab lain. Masuk lagi untuk melanjutkan.",
    newH: "Sesimu Sudah Dimulai",
    newB: "Sesi praktikummu sedang berjalan, tapi kamu belum masuk ke sesi ini. Masuk dengan kode sesi supaya jawaban dan kehadiranmu tercatat.",
    ikut: "Ikut Praktikum",
    masuk: "Masuk lagi",
    muat: "Muat ulang halaman",
    nanti: "Nanti",
    pindahH: (n: number) => `Kamu dipindah sementara ke Kelompok ${n}`,
    pindah: (n: number) =>
      `Asisten memindahkanmu ke Kelompok ${n} untuk sesi ini saja; kelompok aslimu tidak berubah. Masuk lagi supaya jawaban dan kehadiranmu hari ini tercatat di Kelompok ${n}.`,
    totH: "Sedang ada latihan TOT",
    tot: "Asisten sedang latihan TOT, jadi akun Praktikan tidak bisa dipakai dulu. Kamu sudah dikeluarkan; masuk lagi setelah latihannya selesai.",
  },
  en: {
    swapH: "This tab switched accounts",
    swap: (n: string) =>
      `${n} signed in on another tab in this browser, so this tab now uses that account.`,
    goneH: "You are signed out",
    gone: "Your sign-in ended or you signed out on another tab. Sign in again to continue.",
    newH: "Your Session Has Started",
    newB: "Your practicum session is running, but you aren't signed in to it yet. Sign in with the session code so your answers and attendance count.",
    ikut: "Join the Practicum",
    masuk: "Sign in again",
    muat: "Reload the page",
    nanti: "Later",
    pindahH: (n: number) => `You were moved to Group ${n} for now`,
    pindah: (n: number) =>
      `An Asisten moved you to Group ${n} for this session only; your own group doesn't change. Sign in again so today's answers and attendance count in Group ${n}.`,
    totH: "A TOT practice run is on",
    tot: "The Asisten are in a TOT practice run, so Praktikan accounts can't be used for now. You've been signed out; sign in again once it's over.",
  },
  zh: {
    swapH: "这个标签页换了账号",
    swap: (n: string) =>
      `${n} 在这个浏览器的另一个标签页登录了，所以这个标签页现在用的是那个账号。`,
    goneH: "你已经退出登录",
    gone: "你的登录已结束，或者你在另一个标签页退出了。重新登录才能继续。",
    newH: "你的课已经开始了",
    newB: "你的实验课正在进行，但你还没有登录这节课。用签到码登录，你的答案和出勤才会记上。",
    ikut: "参加实验",
    masuk: "重新登录",
    muat: "重新加载页面",
    nanti: "以后再说",
    pindahH: (n: number) => `你被临时调到了第 ${n} 组`,
    pindah: (n: number) =>
      `助教只在本节课把你调到第 ${n} 组，你原来的组不变。重新登录，今天的答案和出勤才会记在第 ${n} 组。`,
    totH: "正在进行 TOT 练习",
    tot: "助教正在进行 TOT 练习，学生账号暂时不能使用。你已被登出，练习结束后再登录。",
  },
});

type Keadaan =
  | { jenis: "swap"; nama: string }
  | { jenis: "gone" }
  | { jenis: "baru" }
  | { jenis: "tot" }
  | { jenis: "pindah"; ke: number }
  | null;

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
    const cek = async () => {
      let d: { ok?: boolean; nim?: string; nama?: string; kode?: string };
      try {
        d = await getJson("/api/auth/me");
      } catch {
        return; // a failed check is not evidence of a swap
      }
      if (d.ok && d.nim === nim) return;
      // Mode TOT signed this Praktikan out (api/auth/me): say why.
      setK(
        d.ok
          ? { jenis: "swap", nama: d.nama ?? d.nim ?? "" }
          : d.kode === "mode_tot"
            ? { jenis: "tot" }
            : { jenis: "gone" },
      );
    };
    void cek();
    // A sign-in or sign-out in another tab: check now. Mode TOT signing
    // Praktikan out: check now. A cookie that simply ran out shows on the
    // 60 s safety net or the next return to the tab (lib/siaran.ts).
    const lepas = dengarAkunLain(() => void cek());
    const lepasTot = dengar(["tot"], () => void cek());
    return () => {
      lepas();
      lepasTot();
    };
  }, [nim]);

  // Moved to another group mid-session (2026-10-07: they only found out
  // from a "new session" note on the Code step, if they were on it).
  const ke = me?.role === "praktikan" ? (now?.dipindahKe ?? null) : null;
  useEffect(() => {
    if (ke) setK((prev) => (prev && prev.jenis !== "baru" ? prev : { jenis: "pindah", ke }));
  }, [ke]);

  const sesiKey = now ? `${now.tanggal}-${now.slot ?? now.mulai}` : null;
  useEffect(() => {
    if (me?.role !== "praktikan" || now?.milikSaya !== false || !sesiKey) return;
    if (now.bisaIkut === false || now.lihatSaja) return;
    if (dismissedBaru.current === sesiKey) return;
    setK((prev) => prev ?? { jenis: "baru" });
  }, [me?.role, now?.milikSaya, now?.bisaIkut, now?.lihatSaja, sesiKey]);

  // The sign-in page is where these dialogs send people; never cover its form.
  if (!k || isSignInPath()) return null;
  const close = () => {
    if (k.jenis === "baru") dismissedBaru.current = sesiKey;
    setK(null);
  };
  const title =
    k.jenis === "swap"
      ? t.swapH
      : k.jenis === "gone"
        ? t.goneH
        : k.jenis === "tot"
          ? t.totH
          : k.jenis === "pindah"
            ? t.pindahH(k.ke)
            : t.newH;
  const body =
    k.jenis === "swap"
      ? t.swap(k.nama)
      : k.jenis === "gone"
        ? t.gone
        : k.jenis === "tot"
          ? t.tot
          : k.jenis === "pindah"
            ? t.pindah(k.ke)
            : t.newB;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      // Signed out or another account: nothing to go back to on this page.
      required={k.jenis !== "baru"}
      title={title}
      lang={lang}
      actions={
        <>
          {k.jenis === "baru" && (
            <button type="button" className="btn btn--ghost" onClick={close}>
              {t.nanti}
            </button>
          )}
          {k.jenis === "swap" || k.jenis === "tot" ? (
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
                openSignIn(undefined, { ikut: k.jenis === "baru" || k.jenis === "pindah" });
              }}
            >
              <SignInIcon size={17} aria-hidden="true" />
              {k.jenis === "baru" ? t.ikut : t.masuk}
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
