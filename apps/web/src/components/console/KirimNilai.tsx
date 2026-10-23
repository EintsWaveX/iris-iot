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
import { pageLang, postJson } from "../../lib/app";
import SeelabsStrip from "./seelabs/SeelabsStrip";
import SeelabsBaca from "./seelabs/SeelabsBaca";
import { BC } from "./seelabs/bacaStrings";
import type { SeelabsData } from "./seelabs/data";
import { RB } from "./seelabs/robotStrings";
import type { Strings } from "./strings";
import { l1Anggota, type NilaiLive } from "./data";
import "./console.css";

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
  seelabs = null,
}: {
  t: Strings;
  nilai: NilaiLive;
  kelompokId: number;
  canEdit: boolean;
  /** In a group header row: the button and the state only, no hint. */
  compact?: boolean;
  /** Where SeeLabs stands; a sent group marked Berubah offers Kirim Nilai Ulang. */
  seelabs?: SeelabsData | null;
}) {
  const [busy, setBusy] = useState(false);
  const data = nilai.data;
  const g = data?.kelompok.find((k) => k.id === kelompokId);
  if (!data || !g) return null;
  const sent = data.terkirim[g.nomor];
  // L1 counts as the table shows it: the group's automatic one when not typed.
  const kurang = g.anggota.reduce((a, m) => {
    const skor: typeof m.skor = { ...m.skor, L1: l1Anggota(m, g.l1) };
    return a + data.komponen.filter((c) => skor[c] == null).length;
  }, 0);

  async function kirimUlang() {
    setBusy(true);
    const b = BC[pageLang()];
    const r = await postJson<{ ok: boolean; antre?: boolean }>("/api/session/robot", {
      aksi: "kirim_ulang",
      sesiId: nilai.sesiId,
      kelompok: g!.nomor,
    }).catch(() => ({ ok: false, antre: false }));
    setBusy(false);
    const ok = r.ok && r.antre !== false;
    window.Toast?.show(ok ? b.kirimUlangOk : b.gagal, ok ? "ok" : "danger");
  }

  if (sent) {
    // The scores changed after they went to SeeLabs and nothing is on its way:
    // the scorer can send them again from here.
    const sl = seelabs?.kelompok.find((x) => x.nomor === g.nomor);
    const berubah = canEdit && nilai.sesiId !== null && sl?.status === "berubah";
    // A resend that has landed in SeeLabs is the newer Terkirim.
    const pada =
      sl?.status === "terkirim" &&
      sl.disimpanPada &&
      new Date(sl.disimpanPada) > new Date(sent.pada)
        ? sl.disimpanPada
        : sent.pada;
    return (
      <>
        <span className="kirim" data-sent="yes">
          <Pill tone="ok">
            <CheckCircleIcon size={14} aria-hidden="true" />
            {t.kirimSent(jam(pada))}
          </Pill>
          {berubah && (
            <button
              type="button"
              className="btn btn--nilai btn--sm"
              data-st="todo"
              disabled={busy}
              onClick={() => void kirimUlang()}
            >
              {BC[pageLang()].kirimNilaiUlang}
            </button>
          )}
          {!compact && <span className="hint">{t.kirimAfter}</span>}
        </span>
        {/* Phase 14: where the robot's SeeLabs save stands */}
        {!compact && nilai.sesiId !== null && (
          <SeelabsStrip sesiId={nilai.sesiId} nomor={g.nomor} />
        )}
        {/* 2026-10-17: what the robot read back from SeeLabs */}
        {!compact && nilai.sesiId !== null && (
          <SeelabsBaca sesiId={nilai.sesiId} nomor={g.nomor} canEdit={canEdit} sent />
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
    else if (r.r === "akun") {
      const rb = RB[pageLang()];
      window.Toast?.show(`${rb.notSent} ${rb.why[r.alasan ?? ""] ?? ""}`.trim(), "danger");
    } else if (r.r === "owner") window.Toast?.show(t.kirimOwner, "danger");
    else window.Toast?.show(t.fail, "danger");
  }

  // A group scored in SeeLabs only shows its banner before Kirim Nilai.
  const baca = !compact && nilai.sesiId !== null && (
    <SeelabsBaca sesiId={nilai.sesiId} nomor={g.nomor} canEdit={canEdit} sent={false} />
  );

  return (
    <>
      <span className="kirim">
        <button
          type="button"
          className="btn btn--nilai btn--sm"
          data-st="todo"
          disabled={!canEdit || busy || kurang > 0}
          title={kurang > 0 ? t.kirimLeft(kurang) : undefined}
          onClick={() => void kirim()}
        >
          {t.kirimBtn}
        </button>
        <span className="hint">
          {kurang > 0 ? t.kirimLeft(kurang) : compact ? "" : t.kirimHint}
        </span>
      </span>
      {baca}
    </>
  );
}
