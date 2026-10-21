/**
 * Ending a session (P8.6b): "Akhiri" opens a recap first, listing what is
 * still open (missing scores per group, groups without notes, stuck blanks,
 * raised hands, my groups not yet sent with Kirim Nilai, the Module 4 hotspot), each one a
 * button that jumps straight to it. "Batalkan sesi" lives here too, behind
 * its own confirm.
 *
 * 2026-10-22: only what is still open gets a row; what is fine folds into
 * one line. The recap is the confirmation: its end button is held, not a
 * second dialog on top.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { CaretRightIcon, CheckCircleIcon, WarningIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Confirm from "../ui/Confirm";
import HoldButton from "../ui/HoldButton";
import { postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import type { NilaiData, GroupRow, SesiRunning, Stuck } from "./types";
import { N } from "../shell/nilaiStrings";

interface Cek {
  key: string;
  ok: boolean;
  title: string;
  body?: ReactNode;
  onJump?: () => void;
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
  meNim,
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
  /** The signed-in Asisten, whose unsent groups are listed (Lupa Input Nilai) */
  meNim: string;
  onJumpGroup: (id: number) => void;
  onJumpTable: () => void;
  onEnded: (kind: "end" | "cancel") => void;
  /** Marks these NIMs Tidak Hadir; resolves when every request settled */
  onMarkAbsent: (nims: string[]) => Promise<void>;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [marking, setMarking] = useState(false);
  const [ending, setEnding] = useState(false);

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
  // My groups not sent with Kirim Nilai yet: ending is still allowed, the
  // reminders take over (Lupa Input Nilai).
  const belumKirim = (nilai?.kelompok ?? []).filter(
    (k) => nilai?.pemilik[k.id] === meNim && !nilai?.terkirim[k.nomor],
  );
  const n18 = N[lang];

  function jump(id: number) {
    onOpenChange(false);
    onJumpGroup(id);
  }
  const keTabel = () => {
    onOpenChange(false);
    onJumpTable();
  };

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
    <span className="row endchk__chips">
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

  const cek: Cek[] = [
    {
      key: "nilai",
      ok: missingTotal === 0,
      title: missingTotal === 0 ? t.chkScoresOk : t.chkScores,
      body: missingTotal > 0 && (
        <>
          <span className="hint">{t.chkMissing(missingTotal)}</span>
          {chips(missing.map((x) => x.k.id))}
        </>
      ),
      onJump: keTabel,
    },
    ...(absentees.length > 0
      ? [
          {
            key: "absen",
            ok: false,
            title: t.chkAbsent(absentees.length),
            body: (
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
            ),
          },
        ]
      : []),
    {
      key: "catatan",
      ok: noNotes.length === 0,
      title: noNotes.length ? t.chkNotes : t.chkNotesOk,
      body: noNotes.length > 0 && chips(noNotes.map((g) => g.id)),
    },
    {
      key: "macet",
      ok: stuckGroups.length === 0,
      title: stuckGroups.length ? t.chkStuck : t.chkStuckOk,
      body: stuckGroups.length > 0 && chips(stuckGroups),
    },
    {
      key: "tangan",
      ok: hands.length === 0,
      title: hands.length ? t.chkHands : t.chkHandsOk,
      body: hands.length > 0 && chips(hands),
    },
    {
      key: "kirim",
      ok: belumKirim.length === 0,
      title: belumKirim.length ? n18.akhiriJudul(belumKirim.length) : n18.akhiriOk,
      body: belumKirim.length > 0 && (
        <>
          <span className="hint">{n18.akhiriBelum}</span>
          {chips(belumKirim.map((k) => k.id))}
        </>
      ),
      onJump: keTabel,
    },
    ...(sesi.modul === 4 && sesi.butuhAp ? [{ key: "ap", ok: true, title: t.chkAp }] : []),
  ];
  const terbuka = cek.filter((c) => !c.ok);
  const beres = cek.filter((c) => c.ok);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => !ending && onOpenChange(o)}
        title={t.endTitle}
        description={t.endSub}
        size="lg"
        lang={lang}
        actions={
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => onOpenChange(false)}
            >
              {t.back}
            </button>
            <HoldButton
              label={t.holdEnd}
              disabled={ending}
              onDone={async () => {
                setEnding(true);
                await doEnd("end");
                setEnding(false);
              }}
            />
          </>
        }
      >
        {terbuka.length > 0 && (
          <ul className="endchk">
            {terbuka.map((c) => (
              <li key={c.key} className="endchk__item">
                <span className="endchk__state" aria-hidden="true">
                  <WarningIcon size={20} />
                </span>
                <span className="grow stack endchk__main">
                  <b>{c.title}</b>
                  {c.body}
                </span>
                {c.onJump && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm endchk__go"
                    onClick={c.onJump}
                  >
                    {t.chkOpen}
                    <CaretRightIcon size={14} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {beres.length > 0 && (
          <div className="endchk__ok">
            <CheckCircleIcon size={20} aria-hidden="true" />
            <span className="stack" style={{ gap: 2 }}>
              <b>{t.chkPassed(beres.length)}</b>
              <span className="hint">{beres.map((c) => c.title).join(" · ")}</span>
            </span>
          </div>
        )}
        <p className="hint endchk__hold">{t.holdHint}</p>
        <button
          type="button"
          className="btn btn--ghost btn--sm endchk__cancel"
          onClick={() => setConfirmCancel(true)}
        >
          {t.cancelSesi}
        </button>
      </Dialog>

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
