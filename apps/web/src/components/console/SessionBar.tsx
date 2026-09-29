/**
 * The console's sticky session bar (P8.1): what is running and how far in,
 * plus every "while running" tool as a popover, so none of them needs a
 * tab: Pengumuman, Akses modul (applied at once with Undo), Presentasi, the
 * server chip (opens the drawer), Laporan, and Akhiri.
 *
 * Layout (the "cramped" fix): one row only from 1440px; below that the
 * title and progress share the first row and the tools get a full-width
 * second row with their labels kept, instead of shrinking to bare icons.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Lock, Unlock } from "lucide-react";
import * as RadixPopover from "@radix-ui/react-popover";
import { Switch } from "../ui/Controls";
import { getJson, href, jamMenit, menitBerjalan, postJson, useTick } from "../../lib/app";
import { SESI_CAP_MENIT, SLOT_MULAI } from "../../lib/jadwal";
import { hariDariTanggal } from "../../lib/jadwal-parser";
import { setModulAkses } from "../shell/AsistenCommands";
import type { Lang } from "../../lib/kelas";
import type { Strings } from "./strings";
import type { ServerState } from "./data";
import { isOnline, type SesiRunning, type View } from "./types";

function Tool({
  label,
  badge,
  children,
  open,
  onOpenChange,
  width = 360,
}: {
  label: string;
  badge?: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  width?: number;
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>
        <button type="button" className="sbar__tool">
          <span className="sbar__tool-label">{label}</span>
          {badge}
        </button>
      </RadixPopover.Trigger>
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

export default function SessionBar({
  t,
  lang,
  sesi,
  servers,
  onDrawer,
  onEnd,
  onView,
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
  announceOpen: boolean;
  setAnnounceOpen: (o: boolean) => void;
}) {
  const now = useTick(20_000);
  const berjalan = menitBerjalan(sesi.mulaiPada, now);
  const sisa = Math.max(0, SESI_CAP_MENIT - berjalan);
  const pct = Math.min(100, Math.round((berjalan / SESI_CAP_MENIT) * 100));
  const [pop, setPop] = useState<"acc" | "deck" | null>(null);
  const list = servers?.list ?? [];
  const online = list.filter((s) => isOnline(s.denyutTerakhir, s.batasLuringDetik)).length;
  const ap = servers?.detail?.denyutTerakhir?.modeJaringan === "ap";
  const kelas = sesi.kelas ?? "reguler";
  const hari = hariDariTanggal(sesi.tanggal);
  const ref = useRef<HTMLElement | null>(null);

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

  return (
    <section
      ref={ref}
      className="sbar sweep-edge"
      aria-label={t.running}
      style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}
      data-urgent={sisa <= 10 ? "yes" : undefined}
    >
      <div className="sbar__title">
        <span className="dot dot--ok dot--pulse" aria-hidden="true" />
        <span className="sbar__mod">M{sesi.modul}</span>
        <div className="sbar__names">
          <h1 className="sbar__h">{t.modulNama(sesi.modul)}</h1>
          <span className="sbar__meta">
            {t.hari[hari]} ·{" "}
            {sesi.slot ? `${t.slot(sesi.slot)} · ${SLOT_MULAI[sesi.slot]}` : sesi.mulai}
          </span>
        </div>
        <span className="pill" data-kelas={kelas}>
          {t.kelas[kelas]}
        </span>
      </div>

      <div className="sbar__prog">
        <div className="sbar__prog-row">
          <span className="num">{t.elapsed(berjalan)}</span>
          <span className="num sbar__left">{t.left(sisa)}</span>
        </div>
        <div
          className="meter meter--lg"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ "--meter": pct, "--meter-hue": `var(--mod-${sesi.modul})` } as CSSProperties}
        />
      </div>

      <div className="sbar__tools">
        <Tool label={t.announce} open={announceOpen} onOpenChange={setAnnounceOpen} width={400}>
          <AnnounceForm t={t} lang={lang} sesi={sesi} onDone={() => setAnnounceOpen(false)} />
        </Tool>
        <Tool
          label={t.access}
          open={pop === "acc"}
          onOpenChange={(o) => setPop(o ? "acc" : null)}
          badge={<AccessBadge />}
        >
          <AccessForm t={t} lang={lang} />
        </Tool>
        <Tool
          label={t.slides}
          open={pop === "deck"}
          onOpenChange={(o) => setPop(o ? "deck" : null)}
        >
          <DeckForm
            t={t}
            onManage={() => {
              setPop(null);
              onView("prep");
            }}
          />
        </Tool>
        <button type="button" className="sbar__tool" onClick={onDrawer}>
          <span
            className={`dot ${online > 0 ? "dot--ok" : list.length ? "dot--danger" : "dot--off"}`}
            aria-hidden="true"
          />
          <span className="sbar__tool-label">
            {t.server}{" "}
            {list.length > 0 && <span className="faint">{t.serverChip(online, list.length)}</span>}
            {sesi.butuhAp && <span className="faint"> · {ap ? t.apOn : t.apOff}</span>}
          </span>
        </button>
        {sesi.modul === 4 && (
          <a
            className="sbar__tool"
            href="http://192.168.4.1:8080/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="sbar__tool-label">{t.scoreboard}</span>
          </a>
        )}
        <a className="sbar__tool" href={href(lang, `/reports?sesi=${sesi.id}`)}>
          <span className="sbar__tool-label">{t.report}</span>
        </a>
        <button type="button" className="btn btn--danger sbar__end" onClick={onEnd}>
          <span className="btn__label">{t.end}</span>
        </button>
      </div>
    </section>
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
            setTerbuka(d.terbuka);
            setMeta({ diubahOleh: d.diubahOleh ?? null, diubahPada: d.diubahPada ?? null });
          }
        })
        .catch(() => {});
    load();
    window.addEventListener("iris:akses-berubah", load);
    return () => window.removeEventListener("iris:akses-berubah", load);
  }, []);
  return { terbuka, setTerbuka, meta };
}

function AccessBadge() {
  const { terbuka } = useAkses();
  if (!terbuka.length) return null;
  return <span className="sbar__badge mono">{terbuka.join(" ")}</span>;
}

export function AccessForm({ t, lang, bare }: { t: Strings; lang: Lang; bare?: boolean }) {
  const { terbuka, setTerbuka, meta } = useAkses();
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
      <ul className="access-list">
        {[1, 2, 3, 4].map((n) => {
          const on = terbuka.includes(n);
          return (
            <li key={n} className="access-row" data-on={on ? "yes" : undefined}>
              <span
                className="access-row__mod"
                style={{ "--mod-hue": `var(--mod-${n})` } as CSSProperties}
              >
                M{n}
              </span>
              <span className="access-row__name">{t.modulNama(n)}</span>
              {on ? (
                <Unlock size={16} className="access-row__icon" aria-hidden="true" />
              ) : (
                <Lock size={16} className="access-row__icon" aria-hidden="true" />
              )}
              <Switch
                on={on}
                busy={busy === n}
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
          {t.accBy(meta.diubahOleh, jamMenit(meta.diubahPada, lang))}
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
  const [list, setList] = useState<Deck[] | null>(null);
  const load = () =>
    getJson<{ ok: boolean; daftar: Deck[] }>("/api/presentasi/daftar")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);
  async function pick(d: Deck) {
    try {
      const r = d.aktif
        ? await postJson<{ ok: boolean }>("/api/presentasi/nonaktifkan")
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
