/**
 * Room setup (plotPengawas right) and kit loans (kitLoans right), mockup
 * r3-ruang and EXAM-ENGINE 9.3a and 9.6a: the room's name and pengawas, its
 * phone hotspots (a candidate's own phone above the pengawas fallback, a
 * password that is typed but never shown back), and one row per candidate for
 * the kit lent to them.
 */
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "../../../../ui/Controls";
import type { Lang } from "../../../../../lib/kelas";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import type { ConsoleView } from "../../../../../lib/recruitment/room-api";
import { tanggalWib } from "../../../../../lib/recruitment/gates";
import { tgl } from "../../../shared";
import { RG } from "./ruangStrings";

/** The slot's day in WIB (a slot at 00:30 WIB is the day before in UTC). */
const hariWib = (iso: string) => tanggalWib(new Date(iso)).tanggal;
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);

type Orang = { nim: string; nama: string; kode: string };

/* -------------------------------------------------------------- the room */

export function RuangPengaturan({
  lang,
  v,
  people,
  refresh,
}: {
  lang: Lang;
  v: ConsoleView;
  people: Orang[];
  refresh: () => void;
}) {
  const t = RG[lang].setup;
  const [nama, setNama] = useState(v.room.title);
  const [pilih, setPilih] = useState<string[]>(v.pengawas.map((p) => p.nim));
  const kunci = v.pengawas.map((p) => p.nim).join(",");
  useEffect(() => setPilih(v.pengawas.map((p) => p.nim)), [kunci]);
  const selesai = v.view === "finished";

  async function simpan(extra: Record<string, unknown>, ok: string): Promise<boolean> {
    const r = await recPost<{ ok: true }>("room-setup", {
      id: v.room.id,
      slotId: v.room.slot?.id,
      rehearsal: v.room.rehearsal,
      title: nama,
      ...extra,
    });
    if (isFail(r)) {
      toast(t.bad[r.kode] ?? RG[lang].con.fail, "danger");
      return false;
    }
    toast(ok);
    refresh();
    return true;
  }

  const kandidat = useMemo(() => people, [people]);
  const slot = v.room.slot;
  return (
    <div className="r3setup">
      <section className="panel stack">
        <div className="panel__head">
          <h2 className="panel__title">{t.room}</h2>
          <span className="hint">{slot ? t.fromSlot : t.practice}</span>
        </div>
        {slot ? (
          <div className="rec-sum">
            <span className="hint">{t.slot}</span>
            <b>
              {tgl(hariWib(slot.startsAt), lang)} · {slot.room}
            </b>
            <span className="hint">{t.candidates}</span>
            <b>{v.seats.length}</b>
          </div>
        ) : (
          <p className="hint">{t.practiceNote}</p>
        )}
        <label className="r3lbl">
          <span className="label-caps">{t.name}</span>
          <input
            className="field__input"
            id="r3-room-title"
            value={nama}
            maxLength={60}
            disabled={selesai}
            onChange={(e) => setNama(e.target.value)}
          />
        </label>
        {slot && (
          <div className="stack stack--sm">
            <span className="label-caps">{t.pengawas}</span>
            <div className="rec-chips" role="group" aria-label={t.pickAria}>
              {kandidat.map((p) => (
                <button
                  key={p.nim}
                  type="button"
                  className="r3chip"
                  aria-pressed={pilih.includes(p.nim)}
                  title={p.nama}
                  onClick={() =>
                    setPilih((l) =>
                      l.includes(p.nim) ? l.filter((x) => x !== p.nim) : [...l, p.nim],
                    )
                  }
                >
                  {p.kode}
                </button>
              ))}
            </div>
            <span className="hint">{pilih.length ? t.pengawasHint : t.pengawasNone}</span>
          </div>
        )}
        <div className="r3switchrow">
          <div className="stack" style={{ gap: 2 }}>
            <b>{t.practice}</b>
            <span className="hint">{t.practiceHint}</span>
          </div>
          <Checkbox
            checked={v.room.rehearsal}
            onChange={() => undefined}
            disabled
            label={""}
            ariaLabel={t.practice}
          />
        </div>
        <div className="row row--end">
          {selesai && <span className="hint">{t.locked}</span>}
          <button
            type="button"
            className="btn btn--primary"
            disabled={selesai}
            onClick={() => void simpan(slot ? { pengawas: pilih } : {}, t.saved)}
          >
            {t.save}
          </button>
        </div>
      </section>
    </div>
  );
}
