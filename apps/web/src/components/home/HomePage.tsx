/**
 * Home, Phase 10 (mockup h10-home): the lab as a sky. Each group in the
 * running session is a star that brightens with its blanks filled, drawn
 * over the running module's constellation (public counts from
 * /api/session/lab). The card under the title changes with who is looking:
 * a guest gets Sign In, a Praktikan in a session gets the session clock and
 * Continue Module N, a Praktikan without one gets their star path, an
 * Asisten gets the clock or their next slot. Under it the four modules as
 * four constellations and the path of one session. Praktikan never see a
 * schedule here.
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  getJson,
  href,
  KELOMPOK_NAMA,
  MODUL_NAMA,
  useMe,
  useSessionNow,
  useTick,
} from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { useProyektor, useTampil } from "../../lib/proyektor";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { slotBerikutnya, type BarisJadwal, type SlotBerikutnya } from "../../lib/jadwal-next";
import type { MingguSlot } from "../../lib/penugasan-minggu";
import { PillKursi } from "../ui/PillGanti";
import { hariDariTanggal, semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariLabel, kelasLabel, kelompokLabel, modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import Pill from "../ui/Pill";
import { Journey, journeyFrom, MissionClock, ModConstellation } from "../shared/Instruments";
import { H, LANES } from "./homeStrings";
import "../ui/Display.css";
import "./home.css";
import { openSignIn } from "../../lib/signin";
import { useSegar } from "../../lib/siaran";
import { useAliranAtauTopik } from "../../lib/aliran-ruang";
import DayCard from "../console/DayCard";
import ProfilLab from "./profil/ProfilLab";

export interface Lab {
  modul: number;
  kelas: "reguler" | "internasional";
  mulaiPada: string;
  durasiMenit: number;
  kelompok: number;
  hadir: number;
  anggota: number;
  blank: number;
  pesan: number;
  benar?: number;
  celah?: number;
  bintang?: { nomor: number; terisi: number; benar?: number }[];
}

interface Praktikum {
  sesiId: number;
  modul: number;
  status: string;
  rataRata: number | null;
}

/** Where each group's star sits in the sky (100 x 60). */
const SPOTS: [number, number][] = [
  [14, 16],
  [33, 40],
  [52, 12],
  [70, 36],
  [88, 18],
  [86, 46],
];
const LINES: [number, number][] = [
  [0, 2],
  [2, 4],
  [1, 3],
  [0, 1],
  [3, 4],
  [2, 3],
  [3, 5],
  [4, 5],
];

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

function RoleCard({ lang, lab, pegang }: { lang: Lang; lab: Lab | null; pegang: number[] }) {
  const t = H[lang];
  // Projector mode draws the Asisten as a Praktikan of the projected group.
  const asli = useMe();
  const me = useTampil(asli);
  const pro = useProyektor(asli);
  const praktikan = me?.role === "praktikan";
  const now = useSessionNow(praktikan);
  useTick(30_000);
  const [next, setNext] = useState<SlotBerikutnya | null | undefined>(undefined);
  // A cover or a schedule change moves the next slot (live updates).
  const segarJadwal = useSegar(["jadwal", "tim"], me?.role === "asisten");
  const s = now.data;
  const mine = Boolean(s && s.milikSaya !== false);
  const hasil = usePoll(
    () =>
      getJson<{ ok: boolean; blank?: { benar: number; total: number } }>(
        `/api/session/results${pro ? `?kelompok=${pro}` : ""}`,
      ),
    60_000,
    praktikan && mine,
    ["sesi"],
    0,
    pro,
  );
  useAliranAtauTopik(
    { ruang: "sesi", sesiId: s?.id ?? null },
    ["jawaban"],
    ["jawaban"],
    hasil.refresh,
    praktikan && mine,
    pro ?? me?.kelompok ?? null,
  );
  const riwayat = usePoll(
    () => getJson<{ ok: boolean; praktikum: Praktikum[] }>("/api/session/mine"),
    120_000,
    // An Asisten on the projector has no practicum history of theirs.
    asli?.role === "praktikan" && !mine,
    ["sesi"],
  );

  useEffect(() => {
    if (me?.role !== "asisten") return;
    const today = hariIniWib();
    getJson<{ ok: boolean; jadwal: BarisJadwal[]; minggu?: Record<string, MingguSlot> }>(
      `/api/session/schedule?semester=${semesterDariTanggal(today)}`,
    )
      .then((d) =>
        setNext(
          d.ok
            ? slotBerikutnya(d.jadwal, me.kode ?? "", hariDariTanggal(today), menitWib(), d.minggu)
            : null,
        ),
      )
      .catch(() => setNext(null));
  }, [me, segarJadwal]);

  if (me === undefined) return <span className="skeleton" style={{ height: 56, maxWidth: 360 }} />;

  if (me === null) {
    return (
      <div className="row home__cta">
        <button type="button" className="btn btn--primary btn--lg" onClick={() => openSignIn()}>
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
    if (!mine || !s) {
      const list = riwayat.data?.ok ? riwayat.data.praktikum : [];
      return (
        <div
          className="panel panel--key bridge"
          style={{ "--g": `var(--group-${k || 1})` } as CSSProperties}
        >
          {k > 0 && (
            <div className="row">
              <Pill group={k}>
                {kelompokLabel(k, lang)} · {KELOMPOK_NAMA[k]}
              </Pill>
            </div>
          )}
          <p className="panel__sub">{t.noSessionP}</p>
          <Journey compact mods={journeyFrom(list, null)} lang={lang} names={MODUL_NAMA} />
          <div className="panel__actions">
            <a className="btn btn--inverse btn--lg" href={href(lang, "/dashboard")}>
              {t.dasbor}
            </a>
          </div>
        </div>
      );
    }
    const b = hasil.data?.ok ? hasil.data.blank : undefined;

    return (
      <div
        className="panel panel--key bridge"
        style={{ "--g": `var(--group-${k || 1})` } as CSSProperties}
      >
        <div className="bridge__top">
          <MissionClock
            mulaiPada={s.mulaiPada}
            durasiMenit={s.durasiMenit ?? 120}
            size={104}
            lang={lang}
            noLeft
          />
          <div className="stack stack--sm">
            <div className="row">
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
            {b && <span className="hint">{t.progLine(b.benar, b.total)}</span>}
          </div>
        </div>
        <div className="panel__actions">
          <a className="btn btn--inverse btn--lg" href={href(lang, `/modules/${s.modul}`)}>
            {t.lanjut(s.modul)}
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
  // Phase 10 (h11-home): the Konsol's day strip in small, then the running
  // session, my open start window, or my next slot.
  const liveNode = lab ? (
    <div className="bridge__top">
      <MissionClock mulaiPada={lab.mulaiPada} durasiMenit={lab.durasiMenit} size={92} lang={lang} />
      <div className="stack stack--sm">
        <div className="row">
          <Pill tone="ok">{t.running}</Pill>
          <Pill>{kelasLabel(lab.kelas, lang)}</Pill>
        </div>
        <h2 className="home__h2">
          {modulLabel(lab.modul, lang)} · {MODUL_NAMA[lab.modul]}
        </h2>
        <span className="hint">
          {pegang.length ? t.hold(daftarKelompok(pegang, lang)) : t.holdNone}
          {nextText ? ` ${t.nextSlot(nextText)}` : ""}
        </span>
      </div>
    </div>
  ) : null;
  const nextNode = (
    <div className="stack stack--sm">
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
            {(next.kursi ?? [])
              .filter((x) => x.ganti)
              .map((x) => (
                <PillKursi key={x.nomor} k={x} lang={lang} />
              ))}
          </div>
        </>
      ) : (
        <p className="panel__sub">{t.noSlot}</p>
      )}
    </div>
  );
  return <DayCard lang={lang} me={me} live={liveNode} next={nextNode} />;
}

export function LabSky({
  lang,
  lab,
  mine,
  holder,
}: {
  lang: Lang;
  lab: Lab | null | undefined;
  mine: number[];
  holder: "praktikan" | "asisten" | null;
}) {
  const t = H[lang];
  if (lab === undefined) {
    return <span className="skeleton labsky" style={{ minHeight: 320 }} />;
  }
  if (!lab) {
    return (
      <section className="panel panel--raised labsky" data-quiet="yes">
        <div className="panel__head">
          <h2 className="panel__title">{t.sky}</h2>
          <Pill>{t.quiet}</Pill>
        </div>
        <div className="labsky__field labsky__field--quiet">
          {[1, 2, 3, 4].map((m) => (
            <div
              className="labsky__mini"
              key={m}
              style={{ "--m": `var(--mod-${m})` } as CSSProperties}
            >
              <ModConstellation m={m} h={70} lang={lang} />
              <span>{modulLabel(m, lang)}</span>
            </div>
          ))}
        </div>
        <p className="panel__sub">{t.skyQuiet}</p>
      </section>
    );
  }
  const celah = lab.celah ?? 0;
  const bintang = lab.bintang ?? [];
  const spots = bintang.map((_, i) => SPOTS[i % SPOTS.length]);
  const stats: [string, string][] = [
    [String(lab.kelompok), t.groups],
    [lab.anggota ? `${lab.hadir}/${lab.anggota}` : String(lab.hadir), t.here],
    [
      celah
        ? t.blankOf(lab.benar ?? lab.blank, celah * lab.kelompok)
        : String(lab.benar ?? lab.blank),
      t.blanks,
    ],
    [String(lab.pesan), t.pesan(lab.modul)],
  ];
  return (
    <section
      className="panel panel--raised labsky"
      style={{ "--m": `var(--mod-${lab.modul})` } as CSSProperties}
    >
      <div className="panel__head">
        <h2 className="panel__title">{t.sky}</h2>
        <div className="panel__badges">
          <Pill modul={lab.modul}>
            {modulLabel(lab.modul, lang)} · {MODUL_NAMA[lab.modul]}
          </Pill>
          <Pill tone="ok">
            <span className="dot dot--ok dot--pulse" aria-hidden="true" />
            {t.live}
          </Pill>
        </div>
      </div>
      <div className="labsky__field" data-guest={lab.bintang ? "no" : "yes"}>
        <div className="labsky__bg">
          <ModConstellation m={lab.modul} h={220} lang={lang} />
        </div>
        <svg
          className="labsky__groups"
          viewBox="0 0 100 60"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={t.skyAria}
        >
          {LINES.filter(([a, b]) => a < spots.length && b < spots.length).map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              className="gstar__line"
              x1={spots[a][0]}
              y1={spots[a][1]}
              x2={spots[b][0]}
              y2={spots[b][1]}
            />
          ))}
          {bintang.map((g, i) => {
            const [x, y] = spots[i];
            const right = g.benar ?? g.terisi;
            const p = celah ? Math.min(1, right / celah) : 0;
            const me = mine.includes(g.nomor);
            const r = 1.6 + p * 2.2;
            return (
              <g
                key={g.nomor}
                className="gstar"
                data-me={me ? "yes" : "no"}
                data-done={p === 1 ? "yes" : "no"}
                style={
                  { "--g": `var(--group-${((g.nomor - 1) % 5) + 1})`, "--p": p } as CSSProperties
                }
              >
                {me && <circle className="gstar__mine" cx={x} cy={y} r={4.6 + p * 2.4} />}
                <circle className="gstar__halo" cx={x} cy={y} r={r * 1.8} />
                <circle className="gstar__core" cx={x} cy={y} r={r} />
                <text className="gstar__name" x={x} y={y + 9} textAnchor="middle">
                  {KELOMPOK_NAMA[g.nomor]
                    ? `${g.nomor} · ${KELOMPOK_NAMA[g.nomor]}`
                    : String(g.nomor)}
                </text>
                <text className="gstar__p" x={x} y={y + 13.5} textAnchor="middle">
                  {p === 1 ? t.starDone : t.starP(right, celah)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="labsky__stats">
        {stats.map(([v, l]) => (
          <div key={l}>
            <b className="mono">{v}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      {!lab.bintang && <span className="hint">{t.skyGuest}</span>}
      {mine.length > 0 && holder && (
        <span className="hint labsky__key">
          <span className="gstar__keyring" aria-hidden="true" />
          {holder === "praktikan" ? t.keyMine : t.keyHold}
        </span>
      )}
    </section>
  );
}

export default function HomePage({ lang }: { lang: Lang }) {
  const t = H[lang];
  const asli = useMe();
  const me = useTampil(asli);
  // The projector greets the group, not the Asisten's own name.
  const pro = useProyektor(asli);
  // Signed in: the private answer with each group's stars (guests get counts).
  const saya = Boolean(me);
  const lab = usePoll(
    () =>
      getJson<{ ok: boolean; sesi: Lab | null; pegang?: number[] }>(
        `/api/session/lab${saya ? "?saya=1" : ""}`,
      ),
    60_000,
    // A visitor's Home frame shows no lab.
    saya,
    ["sesi", "jadwal", "jawaban"],
    15_000,
    saya ? 1 : 0,
  );
  const labData = lab.data ? lab.data.sesi : lab.errors > 0 ? null : undefined;
  const pegang = lab.data?.pegang ?? [];
  const holder = me?.role === "praktikan" ? "praktikan" : me?.role === "asisten" ? "asisten" : null;
  const mine =
    holder === "praktikan"
      ? me?.kelompok
        ? [me.kelompok]
        : []
      : holder === "asisten"
        ? pegang
        : [];

  // A visitor gets the lab's hero and its profile (Phase 23); Beranda's own
  // view is for who is signed in, with the profile under it. Until that is
  // known (the server's render too) the page keeps its room and draws
  // neither, so a visitor never sees the signed-in view flash first.
  if (me === undefined) return <div className="homewait" aria-busy="true" />;
  if (me === null) return <ProfilLab lang={lang} me={null} hero />;

  return (
    <>
      <div className="home home10">
        <div className="home10__top">
          <div className="stack stack--lg">
            <p className="eyebrow eyebrow--accent">{t.eyebrow}</p>
            {me ? (
              <h1 className="home__display home__display--hello">
                {t.hello(pro ? (KELOMPOK_NAMA[pro] ?? kelompokLabel(pro, lang)) : me.nama)}
              </h1>
            ) : (
              <>
                <h1 className="home__display">{t.title}</h1>
                <p className="home__lede">{t.lede}</p>
              </>
            )}
            <RoleCard lang={lang} lab={labData ?? null} pegang={pegang} />
          </div>
          <LabSky lang={lang} lab={labData} mine={mine} holder={holder} />
        </div>

        <section className="stack">
          <div className="home10__head">
            <span className="eyebrow">{t.rasiEyebrow}</span>
            <h2 className="home__h1">{t.rasiTitle}</h2>
          </div>
          <div className="home10__rasi">
            {LANES.map((l) => (
              <article
                className="panel rasi"
                key={l.m}
                style={{ "--m": `var(--mod-${l.m})` } as CSSProperties}
              >
                <div className="panel__head rasi__head">
                  <Pill modul={l.m}>{modulLabel(l.m, lang)}</Pill>
                  <span className="hint mono">
                    {l.a} · {l.via}
                  </span>
                </div>
                <ModConstellation m={l.m} h={150} lang={lang} />
                <h3 className="home__h2">{MODUL_NAMA[l.m]}</h3>
                <p className="panel__sub">{t.lanes[l.m]}</p>
                <div className="panel__actions">
                  <a className="btn" href={href(lang, `/modules/${l.m}`)}>
                    {t.read}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      <ProfilLab lang={lang} me={me} />
    </>
  );
}
