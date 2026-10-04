/**
 * The group inspector (Phase 9, mockup c-run): one group beside the board.
 *
 * - Head: the group badge and name, its Asisten as "Full Name (CODE)", and
 *   Ganti Asisten (with a reason) or, for a free group, Pegang.
 * - Banners: a raised hand with Tandai Selesai; the double-management
 *   SeeLabs lender for a second group I hold; a lock when someone else
 *   scores this group.
 * - Four live cards (G2), each opening its detail: correct blanks and the
 *   average delay and lost messages (per-group charts), then the module's
 *   own value (LED, temperature, position, distance) over the live rows.
 * - Nilai: one student at a time, TP to L2 in one row; Enter walks on.
 * - Footer: who enters the scores, Lihat Sebagai Praktikan, the SeeLabs
 *   chip and Salin untuk SeeLabs. The pairing history closes the card.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  CopyIcon,
  EyeIcon,
  HandCoinsIcon,
  HandIcon,
  LockSimpleIcon,
  UserSwitchIcon,
} from "@phosphor-icons/react";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import { ScoreInput } from "../ui/Controls";
import { ProgressRing } from "../ui/Display";
import { kelompokLabel } from "../../lib/labels";
import { namaAsisten, useDirektori } from "../../lib/people";
import { namaKelompok, postJson, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { LiveRecords, recordStats } from "../../lib/live-records";
import { useTelemetry } from "../live/useTelemetry";
import { Spark, VCard } from "../live/LivePanes";
import DataModal, { type DataKind } from "../live/DataModal";
import "../live/live-room.css";
import SeelabsSheet, { StatusPill } from "./seelabs/SeelabsSheet";
import type { SeelabsTab } from "./seelabs/SeelabsView";
import { kirimSeelabs, type SeelabsData } from "./seelabs/data";
import { SL, pesanSl } from "./seelabs/strings";
import ChangeAssistant, { usePasangan } from "./ChangeAssistant";
import GroupBarsModal, { type BarKind } from "./GroupBarsModal";
import { pesan, type Strings } from "./strings";
import type { NilaiLive } from "./data";
import type { AsistenRef, GroupRow, Stuck } from "./types";

export interface InspectorProps {
  t: Strings;
  lang: Lang;
  sesiId: number;
  modul: number;
  g: GroupRow;
  groups: GroupRow[];
  stuck: Stuck[];
  hand: string | null;
  ownerNim: string | null;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  /** False when the person has no `pair` right at all (Phase 9). */
  bolehPasang: boolean;
  nilai: NilaiLive;
  onChanged: () => void;
  onAsPraktikan: (kelompokId: number) => void;
  seelabs: SeelabsData | null;
  onSeelabs: (tab?: SeelabsTab, nomor?: number | null) => void;
  onSeelabsChanged: () => void;
}

export default function GroupInspector(p: InspectorProps) {
  const { t, lang, sesiId, g, hand, ownerNim, asisten, meNim, nilai } = p;
  const now = useTick(15_000);
  const owner = ownerNim ? (asisten.get(ownerNim) ?? null) : null;
  const ownerName = owner ? namaAsisten(owner) : (ownerNim ?? t.noAssistant);
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

  async function claim() {
    setBusy(true);
    try {
      const r = await postJson<{ ok: boolean; kode?: string; pemilik?: string }>(
        "/api/session/assignment",
        { sesiId, kelompokId: g.id, alasan: "klaim" },
      );
      if (r.ok) {
        window.Toast?.show(t.claimed, "ok");
        p.onChanged();
        nilai.reload();
        return;
      }
      if (r.kode === "sudah_dipegang" && r.pemilik)
        window.Toast?.show(t.ownedBy(namaAsisten(asisten.get(r.pemilik), r.pemilik)), "warn");
      else window.Toast?.show(pesan(t, r.kode), "danger");
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
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
      className="inspector"
      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
      aria-label={t.groupFull(g.nomor)}
    >
      <header className="inspector__head">
        <span className="inspector__name">
          <Pill group={g.nomor} lg>
            {t.group(g.nomor)}
          </Pill>
          <h2 className="inspector__title">{namaKelompok(g.nomor, g.nama)}</h2>
        </span>
        <span className="inspector__who">
          <span className="hint">{t.assistantOf(ownerName)}</span>
          {!ownerNim ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy}
              onClick={() => void claim()}
            >
              {t.claim}
            </button>
          ) : (
            p.bolehPasang && (
              <button type="button" className="btn btn--sm" onClick={() => setChg(true)}>
                <UserSwitchIcon size={18} aria-hidden="true" />
                {t.chg}
              </button>
            )
          )}
        </span>
      </header>

      {hand && (
        <div className="banner banner--warn">
          <HandIcon size={20} aria-hidden="true" />
          <span className="grow">{t.handUp(sejak(hand, lang, now))}</span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void resolveHand()}
          >
            {t.resolve}
          </button>
        </div>
      )}

      <LenderBanner {...p} />

      {ownerNim && !mine && (
        <div className="banner banner--lock">
          <LockSimpleIcon size={20} aria-hidden="true" />
          <span>{t.lockedScores(ownerName)}</span>
        </div>
      )}

      <InspectorCards {...p} />

      <h3 className="inspector__h">{t.scores}</h3>
      <ScoreEditor
        t={t}
        g={g}
        nilai={nilai}
        canEdit={mine || !ownerNim}
        ownerKode={owner?.kode ?? null}
      />

      <div className="inspector__foot">
        <span className="hint">{ownerNim ? t.enteredBy(ownerName) : ""}</span>
        <span className="inspector__acts">
          <button type="button" className="btn btn--sm" onClick={() => p.onAsPraktikan(g.id)}>
            <EyeIcon size={18} aria-hidden="true" />
            {t.viewAs}
          </button>
          <SeelabsChip {...p} />
        </span>
      </div>

      {riwayat.length > 0 && (
        <div className="auditline">
          <span className="field__label">{t.chgHistory}</span>
          {riwayat.map((x, i) => (
            <p key={i}>
              {t.chgLine(nama(x.ke), g.nomor, nama(x.awal ?? x.dari))}
              {x.alasan ? ` ${t.chgReason(x.alasan)}` : ""}
            </p>
          ))}
        </div>
      )}

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

/* ------------------------------------------------------------ live cards */

function InspectorCards(p: InspectorProps) {
  const { t, lang, modul, g } = p;
  const [bars, setBars] = useState<BarKind | null>(null);
  const [dm, setDm] = useState<DataKind | null>(null);
  // Real rows only: a teaching console never shows simulated numbers.
  const tel = useTelemetry(modul, g.nomor, false, 2000, null, false);
  const records = useMemo(() => {
    const s = new LiveRecords(modul);
    for (const r of tel.history) s.pi(r);
    return s.list();
  }, [modul, tel.history]);
  const rows = records.slice(-40);
  const ok = rows.filter((r) => !r.lost);
  const s = recordStats(rows);
  const last = ok.at(-1);
  const n = (k: string) => last?.nilai[k] ?? null;
  const series = (f: (r: (typeof ok)[number]) => number | null | undefined) =>
    ok.map(f).filter((x): x is number => typeof x === "number");
  const dash = (v: number | string | null | undefined) => (v === null || v === undefined ? "·" : v);
  const delay = s.oneway ?? g.telemetri?.delayRataMs ?? null;
  const lost = rows.length ? s.lost : (g.telemetri?.hilangPct ?? null);
  const open = (k: BarKind, label: string) => ({
    onOpen: () => setBars(k),
    openLabel: t.openData(label),
  });

  let own = null;
  if (modul === 1) {
    const led = n("led");
    own = (
      <VCard
        label={t.cardLed}
        v={led === null ? "·" : led ? t.ledOn : t.ledOff}
        tone={led ? "ok" : undefined}
      />
    );
  } else {
    const k: DataKind = modul === 2 ? "suhu" : modul === 3 ? "posisi" : "jarak";
    const label = modul === 2 ? t.cardTemp : modul === 3 ? t.cardPos : t.cardDist;
    const key = modul === 2 ? "suhu" : modul === 3 ? "posisi" : "jarak";
    own = (
      <VCard
        label={label}
        v={dash(n(key))}
        unit={modul === 2 ? "°C" : modul === 3 ? "%" : "m"}
        onOpen={() => setDm(k)}
        openLabel={t.openData(label)}
      >
        <Spark vals={series((r) => r.nilai[key])} />
      </VCard>
    );
  }

  return (
    <>
      <div className="vcards inspector__cards">
        <VCard label={t.cardBlank} v={`${g.benar}/${g.total}`} {...open("blank", t.cardBlank)} />
        <VCard label={t.cardDelay} v={dash(delay)} unit="ms" {...open("delay", t.cardDelay)}>
          <Spark vals={series((r) => r.oneway)} />
        </VCard>
        <VCard
          label={t.cardLost}
          v={dash(lost)}
          unit="%"
          tone={lost !== null && lost > 5 ? "warn" : undefined}
          {...open("lost", t.cardLost)}
        />
        {own}
      </div>
      {bars && (
        <GroupBarsModal
          t={t}
          lang={lang}
          kind={bars}
          modul={modul}
          groups={p.groups}
          focus={g.id}
          stuck={p.stuck}
          open
          onOpenChange={(o) => !o && setBars(null)}
        />
      )}
      {dm && (
        <DataModal
          lang={lang}
          modul={modul}
          kind={dm}
          records={records}
          sub={t.groupFull(g.nomor)}
          open
          onOpenChange={(o) => !o && setDm(null)}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------- score editor */

function ScoreEditor({
  t,
  g,
  nilai,
  canEdit,
  ownerKode,
}: {
  t: Strings;
  g: GroupRow;
  nilai: NilaiLive;
  canEdit: boolean;
  ownerKode: string | null;
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

  async function commit(k: string) {
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
            <span className="truncate">{a.nama}</span>
          </button>
        ))}
      </div>

      {!ownerKode && (
        <div className="banner banner--lock">
          <LockSimpleIcon size={20} aria-hidden="true" />
          <span className="grow">{t.readOnlyNone}</span>
        </div>
      )}

      <div className="scorerow" role="tabpanel" aria-label={s.nama}>
        {komponen.map((k, i) => {
          const key = `${s.nim}.${k}`;
          const v = draft[key] ?? (s.skor[k] != null ? String(s.skor[k]) : "");
          return (
            <label key={k} className="scorerow__cell">
              <span className="scorerow__k">{k}</span>
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
                onBlur={() => void commit(k)}
                onKeyDown={(e) => onKey(e, i)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          );
        })}
      </div>
      <div className="scores__who">
        <span className="hint">
          {s.nama} · <span className="mono">{s.nim}</span>
        </span>
        <span className="grow" />
        <Pill tone={s.lengkap ? "ok" : undefined}>{s.lengkap ? t.complete : t.incomplete}</Pill>
        <span className="scores__total">
          <span className="label-caps">{t.total}</span>
          <span className="num">{s.total}</span>
        </span>
      </div>
      {canEdit && <p className="hint">{t.enterHint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ SeeLabs */

function useSeelabsGroup(p: InspectorProps) {
  const { g, meNim, seelabs } = p;
  const sg = seelabs?.kelompok.find((x) => x.nomor === g.nomor) ?? null;
  const mineSl = !!sg && (sg.penilai === meNim || sg.akun === meNim);
  const punyaku = seelabs
    ? seelabs.kelompok.filter((x) => x.penilai === meNim).map((x) => x.nomor)
    : [];
  const kedua = !!sg && sg.penilai === meNim && punyaku.indexOf(g.nomor) > 0;
  return { sg, mineSl, punyaku, kedua };
}

/** A second group I hold needs a lender's SeeLabs account (mockup c-run). */
function LenderBanner(p: InspectorProps) {
  const { lang, g, meNim, seelabs } = p;
  const t = SL[lang];
  const dir = useDirektori();
  const [busy, setBusy] = useState(false);
  const { sg, punyaku, kedua } = useSeelabsGroup(p);
  if (!seelabs || !sg || !kedua) return null;
  const label = kelompokLabel(g.nomor, lang);

  async function pilih(v: string) {
    const akun = v === "none" ? null : v;
    if (akun === (sg!.pinjam ? sg!.akun : null)) return;
    setBusy(true);
    try {
      const r = await kirimSeelabs({
        aksi: "akun",
        sesiId: seelabs!.sesi.id,
        kelompok: g.nomor,
        akun,
      });
      if (!r.ok) {
        window.Toast?.show(pesanSl(t, r.kode), "danger");
        return;
      }
      window.Toast?.show(
        akun ? t.lenderLogged(dir.nama(meNim), dir.nama(akun), label) : t.lenderCleared(label),
        "ok",
      );
      p.onSeelabsChanged();
    } catch {
      window.Toast?.show(t.codeFallback, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="banner banner--warn dmbanner">
      <HandCoinsIcon size={20} aria-hidden="true" />
      <div className="stack stack--sm grow">
        <b>{t.holdTitle(punyaku.length)}</b>
        <span>{t.holdBody(label)}</span>
        <Dropdown
          id={`see-akun-${g.nomor}`}
          label={t.accountFor(label)}
          value={sg.pinjam && sg.akun ? sg.akun : "none"}
          disabled={busy}
          onChange={(v) => void pilih(v)}
          options={[
            { value: "none", label: t.pickLender },
            ...seelabs.pemberi.map((nim) => ({ value: nim, label: dir.nama(nim) })),
          ]}
        />
      </div>
    </div>
  );
}

/** The group's SeeLabs chip and Salin untuk SeeLabs, for its own Asisten. */
function SeelabsChip(p: InspectorProps) {
  const { lang, seelabs } = p;
  const t = SL[lang];
  const dir = useDirektori();
  const [open, setOpen] = useState(false);
  const { sg, mineSl } = useSeelabsGroup(p);
  if (!seelabs || !sg || !mineSl) return null;
  const kode = (nim: string | null) =>
    nim ? (dir.byNim.get(nim)?.kode?.toUpperCase() ?? nim) : "?";
  return (
    <>
      <span className="seechip">
        <span className="hint">{t.seelabsLabel}</span>
        <b className="mono">{sg.akun ? kode(sg.akun) : "·"}</b>
        <StatusPill t={t} status={sg.status} />
      </span>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={!sg.akun}
        title={!sg.akun ? t.pickAccountFirst : undefined}
        onClick={() => setOpen(true)}
      >
        <CopyIcon size={16} aria-hidden="true" />
        {t.copyFor}
      </button>
      {open && (
        <SeelabsSheet
          open
          onOpenChange={setOpen}
          t={t}
          lang={lang}
          data={seelabs}
          g={sg}
          nama={dir.nama}
          kode={kode}
          onHow={() => p.onSeelabs("pasang")}
          onChanged={p.onSeelabsChanged}
        />
      )}
    </>
  );
}
