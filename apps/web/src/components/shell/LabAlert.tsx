/**
 * Alerts on every Asisten page (2026-10-05), from /api/session/waspada:
 *
 * - the Pi stops sending heartbeats while a session that needs it runs
 *   (every Asisten sees this one);
 * - a burst of server errors (AMBANG_GALAT in api/_lib/galat.ts), for
 *   those with the Server right, who can act on it;
 * - Panggil DEV (2026-10-10): a call from the lab, for the DEVs, with
 *   Saya Datang; and, for the caller, who is on the way.
 *
 * Checked every 30 s while a session runs, every 2 min otherwise. When the
 * tab is in the background and the browser allows it, a system
 * notification goes out too; the banner offers to turn those on.
 */
import { useEffect, useRef, useState } from "react";
import {
  CaretRightIcon,
  ChatCircleTextIcon,
  PersonSimpleRunIcon,
  PlugsIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { dict, getJson, href, postJson, type Me } from "../../lib/app";
import { laluLabel, modulLabel } from "../../lib/labels";
import { usePoll } from "../../lib/hooks";
import { useBatas } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";

interface Waspada {
  ok: boolean;
  galat: {
    jumlah: number;
    menit: number;
    ambang: number;
    terakhir: { id: number; pada: string; pesan: string } | null;
  };
  pi: {
    luring: boolean;
    umurDetik: number | null;
    luringPada?: string | null;
    serverId?: number | null;
  } | null;
  sesi: { id: number; modul: number } | null;
  panggilan?: {
    bisaJawab: boolean;
    untukku: Panggilan[];
    milikku: Panggilan | null;
  };
}

interface Panggilan {
  id: number;
  pada: string;
  oleh: { nim: string; nama: string; kode: string | null };
  catatan: string;
  sesi: { id: number; modul: number } | null;
  datang: { nama: string; kode: string | null; pada: string } | null;
}

const T = dict({
  id: {
    piH: "PC Server tidak mengirim detak",
    piP: (m: string) =>
      `Sesi sedang berjalan, tapi PC Server diam sejak ${m}. Cek daya dan Wi-Fi PC Server.`,
    piNever: "belum pernah",
    piGo: "Buka Server",
    errH: (n: number, m: number) => `${n} galat server dalam ${m} menit terakhir`,
    errGo: "Lihat Galat",
    notif: "Beri Tahu Saya",
    hide: "Sembunyikan",
    nPi: "IRIS: PC Server tidak mengirim detak",
    nErr: "IRIS: galat server bertambah",
    callH: (who: string, m: string) => `${who} memanggil DEV${m ? ` dari sesi ${m}` : ""}`,
    callMore: (n: number) => `dan ${n} panggilan lain`,
    callGo: "Saya Datang",
    callOpen: "Buka Konsol",
    callTaken: "Tercatat. Yang memanggil melihat kamu sedang menuju lab.",
    comingH: (who: string) => `${who} sedang menuju lab`,
    comingP: "Panggilan DEV-mu dijawab.",
    nCall: "IRIS: ada yang memanggil DEV",
    fail: "Tidak bisa sekarang. Coba lagi.",
  },
  en: {
    piH: "The PC Server stopped sending heartbeats",
    piP: (m: string) =>
      `A session is running, but the PC Server has been silent since ${m}. Check its power and Wi-Fi.`,
    piNever: "never",
    piGo: "Open Server",
    errH: (n: number, m: number) => `${n} server errors in the last ${m} minutes`,
    errGo: "See Errors",
    notif: "Notify Me",
    hide: "Hide",
    nPi: "IRIS: the PC Server stopped sending heartbeats",
    nErr: "IRIS: server errors are piling up",
    callH: (who: string, m: string) =>
      `${who} is calling the DEVs${m ? ` from a ${m} session` : ""}`,
    callMore: (n: number) => `and ${n} more ${n === 1 ? "call" : "calls"}`,
    callGo: "I'm Coming",
    callOpen: "Open the Console",
    callTaken: "Noted. The caller sees you're on the way.",
    comingH: (who: string) => `${who} is on the way to the lab`,
    comingP: "Your call to the DEVs was answered.",
    nCall: "IRIS: someone is calling the DEVs",
    fail: "Not possible right now. Try again.",
  },
  zh: {
    piH: "PC 服务器停止发送心跳",
    piP: (m: string) =>
      `正在上课，但 PC 服务器从${m}起就没有动静了。检查一下 PC 服务器的电源和 Wi-Fi。`,
    piNever: "从未",
    piGo: "打开服务器",
    errH: (n: number, m: number) => `最近 ${m} 分钟内有 ${n} 个服务器错误`,
    errGo: "查看错误",
    notif: "通知我",
    hide: "隐藏",
    nPi: "IRIS：PC 服务器停止发送心跳",
    nErr: "IRIS：服务器错误在增加",
    callH: (who: string, m: string) => `${who}${m ? `从${m}的课上` : ""}呼叫 DEV`,
    callMore: (n: number) => `还有 ${n} 个呼叫`,
    callGo: "我马上来",
    callOpen: "打开控制台",
    callTaken: "已记录。呼叫的人会看到你正在赶来。",
    comingH: (who: string) => `${who} 正在赶往实验室`,
    comingP: "你的 DEV 呼叫有人回应了。",
    nCall: "IRIS：有人呼叫 DEV",
    fail: "现在不行。再试一次。",
  },
});

const KUNCI_SEMBUNYI = "iris-galat-disembunyikan";

function bacaSembunyi(): number {
  try {
    return Number(localStorage.getItem(KUNCI_SEMBUNYI) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function beriTahu(judul: string, isi: string, tag: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    new Notification(judul, { body: isi, tag, icon: "/favicon.svg" });
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

export default function LabAlert({
  lang,
  me,
  sesiBerjalan,
}: {
  lang: Lang;
  me: Me;
  sesiBerjalan: boolean;
}) {
  const t = T[lang];
  const bisaServer = me.hak?.server === true;
  const poll = usePoll(
    () => getJson<Waspada>("/api/session/waspada"),
    sesiBerjalan ? 60_000 : 120_000,
    true,
    ["sesi", "server"],
  );
  const w = poll.data;
  // A Pi that stops beating writes nothing: the banner comes up on time.
  useBatas(w?.ok && w.pi && !w.pi.luring ? w.pi.luringPada : null, ["server"]);
  const [tutupDatang, setTutupDatang] = useState(0);
  const [sembunyi, setSembunyi] = useState(0);
  const [izin, setIzin] = useState<NotificationPermission | "none">("none");
  useEffect(() => {
    setSembunyi(bacaSembunyi());
    setIzin(typeof Notification === "undefined" ? "none" : Notification.permission);
  }, []);

  // The Server pages show the Pi's state themselves; the banner would repeat it.
  const diServer = typeof location !== "undefined" && /\/servers\/?$/.test(location.pathname);
  const piLuring = !!w?.ok && !!w.pi?.luring && !diServer;
  const g = w?.ok ? w.galat : null;
  const lonjakan =
    bisaServer && !!g && g.jumlah >= g.ambang && !!g.terakhir && g.terakhir.id > sembunyi;

  // A system notification once per new problem, while the tab is hidden.
  const sudah = useRef({ pi: false, galat: 0 });
  useEffect(() => {
    if (piLuring && !sudah.current.pi) beriTahu(t.nPi, t.piH, "iris-pi");
    sudah.current.pi = piLuring;
  }, [piLuring]);
  useEffect(() => {
    if (lonjakan && g?.terakhir && g.terakhir.id > sudah.current.galat) {
      beriTahu(t.nErr, g.terakhir.pesan, "iris-galat");
      sudah.current.galat = g.terakhir.id;
    }
  }, [lonjakan, g?.terakhir?.id]);

  const panggil = w?.ok ? (w.panggilan?.untukku ?? []) : [];
  const call = panggil[0] ?? null;
  const mine = w?.ok ? (w.panggilan?.milikku ?? null) : null;
  const datang = mine?.datang && mine.id !== tutupDatang ? mine : null;
  const sudahCall = useRef(0);
  useEffect(() => {
    if (call && call.id > sudahCall.current) {
      beriTahu(
        t.nCall,
        `${call.oleh.nama}${call.catatan ? `: ${call.catatan}` : ""}`,
        "iris-panggil",
      );
      sudahCall.current = call.id;
    }
  }, [call?.id]);

  async function jawab(id: number) {
    const r = await postJson<{ ok: boolean }>("/api/session/panggil", { aksi: "datang", id }).catch(
      () => ({ ok: false }),
    );
    window.Toast?.show(r.ok ? t.callTaken : t.fail, r.ok ? "ok" : "danger");
    poll.refresh();
  }

  if (!piLuring && !lonjakan && !call && !datang) return null;

  const tombolIzin =
    izin === "default" ? (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() =>
          void Notification.requestPermission()
            .then(setIzin)
            .catch(() => {})
        }
      >
        {t.notif}
      </button>
    ) : null;

  const umur = w?.pi?.umurDetik;
  const siapa = (o: { nama: string; kode: string | null }) =>
    o.kode ? `${o.nama} (${o.kode})` : o.nama;
  return (
    <>
      {call && (
        <div className="offline banner banner--warn" role="alert">
          <ChatCircleTextIcon size={20} aria-hidden="true" />
          <b>{t.callH(siapa(call.oleh), call.sesi ? modulLabel(call.sesi.modul, lang) : "")}</b>
          <span className="hint truncate">
            {call.catatan}
            {panggil.length > 1
              ? `${call.catatan ? " · " : ""}${t.callMore(panggil.length - 1)}`
              : ""}
          </span>
          {tombolIzin}
          <a className="btn btn--ghost btn--sm" href={href(lang, "/session")}>
            {t.callOpen}
            <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
          </a>
          <button type="button" className="btn btn--sm" onClick={() => void jawab(call.id)}>
            {t.callGo}
          </button>
        </div>
      )}
      {datang?.datang && (
        <div className="offline banner banner--ok" role="status">
          <PersonSimpleRunIcon size={20} aria-hidden="true" />
          <b>{t.comingH(siapa(datang.datang))}</b>
          <span className="hint">{t.comingP}</span>
          <button
            type="button"
            className="iconbtn"
            aria-label={t.hide}
            onClick={() => setTutupDatang(datang.id)}
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {piLuring && (
        <div className="offline banner banner--danger" role="alert">
          <PlugsIcon size={20} aria-hidden="true" />
          <b>{t.piH}</b>
          <span className="hint">{t.piP(umur == null ? t.piNever : laluLabel(umur, lang))}</span>
          {!call && tombolIzin}
          <a
            className="btn btn--ghost btn--sm"
            href={
              w?.pi?.serverId
                ? `${href(lang, "/servers")}?id=${w.pi.serverId}#siap`
                : href(lang, "/servers")
            }
          >
            {t.piGo}
            <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
          </a>
        </div>
      )}
      {lonjakan && g && (
        <div className="offline banner banner--warn" role="status">
          <WarningIcon size={20} aria-hidden="true" />
          <b>{t.errH(g.jumlah, g.menit)}</b>
          <span className="hint truncate">{g.terakhir?.pesan}</span>
          {!piLuring && !call && tombolIzin}
          {me.hak?.audit === true && (
            <a
              className="btn btn--ghost btn--sm"
              href={`${href(lang, "/reports")}?audit=galat#audit`}
            >
              {t.errGo}
              <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            className="iconbtn"
            aria-label={t.hide}
            onClick={() => {
              const id = g.terakhir?.id ?? 0;
              setSembunyi(id);
              try {
                localStorage.setItem(KUNCI_SEMBUNYI, String(id));
              } catch {
                /* hidden for this page only */
              }
            }}
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
