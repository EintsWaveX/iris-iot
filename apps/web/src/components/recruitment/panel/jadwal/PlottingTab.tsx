/**
 * The panel's Plotting tab (06, PRD 6 Shifts, mockup r2-plot): Slot (the
 * pick window from the Calendar with Perpanjang Sehari and Tutup Sekarang,
 * and the rooms of each evening), Permintaan (change requests, approve or
 * decline) and Papan (Belum memilih plus one column per room, dragged with
 * dnd-kit like the Panitia board; a full room asks first). Auto Isi places
 * those who did not pick, deterministically, with one Urungkan.
 *
 * Panitia with the Plotting right keep full control: every action here is
 * one request to slot-set, slot-decide or slot-autofill, answered by the
 * server, live on the recplotting topic.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { TrashIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import Confirm from "../../../ui/Confirm";
import { Stepper, TimeField } from "../../../ui/Controls";
import Dialog from "../../../ui/Dialog";
import Disclose from "../../../ui/Disclose";
import DragLayer from "../../../ui/DragLayer";
import IconButton from "../../../ui/IconButton";
import Pill from "../../../ui/Pill";
import SegmentedControl from "../../../ui/SegmentedControl";
import type { Lang } from "../../../../lib/kelas";
import { addDays } from "../../../../lib/recruitment/calendar";
import { isFail, recPost, useRecBoard } from "../../../../lib/recruitment/client";
import { tanggalWib } from "../../../../lib/recruitment/gates";
import { pickEvent, seatsLeft } from "../../../../lib/recruitment/slots";
import { bukaBagian } from "../../../../lib/recruitment/panel-tab";
import type {
  BoardRequest,
  PlotBoardResponse,
  RecEvent,
  RecRights,
  SlotAutofillResponse,
  StageKey,
} from "../../../../lib/recruitment/types";
import { S2 } from "../../s2Strings";
import { tgl } from "../../shared";
import { useRevealMotion } from "../../reveal/fx";

type Slot = PlotBoardResponse["slots"][number];
const wib = (iso: string) => tanggalWib(new Date(iso));
const iso = (tanggal: string, jam: string) => `${tanggal}T${jam}:00+07:00`;
const label = (s: Slot, lang: Lang) => `${s.room}, ${tgl(wib(s.startsAt).tanggal, lang)}`;
const depan = (n: string) => n.split(" ")[0] ?? n;

function Kapasitas({ s }: { s: Slot }) {
  return (
    <span className="r2cap__bar">
      <i style={{ width: `${Math.min(100, s.capacity ? (s.taken / s.capacity) * 100 : 0)}%` }} />
    </span>
  );
}

/* ------------------------------------------------------------- Slot */

function SlotTab({
  lang,
  stage,
  events,
  data,
  can,
  refresh,
}: {
  lang: Lang;
  stage: StageKey;
  events: RecEvent[];
  data: PlotBoardResponse;
  can: boolean;
  refresh: () => void;
}) {
  const t = S2[lang].plot;
  const pe = pickEvent(events, stage);
  const w = data.window;
  const kursi = data.slots.reduce((a, s) => a + s.capacity, 0);
  const peserta = data.unplaced.length + data.slots.reduce((a, s) => a + s.taken, 0);
  // The evenings: every day of the stage's test, interview or teaching event, plus makeup days and any day a slot already has.
  const malam = useMemo(() => {
    const hari = new Set<string>();
    for (const e of events)
      if (e.stage === stage && ["test", "interview", "teaching"].includes(e.kind))
        for (let d = e.startsOn; d <= e.endsOn; d = addDays(d, 1)) hari.add(d);
    for (const s of data.slots) hari.add(wib(s.startsAt).tanggal);
    return [...hari].sort();
  }, [events, stage, data.slots]);
  const makeup = events.filter((e) => e.stage === stage && e.kind === "makeup");
  const [busy, setBusy] = useState(false);
  const [hapus, setHapus] = useState<Slot | null>(null);

  async function panggil(body: Record<string, unknown>, ok?: string) {
    setBusy(true);
    const r = await recPost<{ ok: true; endsOn?: string }>("slot-set", { ...body });
    setBusy(false);
    if (isFail(r)) {
      window.Toast?.show(
        r.kode === "slot_terisi" ? t.slotBusy : r.kode === "jendela_tutup" ? t.winClosed : t.fail,
        "danger",
      );
      refresh();
      return false;
    }
    if (ok) window.Toast?.show(ok, "ok");
    refresh();
    return true;
  }
  const tutupLabel = w
    ? `${tgl(wib(new Date(Date.parse(w.closesAt) - 1).toISOString()).tanggal, lang)}, ${wib(new Date(Date.parse(w.closesAt) - 1).toISOString()).jam}`
    : "";
  const bukaLabel = w ? `${tgl(wib(w.opensAt).tanggal, lang)}, ${wib(w.opensAt).jam}` : "";
  const sudahBuka = w && Date.now() >= Date.parse(w.opensAt);

  return (
    <div className="stack">
      {w && pe && (
        <section className="panel r2win">
          <div className="stack stack--sm" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <b>{t.window}</b>
              <Pill tone={w.open ? "ok" : undefined}>
                {w.open ? t.openBadge : sudahBuka ? t.closedBadge : t.soonBadge}
              </Pill>
            </div>
            <span className="hint">{t.windowLine(bukaLabel, tutupLabel)}</span>
            <div className="r2cap">
              <span className="r2cap__bar">
                <i style={{ width: `${Math.min(100, kursi ? (peserta / kursi) * 100 : 0)}%` }} />
              </span>
              <span className="hint num">{t.seatsFor(kursi, peserta)}</span>
            </div>
          </div>
          {can && (
            <div className="row r2win__acts">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => bukaBagian("kalender")}
              >
                <span className="btn__label">{t.calendar}</span>
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={async () => {
                  if (await panggil({ op: "window", stage, mode: "extend" }))
                    window.Toast?.show(
                      t.extended(
                        tgl(
                          addDays(
                            wib(new Date(Date.parse(w.closesAt) - 1).toISOString()).tanggal,
                            1,
                          ),
                          lang,
                        ),
                      ),
                      "ok",
                    );
                }}
              >
                <span className="btn__label">{t.extend}</span>
              </button>
              <button
                type="button"
                className="btn btn--danger-soft"
                disabled={busy || !w.open}
                onClick={async () => {
                  if (await panggil({ op: "window", stage, mode: "close" }))
                    window.Toast?.show(t.closedNow, "warn");
                }}
              >
                <span className="btn__label">{t.closeNow}</span>
              </button>
            </div>
          )}
        </section>
      )}
      <div className="r2setup">
        {malam.map((d) => {
          const di = data.slots.filter((s) => wib(s.startsAt).tanggal === d);
          return (
            <section className="panel r2eveset" key={d}>
              <div className="panel__head">
                <div className="stack" style={{ gap: 2 }}>
                  <h3 className="panel__title">{tgl(d, lang)}</h3>
                  <span className="hint">{t.eveningHint}</span>
                </div>
              </div>
              {di.map((s) => (
                <SlotRow
                  key={s.id}
                  s={s}
                  lang={lang}
                  can={can}
                  busy={busy}
                  onSave={(b) => panggil({ op: "edit", id: s.id, ...b })}
                  onDelete={() => setHapus(s)}
                />
              ))}
              {can && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() =>
                    void panggil(
                      {
                        op: "create",
                        stage,
                        room: `R${di.length + 1}`,
                        startsAt: iso(d, "18:30"),
                        endsAt: iso(d, "21:00"),
                        capacity: 15,
                      },
                      t.slotAdded,
                    )
                  }
                >
                  <span className="btn__label">{t.addRoom}</span>
                </button>
              )}
            </section>
          );
        })}
        {makeup.map((e) => (
          <section className="panel r2eveset" key={`m${e.id}`}>
            <div className="panel__head">
              <div className="stack" style={{ gap: 2 }}>
                <h3 className="panel__title">{tgl(e.startsOn, lang)}</h3>
                <span className="hint">{t.makeupHint}</span>
              </div>
            </div>
            {data.slots.some((s) => wib(s.startsAt).tanggal === e.startsOn) ? null : (
              <span className="hint">{t.noSlotsYet}</span>
            )}
            {can && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() =>
                  void panggil(
                    {
                      op: "create",
                      stage,
                      eventId: e.id,
                      room: "R1",
                      startsAt: iso(e.startsOn, e.dayStart ?? "18:30"),
                      endsAt: iso(e.startsOn, e.dayEnd ?? "21:00"),
                      capacity: 10,
                    },
                    t.slotAdded,
                  )
                }
              >
                <span className="btn__label">{t.addRoom}</span>
              </button>
            )}
          </section>
        ))}
      </div>
      <p className="hint">{t.slotRule}</p>
      <Confirm
        open={!!hapus}
        onOpenChange={(o) => !o && setHapus(null)}
        title={t.delete}
        body={hapus ? label(hapus, lang) : ""}
        confirmLabel={t.delete}
        lang={lang}
        onConfirm={async () => {
          if (!hapus) return;
          return panggil({ op: "delete", id: hapus.id }, t.slotGone);
        }}
      />
    </div>
  );
}

function SlotRow({
  s,
  lang,
  can,
  busy,
  onSave,
  onDelete,
}: {
  s: Slot;
  lang: Lang;
  can: boolean;
  busy: boolean;
  onSave: (b: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const t = S2[lang].plot;
  const d = wib(s.startsAt).tanggal;
  const [room, setRoom] = useState(s.room);
  useEffect(() => setRoom(s.room), [s.room]);
  return (
    <div className="r2slotset">
      <label className="r2f">
        <span className="hint">{t.room}</span>
        <input
          className="input"
          value={room}
          maxLength={24}
          disabled={!can}
          onChange={(e) => setRoom(e.target.value)}
          onBlur={() => room.trim() && room.trim() !== s.room && void onSave({ room: room.trim() })}
        />
      </label>
      <span className="r2f">
        <span className="hint">{t.starts}</span>
        <TimeField
          value={wib(s.startsAt).jam}
          from={16}
          label={t.starts}
          lang={lang}
          onChange={(v) => can && void onSave({ startsAt: iso(d, v) })}
        />
      </span>
      <span className="r2f">
        <span className="hint">{t.ends}</span>
        <TimeField
          value={wib(s.endsAt).jam}
          from={18}
          label={t.ends}
          lang={lang}
          onChange={(v) => can && void onSave({ endsAt: iso(d, v) })}
        />
      </span>
      <span className="r2f">
        <span className="hint">{t.seats}</span>
        <Stepper
          value={s.capacity}
          min={Math.max(1, s.taken)}
          max={200}
          label={t.capacity}
          lessLabel="-"
          moreLabel="+"
          onChange={(v) => can && !busy && void onSave({ capacity: v })}
        />
      </span>
      <span className="r2f r2f--n">
        <span className="hint">{t.taken}</span>
        <b className="num">{s.taken}</b>
      </span>
      {can && (
        <IconButton icon={TrashIcon} label={t.delete} disabled={s.taken > 0} onClick={onDelete} />
      )}
    </div>
  );
}

/* --------------------------------------------------------- Permintaan */

function Requests({
  lang,
  data,
  can,
  refresh,
}: {
  lang: Lang;
  data: PlotBoardResponse;
  can: boolean;
  refresh: () => void;
}) {
  const t = S2[lang].plot;
  const slot = (id: number | null) => data.slots.find((s) => s.id === id);
  const buka = data.requests.filter((r) => r.status === "open");
  const putus = data.requests.filter((r) => r.status !== "open");
  const [tolak, setTolak] = useState<BoardRequest | null>(null);
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);

  async function putuskan(r: BoardRequest, approve: boolean, over = false, note?: string) {
    setBusy(true);
    const res = await recPost<{ ok: true }>("slot-decide", { id: r.id, approve, over, note });
    setBusy(false);
    if (isFail(res)) {
      window.Toast?.show(res.kode === "penuh" ? t.targetFull : t.fail, "danger");
      refresh();
      return false;
    }
    const ke = slot(r.toSlot);
    window.Toast?.show(
      approve ? t.moved(depan(r.nama), ke ? ke.room : "") : t.declinedToast,
      approve ? "ok" : undefined,
    );
    refresh();
    return true;
  }
  const Garis = ({ id }: { id: number | null }) => {
    const s = slot(id);
    return (
      <span className="r2req__slot">
        <b>{s?.room ?? "-"}</b>
        <span className="hint">{s ? tgl(wib(s.startsAt).tanggal, lang) : ""}</span>
      </span>
    );
  };
  return (
    <div className="stack">
      {buka.length ? (
        <ul className="r2reqs">
          {buka.map((r) => {
            const ke = slot(r.toSlot);
            const penuh = !!ke && seatsLeft(ke, ke.taken) === 0;
            return (
              <li className="panel r2req" key={r.id}>
                <div className="r2req__who">
                  <b>{r.nama}</b>
                  <span className="hint mono">{r.nim}</span>
                </div>
                <div className="r2req__move">
                  <Garis id={r.fromSlot} />
                  <span aria-hidden="true">→</span>
                  <Garis id={r.toSlot} />
                  {penuh ? (
                    <Pill tone="warn">{t.targetFull}</Pill>
                  ) : (
                    ke && <span className="hint num">{t.left(seatsLeft(ke, ke.taken))}</span>
                  )}
                </div>
                <p className="r2req__why">{r.reason}</p>
                <div className="r2req__foot">
                  <span className="hint">{`${t.asked} ${tgl(wib(r.createdAt).tanggal, lang)}, ${wib(r.createdAt).jam}`}</span>
                  <span className="grow" style={{ flex: 1 }} />
                  {can && (
                    <>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() => {
                          setCatatan("");
                          setTolak(r);
                        }}
                      >
                        {t.decline}
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={busy}
                        onClick={() => void putuskan(r, true, penuh)}
                      >
                        {penuh ? t.approveOver : t.approve}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="panel r2empty">
          <b>{t.noReq}</b>
          <span className="hint">{t.noReqHint}</span>
        </section>
      )}
      {putus.length > 0 && (
        <Disclose head={<b>{t.decided(putus.length)}</b>}>
          <ul className="r2done">
            {putus.map((r) => (
              <li key={r.id}>
                <span>{r.nama}</span>
                <span className="hint">{`${slot(r.fromSlot)?.room ?? "-"} → ${slot(r.toSlot)?.room ?? "-"}`}</span>
                <Pill tone={r.status === "approved" ? "ok" : undefined}>
                  {r.status === "approved"
                    ? t.approvedBadge
                    : r.status === "declined"
                      ? t.declinedBadge
                      : t.withdrawnBadge}
                </Pill>
                <span className="acode">{r.decidedBy ? r.decidedBy.slice(-3) : ""}</span>
              </li>
            ))}
          </ul>
        </Disclose>
      )}
      {tolak && (
        <Dialog
          open
          onOpenChange={(o) => !o && setTolak(null)}
          title={t.declineTitle}
          description={t.declineDesc(tolak.nama, slot(tolak.fromSlot)?.room ?? "")}
          size="sm"
          lang={lang}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setTolak(null)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={async () => {
                  if (await putuskan(tolak, false, false, catatan.trim() || undefined))
                    setTolak(null);
                }}
              >
                {t.decline}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="rec-chips">
              {t.declineReasons.map((x) => (
                <button
                  type="button"
                  className="chipbtn"
                  key={x}
                  aria-pressed={catatan === x}
                  onClick={() => setCatatan(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            <textarea
              className="textarea"
              rows={3}
              maxLength={200}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder={t.declineNote}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Papan */

interface Kartu {
  candidateId: number;
  nim: string;
  nama: string;
  via: "self" | "auto" | "panitia" | null;
  dari: number | "pool";
}

function Chip({ x, can, hit, lang }: { x: Kartu; can: boolean; hit: boolean; lang: Lang }) {
  const t = S2[lang].plot;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `c:${x.candidateId}`,
    data: x,
    disabled: !can,
  });
  return (
    <div
      ref={setNodeRef}
      className="r2chip"
      data-dnd-id={x.candidateId}
      data-hit={hit ? "yes" : undefined}
      data-static={can ? undefined : "yes"}
      style={isDragging ? { opacity: 0.4 } : undefined}
      {...(can ? { ...attributes, ...listeners } : {})}
    >
      <span className="r2chip__n">{x.nama}</span>
      {x.via === "auto" && <span className="r2chip__via">{t.auto}</span>}
      {x.via === "panitia" && <span className="r2chip__via">{t.panitia}</span>}
    </div>
  );
}

function Lajur({
  id,
  disabled,
  className,
  children,
  over,
}: {
  id: string;
  disabled: boolean;
  className: string;
  children: React.ReactNode;
  over?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <section
      ref={setNodeRef}
      className={className}
      data-over={over ? "yes" : undefined}
      data-drop={isOver && !disabled ? "yes" : undefined}
    >
      {children}
    </section>
  );
}

function Papan({
  lang,
  stage,
  data,
  can,
  refresh,
}: {
  lang: Lang;
  stage: StageKey;
  data: PlotBoardResponse;
  can: boolean;
  refresh: () => void;
}) {
  const t = S2[lang].plot;
  const motion = useRevealMotion();
  const root = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [tanya, setTanya] = useState<{ c: Kartu; ke: Slot } | null>(null);
  const [angkat, setAngkat] = useState<Kartu | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const pool: Kartu[] = data.unplaced.map((u) => ({ ...u, via: null, dari: "pool" }));
  const hari = [...new Set(data.slots.map((s) => wib(s.startsAt).tanggal))].sort();
  const cari: CollisionDetection = (a) => {
    const w = pointerWithin(a);
    return w.length ? w : closestCenter(a);
  };

  async function pindah(c: Kartu, ke: Slot | null, over = false) {
    const dari = c.dari === "pool" ? null : data.slots.find((s) => s.id === c.dari);
    const r = await recPost<{ ok: true }>("slot-set", {
      op: "move",
      candidateId: c.candidateId,
      stage,
      toSlot: ke ? ke.id : null,
      over,
    });
    if (isFail(r)) {
      window.Toast?.show(r.kode === "penuh" ? t.fullTitle : t.fail, "danger");
      refresh();
      return;
    }
    window.Toast?.show(
      ke ? (over ? t.placedOver : t.moved(depan(c.nama), ke.room)) : t.released(depan(c.nama)),
      over ? "warn" : "ok",
    );
    void dari;
    refresh();
  }
  function selesai(e: DragEndEvent) {
    setAngkat(null);
    const c = e.active.data.current as Kartu | undefined;
    const ke = e.over ? String(e.over.id) : null;
    if (!c || !ke) return;
    if (ke === "pool") return c.dari === "pool" ? undefined : void pindah(c, null);
    const slot = data.slots.find((s) => `slot:${s.id}` === ke);
    if (!slot || c.dari === slot.id) return;
    if (slot.taken >= slot.capacity) return setTanya({ c, ke: slot });
    void pindah(c, slot);
  }
  async function autoisi() {
    const el = root.current;
    const awal = new Map<string, DOMRect>();
    el?.querySelectorAll("[data-dnd-id]").forEach((n) =>
      awal.set(n.getAttribute("data-dnd-id") ?? "", n.getBoundingClientRect()),
    );
    const r = await recPost<SlotAutofillResponse>("slot-autofill", { stage });
    if (isFail(r)) {
      window.Toast?.show(t.fail, "danger");
      return;
    }
    refresh();
    // One toast: with Urungkan when there is something to take back.
    const at = r.at;
    window.Toast?.show(
      r.left ? `${t.autoDone(r.placed)} ${t.autoLeft(r.left)}` : t.autoDone(r.placed),
      r.left ? "warn" : "ok",
      at
        ? ({
            action: {
              label: t.undo,
              onClick: async () => {
                await recPost("slot-autofill", { stage, undo: at });
                refresh();
              },
            },
          } as never)
        : undefined,
    );
    // FLIP: every chip that moved flies from where it was, staggered 20 ms.
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (!el || motion === "reduce") return;
        let i = 0;
        el.querySelectorAll("[data-dnd-id]").forEach((nd) => {
          const r0 = awal.get(nd.getAttribute("data-dnd-id") ?? "");
          if (!r0) return;
          const r1 = nd.getBoundingClientRect();
          const dx = r0.left - r1.left;
          const dy = r0.top - r1.top;
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
          gsap.fromTo(
            nd,
            { x: dx, y: dy },
            {
              x: 0,
              y: 0,
              duration: 0.42,
              ease: "power3.out",
              delay: Math.min(i++, 20) * 0.02,
              clearProps: "transform",
            },
          );
        });
      }, 250),
    );
  }
  const cocok = (n: string) => !!q.trim() && n.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <div className="stack" ref={root}>
      <div className="row rec-tools">
        <div className="rec-search">
          <input
            className="field__input"
            placeholder={t.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t.searchLabel}
          />
        </div>
        <span className="grow" />
        <span className="hint">{t.noMark}</span>
        {can && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!pool.length || data.slots.length === 0}
            onClick={() => void autoisi()}
          >
            <span className="btn__label">
              {pool.length ? t.autoFill(pool.length) : t.everyoneHas}
            </span>
          </button>
        )}
      </div>
      {data.slots.length === 0 ? (
        <p className="empty-note">{t.noSlots}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={cari}
          onDragStart={(e) => setAngkat(e.active.data.current as Kartu)}
          onDragEnd={selesai}
          onDragCancel={() => setAngkat(null)}
        >
          <div className="r2board scrollx">
            <Lajur id="pool" disabled={!can} className="r2col r2col--pool">
              <div className="r2col__head">
                <b>{t.notPicked}</b>
                <span className="hint num">{pool.length}</span>
              </div>
              <div className="r2col__list">
                {pool.map((x) => (
                  <Chip key={x.candidateId} x={x} can={can} hit={cocok(x.nama)} lang={lang} />
                ))}
                {!pool.length && <span className="hint">{t.allHave}</span>}
              </div>
            </Lajur>
            {hari.map((d) => (
              <div className="r2colgrp" key={d}>
                <span className="r2colgrp__h">{tgl(d, lang)}</span>
                <div className="r2colgrp__cols">
                  {data.slots
                    .filter((s) => wib(s.startsAt).tanggal === d)
                    .map((s) => (
                      <Lajur
                        key={s.id}
                        id={`slot:${s.id}`}
                        disabled={!can}
                        className="r2col"
                        over={s.taken > s.capacity}
                      >
                        <div className="r2col__head">
                          <b>{s.room}</b>
                          <span className="num r2col__n">{`${s.taken}/${s.capacity}`}</span>
                        </div>
                        <Kapasitas s={s} />
                        <div className="r2col__list">
                          {s.seats.map((x) => (
                            <Chip
                              key={x.candidateId}
                              x={{ ...x, dari: s.id }}
                              can={can}
                              hit={cocok(x.nama)}
                              lang={lang}
                            />
                          ))}
                        </div>
                      </Lajur>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <DragLayer>
            {angkat ? (
              <div className="r2chip">
                <span className="r2chip__n">{angkat.nama}</span>
              </div>
            ) : null}
          </DragLayer>
        </DndContext>
      )}
      {tanya && (
        <Dialog
          open
          onOpenChange={(o) => !o && setTanya(null)}
          title={t.fullTitle}
          description={t.fullDesc(
            label(tanya.ke, lang),
            tanya.ke.taken,
            tanya.ke.capacity,
            depan(tanya.c.nama),
          )}
          size="sm"
          lang={lang}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setTanya(null)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const x = tanya;
                  setTanya(null);
                  void pindah(x.c, x.ke, true);
                }}
              >
                {t.placeOver}
              </button>
            </>
          }
        >
          <span className="hint">{t.fullHint}</span>
        </Dialog>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- the tab */

export default function PlottingTab({
  lang,
  events,
  rights,
}: {
  lang: Lang;
  events: RecEvent[];
  rights: RecRights;
}) {
  const t = S2[lang].plot;
  const stages = (["tes_tulis", "wawancara", "mengajar"] as StageKey[]).filter((s) =>
    pickEvent(events, s),
  );
  const [stage, setStage] = useState<StageKey>("tes_tulis");
  const aktif = stages.includes(stage) ? stage : (stages[0] ?? "tes_tulis");
  const [bag, setBag] = useState<"slot" | "minta" | "papan">("slot");
  const board = useRecBoard(aktif, true);
  const can = rights.plotting;
  const d = board.data;
  const bukaN = d?.requests.filter((r) => r.status === "open").length ?? 0;
  if (!d) return <span className="skeleton" style={{ height: 360 }} />;
  return (
    <div className="stack">
      <div className="row row--between r2plot__top">
        <SegmentedControl
          aria-label={t.title}
          value={bag}
          onValueChange={(v) => setBag(v as typeof bag)}
          options={[
            { value: "slot", label: t.slot },
            { value: "minta", label: bukaN ? `${t.requests} (${bukaN})` : t.requests },
            { value: "papan", label: t.board },
          ]}
        />
        {stages.length > 1 && (
          <SegmentedControl
            aria-label={t.stageLabel}
            value={aktif}
            onValueChange={(v) => setStage(v as StageKey)}
            options={stages.map((s) => ({
              value: s,
              label: S2[lang].inbox.stage[s as "berkas"] ?? s,
            }))}
          />
        )}
        <span className="hint">{t.reuse}</span>
      </div>
      {bag === "slot" ? (
        <SlotTab
          lang={lang}
          stage={aktif}
          events={events}
          data={d}
          can={can}
          refresh={board.refresh}
        />
      ) : bag === "minta" ? (
        <Requests lang={lang} data={d} can={can} refresh={board.refresh} />
      ) : (
        <Papan lang={lang} stage={aktif} data={d} can={can} refresh={board.refresh} />
      )}
    </div>
  );
}
