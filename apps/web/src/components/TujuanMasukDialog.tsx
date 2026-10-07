/**
 * Why a Praktikan is signing in while a session runs (2026-10-07, user):
 * to join it, which goes on to the session code (and, for someone else's
 * session, the gate), or only to look around (the next module's Ringkasan,
 * journal history, results), which signs in at once without either and
 * counts as no attendance. Picking an option acts; there is nothing to
 * confirm.
 */
import { BookOpenTextIcon, CaretRightIcon, FlaskIcon } from "@phosphor-icons/react";
import Dialog from "./ui/Dialog";
import type { Lang } from "../lib/kelas";
import "./TujuanMasukDialog.css";

export interface TujuanMasukT {
  title: string;
  desc: string;
  ikut: string;
  ikutD: string;
  lihat: string;
  lihatD: string;
  cancel: string;
}

export default function TujuanMasukDialog(p: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
  t: TujuanMasukT;
  busy: boolean;
  onPilih: (tujuan: "praktikum" | "lihat") => void;
}) {
  const opsi = [
    { v: "praktikum" as const, l: p.t.ikut, d: p.t.ikutD, Icon: FlaskIcon },
    { v: "lihat" as const, l: p.t.lihat, d: p.t.lihatD, Icon: BookOpenTextIcon },
  ];
  return (
    <Dialog
      open={p.open}
      onOpenChange={p.onOpenChange}
      title={p.t.title}
      description={p.t.desc}
      size="sm"
      lang={p.lang}
      actions={
        <button type="button" className="btn" onClick={() => p.onOpenChange(false)}>
          {p.t.cancel}
        </button>
      }
    >
      <div className="tujuan">
        {opsi.map(({ v, l, d, Icon }) => (
          <button
            key={v}
            type="button"
            className="tujuan__opt"
            data-utama={v === "praktikum" ? "yes" : undefined}
            disabled={p.busy}
            onClick={() => p.onPilih(v)}
          >
            <Icon size={24} aria-hidden="true" className="tujuan__icon" />
            <span className="tujuan__text">
              <b>{l}</b>
              <span className="hint">{d}</span>
            </span>
            <CaretRightIcon size={18} aria-hidden="true" className="tujuan__caret" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
