/**
 * Preparation while a session runs (Phase 9, mockup c-run › Persiapan):
 *
 * - Teaching This Slot: everyone on the slot today (regular, substitute,
 *   volunteer, excused), the groups they hold, and when they turned up,
 *   with their Mangkir status (lib/mangkir.ts: Tepat Waktu, Mangkir/Ngajar,
 *   Mangkir), which anyone teaching the session can correct by hand.
 *   A volunteer's offer is accepted or declined here; anyone missing can be
 *   marked present.
 * - The attendance line, with Module Access and Slides (the full
 *   Preparation tabs).
 * - One card per group: its assistant (the same picker and reason dialog
 *   as the roster tab) and its members with their sign-in time, or Mark
 *   Here. A member is dragged to another group, or moved with Left and
 *   Right on the keyboard; they sign in again and land there.
 *
 * Data: GET /api/session/hadir every 10 s (api/_lib/sesi-hadir.ts).
 */
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import DragLayer from "../ui/DragLayer";
import {
  CheckIcon,
  DotsSixVerticalIcon,
  DotsThreeVerticalIcon,
  HandHeartIcon,
  LockSimpleOpenIcon,
  PresentationChartIcon,
  UserIcon,
  UserSwitchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import IconButton from "../ui/IconButton";
import Popover from "../ui/Popover";
import { TELAT_MENIT, type StatusHadir, type StatusHadirLive } from "../../lib/mangkir";
import { getJson, jamMenit, namaKelompok, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { kelompokLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import { AssistantPicker, usePairing } from "./PrepView";
import type { Penugasan, SesiRunning } from "./types";

type Jenis = "tetap" | "pengganti" | "sukarela" | "izin";

interface Mengajar {
  nim: string;
  kode: string;
  nama: string;
  jenis: Jenis;
  pegang: number[];
  hadirPada: string | null;
  alasan?: string | null;
  tugasId?: number;
  status?: "diminta" | "diterima" | "ditolak";
  /** Mangkir: only for the slot's own Asisten and substitutes. */
  kehadiran?: {
    status: StatusHadirLive;
    telatMenit: number | null;
    otomatis: boolean;
    oleh: string | null;
  } | null;
}

const HADIR_TONE: Record<StatusHadirLive, "ok" | "warn" | "danger" | undefined> = {
  tepat: "ok",
  mangkir_ngajar: "warn",
  mangkir: "danger",
  belum: undefined,
  lewat: "danger",
};

interface Anggota {
  nim: string;
  nama: string;
  masukPada: string | null;
  manual: boolean;
}

interface Kelompok {
  id: number;
  nomor: number;
  nama: string;
  aktif: boolean;
  anggota: Anggota[];
}

interface Hadir {
  ok: boolean;
  kode?: string;
  /** The session's scheduled start, for the on-time deadline. */
  mulai?: string;
  mengajar: Mengajar[];
  kelompok: Kelompok[];
}

const KIND: Record<Jenis, { tone?: string; icon: typeof UserIcon }> = {
  tetap: { icon: UserIcon },
  pengganti: { tone: "warn", icon: UserSwitchIcon },
  sukarela: { tone: "violet", icon: HandHeartIcon },
  izin: { tone: "danger", icon: XCircleIcon },
};

export default function LivePrep({
  t,
  lang,
  sesi,
  assign,
  meNim,
  onChanged,
  onOpen,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  assign: Penugasan | null;
  meNim: string;
  onChanged: () => void;
  /** Opens one of the full Preparation tabs. */
  onOpen: (tab: "akses" | "slides") => void;
}) {
  const l = t.lp;
  const poll = usePoll(() => getJson<Hadir>("/api/session/hadir"), 10_000, true, [
    "sesi",
    "roster",
  ]);
  const data = poll.data?.ok ? poll.data : null;
  const pair = usePairing({
    t,
    lang,
    sesi,
    assign,
    meNim,
    onChanged: () => {
      onChanged();
      poll.refresh();
    },
  });
  const [drag, setDrag] = useState<Anggota | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function kirim(body: Record<string, unknown>, ok: string) {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/hadir", body);
      if (!r.ok) return window.Toast?.show(pesan(t, r.kode), "danger");
      window.Toast?.show(ok, "ok");
      poll.refresh();
      onChanged();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  async function jawab(m: Mengajar, terima: boolean) {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/penugasan", {
        aksi: "konfirmasi",
        id: m.tugasId,
        terima,
      });
      if (!r.ok) return window.Toast?.show(pesan(t, r.kode), "danger");
      window.Toast?.show(terima ? l.accepted(m.kode) : l.declined, terima ? "ok" : undefined);
      poll.refresh();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  const groups = data?.kelompok ?? [];
  const nomorOf = new Map<string, number>();
  for (const g of groups) for (const m of g.anggota) nomorOf.set(m.nim, g.nomor);
  const semua = groups.flatMap((g) => g.anggota);
  const hadir = semua.filter((m) => m.masukPada).length;

  const pindah = (m: Anggota, ke: number) => {
    const g = groups.find((x) => x.nomor === ke);
    if (!g || !g.aktif || nomorOf.get(m.nim) === ke) return;
    void kirim({ aksi: "pindah", nim: m.nim, ke }, l.moved(m.nama, ke));
  };

  function onDragStart(e: DragStartEvent) {
    setDrag(semua.find((m) => m.nim === e.active.id) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDrag(null);
    const m = semua.find((x) => x.nim === e.active.id);
    const ke = e.over ? Number(String(e.over.id).slice(2)) : NaN;
    if (m && Number.isInteger(ke)) pindah(m, ke);
  }
  function onKey(e: KeyboardEvent<HTMLElement>, m: Anggota) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const urut = groups.filter((g) => g.aktif).map((g) => g.nomor);
    const i = urut.indexOf(nomorOf.get(m.nim) ?? 0);
    const ke = urut[i + (e.key === "ArrowLeft" ? -1 : 1)];
    if (ke) pindah(m, ke);
  }

  const mengajar = data?.mengajar ?? [];

  return (
    <div className="stack liveprep">
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">{l.teach}</h2>
          <span className="hint">{l.teachHint}</span>
        </div>
        {!data ? (
          <span className="skeleton" style={{ height: 120 }} />
        ) : mengajar.length === 0 ? (
          <p className="hint">{t.noSchedule}</p>
        ) : (
          <div className="teachrows">
            {mengajar.map((m) => {
              const k = KIND[m.jenis];
              const Ic = k.icon;
              const menunggu = m.jenis === "sukarela" && m.status === "diminta";
              return (
                <div key={m.nim} className="teachrow" data-wait={menunggu ? "yes" : undefined}>
                  <span className={`pill${k.tone ? ` pill--${k.tone}` : ""}`}>
                    <Ic size={14} aria-hidden="true" />
                    {l.kind[m.jenis]}
                  </span>
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <b>
                      {m.nama} ({m.kode})
                    </b>
                    <span className="hint">
                      {m.jenis === "izin"
                        ? l.izin(m.alasan ?? null)
                        : menunggu
                          ? l.offer
                          : m.pegang.length
                            ? l.holds(m.pegang)
                            : l.noGroup}
                    </span>
                  </span>
                  {menunggu ? (
                    <>
                      <span className="pill pill--warn">{l.pending}</span>
                      <span className="row teachrow__act">
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          onClick={() => void jawab(m, false)}
                        >
                          {l.decline}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          onClick={() => void jawab(m, true)}
                        >
                          <CheckIcon aria-hidden="true" />
                          {l.accept}
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="stack teachrow__hadir">
                        {m.kehadiran && (
                          <Pill tone={HADIR_TONE[m.kehadiran.status]}>
                            {l.hadir[m.kehadiran.status]}
                          </Pill>
                        )}
                        <span className="hint num">
                          {[
                            m.hadirPada ? l.here(jamMenit(m.hadirPada)) : l.absent,
                            m.kehadiran?.telatMenit ? l.telat(m.kehadiran.telatMenit) : null,
                            m.kehadiran && !m.kehadiran.otomatis ? l.byHand : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="row teachrow__act">
                        {!m.hadirPada && m.jenis !== "izin" && (
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            onClick={() =>
                              void kirim({ aksi: "asisten", nim: m.nim }, l.marked(m.nama))
                            }
                          >
                            {l.mark}
                          </button>
                        )}
                        {m.kehadiran && (
                          <SetHadir
                            l={l}
                            m={m}
                            mulai={data.mulai ?? ""}
                            onSet={(status) =>
                              void kirim(
                                { aksi: "kehadiran", nim: m.nim, status },
                                l.hadirSet(m.nama),
                              )
                            }
                          />
                        )}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="liveprep__bar">
        <span className="pill pill--ok">{l.count(hadir, semua.length)}</span>
        <span className="hint grow">{l.countHint}</span>
        <button type="button" className="btn btn--sm" onClick={() => onOpen("akses")}>
          <LockSimpleOpenIcon aria-hidden="true" />
          {l.access}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onOpen("slides")}>
          <PresentationChartIcon aria-hidden="true" />
          {l.slides}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <div className="livegrid">
          {!data
            ? [1, 2, 3].map((i) => <span key={i} className="skeleton" style={{ height: 220 }} />)
            : groups.map((g) => {
                const nim = pair.byGroup.get(g.id) ?? null;
                const a = nim ? (assign?.asisten.find((x) => x.nim === nim) ?? null) : null;
                // The first pairing this session, when it has changed since.
                const awal = pair.awalOf(g.id);
                const awalKode = awal && awal !== nim ? pair.byNim.get(awal)?.kode : null;
                return (
                  <GroupDrop key={g.id} g={g}>
                    <div className="rgroup__head">
                      <span className="row" style={{ gap: 8 }}>
                        <Pill group={g.nomor}>{kelompokLabel(g.nomor, lang)}</Pill>
                        <b>{namaKelompok(g.nomor, g.nama)}</b>
                      </span>
                      <span className="hint num">
                        {g.anggota.filter((m) => m.masukPada).length}/{g.anggota.length}
                      </span>
                    </div>
                    <div className="pairrow">
                      <span className="field__label">{l.asisten}</span>
                      <AssistantPicker
                        t={t}
                        value={a}
                        me={meNim}
                        assign={assign}
                        slotIndex={g.nomor - 1}
                        onPick={(x) => pair.pick(g, x)}
                      />
                      {awalKode && <span className="hint">{l.awal(awalKode)}</span>}
                    </div>
                    <div className="mlist">
                      {g.anggota.map((m) => (
                        <MemberRow
                          key={m.nim}
                          m={m}
                          t={t}
                          onKey={onKey}
                          onMark={() =>
                            void kirim({ aksi: "praktikan", nim: m.nim }, l.marked(m.nama))
                          }
                        />
                      ))}
                      {g.anggota.length === 0 && <div className="mlist__empty">{l.empty}</div>}
                    </div>
                  </GroupDrop>
                );
              })}
        </div>
        <DragLayer>
          {drag && (
            <div className="mrow" data-lifted="yes">
              <DotsSixVerticalIcon size={16} aria-hidden="true" className="mrow__grip" />
              <span className="mrow__name">{drag.nama}</span>
            </div>
          )}
        </DragLayer>
      </DndContext>
      {pair.dialog}
    </div>
  );
}

function GroupDrop({ g, children }: { g: Kelompok; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `g-${g.nomor}`, disabled: !g.aktif });
  return (
    <section
      ref={setNodeRef}
      className="rgroup"
      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
      data-off={g.aktif ? undefined : "yes"}
      data-over={isOver ? "yes" : undefined}
    >
      {children}
    </section>
  );
}

function MemberRow({
  m,
  t,
  onKey,
  onMark,
}: {
  m: Anggota;
  t: Strings;
  onKey: (e: KeyboardEvent<HTMLElement>, m: Anggota) => void;
  onMark: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: m.nim });
  return (
    <div
      ref={setNodeRef}
      className="mrow"
      data-dragging={isDragging ? "yes" : undefined}
      {...attributes}
      {...listeners}
      aria-description={t.lp.rowHint}
      onKeyDown={(e) => onKey(e, m)}
    >
      <DotsSixVerticalIcon size={16} aria-hidden="true" className="mrow__grip" />
      <span className="mrow__name">{m.nama}</span>
      {m.masukPada ? (
        <span className="pill pill--ok num">{jamMenit(m.masukPada)}</span>
      ) : (
        <span
          className="nodrag"
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" className="btn btn--sm btn--ghost" onClick={onMark}>
            {t.lp.mark}
          </button>
        </span>
      )}
    </div>
  );
}

/** Correcting someone's Mangkir status: the three statuses, or back to the
 *  clock. Each change is in Audit. */
function SetHadir({
  l,
  m,
  mulai,
  onSet,
}: {
  l: Strings["lp"];
  m: Mengajar;
  mulai: string;
  onSet: (status: StatusHadir | "otomatis") => void;
}) {
  const [open, setOpen] = useState(false);
  const pilih = (s: StatusHadir | "otomatis") => {
    setOpen(false);
    onSet(s);
  };
  const now = m.kehadiran?.otomatis === false ? m.kehadiran.status : null;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <IconButton
          icon={DotsThreeVerticalIcon}
          label={l.hadirTitle(m.nama)}
          sm
          kind="ghost"
          onClick={() => setOpen((v) => !v)}
        />
      }
    >
      <div className="stack sethadir">
        <strong>{l.hadirTitle(m.nama)}</strong>
        <span className="hint">{l.hadirRule(mulai, TELAT_MENIT)}</span>
        {(["tepat", "mangkir_ngajar", "mangkir"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`btn btn--sm${now === s ? " btn--primary" : ""}`}
            onClick={() => pilih(s)}
          >
            {l.hadir[s]}
          </button>
        ))}
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          disabled={m.kehadiran?.otomatis !== false}
          onClick={() => pilih("otomatis")}
        >
          {l.hadirAuto}
        </button>
      </div>
    </Popover>
  );
}
