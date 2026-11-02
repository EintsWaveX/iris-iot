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
import { useMemo, useRef, useState } from "react";
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
import {
  BroadcastIcon,
  CalendarBlankIcon,
  ClockIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import TabLine from "../../../ui/TabLine";
import Dropdown from "../../../ui/Dropdown";
import gsap from "gsap";
import Confirm from "../../../ui/Confirm";
import CrewBoard from "../iv/CrewBoard";
import type { CrewCtx, ExData } from "../iv/CrewPapan";
import { CB } from "../iv/crewBoardStrings";
import { unduhXlsx } from "../../../../lib/xlsx";
import { isIvStage } from "../../../../lib/recruitment/interview";
import { isMakeupStage } from "../../../../lib/recruitment/makeup";
import PapanSusulan from "./PapanSusulan";
import { Stepper, TimeField } from "../../../ui/Controls";
import Dialog from "../../../ui/Dialog";
import Disclose from "../../../ui/Disclose";
import DragLayer from "../../../ui/DragLayer";
import IconButton from "../../../ui/IconButton";
import Pill from "../../../ui/Pill";
import type { Lang } from "../../../../lib/kelas";
import { addDays } from "../../../../lib/recruitment/calendar";
import { isFail, recPost, useRecBoard } from "../../../../lib/recruitment/client";
import { tanggalWib } from "../../../../lib/recruitment/gates";
import { pickEvent, seatsLeft, tutupTampil } from "../../../../lib/recruitment/slots";
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
import "../../recruitment-plot.css";

type Slot = PlotBoardResponse["slots"][number];
const wib = (iso: string) => tanggalWib(new Date(iso));
const iso = (tanggal: string, jam: string) => `${tanggal}T${jam}:00+07:00`;
/** "Selasa, 17 Nov": the short date a request card shows for a slot (the mockup's). */
const hariRingkas = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
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

/** The window card says what the stage is, and an interview slot counts booths (bilik) rather than seats. */
const WIN_TITLE: Record<Lang, Partial<Record<StageKey, string>>> = {
  id: {
    tes_tulis: "Jadwal Tes Tulis dan Program",
    wawancara: "Jadwal Tes Wawancara",
    mengajar: "Jadwal Tes Mengajar",
  },
  en: {
    tes_tulis: "Written and Coding Test Schedule",
    wawancara: "Interview Schedule",
    mengajar: "Teaching Test Schedule",
  },
  zh: { tes_tulis: "笔试与编程日程", wawancara: "面试日程", mengajar: "试讲日程" },
};
const winTitle = (lang: Lang, stage: StageKey, fallback: string) =>
  WIN_TITLE[lang][stage] ?? fallback;
const seatUnit = (lang: Lang, stage: StageKey, seats: string) =>
  stage === "wawancara"
    ? lang === "id"
      ? "bilik"
      : lang === "zh"
        ? "间"
        : "booths"
    : seats.toLowerCase();
const seatsText = (
  lang: Lang,
  stage: StageKey,
  kursi: number,
  peserta: number,
  fallback: (s: number, n: number) => string,
) =>
  stage === "wawancara"
    ? lang === "id"
      ? `${kursi} bilik untuk ${peserta} kandidat`
      : lang === "zh"
        ? `${kursi} 间，${peserta} 位候选人`
        : `${kursi} booths for ${peserta} candidates`
    : fallback(kursi, peserta);

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
  // The room dialog: a new room on a day (with the makeup event it belongs to) or one slot being edited.
  const [dlg, setDlg] = useState<{
    day: string;
    eventId?: number;
    slot?: Slot;
  } | null>(null);

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
    ? `${tgl(wib(tutupTampil(w.closesAt).toISOString()).tanggal, lang)}, ${wib(tutupTampil(w.closesAt).toISOString()).jam}`
    : "";
  const bukaLabel = w ? `${tgl(wib(w.opensAt).tanggal, lang)}, ${wib(w.opensAt).jam}` : "";
  const sudahBuka = w && Date.now() >= Date.parse(w.opensAt);
  // Past its close time: the window only offers to open again, not to extend or close.
  const tutup = !!w && !w.open && !!sudahBuka;

  const tiny = (jam: string) => jam.replace(":", ".");
  const sampai = lang === "id" ? "sampai" : lang === "zh" ? "至" : "to";
  const kartuHari = (d: string, judul: string, eventId?: number, susulan?: boolean) => {
    const di = data.slots.filter((s) => wib(s.startsAt).tanggal === d);
    return (
      <section
        className="panel n7-eve"
        data-s={susulan ? "yes" : "no"}
        key={`${d}${eventId ?? ""}`}
      >
        <div className="n7-eve__h">
          <b>{judul}</b>
          <span className="hint num">
            {di.reduce((a, s) => a + s.capacity, 0)} {seatUnit(lang, stage, t.seats)}
          </span>
        </div>
        {!di.length && susulan && <span className="hint">{t.noSlotsYet}</span>}
        <div className="n7-eve__rooms">
          {di.map((s) => (
            <div className="n7-room" key={s.id}>
              <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                <b>{s.room}</b>
                <span className="hint">
                  {tiny(wib(s.startsAt).jam)} {sampai} {tiny(wib(s.endsAt).jam)}
                </span>
              </div>
              <div className="n7-room__cap">
                <Kapasitas s={s} />
                <span className="hint num">
                  {s.taken}/{s.capacity}
                </span>
              </div>
              {can && (
                <span className="n7-room__act">
                  <IconButton
                    icon={PencilSimpleIcon}
                    label={t.edit}
                    onClick={() => setDlg({ day: d, eventId, slot: s })}
                  />
                  <IconButton
                    icon={TrashIcon}
                    label={s.taken > 0 ? t.slotRule : t.delete}
                    disabled={s.taken > 0}
                    onClick={() => setHapus(s)}
                  />
                </span>
              )}
            </div>
          ))}
        </div>
        {can && (
          <button
            type="button"
            className="n7-addroom"
            disabled={busy}
            onClick={() => setDlg({ day: d, eventId })}
          >
            <PlusIcon size={18} aria-hidden="true" />
            <span>{t.addRoom}</span>
          </button>
        )}
      </section>
    );
  };
  const Ik = w?.open ? BroadcastIcon : tutup ? LockSimpleIcon : ClockIcon;
  const wst = w?.open ? "buka" : tutup ? "tutup" : "belum";

  return (
    <div className="stack">
      {w && pe && (
        <section className="panel n7-win" data-st={wst}>
          <div className="n7-win__l">
            <span className="n7-win__ic">
              <Ik size={24} aria-hidden="true" />
            </span>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <b className="n7-win__t">{winTitle(lang, stage, t.window)}</b>
                <Pill tone={w.open ? "ok" : sudahBuka ? undefined : "warn"}>
                  {w.open ? t.openBadge : sudahBuka ? t.closedBadge : t.soonBadge}
                </Pill>
              </div>
              <span className="hint">{t.windowLine(bukaLabel, tutupLabel)}</span>
            </div>
          </div>
          <div className="n7-win__m">
            <Kapasitas s={{ taken: peserta, capacity: kursi } as Slot} />
            <span className="hint num">{seatsText(lang, stage, kursi, peserta, t.seatsFor)}</span>
          </div>
          {can && (
            <div className="n7-win__a">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => bukaBagian("kalender")}
              >
                <CalendarBlankIcon size={18} aria-hidden="true" />
                <span className="btn__label">{t.calendar}</span>
              </button>
              {tutup ? (
                <button
                  type="button"
                  className="btn btn--inverse"
                  disabled={busy}
                  onClick={async () => {
                    if (await panggil({ op: "window", stage, mode: "extend" }))
                      window.Toast?.show(
                        t.reopened(tgl(addDays(wib(new Date().toISOString()).tanggal, 1), lang)),
                        "ok",
                      );
                  }}
                >
                  <LockSimpleOpenIcon size={18} aria-hidden="true" />
                  <span className="btn__label">{t.reopen}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--inverse"
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
                    <PlusIcon size={18} aria-hidden="true" />
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
                    <LockSimpleIcon size={18} aria-hidden="true" />
                    <span className="btn__label">{t.closeNow}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}
      <div className="n7-nights4">
        {malam.map((d) => kartuHari(d, tgl(d, lang)))}
        {makeup.map((e) =>
          kartuHari(e.startsOn, `${tgl(e.startsOn, lang)} (${t.makeupWord})`, e.id, true),
        )}
      </div>
      <p className="hint">{t.slotRule}</p>
      {dlg && (
        <RoomDlg
          lang={lang}
          stage={stage}
          dlg={dlg}
          busy={busy}
          onClose={() => setDlg(null)}
          onSave={async (b) => {
            const ok = dlg.slot
              ? await panggil({ op: "edit", id: dlg.slot.id, ...b }, t.slotSaved)
              : await panggil(
                  {
                    op: "create",
                    stage,
                    ...(dlg.eventId ? { eventId: dlg.eventId } : {}),
                    ...b,
                  },
                  t.slotAdded,
                );
            if (ok) setDlg(null);
          }}
        />
      )}
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

function RoomDlg({
  lang,
  stage,
  dlg,
  busy,
  onClose,
  onSave,
}: {
  lang: Lang;
  stage: StageKey;
  dlg: { day: string; eventId?: number; slot?: Slot };
  busy: boolean;
  onClose: () => void;
  onSave: (b: Record<string, unknown>) => Promise<void>;
}) {
  const t = S2[lang].plot;
  const ed = dlg.slot;
  const [room, setRoom] = useState(ed?.room ?? "");
  const [mulai, setMulai] = useState(ed ? wib(ed.startsAt).jam : "18:30");
  const [akhir, setAkhir] = useState(ed ? wib(ed.endsAt).jam : "21:00");
  const [cap, setCap] = useState(ed?.capacity ?? (dlg.eventId ? 10 : 15));
  const salah = !room.trim() || akhir <= mulai;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={ed ? t.editRoom : t.addRoom}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || salah}
            onClick={() =>
              void onSave({
                room: room.trim(),
                startsAt: iso(dlg.day, mulai),
                endsAt: iso(dlg.day, akhir),
                capacity: cap,
              })
            }
          >
            <span className="btn__label">{t.save}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="stack stack--sm">
          <span className="hint">{t.room}</span>
          <input
            className="field__input"
            value={room}
            maxLength={24}
            placeholder={stage === "wawancara" ? "TULT 0604" : "TULT 0604"}
            onChange={(e) => setRoom(e.target.value)}
          />
        </label>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <span className="stack stack--sm">
            <span className="hint">{t.starts}</span>
            <TimeField value={mulai} from={16} label={t.starts} lang={lang} onChange={setMulai} />
          </span>
          <span className="stack stack--sm">
            <span className="hint">{t.ends}</span>
            <TimeField value={akhir} from={18} label={t.ends} lang={lang} onChange={setAkhir} />
          </span>
        </div>
        <span className="stack stack--sm">
          <span className="hint">{t.capacity}</span>
          <Stepper
            value={cap}
            min={Math.max(1, ed?.taken ?? 1)}
            max={200}
            label={t.capacity}
            lessLabel="-"
            moreLabel="+"
            onChange={setCap}
          />
        </span>
      </div>
    </Dialog>
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
        <span className="hint">{s ? hariRingkas(s.startsAt, lang) : ""}</span>
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
          description={t.declineDesc(
            tolak.nama,
            (() => {
              const x = slot(tolak.fromSlot);
              return x ? label(x, lang) : "";
            })(),
          )}
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
  clash?: Slot["seats"][number]["clash"];
}

function Chip({ x, can, hit, lang }: { x: Kartu; can: boolean; hit: boolean; lang: Lang }) {
  const t = S2[lang].plot;
  const cb = CB(lang);
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
      data-flag={x.clash ? "yes" : undefined}
      title={
        x.clash
          ? cb.clashTip(
              S2[lang].inbox.stage[x.clash.stage as "berkas"] ?? x.clash.stage,
              wib(x.clash.startsAt).jam,
              wib(x.clash.endsAt).jam,
              x.clash.room,
            )
          : undefined
      }
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
  col,
  flag,
}: {
  id: string;
  disabled: boolean;
  className: string;
  children: React.ReactNode;
  over?: boolean;
  col?: number;
  flag?: "danger" | "warn";
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <section
      ref={setNodeRef}
      className={className}
      data-col={col}
      data-over={over ? "yes" : undefined}
      data-flag={flag}
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
  crew,
}: {
  lang: Lang;
  stage: StageKey;
  data: PlotBoardResponse;
  can: boolean;
  refresh: () => void;
  /** Wawancara and Mengajar: the examiner pieces to place (the pool above the board, a lane in each slot card) */
  crew?: CrewCtx;
}) {
  const t = S2[lang].plot;
  const cb = CB(lang);
  const motion = useRevealMotion();
  const root = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [tanya, setTanya] = useState<{ c: Kartu; ke: Slot } | null>(null);
  const [angkat, setAngkat] = useState<Kartu | ExData | null>(null);
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
    const dr = e.active.data.current as Kartu | ExData | undefined;
    const ke = e.over ? String(e.over.id) : null;
    if (dr && "ex" in dr) return crew?.drop(dr, ke);
    const c = dr as Kartu | undefined;
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
  const unduh = () => {
    const rows: (string | number | null)[][] = data.slots.flatMap((sl) =>
      sl.seats.map((x, i) => [
        sl.room,
        tgl(wib(sl.startsAt).tanggal, lang),
        `${wib(sl.startsAt).jam} - ${wib(sl.endsAt).jam}`,
        i + 1,
        x.nama,
        x.nim,
      ]),
    );
    pool.forEach((x) => rows.push(["", "", "", "", x.nama, x.nim]));
    void unduhXlsx(
      `plotting-${stage}`,
      ["Ruang", "Tanggal", "Jam", "#", "Kandidat", "NIM"],
      rows,
      "Plotting",
    ).then(() => window.Toast?.show(cb.xlsxDone(`plotting-${stage}`), "ok"));
  };
  const cocok = (n: string) => !!q.trim() && n.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <div className="stack" ref={root}>
      <div className="row rec-tools">
        <div className="rec-search">
          <MagnifyingGlassIcon className="ic" size={16} aria-hidden="true" />
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
          <button type="button" className="btn btn--inverse btn--sm" onClick={unduh}>
            <span className="btn__label">{cb.xlsx}</span>
          </button>
        )}
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
          onDragStart={(e) => setAngkat(e.active.data.current as Kartu | ExData)}
          onDragEnd={selesai}
          onDragCancel={() => setAngkat(null)}
        >
          {crew?.top(
            data.slots.flatMap((sl) =>
              sl.seats
                .filter((x) => x.clash)
                .map((x) => ({
                  tone: "danger" as const,
                  text: cb.twoSlots(x.nama),
                  at: cb.twoAt(
                    label(sl, lang),
                    wib(sl.startsAt).jam,
                    S2[lang].inbox.stage[x.clash!.stage as "berkas"] ?? x.clash!.stage,
                    wib(x.clash!.startsAt).jam,
                    wib(x.clash!.endsAt).jam,
                    x.clash!.room,
                  ),
                  go: sl.id,
                  slotId: null,
                })),
            ),
          )}
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
                        col={s.id}
                        disabled={!can}
                        className="r2col"
                        over={s.taken > s.capacity}
                        flag={
                          crew?.flagsOf(s.id).some((f) => f.tone === "danger")
                            ? "danger"
                            : crew?.flagsOf(s.id).length
                              ? "warn"
                              : undefined
                        }
                      >
                        <div className="r2col__head">
                          <b>{s.room}</b>
                          <span className="num r2col__n">{`${s.taken}/${s.capacity}`}</span>
                        </div>
                        {crew && (
                          <span className="hint num r2col__t">
                            {wib(s.startsAt).jam} {cb.to} {wib(s.endsAt).jam}
                          </span>
                        )}
                        <Kapasitas s={s} />
                        {crew?.lane(s.id)}
                        {crew && crew.flagsOf(s.id).length > 0 && (
                          <ul className="r4flags">
                            {crew.flagsOf(s.id).map((f, i) => (
                              <li key={i} data-t={f.tone}>
                                {f.text}
                              </li>
                            ))}
                          </ul>
                        )}
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
              "ex" in angkat ? (
                crew?.overlay(angkat)
              ) : (
                <div className="r2chip">
                  <span className="r2chip__n">{angkat.nama}</span>
                </div>
              )
            ) : null}
          </DragLayer>
        </DndContext>
      )}
      {crew?.picker}
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

/** The colour each stage wears in Plotting (the mockup's) */
const STAGE_C: Partial<Record<StageKey, string>> = {
  tes_tulis: "#fb7185",
  wawancara: "#a78bfa",
  mengajar: "#5eead4",
};

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
    <div className="stack n7-plot" style={{ "--sc": STAGE_C[aktif] } as React.CSSProperties}>
      <div className="n7-bar">
        <TabLine
          label={t.title}
          value={bag}
          onChange={(v) => setBag(v)}
          tabs={[
            { v: "slot" as const, label: t.slot },
            { v: "minta" as const, label: t.requests, n: bukaN || undefined },
            { v: "papan" as const, label: t.board },
          ]}
        />
        <span className="grow" />
        {stages.length > 1 && (
          <span className="n7-stagepick" style={{ "--sc": STAGE_C[aktif] } as React.CSSProperties}>
            <span className="n7-stagepick__dot" />
            <Dropdown
              id="rec-plot-stage"
              label={t.stageLabel}
              hideLabel
              value={aktif}
              onChange={(v) => setStage(v as StageKey)}
              options={stages.map((s) => ({
                value: s,
                label: S2[lang].inbox.stage[s as "berkas"] ?? s,
              }))}
            />
          </span>
        )}
      </div>
      {bag === "slot" ? (
        <>
          <SlotTab
            lang={lang}
            stage={aktif}
            events={events}
            data={d}
            can={can}
            refresh={board.refresh}
          />
          {isIvStage(aktif) && <CrewBoard lang={lang} stage={aktif} rights={rights} part="slot" />}
        </>
      ) : bag === "minta" ? (
        <Requests lang={lang} data={d} can={can} refresh={board.refresh} />
      ) : (
        <>
          {isIvStage(aktif) ? (
            <CrewBoard lang={lang} stage={aktif} rights={rights} part="papan">
              {(crew) => (
                <Papan
                  lang={lang}
                  stage={aktif}
                  data={d}
                  can={can}
                  refresh={board.refresh}
                  crew={crew}
                />
              )}
            </CrewBoard>
          ) : (
            <Papan lang={lang} stage={aktif} data={d} can={can} refresh={board.refresh} />
          )}
          {isMakeupStage(aktif) && <PapanSusulan lang={lang} stage={aktif} can={can} />}
        </>
      )}
    </div>
  );
}
