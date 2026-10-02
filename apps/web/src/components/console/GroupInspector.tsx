/**
 * The group inspector (P8.1): one group, everything about it, in one place.
 *
 * - Header: the group, its assistant (claim a free group, or Change
 *   Assistant with a reason, Phase 9), and whether it is active this
 *   session. The pairing history sits at the bottom.
 * - Bantuan: a raised hand with "Tandai selesai", and the stuck blanks.
 * - Nilai: one student at a time, eight 56px fields; Enter walks TP to L2
 *   and then on to the next student. Only the group's own assistant can
 *   type; everyone else sees the same numbers read only, updated live.
 * - Anggota, Alur (median delay, messages)
 *   and Catatan / Peran.
 *
 * Laid out with a container query, so it reads as one column in a narrow
 * pane or a sheet and as a two-column grid when the pane is wide.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { namaAsisten } from "../../lib/people";
import { LockSimpleIcon, WarningIcon } from "@phosphor-icons/react";
import { ScoreInput, Switch } from "../ui/Controls";
import ChangeAssistant, { usePasangan } from "./ChangeAssistant";
import { ProgressRing } from "../ui/Display";
import { namaKelompok, postJson, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import type { NilaiLive } from "./data";
import type { AsistenRef, GroupRow, Stuck } from "./types";

export interface InspectorProps {
  t: Strings;
  lang: Lang;
  sesiId: number;
  modul: number;
  g: GroupRow;
  stuck: Stuck[];
  hand: string | null;
  ownerNim: string | null;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  /** False when the person has no `pair` right at all (Phase 9). */
  bolehPasang: boolean;
  nilai: NilaiLive;
  onChanged: () => void;
  onOpenTable: () => void;
}

export default function GroupInspector(p: InspectorProps) {
  const { t, lang, sesiId, modul, g, stuck, hand, ownerNim, asisten, meNim, nilai } = p;
  const now = useTick(15_000);
  const owner = ownerNim ? (asisten.get(ownerNim) ?? null) : null;
  const mine = ownerNim === meNim;
  const [chg, setChg] = useState(false);
  const pasangan = usePasangan(sesiId);
  const mineEv = pasangan.list.filter((x) => x.kelompokId === g.id);
  const awal = mineEv[0] ? (mineEv[0].awal ?? mineEv[0].dari) : ownerNim;
  // Claiming a free group isn't a change from the pairing, so the history
  // lists only the times someone was replaced.
  const riwayat = mineEv.filter((x) => x.dari !== null);
  const nama = (nim: string | null) => (nim ? namaAsisten(asisten.get(nim), nim) : "?");
  const [busy, setBusy] = useState(false);

  async function assign(alasan: "klaim") {
    setBusy(true);
    try {
      const r = await postJson<{ ok: boolean; kode?: string; pemilik?: string }>(
        "/api/session/assignment",
        { sesiId, kelompokId: g.id, alasan },
      );
      if (r.ok) {
        window.Toast?.show(t.claimed, "ok");
        p.onChanged();
        nilai.reload();
        return true;
      }
      if (r.kode === "sudah_dipegang" && r.pemilik)
        window.Toast?.show(t.ownedBy(namaAsisten(asisten.get(r.pemilik), r.pemilik)), "warn");
      else window.Toast?.show(pesan(t, r.kode), "danger");
      return false;
    } catch {
      window.Toast?.show(t.fail, "danger");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setActive(on: boolean) {
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/group", {
        sesiId,
        kelompokId: g.id,
        aktif: on,
      });
      if (!r.ok) throw new Error();
      window.Toast?.show(on ? t.activeOn : t.activeOff, "ok", {
        action: {
          label: t.undo,
          onClick: () =>
            void postJson("/api/session/group", { sesiId, kelompokId: g.id, aktif: !on }).then(
              p.onChanged,
            ),
        },
      });
      p.onChanged();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  async function resolveHand() {
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/help", { sesiId, kelompokId: g.id });
      if (!r.ok) throw new Error();
      window.Toast?.show(t.resolved, "ok");
      p.onChanged();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  return (
    <article
      className="insp"
      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
      aria-label={t.groupFull(g.nomor)}
    >
      <header className="insp__head">
        <span className="insp__num" aria-hidden="true">
          {g.nomor}
        </span>
        <div className="insp__names">
          <span className="label-caps">{t.group(g.nomor)}</span>
          <h2 className="insp__title">{namaKelompok(g.nomor, g.nama)}</h2>
        </div>
        <div className="insp__owner">
          <span
            className={`code-badge${owner ? "" : " code-badge--empty"}`}
            data-me={mine ? "yes" : undefined}
          >
            {owner?.kode ?? "?"}
          </span>
          <span className="insp__owner-text">
            <span className="label-caps">{t.owner}</span>
            <span>{mine ? t.ownerMe : owner ? t.ownerOther(namaAsisten(owner)) : t.ownerNone}</span>
          </span>
          {!owner ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void assign("klaim")}
            >
              {t.claim}
            </button>
          ) : (
            p.bolehPasang && (
              <button type="button" className="btn btn--secondary" onClick={() => setChg(true)}>
                {t.chg}
              </button>
            )
          )}
        </div>
        <div className="insp__active">
          <Switch on={g.sesiAktif} onChange={(v) => void setActive(v)} label={t.active} showLabel />
        </div>
      </header>

      <div className="insp__grid">
        {/* ------------------------------------------------ help */}
        <section className="insp__sec" data-tone={hand || stuck.length ? "warn" : undefined}>
          <h3 className="insp__sec-title">{t.help}</h3>
          {hand && (
            <div className="insp__hand">
              <span className="insp__hand-text">{t.handUp(sejak(hand, lang, now))}</span>
              <button type="button" className="btn btn--primary" onClick={() => void resolveHand()}>
                {t.resolve}
              </button>
            </div>
          )}
          {stuck.length > 0 && (
            <div className="stack stack--sm">
              <span className="hint">{t.stuckTitle}</span>
              <div className="row">
                {stuck.map((s) => (
                  <span key={s.soalKode} className="pill pill--warn pill--mono">
                    <WarningIcon size={13} aria-hidden="true" /> {s.soalKode.toUpperCase()} ·{" "}
                    {t.tries(s.percobaan)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!hand && stuck.length === 0 && <p className="hint">{t.noHelp}</p>}
        </section>

        {/* --------------------------------------------- members */}
        <section className="insp__sec">
          <h3 className="insp__sec-title">
            {t.members}
            <span className="hint num insp__sec-aside">{t.here(g.hadir, g.anggotaTotal)}</span>
          </h3>
          <ul className="insp__members">
            {g.anggota.map((a) => (
              <li key={a.nim} data-hadir={a.hadir ? "yes" : undefined}>
                <span className={`dot ${a.hadir ? "dot--ok" : "dot--off"}`} aria-hidden="true" />
                <span className="truncate">{a.nama}</span>
                <span className="mono faint insp__nim">{a.nim}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------- scores */}
        <section className="insp__sec insp__sec--wide">
          <h3 className="insp__sec-title">
            {t.scores}
            <button
              type="button"
              className="btn btn--ghost btn--sm insp__sec-aside"
              onClick={p.onOpenTable}
            >
              {t.openTable}
            </button>
          </h3>
          <ScoreEditor
            t={t}
            g={g}
            nilai={nilai}
            canEdit={mine || !ownerNim}
            ownerKode={owner?.kode ?? null}
            onClaim={() => void assign("klaim")}
          />
        </section>

        {/* ------------------------------------------------ flow */}
        <section className="insp__sec">
          <h3 className="insp__sec-title">{t.flow}</h3>
          {g.telemetri && g.telemetri.count > 0 ? (
            <div className="insp__flow">
              <div className="stat">
                <span className="stat__value">{g.telemetri.delayMedianMs ?? "·"}</span>
                <span className="stat__label">{t.delta} (ms)</span>
              </div>
              <div className="stat">
                <span className="stat__value">{g.telemetri.count}</span>
                <span className="stat__label">{t.msgs}</span>
              </div>
              {g.telemetri.delayMinMs != null && g.telemetri.delayMaxMs != null && (
                <div className="insp__range">
                  <span className="num hint">
                    {t.range(g.telemetri.delayMinMs, g.telemetri.delayMaxMs)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="hint">{t.noFlow}</p>
          )}
        </section>

        {/* ------------------------------------------------ notes */}
        <section className="insp__sec insp__sec--wide">
          <h3 className="insp__sec-title">{t.notes}</h3>
          <NotesEditor t={t} sesiId={sesiId} g={g} modul={modul} onSaved={p.onChanged} />
        </section>

        {riwayat.length > 0 && (
          <section className="insp__sec insp__sec--wide">
            <div className="auditline">
              <span className="field__label">{t.chgHistory}</span>
              {riwayat.map((x, i) => (
                <p key={i}>
                  {t.chgLine(nama(x.ke), g.nomor, nama(x.awal ?? x.dari))}
                  {x.alasan ? ` ${t.chgReason(x.alasan)}` : ""}
                </p>
              ))}
            </div>
          </section>
        )}
      </div>

      <ChangeAssistant
        t={t}
        lang={lang}
        open={chg}
        onOpenChange={setChg}
        sesiId={sesiId}
        kelompokId={g.id}
        nomor={g.nomor}
        cur={ownerNim}
        awal={awal}
        meNim={p.meNim}
        asisten={asisten}
        onDone={() => {
          pasangan.reload();
          p.onChanged();
          nilai.reload();
        }}
      />
    </article>
  );
}

/* ----------------------------------------------------------- score editor */

function ScoreEditor({
  t,
  g,
  nilai,
  canEdit,
  ownerKode,
  onClaim,
}: {
  t: Strings;
  g: GroupRow;
  nilai: NilaiLive;
  canEdit: boolean;
  ownerKode: string | null;
  onClaim: () => void;
}) {
  const group = nilai.data?.kelompok.find((k) => k.id === g.id) ?? null;
  const komponen = nilai.data?.komponen ?? [];
  const students = useMemo(() => group?.anggota ?? [], [group]);
  const [idx, setIdx] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => setIdx(0), [g.id]);
  useEffect(() => {
    if (pendingFocus.current !== null) {
      refs.current[pendingFocus.current]?.focus();
      refs.current[pendingFocus.current]?.select();
      pendingFocus.current = null;
    }
  }, [idx]);

  if (!nilai.data) return <span className="skeleton" style={{ height: 120 }} />;
  if (!group || students.length === 0) return <p className="hint">{t.noGroups}</p>;

  const s = students[Math.min(idx, students.length - 1)];
  const filled = (a: (typeof students)[number]) => komponen.filter((k) => a.skor[k] != null).length;

  async function commit(k: string, i: number) {
    const key = `${s.nim}.${k}`;
    const raw = draft[key];
    if (raw === undefined) return;
    // Drop the draft first so the blur that follows an Enter does not save twice.
    setDraft((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    const r = await nilai.save(s.nim, k, raw);
    if (r === "range") window.Toast?.show(t.scoreRange, "danger");
    else if (r === "owner") window.Toast?.show(t.notOwner(ownerKode ?? "?"), "danger");
    else if (r === "fail") window.Toast?.show(t.fail, "danger");
    void i;
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const back = e.shiftKey;
    // Blurring commits the field (once); then move on.
    e.currentTarget.blur();
    if (!back && i < komponen.length - 1) refs.current[i + 1]?.focus();
    else if (back && i > 0) refs.current[i - 1]?.focus();
    else if (!back && idx < students.length - 1) {
      pendingFocus.current = 0;
      setIdx(idx + 1);
    } else if (back && idx > 0) {
      pendingFocus.current = komponen.length - 1;
      setIdx(idx - 1);
    }
  }

  return (
    <div className="scores">
      <div className="scores__students" role="tablist" aria-label={t.scores}>
        {students.map((a, i) => (
          <button
            key={a.nim}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className="scores__student"
            onClick={() => setIdx(i)}
          >
            <ProgressRing
              value={filled(a)}
              max={komponen.length}
              color={a.lengkap ? "var(--ok)" : "var(--g, var(--accent))"}
            />
            <span className="truncate">{a.nama.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      <div className="scores__who">
        <b>{s.nama}</b>
        <span className="mono faint">{s.nim}</span>
        <span className="grow" />
        <span className={`pill ${s.lengkap ? "pill--ok" : ""}`}>
          {s.lengkap ? t.complete : t.incomplete}
        </span>
        <span className="scores__total">
          <span className="label-caps">{t.total}</span>
          <span className="num">{s.total}</span>
        </span>
      </div>

      {(!canEdit || !ownerKode) && (
        <div className="scores__lock" data-tone={canEdit ? "info" : undefined}>
          <LockSimpleIcon size={16} aria-hidden="true" />
          <span className="grow">{ownerKode ? t.readOnly(ownerKode) : t.readOnlyNone}</span>
          {!ownerKode && (
            <button type="button" className="btn btn--primary btn--sm" onClick={onClaim}>
              {t.claim}
            </button>
          )}
        </div>
      )}

      <div className="scores__grid" role="tabpanel">
        {komponen.map((k, i) => {
          const key = `${s.nim}.${k}`;
          const v = draft[key] ?? (s.skor[k] != null ? String(s.skor[k]) : "");
          return (
            <label key={k} className="scores__cell">
              <span className="scores__k">{k}</span>
              <ScoreInput
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={v}
                placeholder="·"
                state={nilai.states[key] ?? "idle"}
                flash={nilai.flash[key]}
                readOnlyReason={
                  canEdit ? undefined : ownerKode ? t.readOnly(ownerKode) : t.readOnlyNone
                }
                aria-label={t.scoreFor(k, s.nama)}
                onValue={(x) => setDraft((d) => ({ ...d, [key]: x }))}
                onBlur={() => void commit(k, i)}
                onKeyDown={(e) => onKey(e, i)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          );
        })}
      </div>
      {canEdit && <p className="hint">{t.enterHint}</p>}
    </div>
  );
}

/* ----------------------------------------------------------- notes editor */

function NotesEditor({
  t,
  sesiId,
  g,
  modul,
  onSaved,
}: {
  t: Strings;
  sesiId: number;
  g: GroupRow;
  modul: number;
  onSaved: () => void;
}) {
  const [text, setText] = useState(g.catatan ?? "");
  const [peran, setPeran] = useState<string>(g.peran ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(g.catatan ?? "");
    setPeran(g.peran ?? "");
  }, [g.id, g.catatan, g.peran]);

  async function save(c: string, pr: string) {
    setState("saving");
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/catatan", {
        sesiId,
        kelompokId: g.id,
        catatan: c,
        peran: pr || null,
      });
      if (!r.ok) {
        window.Toast?.show(pesan(t, r.kode), "danger");
        setState("idle");
        return;
      }
      setState("saved");
      onSaved();
      setTimeout(() => setState("idle"), 1600);
    } catch {
      window.Toast?.show(t.fail, "danger");
      setState("idle");
    }
  }

  return (
    <div className="stack">
      <textarea
        className="field__input console-textarea"
        rows={3}
        maxLength={300}
        value={text}
        placeholder={t.notesPh}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          if (text !== (g.catatan ?? "")) void save(text, peran);
        }}
      />
      <div className="row row--between">
        {modul === 4 ? (
          <div className="seg" role="group" aria-label={t.role}>
            {["", "beacon", "hunter"].map((r) => (
              <button
                key={r || "biasa"}
                type="button"
                aria-pressed={peran === r}
                onClick={() => {
                  setPeran(r);
                  void save(text, r);
                }}
              >
                {t.roles[r]}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <span className="hint" aria-live="polite">
          {state === "saving" ? t.saving : state === "saved" ? t.saved : `${text.length}/300`}
        </span>
      </div>
    </div>
  );
}
