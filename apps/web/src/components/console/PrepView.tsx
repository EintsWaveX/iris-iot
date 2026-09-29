/**
 * Persiapan (P8.1): everything a session needs, usable before and during
 * it. Assistant assignment (one per group, suggested from the schedule),
 * module access, the roster paste, slides and schematics.
 *
 * Layout: two columns from 1024px (assignment and access on the left, the
 * roster and the libraries on the right), one column below. Nothing is
 * squeezed into a third column, which is what made the prototype cramped.
 */
import { useMemo, useState, type CSSProperties } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { parseRosterPaste, rosterToPaste } from "../../lib/roster-parser";
import { KELOMPOK_NAMA, postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import { AccessForm } from "./SessionBar";
import { SchematicLibrary, SlidesLibrary } from "./Libraries";
import type { AsistenRef, Penugasan, RosterGroup, SesiRunning } from "./types";

export default function PrepView({
  t,
  lang,
  sesi,
  roster,
  assign,
  meNim,
  onChanged,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning | null;
  roster: RosterGroup[];
  assign: Penugasan | null;
  meNim: string;
  onChanged: () => void;
}) {
  const kode = (nim: string) => assign?.asisten.find((a) => a.nim === nim)?.kode ?? nim;
  return (
    <div className="prep">
      <div className="prep__col">
        {sesi && (
          <AssignmentPanel
            t={t}
            sesi={sesi}
            roster={roster}
            assign={assign}
            meNim={meNim}
            onChanged={onChanged}
          />
        )}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.accTitle}</h2>
          </div>
          <AccessForm t={t} lang={lang} bare />
        </section>
      </div>
      <div className="prep__col">
        <RosterPanel t={t} roster={roster} onChanged={onChanged} />
        <SlidesLibrary t={t} lang={lang} kode={kode} />
      </div>
      <SchematicLibrary t={t} lang={lang} kode={kode} />
    </div>
  );
}

/* ------------------------------------------------------------ assignment */

function AssignmentPanel({
  t,
  sesi,
  roster,
  assign,
  meNim,
  onChanged,
}: {
  t: Strings;
  sesi: SesiRunning;
  roster: RosterGroup[];
  assign: Penugasan | null;
  meNim: string;
  onChanged: () => void;
}) {
  const byGroup = new Map((assign?.penugasan ?? []).map((p) => [p.kelompokId, p.asistenNim]));
  const holds = new Map<string, number>();
  for (const nim of byGroup.values()) holds.set(nim, (holds.get(nim) ?? 0) + 1);
  const groups = roster.filter((g) => g.aktif !== false).slice(0, 5);

  async function set(kelompokId: number, nomor: number, nim: string | null) {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/assignment", {
        sesiId: sesi.id,
        kelompokId,
        asistenNim: nim,
        alasan: nim ? "ubah" : "hapus",
      });
      if (!r.ok) {
        window.Toast?.show(pesan(t, r.kode), "danger");
        return;
      }
      const k = assign?.asisten.find((a) => a.nim === nim)?.kode ?? "";
      window.Toast?.show(nim ? t.assigned(nomor, k) : t.cleared(nomor), "ok");
      onChanged();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.assignTitle}</h2>
          <p className="panel__sub">{t.assignSub}</p>
        </div>
      </div>
      {!assign?.jadwal && <p className="hint">{t.noSchedule}</p>}
      <ul className="assign">
        {groups.map((g) => {
          const nim = byGroup.get(g.id) ?? null;
          const a = nim ? (assign?.asisten.find((x) => x.nim === nim) ?? null) : null;
          const n = nim ? (holds.get(nim) ?? 0) : 0;
          return (
            <li
              key={g.id}
              className="assign__row"
              style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
            >
              <span className="assign__group">
                <span className="assign__num">{g.nomor}</span>
                <span className="stack" style={{ gap: 0 }}>
                  <b>{KELOMPOK_NAMA[g.nomor] ?? g.nama}</b>
                  <span className="hint truncate">
                    {g.anggota.map((m) => m.nama.split(" ")[0]).join(", ")}
                  </span>
                </span>
                {n > 1 && <span className="pill pill--warn">{t.assignHolds(n)}</span>}
              </span>
              <AssistantPicker
                t={t}
                value={a}
                me={meNim}
                assign={assign}
                slotIndex={g.nomor - 1}
                onPick={(x) => void set(g.id, g.nomor, x?.nim ?? null)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AssistantPicker({
  t,
  value,
  me,
  assign,
  slotIndex,
  onPick,
}: {
  t: Strings;
  value: AsistenRef | null;
  me: string;
  assign: Penugasan | null;
  slotIndex: number;
  onPick: (a: AsistenRef | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = assign?.asisten ?? [];
  const byKode = useMemo(() => new Map(all.map((a) => [a.kode.toUpperCase(), a])), [all]);
  const sched = (assign?.jadwal?.asisten ?? [])
    .map((k) => byKode.get(k.toUpperCase()))
    .filter((a): a is AsistenRef => !!a);
  const subs = (assign?.jadwal?.pengganti ?? [])
    .map((p) => ({ a: byKode.get(p.kode.toUpperCase()), tag: p.tag }))
    .filter((x): x is { a: AsistenRef; tag: "fit" | "a24" | null } => !!x.a);
  const ql = q.trim().toLowerCase();
  const match = (a: AsistenRef) =>
    !ql || a.kode.toLowerCase().includes(ql) || a.nama.toLowerCase().includes(ql);
  const suggested = sched[slotIndex] ?? null;

  const row = (a: AsistenRef, tag?: "fit" | "a24" | null, star?: boolean) => (
    <button
      key={a.nim + (tag ?? "")}
      type="button"
      className="picker__row"
      aria-pressed={value?.nim === a.nim}
      onClick={() => {
        onPick(a);
        setOpen(false);
      }}
    >
      <span className="code-badge" data-me={a.nim === me ? "yes" : undefined}>
        {a.kode}
      </span>
      <span className="grow truncate">{a.nama}</span>
      {star && <span className="pill pill--accent">{t.assignFromSchedule}</span>}
      {tag === "fit" && <span className="pill pill--danger">{t.tagFit}</span>}
      {tag === "a24" && <span className="pill pill--gold">{t.tagA24}</span>}
      {value?.nim === a.nim && <Check size={18} aria-hidden="true" />}
    </button>
  );

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button type="button" className="picker__trigger">
          <span
            className={`code-badge${value ? "" : " code-badge--empty"}`}
            data-me={value?.nim === me ? "yes" : undefined}
          >
            {value?.kode ?? "?"}
          </span>
          <span className="grow truncate">{value?.nama ?? t.assignPick}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="console-pop picker sweep-edge"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <label className="picker__search">
            <Search size={16} aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.assignPick}
              autoFocus
              aria-label={t.assignPick}
            />
          </label>
          <div className="picker__list">
            {sched.filter(match).length > 0 && (
              <>
                <span className="label-caps">{t.assignFromSchedule}</span>
                {sched.filter(match).map((a) => row(a, null, a === suggested))}
              </>
            )}
            {subs.filter((x) => match(x.a)).length > 0 && (
              <>
                <span className="label-caps">{t.assignSubs}</span>
                {subs.filter((x) => match(x.a)).map((x) => row(x.a, x.tag))}
              </>
            )}
            <span className="label-caps">{t.filters.all}</span>
            {all.filter(match).map((a) => row(a))}
          </div>
          {value && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
            >
              {t.assignNone}
            </button>
          )}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

/* ---------------------------------------------------------------- roster */

function RosterPanel({
  t,
  roster,
  onChanged,
}: {
  t: Strings;
  roster: RosterGroup[];
  onChanged: () => void;
}) {
  const [paste, setPaste] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const text = paste ?? rosterToPaste(roster);
  const parsed = useMemo(() => parseRosterPaste(text), [text]);
  const dirty = paste !== null && paste !== rosterToPaste(roster);

  async function save() {
    setSaving(true);
    try {
      const r = await postJson<{ ok: boolean; kode?: string; groups?: number; total?: number }>(
        "/api/session/roster",
        { paste: text },
      );
      if (r.ok) {
        window.Toast?.show(t.rosterSaved(r.groups ?? 0, r.total ?? 0), "ok");
        setPaste(null);
        onChanged();
      } else window.Toast?.show(pesan(t, r.kode), "danger");
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.rosterTitle}</h2>
          <p className="panel__sub">{t.rosterSub}</p>
        </div>
      </div>
      <textarea
        className="field__input mono console-textarea roster__paste"
        rows={10}
        value={text}
        spellCheck={false}
        onChange={(e) => setPaste(e.target.value)}
        aria-label={t.rosterTitle}
        placeholder={
          "#1 Vela\n2311102001 Alya Rahmawati\n2311102014 Bagus Prasetyo\n\n#2 Lyra\n2311102033 Dimas Aditya"
        }
      />
      <div className="row">
        <span className="pill pill--mono">{t.rosterStats(parsed.groups.length, parsed.total)}</span>
        {parsed.errors.length > 0 ? (
          <span className="pill pill--danger">{t.rosterErr(parsed.errors.length)}</span>
        ) : (
          dirty && <span className="pill pill--ok">{t.rosterOk}</span>
        )}
      </div>
      {parsed.errors.length > 0 && (
        <ul className="roster__errors">
          {parsed.errors.slice(0, 6).map((e, i) => (
            <li key={i}>
              {e.kode === "tanpa_kelompok"
                ? t.rosterErrNoGroup(e.baris ?? 0)
                : e.kode === "nim_ganda"
                  ? t.rosterErrDup(e.nim ?? "")
                  : t.rosterErrLine(e.baris ?? 0)}
            </li>
          ))}
        </ul>
      )}
      <div className="panel__foot">
        {dirty && (
          <button type="button" className="btn btn--ghost" onClick={() => setPaste(null)}>
            {t.cancel}
          </button>
        )}
        <button
          type="button"
          className="btn btn--primary"
          disabled={!dirty || saving || parsed.errors.length > 0 || !text.trim()}
          data-loading={saving ? "yes" : undefined}
          onClick={() => void save()}
        >
          <span className="btn__label">{t.rosterSave}</span>
          <span className="btn__spinner" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
