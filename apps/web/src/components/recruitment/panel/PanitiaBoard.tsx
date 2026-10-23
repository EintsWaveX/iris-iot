/**
 * The Panitia board (prompt 03, PRD 6, mockup r1-panitia): one column per
 * division plus the Inti (Ketua and Wakil). The Ketua drags Asisten from the
 * list into a division, between divisions, or back out; the star marks the
 * one Koordinator of a division. Everyone else on the Panitia sees the same
 * board read only, without the list.
 *
 * The Ketua's own seat is locked: only the Pencipta or an Admin (the
 * seatKetua right) moves it. They drop someone on the empty chair slot, and
 * drag the Ketua out to free it. Every move is one request (seat or unseat),
 * answered with the whole board, and toasts with Urungkan. Dragging is
 * dnd-kit like Tim's slot board: pointer and keyboard, and the card lifts.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { DotsSixVerticalIcon, LockSimpleIcon, StarIcon } from "@phosphor-icons/react";
import DragLayer from "../../ui/DragLayer";
import IconButton from "../../ui/IconButton";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost, useRecCommittee } from "../../../lib/recruitment/client";
import type {
  CommitteeDivision,
  RecRights,
  SeatResponse,
  SeatRow,
} from "../../../lib/recruitment/types";
import { REC } from "../recruitmentStrings";
import { PN } from "./panelStrings";

type Kolom = "inti" | "acara" | "akademik" | "logistik" | "admin" | "pdd";
const KOLOM: Kolom[] = ["inti", "acara", "akademik", "logistik", "admin", "pdd"];
const WARNA: Record<Kolom, string> = {
  inti: "var(--yellow)",
  acara: "var(--accent)",
  akademik: "var(--violet)",
  logistik: "var(--teal)",
  admin: "var(--red)",
  pdd: "var(--accent-bright)",
};
const kolomDari = (d: CommitteeDivision): Kolom => (d === "ketua" || d === "wakil" ? "inti" : d);

interface Orang {
  nim: string;
  nama: string;
  kode: string;
  /** Where they sit now, or the list */
  dari: CommitteeDivision | "pool";
  isKoor: boolean;
  title: string | null;
}

const cari: CollisionDetection = (a) => {
  const di = pointerWithin(a);
  return di.length ? di : closestCenter(a);
};

function Kartu({
  o,
  boleh,
  kunci,
  lang,
  onStar,
}: {
  o: Orang;
  boleh: boolean;
  /** The Ketua's seat, locked to the seatKetua right */
  kunci: boolean;
  lang: Lang;
  onStar?: () => void;
}) {
  const t = PN[lang];
  const tarik = boleh && !kunci;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `p:${o.nim}`,
    data: o,
    disabled: !tarik,
  });
  const peran =
    o.dari === "ketua"
      ? t.division.ketua
      : o.dari === "wakil"
        ? (o.title ?? t.division.wakil)
        : o.isKoor
          ? t.koor
          : (o.title ?? null);
  return (
    <div
      ref={setNodeRef}
      className="rec-pp"
      data-koor={o.isKoor && o.dari !== "pool" ? "yes" : undefined}
      data-dragging={isDragging ? "yes" : undefined}
      data-static={tarik ? undefined : "yes"}
    >
      <span
        ref={setActivatorNodeRef}
        className="rec-pp__grab"
        {...(tarik ? { ...attributes, ...listeners } : {})}
      >
        <span className="rec-pp__code mono">{o.kode}</span>
        <span className="stack" style={{ gap: 0, minWidth: 0 }}>
          <b className="rec-pp__name">{o.nama}</b>
          {peran && <span className="hint">{peran}</span>}
        </span>
      </span>
      {onStar && o.dari !== "pool" && o.dari !== "ketua" && o.dari !== "wakil" && (
        <IconButton
          icon={StarIcon}
          sm
          kind="ghost"
          pressed={o.isKoor}
          label={o.isKoor ? t.board.isKoor : t.board.makeKoor}
          tip={o.isKoor ? t.board.isKoor : t.board.makeKoor}
          onClick={onStar}
        />
      )}
      {kunci && o.dari === "ketua" && (
        <span className="rec-pp__lock" title={t.board.lockedKetua} aria-label={t.board.lockedKetua}>
          <LockSimpleIcon size={16} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

function Lajur({
  id,
  disabled,
  className,
  style,
  children,
}: {
  id: string;
  disabled: boolean;
  className: string;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={style}
      data-over={isOver && !disabled ? "yes" : undefined}
    >
      {children}
    </div>
  );
}

export default function PanitiaBoard({ lang, rights }: { lang: Lang; rights: RecRights | null }) {
  const t = PN[lang];
  const kom = useRecCommittee(true);
  const [lokal, setLokal] = useState<SeatRow[] | null>(null);
  useEffect(() => setLokal(null), [kom.data]);
  const [q, setQ] = useState("");
  const [angkat, setAngkat] = useState<Orang | null>(null);
  const bisaAtur = !!rights && (rights.board || rights.seatKetua);
  const bisaKetua = !!rights?.seatKetua;
  const seats = lokal ?? kom.data?.seats ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const duduk = useMemo(() => new Set(seats.map((s) => s.nim)), [seats]);
  const kolamMentah = kom.data?.pool ?? [];
  const kolam = kolamMentah.filter(
    (a) =>
      !duduk.has(a.nim) &&
      (!q.trim() || `${a.nama} ${a.kode}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const orang = (s: SeatRow): Orang => ({
    nim: s.nim,
    nama: s.nama,
    kode: s.kode,
    dari: s.division,
    isKoor: s.isKoor,
    title: s.title,
  });
  const nama = (nim: string) =>
    seats.find((s) => s.nim === nim)?.nama ?? kolamMentah.find((a) => a.nim === nim)?.nama ?? nim;
  const adaKetua = seats.some((s) => s.division === "ketua");

  async function kirim(
    aksi: "seat" | "unseat",
    body: Record<string, unknown>,
  ): Promise<SeatRow[] | null> {
    const res = await recPost<SeatResponse>(aksi, body);
    if (isFail(res)) {
      window.Toast?.show(
        res.kode === "tanpa_hak"
          ? t.board.noRight
          : res.kode === "ketua_sudah_ada"
            ? t.board.ketuaExists
            : t.board.fail,
        "danger",
      );
      return null;
    }
    setLokal(res.seats);
    kom.refresh();
    return res.seats;
  }

  /** Puts someone into a division (or out), and offers to put them back. */
  async function pindah(o: Orang, ke: CommitteeDivision | "pool") {
    if (ke === o.dari) return;
    const mundur = async () => {
      if (o.dari === "pool") await kirim("unseat", { nim: o.nim });
      else await kirim("seat", { nim: o.nim, division: o.dari, isKoor: o.isKoor, title: o.title });
    };
    if (ke === "pool") {
      if (await kirim("unseat", { nim: o.nim }))
        window.Toast?.show(t.board.left(o.nama), "info", {
          action: { label: REC[lang].undo, onClick: () => void mundur() },
        });
      return;
    }
    if (await kirim("seat", { nim: o.nim, division: ke }))
      window.Toast?.show(t.board.joined(o.nama, t.division[ke]), "ok", {
        action: { label: REC[lang].undo, onClick: () => void mundur() },
      });
  }

  async function bintang(s: SeatRow) {
    const res = await kirim("seat", { nim: s.nim, division: s.division, isKoor: !s.isKoor });
    if (res)
      window.Toast?.show(
        s.isKoor ? t.board.koorUnset(s.nama) : t.board.koorSet(s.nama, t.division[s.division]),
        "ok",
      );
  }

  function selesai(e: DragEndEvent) {
    setAngkat(null);
    const o = e.active.data.current as Orang | undefined;
    const over = e.over?.id ? String(e.over.id) : null;
    if (!o || !over) return;
    if (over === "pool") return void pindah(o, "pool");
    if (over === "slot:ketua") return void pindah(o, "ketua");
    const kol = over.replace("col:", "") as Kolom;
    // Dropping on the Inti seats a Wakil; the Ketua's own seat moves only through its slot.
    const ke: CommitteeDivision = kol === "inti" ? (o.dari === "ketua" ? "ketua" : "wakil") : kol;
    void pindah(o, ke);
  }

  if (kom.updatedAt === null) return <span className="skeleton" style={{ height: 360 }} />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cari}
      onDragStart={(e) => setAngkat(e.active.data.current as Orang)}
      onDragEnd={selesai}
      onDragCancel={() => setAngkat(null)}
      accessibility={{ screenReaderInstructions: { draggable: t.board.srHint } }}
    >
      <div className="rec-board" data-pool={bisaAtur ? "yes" : "no"}>
        {bisaAtur && (
          <Lajur id="pool" disabled={!bisaAtur} className="panel rec-pool">
            <div className="panel__head">
              <h3 className="panel__title">{t.board.pool}</h3>
              <span className="hint num">{kolam.length}</span>
            </div>
            <div className="rec-search">
              <input
                className="field__input"
                placeholder={t.board.search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={t.board.searchLabel}
              />
            </div>
            <div className="rec-pool__list">
              {kolam.map((a) => (
                <Kartu
                  key={a.nim}
                  o={{ ...a, dari: "pool", isKoor: false, title: null }}
                  boleh
                  kunci={false}
                  lang={lang}
                />
              ))}
              {!kolam.length && <span className="hint">{t.board.allSeated}</span>}
            </div>
            <span className="hint">{t.board.hint}</span>
          </Lajur>
        )}
        <div className="rec-cols">
          {KOLOM.map((k) => {
            const isi = seats.filter((s) => kolomDari(s.division) === k);
            return (
              <Lajur
                key={k}
                id={`col:${k}`}
                disabled={!bisaAtur}
                className="rec-col"
                style={{ "--c": WARNA[k] } as CSSProperties}
              >
                <div className="rec-col__head">
                  <b>{k === "inti" ? t.inti : t.division[k]}</b>
                  <span className="hint num">{isi.length}</span>
                </div>
                <div className="rec-col__list">
                  {isi.map((s) => (
                    <Kartu
                      key={s.nim}
                      o={orang(s)}
                      boleh={bisaAtur}
                      kunci={s.division === "ketua" && !bisaKetua}
                      lang={lang}
                      onStar={bisaAtur ? () => void bintang(s) : undefined}
                    />
                  ))}
                  {k === "inti" && bisaKetua && !adaKetua && (
                    <Lajur id="slot:ketua" disabled={false} className="rec-slotketua">
                      <span className="hint">{t.division.ketua}</span>
                    </Lajur>
                  )}
                </div>
              </Lajur>
            );
          })}
        </div>
      </div>
      {!bisaAtur && <p className="hint">{t.board.hintView}</p>}
      <DragLayer>
        {angkat && (
          <div className="rec-pp rec-pp--lifted">
            <DotsSixVerticalIcon size={16} aria-hidden="true" />
            <span className="rec-pp__code mono">{angkat.kode}</span>
            <b className="rec-pp__name">{nama(angkat.nim)}</b>
          </div>
        )}
      </DragLayer>
    </DndContext>
  );
}
