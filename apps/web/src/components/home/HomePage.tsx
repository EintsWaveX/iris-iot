/**
 * Home, concept A "The lab right now" (Phase 9 Stage 7, mockup h-home).
 * The hero card changes with who is looking: a guest gets Sign In, a
 * Praktikan in a session gets Continue Module N, an Asisten gets the
 * Console. Next to it, what is happening in the lab now (public counts from
 * /api/session/lab), then how a session runs and one lane per module.
 * Praktikan never see a schedule here.
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  ChatsCircleIcon,
  CheckIcon,
  CircuitryIcon,
  DoorOpenIcon,
  FilePdfIcon,
} from "@phosphor-icons/react";
import {
  getJson,
  href,
  KELOMPOK_NAMA,
  MODUL_NAMA,
  menitBerjalan,
  useMe,
  useSessionNow,
  useTick,
} from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { useTampil } from "../../lib/proyektor";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { slotBerikutnya, type BarisJadwal, type SlotBerikutnya } from "../../lib/jadwal-next";
import { hariDariTanggal, semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariLabel, kelasLabel, kelompokLabel, modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import Pill from "../ui/Pill";
import { H, LANES } from "./homeStrings";
import "../ui/Display.css";
import "./home.css";
import { openSignIn } from "../../lib/signin";

interface Lab {
  modul: number;
  kelas: "reguler" | "internasional";
  mulaiPada: string;
  durasiMenit: number;
  kelompok: number;
  hadir: number;
  anggota: number;
  blank: number;
  pesan: number;
}

function menitWib(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return g("hour") * 60 + g("minute");
}

/** "Kelompok 2 dan 4", "Group 2 and 4", "第 2、4 组" */
function daftarKelompok(list: number[], lang: Lang): string {
  if (lang === "zh") return `第 ${list.join("、")} 组`;
  const head = kelompokLabel(list[0], lang);
  if (list.length === 1) return head;
  const rest = list.slice(1);
  const last = rest.pop();
  return `${[head, ...rest].join(", ")} ${H[lang].and} ${last}`;
}

function Lane({ m, via }: { m: number; via?: boolean }) {
  const l = LANES[m - 1];
  return (
    <div className="lane" style={{ "--m": `var(--mod-${m})` } as CSSProperties} aria-hidden="true">
      <span className="lane__node">{l.a}</span>
      <span className="lane__wire">
        <i />
        <i />
        <i />
        {via && <b>{l.via}</b>}
      </span>
      <span className="lane__node">{l.b}</span>
    </div>
  );
}

function RoleCard({ lang, lab, pegang }: { lang: Lang; lab: Lab | null; pegang: number[] }) {
  const t = H[lang];
  // Projector mode draws the Asisten as a Praktikan of the projected group.
  const me = useTampil(useMe());
  const now = useSessionNow(30_000, me?.role === "praktikan");
  useTick(30_000);
  const [next, setNext] = useState<SlotBerikutnya | null | undefined>(undefined);

  useEffect(() => {
    if (me?.role !== "asisten") return;
    const today = hariIniWib();
    getJson<{ ok: boolean; jadwal: BarisJadwal[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(today)}`,
    )
      .then((d) =>
        setNext(
          d.ok ? slotBerikutnya(d.jadwal, me.kode ?? "", hariDariTanggal(today), menitWib()) : null,
        ),
      )
      .catch(() => setNext(null));
  }, [me]);

  if (me === undefined) return <span className="skeleton" style={{ height: 56, maxWidth: 360 }} />;

  if (me === null) {
    return (
      <div className="row home__cta">
        <button type="button" className="btn btn--primary btn--lg" onClick={() => openSignIn()}>
          <DoorOpenIcon aria-hidden="true" />
          {t.masuk}
        </button>
        <a className="btn btn--lg" href={href(lang, "/modules")}>
          {t.browse}
        </a>
      </div>
    );
  }

  if (me.role === "praktikan") {
    const k = me.kelompok ?? 0;
    const s = now.data;
    const mine = s && s.milikSaya !== false;
    if (!mine) {
      return (
        <div className="panel panel--key home__role">
          {k > 0 && (
            <div className="row">
              <Pill group={k}>
                {kelompokLabel(k, lang)} · {KELOMPOK_NAMA[k]}
              </Pill>
            </div>
          )}
          <p className="panel__sub">{t.noSessionP}</p>
          <div className="panel__actions">
            <a className="btn btn--inverse btn--lg" href={href(lang, "/dashboard")}>
              {t.dasbor}
              <ArrowRightIcon aria-hidden="true" />
            </a>
          </div>
        </div>
      );
    }
    const durasi = s.durasiMenit ?? 120;
    const jalan = menitBerjalan(s.mulaiPada);
    return (
      <div
        className="panel panel--key home__role"
        style={{ "--g": `var(--group-${k || 1})` } as CSSProperties}
      >
        <div className="row">
          <span className="dot dot--ok dot--pulse" aria-hidden="true" />
          <Pill tone="ok">{t.inPracticum}</Pill>
          {k > 0 && (
            <Pill group={k}>
              {kelompokLabel(k, lang)} · {KELOMPOK_NAMA[k]}
            </Pill>
          )}
        </div>
        <h2 className="home__h2">
          {modulLabel(s.modul, lang)} · {MODUL_NAMA[s.modul]}
        </h2>
        <div className="row row--nowrap">
          <span
            className="meter grow"
            style={{ "--meter": Math.min(100, (jalan / durasi) * 100) } as CSSProperties}
            aria-hidden="true"
          />
          <span className="num hint">{t.left(Math.max(0, durasi - jalan))}</span>
        </div>
        <div className="panel__actions">
          <a className="btn btn--inverse btn--lg" href={href(lang, `/modules/${s.modul}`)}>
            {t.lanjut(s.modul)}
            <ArrowRightIcon aria-hidden="true" />
          </a>
          <a className="btn btn--lg" href={href(lang, "/dashboard")}>
            {t.dasbor}
          </a>
        </div>
      </div>
    );
  }

  const nextText = next
    ? `${hariLabel(next.hari, lang)} ${SLOT_MULAI[next.slot]}`
    : next === null
      ? null
      : undefined;
  return (
    <div className="panel panel--key home__role">
      {lab ? (
        <>
          <div className="row">
            <span className="dot dot--ok dot--pulse" aria-hidden="true" />
            <Pill tone="ok">{t.running}</Pill>
            <Pill>{kelasLabel(lab.kelas, lang)}</Pill>
          </div>
          <h2 className="home__h2">
            {modulLabel(lab.modul, lang)} · {MODUL_NAMA[lab.modul]}
          </h2>
          <p className="panel__sub">
            {pegang.length ? t.hold(daftarKelompok(pegang, lang)) : t.holdNone}
            {nextText ? ` ${t.nextSlot(nextText)}` : ""}
          </p>
        </>
      ) : (
        <>
          <span className="label-caps">{t.nextTitle}</span>
          {next === undefined ? (
            <span className="skeleton" style={{ height: 48 }} />
          ) : next ? (
            <>
              <h2 className="home__h2">
                {hariLabel(next.hari, lang)} · {SLOT_MULAI[next.slot]}
              </h2>
              <div className="row">
                <Pill tone="accent">
                  {next.sedangBerjalan
                    ? t.nowRunning
                    : next.hariLagi === 0
                      ? t.today
                      : next.hariLagi === 1
                        ? t.tomorrow
                        : t.inDays(next.hariLagi)}
                </Pill>
                <Pill tone={next.kelas === "internasional" ? "violet" : undefined}>
                  {kelasLabel(next.kelas, lang)}
                </Pill>
                {next.kelompok.length > 0 && <Pill>{daftarKelompok(next.kelompok, lang)}</Pill>}
              </div>
            </>
          ) : (
            <p className="panel__sub">{t.noSlot}</p>
          )}
        </>
      )}
      <div className="panel__actions">
        <a className="btn btn--inverse btn--lg" href={href(lang, "/session")}>
          {t.konsol}
          <ArrowRightIcon aria-hidden="true" />
        </a>
        <a className="btn btn--lg" href={href(lang, "/schedule")}>
          {t.jadwal}
        </a>
      </div>
    </div>
  );
}

function LiveNow({ lang, lab }: { lang: Lang; lab: Lab | null | undefined }) {
  const t = H[lang];
  if (lab === undefined) {
    return <span className="skeleton home__live" style={{ minHeight: 280 }} />;
  }
  if (!lab) {
    return (
      <section className="panel panel--raised home__live">
        <div className="panel__head">
          <h2 className="panel__title">{t.labNow}</h2>
          <Pill>{t.quiet}</Pill>
        </div>
        <p className="panel__sub">{t.quietBody}</p>
        <Lane m={3} />
      </section>
    );
  }
  const stats: [string, string][] = [
    [String(lab.kelompok), t.groups],
    [lab.anggota ? `${lab.hadir}/${lab.anggota}` : String(lab.hadir), t.here],
    [String(lab.blank), t.blanks],
    [String(lab.pesan), t.pesan(lab.modul)],
  ];
  return (
    <section className="panel panel--raised home__live">
      <div className="panel__head">
        <h2 className="panel__title">{t.labNow}</h2>
        <Pill tone="ok">
          <span className="dot dot--ok" aria-hidden="true" />
          {t.live}
        </Pill>
      </div>
      <div className="row">
        <Pill modul={lab.modul} lg>
          {modulLabel(lab.modul, lang)}
        </Pill>
        <b>{MODUL_NAMA[lab.modul]}</b>
        <span className="hint">{kelasLabel(lab.kelas, lang)}</span>
      </div>
      <div className="home__stats">
        {stats.map(([v, l]) => (
          <div className="stat" key={l}>
            <span className="stat__value num">{v}</span>
            <span className="stat__label">{l}</span>
          </div>
        ))}
      </div>
      <Lane m={lab.modul} />
    </section>
  );
}

export default function HomePage({ lang }: { lang: Lang }) {
  const t = H[lang];
  const me = useTampil(useMe());
  const saya = me?.role === "asisten";
  const lab = usePoll(
    () =>
      getJson<{ ok: boolean; sesi: Lab | null; pegang?: number[] }>(
        `/api/session/lab${saya ? "?saya=1" : ""}`,
      ),
    20_000,
    me !== undefined,
    ["sesi", "jadwal"],
  );
  const labData = lab.data ? lab.data.sesi : lab.errors > 0 ? null : undefined;

  const steps = [
    { icon: <BookOpenTextIcon size={28} />, title: t.before, list: t.beforeList },
    { icon: <CircuitryIcon size={28} />, title: t.during, list: t.duringList },
    { icon: <ChatsCircleIcon size={28} />, title: t.after, list: t.afterList },
  ];

  return (
    <div className="home">
      <div className="home__top">
        <div className="stack stack--lg">
          <p className="eyebrow eyebrow--accent">{t.eyebrow}</p>
          <h1 className="home__display">{t.title}</h1>
          <p className="home__lede">{t.lede}</p>
          <RoleCard lang={lang} lab={labData ?? null} pegang={lab.data?.pegang ?? []} />
        </div>
        <LiveNow lang={lang} lab={labData} />
      </div>

      <section className="stack">
        <h2 className="home__h1">{t.flowTitle}</h2>
        <div className="home__steps">
          {steps.map((s) => (
            <div className="panel" key={s.title}>
              <span className="home__tile" aria-hidden="true">
                {s.icon}
              </span>
              <h3 className="home__h2">{s.title}</h3>
              <ul className="home__ticks">
                {s.list.map((x) => (
                  <li key={x}>
                    <CheckIcon size={16} weight="bold" aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2 className="home__h1">{t.boardTitle}</h2>
        <div className="panel home__lanes">
          {LANES.map((l) => (
            <div
              className="home__lanerow"
              key={l.m}
              style={{ "--m": `var(--mod-${l.m})` } as CSSProperties}
            >
              <Pill modul={l.m} lg>
                {modulLabel(l.m, lang)}
              </Pill>
              <Lane m={l.m} via />
              <span className="hint">{t.lanes[l.m]}</span>
              <a className="btn btn--sm" href={href(lang, `/modules/${l.m}`)}>
                <FilePdfIcon aria-hidden="true" />
                {t.read}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
