/**
 * The console's sticky session bar (P8.1, redrawn to the Phase 9 mockup
 * c-run): one band under the nav with what is running, the session strip
 * (time, time left, minutes) and the tools on the right.
 *
 * - From 1100px the "while running" tools are icon buttons with tooltips:
 *   Pengumuman, Akses Modul, Presentasi, Lihat Sebagai Praktikan, and the
 *   Module 4 scoreboard. Below 1100 they share one More menu, where a pick
 *   opens its form in the same popover.
 * - Perpanjang (E) keeps its label, then the Server chip (opens the
 *   drawer) and the red Akhiri.
 */
import KodeMasuk from "../shell/KodeMasuk";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  DotsThreeIcon,
  EyeIcon,
  ProjectorScreenIcon,
  FlagCheckeredIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MegaphoneIcon,
  PresentationChartIcon,
  TimerIcon,
  TrophyIcon,
  type Icon as PhIcon,
} from "@phosphor-icons/react";
import * as RadixPopover from "@radix-ui/react-popover";
import { Stepper, Switch } from "../ui/Controls";
import Tooltip from "../ui/Tooltip";
import KeyHint from "../ui/KeyHint";
import Pill from "../ui/Pill";
import { isTypingTarget } from "../ui/ShortcutSheet";
import { getJson, jamMenit, menitBerjalan, postJson, useTick } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import { durasiSesi, SESI_CAP_MENIT, SLOT_MULAI } from "../../lib/jadwal";
import { durasiPalingPendek } from "../../lib/sesi-mulai";
import { shortcutsOn } from "../../lib/prefs";
import { hotspotMenyala } from "../../lib/server-shared";
import { hariDariTanggal } from "../../lib/jadwal-parser";
import { setModulAkses } from "../shell/AsistenCommands";
import SessionStrip from "../shell/SessionStrip";
import type { Lang } from "../../lib/kelas";
import { useDirektori } from "../../lib/people";
import { modulLabel } from "../../lib/labels";
import type { Strings } from "./strings";
import type { ServerState } from "./data";
import { isOnline, type SesiRunning, type View } from "./types";
import { dengar, useSiaran } from "../../lib/siaran";
import TanpaHak, { useBolehJadwal } from "./prep/TanpaHak";

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

/** An icon-only popover trigger with its tooltip. */
function IconTrigger({ icon: I, label, open }: { icon: PhIcon; label: string; open: boolean }) {
  return (
    <Tooltip label={label} side="bottom">
      <RadixPopover.Trigger asChild>
        <button type="button" className="iconbtn" aria-label={label} aria-pressed={open}>
          <I size={20} aria-hidden="true" />
        </button>
      </RadixPopover.Trigger>
    </Tooltip>
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
  onAsPraktikan,
  onProjector,
  announceOpen,
  setAnnounceOpen,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  servers: ServerState | null;
  onDrawer: () => void;
  onEnd: () => void;
  onView: (v: View) => void;
  onChanged: () => void;
  onAsPraktikan: () => void;
  /** Projector mode on the group I hold; undefined when I hold none. */
  onProjector?: () => void;
  announceOpen: boolean;
  setAnnounceOpen: (o: boolean) => void;
}) {
  const now = useTick(20_000);
  const berjalan = menitBerjalan(sesi.mulaiPada, now);
  const durasi = durasiSesi(sesi);
  const sisa = Math.max(0, durasi - berjalan);
  // The five icon tools fold into More below 1280 (was 1100), so the bar
  // stays one row on a laptop (2026-10-06).
  const wide = useMinWidth(1280);
  const [pop, setPop] = useState<Menu | "ext" | "more" | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const list = servers?.list ?? [];
  const online = list.filter((s) => isOnline(s.denyutTerakhir, s.batasLuringDetik)).length;
  const ap = hotspotMenyala(servers?.detail?.denyutTerakhir?.modeJaringan);
  // Phones and the projector reach the hunt at 192.168.4.1 on the hotspot;
  // with the hotspot off, only the Pi's LAN address answers.
  const lan = servers?.detail?.server.alamatLan;
  const papanSkor =
    servers?.detail && !ap && lan ? `http://${lan}:8080/` : "http://192.168.4.1:8080/";
  const kelas = sesi.kelas ?? "reguler";
  const hari = hariDariTanggal(sesi.tanggal);
  const ref = useRef<HTMLElement | null>(null);

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

  // The inspector sticks just below this bar, so publish its height.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const sticky = getComputedStyle(el).position === "sticky";
      document.documentElement.style.setProperty(
        "--sbar-h",
        sticky ? `${el.offsetHeight + 16}px` : "0px",
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const form = (m: Menu) =>
    m === "ann" ? (
      <AnnounceForm t={t} lang={lang} sesi={sesi} onDone={() => setAnnounceOpen(false)} />
    ) : m === "acc" ? (
      <AccessForm t={t} lang={lang} />
    ) : (
      <DeckForm
        t={t}
        onManage={() => {
          setPop(null);
          setMenu(null);
          onView("prep");
        }}
      />
    );

  // Below 1100 the A shortcut (announceOpen) opens the More menu on its form.
  const moreOpen = pop === "more" || (!wide && announceOpen);
  const moreView: Menu | null = !wide && announceOpen ? "ann" : menu;
  const closeMore = () => {
    setPop(null);
    setMenu(null);
    setAnnounceOpen(false);
  };
  // Off the slot (2026-10-07): watch the session, but leave ending,
  // extending and announcing to the people running it.
  const kendali = sesi.kendali !== false;
  const tools: { k: Menu | "see" | "proj" | "skor"; icon: PhIcon; label: string }[] = [
    ...(kendali ? [{ k: "ann" as const, icon: MegaphoneIcon, label: t.announce }] : []),
    { k: "acc", icon: LockSimpleOpenIcon, label: t.access },
    { k: "deck", icon: PresentationChartIcon, label: t.slides },
    { k: "see", icon: EyeIcon, label: t.viewAs },
    { k: "proj", icon: ProjectorScreenIcon, label: t.projector },
    ...(sesi.modul === 4 ? [{ k: "skor" as const, icon: TrophyIcon, label: t.scoreboard }] : []),
  ];

  return (
    <section
      ref={ref}
      className="sbar"
      aria-label={t.running}
      style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}
      data-urgent={sisa <= 10 ? "yes" : undefined}
    >
      <div className="sbar__title">
        <span className="dot dot--ok dot--pulse" aria-hidden="true" />
        <div className="sbar__names">
          <span className="sbar__line">
            <Pill modul={sesi.modul}>{modulLabel(sesi.modul, lang)}</Pill>
            <h1 className="sbar__h">{t.modulNama(sesi.modul)}</h1>
            <Pill tone={kelas === "internasional" ? "violet" : "accent"}>{t.kelas[kelas]}</Pill>
          </span>
          <span className="sbar__meta">
            {t.hari[hari]} ·{" "}
            {sesi.slot ? `${t.slot(sesi.slot)} · ${SLOT_MULAI[sesi.slot]}` : sesi.mulai}
            {/* Here, not among the tools: there it pushed Perpanjang and
                Akhiri onto a second row. */}
            {sesi.kodeMasuk && <KodeMasuk kode={sesi.kodeMasuk} lang={lang} kecil />}
          </span>
        </div>
      </div>

      <div className="sbar__prog">
        <SessionStrip
          lang={lang}
          mulaiPada={sesi.mulaiPada}
          durasi={durasi}
          hue={`var(--mod-${sesi.modul})`}
        />
      </div>

      <div className="sbar__tools">
        {wide ? (
          <>
            {kendali && (
              <Pop
                open={announceOpen}
                onOpenChange={setAnnounceOpen}
                width={400}
                trigger={
                  <IconTrigger icon={MegaphoneIcon} label={t.announce} open={announceOpen} />
                }
              >
                {form("ann")}
              </Pop>
            )}
            <Pop
              open={pop === "acc"}
              onOpenChange={(o) => setPop(o ? "acc" : null)}
              trigger={
                <IconTrigger icon={LockSimpleOpenIcon} label={t.access} open={pop === "acc"} />
              }
            >
              {form("acc")}
            </Pop>
            <Pop
              open={pop === "deck"}
              onOpenChange={(o) => setPop(o ? "deck" : null)}
              trigger={
                <IconTrigger icon={PresentationChartIcon} label={t.slides} open={pop === "deck"} />
              }
            >
              {form("deck")}
            </Pop>
            <Tooltip label={t.viewAs} side="bottom">
              <button
                type="button"
                className="iconbtn"
                aria-label={t.viewAs}
                onClick={onAsPraktikan}
              >
                <EyeIcon size={20} aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip label={onProjector ? t.projector : t.projectorNone} side="bottom">
              <button
                type="button"
                className="iconbtn"
                aria-label={t.projector}
                aria-disabled={onProjector ? undefined : true}
                onClick={() => onProjector?.()}
              >
                <ProjectorScreenIcon size={20} aria-hidden="true" />
              </button>
            </Tooltip>
            {sesi.modul === 4 && (
              <Tooltip label={t.scoreboard} side="bottom">
                <a
                  className="iconbtn"
                  href={papanSkor}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.scoreboard}
                >
                  <TrophyIcon size={20} aria-hidden="true" />
                </a>
              </Tooltip>
            )}
          </>
        ) : (
          <Pop
            open={moreOpen}
            onOpenChange={(o) => (o ? setPop("more") : closeMore())}
            width={moreView === "ann" ? 400 : 320}
            trigger={<IconTrigger icon={DotsThreeIcon} label={t.more} open={moreOpen} />}
          >
            {moreView ? (
              <div className="stack">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm sbar__back"
                  onClick={() => {
                    setMenu(null);
                    setAnnounceOpen(false);
                    setPop("more");
                  }}
                >
                  <ArrowLeftIcon size={16} aria-hidden="true" />
                  {t.back}
                </button>
                {form(moreView)}
              </div>
            ) : (
              <div className="stack stack--sm">
                <b>{t.more}</b>
                <div className="menu" role="menu">
                  {tools.map((x) =>
                    x.k === "skor" ? (
                      <a
                        key={x.k}
                        role="menuitem"
                        className="menu__i"
                        href={papanSkor}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={closeMore}
                      >
                        <x.icon size={18} aria-hidden="true" />
                        {x.label}
                        <ArrowSquareOutIcon size={14} aria-hidden="true" className="menu__end" />
                      </a>
                    ) : (
                      <button
                        key={x.k}
                        type="button"
                        role="menuitem"
                        className="menu__i"
                        onClick={() => {
                          if (x.k === "see") {
                            closeMore();
                            onAsPraktikan();
                          } else if (x.k === "proj") {
                            closeMore();
                            if (onProjector) onProjector();
                            else window.Toast?.show(t.projectorNone, "warn");
                          } else if (x.k !== "skor") setMenu(x.k);
                        }}
                      >
                        <x.icon size={18} aria-hidden="true" />
                        {x.label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          </Pop>
        )}

        {kendali && (
          <Pop
            open={pop === "ext"}
            onOpenChange={(o) => setPop(o ? "ext" : null)}
            width={340}
            trigger={
              <Tooltip label={`${t.extend} · E`} side="bottom">
                <RadixPopover.Trigger asChild>
                  <button
                    type="button"
                    className="btn sbar__btn sbar__ext"
                    aria-pressed={pop === "ext"}
                    aria-label={t.extend}
                  >
                    <TimerIcon size={18} aria-hidden="true" />
                    <span className="sbar__lbl">{t.extend}</span>
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
        {kendali && (
          <button type="button" className="btn btn--danger sbar__btn" onClick={onEnd}>
            <FlagCheckeredIcon size={18} aria-hidden="true" />
            {t.endShort}
          </button>
        )}
      </div>
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
  useEffect(() => {
    getJson<{
      ok: boolean;
      sesi: { pengumuman: string | null; pengumumanPada: string | null } | null;
    }>("/api/session/now")
      .then((d) => {
        if (d.sesi?.pengumuman && d.sesi.pengumumanPada)
          setLast({ pesan: d.sesi.pengumuman, pada: d.sesi.pengumumanPada });
      })
      .catch(() => {});
  }, [sesi.id]);

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

interface Deck {
  id: number;
  namaBerkas: string;
  aktif: boolean;
}

function DeckForm({ t, onManage }: { t: Strings; onManage: () => void }) {
  const boleh = useBolehJadwal();
  const [list, setList] = useState<Deck[] | null>(null);
  const load = () =>
    getJson<{ ok: boolean; daftar: Deck[] }>("/api/presentasi/daftar")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);
  useSiaran(["presentasi"], load);
  async function pick(d: Deck) {
    try {
      const r = d.aktif
        ? await postJson<{ ok: boolean }>("/api/presentasi/nonaktifkan", { id: d.id })
        : await postJson<{ ok: boolean }>("/api/presentasi/aktifkan", { id: d.id });
      window.Toast?.show(d.aktif ? t.slidesOff : t.slidesSwitched, r.ok ? "ok" : "danger");
      await load();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }
  return (
    <div className="stack">
      <b className="console-pop__title">{t.slidesTitle}</b>
      {list === null ? (
        <span className="skeleton" style={{ height: 48 }} />
      ) : list.length === 0 ? (
        <span className="hint">{t.emptyLib}</span>
      ) : (
        <div className="stack stack--sm">
          {list.map((d) => (
            <button
              key={d.id}
              type="button"
              className="deck-row"
              aria-pressed={d.aktif}
              disabled={!boleh}
              onClick={() => void pick(d)}
            >
              <span className="truncate grow">{d.namaBerkas}</span>
              {d.aktif && <span className="pill pill--ok">{t.activeBadge}</span>}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn btn--ghost" onClick={onManage}>
        {t.slidesManage}
      </button>
    </div>
  );
}
