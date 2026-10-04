/**
 * Preparation's Roster tab (Phase 9 Stage 3, mockup c-prep): the groups of
 * one weekly slot (or one Praktikum Susulan draft) on the left, the
 * semester's Praktikan list on the right, side by side from 1280px and as
 * two panes below that.
 *
 * Dragging with the pointer uses @dnd-kit: a lifted copy follows it, the
 * gap opens where it will land and the neighbours slide. The keyboard has
 * its own, simpler model (the mockup's): Space lifts the focused row,
 * Up and Down move it inside its list, Left and Right move it to the
 * previous or next group (the student list sits after the last group),
 * Space drops it and Esc puts it back. Only people
 * without a group can be dragged out of the list; a group that doesn't run
 * takes nobody. Nothing is saved until Save; switching rosters or leaving
 * with changes asks first (the parent holds that guard).
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DotsSixVerticalIcon,
  FileXlsIcon,
  FloppyDiskIcon,
  LinkSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparkleIcon,
  UserPlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import ErrorView from "../../ui/ErrorView";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import SegmentedControl from "../../ui/SegmentedControl";
import { Stepper, Switch } from "../../ui/Controls";
import { getJson, KELOMPOK_NAMA, postJson, sejak } from "../../../lib/app";
import { KELOMPOK_MAKS } from "../../../lib/jadwal";
import { hariLabel, kelasLabel, kelompokLabel } from "../../../lib/labels";
import { useMinWidth } from "../../../lib/hooks";
import type { Kelas, Lang } from "../../../lib/kelas";
import type { Px } from "../prepStrings";
import { AddStudentDialog, ImportXlsxDialog } from "./StudentDialogs";
import KlpMatch from "../seelabs/KlpMatch";
import { SL } from "../seelabs/strings";

/** Who saved a slot roster last, and when (its version). */
interface Versi {
  pada: string;
  nim: string;
  nama: string | null;
  kode: string | null;
}

interface RosterGet {
  ok: boolean;
  versi?: Versi | null;
  jumlahKelompok: number;
  anggotaPerKelompok: number;
  kelompok: { nomor: number; aktif: boolean; klp: string | null }[];
  anggota: { nim: string; nama: string; nomor: number }[];
}

function keGrup(d: RosterGet): Group[] {
  const info = new Map(d.kelompok.map((k) => [k.nomor, k]));
  return Array.from({ length: d.jumlahKelompok }, (_, i) => {
    const n = i + 1;
    return {
      nomor: n,
      aktif: info.get(n)?.aktif ?? true,
      klp: info.get(n)?.klp ?? null,
      members: d.anggota.filter((a) => a.nomor === n).map((a) => ({ nim: a.nim, nama: a.nama })),
    };
  });
}

export type RosterTarget =
  | { jenis: "slot"; hari: number; slot: number; kelas: Kelas }
  | { jenis: "susulan"; sesiId: number };

export interface Praktikan {
  nim: string;
  nama: string;
  kelas: Kelas;
  tempat: { hari: number; slot: number; nomor: number } | null;
}

interface Member {
  nim: string;
  nama: string;
}

interface Group {
  nomor: number;
  aktif: boolean;
  klp: string | null;
  members: Member[];
}

export interface RosterHandle {
  save: () => Promise<boolean>;
}

const POOL = "pool";
const gid = (n: number) => `g${n}`;

function namaGrup(n: number, lang: Lang) {
  return `${kelompokLabel(n, lang)} · ${KELOMPOK_NAMA[n] ?? ""}`;
}

const RosterEditor = forwardRef<
  RosterHandle,
  {
    target: RosterTarget;
    label: string;
    p: Px;
    lang: Lang;
    onDirty: (d: boolean) => void;
  }
>(function RosterEditor({ target, label, p, lang, onDirty }, ref) {
  const wide = useMinWidth(1280);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [per, setPer] = useState(4);
  const [list, setList] = useState<Praktikan[]>([]);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"free" | "all" | "reg" | "intl">("free");
  const [pane, setPane] = useState<"roster" | "pool">("roster");
  const [dirty, setDirty0] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [active, setActive] = useState<Member | null>(null);
  const snap = useRef<Group[] | null>(null);
  // The keyboard lift: who is lifted, and the roster before it was lifted.
  const [kb, setKb] = useState<{ nim: string; before: Group[] } | null>(null);
  const [say, setSay] = useState("");
  // The version this editor loaded; a newer save by someone else stops ours
  // with the 409 view (Bandingkan / Muat Ulang).
  const versi = useRef<string | null>(null);
  const [bentrok, setBentrok] = useState<{ versi: Versi | null; terbaru: RosterGet } | null>(null);
  const [banding, setBanding] = useState(false);

  const setDirty = (d: boolean) => {
    setDirty0(d);
    onDirty(d);
  };

  const key = target.jenis === "slot" ? `${target.hari}-${target.slot}` : `s${target.sesiId}`;

  const loadList = () =>
    getJson<{ ok: boolean; praktikan: Praktikan[] }>("/api/session/praktikan")
      .then((d) => d.ok && setList(d.praktikan))
      .catch(() => {});

  useEffect(() => {
    let alive = true;
    setGroups(null);
    setDirty(false);
    const url =
      target.jenis === "slot"
        ? `/api/session/rosterslot?hari=${target.hari}&slot=${target.slot}`
        : `/api/session/rosterslot?sesiId=${target.sesiId}`;
    setBentrok(null);
    void Promise.all([getJson<RosterGet>(url), loadList()]).then(([d]) => {
      if (!alive || !d.ok) return;
      versi.current = d.versi?.pada ?? null;
      setPer(d.anggotaPerKelompok);
      setGroups(keGrup(d));
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // Leaving the page with unsaved changes asks the browser's own question;
  // switching rosters inside the page asks ours (the parent's dialog).
  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [dirty]);

  const placed = useMemo(
    () => new Set((groups ?? []).flatMap((g) => g.members.map((m) => m.nim))),
    [groups],
  );
  const here = (x: Praktikan) =>
    target.jenis === "slot" &&
    !!x.tempat &&
    x.tempat.hari === target.hari &&
    x.tempat.slot === target.slot;
  // Free: not in a group here, and not seated in another slot (a makeup
  // roster may take anyone).
  const isFree = (x: Praktikan) =>
    !placed.has(x.nim) && (target.jenis === "susulan" || !x.tempat || here(x));
  const free = list.filter(isFree);
  const shown = (f === "free" ? free : list)
    .filter((x) =>
      f === "intl" ? x.kelas === "internasional" : f === "reg" ? x.kelas === "reguler" : true,
    )
    .filter((x) => `${x.nama} ${x.nim}`.toLowerCase().includes(q.trim().toLowerCase()));
  const total = (groups ?? []).reduce((a, g) => a + g.members.length, 0);

  const byNim = useMemo(() => new Map(list.map((x) => [x.nim, x])), [list]);

  const containerOf = (id: string): string | null => {
    if (id === POOL || /^g\d+$/.test(id)) return id;
    const g = groups?.find((x) => x.members.some((m) => m.nim === id));
    if (g) return gid(g.nomor);
    return free.some((x) => x.nim === id) ? POOL : null;
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Keep the focus on the row the keys are moving (moving it, or putting
  // it back with Esc, remounts it, which drops the focus to the page).
  const keep = useRef<string | null>(null);
  useEffect(() => {
    if (!keep.current) return;
    const el = document.querySelector<HTMLElement>(`[data-nim="${keep.current}"]`);
    const lost = !document.activeElement || document.activeElement === document.body;
    if (el && lost) el.focus();
    if (!kb) keep.current = null;
  }, [kb, groups, pane]);

  /** Where `nim` sits now: group number (or 0 for the list) and index. */
  function whereIs(gs: Group[], nim: string): { nomor: number; index: number; size: number } {
    for (const g of gs) {
      const i = g.members.findIndex((m) => m.nim === nim);
      if (i >= 0) return { nomor: g.nomor, index: i, size: g.members.length };
    }
    return { nomor: 0, index: 0, size: 0 };
  }

  function announce(gs: Group[], nim: string) {
    const w = whereIs(gs, nim);
    const nama = byNim.get(nim)?.nama ?? nim;
    setSay(w.nomor ? p.kbAt(nama, namaGrup(w.nomor, lang), w.index + 1, w.size) : p.kbInList(nama));
  }

  function onRowKey(e: KeyboardEvent<HTMLElement>, nim: string) {
    if (!groups || e.target !== e.currentTarget) return;
    if (!kb) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        keep.current = nim;
        setKb({ nim, before: groups });
        setSay(p.kbLifted(byNim.get(nim)?.nama ?? nim));
      }
      return;
    }
    if (kb.nim !== nim) return;
    const x = byNim.get(nim);
    if (!x) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setGroups(kb.before);
      setKb(null);
      setSay(p.kbCancelled(x.nama));
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const was = whereIs(kb.before, nim).nomor;
      const now = whereIs(groups, nim).nomor;
      if (JSON.stringify(kb.before) !== JSON.stringify(groups)) setDirty(true);
      if (now && now !== was) window.Toast?.show(p.movedTo(x.nama, namaGrup(now, lang)), "ok");
      setKb(null);
      setSay(p.kbDropped(x.nama));
      return;
    }
    const w = whereIs(groups, nim);
    let next: Group[] | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!w.nomor) return;
      const to = w.index + (e.key === "ArrowDown" ? 1 : -1);
      if (to < 0 || to >= w.size) return;
      next = groups.map((g) =>
        g.nomor === w.nomor ? { ...g, members: arrayMove(g.members, w.index, to) } : g,
      );
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Zones in order: the running groups, then the student list.
      const zones = [...groups.filter((g) => g.aktif).map((g) => g.nomor), 0];
      const zi = zones.indexOf(w.nomor);
      const nz = zones[zi + (e.key === "ArrowRight" ? 1 : -1)];
      if (nz === undefined) return;
      const without = groups.map((g) => ({
        ...g,
        members: g.members.filter((m) => m.nim !== nim),
      }));
      if (!wide) setPane(nz ? "roster" : "pool");
      next = nz
        ? without.map((g) => {
            if (g.nomor !== nz) return g;
            const members = g.members.slice();
            members.splice(Math.min(w.index, members.length), 0, { nim: x.nim, nama: x.nama });
            return { ...g, members };
          })
        : without;
    } else return;
    e.preventDefault();
    setGroups(next);
    announce(next, nim);
  }

  // Focus leaving for another control (not a remount) puts the row down
  // where it is.
  function onRowBlur(e: FocusEvent<HTMLElement>, nim: string) {
    if (!kb || kb.nim !== nim || !e.relatedTarget) return;
    keep.current = null;
    if (JSON.stringify(kb.before) !== JSON.stringify(groups)) setDirty(true);
    setKb(null);
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const x = byNim.get(id);
    setActive(x ? { nim: x.nim, nama: x.nama } : null);
    snap.current = groups;
  }

  // Moving between lists happens while dragging, so the gap shows where the
  // person will land.
  function onDragOver(e: DragOverEvent) {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || !groups) return;
    const from = containerOf(id);
    const to = containerOf(overId);
    if (!from || !to || from === to) return;
    if (to !== POOL) {
      const g = groups.find((x) => gid(x.nomor) === to);
      if (!g?.aktif) return;
    }
    const x = byNim.get(id);
    if (!x) return;
    setGroups((gs) => {
      if (!gs) return gs;
      let next = gs.map((g) => ({ ...g, members: g.members.filter((m) => m.nim !== id) }));
      if (to !== POOL) {
        next = next.map((g) => {
          if (gid(g.nomor) !== to) return g;
          const at = g.members.findIndex((m) => m.nim === overId);
          const members = g.members.slice();
          members.splice(at < 0 ? members.length : at, 0, { nim: x.nim, nama: x.nama });
          return { ...g, members };
        });
      }
      return next;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActive(null);
    if (!overId || !groups) {
      if (snap.current) setGroups(snap.current);
      return;
    }
    const to = containerOf(overId);
    const fromSnap = snap.current?.find((g) => g.members.some((m) => m.nim === id));
    if (to && to !== POOL) {
      const g = groups.find((x) => gid(x.nomor) === to);
      if (g) {
        const a = g.members.findIndex((m) => m.nim === id);
        const b = g.members.findIndex((m) => m.nim === overId);
        if (a >= 0 && b >= 0 && a !== b) {
          setGroups(
            groups.map((x) => (x === g ? { ...x, members: arrayMove(x.members, a, b) } : x)),
          );
        }
        if (!fromSnap || gid(fromSnap.nomor) !== to) {
          const nama = byNim.get(id)?.nama ?? id;
          window.Toast?.show(p.movedTo(nama, namaGrup(g.nomor, lang)), "ok");
        }
      }
    }
    setDirty(true);
    snap.current = null;
  }

  function onDragCancel() {
    setActive(null);
    if (snap.current) setGroups(snap.current);
    snap.current = null;
  }

  function setCount(n: number) {
    if (!groups) return;
    setDirty(true);
    if (n > groups.length) {
      setGroups([
        ...groups,
        ...Array.from({ length: n - groups.length }, (_, i) => ({
          nomor: groups.length + i + 1,
          aktif: true,
          klp: null,
          members: [],
        })),
      ]);
    } else setGroups(groups.slice(0, n));
  }

  function patchGroup(n: number, patch: Partial<Group>) {
    setGroups((gs) => gs && gs.map((g) => (g.nomor === n ? { ...g, ...patch } : g)));
    setDirty(true);
  }

  function removeFrom(n: number, nim: string) {
    setGroups(
      (gs) =>
        gs &&
        gs.map((g) =>
          g.nomor === n ? { ...g, members: g.members.filter((m) => m.nim !== nim) } : g,
        ),
    );
    setDirty(true);
  }

  function quickAdd(x: Praktikan, nomor?: number) {
    if (!groups) return;
    const g = nomor
      ? groups.find((y) => y.nomor === nomor)
      : groups.find((y) => y.aktif && y.members.length < per);
    if (!g) return window.Toast?.show(p.allFull, "danger");
    patchGroup(g.nomor, { members: [...g.members, { nim: x.nim, nama: x.nama }] });
    window.Toast?.show(p.movedTo(x.nama, namaGrup(g.nomor, lang)), "ok");
  }

  function autoFill() {
    if (!groups) return;
    // Same class as the slot first, then the rest, by name.
    const want = target.jenis === "slot" ? target.kelas : null;
    let rest = [...free].sort(
      (a, b) => Number(b.kelas === want) - Number(a.kelas === want) || a.nama.localeCompare(b.nama),
    );
    setGroups(
      groups.map((g) => {
        const need = g.aktif ? Math.max(0, per - g.members.length) : 0;
        const take = rest.slice(0, need);
        rest = rest.slice(need);
        return {
          ...g,
          members: [...g.members, ...take.map((x) => ({ nim: x.nim, nama: x.nama }))],
        };
      }),
    );
    setDirty(true);
    window.Toast?.show(p.autoFilled, "ok");
  }

  const urlSlot =
    target.jenis === "slot"
      ? `/api/session/rosterslot?hari=${target.hari}&slot=${target.slot}`
      : "";

  /** Drops local changes and shows the newest saved roster. */
  function pakaiTerbaru(d: RosterGet) {
    versi.current = d.versi?.pada ?? null;
    setPer(d.anggotaPerKelompok);
    setGroups(keGrup(d));
    setDirty(false);
    setBentrok(null);
    setBanding(false);
  }

  async function save(paksa = false): Promise<boolean> {
    if (!groups) return false;
    setBusy(true);
    const body = {
      ...(target.jenis === "slot"
        ? {
            hari: target.hari,
            slot: target.slot,
            versi: versi.current,
            ...(paksa ? { paksa } : {}),
          }
        : { sesiId: target.sesiId }),
      jumlahKelompok: groups.length,
      anggotaPerKelompok: per,
      kelompok: groups.map((g) => ({ nomor: g.nomor, aktif: g.aktif, klp: g.klp })),
      anggota: groups.flatMap((g) => g.members.map((m) => ({ nim: m.nim, nomor: g.nomor }))),
    };
    const r = await postJson<{ ok: boolean; kode?: string; versi?: unknown }>(
      "/api/session/rosterslot",
      body,
    ).catch(() => ({ ok: false, kode: "gagal", versi: null }));
    if (!r.ok && r.kode === "versi_berubah" && urlSlot) {
      const terbaru = await getJson<RosterGet>(urlSlot).catch(() => null);
      setBusy(false);
      if (terbaru?.ok) {
        setBentrok({ versi: terbaru.versi ?? null, terbaru });
        return false;
      }
    }
    setBusy(false);
    if (r.ok) {
      if (typeof r.versi === "string") versi.current = r.versi;
      setBentrok(null);
      setBanding(false);
    }
    if (!r.ok) {
      window.Toast?.show(p.errors[r.kode ?? "gagal"] ?? p.errors.gagal, "danger");
      return false;
    }
    setDirty(false);
    window.Toast?.show(target.jenis === "slot" ? p.savedSlot(label) : p.savedDraft, "ok");
    void loadList();
    return true;
  }

  useImperativeHandle(ref, () => ({ save }));

  if (!groups) return <span className="skeleton" style={{ height: 420 }} />;

  const left = (
    <div className="roster">
      <div className="rostertools">
        <div className="field">
          <span className="field__label">{p.groups}</span>
          <Stepper
            value={groups.length}
            onChange={setCount}
            min={1}
            max={KELOMPOK_MAKS}
            label={p.groups}
            lessLabel={p.fewer}
            moreLabel={p.more}
          />
        </div>
        <div className="field">
          <span className="field__label">{p.perGroup}</span>
          <Stepper
            value={per}
            onChange={(v) => {
              setPer(v);
              setDirty(true);
            }}
            min={1}
            max={8}
            label={p.perGroup}
            lessLabel={p.fewer}
            moreLabel={p.more}
          />
        </div>
        <button type="button" className="btn" onClick={autoFill}>
          <SparkleIcon size={18} aria-hidden="true" />
          {p.autoFill}
        </button>
        <button type="button" className="btn" onClick={() => setMatching(true)}>
          <LinkSimpleIcon size={18} aria-hidden="true" />
          {SL[lang].matchBtn}
        </button>
      </div>
      <KlpMatch
        open={matching}
        onOpenChange={setMatching}
        lang={lang}
        groups={groups.map((g) => ({
          nomor: g.nomor,
          nim: g.members.map((m) => m.nim),
          klp: g.klp,
        }))}
        onApply={(peta) => {
          setGroups(
            (gs) =>
              gs && gs.map((g) => (peta.has(g.nomor) ? { ...g, klp: peta.get(g.nomor)! } : g)),
          );
          setDirty(true);
        }}
      />
      <div className="rgrid">
        {groups.map((g) => (
          <GroupCard
            key={g.nomor}
            g={g}
            per={per}
            p={p}
            lang={lang}
            lifted={kb?.nim ?? null}
            onKey={onRowKey}
            onBlur={onRowBlur}
            onToggle={(v) => patchGroup(g.nomor, { aktif: v })}
            onRemove={(nim) => removeFrom(g.nomor, nim)}
          />
        ))}
      </div>
    </div>
  );

  const right = (
    <section className="panel poolcard">
      <div className="panel__head">
        <h3 className="panel__title">{p.poolTitle}</h3>
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn--sm" onClick={() => setImporting(true)}>
            <FileXlsIcon size={16} aria-hidden="true" />
            {p.importXlsx}
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setAdding(true)}
          >
            <UserPlusIcon size={16} aria-hidden="true" />
            {p.add}
          </button>
        </span>
      </div>
      <label className="searchbox pool__search">
        <MagnifyingGlassIcon size={16} aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={p.search}
          aria-label={p.search}
        />
      </label>
      <div className="tabs13" role="tablist" aria-label={p.filterLabel}>
        {(
          [
            ["free", p.fFree],
            ["all", p.fAll],
            ["reg", p.fReg],
            ["intl", p.fIntl],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={f === v} onClick={() => setF(v)}>
            {l}
          </button>
        ))}
      </div>
      <span className="hint">{p.poolCount(list.length, free.length)}</span>
      <PoolList
        rows={shown}
        isFree={isFree}
        here={here}
        p={p}
        lang={lang}
        lifted={kb?.nim ?? null}
        onKey={onRowKey}
        onBlur={onRowBlur}
        onQuick={(x) => quickAdd(x)}
      />
      <span className="hint">{p.dragHint}</span>
    </section>
  );

  return (
    <div className="rostertab">
      <div className="rostertab__bar">
        <span className="row" style={{ gap: 8 }}>
          <Pill tone="accent">{p.inRoster(total)}</Pill>
          {dirty && <Pill tone="warn">{p.notSaved}</Pill>}
        </span>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          <FloppyDiskIcon size={18} aria-hidden="true" />
          {target.jenis === "slot" ? p.saveSlot(label) : p.saveDraft}
        </button>
      </div>
      <span className="visually-hidden" aria-live="assertive">
        {say}
      </span>
      {bentrok && (
        <ErrorView
          code={409}
          lang={lang}
          why={p.clashWhy(
            bentrok.versi?.nama
              ? `${bentrok.versi.nama}${bentrok.versi.kode ? ` (${bentrok.versi.kode})` : ""}`
              : p.someone,
            sejak(bentrok.versi?.pada ?? null, lang),
          )}
          todo={p.clashTodo}
          onCompare={() => setBanding(true)}
          onRetry={() => pakaiTerbaru(bentrok.terbaru)}
        />
      )}
      {bentrok && banding && groups && (
        <Dialog
          open
          onOpenChange={(o) => !o && setBanding(false)}
          title={p.compareTitle}
          description={label}
          size="lg"
          lang={lang}
          actions={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => pakaiTerbaru(bentrok.terbaru)}
              >
                {p.takeLatest}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void save(true)}
              >
                <FloppyDiskIcon size={18} aria-hidden="true" />
                {p.keepMine}
              </button>
            </>
          }
        >
          <Banding
            p={p}
            lang={lang}
            mine={groups}
            latest={keGrup(bentrok.terbaru)}
            who={bentrok.versi?.kode ?? bentrok.versi?.nama ?? p.someone}
          />
        </Dialog>
      )}
      <DndContext
        sensors={sensors}
        accessibility={{
          screenReaderInstructions: { draggable: p.dragHint },
          announcements: {
            onDragStart: ({ active: a }) => p.kbLifted(byNim.get(String(a.id))?.nama ?? ""),
            onDragOver: () => undefined,
            onDragEnd: ({ active: a }) => p.kbDropped(byNim.get(String(a.id))?.nama ?? ""),
            onDragCancel: ({ active: a }) => p.kbCancelled(byNim.get(String(a.id))?.nama ?? ""),
          },
        }}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {wide ? (
          <div className="prepsplit">
            {left}
            {right}
          </div>
        ) : (
          <>
            <SegmentedControl
              fill
              aria-label={p.paneRoster}
              value={pane}
              onValueChange={(v) => setPane(v as "roster" | "pool")}
              options={[
                { value: "roster", label: p.paneRoster },
                { value: "pool", label: p.panePool },
              ]}
            />
            {pane === "roster" ? left : right}
          </>
        )}
        <DragOverlay>
          {active ? (
            <div className="mrow mrow--lifted">
              <DotsSixVerticalIcon size={16} aria-hidden="true" />
              <span className="mono hint">{active.nim}</span>
              <span className="mrow__name">{active.nama}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {adding && (
        <AddStudentDialog
          p={p}
          lang={lang}
          taken={new Set(list.map((x) => x.nim))}
          groups={groups.map((g) => ({ nomor: g.nomor, n: g.members.length, aktif: g.aktif }))}
          onClose={() => setAdding(false)}
          onAdded={async (rows, nomor) => {
            await loadList();
            if (nomor) {
              const g = groups.find((y) => y.nomor === nomor);
              if (g)
                patchGroup(nomor, {
                  members: [...g.members, ...rows.map((r) => ({ nim: r.nim, nama: r.nama }))],
                });
            }
          }}
        />
      )}
      {importing && (
        <ImportXlsxDialog
          p={p}
          lang={lang}
          taken={new Set(list.map((x) => x.nim))}
          onClose={() => setImporting(false)}
          onDone={() => void loadList()}
        />
      )}
    </div>
  );
});

export default RosterEditor;

/* ------------------------------------------------------------- groups */

function GroupCard({
  g,
  per,
  p,
  lang,
  lifted,
  onKey,
  onBlur,
  onToggle,
  onRemove,
}: {
  g: Group;
  per: number;
  p: Px;
  lang: Lang;
  lifted: string | null;
  onKey: (e: KeyboardEvent<HTMLElement>, nim: string) => void;
  onBlur: (e: FocusEvent<HTMLElement>, nim: string) => void;
  onToggle: (v: boolean) => void;
  onRemove: (nim: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: gid(g.nomor), disabled: !g.aktif });
  return (
    <div
      className="rgroup"
      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
      data-off={g.aktif ? undefined : "yes"}
    >
      <div className="rgroup__head">
        <span className="row" style={{ gap: 8 }}>
          <Pill group={g.nomor}>{kelompokLabel(g.nomor, lang)}</Pill>
          <b>{KELOMPOK_NAMA[g.nomor]}</b>
          {g.klp && <span className="pill pill--mono">KLP {g.klp}</span>}
        </span>
        <span className="row" style={{ gap: 8 }}>
          <span className="hint num">
            {g.members.length}/{per}
          </span>
          <Switch
            on={g.aktif}
            onChange={onToggle}
            label={`${p.groupOn}: ${kelompokLabel(g.nomor, lang)}`}
          />
        </span>
      </div>
      <SortableContext
        id={gid(g.nomor)}
        items={g.members.map((m) => m.nim)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="mlist" data-over={isOver ? "yes" : undefined}>
          {g.members.map((m) => (
            <SortRow key={m.nim} id={m.nim} lifted={lifted === m.nim} onKey={onKey} onBlur={onBlur}>
              <span className="mono hint">{m.nim}</span>
              <span className="mrow__name">{m.nama}</span>
              <NoDrag>
                <IconButton icon={XIcon} label={p.removeFrom} sm onClick={() => onRemove(m.nim)} />
              </NoDrag>
            </SortRow>
          ))}
          {g.members.length < per && g.aktif && (
            <div className="mlist__empty">{p.dropHere(per - g.members.length)}</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

/** A button inside a draggable row: its own keys and presses never start a
 *  drag (Space on it presses it, it doesn't lift the row). */
function NoDrag({ children }: { children: ReactNode }) {
  return (
    <span
      className="nodrag"
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  );
}

function SortRow({
  id,
  children,
  lifted,
  onKey,
  onBlur,
}: {
  id: string;
  children: ReactNode;
  lifted: boolean;
  onKey: (e: KeyboardEvent<HTMLElement>, nim: string) => void;
  onBlur: (e: FocusEvent<HTMLElement>, nim: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      className="mrow"
      data-nim={id}
      data-dragging={isDragging ? "yes" : undefined}
      data-lifted={lifted ? "yes" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-pressed={lifted}
      onKeyDown={(e) => onKey(e, id)}
      onBlur={(e) => onBlur(e, id)}
    >
      <DotsSixVerticalIcon size={16} aria-hidden="true" className="mrow__grip" />
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- pool */

function PoolList({
  rows,
  isFree,
  here,
  p,
  lang,
  lifted,
  onKey,
  onBlur,
  onQuick,
}: {
  rows: Praktikan[];
  isFree: (x: Praktikan) => boolean;
  here: (x: Praktikan) => boolean;
  p: Px;
  lang: Lang;
  lifted: string | null;
  onKey: (e: KeyboardEvent<HTMLElement>, nim: string) => void;
  onBlur: (e: FocusEvent<HTMLElement>, nim: string) => void;
  onQuick: (x: Praktikan) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL });
  const freeIds = rows.filter(isFree).map((x) => x.nim);
  return (
    <SortableContext id={POOL} items={freeIds} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className="poollist" data-over={isOver ? "yes" : undefined}>
        {rows.length === 0 && <span className="hint">{p.poolEmpty}</span>}
        {rows.map((x) => {
          const bebas = isFree(x);
          const tail = (
            <>
              <span className="mono hint">{x.nim}</span>
              <span className="mrow__name">{x.nama}</span>
              <Pill tone={x.kelas === "internasional" ? "violet" : undefined}>
                {kelasLabel(x.kelas, lang)}
              </Pill>
              {bebas ? (
                <NoDrag>
                  <IconButton icon={PlusIcon} label={p.quickAdd} sm onClick={() => onQuick(x)} />
                </NoDrag>
              ) : (
                <span className="hint">
                  {x.tempat && !here(x)
                    ? p.inOtherSlot(hariLabel(x.tempat.hari, lang), x.tempat.slot)
                    : p.inGroup}
                </span>
              )}
            </>
          );
          return bebas ? (
            <SortRow key={x.nim} id={x.nim} lifted={lifted === x.nim} onKey={onKey} onBlur={onBlur}>
              {tail}
            </SortRow>
          ) : (
            <div key={x.nim} className="mrow" data-placed="yes">
              <span className="mrow__grip" />
              {tail}
            </div>
          );
        })}
      </div>
    </SortableContext>
  );
}

/** "Bandingkan": both rosters side by side; a name only on one side is marked. */
function Banding({
  p,
  lang,
  mine,
  latest,
  who,
}: {
  p: Px;
  lang: Lang;
  mine: Group[];
  latest: Group[];
  who: string;
}) {
  const where = (gs: Group[]) => {
    const m = new Map<string, number>();
    for (const g of gs) for (const x of g.members) m.set(x.nim, g.nomor);
    return m;
  };
  const wMine = where(mine);
  const wLatest = where(latest);
  const col = (gs: Group[], other: Map<string, number>, title: string) => (
    <div className="stack stack--sm">
      <h3 className="panel__title" style={{ fontSize: "1rem" }}>
        {title}
      </h3>
      {gs.map((g) => (
        <div key={g.nomor} className="rbanding__g">
          <b>{namaGrup(g.nomor, lang)}</b>
          {g.members.length === 0 ? (
            <span className="hint">{p.compareEmpty}</span>
          ) : (
            <ul>
              {g.members.map((x) => (
                <li key={x.nim} data-beda={other.get(x.nim) !== g.nomor ? "yes" : undefined}>
                  {x.nama} <span className="mono hint">{x.nim}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <div className="stack">
      <span className="hint">{p.compareHint}</span>
      <div className="rbanding">
        {col(mine, wLatest, p.mine)}
        {col(latest, wMine, p.latest(who))}
      </div>
    </div>
  );
}
