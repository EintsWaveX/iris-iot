/**
 * The module page below its head (Phase 9 Stage 7, mockups m-browse and
 * p-module). Who is looking decides the steps:
 *
 * - browse (a guest, a Praktikan who has not done this module, or one
 *   whose session of another module is running):
 *   Module, Brief, Hands-on Practicum. The last one is a lock card (Sign In
 *   for a guest), or "Go to the practicum" for a Praktikan whose session of
 *   another module is running.
 * - now (a Praktikan in this module's running session) and asisten:
 *   Module, Brief, Setup, Code, Live. An Asisten also gets the access
 *   banner with its switch, and edits the Brief in place.
 * - done (a Praktikan who has done this module): the same five steps, read
 *   only, the last one being Captures and Scores.
 * - Lihat Sebagai Praktikan (`?lihat=N` from the Console, an Asisten on the
 *   running module): the five steps as group N sees them. The Asisten who
 *   holds N fills blanks, connects ports and captures for it; any other
 *   Asisten only looks.
 *
 * Module 4 adds a sixth step in a running session, Perburuan (ruled
 * 2026-10-04): the hand-off from the laptop to the phones for the LoRa
 * hunt, locked until the Asisten starts a session in the hunt's control
 * room, then the group's result.
 *
 * The step is mirrored into ?step= so a step is bookmarkable, and
 * `iris:go-step` (detail: a step id) moves to it from anywhere on the page.
 */
import {
  useEffect,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  CheckCircleIcon,
  CheckIcon,
  CircuitryIcon,
  DoorOpenIcon,
  EyeIcon,
  FlagCheckeredIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  NoteIcon,
} from "@phosphor-icons/react";
import PdfViewer from "../ui/PdfViewer";
import Fade from "../ui/Fade";
import Pill from "../ui/Pill";
import { StateView } from "../ui/Display";
import { Switch } from "../ui/Controls";
import CodeStep, { type CodeProps } from "./CodeStep";
import PinSchematic, { type PinData } from "./PinSchematic";
import SetupChecklist from "./SetupChecklist";
import LiveRoom from "../live/LiveRoom";
import { CaptureList, useTangkapan } from "../live/Capture";
import { CV } from "../live/captureStrings";
import BriefStep from "./BriefStep";
import HuntStep, { usePerburuan } from "./HuntStep";
import { H } from "./huntStrings";
import { getJson, href, tanggalPanjang, useMe, useSessionNow } from "../../lib/app";
import { getAksesState, type AksesState } from "../../scripts/modul-akses";
import { useProyektor } from "../../lib/proyektor";
import { setModulAkses } from "../shell/AsistenCommands";
import { modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { M } from "./moduleStrings";
import { openSignIn } from "../../lib/signin";
import { dengar } from "../../lib/siaran";

type Mode = "browse" | "now" | "done" | "asisten";
type Step = "modul" | "brief" | "praktikum" | "setup" | "code" | "live" | "hunt";

interface Praktikum {
  sesiId: number;
  modul: number;
  tanggal: string;
  status: string;
  sudahUmpanBalik: boolean;
  rataRata: number | null;
}

interface Props {
  lang: Lang;
  modul: number;
  pdfUrl: string;
  pdfName: string;
  ringkasan: string[];
  permainan?: string[];
  fakta: string[];
  toolchain: { label: string; alat: string }[];
  perangkat: { nama: string; jumlah: string }[];
  persiapan: string[];
  pin: PinData;
  mcu: string;
  skema: string;
  layers: ComponentProps<typeof LiveRoom>["layers"];
  code: CodeProps;
}

/** Only the three browse steps carry an icon. */
const ICON: Partial<Record<Step, ReactNode>> = {
  modul: <BookOpenTextIcon aria-hidden="true" />,
  brief: <NoteIcon aria-hidden="true" />,
  praktikum: <CircuitryIcon aria-hidden="true" />,
};

/** Lihat Sebagai Praktikan: the group an Asisten views the page as. */
export interface Wakil {
  nomor: number;
  /** This Asisten holds the group: full control. */
  own: boolean;
  sesiId: number;
  /** "Name (CODE)" of whoever holds it. */
  pemegang: string | null;
}

interface LabSaya {
  ok: boolean;
  sesi: { modul: number; kelompok: number } | null;
  pegang?: number[];
  sesiId?: number;
  pemegang?: Record<string, string>;
}

/** `?lihat=N` for an Asisten: undefined while loading, null when it does not apply. */
function useWakil(modul: number, asisten: boolean, pro: number | null): Wakil | null | undefined {
  const [dariUrl] = useState(() =>
    typeof location === "undefined"
      ? NaN
      : Number(new URLSearchParams(location.search).get("lihat")),
  );
  // Projector mode shows the group the Asisten holds, without ?lihat=.
  const lihat = pro ?? dariUrl;
  const minta = asisten && Number.isInteger(lihat) && lihat >= 1;
  const [w, setW] = useState<Wakil | null | undefined>(undefined);
  // Asked again when the session or a group's holder changes (2026-10-07:
  // after the session ended or another Asisten took the group, the
  // projector kept the live session and acted as the group's holder).
  const [kali, setKali] = useState(0);
  useEffect(() => {
    if (!minta) return;
    return dengar(["sesi", "nilai"], () => setKali((n) => n + 1));
  }, [minta]);
  useEffect(() => {
    if (!minta) return;
    let alive = true;
    getJson<LabSaya>("/api/session/lab?saya=1")
      .then((d) => {
        if (!alive) return;
        const s = d.ok ? d.sesi : null;
        setW(
          s && s.modul === modul && lihat <= s.kelompok && d.sesiId
            ? {
                nomor: lihat,
                own: (d.pegang ?? []).includes(lihat),
                sesiId: d.sesiId,
                pemegang: d.pemegang?.[lihat] ?? null,
              }
            : null,
        );
      })
      .catch(() => alive && setW(null));
    return () => {
      alive = false;
    };
  }, [minta, modul, lihat, kali]);
  return minta ? w : null;
}

function stepFromUrl(steps: Step[]): Step | null {
  const s = new URLSearchParams(location.search).get("step") as Step | null;
  return s && steps.includes(s) ? s : null;
}

export default function ModuleSteps(p: Props) {
  const { lang, modul } = p;
  const t = M[lang];
  const me = useMe();
  const now = useSessionNow(30_000, me?.role === "praktikan");
  const [akses, setAkses] = useState<AksesState | null>(null);
  const [mine, setMine] = useState<Praktikum[] | null>(null);

  useEffect(() => {
    if (me === undefined) return;
    const load = () => void getAksesState(true).then(setAkses);
    load();
    window.addEventListener("iris:akses-berubah", load);
    // Another Asisten opening a module, or a practicum ending (live updates).
    const lepas = dengar(["akses", "sesi"], () => void getAksesState(true, true).then(setAkses));
    return () => {
      window.removeEventListener("iris:akses-berubah", load);
      lepas();
    };
  }, [me]);

  useEffect(() => {
    if (me?.role !== "praktikan") return;
    getJson<{ ok: boolean; praktikum: Praktikum[] }>("/api/session/mine")
      .then((d) => setMine(d.ok ? d.praktikum : []))
      .catch(() => setMine([]));
  }, [me]);

  const pro = useProyektor(me);
  const wakil = useWakil(modul, me?.role === "asisten", pro);
  const [lihatGagal] = useState(
    () => typeof location !== "undefined" && new URLSearchParams(location.search).has("lihat"),
  );
  const sesi = now.data;
  const mySession = me?.role === "praktikan" && sesi && sesi.milikSaya !== false ? sesi : null;
  const loading =
    me === undefined ||
    akses === null ||
    wakil === undefined ||
    (me?.role === "praktikan" && now.updatedAt === null && now.errors === 0);

  const mode: Mode =
    me?.role === "asisten"
      ? wakil
        ? "now"
        : pro
          ? "browse"
          : "asisten"
      : mySession
        ? mySession.modul === modul
          ? "now"
          : "browse"
        : me?.role === "praktikan" && akses?.jurnal.includes(modul)
          ? "done"
          : "browse";

  const berburu = modul === 4 && mode === "now";
  const steps: Step[] =
    mode === "browse"
      ? ["modul", "brief", "praktikum"]
      : berburu
        ? ["modul", "brief", "setup", "code", "live", "hunt"]
        : ["modul", "brief", "setup", "code", "live"];
  const hunt = usePerburuan(berburu && !loading, wakil?.nomor);
  const keadaan = hunt.data?.aktif ? (hunt.data.keadaan ?? "tunggu") : "tunggu";

  const [step, setStep] = useState<Step>("modul");
  const [picked, setPicked] = useState(false);
  // The first step to show: the URL's, else Code in a running session,
  // else the module itself.
  useEffect(() => {
    if (loading || picked) return;
    setPicked(true);
    setStep(stepFromUrl(steps) ?? (mode === "now" ? "code" : "modul"));
  }, [loading, picked, mode]);

  const go = (s: Step) => {
    setStep(s);
    const url = new URL(location.href);
    url.searchParams.set("step", s);
    history.replaceState(history.state, "", url);
  };

  useEffect(() => {
    const on = (e: Event) => {
      const s = (e as CustomEvent<string>).detail as Step;
      if (steps.includes(s)) {
        go(s);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("iris:go-step", on);
    return () => window.removeEventListener("iris:go-step", on);
  }, [steps.join()]);

  if (loading) {
    return (
      <div className="stack stack--lg">
        <span className="skeleton" style={{ height: 58 }} />
        <span className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  const label: Record<Step, string> = {
    modul: t.modul,
    brief: t.brief,
    praktikum: t.praktikum,
    setup: t.setup,
    code: t.code,
    live: mode === "done" ? t.captures : t.live,
    hunt: H[lang].step,
  };
  const done = mode === "done" ? mine?.find((x) => x.modul === modul) : undefined;
  const open = akses?.terbuka.includes(modul) ?? false;
  const canEdit = mode === "asisten" && me?.hak?.jadwal === true;

  return (
    <div className="stack stack--lg modsteps">
      {wakil && !pro && (
        <div className={`banner modsteps__viewas ${wakil.own ? "banner--ok" : ""}`}>
          <EyeIcon aria-hidden="true" />
          <b>{wakil.own ? t.viewedOwn(wakil.nomor) : t.viewedOther(wakil.nomor)}</b>
          <span className="hint grow">
            {wakil.own ? t.viewedOwnHint : t.viewedOtherHint(wakil.pemegang)}
          </span>
          <a className="btn btn--sm btn--ghost" href={href(lang, "/session")}>
            <ArrowLeftIcon aria-hidden="true" />
            {t.backToSession}
          </a>
        </div>
      )}
      {mode === "asisten" && lihatGagal && (
        <div className="banner banner--warn">
          <EyeIcon aria-hidden="true" />
          <span>{t.viewedEnded}</span>
        </div>
      )}
      {mode === "asisten" && (
        <div className={`banner modsteps__access ${open ? "banner--ok" : "banner--warn"}`}>
          {open ? <LockSimpleOpenIcon aria-hidden="true" /> : <LockSimpleIcon aria-hidden="true" />}
          <b>{open ? t.openStudents : t.lockedStudents}</b>
          <span className="hint modsteps__hide-sm">{t.seeAll}</span>
          <span className="grow" />
          {/* Only who may change it gets the switch (the Jadwal right). */}
          {me?.hak?.jadwal === true && (
            <Switch
              on={open}
              onChange={(v) => {
                // The switch moves now; the reload after the save confirms it.
                setAkses(
                  (a) =>
                    a && {
                      ...a,
                      terbuka: v ? [...a.terbuka, modul] : a.terbuka.filter((x) => x !== modul),
                    },
                );
                void setModulAkses(modul, v, lang);
              }}
              label={t.access(modul)}
            />
          )}
        </div>
      )}
      {mode === "done" && (
        <div className="banner banner--ok">
          <CheckCircleIcon aria-hidden="true" />
          <b>{t.history}</b>
          {done && <span className="hint">{t.finishedOn(tanggalPanjang(done.tanggal, lang))}</span>}
        </div>
      )}

      {berburu && keadaan !== "tunggu" && step !== "hunt" && (
        <div className="banner banner--ok modsteps__hunt">
          <FlagCheckeredIcon aria-hidden="true" />
          <b>{keadaan === "selesai" ? H[lang].bannerDone : H[lang].bannerOpen}</b>
          <span className="hint modsteps__hide-sm">
            {keadaan === "selesai" ? H[lang].bannerDoneHint : H[lang].bannerOpenHint}
          </span>
          <span className="grow" />
          <button type="button" className="btn btn--sm btn--primary" onClick={() => go("hunt")}>
            {H[lang].toHunt}
            <ArrowRightIcon aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        className={`seg seg--big modsteps__tabs${mode === "browse" ? "" : " modsteps__tabs--plain"}${steps.length === 6 ? " modsteps__tabs--six" : ""}`}
        role="tablist"
        aria-label={t.steps}
        data-segfit="off"
      >
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            id={`step-${s}`}
            aria-selected={step === s}
            aria-controls="modsteps-panel"
            tabIndex={step === s ? 0 : -1}
            onClick={() => go(s)}
            onKeyDown={(e) => {
              const k = e.key;
              const j =
                k === "ArrowRight"
                  ? i + 1
                  : k === "ArrowLeft"
                    ? i - 1
                    : k === "Home"
                      ? 0
                      : k === "End"
                        ? steps.length - 1
                        : null;
              if (j === null) return;
              e.preventDefault();
              const next = steps[Math.max(0, Math.min(steps.length - 1, j))];
              go(next);
              requestAnimationFrame(() => document.getElementById(`step-${next}`)?.focus());
            }}
          >
            {mode === "browse" && ICON[s]}
            {s === "hunt" && keadaan === "tunggu" && <LockSimpleIcon aria-hidden="true" />}
            {/* Browse numbers the three steps and gives them icons (mockup
                m-browse); the five session steps are plain text (p-module). */}
            <span className="modsteps__label">
              {mode === "browse" ? `${i + 1} ${label[s]}` : label[s]}
            </span>
          </button>
        ))}
      </div>

      <div id="modsteps-panel" role="tabpanel" aria-labelledby={`step-${step}`}>
        <Fade k={`${step}-${mode}`}>
          {step === "modul" ? (
            <PdfViewer url={p.pdfUrl} name={p.pdfName} lang={lang} shape="page" />
          ) : step === "brief" ? (
            <BriefStep
              lang={lang}
              modul={modul}
              ringkasan={p.ringkasan}
              permainan={p.permainan}
              fakta={p.fakta}
              toolchain={p.toolchain}
              canEdit={canEdit}
            />
          ) : step === "praktikum" ? (
            <Hands
              lang={lang}
              modul={modul}
              guest={me === null}
              sesiModul={mySession?.modul}
              riwayatTunggu={
                me?.role === "praktikan" &&
                !!akses?.diikuti.includes(modul) &&
                !akses.jurnal.includes(modul)
              }
            />
          ) : step === "setup" ? (
            <Setup {...p} />
          ) : step === "code" ? (
            <CodeStep
              lang={lang}
              mode={mode === "browse" ? "done" : mode}
              pin={p.pin}
              mcu={p.mcu}
              skema={p.skema}
              code={p.code}
              wakil={wakil ?? undefined}
            />
          ) : step === "hunt" ? (
            <HuntStep lang={lang} data={hunt.data} asisten={me?.role === "asisten" && !pro} />
          ) : mode === "done" ? (
            <Done lang={lang} modul={modul} done={done} />
          ) : (
            <LiveRoom
              lang={lang}
              modul={modul}
              layers={p.layers}
              wakil={wakil ?? undefined}
              embed
            />
          )}
        </Fade>
      </div>

      {/* The way on from the bottom of a long step (2026-10-06): the tabs
          are far above by then. */}
      {(() => {
        const i = steps.indexOf(step);
        const prev = i > 0 ? steps[i - 1] : null;
        const next = i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;
        if (!prev && !next) return null;
        const pindah = (s: Step) => {
          go(s);
          document.querySelector(".modsteps__tabs")?.scrollIntoView({ block: "start" });
          requestAnimationFrame(() => document.getElementById(`step-${s}`)?.focus());
        };
        return (
          <nav className="modsteps__pager" aria-label={t.steps}>
            {prev ? (
              <button type="button" className="btn btn--ghost" onClick={() => pindah(prev)}>
                <ArrowLeftIcon size={18} aria-hidden="true" />
                {t.prevStep(label[prev])}
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button type="button" className="btn btn--secondary" onClick={() => pindah(next)}>
                {t.nextStep(label[next])}
                <ArrowRightIcon size={18} aria-hidden="true" />
              </button>
            )}
          </nav>
        );
      })()}
    </div>
  );
}

function Setup(p: Props) {
  const t = M[p.lang];
  // Each tool once, as a badge; its use stays in the tooltip.
  const tools = [...new Set(p.toolchain.map((tc) => tc.alat))];
  // Mockup p-module Setup: three equal cards, what you need, pins and
  // schematic, the checklist.
  return (
    <div className="modsetup">
      <section className="panel">
        <h2 className="panel__title">{t.whatYouNeed}</h2>
        <ul className="ticks">
          {p.perangkat.map((x) => (
            <li key={`${x.nama}|${x.jumlah}`}>
              <CheckIcon aria-hidden="true" />
              <span>
                {x.nama}
                {x.jumlah && <span className="ticks__note"> · {x.jumlah}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="row modsetup__tools">
          {tools.map((a) => (
            <Pill
              key={a}
              title={p.toolchain
                .filter((tc) => tc.alat === a)
                .map((tc) => tc.label)
                .join(", ")}
            >
              {a}
            </Pill>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2 className="panel__title">{t.pins}</h2>
        <PinSchematic
          lang={p.lang}
          modul={p.modul}
          pin={p.pin}
          mcu={p.mcu}
          skema={p.skema}
          variant="dock"
        />
      </section>
      <SetupChecklist lang={p.lang} modul={p.modul} items={p.persiapan} title={t.checklist} />
    </div>
  );
}

function Hands({
  lang,
  modul,
  guest,
  sesiModul,
  riwayatTunggu = false,
}: {
  lang: Lang;
  modul: number;
  guest: boolean;
  sesiModul?: number;
  /** They did this practicum, but its history isn't open yet (2026-10-06). */
  riwayatTunggu?: boolean;
}) {
  const t = M[lang];
  if (sesiModul && sesiModul !== modul) {
    return (
      <div
        className="panel panel--key panel--raised modhands"
        style={{ "--m": `var(--mod-${sesiModul})` } as CSSProperties}
      >
        <div className="row">
          <span className="dot dot--ok dot--pulse" aria-hidden="true" />
          <Pill tone="ok">{t.inSession}</Pill>
        </div>
        <h2 className="modhands__title">{t.inSessionTitle(modulLabel(sesiModul, lang))}</h2>
        <p className="modlist__lede">{t.inSessionBody}</p>
        <div className="panel__actions">
          <a
            className="btn btn--inverse btn--lg"
            href={href(lang, `/modules/${sesiModul}?step=code`)}
          >
            {t.goPracticum}
            <ArrowRightIcon aria-hidden="true" />
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="modlock">
      <StateView
        icon={<LockSimpleIcon size={28} />}
        title={
          riwayatTunggu
            ? t.histTitle(modulLabel(modul, lang))
            : t.lockedTitle(modulLabel(modul, lang))
        }
        body={
          guest
            ? t.lockedBody
            : riwayatTunggu
              ? modul >= 4
                ? t.histLast
                : t.histBody(modulLabel(modul + 1, lang))
              : t.lockedBodyP(modulLabel(modul, lang))
        }
        actions={
          guest ? (
            <button type="button" className="btn btn--primary" onClick={() => openSignIn()}>
              <DoorOpenIcon aria-hidden="true" />
              {t.signIn}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("iris:go-step", { detail: "modul" }))
              }
            >
              <BookOpenTextIcon aria-hidden="true" />
              {t.readModule}
            </button>
          )
        }
      />
    </div>
  );
}

function Done({ lang, modul, done }: { lang: Lang; modul: number; done?: Praktikum }) {
  const t = M[lang];
  const cap = useTangkapan(modul, true);
  return (
    <div className="stack stack--lg">
      <div className="panel panel--raised">
        <div className="row">
          <Pill tone="ok">
            <CheckCircleIcon aria-hidden="true" />
            {t.doneBadge}
          </Pill>
          {done && <span className="hint">{tanggalPanjang(done.tanggal, lang)}</span>}
        </div>
        <h2 className="modhands__title">{t.doneTitle}</h2>
        <p className="panel__sub">{t.doneBody}</p>
        <div className="modstats">
          <div className="stat">
            <span className="stat__value num">{done?.rataRata ?? t.notSent}</span>
            <span className="stat__label">{t.finalScore}</span>
          </div>
          <div className="stat">
            <span className="stat__value">{done?.sudahUmpanBalik ? t.sent : t.notSent}</span>
            <span className="stat__label">{t.feedback}</span>
          </div>
        </div>
        {done && !done.sudahUmpanBalik && (
          <div className="panel__actions">
            <a className="btn btn--inverse" href={href(lang, "/dashboard")}>
              {t.giveFeedback}
            </a>
          </div>
        )}
      </div>
      <section className="panel">
        <h2 className="panel__title">{CV[lang].listTitle}</h2>
        {cap.rows === null ? (
          <p className="hint">…</p>
        ) : (
          <CaptureList lang={lang} modul={modul} rows={cap.rows} />
        )}
      </section>
    </div>
  );
}
