/**
 * Ending a session (P8.6b): "Akhiri" opens a recap first, listing what is
 * still open (missing scores per group, groups without notes, stuck blanks,
 * raised hands, the Module 4 hotspot), each one a
 * button that jumps straight to it. Only then the danger confirm. "Batalkan
 * sesi" lives here too, behind its own confirm.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircleIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Confirm from "../ui/Confirm";
import { postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import type { NilaiData, GroupRow, SesiRunning, Stuck } from "./types";

function Item({
  ok,
  title,
  children,
  onClick,
}: {
  ok: boolean;
  title: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <li className="endchk__item" data-ok={ok ? "yes" : undefined}>
      <span className="endchk__state" aria-hidden="true">
        {ok ? <CheckCircleIcon size={20} /> : <WarningIcon size={20} />}
      </span>
      <span className="grow stack" style={{ gap: 4 }}>
        <b>{title}</b>
        {children}
      </span>
      {onClick && !ok && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClick}>
          →
        </button>
      )}
    </li>
  );
}

export default function EndFlow({
  t,
  lang,
  open,
  onOpenChange,
  sesi,
  groups,
  stuck,
  tangan,
  nilai,
  onJumpGroup,
  onJumpTable,
  onEnded,
  onMarkAbsent,
}: {
  t: Strings;
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sesi: SesiRunning;
  groups: GroupRow[];
  stuck: Stuck[];
  tangan: Record<string, string>;
  nilai: NilaiData | null;
  onJumpGroup: (id: number) => void;
  onJumpTable: () => void;
  onEnded: (kind: "end" | "cancel") => void;
  /** Marks these NIMs Tidak Hadir; resolves when every request settled */
  onMarkAbsent: (nims: string[]) => Promise<void>;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [marking, setMarking] = useState(false);

  // Who signed in this session; the rest never came, and only need marking.
  const hadir = new Set(groups.flatMap((g) => g.anggota.filter((a) => a.hadir).map((a) => a.nim)));
  const absentees = (nilai?.kelompok ?? []).flatMap((k) =>
    k.anggota.filter((a) => !hadir.has(a.nim) && !a.absen && !a.lengkap).map((a) => a.nim),
  );
  const missing = (nilai?.kelompok ?? [])
    .map((k) => ({ k, n: k.anggota.filter((a) => !a.lengkap && hadir.has(a.nim)).length }))
    .filter((x) => x.n > 0);
  const missingTotal = missing.reduce((a, x) => a + x.n, 0);
  const noNotes = groups.filter((g) => g.sesiAktif && !g.catatan?.trim());
  const stuckGroups = [...new Set(stuck.map((s) => s.kelompokId))];
  const hands = Object.keys(tangan).map(Number);

  function jump(id: number) {
    onOpenChange(false);
    onJumpGroup(id);
  }

  async function doEnd(kind: "end" | "cancel") {
    try {
      const r =
        kind === "end"
          ? await postJson<{ ok: boolean; kode?: string }>("/api/session/end", {})
          : await postJson<{ ok: boolean; kode?: string }>("/api/session/cancel", {
              sesiId: sesi.id,
            });
      if (!r.ok) {
        window.Toast?.show(pesan(t, r.kode), "danger");
        return false;
      }
      window.Toast?.show(kind === "end" ? t.ended : t.cancelled, "ok");
      onOpenChange(false);
      onEnded(kind);
      return true;
    } catch {
      window.Toast?.show(t.fail, "danger");
      return false;
    }
  }

  const chips = (ids: number[]) => (
    <span className="row">
      {ids.map((id) => {
        const g = groups.find((x) => x.id === id);
        if (!g) return null;
        return (
          <button
            key={id}
            type="button"
            className="pill pill--button pill--group"
            style={{ "--pill-hue": `var(--group-${g.nomor})` } as CSSProperties}
            onClick={() => jump(id)}
          >
            {t.groupShort(g.nomor)}
          </button>
        );
      })}
    </span>
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t.endTitle}
        description={t.endSub}
        size="lg"
        lang={lang}
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost endchk__cancel"
              onClick={() => setConfirmCancel(true)}
            >
              <XCircleIcon size={17} aria-hidden="true" /> {t.cancelSesi}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => onOpenChange(false)}
            >
              {t.back}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => setConfirmEnd(true)}>
              {t.endAnyway}
            </button>
          </>
        }
      >
        <ul className="endchk">
          <Item
            ok={missingTotal === 0}
            title={missingTotal === 0 ? t.chkScoresOk : t.chkScores}
            onClick={() => {
              onOpenChange(false);
              onJumpTable();
            }}
          >
            {missingTotal > 0 && (
              <>
                <span className="hint">{t.chkMissing(missingTotal)}</span>
                {chips(missing.map((x) => x.k.id))}
              </>
            )}
          </Item>
          {absentees.length > 0 && (
            <Item ok={false} title={t.chkAbsent(absentees.length)}>
              <span className="row">
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={marking}
                  data-loading={marking ? "yes" : "no"}
                  onClick={async () => {
                    setMarking(true);
                    try {
                      await onMarkAbsent(absentees);
                    } finally {
                      setMarking(false);
                    }
                  }}
                >
                  <span className="btn__label">{t.markAbsent(absentees.length)}</span>
                  <span className="btn__spinner" aria-hidden="true" />
                </button>
              </span>
            </Item>
          )}
          <Item ok={noNotes.length === 0} title={noNotes.length ? t.chkNotes : t.chkNotesOk}>
            {noNotes.length > 0 && chips(noNotes.map((g) => g.id))}
          </Item>
          <Item
            ok={stuckGroups.length === 0}
            title={stuckGroups.length ? t.chkStuck : t.chkStuckOk}
          >
            {stuckGroups.length > 0 && chips(stuckGroups)}
          </Item>
          <Item ok={hands.length === 0} title={hands.length ? t.chkHands : t.chkHandsOk}>
            {hands.length > 0 && chips(hands)}
          </Item>
          {sesi.modul === 4 && sesi.butuhAp && <Item ok title={t.chkAp} />}
        </ul>
      </Dialog>

      <Confirm
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title={t.endConfirmTitle}
        body={t.endConfirmBody}
        confirmLabel={t.end}
        lang={lang}
        onConfirm={() => doEnd("end")}
      />
      <Confirm
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t.cancelTitle}
        body={t.cancelBody}
        confirmLabel={t.cancelSesi}
        lang={lang}
        onConfirm={() => doEnd("cancel")}
      />
    </>
  );
}
