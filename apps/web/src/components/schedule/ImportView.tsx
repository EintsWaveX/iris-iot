/**
 * Impor Jadwal (Phase 9 Stage 4, mockup s-import), two ways:
 *
 * - Tempel dari Sheet: the sheet's ASISTEN DEFAULT and ASISTEN PENGGANTI
 *   blocks pasted as text. The preview reads as you paste (the server's
 *   parser, nothing saved), flags unknown codes, then replaces the semester
 *   after a confirm.
 * - Atur dengan Seret: every running slot's groups as one-seat targets.
 *   Drag a person from the list to fill a seat (the list never empties, so
 *   one person can fill several), or drag a code from one seat to another
 *   to swap the two. Every change can be undone; Save writes the changed
 *   slots' pairing. Space picks up and drops with the keyboard.
 */
import { useEffect, useMemo, useState } from "react";
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
  type DragStartEvent,
} from "@dnd-kit/core";
import DragLayer from "../ui/DragLayer";
import { DotsSixVerticalIcon, WarningIcon } from "@phosphor-icons/react";
import BackButton from "../ui/BackButton";
import Confirm from "../ui/Confirm";
import Fade from "../ui/Fade";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { postJson } from "../../lib/app";
import { SLOT_MULAI } from "../../lib/jadwal";
import { hariLabel, kelompokLabel, statusOrangLabel } from "../../lib/labels";
import { pasanganSemester } from "../../lib/penugasan-minggu";
import type { Lang } from "../../lib/kelas";
import { J } from "./strings";
import type { DataJadwal, JadwalRow } from "./types";

interface Pratinjau {
  slot: { hari: number; slot: number; asisten: string[]; pengganti: unknown[] }[];
  kodeTakDikenal: string[];
  asing: string[];
}

export default function ImportView({
  lang,
  semester,
  semesterLabel,
  data,
  meKode,
  onBack,
  onDone,
}: {
  lang: Lang;
  semester: string;
  semesterLabel: string;
  data: DataJadwal;
  meKode: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = J[lang];
  const [mode, setMode] = useState<"tempel" | "atur">("tempel");
  return (
    <div className="jpage jimport">
      <BackButton lang={lang} label={t.imp.back} onClick={onBack} />
      <div className="jpage__head">
        <div className="page-header__heading">
          <span className="page-header__eyebrow">{t.eyebrow}</span>
          <h1 className="page-header__title">{t.imp.title}</h1>
        </div>
        <SegmentedControl
          value={mode}
          onValueChange={(v) => setMode(v as "tempel" | "atur")}
          aria-label={t.imp.modes}
          options={[
            { value: "tempel", label: t.imp.paste },
            { value: "atur", label: t.imp.drag },
          ]}
        />
      </div>
      <Fade k={mode}>
        {mode === "tempel" ? (
          <Paste lang={lang} semester={semester} semesterLabel={semesterLabel} onDone={onDone} />
        ) : (
          <Arrange lang={lang} semester={semester} data={data} meKode={meKode} onDone={onDone} />
        )}
      </Fade>
    </div>
  );
}

/* --------------------------------------------------------------- paste */

function Paste({
  lang,
  semester,
  semesterLabel,
  onDone,
}: {
  lang: Lang;
  semester: string;
  semesterLabel: string;
  onDone: () => void;
}) {
  const t = J[lang];
  const [def, setDef] = useState("");
  const [peng, setPeng] = useState("");
  const [pre, setPre] = useState<Pratinjau | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Read as you paste, a moment after the last keystroke.
  useEffect(() => {
    if (!def.trim()) {
      setPre(null);
      return;
    }
    let alive = true;
    setBusy(true);
    const id = window.setTimeout(() => {
      postJson<{ ok: boolean; pratinjau?: Pratinjau }>("/api/session/schedule", {
        semester,
        teksDefault: def,
        teksPengganti: peng,
      })
        .then((d) => alive && setPre(d.ok && d.pratinjau ? d.pratinjau : null))
        .catch(() => alive && setPre(null))
        .finally(() => alive && setBusy(false));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [def, peng, semester]);

  const subs = pre?.slot.reduce((a, s) => a + s.pengganti.length, 0) ?? 0;
  const codes = new Set((pre?.slot ?? []).flatMap((s) => s.asisten.map((k) => k.toUpperCase())));

  async function simpan() {
    setBusy(true);
    try {
      const d = await postJson<{ ok: boolean; kode?: string; disimpan?: number }>(
        "/api/session/schedule",
        { semester, teksDefault: def, teksPengganti: peng, simpan: true },
      );
      if (!d.ok) {
        window.Toast?.show(d.kode === "jadwal_kosong" ? t.imp.empty : t.fail, "danger");
        return;
      }
      window.Toast?.show(t.imp.replaced(semesterLabel, d.disimpan ?? 0), "ok");
      onDone();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className="grid-2 jimp">
      <section className="panel">
        <h2 className="panel__title">{t.imp.pasteTitle}</h2>
        <label className="field">
          <span className="field__label">{t.imp.blockDefault}</span>
          <textarea
            className="field__input mono jimp__area"
            rows={7}
            value={def}
            spellCheck={false}
            onChange={(e) => setDef(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{t.imp.blockSubs}</span>
          <textarea
            className="field__input mono jimp__area"
            rows={5}
            value={peng}
            spellCheck={false}
            onChange={(e) => setPeng(e.target.value)}
          />
        </label>
        <span className="hint">{t.imp.pasteHint}</span>
      </section>
      <section className="panel panel--key jimp__pre">
        <h2 className="panel__title">{t.imp.preview}</h2>
        {!def.trim() ? (
          <p className="hint">{t.imp.nothing}</p>
        ) : !pre ? (
          <p className="hint">{busy ? t.imp.reading : t.imp.empty}</p>
        ) : (
          <>
            <div className="row">
              <Pill tone={pre.slot.length ? "ok" : "warn"}>{t.imp.slots(pre.slot.length)}</Pill>
              <Pill tone="ok">{t.imp.subs(subs)}</Pill>
              <Pill tone={pre.kodeTakDikenal.length ? "warn" : "ok"}>
                {t.imp.codes(codes.size - pre.kodeTakDikenal.length)}
              </Pill>
            </div>
            {pre.kodeTakDikenal.length || pre.asing.length ? (
              <div className="banner banner--warn">
                <WarningIcon size={20} aria-hidden="true" />
                <span className="stack stack--sm">
                  {pre.kodeTakDikenal.length > 0 && (
                    <span>
                      <b>{t.imp.unknown}:</b>{" "}
                      <span className="mono">{pre.kodeTakDikenal.join(", ")}</span>
                    </span>
                  )}
                  {pre.asing.length > 0 && (
                    <span>
                      <b>{t.imp.ignored}:</b>{" "}
                      <span className="mono">{pre.asing.slice(0, 12).join(", ")}</span>
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <p className="panel__sub">{t.imp.allKnown}</p>
            )}
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={busy || pre.slot.length === 0}
              onClick={() => setConfirm(true)}
            >
              {t.imp.replace(semesterLabel)}
            </button>
            <span className="hint">{t.imp.replaceHint}</span>
          </>
        )}
      </section>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title={t.imp.replaceH}
        body={t.imp.replaceBody}
        confirmLabel={t.imp.replace(semesterLabel)}
        cancelLabel={t.cancel}
        tone="danger"
        onConfirm={simpan}
        lang={lang}
      />
    </div>
  );
}

/* ------------------------------------------------------------- arrange */

type Seats = Record<number, string[]>;

/** The seat under the pointer; the keyboard has no pointer, so it takes
 *  the closest seat instead. */
const seatUnder: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

function Arrange({
  lang,
  semester,
  data,
  meKode,
  onDone,
}: {
  lang: Lang;
  semester: string;
  data: DataJadwal;
  meKode: string;
  onDone: () => void;
}) {
  const t = J[lang];
  const rows = useMemo(() => data.jadwal.filter((j) => j.status !== "kosong"), [data.jadwal]);
  const awal = useMemo<Seats>(
    () =>
      Object.fromEntries(
        rows.map((j) => [j.id, pasanganSemester(j.asisten, j.jumlahKelompok).map((k) => k ?? "")]),
      ),
    [rows],
  );
  const [seats, setSeats] = useState<Seats>(awal);
  const [hist, setHist] = useState<Seats[]>([]);
  const [drag, setDrag] = useState<{ kode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const list of Object.values(seats))
      for (const k of new Set(list)) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [seats]);
  const changed = rows.filter((j) => JSON.stringify(seats[j.id]) !== JSON.stringify(awal[j.id]));

  function onStart(e: DragStartEvent) {
    setDrag(e.active.data.current as { kode: string });
  }
  function onEnd(e: DragEndEvent) {
    setDrag(null);
    const to = e.over?.id;
    const from = e.active.data.current as { kode: string; seat?: [number, number] };
    if (typeof to !== "string" || !to.startsWith("s:")) return;
    const [, jid, gi] = to.split(":").map(Number);
    if (from.seat && from.seat[0] === jid && from.seat[1] === gi) return;
    const next: Seats = JSON.parse(JSON.stringify(seats));
    const prev = next[jid][gi];
    next[jid][gi] = from.kode;
    if (from.seat) next[from.seat[0]][from.seat[1]] = prev;
    setHist((h) => [...h, seats]);
    setSeats(next);
    window.Toast?.show(
      from.seat && prev
        ? t.imp.swapped(from.kode, prev)
        : t.imp.filled(from.kode, kelompokLabel(gi + 1, lang)),
      "ok",
    );
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
          ubah: { asisten: seats[j.id] },
        });
        if (!r.ok) throw new Error();
        n++;
      }
      window.Toast?.show(t.imp.savedAll(n), "ok");
      onDone();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  const kodeOf = (d: unknown) => (d as { kode?: string } | undefined)?.kode ?? "";
  const seatName = (id: string | number) => {
    const [, jid, gi] = String(id).split(":").map(Number);
    const j = rows.find((x) => x.id === jid);
    return j
      ? `${hariLabel(j.hari, lang)} ${SLOT_MULAI[j.slot]}, ${kelompokLabel(gi + 1, lang)}`
      : "";
  };

  if (rows.length === 0) return <p className="hint">{t.imp.noSlots}</p>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={seatUnder}
      accessibility={{
        screenReaderInstructions: { draggable: t.imp.srHint },
        announcements: {
          onDragStart: ({ active }) => t.imp.srLift(kodeOf(active.data.current)),
          onDragOver: ({ active, over }) =>
            over ? t.imp.srOver(kodeOf(active.data.current), seatName(over.id)) : undefined,
          onDragEnd: ({ active, over }) =>
            over ? t.imp.srDrop(kodeOf(active.data.current), seatName(over.id)) : undefined,
          onDragCancel: ({ active }) => t.imp.srCancel(kodeOf(active.data.current)),
        },
      }}
      onDragStart={onStart}
      onDragEnd={onEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="impsplit">
        <section className="panel jpool">
          <h2 className="panel__title">{t.imp.poolTitle}</h2>
          <span className="hint">{t.imp.poolHint}</span>
          <div className="jpool__list">
            {data.asisten.map((a) => (
              <PoolRow
                key={a.nim}
                kode={a.kode.toUpperCase()}
                nama={a.nama}
                off={a.status !== "aktif" ? statusOrangLabel(a.status, lang) : null}
                n={load.get(a.kode.toUpperCase()) ?? 0}
                me={a.kode.toUpperCase() === meKode}
              />
            ))}
          </div>
        </section>
        <div className="stack">
          <div className="row impbar">
            {hist.length > 0 && (
              <>
                <Pill tone="accent">{t.imp.changes(changed.length)}</Pill>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const h = [...hist];
                    setSeats(h.pop()!);
                    setHist(h);
                  }}
                >
                  {t.imp.undo}
                </button>
              </>
            )}
            <span className="grow" />
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || changed.length === 0}
              onClick={() => void simpan()}
            >
              {t.imp.saveAll}
            </button>
          </div>
          <div className="impgrid">
            {rows.map((j) => (
              <SlotCard
                key={j.id}
                j={j}
                seats={seats[j.id]}
                lang={lang}
                meKode={meKode}
                drag={drag}
              />
            ))}
          </div>
        </div>
      </div>
      <DragLayer>
        {drag && <span className="acode impchip impchip--lifted">{drag.kode}</span>}
      </DragLayer>
    </DndContext>
  );
}

function PoolRow({
  kode,
  nama,
  off,
  n,
  me,
}: {
  kode: string;
  nama: string;
  off: string | null;
  n: number;
  me: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `p:${kode}`,
    data: { kode },
    disabled: !!off,
  });
  return (
    <div
      ref={setNodeRef}
      className="jpool__row"
      data-off={off ? "yes" : undefined}
      data-dragging={isDragging ? "yes" : undefined}
      {...attributes}
      {...listeners}
    >
      <DotsSixVerticalIcon size={16} aria-hidden="true" />
      <span className={`acode${me ? " acode--me" : ""}`}>{kode}</span>
      <span className="grow">{nama}</span>
      {off ? <Pill tone="warn">{off}</Pill> : <Pill tone={n >= 3 ? "warn" : undefined}>{n}</Pill>}
    </div>
  );
}

function SlotCard({
  j,
  seats,
  lang,
  meKode,
  drag,
}: {
  j: JadwalRow;
  seats: string[];
  lang: Lang;
  meKode: string;
  drag: { kode: string } | null;
}) {
  return (
    <div className="panel impcard" data-intl={j.kelas === "internasional" ? "yes" : undefined}>
      <b>
        {hariLabel(j.hari, lang)} · {SLOT_MULAI[j.slot]}
      </b>
      {seats.map((k, i) => (
        <Seat key={i} jid={j.id} gi={i} kode={k} lang={lang} meKode={meKode} drag={drag} />
      ))}
    </div>
  );
}

function Seat({
  jid,
  gi,
  kode,
  lang,
  meKode,
  drag,
}: {
  jid: number;
  gi: number;
  kode: string;
  lang: Lang;
  meKode: string;
  drag: { kode: string } | null;
}) {
  const t = J[lang];
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `s:${jid}:${gi}` });
  const chip = useDraggable({
    id: `c:${jid}:${gi}`,
    data: { kode, seat: [jid, gi] },
    disabled: !kode,
  });
  return (
    <div ref={dropRef} className="impdrop" data-over={isOver ? "yes" : undefined}>
      <Pill group={gi + 1}>{kelompokLabel(gi + 1, lang)}</Pill>
      {kode ? (
        <span
          ref={chip.setNodeRef}
          className={`acode impchip${kode === meKode ? " acode--me" : ""}`}
          data-dragging={chip.isDragging ? "yes" : undefined}
          {...chip.attributes}
          {...chip.listeners}
        >
          {kode}
        </span>
      ) : (
        <span className="hint">{t.imp.emptySeat}</span>
      )}
      {isOver && drag && kode && drag.kode !== kode && (
        <span className="hint">{t.imp.replaceSeat(kode)}</span>
      )}
    </div>
  );
}
