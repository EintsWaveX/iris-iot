/**
 * Kehadiran (06, mockup r2-qr override): from Ringkasan's Hari Ini card while
 * an attended event runs, for the attendance right (Ketua, Acara, Admin). A
 * centered dialog with search, Belum, Hadir and Semua, the QR time or who marked it by
 * hand, and Tandai Hadir with three quick reasons. A hand mark can be taken
 * back; a QR scan cannot (it is the candidate's own word), except by the seats
 * that hold rollback (Ketua, Akademik, Admin), who may take any mark back (5 Nov 2026).
 */
import { useState, type CSSProperties } from "react";
import { DownloadSimpleIcon, MagnifyingGlassIcon, QrCodeIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import Pill from "../../ui/Pill";
import SegmentedControl from "../../ui/SegmentedControl";
import type { Lang } from "../../../lib/kelas";
import { href } from "../../../lib/app";
import { unduhXlsx } from "../../../lib/xlsx";
import { isFail, recPost, useRecAttendance, useRecEdition } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import type { AttendanceRow, EventLite } from "../../../lib/recruitment/types";
import { judulAcara } from "../judul";
import { S2 } from "../s2Strings";
import { kapanAcara } from "../shared";
import Skeleton from "../../ui/Skeleton";

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
  // Whoever holds rollback may also take back a scan.
  const kendali = useRecEdition(true).data?.rights?.cuttingLock === true;
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
      ...(r.via !== "manual" ? { force: true } : {}),
    });
    if (isFail(res))
      return void window.Toast?.show(
        res.kode === "tidak_bisa_batal" ? t.cantUndo : t.fail,
        "danger",
      );
    window.Toast?.show(t.undone, "warn");
    att.refresh();
  }

  const unit = event.kind === "interview" || event.kind === "teaching" ? t.unitBooth : t.unitHere;
  function unduh() {
    void unduhXlsx(
      `kehadiran-${event.stage ?? event.kind}`,
      [t.colName, "NIM", t.colStatus],
      baris.map((r) => [
        r.nama,
        r.nim,
        r.present
          ? t.via(r.via ?? "manual", r.at ? jam(r.at) : "", r.by ? r.by.slice(-3) : null)
          : t.notYet,
      ]),
      "Kehadiran",
    );
    window.Toast?.show(`${t.xlsx}: kehadiran-${event.stage ?? event.kind}.xlsx`, "ok");
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.absen(judulAcara(event, lang))}
      description={`${kapanAcara(event, lang)}${event.place ? ` · ${event.place}` : ""}`}
      size="lg"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" onClick={unduh}>
          <DownloadSimpleIcon size={18} aria-hidden="true" />
          <span className="btn__label">{t.xlsx}</span>
        </button>
      }
      actions={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          <span className="btn__label">{t.done}</span>
        </button>
      }
    >
      <div className="stack r2hub">
        <section className="r2hub__step r2hub__step--wall">
          <span className="r2hub__n" aria-hidden="true">
            1
          </span>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <b>{t.wallTitle}</b>
            <span className="hint">{t.wallHint}</span>
          </div>
          <div className="r2hub__live" role="status">
            <b className="num">{hadir}</b>
            <span className="hint">{t.outOf(baris.length, unit)}</span>
            <span
              className="r2hub__bar"
              style={{ "--p": baris.length ? hadir / baris.length : 0 } as CSSProperties}
            >
              <i />
            </span>
          </div>
          <a
            className="btn btn--primary"
            href={href(lang, "/recruitment/qr")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <QrCodeIcon size={18} aria-hidden="true" />
            <span className="btn__label">{t.open}</span>
          </a>
        </section>
        <section className="r2hub__step r2hub__step--list">
          <span className="r2hub__n" aria-hidden="true">
            2
          </span>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <b>{t.listTitle}</b>
            <span className="hint">{t.listHint}</span>
          </div>
        </section>
        <div className="row rec-tools">
          <div className="rec-search">
            <MagnifyingGlassIcon className="ic" size={18} aria-hidden="true" />
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
          <Skeleton height={240} />
        ) : list.length === 0 ? (
          <ul className="r2att__list">
            <li className="r2att__none hint">{f === "belum" ? t.everyone : t.nobody}</li>
          </ul>
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
                {r.present && (r.via === "manual" || kendali) ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void batal(r)}
                  >
                    {t.undo}
                  </button>
                ) : !r.present ? (
                  <button
                    type="button"
                    className={`btn btn--sm ${mark === r.id ? "btn--ghost" : "btn--inverse"}`}
                    onClick={() => setMark(mark === r.id ? null : r.id)}
                  >
                    <span className="btn__label">{mark === r.id ? t.cancel : t.mark}</span>
                  </button>
                ) : (
                  <span />
                )}
                {mark === r.id && !r.present && (
                  <div className="r2att__why" role="group" aria-label={t.why}>
                    <span className="hint">{t.why}</span>
                    {t.reasons.map((x) => (
                      <button
                        type="button"
                        className="chipbtn"
                        key={x}
                        onClick={() => void tandai(r, x)}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
