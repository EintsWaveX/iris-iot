/**
 * The panel's Kalender (prompt 03, mockup r1-kalender): the month grid and
 * the agenda, and for the Ketua and Acara the editor, drag to move and
 * resize, and the confirm when an event's stage has already started.
 *
 * Every change is one request (event-move, event-save, event-delete); the
 * server answers 409 perlu_konfirmasi when the stage began, the page asks,
 * and sends the same request again with confirm:true. A change toasts with
 * Urungkan, which sends the change back. Candidates and every other Panitia
 * member see it at once through the reccalendar topic.
 */
import { useEffect, useRef, useState } from "react";
import SegmentedControl from "../../ui/SegmentedControl";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import type {
  EventDeleteRequest,
  EventMoveRequest,
  EventResponse,
  EventSaveRequest,
  RecEvent,
} from "../../../lib/recruitment/types";
import { Agenda, RecCalendar } from "../calendar/RecCalendar";
import EventDialog from "../calendar/EventDialog";
import { CAL } from "../calendar/calendarStrings";
import { REC } from "../recruitmentStrings";
import { Kartu, rentangAcara, tgl } from "../shared";
import { judulAcara } from "../judul";

interface Tanya {
  /** What changes, for the Before and After lines */
  nama: string;
  stage: string | null;
  sebelum: string;
  sesudah: string;
  hapus: boolean;
  /** Sends the same change again, confirmed; resolves true when it went */
  kirim: () => Promise<boolean>;
  /** The person backed out: the change that asked is dropped */
  batal: () => void;
}

export default function KalenderTab({
  lang,
  events,
  hariIni,
  canEdit,
  refresh,
}: {
  lang: Lang;
  events: RecEvent[];
  hariIni: string;
  canEdit: boolean;
  refresh: () => void;
}) {
  const c = CAL[lang];
  const r = REC[lang];
  const [view, setView] = useState<"bulan" | "agenda">("bulan");
  const [edit, setEdit] = useState<RecEvent | "baru" | null>(null);
  const [tanya, setTanya] = useState<Tanya | null>(null);
  // A drop shows at once, until the calendar reloads with the saved dates.
  const [ov, setOv] = useState<Record<number, { s: string; e: string }>>({});
  const awal = useRef(events);
  useEffect(() => {
    if (awal.current !== events) {
      awal.current = events;
      setOv({});
    }
  }, [events]);
  const tampil = events.map((e) =>
    ov[e.id] ? { ...e, startsOn: ov[e.id].s, endsOn: ov[e.id].e } : e,
  );

  const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok", undo?: () => void) =>
    window.Toast?.show(m, tone, undo ? { action: { label: r.undo, onClick: undo } } : undefined);
  const gagal = (k: string) => toast(k === "tanpa_hak" ? c.noRight : c.fail, "danger");

  /** Sends a change; on 409 it asks first and resolves true once the person went on. */
  async function kirim<T extends EventMoveRequest | EventSaveRequest | EventDeleteRequest>(
    aksi: "event-move" | "event-save" | "event-delete",
    body: T,
    nama: string,
    sebelum: string,
    sesudah: string,
    hapus = false,
  ): Promise<EventResponse | null> {
    const res = await recPost<EventResponse>(aksi, body);
    if (!isFail(res)) return res;
    if (res.kode === "perlu_konfirmasi") {
      const eid = (res.event as { id: number } | undefined)?.id;
      const stage =
        (eid ? events.find((e) => e.id === eid)?.stage : (body as EventSaveRequest).stage) ?? null;
      return new Promise<EventResponse | null>((selesai) => {
        setTanya({
          nama,
          stage,
          sebelum,
          sesudah,
          hapus,
          batal: () => selesai(null),
          kirim: async () => {
            const ulang = await recPost<EventResponse>(aksi, { ...body, confirm: true });
            if (isFail(ulang)) {
              gagal(ulang.kode);
              selesai(null);
              return false;
            }
            selesai(ulang);
            return true;
          },
        });
      });
    }
    gagal(res.kode);
    return null;
  }

  async function geser(e: RecEvent, startsOn: string, endsOn: string) {
    setOv((o) => ({ ...o, [e.id]: { s: startsOn, e: endsOn } }));
    const sebelum = rentangAcara(e, lang);
    const sesudah = rentangAcara({ startsOn, endsOn }, lang);
    const ok = await kirim(
      "event-move",
      { id: e.id, startsOn, endsOn },
      judulAcara(e, lang),
      sebelum,
      sesudah,
    );
    if (!ok) {
      setOv((o) => {
        const { [e.id]: _drop, ...rest } = o;
        return rest;
      });
      return;
    }
    refresh();
    toast(c.moved(judulAcara(e, lang), sesudah), "ok", async () => {
      const back = await recPost<EventResponse>("event-move", {
        id: e.id,
        startsOn: e.startsOn,
        endsOn: e.endsOn,
        confirm: true,
      });
      if (isFail(back)) return gagal(back.kode);
      setOv({});
      refresh();
      toast(c.undone);
    });
  }

  async function simpan(req: EventSaveRequest): Promise<boolean> {
    const lama = req.id ? events.find((e) => e.id === req.id) : undefined;
    const ok = await kirim(
      "event-save",
      req,
      req.title,
      lama ? rentangAcara(lama, lang) : "",
      rentangAcara({ startsOn: req.startsOn, endsOn: req.endsOn }, lang),
    );
    if (!ok) return false;
    refresh();
    toast(c.saved(req.title));
    return true;
  }

  async function hapus(e: RecEvent): Promise<boolean> {
    const ok = await kirim(
      "event-delete",
      { id: e.id },
      judulAcara(e, lang),
      rentangAcara(e, lang),
      "",
      true,
    );
    if (!ok) return false;
    refresh();
    toast(c.deleted(judulAcara(e, lang)), "ok");
    return true;
  }

  return (
    <Kartu
      className="rec-calcard"
      aside={
        <span className="row" style={{ gap: 8 }}>
          <SegmentedControl
            aria-label={c.view}
            value={view}
            onValueChange={(v) => setView(v as "bulan" | "agenda")}
            options={[
              { value: "bulan", label: c.month },
              { value: "agenda", label: c.agenda },
            ]}
          />
          {canEdit && (
            <button type="button" className="btn btn--primary" onClick={() => setEdit("baru")}>
              <span className="btn__label">{c.add}</span>
            </button>
          )}
        </span>
      }
    >
      <h2 className="visually-hidden">{c.title}</h2>
      <span className="hint rec-calcard__who">{canEdit ? c.canEdit : c.cannotEdit}</span>
      {view === "bulan" ? (
        <RecCalendar
          events={tampil}
          lang={lang}
          hariIni={hariIni}
          viewer="panitia"
          editable={canEdit}
          onEdit={(e) => setEdit(events.find((x) => x.id === e.id) ?? e)}
          onMove={(e, s, x) => void geser(events.find((y) => y.id === e.id) ?? e, s, x)}
        />
      ) : (
        <Agenda
          events={tampil}
          lang={lang}
          hariIni={hariIni}
          viewer="panitia"
          editable={canEdit}
          onEdit={(e) => setEdit(events.find((x) => x.id === e.id) ?? e)}
        />
      )}
      {edit && (
        <EventDialog
          key={edit === "baru" ? "baru" : edit.id}
          lang={lang}
          open
          onOpenChange={(o) => !o && setEdit(null)}
          event={edit === "baru" ? null : edit}
          hariIni={hariIni}
          onSave={simpan}
          onDelete={hapus}
        />
      )}
      {tanya && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (o) return;
            tanya.batal();
            setTanya(null);
          }}
          title={c.started.title}
          size="sm"
          lang={lang}
          blocking
          actions={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  tanya.batal();
                  setTanya(null);
                }}
              >
                {r.cancel}
              </button>
              <button
                type="button"
                className={`btn ${tanya.hapus ? "btn--danger" : "btn--primary"}`}
                onClick={async () => {
                  const t = tanya;
                  setTanya(null);
                  await t.kirim();
                }}
              >
                <span className="btn__label">
                  {tanya.hapus ? c.started.yesDelete : c.started.yes}
                </span>
              </button>
            </>
          }
        >
          <div className="stack">
            <p>
              {c.started.body(
                tanya.stage ? r.stage[tanya.stage as keyof typeof r.stage] : c.started.thisStage,
                tanya.nama,
              )}
            </p>
            {!tanya.hapus && (
              <div className="rec-diff">
                <span className="hint">{c.started.before}</span>
                <s>{tanya.sebelum || tgl(hariIni, lang)}</s>
                <span className="hint">{c.started.after}</span>
                <b>{tanya.sesudah}</b>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </Kartu>
  );
}
