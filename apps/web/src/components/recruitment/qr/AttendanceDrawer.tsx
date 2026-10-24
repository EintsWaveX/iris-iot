/**
 * Kehadiran (06, mockup r2-qr override): from Ringkasan's Hari Ini card while
 * an attended event runs, for the attendance right (Ketua, Acara, Admin). A
 * drawer with search, Belum, Hadir and Semua, the QR time or who marked it by
 * hand, and Tandai Hadir with three quick reasons. A hand mark can be taken
 * back; a QR scan cannot (it is the candidate's own word).
 */
import { useState } from "react";
import Drawer from "../../ui/Drawer";
import Pill from "../../ui/Pill";
import Popover from "../../ui/Popover";
import SegmentedControl from "../../ui/SegmentedControl";
import type { Lang } from "../../../lib/kelas";
import { href } from "../../../lib/app";
import { isFail, recPost, useRecAttendance } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import type { AttendanceRow, EventLite } from "../../../lib/recruitment/types";
import { PN } from "../panel/panelStrings";
import { judulAcara } from "../judul";
import { S2 } from "../s2Strings";
import { tgl } from "../shared";

const jam = (iso: string) => tanggalWib(new Date(iso)).jam;

export default function AttendanceDrawer({
  lang,
  event,
  onClose,
}: {
  lang: Lang;
  event: EventLite;
  onClose: () => void;
}) {
  const t = S2[lang].attend;
  const att = useRecAttendance(event.id, true);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"belum" | "hadir" | "semua">("belum");
  const [mark, setMark] = useState<number | null>(null);
  const baris = att.data?.rows ?? [];
  const hadir = baris.filter((r) => r.present).length;
  const cari = q.trim().toLowerCase();
  const list = baris
    .filter(
      (r) =>
        (f === "semua" || (f === "belum" ? !r.present : r.present)) &&
        (!cari || `${r.nama} ${r.nim}`.toLowerCase().includes(cari)),
    )
    .sort((a, b) => (a.nama < b.nama ? -1 : 1));

  async function tandai(r: AttendanceRow, alasan: string) {
    setMark(null);
    const res = await recPost<{ ok: true }>("attend-manual", {
      id: r.id,
      event: event.id,
      reason: alasan,
    });
    if (isFail(res)) return void window.Toast?.show(t.fail, "danger");
    window.Toast?.show(t.marked(r.nama.split(" ")[0], alasan), "ok");
    att.refresh();
  }
  async function batal(r: AttendanceRow) {
    const res = await recPost<{ ok: true }>("attend-manual", {
      id: r.id,
      event: event.id,
      undo: true,
    });
    if (isFail(res))
      return void window.Toast?.show(
        res.kode === "tidak_bisa_batal" ? t.cantUndo : t.fail,
        "danger",
      );
    window.Toast?.show(t.undone, "warn");
    att.refresh();
  }

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.title(judulAcara(event, lang))}
      description={t.sub(tgl(event.startsOn, lang), hadir, baris.length)}
      storeKey="rec-hadir"
      minWidth={420}
      closeLabel={PN[lang].cand.sheetClose}
      resizeLabel={PN[lang].cand.resize}
      foot={
        <a
          className="btn"
          href={href(lang, "/recruitment/qr")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="btn__label">{t.open}</span>
        </a>
      }
    >
      <div className="stack">
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
          <SegmentedControl
            aria-label={t.filter}
            value={f}
            onValueChange={(v) => setF(v as typeof f)}
            options={[
              { value: "belum", label: t.not(baris.length - hadir) },
              { value: "hadir", label: t.here },
              { value: "semua", label: t.all },
            ]}
          />
        </div>
        {att.data === null ? (
          <span className="skeleton" style={{ height: 240 }} />
        ) : list.length === 0 ? (
          <p className="empty-note">{t.empty}</p>
        ) : (
          <ul className="r2att__list">
            {list.map((r) => (
              <li className="r2att__row" key={r.id}>
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b>{r.nama}</b>
                  <span className="hint mono">{r.nim}</span>
                </span>
                {r.present ? (
                  <Pill tone={r.via === "qr" ? "ok" : undefined}>
                    {t.via(r.via ?? "manual", r.at ? jam(r.at) : "", r.by ? r.by.slice(-3) : null)}
                  </Pill>
                ) : (
                  <span className="hint">{t.notYet}</span>
                )}
                {r.present && r.via === "manual" ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void batal(r)}
                  >
                    {t.undo}
                  </button>
                ) : !r.present ? (
                  <Popover
                    open={mark === r.id}
                    onOpenChange={(o) => setMark(o ? r.id : null)}
                    align="end"
                    trigger={
                      <button type="button" className="btn btn--sm">
                        <span className="btn__label">{t.mark}</span>
                      </button>
                    }
                  >
                    <div className="stack stack--sm" style={{ width: 260 }}>
                      <b>{t.why}</b>
                      {t.reasons.map((x) => (
                        <button
                          type="button"
                          className="dd__opt"
                          key={x}
                          onClick={() => void tandai(r, x)}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </Popover>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
