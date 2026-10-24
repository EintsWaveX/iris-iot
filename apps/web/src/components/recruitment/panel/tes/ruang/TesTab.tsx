/**
 * The panel's Tes Tulis tab (prompt 11, mockup r3-konsol and r3-ruang): the
 * rooms the caller may watch, and the room itself as a console, its
 * settings and its kit loans. A room is chosen in the address (?ruang=7), so
 * the back button and a shared link both work.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import Fade from "../../../../ui/Fade";
import Pill from "../../../../ui/Pill";
import TabLine from "../../../../ui/TabLine";
import type { Lang } from "../../../../../lib/kelas";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { roomView } from "../../../../../lib/recruitment/room";
import type { RoomRow } from "../../../../../lib/recruitment/room-api";
import {
  useCadanganRuang,
  useJamRuang,
  useRecRoom,
  useRecRoomLog,
  useRecRooms,
  useRuangLangsung,
} from "../../../../../lib/recruitment/room-client";
import { tanggalWib } from "../../../../../lib/recruitment/gates";
import { tgl } from "../../../shared";
import { useRevealMotion } from "../../../reveal/fx";
import Konsol from "./Konsol";
import { RuangKit, RuangPengaturan } from "./RuangSetup";
import { RG } from "./ruangStrings";

import "../../../recruitment-s3-room.css";

/** The slot's day in WIB (a slot at 00:30 WIB is the day before in UTC). */
const hariWib = (iso: string) => tanggalWib(new Date(iso)).tanggal;
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const RUANG_EVENT = "rec:ruang";

const bacaRuang = (): number | null => {
  const n = Number(new URLSearchParams(location.search).get("ruang"));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** The room named in the address, kept in step with it. */
function useRuangDipilih(): [number | null, (id: number | null) => void] {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    const on = () => setId(bacaRuang());
    on();
    window.addEventListener(RUANG_EVENT, on);
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener(RUANG_EVENT, on);
      window.removeEventListener("popstate", on);
    };
  }, []);
  const pilih = useCallback((n: number | null) => {
    const u = new URL(location.href);
    if (n === null) u.searchParams.delete("ruang");
    else u.searchParams.set("ruang", String(n));
    history.pushState(history.state, "", u);
    window.dispatchEvent(new Event(RUANG_EVENT));
  }, []);
  return [id, pilih];
}

const tone = (view: RoomRow["view"]) =>
  view === "finished" || view === "setup"
    ? undefined
    : view === "part-paused" || view === "part-ended" || view === "lobby"
      ? "warn"
      : view === "persiapan" || view === "livecode-spin"
        ? "teal"
        : "accent";

function viewLabel(lang: Lang, view: RoomRow["view"], part: RoomRow["part"]): string {
  const t = RG[lang];
  return (view === "part-running" || view === "livecode-running") && part
    ? t.running(t.part[part].l)
    : t.view[view];
}

/* ------------------------------------------------------------------ list */

function Daftar({
  lang,
  data,
  buka,
  refresh,
}: {
  lang: Lang;
  data: NonNullable<ReturnType<typeof useRecRooms>["data"]>;
  buka: (id: number) => void;
  refresh: () => void;
}) {
  const t = RG[lang].list;
  const [sibuk, setSibuk] = useState(false);
  async function siapkan(body: Record<string, unknown>) {
    setSibuk(true);
    const r = await recPost<{ ok: true; room: { id: number } }>("room-setup", {
      pengawas: [],
      ...body,
    });
    setSibuk(false);
    if (isFail(r)) return toast(RG[lang].con.fail, "danger");
    refresh();
    buka(r.room.id);
  }
  return (
    <div className="stack">
      {data.rooms.length === 0 ? (
        <section className="panel stack stack--sm">
          <b>{t.empty}</b>
          <span className="hint">{t.emptyHint}</span>
        </section>
      ) : (
        <div className="r3list-room">
          {data.rooms.map((r) => (
            <section key={r.id} className="panel r3room" data-mine={r.mine ? "yes" : "no"}>
              <div className="panel__head">
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <h3 className="panel__title">{r.title}</h3>
                  <span className="hint">
                    {r.slot
                      ? `${tgl(hariWib(r.slot.startsAt), lang)} · ${r.slot.room}`
                      : t.practice}
                  </span>
                </div>
                <Pill tone={tone(r.view)}>{viewLabel(lang, r.view, r.part)}</Pill>
              </div>
              <span>{t.seats(r.seats, r.checkedIn)}</span>
              <span className="hint">{r.master ? t.master(r.master.nama) : t.noMaster}</span>
              {r.pengawas.length > 0 && (
                <div className="r3chips">
                  {r.pengawas.map((p) => (
                    <Pill key={p.nim} mono title={p.nama}>
                      {p.kode}
                    </Pill>
                  ))}
                </div>
              )}
              {r.mine && <span className="hint">{t.mine}</span>}
              <div className="row">
                <button type="button" className="btn btn--primary" onClick={() => buka(r.id)}>
                  {t.open}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {data.canSetup && (
        <section className="panel stack">
          <div className="panel__head">
            <div className="stack" style={{ gap: 2 }}>
              <h3 className="panel__title">{t.pendingHead}</h3>
              <span className="hint">{t.pendingHint}</span>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={sibuk}
              title={t.practiceHint}
              onClick={() => void siapkan({ rehearsal: true, title: "Ruang Latihan" })}
            >
              {t.newPractice}
            </button>
          </div>
          {data.pending.length === 0 ? (
            <span className="hint">-</span>
          ) : (
            <div className="r3list-room">
              {data.pending.map((s) => (
                <div key={s.id} className="r3room">
                  <b>
                    {tgl(hariWib(s.startsAt), lang)} · {s.room}
                  </b>
                  <span className="hint">{t.candidates(s.seats)}</span>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn--inverse"
                      disabled={sibuk}
                      onClick={() => void siapkan({ slotId: s.id, title: s.room })}
                    >
                      {t.prepare}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ room */

type Bagian = "konsol" | "atur" | "kit";

function Ruang({
  lang,
  id,
  people,
  kembali,
}: {
  lang: Lang;
  id: number;
  people: { nim: string; nama: string; kode: string }[];
  kembali: () => void;
}) {
  const t = RG[lang];
  const room = useRecRoom(id, true);
  const log = useRecRoomLog(id, true);
  const now = useJamRuang(true);
  const refresh = useCallback(() => {
    room.refresh();
    log.refresh();
  }, [room, log]);
  const live = useRuangLangsung(id, true, () => refresh(), refresh);
  useCadanganRuang(refresh, live.status !== "live");
  const motion = useRevealMotion();
  const [bagian, setBagian] = useState<Bagian>("konsol");
  const v = room.data;

  if (!v)
    return room.updatedAt !== null ? (
      <section className="panel stack stack--sm">
        <button type="button" className="btn btn--ghost" onClick={kembali}>
          {t.con.back}
        </button>
        <b>{t.list.empty}</b>
      </section>
    ) : (
      <span className="skeleton" style={{ height: 420 }} />
    );

  const rv = roomView(v.state, now);
  const tabs: { v: Bagian; label: string }[] = [
    { v: "konsol", label: t.tabs.console },
    ...(v.me.canSetup ? [{ v: "atur" as const, label: t.tabs.setup }] : []),
    ...(v.me.canKit ? [{ v: "kit" as const, label: t.tabs.kit }] : []),
  ];
  const slot = v.room.slot;
  const sub = slot
    ? t.con.sub(
        tgl(hariWib(slot.startsAt), lang),
        new Date(Date.parse(slot.startsAt) + 7 * 3600_000).toISOString().slice(11, 16),
        new Date(Date.parse(slot.endsAt) + 7 * 3600_000).toISOString().slice(11, 16),
        v.seats.length,
      )
    : t.con.subPractice(v.seats.length);

  return (
    <div className="stack r3con" data-motion={motion}>
      <div className="r3head">
        <button type="button" className="btn btn--ghost btn--sm" onClick={kembali}>
          <ArrowLeftIcon size={16} aria-hidden="true" /> {t.con.back}
        </button>
        <h2 className="h-title" style={{ margin: 0 }}>
          {v.room.title}
        </h2>
        <Pill lg tone={tone(rv.view)}>
          {viewLabel(lang, rv.view, rv.part)}
        </Pill>
        {v.room.rehearsal && <Pill>{t.list.practice}</Pill>}
        {live.status === "putus" && (
          <span className="r3conn" title={t.liveDownTip}>
            <i />
            <span className="r3conn__t">{t.liveDown}</span>
          </span>
        )}
        {live.status === "mati" && rv.view !== "finished" && (
          <span className="hint">{t.liveOff}</span>
        )}
      </div>
      <span className="hint r3sub">{sub}</span>
      {tabs.length > 1 && (
        <TabLine tabs={tabs} value={bagian} onChange={setBagian} label={t.tabs.aria} />
      )}
      <Fade k={bagian}>
        {bagian === "atur" && v.me.canSetup ? (
          <RuangPengaturan lang={lang} v={v} people={people} refresh={refresh} />
        ) : bagian === "kit" && v.me.canKit ? (
          <RuangKit lang={lang} v={v} refresh={refresh} />
        ) : (
          <Konsol
            lang={lang}
            v={v}
            now={now}
            hadir={live.hadir}
            live={live.status}
            kemajuan={live.kemajuan}
            log={log.data?.log ?? []}
            refresh={refresh}
          />
        )}
      </Fade>
    </div>
  );
}

/* ------------------------------------------------------------------- tab */

export default function TesTab({ lang }: { lang: Lang }) {
  const t = RG[lang];
  const rooms = useRecRooms(true);
  const [id, pilih] = useRuangDipilih();
  if (!rooms.data) return <span className="skeleton" style={{ height: 320 }} />;
  if (id !== null)
    return (
      <Ruang lang={lang} id={id} people={rooms.data.people ?? []} kembali={() => pilih(null)} />
    );
  return (
    <div className="stack">
      <p className="hint">{t.lede}</p>
      <Daftar lang={lang} data={rooms.data} buka={pilih} refresh={rooms.refresh} />
    </div>
  );
}
