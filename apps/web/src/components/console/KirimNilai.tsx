/**
 * Kirim Nilai (2026-10-09): sends a group's scores once every member has
 * all eight components (a Tidak Hadir member has their zeros). Sending lets
 * the group's Praktikan see their own scores and gives the holder the
 * group's payment unit. Before that it says how many fields are left; after
 * it shows when it was sent, and later edits show to the Praktikan at once.
 */
import { useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import { pageLang } from "../../lib/app";
import SeelabsStrip from "./seelabs/SeelabsStrip";
import { RB } from "./seelabs/robotStrings";
import type { Strings } from "./strings";
import type { NilaiLive } from "./data";

const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

export default function KirimNilai({
  t,
  nilai,
  kelompokId,
  canEdit,
  compact = false,
}: {
  t: Strings;
  nilai: NilaiLive;
  kelompokId: number;
  canEdit: boolean;
  /** In a group header row: the button and the state only, no hint. */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const data = nilai.data;
  const g = data?.kelompok.find((k) => k.id === kelompokId);
  if (!data || !g) return null;
  const sent = data.terkirim[g.nomor];
  const kurang = g.anggota.reduce(
    (a, m) => a + data.komponen.filter((c) => m.skor[c] == null).length,
    0,
  );

  if (sent) {
    return (
      <>
        <span className="kirim" data-sent="yes">
          <Pill tone="ok">
            <CheckCircleIcon size={14} aria-hidden="true" />
            {t.kirimSent(jam(sent.pada))}
          </Pill>
          {!compact && <span className="hint">{t.kirimAfter}</span>}
        </span>
        {/* Phase 14: where the robot's SeeLabs save stands */}
        {!compact && nilai.sesiId !== null && (
          <SeelabsStrip sesiId={nilai.sesiId} nomor={g.nomor} />
        )}
      </>
    );
  }

  async function kirim() {
    setBusy(true);
    const r = await nilai.kirim(kelompokId);
    setBusy(false);
    if (r.r === "ok") {
      // Phase 14: say whether SeeLabs follows by robot or by hand.
      const rb = RB[pageLang()];
      const alasan = r.seelabs?.alasan;
      window.Toast?.show(
        r.seelabs?.antre
          ? rb.sentFollows
          : alasan &&
              alasan !== "robot_mati" &&
              alasan !== "sesi_tot" &&
              alasan !== "sudah_tersimpan"
            ? `${rb.sentHand} ${rb.why[alasan] ?? ""}`.trim()
            : t.kirimOk,
        "ok",
      );
    } else if (r.r === "incomplete") window.Toast?.show(t.kirimLeft(r.kurang ?? kurang), "danger");
    else if (r.r === "owner") window.Toast?.show(t.kirimOwner, "danger");
    else window.Toast?.show(t.fail, "danger");
  }

  return (
    <span className="kirim">
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={!canEdit || busy || kurang > 0}
        title={kurang > 0 ? t.kirimLeft(kurang) : undefined}
        onClick={() => void kirim()}
      >
        {t.kirimBtn}
      </button>
      <span className="hint">{kurang > 0 ? t.kirimLeft(kurang) : compact ? "" : t.kirimHint}</span>
    </span>
  );
}
