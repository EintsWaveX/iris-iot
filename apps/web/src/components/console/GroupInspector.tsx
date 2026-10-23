/**
 * The group inspector (Phase 9, mockup c-run), since Phase 10 the group
 * workspace of the running board (mockup c12-run): Ringkasan (the live
 * cards and what happened), Blank, Nilai and Anggota.
 *
 * - Head: the group badge and name, its Asisten as "Full Name (CODE)", and
 *   Ganti Asisten (with a reason) or, for a free group, Pegang.
 * - Banners: the double-management
 *   SeeLabs lender for a second group I hold; a lock when someone else
 *   scores this group.
 * - Four live cards (G2), each opening its detail: correct blanks and the
 *   average delay and lost messages (per-group charts), then the module's
 *   own value (LED, temperature, position, distance) over the live rows.
 * - Nilai | Blank: the scores, or every blank of the group (BlankPanel:
 *   answers, tries, Open in Code).
 * - Nilai: one student at a time, TP to L2 in one row; Enter walks on. Sama
 *   Rata enters one row for every present member instead, and each
 *   Praktikan has a Tidak Hadir switch (all fields 0, left out of Sama Rata).
 * - Footer: who enters the scores, Lihat Sebagai Praktikan, the SeeLabs
 *   chip. The pairing history closes the card.
 */
import KirimNilai from "./KirimNilai";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { ArrowRightIcon, HandCoinsIcon, LockSimpleIcon } from "@phosphor-icons/react";
import Nil from "../ui/Nil";
import Pill from "../ui/Pill";
import { ScoreInput } from "../ui/Controls";
import { LevelField, L1Field } from "./LevelField";
import { adaTingkat } from "../../lib/nilai-rubrik";
import { l1Anggota, l1DariSistem } from "./data";
import SegmentedControl from "../ui/SegmentedControl";
import { ProgressRing } from "../ui/Display";
import { kelompokLabel } from "../../lib/labels";
import { namaAsisten, useDirektori } from "../../lib/people";
import { getJson, namaKelompok, postJson } from "../../lib/app";
import { useSiaran } from "../../lib/siaran";
import { jamLab } from "../shared/Instruments";
import TambahPraktikan from "./TambahPraktikan";
import { cellOf, type Kolom, type Matriks, type SelMatriks, type WorkTab } from "./RunBoard";
import { R } from "./runStrings";
import type { Lang } from "../../lib/kelas";
import { LiveRecords, recordStats } from "../../lib/live-records";
import { useTelemetry } from "../live/useTelemetry";
import { Spark, VCard } from "../live/LivePanes";
import DataModal, { type DataKind } from "../live/DataModal";
import "../live/live-room.css";
import StatusPill from "./seelabs/StatusPill";
import type { SeelabsData } from "./seelabs/data";
import { AkunPicker } from "./seelabs/AkunPicker";
import { SL } from "./seelabs/strings";
import ChangeAssistant, { usePasangan } from "./ChangeAssistant";
import { useCaraNilai } from "./caraNilai";
import { CekAbsen, useTandaAbsen } from "./TandaAbsen";
import GroupBarsModal, { type BarKind } from "./GroupBarsModal";
import BlankPanel, { type BlankRingkas } from "./BlankPanel";
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
  ownerNim: string | null;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  /** False when the person has no `pair` right at all (Phase 9). */
  bolehPasang: boolean;
  nilai: NilaiLive;
  onChanged: () => void;
  onAsPraktikan: (kelompokId: number) => void;
  seelabs: SeelabsData | null;
  onSeelabsChanged: () => void;
  /** Phase 10 (c12-run): the workspace tab, the class matrix, the shared
   *  Show the Keys switch, a blank to bring into view, and Preparation. */
  tab?: WorkTab;
  onTab?: (t: WorkTab) => void;
  mtx?: Matriks | null;
  kolom?: Kolom[];
  kunci?: boolean;
  onKunci?: (v: boolean) => void;
  fokus?: string | null;
  onPrep?: () => void;
}

export default function GroupInspector(p: InspectorProps) {
  const { t, lang, sesiId, g, ownerNim, asisten, meNim, nilai } = p;
  const r = R[lang];
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
  const [tabSendiri, setTabSendiri] = useState<WorkTab>("ringkasan");
  const tab = p.tab ?? tabSendiri;
  const setTab = p.onTab ?? setTabSendiri;
  const [ringkas, setRingkas] = useState<BlankRingkas | null>(null);
  useEffect(() => setRingkas(null), [g.id]);
  const benar = ringkas?.benar ?? g.benar;
  const total = ringkas?.total ?? g.total;

  async function claim() {
    setBusy(true);
    try {
      const res = await postJson<{ ok: boolean; kode?: string; pemilik?: string }>(
        "/api/session/assignment",
        { sesiId, kelompokId: g.id, alasan: "klaim" },
      );
      if (res.ok) {
        window.Toast?.show(t.claimed, "ok");
        p.onChanged();
        nilai.reload();
        return;
      }
      if (res.kode === "sudah_dipegang" && res.pemilik)
        window.Toast?.show(t.ownedBy(namaAsisten(asisten.get(res.pemilik), res.pemilik)), "warn");
      else window.Toast?.show(pesan(t, res.kode), "danger");
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  const cells = p.mtx?.sel[g.id] ?? {};
  const kolom = p.kolom ?? [];

  return (
    <article
      className="panel inspector work"
      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
      aria-label={t.groupFull(g.nomor)}
      data-area="work"
    >
      <header className="work__head">
        <span
          className="gstar gstar--lg"
          style={{ "--p": total ? benar / total : 0 } as CSSProperties}
          aria-hidden="true"
        >
          <i />
        </span>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h2>
            {t.group(g.nomor)} · {namaKelompok(g.nomor, g.nama)}
          </h2>
          <span className="hint">{r.workSub(ownerName, g.hadir, g.anggotaTotal)}</span>
        </div>
        <div className="work__acts">
          <button type="button" className="btn btn--sm" onClick={() => p.onAsPraktikan(g.id)}>
            {r.viewGroup}
          </button>
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
                {t.chg}
              </button>
            )
          )}
        </div>
      </header>

      <SegmentedControl
        fill
        value={tab}
        onValueChange={(v) => setTab(v as WorkTab)}
        aria-label={t.groupFull(g.nomor)}
        options={[
          { value: "ringkasan", label: r.tabs.ringkasan },
          {
            value: "blank",
            label: <>{r.tabs.blank}</>,
          },
          { value: "nilai", label: r.tabs.nilai },
          { value: "anggota", label: r.tabs.anggota },
        ]}
      />

      <div hidden={tab !== "ringkasan"}>
        <div className="work__over">
          <div className="stack work__live" style={{ gap: 8 }}>
            <span className="label-caps">{r.liveData}</span>
            <InspectorCards {...p} />
          </div>
          <section className="stack" style={{ gap: 8 }}>
            <span className="label-caps">{r.happened}</span>
            <GroupLog lang={lang} cells={cells} kolom={kolom} />
            <button
              type="button"
              className="work__jump sweep-hover"
              onClick={() => setTab("blank")}
            >
              <span className="cells__row" style={{ "--c": "var(--g)" } as CSSProperties}>
                {(kolom.length ? kolom : Array.from({ length: total }, () => null)).map((k, i) => {
                  const s = k ? cellOf(cells[k.soal]) : i < benar ? "b" : "e";
                  return (
                    <i
                      key={k?.soal ?? i}
                      data-on={s === "b" ? "yes" : "no"}
                      data-w={s === "w" ? "yes" : undefined}
                    />
                  );
                })}
              </span>
              <span className="hint">{r.seeBlanks}</span>
              <ArrowRightIcon size={14} aria-hidden="true" />
            </button>
          </section>
        </div>
      </div>

      <div hidden={tab !== "blank"}>
        <BlankPanel
          lang={lang}
          kelompok={g.id}
          nomor={g.nomor}
          onRingkas={setRingkas}
          kunciOn={p.kunci}
          onKunci={p.onKunci}
          fokus={tab === "blank" ? p.fokus : null}
        />
      </div>

      <div hidden={tab !== "nilai"} className="stack">
        <LenderBanner {...p} />
        {ownerNim && !mine && (
          <div className="banner banner--lock">
            <LockSimpleIcon size={20} aria-hidden="true" />
            <span>{t.lockedScores(ownerName)}</span>
          </div>
        )}
        <ScoreEditor
          t={t}
          lang={lang}
          g={g}
          nilai={nilai}
          canEdit={mine || !ownerNim}
          ownerKode={owner?.kode ?? null}
          ownerName={ownerName}
          seelabs={p.seelabs}
        />
        <div className="inspector__foot">
          <span className="hint">{ownerNim ? t.enteredBy(ownerName) : ""}</span>
          <span className="inspector__acts">
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
      </div>

      {tab === "anggota" && (
        <Members
          lang={lang}
          g={g}
          groups={p.groups}
          cells={cells}
          onChanged={p.onChanged}
          onPrep={p.onPrep}
        />
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

/* ------------------------------------------------------- what happened */

/** One group's moments, newest first: blanks right and blanks checked
 *  wrong. */
function GroupLog({
  lang,
  cells,
  kolom,
}: {
  lang: Lang;
  cells: Record<string, SelMatriks>;
  kolom: Kolom[];
}) {
  const r = R[lang];
  const lbl = (soal: string) => kolom.find((k) => k.soal === soal)?.label ?? soal;
  const items: { t: string; k: "blank" | "salah"; text: string }[] = [];
  for (const [soal, c] of Object.entries(cells)) {
    if (!c.pada) continue;
    if (c.benar) items.push({ t: c.pada, k: "blank", text: r.ev.right(lbl(soal), c.oleh ?? "") });
    else if (c.salah > 0 || c.percobaan > 0)
      items.push({ t: c.pada, k: "salah", text: r.ev.wrong(lbl(soal), c.salah || c.percobaan) });
  }
  items.sort((a, b) => b.t.localeCompare(a.t));
  const tone = { blank: "ok", salah: "warn" } as const;
  if (!items.length) return <p className="hint">{r.nothingYet}</p>;
  return (
    <ol className="elog">
      {items.slice(0, 6).map((x, i) => (
        <li key={`${x.t}${i}`} className="elog__row">
          <time className="mono" dateTime={x.t}>
            {jamLab(x.t)}
          </time>
          <span className="elog__tag mono" data-tone={tone[x.k]}>
            {x.k === "blank" ? r.tag.blank : r.tag.salah}
          </span>
          <span className="elog__text">{x.text}</span>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------------- members */

interface HadirKelompok {
  id: number;
  nomor: number;
  aktif: boolean;
  anggota: { nim: string; nama: string; masukPada: string | null; manual: boolean }[];
}

/** Who is in the group: signed in when (or marked by hand), the blanks each
 *  one filled, Mark Present, Add a Student and Move Group. */
function Members({
  lang,
  g,
  groups,
  cells,
  onChanged,
  onPrep,
}: {
  lang: Lang;
  g: GroupRow;
  groups: GroupRow[];
  cells: Record<string, SelMatriks>;
  onChanged: () => void;
  onPrep?: () => void;
}) {
  const r = R[lang];
  const [list, setList] = useState<HadirKelompok[] | null>(null);
  const [add, setAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const muat = () =>
    getJson<{ ok: boolean; kelompok: HadirKelompok[] }>("/api/session/hadir")
      .then((d) => d.ok && setList(d.kelompok))
      .catch(() => setList([]));
  useSiaran(["sesi", "roster"], muat);
  useEffect(() => {
    void muat();
  }, [g.id]);
  const row = list?.find((x) => x.id === g.id || x.nomor === g.nomor);
  const anggota =
    row?.anggota ??
    g.anggota.map((m) => ({ nim: m.nim, nama: m.nama, masukPada: null, manual: false }));
  const hadirOf = (nim: string) =>
    row
      ? !!row.anggota.find((m) => m.nim === nim)?.masukPada
      : !!g.anggota.find((m) => m.nim === nim)?.hadir;
  const filled = (nim: string) =>
    Object.values(cells).filter((c) => c.olehNim === nim && (c.isi || c.benar)).length;
  async function tandai(nim: string, nama: string) {
    setBusy(nim);
    const res = await postJson<{ ok: boolean }>("/api/session/hadir", {
      aksi: "praktikan",
      nim,
    }).catch(() => ({ ok: false }));
    setBusy(null);
    if (!res.ok) return window.Toast?.show(r.markPresent, "danger");
    window.Toast?.show(r.marked(nama), "ok");
    void muat();
    onChanged();
  }
  return (
    <div className="stack">
      {!list ? (
        <span className="skeleton" style={{ height: 160 }} />
      ) : (
        <ul className="mem">
          {anggota.map((m) => {
            const on = hadirOf(m.nim);
            return (
              <li key={m.nim} className="mem__row" data-hadir={on ? "yes" : "no"}>
                <span className={`dot${on ? " dot--ok" : ""}`} aria-hidden="true" />
                <span className="mem__txt">
                  <b>{m.nama}</b>
                  <span className="hint mono">
                    {m.nim}
                    {m.masukPada
                      ? m.manual
                        ? r.byHand
                        : r.signedIn(jamLab(m.masukPada))
                      : on
                        ? ""
                        : r.notIn}
                  </span>
                </span>
                <span className="num hint">{r.filled(filled(m.nim))}</span>
                {!on && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy === m.nim}
                    onClick={() => void tandai(m.nim, m.nama)}
                  >
                    {r.markPresent}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn--sm" onClick={() => setAdd(true)}>
          {r.addStudent}
        </button>
        {onPrep && (
          <button type="button" className="btn btn--inverse btn--sm" onClick={onPrep}>
            {r.moveGroup}
          </button>
        )}
      </div>
      <TambahPraktikan
        lang={lang}
        open={add}
        onOpenChange={setAdd}
        groups={groups.map((x) => ({ nomor: x.nomor, aktif: x.sesiAktif }))}
        onAdded={() => {
          void muat();
          onChanged();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ live cards */

function InspectorCards(p: InspectorProps) {
  const { t, lang, modul, g } = p;
  const [bars, setBars] = useState<BarKind | null>(null);
  const [dm, setDm] = useState<DataKind | null>(null);
  // Real rows only: a teaching console never shows simulated numbers.
  const tel = useTelemetry(modul, g.nomor, false, 2000, null, false, p.sesiId);
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
  const dash = (v: number | string | null | undefined) =>
    v === null || v === undefined ? <Nil lang={lang} /> : v;
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
        v={led === null ? <Nil lang={lang} /> : led ? t.ledOn : t.ledOff}
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

  // A board that never sent anything: one line instead of three empty tiles.
  const silent = rows.length === 0 && delay === null && lost === null;

  return (
    <>
      <div className="vcards inspector__cards" data-silent={silent ? "yes" : undefined}>
        <VCard label={t.cardBlank} v={`${g.benar}/${g.total}`} {...open("blank", t.cardBlank)} />
        {silent && (
          <div className="vcard vcard--note">
            <span className="vcard__s">{R[lang].noBoard}</span>
          </div>
        )}
        {!silent && (
          <>
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
          </>
        )}
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
  lang,
  g,
  nilai,
  canEdit,
  ownerKode,
  ownerName,
  seelabs,
}: {
  t: Strings;
  lang: Lang;
  g: GroupRow;
  nilai: NilaiLive;
  canEdit: boolean;
  ownerKode: string | null;
  ownerName: string;
  seelabs: SeelabsData | null;
}) {
  const group = nilai.data?.kelompok.find((k) => k.id === g.id) ?? null;
  const komponen = nilai.data?.komponen ?? [];
  const students = useMemo(() => group?.anggota ?? [], [group]);
  const [idx, setIdx] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const pendingFocus = useRef<number | null>(null);
  const [cara, setCara] = useCaraNilai();
  const absen = useTandaAbsen(t, lang, nilai, () => ownerName);

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

  const rata = cara === "rata";
  const s = students[Math.min(idx, students.length - 1)];
  const hadir = students.filter((a) => !a.absen);
  /** What a field shows for a member: L1 falls back to the group's automatic one. */
  const val = (a: (typeof students)[number], k: string) =>
    k === "L1" ? l1Anggota(a, group.l1) : a.skor[k];
  const filled = (a: (typeof students)[number]) => komponen.filter((k) => val(a, k) != null).length;
  const readOnlyReason = canEdit ? undefined : ownerKode ? t.readOnly(ownerKode) : t.readOnlyNone;

  /** Sama Rata shows a field's shared value, or nothing with ≠ when the
   *  present members still differ. */
  const bersama = (k: string): { v: string; beda: boolean } => {
    const vals = new Set(hadir.map((a) => val(a, k) ?? null));
    if (vals.size !== 1) return { v: "", beda: true };
    const [v] = [...vals];
    return { v: v === null ? "" : String(v), beda: false };
  };
  const adaBeda = rata && komponen.some((k) => bersama(k).beda);
  const totalBersama = new Set(hadir.map((a) => a.total)).size === 1 ? hadir[0]?.total : null;

  async function commit(k: string, pick?: string) {
    const key = rata ? `${g.id}.rata.${k}` : `${s.nim}.${k}`;
    const raw = pick ?? draft[key];
    if (raw === undefined) return;
    // Drop the draft first so the blur that follows an Enter does not save twice.
    setDraft((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    const r = rata
      ? await nilai.saveMany(
          hadir.map((a) => a.nim),
          k,
          raw,
        )
      : await nilai.save(s.nim, k, raw);
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
    else if (rata) return;
    else if (!back && idx < students.length - 1) {
      pendingFocus.current = 0;
      setIdx(idx + 1);
    } else if (back && idx > 0) {
      pendingFocus.current = komponen.length - 1;
      setIdx(idx - 1);
    }
  }

  /** One field: a student's own (Per Orang) or the group's (Sama Rata). */
  const field = (k: string, i: number) => {
    const key = rata ? `${g.id}.rata.${k}` : `${s.nim}.${k}`;
    const b = rata ? bersama(k) : null;
    const v = draft[key] ?? (b ? b.v : val(s, k) != null ? String(val(s, k)) : "");
    const otomatis = k === "L1" && !(key in draft) && (rata ? hadir : [s]).every(l1DariSistem);
    const props = {
      value: v,
      placeholder: b?.beda ? "≠" : "·",
      state: nilai.states[rata ? `${hadir[0]?.nim}.${k}` : key] ?? ("idle" as const),
      flash: rata ? hadir.some((a) => nilai.flash[`${a.nim}.${k}`]) : nilai.flash[key],
      readOnlyReason: rata && hadir.length === 0 ? t.rataNone : readOnlyReason,
      "aria-label": t.scoreFor(k, rata ? t.groupFull(g.nomor) : s.nama),
      onValue: (x: string) => setDraft((d) => ({ ...d, [key]: x })),
      onBlur: () => void commit(k),
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => onKey(e, i),
      onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    };
    const setRef = (el: HTMLInputElement | null) => {
      refs.current[i] = el;
    };
    return (
      <label key={k} className="scorerow__cell">
        <span className="scorerow__k">{k}</span>
        {adaTingkat(k) ? (
          <LevelField
            ref={setRef}
            {...props}
            komponen={k}
            lang={lang}
            onPick={(x) => {
              setDraft((d) => ({ ...d, [key]: x }));
              void commit(k, x);
            }}
          />
        ) : k === "L1" ? (
          <L1Field ref={setRef} {...props} lang={lang} otomatis={otomatis} />
        ) : (
          <ScoreInput ref={setRef} {...props} />
        )}
      </label>
    );
  };

  return (
    <div className="scores">
      <div className="scores__mode">
        <span className="field__label">{t.caraLabel}</span>
        <SegmentedControl
          fill
          value={cara}
          onValueChange={(v) => setCara(v === "rata" ? "rata" : "orang")}
          aria-label={t.caraLabel}
          options={[
            { value: "orang", label: t.caraOrang },
            { value: "rata", label: t.caraRata },
          ]}
        />
      </div>

      {rata ? (
        <ul className="scores__members" aria-label={t.members}>
          {students.map((a) => (
            <li key={a.nim} className="scores__member" data-absen={a.absen ? "yes" : undefined}>
              <ProgressRing
                value={filled(a)}
                max={komponen.length}
                color={a.lengkap ? "var(--ok)" : "var(--g, var(--accent))"}
              />
              <span className="grow scores__memberName">
                <span className="truncate">{a.nama}</span>
                <span className="hint mono">{a.nim}</span>
              </span>
              <span className="scores__absen">
                <CekAbsen
                  t={t}
                  nama={a.nama}
                  absen={a.absen}
                  disabled={!canEdit}
                  onChange={(on) => absen.ubah(a, on)}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="scores__students" role="tablist" aria-label={t.scores}>
          {students.map((a, i) => (
            <button
              key={a.nim}
              type="button"
              role="tab"
              aria-selected={i === idx}
              className="scores__student"
              data-absen={a.absen ? "yes" : undefined}
              onClick={() => setIdx(i)}
            >
              <ProgressRing
                value={filled(a)}
                max={komponen.length}
                color={a.lengkap ? "var(--ok)" : "var(--g, var(--accent))"}
              />
              <span className="truncate">{a.nama}</span>
              {a.absen && <span className="scores__absenTag">{t.absen}</span>}
            </button>
          ))}
        </div>
      )}

      {!ownerKode && (
        <div className="banner banner--lock">
          <LockSimpleIcon size={20} aria-hidden="true" />
          <span className="grow">{t.readOnlyNone}</span>
        </div>
      )}

      <div
        className="scorerow"
        role={rata ? "group" : "tabpanel"}
        aria-label={rata ? t.groupFull(g.nomor) : s.nama}
      >
        {komponen.map(field)}
      </div>

      {rata ? (
        <div className="scores__who">
          <span className="hint grow">
            {hadir.length === 0 ? t.rataNone : t.rataHint(hadir.length)}
            {adaBeda ? ` ${t.rataMixed}` : ""}
          </span>
          {totalBersama != null && (
            <span className="scores__total">
              <span className="label-caps">{t.total}</span>
              <span className="num">{totalBersama}</span>
            </span>
          )}
        </div>
      ) : (
        <div className="scores__who">
          <span className="hint">
            {s.nama} · <span className="mono">{s.nim}</span>
          </span>
          <span className="grow" />
          <span className="scores__absen">
            <CekAbsen
              t={t}
              nama={s.nama}
              absen={s.absen}
              disabled={!canEdit}
              onChange={(on) => absen.ubah(s, on)}
            />
          </span>
          <Pill tone={s.lengkap ? "ok" : undefined}>{s.lengkap ? t.complete : t.incomplete}</Pill>
          <span className="scores__total">
            <span className="label-caps">{t.total}</span>
            <span className="num">{s.total}</span>
          </span>
        </div>
      )}
      {canEdit && !rata && <p className="hint">{t.enterHint}</p>}
      <KirimNilai t={t} nilai={nilai} kelompokId={g.id} canEdit={canEdit} seelabs={seelabs} />
      {absen.dialog}
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
  // My account already carries two earlier sessions today: every group of
  // this one needs a lender, the lowest numbered included.
  const penuh = !!sg && sg.penilai === meNim && !!seelabs?.penuh.includes(meNim);
  return { sg, mineSl, punyaku, kedua, penuh };
}

/**
 * A second group I hold, or any group of my third session today, needs a
 * lender's SeeLabs account (mockups c-run and k18-nilai).
 */
function LenderBanner(p: InspectorProps) {
  const { lang, g, meNim, seelabs } = p;
  const t = SL[lang];
  const { sg, punyaku, kedua, penuh } = useSeelabsGroup(p);
  if (!seelabs || !sg || !(kedua || penuh)) return null;
  const label = kelompokLabel(g.nomor, lang);

  return (
    <div className="banner banner--warn dmbanner">
      <HandCoinsIcon size={20} aria-hidden="true" />
      <div className="stack stack--sm grow">
        <b>{penuh ? t.capTitle : t.holdTitle(punyaku.length)}</b>
        <span>{penuh ? t.capBody : t.holdBody(label)}</span>
        <AkunPicker
          lang={lang}
          seelabs={seelabs}
          nomor={g.nomor}
          meNim={meNim}
          onChanged={p.onSeelabsChanged}
        />
      </div>
    </div>
  );
}

/** The group's SeeLabs chip (who sends it, where it stands), for its own Asisten. */
function SeelabsChip(p: InspectorProps) {
  const { lang, seelabs } = p;
  const t = SL[lang];
  const dir = useDirektori();
  const { sg, mineSl } = useSeelabsGroup(p);
  if (!seelabs || !sg || !mineSl) return null;
  const kode = (nim: string | null) =>
    nim ? (dir.byNim.get(nim)?.kode?.toUpperCase() ?? nim) : "?";
  return (
    <span className="seechip">
      <span className="hint">{t.seelabsLabel}</span>
      {sg.akun ? <b className="mono">{kode(sg.akun)}</b> : <Nil lang={lang} />}
      <StatusPill t={t} status={sg.status} pada={sg.disimpanPada} />
      {sg.manual && <Pill tone="warn">{t.manualPill}</Pill>}
    </span>
  );
}
