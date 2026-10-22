/**
 * The console's session head (P8.1; Phase 10, mockup c12-run): the
 * mission clock, the module, class, slot, Asisten codes and sign in code,
 * and the session track (start to end, now, a mark for each moment).
 *
 * - Under it every session action keeps a place: Umumkan, Proyektor, the
 *   Server chip (opens the drawer), Lainnya (Akses Modul, Presentasi,
 *   Lihat Sebagai Praktikan, Persiapan Langsung, Tabel Nilai, SeeLabs and
 *   the Module 4 scoreboard; the first two open their form in place) and
 *   Ada Masalah?, then Perpanjang (E) and Akhiri Sesi on the right.
 * - Module 4 (2026-10-08): Mulai Perburuan turns the IRIS_IOT hotspot and
 *   the scoreboard on and opens the Praktikan's Perburuan step; Selesai
 *   Perburuan turns both off (api/_lib/perburuan-sesi.ts).
 */
import KodeMasuk from "../shell/KodeMasuk";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CrosshairIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  StopCircleIcon,
} from "@phosphor-icons/react";
import * as RadixPopover from "@radix-ui/react-popover";
import { Stepper, Switch } from "../ui/Controls";
import Tooltip from "../ui/Tooltip";
import Confirm from "../ui/Confirm";
import KeyHint from "../ui/KeyHint";
import Pill from "../ui/Pill";
import { isTypingTarget } from "../ui/ShortcutSheet";
import { getJson, jamMenit, menitBerjalan, postJson, useTick } from "../../lib/app";
import { durasiSesi, SESI_CAP_MENIT, SLOT_MULAI } from "../../lib/jadwal";
import { durasiPalingPendek } from "../../lib/sesi-mulai";
import { shortcutsOn } from "../../lib/prefs";
import { hotspotMenyala } from "../../lib/server-shared";
import { hariDariTanggal } from "../../lib/jadwal-parser";
import { setModulAkses } from "../shell/AsistenCommands";
import type { Lang } from "../../lib/kelas";
import { useDirektori } from "../../lib/people";
import { modulLabel } from "../../lib/labels";
import type { Strings } from "./strings";
import type { ServerState } from "./data";
import { isOnline, type SesiRunning, type View } from "./types";
import { dengar, useSegar } from "../../lib/siaran";
import TanpaHak, { useBolehJadwal } from "./prep/TanpaHak";
import SlidesDialog, { useSlides } from "../shell/SlidesDialog";
import { MissionClock } from "../shared/Instruments";
import { R } from "./runStrings";

function Pop({
  trigger,
  children,
  open,
  onOpenChange,
  width = 360,
}: {
  trigger: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  width?: number;
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      {trigger}
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="console-pop sweep-edge"
          style={{ width: `min(${width}px, calc(100vw - 24px))` }}
          sideOffset={10}
          collisionPadding={12}
          align="end"
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

type Menu = "ann" | "acc" | "deck";

export default function SessionBar({
  t,
  lang,
  sesi,
  servers,
  onDrawer,
  onEnd,
  onView,
  onChanged,
  onProjector,
  announceOpen,
  setAnnounceOpen,
  track,
  codes,
  onSeelabs,
  onHelp,
  helpWarn,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  servers: ServerState | null;
  onDrawer: () => void;
  onEnd: () => void;
  onView: (v: View) => void;
  onChanged: () => void;
  /** Projector mode on the group I hold; undefined when I hold none. */
  onProjector?: () => void;
  announceOpen: boolean;
  setAnnounceOpen: (o: boolean) => void;
  /** Phase 10 (c12-run): the session track and the session's Asisten codes. */
  track: ReactNode;
  codes: ReactNode;
  onSeelabs: () => void;
  onHelp: () => void;
  /** Something in Ada Masalah? needs a look (its dot turns yellow). */
  helpWarn: boolean;
}) {
  const r = R[lang];
  const now = useTick(20_000);
  const berjalan = menitBerjalan(sesi.mulaiPada, now);
  const durasi = durasiSesi(sesi);
  const sisa = Math.max(0, durasi - berjalan);
  const [pop, setPop] = useState<"ext" | "more" | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const list = servers?.list ?? [];
  const online = list.filter((s) => isOnline(s.denyutTerakhir, s.batasLuringDetik)).length;
  const ap = hotspotMenyala(servers?.detail?.denyutTerakhir?.modeJaringan);
  // Phones reach the hunt at 192.168.4.1 on IRIS_IOT. This laptop stays on
  // campus Wi-Fi, so it uses the Pi's LAN address whenever the Pi still has
  // its campus link (no hotspot, or the router on the cable); only a Pi whose
  // own radio became the hotspot with no uplink answers on 192.168.4.1 alone.
  const lan = servers?.detail?.server.alamatLan;
  const mandiri = servers?.detail?.denyutTerakhir?.modeJaringan === "ap-mandiri";
  const papanSkor =
    servers?.detail && lan && !mandiri ? `http://${lan}:8080/` : "http://192.168.4.1:8080/";
  const buru = sesi.perburuan ?? null;
  const buruJalan = !!buru?.mulai && !buru.selesai;
  const [tanyaBuru, setTanyaBuru] = useState(false);
  const kelas = sesi.kelas ?? "reguler";
  const hari = hariDariTanggal(sesi.tanggal);

  const kendaliRef = useRef(sesi.kendali !== false);
  kendaliRef.current = sesi.kendali !== false;
  // E opens Extend, like the mockup's tooltip says.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!kendaliRef.current) return;
      if (e.key.toLowerCase() !== "e" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!shortcutsOn() || isTypingTarget(e.target) || document.querySelector("[role=dialog]"))
        return;
      e.preventDefault();
      setPop("ext");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // The head is no longer sticky (Phase 10): nothing sits under it.
  useEffect(() => {
    document.documentElement.style.setProperty("--sbar-h", "0px");
  }, []);

  // Off the slot (2026-10-07): watch the session, but leave ending,
  // extending and announcing to the people running it.
  const kendali = sesi.kendali !== false;
  // The slides dialog lives out here, not in the More popover: opening it
  // closes the popover first instead of stacking over it.
  const slides = useSlides(sesi.modul);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const closeMore = () => {
    setPop(null);
    setMenu(null);
  };
  const tools: {
    k: string;
    t: readonly string[];
    act: () => void;
    href?: string;
  }[] = [
    { k: "acc", t: r.tool.acc, act: () => setMenu("acc") },
    { k: "deck", t: r.tool.deck, act: () => setMenu("deck") },
    {
      k: "seelabs",
      t: r.tool.seelabs,
      act: () => {
        closeMore();
        onSeelabs();
      },
    },
    ...(sesi.modul === 4 ? [{ k: "skor", t: r.tool.skor, act: closeMore, href: papanSkor }] : []),
  ];

  return (
    <section
      className="panel panel--key panel--raised shead sbar10"
      aria-label={t.running}
      style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}
      data-urgent={sisa <= 10 ? "yes" : undefined}
    >
      <div className="shead__top">
        <MissionClock mulaiPada={sesi.mulaiPada} durasiMenit={durasi} size={96} lang={lang} />
        <div className="shead__id">
          <span className="shead__badges">
            <Pill tone="ok">
              <span className="dot dot--ok dot--pulse" aria-hidden="true" />
              {r.running}
            </Pill>
            <Pill modul={sesi.modul}>{modulLabel(sesi.modul, lang)}</Pill>
            <Pill tone={kelas === "internasional" ? "violet" : "accent"}>{t.kelas[kelas]}</Pill>
          </span>
          <h1 className="shead__title">{t.modulNama(sesi.modul)}</h1>
          <span className="shead__meta hint">
            {t.hari[hari]} ·{" "}
            {sesi.slot ? `${t.slot(sesi.slot)} · ${SLOT_MULAI[sesi.slot]}` : sesi.mulai}
            {codes}
          </span>
        </div>
        {sesi.kodeMasuk && (
          <div className="shead__kode">
            <KodeMasuk kode={sesi.kodeMasuk} lang={lang} blok />
          </div>
        )}
        <div className="shead__track">{track}</div>
      </div>

      <div className="shead__acts">
        {kendali && sesi.modul === 4 && (
          <button
            type="button"
            className={`btn ${buruJalan ? "btn--secondary" : "btn--primary"}`}
            onClick={() => setTanyaBuru(true)}
          >
            {buruJalan ? (
              <StopCircleIcon size={18} aria-hidden="true" />
            ) : (
              <CrosshairIcon size={18} aria-hidden="true" />
            )}
            {buruJalan ? t.huntStop : t.huntStart}
          </button>
        )}
        {kendali && (
          <Pop
            open={announceOpen}
            onOpenChange={setAnnounceOpen}
            width={400}
            trigger={
              <RadixPopover.Trigger asChild>
                <button type="button" className="btn" aria-pressed={announceOpen}>
                  {r.announce}
                </button>
              </RadixPopover.Trigger>
            }
          >
            <AnnounceForm t={t} lang={lang} sesi={sesi} onDone={() => setAnnounceOpen(false)} />
          </Pop>
        )}
        <Tooltip label={onProjector ? t.projector : t.projectorNone}>
          <button
            type="button"
            className="btn"
            aria-disabled={onProjector ? undefined : true}
            onClick={() =>
              onProjector ? onProjector() : window.Toast?.show(t.projectorNone, "warn")
            }
          >
            {r.projector}
          </button>
        </Tooltip>
        <button type="button" className="srvchip" onClick={onDrawer}>
          <span
            className={`dot ${online > 0 ? "dot--ok" : list.length ? "dot--danger" : "dot--off"}`}
            aria-hidden="true"
          />
          {t.server}
          <span className="hint sbar__srvhint">
            {servers?.detail
              ? ap
                ? t.apStateOn
                : t.apStateOff
              : t.serverChip(online, list.length)}
          </span>
        </button>
        <Pop
          open={pop === "more"}
          onOpenChange={(o) => (o ? setPop("more") : closeMore())}
          width={menu === "acc" || menu === "deck" ? 380 : 440}
          trigger={
            <RadixPopover.Trigger asChild>
              <button type="button" className="btn" aria-pressed={pop === "more"}>
                {r.more}
              </button>
            </RadixPopover.Trigger>
          }
        >
          {menu === "acc" || menu === "deck" ? (
            <div className="stack">
              <button
                type="button"
                className="btn btn--ghost btn--sm sbar__back"
                onClick={() => setMenu(null)}
              >
                <CaretLeftIcon size={16} weight="bold" className="btn__back" aria-hidden="true" />
                {t.back}
              </button>
              {menu === "acc" ? (
                <AccessForm t={t} lang={lang} />
              ) : (
                <DeckForm
                  t={t}
                  lang={lang}
                  modul={sesi.modul}
                  slides={slides}
                  onOpen={() => {
                    closeMore();
                    setSlidesOpen(true);
                  }}
                  onManage={() => {
                    closeMore();
                    onView("prep");
                  }}
                />
              )}
            </div>
          ) : (
            <div className="stack stack--sm">
              <b>{r.tools}</b>
              <div className="moregrid" role="menu">
                {tools.map((x) =>
                  x.href ? (
                    <a
                      key={x.k}
                      role="menuitem"
                      className="moregrid__b sweep-hover"
                      href={x.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={x.act}
                    >
                      <b>
                        {x.t[0]} <ArrowSquareOutIcon size={12} aria-hidden="true" />
                      </b>
                      <span className="hint">{x.t[1]}</span>
                    </a>
                  ) : (
                    <button
                      key={x.k}
                      type="button"
                      role="menuitem"
                      className="moregrid__b sweep-hover"
                      onClick={x.act}
                    >
                      <b>{x.t[0]}</b>
                      <span className="hint">{x.t[1]}</span>
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </Pop>
        <button type="button" className="btn" onClick={onHelp}>
          <span className={`dot ${helpWarn ? "dot--warn" : "dot--ok"}`} aria-hidden="true" />
          {r.help}
        </button>
        <span className="grow" />
        {kendali && (
          <Pop
            open={pop === "ext"}
            onOpenChange={(o) => setPop(o ? "ext" : null)}
            width={340}
            trigger={
              <Tooltip label={`${t.extend} · E`}>
                <RadixPopover.Trigger asChild>
                  <button type="button" className="btn" aria-pressed={pop === "ext"}>
                    {r.extend}
                    <KeyHint k="E" />
                  </button>
                </RadixPopover.Trigger>
              </Tooltip>
            }
          >
            <ExtendForm
              t={t}
              lang={lang}
              sesi={sesi}
              berjalan={berjalan}
              onDone={() => {
                setPop(null);
                onChanged();
              }}
            />
          </Pop>
        )}
        {kendali && (
          <button type="button" className="btn btn--danger" onClick={onEnd}>
            {r.end}
          </button>
        )}
      </div>

      <SlidesDialog
        open={slidesOpen}
        onOpenChange={setSlidesOpen}
        list={slides.list}
        modul={sesi.modul}
        lang={lang}
      />
      <Confirm
        open={tanyaBuru}
        onOpenChange={setTanyaBuru}
        tone={buruJalan ? "danger" : "primary"}
        title={buruJalan ? t.huntStopAsk : t.huntStartAsk}
        body={buruJalan ? t.huntStopBody : t.huntStartBody}
        confirmLabel={buruJalan ? t.huntStop : t.huntStart}
        lang={lang}
        onConfirm={async () => {
          const res = await postJson<{ ok: boolean; kode?: string; diantre?: boolean }>(
            "/api/session/perburuan",
            { langkah: buruJalan ? "selesai" : "mulai" },
          ).catch(() => ({ ok: false, kode: undefined, diantre: undefined }));
          if (!res.ok) {
            window.Toast?.show(t.fail, "danger");
            return false;
          }
          if (res.diantre === false) window.Toast?.show(t.huntNoPi, "warn");
          else window.Toast?.show(buruJalan ? t.huntStopped : t.huntStarted, "ok");
          onChanged();
        }}
      />
    </section>
  );
}

/* ----------------------------------------------------------------- extend */

function ExtendForm({
  t,
  lang,
  sesi,
  berjalan,
  onDone,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  berjalan: number;
  onDone: () => void;
}) {
  const durasi = durasiSesi(sesi);
  const capped = durasi >= SESI_CAP_MENIT;
  const [len, setLen] = useState(durasi);
  const [busy, setBusy] = useState(false);
  const mulai = new Date(sesi.mulaiPada ?? Date.now()).getTime();
  const selesai = jamMenit(new Date(mulai + len * 60_000), lang);

  async function save() {
    setBusy(true);
    const r = await postJson<{ ok: boolean; durasiMenit?: number }>("/api/session/durasi", {
      menit: len,
    }).catch(() => ({ ok: false }) as { ok: boolean; durasiMenit?: number });
    setBusy(false);
    if (!r.ok) return window.Toast?.show(t.fail, "danger");
    window.Toast?.show(t.extendDone(r.durasiMenit ?? len), "ok");
    onDone();
  }

  return (
    <div className="stack">
      <b>{t.extendTitle}</b>
      <Stepper
        value={len}
        onChange={setLen}
        min={durasiPalingPendek(berjalan)}
        max={SESI_CAP_MENIT}
        step={15}
        label={t.extendLen}
        fmt={t.extendMenit}
        lessLabel={t.extendLess}
        moreLabel={t.extendMore}
      />
      <span className="hint">
        {capped && len === durasi ? t.extendCapped : t.extendEnds(selesai)}
      </span>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy || len === durasi}
        onClick={() => void save()}
      >
        {t.extendSave}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- announce */

function AnnounceForm({
  t,
  lang,
  sesi,
  onDone,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  onDone: () => void;
}) {
  const [pesan, setPesan] = useState("");
  const [last, setLast] = useState<{ pesan: string; pada: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Another Asisten's announcement shows here too.
  const segar = useSegar(["sesi"]);
  useEffect(() => {
    getJson<{
      ok: boolean;
      sesi: { pengumuman: string | null; pengumumanPada: string | null } | null;
    }>("/api/session/now")
      .then((d) => {
        if (!d.ok) return;
        setLast(
          d.sesi?.pengumuman && d.sesi.pengumumanPada
            ? { pesan: d.sesi.pengumuman, pada: d.sesi.pengumumanPada }
            : null,
        );
      })
      .catch(() => {});
  }, [sesi.id, segar]);

  async function kirim(text: string) {
    setBusy(true);
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/siarkan", { pesan: text });
      if (!r.ok) throw new Error();
      window.Toast?.show(text ? t.annSent : t.annCleared, "ok");
      setLast(text ? { pesan: text, pada: new Date().toISOString() } : null);
      setPesan("");
      onDone();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (pesan.trim()) void kirim(pesan.trim());
      }}
    >
      <b className="console-pop__title">{t.annTitle}</b>
      <textarea
        className="field__input console-textarea"
        rows={3}
        maxLength={200}
        value={pesan}
        autoFocus
        placeholder={t.annPh}
        onChange={(e) => setPesan(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && pesan.trim()) {
            e.preventDefault();
            void kirim(pesan.trim());
          }
        }}
      />
      <div className="row row--between">
        <span className="hint num">{t.annCount(pesan.length)}</span>
        <span className="hint">{t.annWhere}</span>
      </div>
      <div className="console-preview">
        <span className="label-caps">{t.annPreview}</span>
        <span>{pesan.trim() || t.annEmpty}</span>
      </div>
      {last && (
        <div className="console-last">
          <span className="hint">{t.annLast(jamMenit(last.pada, lang))}</span>
          <span>{last.pesan}</span>
        </div>
      )}
      <div className="row row--end">
        {last && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void kirim("")}
          >
            {t.annClear}
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy || !pesan.trim()}>
          <span className="btn__label">{t.annSend}</span>
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- access */

export function useAkses() {
  const [terbuka, setTerbuka] = useState<number[]>([]);
  // Until the first answer the switches can't say anything true (they used
  // to show every module closed, then flip on; 2026-10-06).
  const [dimuat, setDimuat] = useState(false);
  const [meta, setMeta] = useState<{ diubahOleh: string | null; diubahPada: string | null }>({
    diubahOleh: null,
    diubahPada: null,
  });
  useEffect(() => {
    const load = () =>
      getJson<{ ok: boolean; terbuka: number[]; diubahOleh?: string; diubahPada?: string }>(
        "/api/session/akses?meta=1",
      )
        .then((d) => {
          if (d.ok) {
            setDimuat(true);
            setTerbuka(d.terbuka);
            setMeta({ diubahOleh: d.diubahOleh ?? null, diubahPada: d.diubahPada ?? null });
          }
        })
        .catch(() => {});
    load();
    window.addEventListener("iris:akses-berubah", load);
    // Another Asisten opening or closing a module (live updates).
    const lepas = dengar(["akses"], load);
    return () => {
      window.removeEventListener("iris:akses-berubah", load);
      lepas();
    };
  }, []);
  return { terbuka, setTerbuka, meta, dimuat };
}

export function AccessForm({ t, lang, bare }: { t: Strings; lang: Lang; bare?: boolean }) {
  const dir = useDirektori();
  const { terbuka, setTerbuka, meta, dimuat } = useAkses();
  const boleh = useBolehJadwal();
  const [busy, setBusy] = useState<number | null>(null);
  async function flip(n: number) {
    const open = !terbuka.includes(n);
    setBusy(n);
    setTerbuka((l) => (open ? [...l, n].sort() : l.filter((m) => m !== n)));
    await setModulAkses(n, open, lang);
    setBusy(null);
  }
  return (
    <div className="stack">
      {!bare && <b className="console-pop__title">{t.accTitle}</b>}
      {!boleh && <TanpaHak lang={lang} />}
      <ul className="access-list" aria-busy={!dimuat || undefined}>
        {[1, 2, 3, 4].map((n) => {
          if (!dimuat)
            return <li key={n} className="skeleton" style={{ height: 52, borderRadius: 12 }} />;
          const on = terbuka.includes(n);
          return (
            <li key={n} className="access-row" data-on={on ? "yes" : undefined}>
              <span
                className="access-row__mod"
                style={{ "--mod-hue": `var(--mod-${n})` } as CSSProperties}
              >
                {modulLabel(n, lang)}
              </span>
              <span className="access-row__name">{t.modulNama(n)}</span>
              {on ? (
                <LockSimpleOpenIcon size={16} className="access-row__icon" aria-hidden="true" />
              ) : (
                <LockSimpleIcon size={16} className="access-row__icon" aria-hidden="true" />
              )}
              <Switch
                on={on}
                busy={busy === n}
                disabled={!boleh}
                onChange={() => void flip(n)}
                label={`${t.modul(n)} ${t.modulNama(n)}`}
              />
            </li>
          );
        })}
      </ul>
      <span className="hint">{t.accHint}</span>
      {meta.diubahPada && meta.diubahOleh && (
        <span className="hint faint">
          {t.accBy(dir.nama(meta.diubahOleh), jamMenit(meta.diubahPada, lang))}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ slides */

/** The running module's slides (per module since 2026-10-08): what the
 *  Praktikan see, with Open, and Manage for Preparation › Slides. */
function DeckForm({
  t,
  lang,
  modul,
  slides: { list, loaded },
  onOpen,
  onManage,
}: {
  t: Strings;
  lang: Lang;
  modul: number;
  slides: ReturnType<typeof useSlides>;
  onOpen: () => void;
  onManage: () => void;
}) {
  return (
    <div className="stack">
      <b className="console-pop__title">{t.slidesTitle}</b>
      <span className="hint">{modulLabel(modul, lang)}</span>
      {!loaded ? (
        <span className="skeleton" style={{ height: 48 }} />
      ) : list.length === 0 ? (
        <span className="hint">{t.slidesNone}</span>
      ) : (
        <div className="stack stack--sm">
          {list.map((d) => (
            <div key={d.url} className="deck-row">
              <span className="truncate grow">{d.namaBerkas}</span>
              <span className="pill">{d.jenis === "tautan" ? "Canva" : "PDF"}</span>
            </div>
          ))}
          <button type="button" className="btn btn--secondary" onClick={onOpen}>
            {t.slidesOpen}
          </button>
        </div>
      )}
      <button type="button" className="btn btn--ghost" onClick={onManage}>
        {t.slidesManage}
        <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
      </button>
    </div>
  );
}
