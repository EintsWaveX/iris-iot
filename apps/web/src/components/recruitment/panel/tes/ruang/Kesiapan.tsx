/**
 * A room's readiness before the exam starts (mockup n7-malam, Persiapan): the
 * checklist of what has to be true (slot, questions, Pengawas, the C judge,
 * who checked in) and the Mulai Ujian card that opens the console. Every row
 * reads what the room already knows; nothing here is a second source of truth.
 */
import {
  ArrowRightIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  HourglassIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TerminalWindowIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { ProgressRing } from "../../../../ui/Display";
import type { Lang } from "../../../../../lib/kelas";
import { usePoll } from "../../../../../lib/hooks";
import { isFail, recGet } from "../../../../../lib/recruitment/client";
import type { LccRoom } from "../../../../../lib/recruitment/lcc-api";
import type { ConsoleView, RoomRow } from "../../../../../lib/recruitment/room-api";
import { useRecRoom } from "../../../../../lib/recruitment/room-client";
import { bukaBagian } from "../../../../../lib/recruitment/panel-tab";
import { RG } from "./ruangStrings";
import { KS } from "./malamStrings";

/** WIB clock of an instant: "18.30" in Indonesian, "18:30" elsewhere. */
function jam(iso: string, lang: Lang): string {
  const s = new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 16);
  return lang === "id" ? s.replace(":", ".") : s;
}

type Baris = {
  k: string;
  Ik: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  judul: string;
  sub: string;
  siap: boolean;
  aksi: () => void;
};

export default function Kesiapan({
  lang,
  room,
  buka,
  atur,
  latihan,
}: {
  lang: Lang;
  room: RoomRow;
  /** Open the room's console */
  buka: () => void;
  /** Open the room's setup (name and Pengawas) */
  atur: () => void;
  /** Show the practice rooms */
  latihan: () => void;
}) {
  const t = KS[lang];
  const part = RG[lang].part;
  const rv = useRecRoom(room.id, true);
  const v: ConsoleView | null = rv.data;
  const juri = usePoll<LccRoom | null>(
    async () => {
      const r = await recGet<LccRoom & { ok: true }>("lcc-room", { id: String(room.id) });
      if (isFail(r)) throw new Error(String(r.status || 408));
      return r;
    },
    60_000,
    true,
    ["recroom"],
    300,
  );
  if (!v) return <span className="skeleton" style={{ height: 300 }} />;

  const tertulis = v.config.order.filter((p) => p !== "livecode");
  const soalOk = tertulis.every((p) => v.pool[p]?.ok ?? false);
  const kurang = tertulis.find((p) => !(v.pool[p]?.ok ?? false));
  const siap = (p: (typeof tertulis)[number]) =>
    (v.pool[p]?.counts ?? []).reduce((n, c) => n + c.ready, 0);
  const slot = v.room.slot;
  const kursi = v.seats.length;
  const juriOk = juri.data?.judgeReady === true;
  const kodePeng = v.pengawas.map((p) => p.kode);
  const masuk = v.seats.filter((s) => s.checkedIn).length;

  const baris: Baris[] = [
    {
      k: "slot",
      Ik: CalendarBlankIcon,
      judul: t.slot,
      sub: slot
        ? t.slotSub(v.room.title, jam(slot.startsAt, lang), jam(slot.endsAt, lang), kursi)
        : t.slotPractice(v.room.title),
      siap: true,
      aksi: () => bukaBagian("plotting"),
    },
    {
      k: "soal",
      Ik: FileTextIcon,
      judul: t.soal,
      sub: soalOk
        ? t.soalOk(tertulis.map((p) => `${part[p].l} ${siap(p)}`).join(", "))
        : t.soalNo(part[kurang ?? tertulis[0]].l),
      siap: soalOk,
      aksi: () => bukaBagian("bank"),
    },
    {
      k: "pengawas",
      Ik: ShieldCheckIcon,
      judul: t.pengawas,
      sub: kodePeng.length ? kodePeng.join(", ") : t.pengawasNone,
      siap: kodePeng.length > 0,
      aksi: atur,
    },
    {
      k: "juri",
      Ik: TerminalWindowIcon,
      judul: t.juri,
      sub: juriOk ? t.juriOk : t.juriNo,
      siap: juriOk,
      aksi: () => juri.refresh(),
    },
  ];
  const nSiap = baris.filter((b) => b.siap).length;
  const semua = nSiap === baris.length;
  const mnt = v.config.budgetMin;
  const rencana = v.config.order.map((p) => ({
    p,
    min: p === "livecode" ? v.config.livecode.minutes : v.config.parts[p].minutes,
  }));
  const terpakai = rencana.reduce((n, x) => n + x.min, 0);

  return (
    <div className="n7-prep">
      <section className="panel n7-check">
        <div className="panel__head">
          <h3 className="panel__title">{t.title}</h3>
          <span className="n7-ringw">
            <ProgressRing
              value={nSiap}
              max={baris.length}
              label={`${nSiap}/${baris.length}`}
              color={semua ? "var(--ok)" : "var(--warn)"}
            />
          </span>
        </div>
        <ul className="n7-tasks">
          {baris.map((b) => (
            <li key={b.k}>
              <button
                type="button"
                className="n7-task"
                data-done={b.siap ? "yes" : "no"}
                onClick={b.aksi}
              >
                <span className="n7-task__st">
                  {b.siap ? (
                    <CheckCircleIcon size={22} aria-hidden={true} />
                  ) : (
                    <ClockIcon size={22} aria-hidden={true} />
                  )}
                </span>
                <span className="n7-task__ic">
                  <b.Ik size={20} aria-hidden={true} />
                </span>
                <span className="n7-task__b">
                  <b>{b.judul}</b>
                  <span className="hint">{b.sub}</span>
                </span>
                <span className="n7-task__tag">{b.siap ? t.ready : t.todo}</span>
                <CaretRightIcon size={16} aria-hidden={true} />
              </button>
            </li>
          ))}
          <li>
            <div className="n7-task n7-task--info">
              <span className="n7-task__st">
                <HourglassIcon size={22} aria-hidden={true} />
              </span>
              <span className="n7-task__ic">
                <UsersThreeIcon size={20} aria-hidden={true} />
              </span>
              <span className="n7-task__b">
                <b>{t.masuk}</b>
                <span className="hint">
                  {slot ? t.masukSub(masuk, kursi, jam(slot.startsAt, lang)) : t.masukPractice}
                </span>
              </span>
              <span className="n7-task__tag">{t.auto}</span>
              <span />
            </div>
          </li>
        </ul>
      </section>
      <aside className="panel n7-go" data-ready={semua ? "yes" : "no"}>
        <span className="eyebrow">{t.go}</span>
        <b className="n7-go__big">{semua ? t.allSet : t.notReady(baris.length - nSiap)}</b>
        <span className="hint">{t.goHint}</span>
        <button type="button" className="btn btn--primary btn--lg" onClick={buka}>
          <RocketLaunchIcon size={20} aria-hidden={true} />
          <span className="btn__label">{t.go}</span>
          <ArrowRightIcon size={18} aria-hidden={true} />
        </button>
        <div className="n7-budget" role="img" aria-label={t.budget}>
          <div className="n7-budget__bar">
            {rencana.map((x) => (
              <i key={x.p} style={{ flex: x.min }} title={`${part[x.p].l} · ${x.min} ${t.min}`} />
            ))}
          </div>
          <span className="hint">{t.budgetUsed(terpakai, mnt)}</span>
        </div>
        <hr className="n7-hr" />
        <button type="button" className="btn btn--ghost" onClick={latihan}>
          <SparkleIcon size={18} aria-hidden={true} />
          <span className="btn__label">{t.tryFirst}</span>
        </button>
      </aside>
    </div>
  );
}
