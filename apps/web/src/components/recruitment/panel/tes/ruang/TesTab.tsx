/**
 * The panel's Tes Tulis tab (prompt 11, mockup r3-konsol and r3-ruang): the
 * rooms the caller may watch, and the room itself as a console, its
 * settings and its kit loans. A room is chosen in the address (?ruang=7), so
 * the back button and a shared link both work.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  BroadcastIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  GearIcon,
  ListChecksIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import Confirm from "../../../../ui/Confirm";
import Dialog from "../../../../ui/Dialog";
import IconButton from "../../../../ui/IconButton";
import Fade from "../../../../ui/Fade";
import Pill from "../../../../ui/Pill";
import TabLine from "../../../../ui/TabLine";
import type { Lang } from "../../../../../lib/kelas";
import { isFail, recPost, useRecCalendar } from "../../../../../lib/recruitment/client";
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
import { RuangPengaturan } from "./RuangSetup";
import JudgeTab from "./JudgeTab";
import { RG } from "./ruangStrings";
import { KS, MG } from "./malamStrings";
import Kesiapan from "./Kesiapan";
import PenilaianTab from "../penilaian/PenilaianTab";

import "../../../recruitment-s3-room.css";
import "../../../recruitment-malam.css";
import "../../../recruitment-cutting.css";

/** The slot's day in WIB (a slot at 00:30 WIB is the day before in UTC). */
const hariWib = (iso: string) => tanggalWib(new Date(iso)).tanggal;
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const RUANG_EVENT = "rec:ruang";

const bacaRuang = (): number | null => {
  const n = Number(new URLSearchParams(location.search).get("ruang"));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** The room's own part named in the address (?b=atur opens its setup). */
const bacaBagianRuang = (): "konsol" | "atur" | "nilai" => {
  const b = new URLSearchParams(location.search).get("b");
  return b === "atur" || b === "nilai" ? b : "konsol";
};

/** The room named in the address, kept in step with it. */
function useRuangDipilih(): [number | null, (id: number | null, b?: "atur") => void] {
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
  const pilih = useCallback((n: number | null, b?: "atur") => {
    const u = new URL(location.href);
    if (n === null) u.searchParams.delete("ruang");
    else u.searchParams.set("ruang", String(n));
    if (b) u.searchParams.set("b", b);
    else u.searchParams.delete("b");
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

/* ----------------------------------------------------------------- delete */

/** The delete button of a room and its confirm. A real room goes only before anyone ran it. */
function HapusRuang({
  lang,
  id,
  title,
  rehearsal,
  seats,
  view,
  selesai,
  done,
}: {
  lang: Lang;
  id: number;
  title: string;
  rehearsal: boolean;
  seats: number;
  view: ReturnType<typeof roomView>["view"];
  /** Some part has run in it */
  selesai: boolean;
  done: () => void;
}) {
  const t = RG[lang].list.del;
  const [open, setOpen] = useState(false);
  const jalan = view === "part-running" || view === "livecode-running" || view === "part-paused";
  const dipakai = !rehearsal && selesai;
  const alasan = jalan ? t.running : dipakai ? t.used : undefined;
  return (
    <>
      <IconButton
        icon={TrashIcon}
        kind="danger"
        label={t.aria}
        tip={alasan}
        disabled={!!alasan}
        onClick={() => setOpen(true)}
      />
      <Confirm
        open={open}
        onOpenChange={setOpen}
        title={t.title(title)}
        body={rehearsal ? t.bodyPractice(seats) : t.bodyReal(seats)}
        confirmLabel={t.confirm}
        lang={lang}
        onConfirm={async () => {
          const r = await recPost<{ ok: true }>("room-delete", { id });
          if (isFail(r)) {
            toast(
              r.kode === "ruang_berjalan"
                ? t.running
                : r.kode === "ruang_sudah_dipakai"
                  ? t.used
                  : t.fail,
              "danger",
            );
            return false;
          }
          toast(t.done);
          done();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------- rename */

/** The pencil of a room that has not started: its name (the Pengawas live in Atur Ruang). */
function UbahRuang({
  lang,
  room,
  onClose,
  done,
}: {
  lang: Lang;
  room: RoomRow | null;
  onClose: () => void;
  done: () => void;
}) {
  const k = KS[lang];
  const [nama, setNama] = useState("");
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => setNama(room?.title ?? ""), [room]);
  async function simpan() {
    if (!room) return;
    setSibuk(true);
    const r = await recPost<{ ok: true }>("room-setup", {
      id: room.id,
      slotId: room.slot?.id,
      rehearsal: room.rehearsal,
      title: nama.trim(),
      ...(room.slot ? { pengawas: room.pengawas.map((p) => p.nim) } : {}),
    });
    setSibuk(false);
    if (isFail(r)) return toast(k.fail, "danger");
    toast(k.saved);
    done();
    onClose();
  }
  return (
    <Dialog
      open={room !== null}
      onOpenChange={(o) => !o && onClose()}
      title={k.editTitle}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{k.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={sibuk || !nama.trim()}
            onClick={() => void simpan()}
          >
            <span className="btn__label">{k.save}</span>
          </button>
        </>
      }
    >
      <label className="stack stack--sm">
        <span className="label-caps">{k.editName}</span>
        <input
          className="field__input"
          value={nama}
          maxLength={60}
          onChange={(e) => setNama(e.target.value)}
        />
      </label>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ list */

type Daftarku = NonNullable<ReturnType<typeof useRecRooms>["data"]>;

/** "Sel 17 Nov": the short night label the chips wear */
function hariPendek(d: string, lang: Lang): string {
  const parts = new Intl.DateTimeFormat(
    lang === "en" ? "en-GB" : lang === "zh" ? "zh-CN" : "id-ID",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    },
  ).formatToParts(new Date(`${d}T00:00:00Z`));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")}`.replace(/\./g, "");
}

/** The rail under a room: which of Persiapan, Berjalan and Selesai it is in */
function Rel({ at, lang }: { at: 0 | 1 | 2; lang: Lang }) {
  const t = MG[lang];
  const ic = [ListChecksIcon, BroadcastIcon, FlagIcon];
  return (
    <ol className="n7-rail" aria-label={t.railLabel}>
      <span className="n7-rail__line" aria-hidden="true">
        <i style={{ "--p": at / 2 } as React.CSSProperties} />
      </span>
      {t.rail.map((l, i) => {
        const Ik = i < at ? CheckIcon : ic[i];
        return (
          <li key={l} data-st={i < at ? "done" : i === at ? "cur" : "next"}>
            <span className="n7-rail__dot">
              <Ik size={18} aria-hidden="true" />
            </span>
            {l}
          </li>
        );
      })}
    </ol>
  );
}

function Daftar({
  lang,
  data,
  jadwal,
  buka,
  refresh,
}: {
  lang: Lang;
  data: Daftarku;
  /** Every evening of the written test and its makeup, from the Kalender: a night shows before it has a room. */
  jadwal: string[];
  buka: (id: number, b?: "atur") => void;
  refresh: () => void;
}) {
  const t = RG[lang].list;
  const m = MG[lang];
  const k = KS[lang];
  const [ubah, setUbah] = useState<Daftarku["rooms"][number] | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pilih, setPilih] = useState<string | null>(null);
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
  // The nights: every day a room or a plotted slot sits on, and the practice rooms apart.
  const malam = new Map<string, { rooms: Daftarku["rooms"]; pending: Daftarku["pending"] }>();
  const hari = (d: string) => {
    if (!malam.has(d)) malam.set(d, { rooms: [], pending: [] });
    return malam.get(d)!;
  };
  for (const d of jadwal) hari(d);
  for (const r of data.rooms) if (r.slot) hari(hariWib(r.slot.startsAt)).rooms.push(r);
  for (const sl of data.pending) hari(hariWib(sl.startsAt)).pending.push(sl);
  const latihan = data.rooms.filter((r) => !r.slot);
  const kunci = [...malam.keys()].sort();
  const cur = pilih && (pilih === "latihan" || malam.has(pilih)) ? pilih : (kunci[0] ?? "latihan");
  const state = (d: string) => {
    const x = malam.get(d)!;
    if (!x.rooms.length) return "kosong";
    if (x.rooms.some((r) => r.view !== "setup" && r.view !== "persiapan" && r.view !== "finished"))
      return "live";
    return x.rooms.every((r) => r.view === "finished") ? "selesai" : "siap";
  };
  const rel = (v: Daftarku["rooms"][number]["view"]): 0 | 1 | 2 =>
    v === "setup" || v === "persiapan" ? 0 : v === "finished" ? 2 : 1;
  const kartu = (r: Daftarku["rooms"][number], hariPanjang: string) => {
    // Before the room opens, its setup is the page: readiness and the Mulai Ujian card.
    const siap = r.view === "setup" || r.view === "persiapan";
    return (
      <div className="stack" key={r.id}>
        <section className="panel n7-stagehead" data-mine={r.mine ? "yes" : "no"}>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{hariPanjang}</span>
            <h2 className="h3 n7-stagehead__t">
              {r.title}
              {r.rehearsal && <Pill tone="gold">{m.practice}</Pill>}
            </h2>
            {!siap && (
              <span className="hint">
                {t.seats(r.seats, r.checkedIn)} · {r.master ? t.master(r.master.nama) : t.noMaster}
              </span>
            )}
            {r.pengawas.length > 0 && !siap && (
              <div className="r3chips">
                {r.pengawas.map((p) => (
                  <Pill key={p.nim} mono title={p.nama}>
                    {p.kode}
                  </Pill>
                ))}
              </div>
            )}
          </div>
          <Rel at={rel(r.view)} lang={lang} />
          <div className="row n7-stagehead__act" style={{ gap: 8 }}>
            {siap ? (
              data.canSetup && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => buka(r.id, "atur")}
                >
                  <GearIcon size={16} aria-hidden="true" />
                  <span className="btn__label">{k.setup}</span>
                </button>
              )
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => buka(r.id)}>
                <span className="btn__label">{t.open}</span>
              </button>
            )}
            {data.canSetup && siap && (
              <IconButton
                icon={PencilSimpleIcon}
                label={k.edit}
                tip={k.edit}
                onClick={() => setUbah(r)}
              />
            )}
            {data.canSetup && (
              <HapusRuang
                lang={lang}
                id={r.id}
                title={r.title}
                rehearsal={r.rehearsal}
                seats={r.seats}
                view={r.view}
                selesai={r.view === "finished" || r.part !== null}
                done={refresh}
              />
            )}
          </div>
        </section>
        {siap && (
          <Kesiapan
            lang={lang}
            room={r}
            buka={() => buka(r.id)}
            atur={() => buka(r.id, "atur")}
            latihan={() => setPilih("latihan")}
          />
        )}
      </div>
    );
  };
  const isiMalam = () => {
    if (cur === "latihan")
      return latihan.length ? (
        latihan.map((r) => kartu(r, m.practiceRoom))
      ) : (
        <section className="panel n7-empty">
          <span className="n7-empty__art" aria-hidden="true">
            <SparkleIcon size={32} />
          </span>
          <div
            className="stack stack--sm"
            style={{ alignItems: "center", textAlign: "center", maxWidth: "46ch" }}
          >
            <h2 className="h3">{m.emptyPractice}</h2>
            <span className="hint">{m.emptyPracticeHint}</span>
          </div>
          {data.canSetup && (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={sibuk}
              onClick={() => void siapkan({ rehearsal: true, title: "Ruang Latihan" })}
            >
              <PlusIcon size={18} aria-hidden="true" />
              <span className="btn__label">{m.makePractice}</span>
            </button>
          )}
        </section>
      );
    const x = malam.get(cur)!;
    const panjang = tgl(cur, lang);
    return (
      <>
        {x.rooms.map((r) => kartu(r, panjang))}
        {x.pending.map((sl) => (
          <section className="panel n7-stagehead" key={`p${sl.id}`}>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <span className="eyebrow">{panjang}</span>
              <h2 className="h3 n7-stagehead__t">{sl.room}</h2>
              <span className="hint">{t.candidates(sl.seats)}</span>
            </div>
            <Rel at={0} lang={lang} />
            {data.canSetup ? (
              <button
                type="button"
                className="btn btn--inverse"
                disabled={sibuk}
                onClick={() => void siapkan({ slotId: sl.id, title: sl.room })}
              >
                <PlusIcon size={18} aria-hidden="true" />
                <span className="btn__label">{m.prepare}</span>
              </button>
            ) : (
              <span />
            )}
          </section>
        ))}
        {!x.rooms.length && !x.pending.length && (
          <section className="panel n7-empty">
            <h2 className="h3">{m.emptyNight}</h2>
            <span className="hint">{m.emptyNightHint}</span>
          </section>
        )}
      </>
    );
  };
  return (
    <div className="n7-malam">
      <UbahRuang lang={lang} room={ubah} onClose={() => setUbah(null)} done={refresh} />
      <div className="n7-nights" role="tablist" aria-label={m.nights}>
        {kunci.map((d) => {
          const st = state(d);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              className="n7-night"
              aria-selected={cur === d}
              data-st={st}
              onClick={() => setPilih(d)}
            >
              <span className="n7-night__dot">
                {st === "live" ? null : st === "selesai" ? (
                  <CheckIcon size={16} aria-hidden="true" />
                ) : st === "kosong" ? (
                  <PlusIcon size={16} aria-hidden="true" />
                ) : (
                  <ClockIcon size={16} aria-hidden="true" />
                )}
              </span>
              <b>{hariPendek(d, lang)}</b>
              <small>
                {st === "kosong"
                  ? m.noRoom
                  : st === "live"
                    ? m.live
                    : st === "selesai"
                      ? m.done
                      : m.setting}
              </small>
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          className="n7-night"
          aria-selected={cur === "latihan"}
          data-st={latihan.length ? "latihan" : "kosong"}
          data-practice="yes"
          onClick={() => setPilih("latihan")}
        >
          <span className="n7-night__dot">
            <SparkleIcon size={16} aria-hidden="true" />
          </span>
          <b>{m.practice}</b>
          <small>{m.practiceSub}</small>
        </button>
      </div>
      {!kunci.length && cur !== "latihan" ? (
        <section className="panel n7-empty">
          <span className="hint">{m.nothing}</span>
        </section>
      ) : (
        isiMalam()
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ room */

type Bagian = "konsol" | "atur" | "nilai";

function Ruang({
  lang,
  id,
  people,
  kembali,
  rooms,
  onNilai,
}: {
  lang: Lang;
  id: number;
  people: { nim: string; nama: string; kode: string }[];
  kembali: () => void;
  rooms: { refresh: () => void };
  onNilai: () => void;
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
  const [bagian, setBagian] = useState<Bagian>(bacaBagianRuang);
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
    // Grading opens with Live Coding's timer; the page asks the API who may grade
    ...(v.state.runs.livecode ? [{ v: "nilai" as const, label: t.tabs.grade }] : []),
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
        {v.me.canSetup && (
          <HapusRuang
            lang={lang}
            id={id}
            title={v.room.title}
            rehearsal={v.room.rehearsal}
            seats={v.seats.length}
            view={rv.view}
            selesai={Object.keys(v.state.runs).length > 0 || v.state.stage === "finished"}
            done={() => {
              rooms.refresh();
              kembali();
            }}
          />
        )}
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
        ) : bagian === "nilai" && v.state.runs.livecode ? (
          <JudgeTab lang={lang} roomId={id} />
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
            onNilai={onNilai}
          />
        )}
      </Fade>
    </div>
  );
}

/* ------------------------------------------------------------------- tab */

const tambahHari = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export default function TesTab({ lang }: { lang: Lang }) {
  const rooms = useRecRooms(true);
  const cal = useRecCalendar(true);
  const [id, pilih] = useRuangDipilih();
  // The scores of everyone who sat in the rooms: opened from a finished room (Buka Penilaian), as in the mockup
  const [nilai, setNilai] = useState(false);
  if (!rooms.data) return <span className="skeleton" style={{ height: 320 }} />;
  const jadwal = new Set<string>();
  for (const e of cal.data?.events ?? [])
    if (e.stage === "tes_tulis" && ["test", "makeup"].includes(e.kind))
      for (let d = e.startsOn; d <= e.endsOn; d = tambahHari(d, 1)) jadwal.add(d);
  if (nilai)
    return (
      <div className="stack">
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNilai(false)}>
            <ArrowLeftIcon size={16} aria-hidden="true" /> {RG[lang].con.back}
          </button>
        </div>
        <PenilaianTab lang={lang} />
      </div>
    );
  if (id !== null)
    return (
      <Ruang
        lang={lang}
        id={id}
        people={rooms.data.people ?? []}
        kembali={() => pilih(null)}
        rooms={rooms}
        onNilai={() => setNilai(true)}
      />
    );
  return (
    <div className="stack">
      <Daftar
        lang={lang}
        data={rooms.data}
        jadwal={[...jadwal].sort()}
        buka={pilih}
        refresh={rooms.refresh}
      />
    </div>
  );
}
