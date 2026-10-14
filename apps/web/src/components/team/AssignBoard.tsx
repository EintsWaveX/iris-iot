/**
 * Tim › Penugasan Slot (Phase 9 Stage 4, mockup t-assign): who teaches
 * each slot on its next date, at the level of people.
 *
 * - Permintaan: open izin (with whether someone covers) and Sukarela offers
 *   waiting for an answer, with Terima and Tolak.
 * - The Asisten list on the left: drag someone (their whole row lifts) into
 *   a slot and they join it that date as a Pengganti (without a group; the
 *   slot seats them). People on leave or inactive can't be dragged. A cover
 *   dragged back onto the list leaves its slot; onto another slot, it moves.
 * - Each slot: its status (tap to cycle Aktif, Segera, Libur, Tidak Ada
 *   Praktikum) and its people. Tap a badge to switch Tetap and Izin, or
 *   Pengganti and Sukarela; a cover can be removed. "Ada yang izin" turns
 *   the slot amber until every group has someone.
 *
 * - The week picker (2026-10-12): the next meeting, or any of the weeks
 *   after it, so an izin or a cover can be set ahead.
 * - Tambah Slot and each slot's Ubah Slot (SlotDialog.tsx): the slots come
 *   from the sheet's import, and these add one, move one to another day
 *   and session, or change its groups' Asisten later.
 *
 * Batalkan Perubahan drops every unsaved move. Save writes the same data
 * the Schedule shows (POST /api/session/schedule
 * with the date's seats), so both pages always agree. Without the Schedule
 * right the board is read only.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { DotsSixVerticalIcon, PencilSimpleIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import Dropdown from "../ui/Dropdown";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import { dict, getJson, localeOf, postJson, tanggalPanjang } from "../../lib/app";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariLabel, statusOrangLabel, slotLabel } from "../../lib/labels";
import {
  pasanganSemester,
  tanggalMinggu,
  type MingguSlot,
  type TugasInfo,
} from "../../lib/penugasan-minggu";
import type { Lang } from "../../lib/kelas";
import { HARI, type DataJadwal, type JadwalRow } from "../schedule/types";
import SlotDialog from "./SlotDialog";
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
    poolHint:
      "Seret ke slot. Seret pengganti dari slot kembali ke sini untuk mengeluarkannya. Yang cuti atau nonaktif tidak bisa diseret.",
    slotsNone: "Belum ada slot yang berjalan di semester ini.",
    statusTip: "Ketuk untuk mengganti status slot",
    status: { aktif: "Aktif", segera: "Segera", libur: "Libur", kosong: "Tidak Ada Praktikum" },
    kinds: { tetap: "Tetap", pengganti: "Pengganti", sukarela: "Sukarela", izin: "Izin" },
    kindTip: "Ketuk untuk mengganti: Tetap dan Izin, atau Pengganti dan Sukarela",
    remove: (k: string) => `Keluarkan ${k}`,
    need: "Ada yang izin, butuh pengganti",
    already: (k: string) => `${k} sudah ada di slot ini.`,
    added: (k: string, when: string) => `${k} masuk ${when}.`,
    removed: (k: string) => `${k} dikeluarkan dari slot.`,
    moved: (k: string, when: string) => `${k} pindah ke ${when}.`,
    discard: "Batalkan Perubahan",
    srHint: "Tekan Spasi untuk mengangkat, panah untuk memilih slot, Spasi lagi untuk menaruh.",
    week: "Minggu",
    weekNext: "Pertemuan berikutnya",
    until: "s.d.",
    weekLock: "Simpan atau batalkan perubahan dulu sebelum pindah minggu.",
    addSlot: "Tambah Slot",
    addSlotDesc: "Pilih hari dan sesinya, lalu isi status dan asisten tiap kelompok.",
    editSlot: "Ubah Slot",
    editSlotDesc: "Ganti hari, sesi, status, atau asisten tiap kelompok.",
    editOf: (k: string) => `Ubah slot ${k}`,
    day: "Hari",
    session: "Sesi",
    taken: "Sudah ada slot",
    dayFull: "Semua sesinya sudah terisi",
    tetapHint:
      "Asisten Tetap berlaku mulai sekarang untuk semester ini. Sesi yang sudah lewat tetap mencatat siapa yang mengajar. Pengganti, Sukarela dan Izin hanya untuk tanggal di bawah.",
    moveHint:
      "Slot ini pindah ke hari dan sesi baru, bersama roster, libur, izin dan penggantinya yang akan datang. Sesi yang sudah lewat tetap tercatat.",
    cancel: "Batal",
    slotAdded: (k: string) => `Slot ${k} ditambahkan. Jadwal ikut berubah.`,
    slotSaved: "Slot disimpan. Jadwal ikut berubah.",
    slotMoved: (k: string) => `Slot pindah ke ${k}. Jadwal ikut berubah.`,
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
    poolHint:
      "Drag into a slot. Drag a cover from a slot back here to take them out. People on leave or inactive can't be dragged.",
    slotsNone: "No running slots in this semester yet.",
    statusTip: "Tap to change the slot status",
    status: { aktif: "Active", segera: "Soon", libur: "Holiday", kosong: "No Practicum" },
    kinds: { tetap: "Regular", pengganti: "Substitute", sukarela: "Volunteer", izin: "Excused" },
    kindTip: "Tap to switch: Regular and Excused, or Substitute and Volunteer",
    remove: (k: string) => `Remove ${k}`,
    need: "Someone is excused, needs cover",
    already: (k: string) => `${k} is already in this slot.`,
    added: (k: string, when: string) => `${k} added to ${when}.`,
    removed: (k: string) => `${k} taken out of the slot.`,
    moved: (k: string, when: string) => `${k} moved to ${when}.`,
    discard: "Discard Changes",
    srHint: "Press Space to pick up, arrow keys to choose a slot, Space again to drop.",
    week: "Week",
    weekNext: "Next meeting",
    until: "to",
    weekLock: "Save or discard your changes before switching weeks.",
    addSlot: "Add a Slot",
    addSlotDesc: "Pick its day and session, then set its status and each group's assistant.",
    editSlot: "Edit the Slot",
    editSlotDesc: "Change its day, session, status or each group's assistant.",
    editOf: (k: string) => `Edit the ${k} slot`,
    day: "Day",
    session: "Session",
    taken: "Already has a slot",
    dayFull: "Every session is taken",
    tetapHint:
      "A Regular assistant applies from now on for this semester. Sessions already held keep who taught them. Substitute, Volunteer and Excused are for the date below only.",
    moveHint:
      "This slot moves to the new day and session, with its roster and its holidays, excusals and covers still to come. Sessions already held stay on record.",
    cancel: "Cancel",
    slotAdded: (k: string) => `The ${k} slot is added. The Schedule follows.`,
    slotSaved: "The slot is saved. The Schedule follows.",
    slotMoved: (k: string) => `The slot moved to ${k}. The Schedule follows.`,
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
    poolHint: "拖到时段里。把代课的人从时段拖回这里即可移出。请假或停用的人不能拖。",
    slotsNone: "这个学期还没有上课的时段。",
    statusTip: "点一下切换时段状态",
    status: { aktif: "进行中", segera: "即将开始", libur: "放假", kosong: "无实验课" },
    kinds: { tetap: "固定", pengganti: "代课", sukarela: "志愿", izin: "请假" },
    kindTip: "点一下切换：固定和请假，或者代课和志愿",
    remove: (k: string) => `移出 ${k}`,
    need: "有人请假，需要代课",
    already: (k: string) => `${k} 已经在这个时段了。`,
    added: (k: string, when: string) => `${k} 已加入${when}。`,
    removed: (k: string) => `${k} 已移出时段。`,
    moved: (k: string, when: string) => `${k} 已移到${when}。`,
    discard: "放弃更改",
    srHint: "按空格键拿起，方向键选时段，再按空格放下。",
    week: "周",
    weekNext: "下一次上课",
    until: "至",
    weekLock: "换周之前，请先保存或放弃更改。",
    addSlot: "添加时段",
    addSlotDesc: "选好星期和节次，再设置状态和每组的助教。",
    editSlot: "修改时段",
    editSlotDesc: "修改星期、节次、状态或每组的助教。",
    editOf: (k: string) => `修改时段 ${k}`,
    day: "星期",
    session: "节次",
    taken: "已经有时段",
    dayFull: "每个节次都有了",
    tetapHint:
      "固定助教从现在起对本学期有效。已经上过的课仍记录当时的授课人。代课、志愿和请假只用于下面的日期。",
    moveHint:
      "这个时段会移到新的星期和节次，名单以及之后的放假、请假和代课一起移过去。已经上过的课仍有记录。",
    cancel: "取消",
    slotAdded: (k: string) => `已添加时段 ${k}。课表跟着更新。`,
    slotSaved: "时段已保存。课表跟着更新。",
    slotMoved: (k: string) => `时段已移到 ${k}。课表跟着更新。`,
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

/** What a drag carries: a row from the list, or a cover from a slot (`from`) */
interface DragData {
  kode: string;
  nama?: string;
  n?: number;
  from?: number;
  kind?: Kind;
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

/** Each group's holder on the board's date: that week's seats (its
 *  module's list while the semester pairs per module), else the default. */
function semDari(j: JadwalRow, m: MingguSlot | undefined): (string | null)[] {
  return m?.kursi.length
    ? m.kursi.map((k) => k.tetap)
    : pasanganSemester(j.asisten, j.jumlahKelompok);
}

/** The schedule POST body for one slot's edited state. */
function ubahDari(j: JadwalRow, s: SlotState, m: MingguSlot | undefined) {
  const sem = semDari(j, m);
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

/** Weeks past the next meeting the week picker offers. */
const MINGGU_PILIH = 8;

/** A week's dates, short: "12 Okt s.d. 17 Okt". */
function rentangMinggu(g: number, lang: Lang, until: string): string {
  const hariIni = hariIniWib();
  const tgl = HARI.map((h) => tanggalMinggu(h, hariIni, g)).sort();
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(localeOf(lang), {
      day: "numeric",
      month: "short",
    });
  return `${f(tgl[0])} ${until} ${f(tgl[tgl.length - 1])}`;
}

export default function AssignBoard({
  lang,
  bolehJadwal,
  nama,
  meKode,
  meNim,
}: {
  lang: Lang;
  bolehJadwal: boolean;
  /** "Full Name (CODE)" for a NIM. */
  nama: (nim: string | null) => string;
  meKode: string;
  meNim: string;
}) {
  const t = A[lang];
  const semester = semesterDariTanggal(hariIniWib());
  const [geser, setGeser] = useState(0);
  const [dialog, setDialog] = useState<{ hari: number; slot: number } | "baru" | null>(null);
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
  const [drag, setDrag] = useState<DragData | null>(null);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  async function load(g = geser) {
    const [d, p] = await Promise.all([
      getJson<{ ok: boolean } & DataJadwal>(
        `/api/session/schedule?semester=${semester}&geser=${g}`,
      ),
      getJson<{ ok: boolean; tawaran: never[]; izin: never[] }>("/api/session/penugasan"),
    ]);
    if (d.ok) setData(d);
    if (p.ok) setReq(p);
    setEdit({});
  }
  useEffect(() => {
    void load(geser).catch(() => window.Toast?.show(t.fail, "danger"));
  }, [geser]);
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
    const d = e.active.data.current as DragData | undefined;
    const to = e.over?.id;
    if (!d || typeof to !== "string") return;

    // A cover taken from a slot: back onto the list takes them out
    const from = d.from;
    if (from !== undefined) {
      const asal = now(from);
      const tanpa = { ...asal, chips: asal.chips.filter((c) => c.kode !== d.kode) };
      if (to === "pool") {
        set(from, tanpa);
        return window.Toast?.show(t.removed(d.kode), "ok");
      }
      if (!to.startsWith("slot:") || Number(to.slice(5)) === from) return;
      const j = rows.find((x) => x.id === Number(to.slice(5)));
      if (!j) return;
      const s = now(j.id);
      if (s.chips.some((c) => c.kode === d.kode))
        return window.Toast?.show(t.already(d.kode), "warn");
      const masuk: Chip = { kode: d.kode, kind: d.kind ?? "pengganti", nomor: null };
      setEdit((x) => ({ ...x, [from]: tanpa, [j.id]: { ...s, chips: [...s.chips, masuk] } }));
      return window.Toast?.show(t.moved(d.kode, when(j)), "ok");
    }

    if (!to.startsWith("slot:")) return;
    const j = rows.find((x) => x.id === Number(to.slice(5)));
    if (!j) return;
    const s = now(j.id);
    if (s.chips.some((c) => c.kode === d.kode))
      return window.Toast?.show(t.already(d.kode), "warn");
    set(j.id, { ...s, chips: [...s.chips, { kode: d.kode, kind: "pengganti", nomor: null }] });
    window.Toast?.show(t.added(d.kode, when(j)), "ok");
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
          geser,
          ubah: ubahDari(j, now(j.id), data?.minggu[String(j.id)]),
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
            <span className="row reqlane__save">
              {changed.length > 0 && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => setEdit({})}
                >
                  {t.discard}
                </button>
              )}
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || changed.length === 0}
                onClick={() => void simpan()}
              >
                {t.save}
              </button>
            </span>
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
        onDragStart={(e) => setDrag(e.active.data.current as DragData)}
        onDragEnd={onEnd}
        onDragCancel={() => setDrag(null)}
        accessibility={{ screenReaderInstructions: { draggable: t.srHint } }}
      >
        <div className="tassign">
          <PoolDrop disabled={!bolehJadwal}>
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
          </PoolDrop>
          <div className="tassign__main">
            <div className="row tassign__bar">
              <div className="tassign__week">
                <Dropdown
                  id="tassign-week"
                  label={t.week}
                  hideLabel
                  value={String(geser)}
                  options={Array.from({ length: MINGGU_PILIH + 1 }, (_, g) => ({
                    value: String(g),
                    label:
                      g === 0
                        ? `${t.weekNext} · ${rentangMinggu(g, lang, t.until)}`
                        : rentangMinggu(g, lang, t.until),
                  }))}
                  onChange={(v) => {
                    if (Number(v) === geser) return;
                    if (changed.length > 0) return window.Toast?.show(t.weekLock, "warn");
                    setGeser(Number(v));
                  }}
                />
              </div>
              {bolehJadwal && (
                <button type="button" className="btn" onClick={() => setDialog("baru")}>
                  {t.addSlot}
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="hint">{t.slotsNone}</p>
            ) : (
              <div className="tslots">
                {rows.map((j) => {
                  const tgl = data.minggu[String(j.id)]?.tanggal;
                  return (
                    <SlotBox
                      key={j.id}
                      j={j}
                      m={data.minggu[String(j.id)]}
                      s={now(j.id)}
                      lang={lang}
                      label={`${hariLabel(j.hari, lang)} · ${SLOT_MULAI[j.slot]}`}
                      date={tgl ? tanggalPanjang(tgl, lang) : null}
                      meKode={meKode}
                      ro={!bolehJadwal}
                      onChange={(s) => set(j.id, s)}
                      onEdit={() => {
                        if (changed.length > 0) return window.Toast?.show(t.weekLock, "warn");
                        setDialog({ hari: j.hari, slot: j.slot });
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DragLayer>
          {drag &&
            (drag.from === undefined ? (
              <div className="tpool__row tpool__row--lifted impchip--lifted">
                <DotsSixVerticalIcon size={16} aria-hidden="true" />
                <span className="acode">{drag.kode}</span>
                <span className="grow">{drag.nama}</span>
                <Pill tone={(drag.n ?? 0) >= 3 ? "warn" : undefined}>{drag.n ?? 0}</Pill>
              </div>
            ) : (
              <span className="tchip impchip--lifted" data-kind={drag.kind}>
                <span className="acode">{drag.kode}</span>
                {drag.kind && <Pill tone={TONE[drag.kind]}>{t.kinds[drag.kind]}</Pill>}
              </span>
            ))}
        </DragLayer>
      </DndContext>
      {dialog && (
        <SlotDialog
          lang={lang}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          semester={semester}
          kini
          data={data}
          awal={dialog === "baru" ? null : dialog}
          geser={geser}
          meKode={meKode}
          meNim={meNim}
          onSaved={() => void load().catch(() => {})}
        />
      )}
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
    data: { kode, nama, n } satisfies DragData,
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
  m,
  s,
  lang,
  label,
  date,
  meKode,
  ro,
  onChange,
  onEdit,
}: {
  j: JadwalRow;
  m: MingguSlot | undefined;
  s: SlotState;
  lang: Lang;
  label: string;
  /** The date this board shows for the slot */
  date: string | null;
  meKode: string;
  ro: boolean;
  onChange: (s: SlotState) => void;
  onEdit: () => void;
}) {
  const t = A[lang];
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${j.id}`, disabled: ro });
  const sem = semDari(j, m);
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
        <span className="stack tslot__name">
          <b>{label}</b>
          {date && <span className="hint">{date}</span>}
        </span>
        {!ro && (
          <IconButton
            icon={PencilSimpleIcon}
            label={t.editOf(label)}
            kind="ghost"
            sm
            onClick={onEdit}
          />
        )}
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
          <SlotChip key={c.kode} jadwalId={j.id} c={c} ro={ro}>
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
          </SlotChip>
        ))}
      </div>
    </div>
  );
}

/** The Asisten list, also where a cover dragged out of a slot is dropped */
function PoolDrop({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool", disabled });
  return (
    <section ref={setNodeRef} className="panel tpool" data-over={isOver ? "yes" : undefined}>
      {children}
    </section>
  );
}

/** A slot's chip; a Pengganti or Sukarela can be dragged out or across */
function SlotChip({
  jadwalId,
  c,
  ro,
  children,
}: {
  jadwalId: number;
  c: Chip;
  ro: boolean;
  children: ReactNode;
}) {
  const cover = c.kind === "pengganti" || c.kind === "sukarela";
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `c:${jadwalId}:${c.kode}`,
    data: { kode: c.kode, from: jadwalId, kind: c.kind } satisfies DragData,
    disabled: ro || !cover,
  });
  return (
    <span
      ref={setNodeRef}
      className="tchip"
      data-kind={c.kind}
      data-drag={!ro && cover ? "yes" : undefined}
      data-dragging={isDragging ? "yes" : undefined}
      {...(!ro && cover ? { ...attributes, ...listeners } : {})}
    >
      {children}
    </span>
  );
}
