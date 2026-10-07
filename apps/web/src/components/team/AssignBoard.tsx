/**
 * Tim › Penugasan Slot (Phase 9 Stage 4, mockup t-assign): who teaches
 * each slot on its next date, at the level of people.
 *
 * - Permintaan: open izin (with whether someone covers) and Sukarela offers
 *   waiting for an answer, with Terima and Tolak.
 * - The Asisten list on the left: drag someone into a slot and they join it
 *   that date as a Pengganti (without a group; the slot seats them). People
 *   on leave or inactive can't be dragged.
 * - Each slot: its status (tap to cycle Aktif, Segera, Libur, Tidak Ada
 *   Praktikum) and its people. Tap a badge to switch Tetap and Izin, or
 *   Pengganti and Sukarela; a cover can be removed. "Ada yang izin" turns
 *   the slot amber until every group has someone.
 *
 * Save writes the same data the Schedule shows (POST /api/session/schedule
 * with the date's seats), so both pages always agree. Without the Schedule
 * right the board is read only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import DragLayer from "../ui/DragLayer";
import {
  CheckIcon,
  DotsSixVerticalIcon,
  FloppyDiskIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import { dict, getJson, postJson, tanggalPanjang } from "../../lib/app";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariLabel, statusOrangLabel, slotLabel } from "../../lib/labels";
import { pasanganSemester, type MingguSlot, type TugasInfo } from "../../lib/penugasan-minggu";
import type { Lang } from "../../lib/kelas";
import type { DataJadwal, JadwalRow } from "../schedule/types";
import { useSiaran } from "../../lib/siaran";
import { useBelumSimpan } from "../../lib/belum-simpan";

export const A = dict({
  id: {
    tabs: { orang: "Orang", penugasan: "Penugasan Slot" },
    tabsLabel: "Bagian Tim",
    save: "Simpan",
    saved: (n: number) => `${n} slot disimpan. Jadwal ikut berubah.`,
    fail: "Gagal menyimpan. Coba lagi.",
    viewOnly: "Hanya Pengelola dan Admin yang bisa mengubah penugasan.",
    reqTitle: "Permintaan",
    reqNone: "Tidak ada permintaan.",
    izinLine: (when: string) => `Izin · ${when}`,
    covered: (who: string) => `Ditutup ${who}`,
    looking: "Mencari pengganti",
    open: "Belum ada pengganti",
    offerLine: (when: string) => `Menawarkan bantuan · ${when}`,
    pending: "Menunggu",
    accept: "Terima",
    decline: "Tolak",
    accepted: "Diterima.",
    declined: "Ditolak.",
    poolTitle: "Asisten",
    poolHint: "Seret ke slot. Yang cuti atau nonaktif tidak bisa diseret.",
    slotsNone: "Belum ada slot yang berjalan di semester ini.",
    statusTip: "Ketuk untuk mengganti status slot",
    status: { aktif: "Aktif", segera: "Segera", libur: "Libur", kosong: "Tidak Ada Praktikum" },
    kinds: { tetap: "Tetap", pengganti: "Pengganti", sukarela: "Sukarela", izin: "Izin" },
    kindTip: "Ketuk untuk mengganti: Tetap dan Izin, atau Pengganti dan Sukarela",
    remove: (k: string) => `Keluarkan ${k}`,
    need: "Ada yang izin, butuh pengganti",
    already: (k: string) => `${k} sudah ada di slot ini.`,
    added: (k: string, when: string) => `${k} masuk ${when}.`,
    srHint: "Tekan Spasi untuk mengangkat, panah untuk memilih slot, Spasi lagi untuk menaruh.",
  },
  en: {
    tabs: { orang: "People", penugasan: "Slot Assignment" },
    tabsLabel: "Team sections",
    save: "Save",
    saved: (n: number) =>
      n === 1 ? "1 slot saved. The Schedule follows." : `${n} slots saved. The Schedule follows.`,
    fail: "Couldn't save. Try again.",
    viewOnly: "Only Managers and Admins can change assignments.",
    reqTitle: "Requests",
    reqNone: "No requests.",
    izinLine: (when: string) => `Excused · ${when}`,
    covered: (who: string) => `Covered by ${who}`,
    looking: "Looking for cover",
    open: "No cover yet",
    offerLine: (when: string) => `Offers to help · ${when}`,
    pending: "Pending",
    accept: "Accept",
    decline: "Decline",
    accepted: "Accepted.",
    declined: "Declined.",
    poolTitle: "Assistants",
    poolHint: "Drag into a slot. People on leave or inactive can't be dragged.",
    slotsNone: "No running slots in this semester yet.",
    statusTip: "Tap to change the slot status",
    status: { aktif: "Active", segera: "Soon", libur: "Holiday", kosong: "No Practicum" },
    kinds: { tetap: "Regular", pengganti: "Substitute", sukarela: "Volunteer", izin: "Excused" },
    kindTip: "Tap to switch: Regular and Excused, or Substitute and Volunteer",
    remove: (k: string) => `Remove ${k}`,
    need: "Someone is excused, needs cover",
    already: (k: string) => `${k} is already in this slot.`,
    added: (k: string, when: string) => `${k} added to ${when}.`,
    srHint: "Press Space to pick up, arrow keys to choose a slot, Space again to drop.",
  },
  zh: {
    tabs: { orang: "成员", penugasan: "时段安排" },
    tabsLabel: "团队分区",
    save: "保存",
    saved: (n: number) => `已保存 ${n} 个时段。课表跟着更新。`,
    fail: "保存失败。再试一次。",
    viewOnly: "只有主管和管理员能改安排。",
    reqTitle: "请求",
    reqNone: "没有请求。",
    izinLine: (when: string) => `请假 · ${when}`,
    covered: (who: string) => `由 ${who} 代课`,
    looking: "正在找代课",
    open: "还没有人代课",
    offerLine: (when: string) => `想来帮忙 · ${when}`,
    pending: "等待中",
    accept: "接受",
    decline: "拒绝",
    accepted: "已接受。",
    declined: "已拒绝。",
    poolTitle: "助教",
    poolHint: "拖到时段里。请假或停用的人不能拖。",
    slotsNone: "这个学期还没有上课的时段。",
    statusTip: "点一下切换时段状态",
    status: { aktif: "进行中", segera: "即将开始", libur: "放假", kosong: "无实验课" },
    kinds: { tetap: "固定", pengganti: "代课", sukarela: "志愿", izin: "请假" },
    kindTip: "点一下切换：固定和请假，或者代课和志愿",
    remove: (k: string) => `移出 ${k}`,
    need: "有人请假，需要代课",
    already: (k: string) => `${k} 已经在这个时段了。`,
    added: (k: string, when: string) => `${k} 已加入${when}。`,
    srHint: "按空格键拿起，方向键选时段，再按空格放下。",
  },
});

type Status = "aktif" | "segera" | "libur" | "kosong";
type Kind = "tetap" | "izin" | "pengganti" | "sukarela";
interface Chip {
  kode: string;
  kind: Kind;
  /** The group a cover sits in; null for a helper without one. */
  nomor: number | null;
}
interface SlotState {
  status: Status;
  chips: Chip[];
}

const STATUS_URUT: Status[] = ["aktif", "segera", "libur", "kosong"];
const TONE: Record<Kind, "violet" | "danger" | "accent" | undefined> = {
  tetap: undefined,
  izin: "danger",
  pengganti: "accent",
  sukarela: "violet",
};

function dariMinggu(j: JadwalRow, m: MingguSlot | undefined): SlotState {
  const chips: Chip[] = [];
  const add = (c: Chip) => !chips.some((x) => x.kode === c.kode) && chips.push(c);
  const kursi = m?.kursi ?? [];
  for (const k of kursi)
    if (k.tetap) add({ kode: k.tetap, kind: k.izin ? "izin" : "tetap", nomor: null });
  for (const k of kursi)
    if (k.kode && k.jenis !== "tetap") add({ kode: k.kode, kind: k.jenis, nomor: k.nomor });
  for (const t of m?.tugas ?? [])
    if (t.status === "diterima" && t.kelompokNomor == null)
      add({
        kode: t.kode.toUpperCase(),
        kind: t.jenis === "sukarela" ? "sukarela" : "pengganti",
        nomor: null,
      });
  return { status: m?.status ?? j.status, chips };
}

/** The schedule POST body for one slot's edited state. */
function ubahDari(j: JadwalRow, s: SlotState) {
  const sem = pasanganSemester(j.asisten, j.jumlahKelompok);
  const izin = new Set(s.chips.filter((c) => c.kind === "izin").map((c) => c.kode));
  const kursi = sem.map((k, i) => {
    const nomor = i + 1;
    const cover = s.chips.find(
      (c) => c.nomor === nomor && (c.kind === "pengganti" || c.kind === "sukarela"),
    );
    if (k && izin.has(k)) return { nomor, jenis: "izin", kode: cover?.kode ?? "" };
    if (cover) return { nomor, jenis: cover.kind, kode: cover.kode };
    return { nomor, jenis: "tetap", kode: "" };
  });
  const bantu = s.chips
    .filter((c) => c.nomor === null && (c.kind === "pengganti" || c.kind === "sukarela"))
    .map((c) => ({ kode: c.kode, jenis: c.kind }));
  return {
    status: s.status,
    ...(s.status === "kosong" ? { warnaKosong: j.warnaKosong ?? "oranye" } : {}),
    ...(s.status === "kosong" ? {} : { minggu: { kursi, bantu } }),
  };
}

const slotUnder: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

type Konteks = { jadwalId: number; hari: number; slot: number; tanggal: string };

export default function AssignBoard({
  lang,
  bolehJadwal,
  nama,
  meKode,
}: {
  lang: Lang;
  bolehJadwal: boolean;
  /** "Full Name (CODE)" for a NIM. */
  nama: (nim: string | null) => string;
  meKode: string;
}) {
  const t = A[lang];
  const semester = semesterDariTanggal(hariIniWib());
  const [data, setData] = useState<DataJadwal | null>(null);
  const [req, setReq] = useState<{
    tawaran: (TugasInfo & Konteks)[];
    izin: (Konteks & {
      id: number;
      nim: string;
      kode: string;
      status: string;
      penggantiNim: string | null;
    })[];
  } | null>(null);
  const [edit, setEdit] = useState<Record<number, SlotState>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  async function load() {
    const [d, p] = await Promise.all([
      getJson<{ ok: boolean } & DataJadwal>(`/api/session/schedule?semester=${semester}`),
      getJson<{ ok: boolean; tawaran: never[]; izin: never[] }>("/api/session/penugasan"),
    ]);
    if (d.ok) setData(d);
    if (p.ok) setReq(p);
    setEdit({});
  }
  useEffect(() => {
    void load().catch(() => window.Toast?.show(t.fail, "danger"));
  }, []);
  // Someone else's change shows at once, unless this board has unsaved moves.
  const adaUbah = useRef(false);
  useSiaran(["jadwal", "tim"], () => {
    if (!adaUbah.current) void load().catch(() => {});
  });

  const rows = useMemo(() => (data?.jadwal ?? []).filter((j) => j.status !== "kosong"), [data]);
  const awal = useMemo(
    () => Object.fromEntries(rows.map((j) => [j.id, dariMinggu(j, data?.minggu[String(j.id)])])),
    [rows, data],
  );
  const now = (id: number) => edit[id] ?? awal[id];
  const changed = rows.filter((j) => JSON.stringify(now(j.id)) !== JSON.stringify(awal[j.id]));
  adaUbah.current = changed.length > 0;
  useBelumSimpan(changed.length > 0);
  const load7 = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of rows)
      for (const c of now(j.id).chips)
        if (c.kind !== "izin") m.set(c.kode, (m.get(c.kode) ?? 0) + 1);
    return m;
  }, [rows, edit, awal]);
  const when = (x: { hari: number; slot: number; tanggal?: string }) =>
    `${x.tanggal ? tanggalPanjang(x.tanggal, lang) : hariLabel(x.hari, lang)} · ${slotLabel(x.slot, lang)} · ${SLOT_MULAI[x.slot]}`;
  const set = (id: number, s: SlotState) => setEdit((e) => ({ ...e, [id]: s }));

  function onEnd(e: DragEndEvent) {
    setDrag(null);
    const kode = (e.active.data.current as { kode?: string } | undefined)?.kode;
    const to = e.over?.id;
    if (!kode || typeof to !== "string" || !to.startsWith("slot:")) return;
    const j = rows.find((x) => x.id === Number(to.slice(5)));
    if (!j) return;
    const s = now(j.id);
    if (s.chips.some((c) => c.kode === kode)) return window.Toast?.show(t.already(kode), "warn");
    set(j.id, { ...s, chips: [...s.chips, { kode, kind: "pengganti", nomor: null }] });
    window.Toast?.show(t.added(kode, when(j)), "ok");
  }

  async function simpan() {
    setBusy(true);
    let n = 0;
    try {
      for (const j of changed) {
        const r = await postJson<{ ok: boolean }>("/api/session/schedule", {
          semester,
          hari: j.hari,
          slot: j.slot,
          ubah: ubahDari(j, now(j.id)),
        });
        if (!r.ok) throw new Error();
        n++;
      }
      window.Toast?.show(t.saved(n), "ok");
      await load();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function jawab(id: number, terima: boolean) {
    const r = await postJson<{ ok: boolean }>("/api/session/penugasan", {
      aksi: "konfirmasi",
      id,
      terima,
    }).catch(() => ({ ok: false }));
    if (!r.ok) return window.Toast?.show(t.fail, "danger");
    window.Toast?.show(terima ? t.accepted : t.declined, "ok");
    await load();
  }

  if (!data) return <span className="skeleton" style={{ height: 420 }} />;
  const reqCount = (req?.tawaran.length ?? 0) + (req?.izin.length ?? 0);

  return (
    <div className="tassign-wrap">
      {!bolehJadwal && (
        <div className="banner banner--lock">
          <span>{t.viewOnly}</span>
        </div>
      )}
      <section className="panel reqlane">
        <div className="panel__head">
          <h2 className="panel__title">{t.reqTitle}</h2>
          {reqCount > 0 && <Pill tone="warn">{reqCount}</Pill>}
          {bolehJadwal && (
            <button
              type="button"
              className="btn btn--primary reqlane__save"
              disabled={busy || changed.length === 0}
              onClick={() => void simpan()}
            >
              <FloppyDiskIcon size={18} aria-hidden="true" />
              {t.save}
            </button>
          )}
        </div>
        {reqCount === 0 ? (
          <p className="hint">{t.reqNone}</p>
        ) : (
          <div className="reqlist">
            {req?.izin.map((x) => (
              <div key={`i${x.id}`} className="reqrow">
                <Pill tone="danger">{t.kinds.izin}</Pill>
                <span className="stack reqrow__text">
                  <b>{nama(x.nim)}</b>
                  <span className="hint">{t.izinLine(when(x))}</span>
                </span>
                <Pill tone={x.penggantiNim ? "ok" : "warn"}>
                  {x.penggantiNim
                    ? t.covered(nama(x.penggantiNim))
                    : x.status === "dicari"
                      ? t.looking
                      : t.open}
                </Pill>
                <span />
              </div>
            ))}
            {req?.tawaran.map((x) => (
              <div key={`t${x.id}`} className="reqrow">
                <Pill tone="violet">{t.kinds.sukarela}</Pill>
                <span className="stack reqrow__text">
                  <b>{nama(x.nim)}</b>
                  <span className="hint">{t.offerLine(when(x))}</span>
                </span>
                <Pill tone="warn">{t.pending}</Pill>
                <span className="row reqrow__act">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void jawab(x.id, false)}
                  >
                    {t.decline}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => void jawab(x.id, true)}
                  >
                    <CheckIcon size={16} aria-hidden="true" />
                    {t.accept}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <DndContext
        sensors={sensors}
        collisionDetection={slotUnder}
        onDragStart={(e) => setDrag((e.active.data.current as { kode: string }).kode)}
        onDragEnd={onEnd}
        onDragCancel={() => setDrag(null)}
        accessibility={{ screenReaderInstructions: { draggable: t.srHint } }}
      >
        <div className="tassign">
          <section className="panel tpool">
            <h2 className="panel__title">{t.poolTitle}</h2>
            <span className="hint">{t.poolHint}</span>
            <div className="tpool__list">
              {data.asisten.map((a) => (
                <PoolRow
                  key={a.nim}
                  kode={a.kode.toUpperCase()}
                  nama={a.nama}
                  off={a.status !== "aktif" ? statusOrangLabel(a.status, lang) : null}
                  n={load7.get(a.kode.toUpperCase()) ?? 0}
                  me={a.kode.toUpperCase() === meKode}
                  disabled={!bolehJadwal}
                />
              ))}
            </div>
          </section>
          {rows.length === 0 ? (
            <p className="hint">{t.slotsNone}</p>
          ) : (
            <div className="tslots">
              {rows.map((j) => (
                <SlotBox
                  key={j.id}
                  j={j}
                  s={now(j.id)}
                  lang={lang}
                  label={`${hariLabel(j.hari, lang)} · ${SLOT_MULAI[j.slot]}`}
                  meKode={meKode}
                  ro={!bolehJadwal}
                  onChange={(s) => set(j.id, s)}
                />
              ))}
            </div>
          )}
        </div>
        <DragLayer>{drag && <span className="acode impchip--lifted">{drag}</span>}</DragLayer>
      </DndContext>
    </div>
  );
}

function PoolRow({
  kode,
  nama,
  off,
  n,
  me,
  disabled,
}: {
  kode: string;
  nama: string;
  off: string | null;
  n: number;
  me: boolean;
  disabled: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `p:${kode}`,
    data: { kode },
    disabled: disabled || !!off,
  });
  return (
    <div
      ref={setNodeRef}
      className="tpool__row"
      data-off={off ? "yes" : undefined}
      data-ro={disabled ? "yes" : undefined}
      data-dragging={isDragging ? "yes" : undefined}
      {...attributes}
      {...listeners}
    >
      {!disabled && <DotsSixVerticalIcon size={16} aria-hidden="true" />}
      <span className={`acode${me ? " acode--me" : ""}`}>{kode}</span>
      <span className="grow">{nama}</span>
      {off ? <Pill tone="warn">{off}</Pill> : <Pill tone={n >= 3 ? "warn" : undefined}>{n}</Pill>}
    </div>
  );
}

function SlotBox({
  j,
  s,
  lang,
  label,
  meKode,
  ro,
  onChange,
}: {
  j: JadwalRow;
  s: SlotState;
  lang: Lang;
  label: string;
  meKode: string;
  ro: boolean;
  onChange: (s: SlotState) => void;
}) {
  const t = A[lang];
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${j.id}`, disabled: ro });
  const sem = pasanganSemester(j.asisten, j.jumlahKelompok);
  const izinKode = new Set(s.chips.filter((c) => c.kind === "izin").map((c) => c.kode));
  const covered = (n: number) =>
    s.chips.some((c) => c.nomor === n && c.kind !== "izin" && c.kind !== "tetap");
  const need = sem.some((k, i) => k && izinKode.has(k) && !covered(i + 1));
  const cycleKind = (c: Chip): Kind =>
    c.kind === "tetap"
      ? "izin"
      : c.kind === "izin"
        ? "tetap"
        : c.kind === "pengganti"
          ? "sukarela"
          : "pengganti";
  return (
    <div
      ref={setNodeRef}
      className="tslot"
      data-st={s.status}
      data-need={need ? "yes" : undefined}
      data-over={isOver ? "yes" : undefined}
    >
      <div className="row row--between tslot__head">
        <b>{label}</b>
        <button
          type="button"
          className="tslot__st"
          title={t.statusTip}
          disabled={ro}
          onClick={() =>
            onChange({
              ...s,
              status: STATUS_URUT[(STATUS_URUT.indexOf(s.status) + 1) % STATUS_URUT.length],
            })
          }
        >
          {t.status[s.status]}
        </button>
      </div>
      {need && (
        <span className="tslot__need">
          <WarningIcon size={16} aria-hidden="true" />
          {t.need}
        </span>
      )}
      <div className="tslot__list">
        {s.chips.map((c) => (
          <span key={c.kode} className="tchip" data-kind={c.kind}>
            <span
              className={`acode${c.kode === meKode ? " acode--me" : ""}${c.kind === "izin" ? " acode--izin" : ""}`}
            >
              {c.kode}
            </span>
            <button
              type="button"
              className="tchip__kind"
              title={t.kindTip}
              disabled={ro}
              onClick={() =>
                onChange({
                  ...s,
                  chips: s.chips.map((x) => (x.kode === c.kode ? { ...x, kind: cycleKind(x) } : x)),
                })
              }
            >
              <Pill tone={TONE[c.kind]}>{t.kinds[c.kind]}</Pill>
            </button>
            {!ro && (c.kind === "pengganti" || c.kind === "sukarela") && (
              <IconButton
                icon={XIcon}
                label={t.remove(c.kode)}
                kind="ghost"
                sm
                onClick={() => onChange({ ...s, chips: s.chips.filter((x) => x.kode !== c.kode) })}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
