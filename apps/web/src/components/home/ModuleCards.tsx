/**
 * The Modules page (Phase 9 Stage 7, mockup m-list): the page head and the
 * four module cards, all the same height.
 * - A Praktikan whose session is running gets no four-way choice: one card
 *   that continues straight to this session's module.
 * - Everyone else chooses freely. A signed-in viewer sees the running
 *   module; a Praktikan sees Done on modules they have attended.
 * - An Asisten sees Open or Locked on each card with the access switch
 *   inline (the same action as the Console's, with Undo).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRightIcon,
  BluetoothIcon,
  BroadcastIcon,
  ChatsCircleIcon,
  PlugsConnectedIcon,
} from "@phosphor-icons/react";
import { Switch } from "../ui/Controls";
import Pill from "../ui/Pill";
import { dict, getJson, href, MODUL_NAMA, useMe, useSessionNow } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { useTampil } from "../../lib/proyektor";
import { getAksesState } from "../../scripts/modul-akses";
import { setModulAkses } from "../shell/AsistenCommands";
import { modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import "./ModuleCards.css";
import { ModConstellation } from "../shared/Instruments";
import { ModulHero, SessionPath } from "./ModulHero";
import { H } from "./homeStrings";
import { dengar } from "../../lib/siaran";

export interface ModulKartu {
  modul: number;
  judul: string;
  tagline: string;
  fakta: string[];
  berkas: { slug: string; blanks: number }[];
}

const T = dict({
  id: {
    eyebrow: "Modul",
    title: "Empat Modul Praktikum",
    today: "Modulmu Hari Ini",
    ledeA:
      "Atur akses langsung dari kartu. Modul yang terkunci juga tidak bisa dipilih saat memulai sesi.",
    lede: "Setiap modul bisa dibaca siapa saja. Jurnal praktikum terbuka setelah kamu mengikuti sesinya.",
    running: "Sesimu sedang berjalan",
    todayLede:
      "Selama sesimu berjalan, Modul langsung membawamu ke modul sesi ini. Modul lain bisa kamu buka lagi setelah sesi selesai.",
    cont: "Lanjutkan ke Praktikum",
    run: "Sedang Berjalan",
    open: "Terbuka",
    locked: "Terkunci",
    done: "Selesai",
    fact: (s: number, b: number) => `${s} sketch, ${b} blank kode`,
    go: (n: number) => `Buka Modul ${n}`,
    access: "Akses",
    accessOf: (n: number) => `Akses Modul ${n}`,
    tagline: null as string[] | null,
    fakta: null as Record<string, string> | null,
  },
  en: {
    eyebrow: "Modules",
    title: "Four Practicum Modules",
    today: "Your Module Today",
    ledeA:
      "Set access straight from each card. A locked module also can't be picked when starting a session.",
    lede: "Anyone can read every module. The practicum journal opens after you have attended its session.",
    running: "Your session is running",
    todayLede:
      "While your session runs, Modules takes you straight to this session's module. You can open the other modules again after the session.",
    cont: "Continue to the Practicum",
    run: "Running",
    open: "Open",
    locked: "Locked",
    done: "Done",
    fact: (s: number, b: number) =>
      `${s} ${s === 1 ? "sketch" : "sketches"}, ${b} code ${b === 1 ? "blank" : "blanks"}`,
    go: (n: number) => `Open Module ${n}`,
    access: "Access",
    accessOf: (n: number) => `Module ${n} access`,
    tagline: null as string[] | null,
    fakta: null as Record<string, string> | null,
  },
  zh: {
    eyebrow: "模块",
    title: "四个实验模块",
    today: "你今天的模块",
    ledeA: "直接在每张卡片上设置权限。锁住的模块在开始上课时也选不了。",
    lede: "每个人都能读所有模块。上过那节课之后，实验报告才会打开。",
    running: "你的课正在进行",
    todayLede: "上课时，模块会直接带你到这节课的模块。下课后可以再打开其他模块。",
    cont: "继续去实验",
    run: "进行中",
    open: "开放",
    locked: "已锁定",
    done: "完成",
    fact: (s: number, b: number) => `${s} 个 sketch，${b} 个代码填空`,
    go: (n: number) => `打开模块 ${n}`,
    access: "权限",
    accessOf: (n: number) => `模块 ${n} 权限`,
    // The handbook has no Mandarin, so the cards carry their own line.
    tagline: [
      "",
      "一个 Central 和一个 Peripheral 通过 GATT 交换信号，不用 IP 网络。",
      "ESP32 通过本地 Wi-Fi 把传感器数据发给 Python 服务器。",
      "两块板子通过 Eclipse Mosquitto broker 交换数据。",
      "ESP32 板子之间的 LoRa P2P 信号寻踪。",
    ] as string[] | null,
    fakta: { "No IP network": "不用 IP 网络", "Pi hotspot": "PC 服务器热点" } as Record<
      string,
      string
    > | null,
  },
});

const ICON: Record<number, (p: { size: number }) => ReactNode> = {
  1: (p) => <BluetoothIcon {...p} />,
  2: (p) => <PlugsConnectedIcon {...p} />,
  3: (p) => <ChatsCircleIcon {...p} />,
  4: (p) => <BroadcastIcon {...p} />,
};

export function ModIcon({ modul, size = 28 }: { modul: number; size?: number }) {
  return (
    <span className="modcard__icon" aria-hidden="true">
      {ICON[modul]?.({ size })}
    </span>
  );
}

function Card({
  m,
  lang,
  run,
  open,
  done,
  asisten,
  bolehUbah,
  onAccess,
}: {
  m: ModulKartu;
  lang: Lang;
  run: boolean;
  open: boolean | null;
  done: boolean;
  asisten: boolean;
  /** The Jadwal right: the switch shows only to who can use it (the
   *  Open/Locked badge tells everyone else; 2026-10-06). */
  bolehUbah: boolean;
  onAccess: (open: boolean) => void;
}) {
  const t = T[lang];
  const url = href(lang, `/modules/${m.modul}`);
  const blanks = m.berkas.reduce((a, b) => a + b.blanks, 0);
  return (
    <article
      className="panel modcard"
      style={{ "--m": `var(--mod-${m.modul})` } as CSSProperties}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, .modcard__access")) return;
        location.href = url;
      }}
    >
      {/* Phase 21: Beranda's lanes merged in: the module's constellation on
          top, the module as text with its dot, tools as plain text (f4). */}
      <div className="modcard__art" aria-hidden="true">
        <ModConstellation m={m.modul} h={120} lang={lang} />
      </div>
      <div className="row row--between">
        <span className="modlabel modlabel--lg">
          <span className="modlabel__dot" aria-hidden="true" />
          {modulLabel(m.modul, lang)}
        </span>
        <span className="row modcard__badges">
          {run && (
            <Pill tone="ok">
              <span className="dot dot--ok dot--pulse" aria-hidden="true" />
              {t.run}
            </Pill>
          )}
          {asisten && open !== null && (
            <Pill tone={open ? "accent" : undefined}>{open ? t.open : t.locked}</Pill>
          )}
          {!asisten && done && <Pill tone="ok">{t.done}</Pill>}
        </span>
      </div>
      <h2 className="modcard__title">{MODUL_NAMA[m.modul]}</h2>
      <p className="panel__sub">{t.tagline?.[m.modul] || m.tagline}</p>
      <p className="modcard__facts mono">
        {m.fakta
          .slice(0, 3)
          .map((f) => t.fakta?.[f] ?? f)
          .join(" · ")}
      </p>
      <div className="modcard__foot">
        <span className="modcard__fact">{t.fact(m.berkas.length, blanks)}</span>
        <span className="row modcard__end">
          {asisten && bolehUbah && open !== null && (
            <span className="modcard__access">
              <span className="hint" aria-hidden="true">
                {t.access}
              </span>
              <Switch on={open} onChange={onAccess} label={t.accessOf(m.modul)} />
            </span>
          )}
          <a className="modcard__cta" href={url} aria-label={t.go(m.modul)}>
            <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
          </a>
        </span>
      </div>
    </article>
  );
}

export default function ModuleCards({ lang, modules }: { lang: Lang; modules: ModulKartu[] }) {
  const t = T[lang];
  const asli = useMe();
  // Projector mode draws the Asisten as a Praktikan of the projected group:
  // no access switches, and the running module's single card.
  const me = useTampil(asli);
  const pro = me !== asli;
  const signedIn = Boolean(me);
  const now = useSessionNow(signedIn);
  const [terbuka, setTerbuka] = useState<number[] | null>(null);
  const [asisten, setAsisten] = useState(false);
  const [jurnal, setJurnal] = useState<number[]>([]);

  useEffect(() => {
    if (me === undefined) return;
    const load = (segar = false) =>
      void getAksesState(true, segar).then((s) => {
        setTerbuka(s.terbuka);
        setAsisten(s.asisten);
        setJurnal(s.jurnal);
      });
    load();
    const biasa = () => load();
    window.addEventListener("iris:akses-berubah", biasa);
    // Another Asisten opening a module, or a practicum ending (live updates).
    const lepas = dengar(["akses", "sesi"], () => load(true));
    return () => {
      window.removeEventListener("iris:akses-berubah", biasa);
      lepas();
    };
  }, [asli]);

  // A guest has no session of their own, but the public lab summary still
  // says which module the lab is running now (Phase 11).
  const lab = usePoll(
    () => getJson<{ ok: boolean; sesi: { modul: number } | null }>("/api/session/lab"),
    60_000,
    me === null,
    ["sesi"],
  );
  const sesi = now.data;
  const running = signedIn ? (sesi?.modul ?? null) : (lab.data?.sesi?.modul ?? null);

  // A Praktikan in their running session: one card, straight to it.
  if (me?.role === "praktikan" && sesi && sesi.milikSaya !== false) {
    const m = modules.find((x) => x.modul === sesi.modul);
    return (
      <div className="stack stack--lg modlist modlist--one">
        <header className="modlist__head">
          <p className="eyebrow eyebrow--accent">{t.eyebrow}</p>
          <h1 className="modlist__title">{t.today}</h1>
        </header>
        <article
          className="panel panel--key panel--raised modhero"
          style={{ "--m": `var(--mod-${sesi.modul})` } as CSSProperties}
        >
          <ModIcon modul={sesi.modul} size={36} />
          <div className="stack">
            <div className="row">
              <Pill modul={sesi.modul} lg>
                {modulLabel(sesi.modul, lang)}
              </Pill>
              <Pill tone="ok">
                <span className="dot dot--ok dot--pulse" aria-hidden="true" />
                {t.running}
              </Pill>
            </div>
            <h2 className="modlist__title">{MODUL_NAMA[sesi.modul]}</h2>
            {m && <p className="panel__sub">{t.tagline?.[m.modul] || m.tagline}</p>}
            <p className="modlist__lede">{t.todayLede}</p>
            <div className="row">
              <a className="btn btn--inverse btn--lg" href={href(lang, `/modules/${sesi.modul}`)}>
                {t.cont}
              </a>
            </div>
          </div>
        </article>
      </div>
    );
  }

  // Phase 21: a visitor and a Praktikan outside a session get Beranda's
  // thesis and Langit Lab on top; an Asisten keeps the plain head. Read from
  // the role, not the access state, so an Asisten never sees it flash in.
  const hero = me !== undefined && me?.role !== "asisten";
  return (
    <div className="stack stack--lg modlist">
      {hero && <ModulHero lang={lang} />}
      <header className="modlist__head">
        <p className="eyebrow eyebrow--accent">{hero ? H[lang].rasiEyebrow : t.eyebrow}</p>
        {hero ? (
          <h2 className="modlist__title">{t.title}</h2>
        ) : (
          <h1 className="modlist__title">{t.title}</h1>
        )}
        <p className="modlist__lede">{asisten && !pro ? t.ledeA : t.lede}</p>
      </header>
      <div className="modgrid">
        {modules.map((m) => (
          <Card
            key={m.modul}
            m={m}
            lang={lang}
            run={running === m.modul}
            open={terbuka === null ? null : terbuka.includes(m.modul)}
            done={!pro && me?.role === "praktikan" && jurnal.includes(m.modul)}
            asisten={asisten && !pro}
            bolehUbah={me?.hak?.jadwal === true}
            onAccess={(v) => {
              // The switch moves now; the reload after the save confirms it.
              setTerbuka((l) =>
                v ? [...(l ?? []), m.modul] : (l ?? []).filter((x) => x !== m.modul),
              );
              void setModulAkses(m.modul, v, lang);
            }}
          />
        ))}
      </div>
      {me === null && <SessionPath lang={lang} />}
    </div>
  );
}
