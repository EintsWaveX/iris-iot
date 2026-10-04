/**
 * The Tim page (Phase 9 Stage 2, mockup screens t-list and t-person): every
 * Asisten with position, role, badges, status and SeeLabs account; the ten
 * head-role holders and their handovers; one person's drawer with rights,
 * slots this week and the trail. Everyone reads it; the Tim right edits.
 * Penugasan Slot (Stage 4, AssignBoard.tsx) is the second tab, #penugasan;
 * Pembayaran (Stage 6, bayar/PayBoard.tsx) is the third, #pembayaran, for
 * the Tim right only, which also sees everyone's earnings in the list.
 *
 * A head role has one holder. Picking a role someone else holds never
 * saves: the footer turns into Ask for a Handover, Make a Member, Cancel,
 * and the holder keeps the role until they or an Admin accept.
 */
import AssignBoard, { A } from "./AssignBoard";
import PayBoard, { XlsxButton } from "../bayar/PayBoard";
import { useBayar, type BayarData } from "../bayar/data";
import { B } from "../bayar/strings";
import { jumlahkan, rupiah } from "../../lib/bayar";
import { namaAsisten } from "../../lib/people";
import Fade from "../ui/Fade";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CheckCircleIcon,
  EyeIcon,
  HandshakeIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  ProhibitIcon,
  UserPlusIcon,
  WarningIcon,
  ArrowsLeftRightIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Drawer from "../ui/Drawer";
import Dropdown, { type DropdownOption } from "../ui/Dropdown";
import ErrorView from "../ui/ErrorView";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import PersonBadges from "../ui/PersonBadges";
import { Switch } from "../ui/Controls";
import { getJson, HttpError, jamMenit, postJson, tanggalPanjang, useMe } from "../../lib/app";
import {
  DIVISI,
  HAK,
  KATEGORI,
  STATUS_ORANG,
  TIER,
  divisiKepala,
  hakDasar,
  isKategori,
  type HakKey,
  type HakNilai,
  type Kategori,
  type StatusOrang,
  type Tier,
} from "../../lib/hak";
import {
  hariLabel,
  jabatanLabel,
  kategoriLabel,
  kelasLabel,
  statusOrangLabel,
  tierLabel,
} from "../../lib/labels";
import { SLOT_MULAI } from "../../lib/jadwal";
import type { Kelas, Lang } from "../../lib/kelas";
import { T, type Tx } from "./strings";
import "../ui/Tabs.css";
import TierBadge from "../ui/TierBadge";
import "./team.css";

/* ---------------------------------------------------------------- data */

interface OrangTim {
  nim: string;
  nama: string;
  kode: string | null;
  divisi: string | null;
  tier: Tier;
  badges: string[];
  status: StatusOrang;
  seelabsAkun: string | null;
  hakOverride: Partial<Record<string, boolean>>;
  hak: Record<HakKey, HakNilai>;
}

interface Pemegang {
  kategori: string;
  nim: string;
  mulai: string;
}

interface Serah {
  id: number;
  kategori: string;
  dariNim: string;
  keNim: string;
  status: string;
  dimintaOleh: string;
  dibuatPada: string;
}

interface SlotOrang {
  hari: number;
  slot: number;
  kelas: Kelas;
  peran: "tetap" | "pengganti";
}

interface TimData {
  orang: OrangTim[];
  pemegang: Pemegang[];
  serahTerima: Serah[];
  slotMinggu: Record<string, number>;
  slotDaftar: Record<string, SlotOrang[]>;
  saya: { nim: string; hak: Record<HakKey, HakNilai> } | null;
}

interface Jejak {
  id: number;
  pada: string;
  aktorNim: string;
  aksi: string;
  detail: string | null;
}

const API = "/api/session/tim";

type TabTim = "orang" | "penugasan" | "bayar";
const HASH_TAB: Record<TabTim, string> = {
  orang: "",
  penugasan: "#penugasan",
  bayar: "#pembayaran",
};

/** Each scorer's units this semester, summed. */
function hakSemester(d: BayarData): Map<string, ReturnType<typeof jumlahkan>> {
  const per = new Map<string, BayarData["units"]>();
  for (const u of d.units) per.set(u.nimPenilai, [...(per.get(u.nimPenilai) ?? []), u]);
  return new Map([...per].map(([nim, us]) => [nim, jumlahkan(us)]));
}

/** A timestamp's date in the lab's timezone, written out in full. */
function tgl(ts: string, lang: Lang): string {
  const d = new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return tanggalPanjang(d, lang);
}

/** Runs one Tim action; returns null on success or the error's words. */
async function kirim(body: Record<string, unknown>, t: Tx): Promise<string | null> {
  try {
    const r = await postJson<{ ok: boolean; kode?: string }>(API, body);
    if (r.ok) return null;
    return t.err[r.kode ?? ""] ?? t.err.gagal;
  } catch (e) {
    if (e instanceof HttpError && e.message === "403") return t.err.tanpa_hak;
    return t.err.gagal;
  }
}

function toast(msg: string, tone: "ok" | "danger" | "info" = "ok") {
  (window as unknown as { Toast?: { show: (m: string, t: string) => void } }).Toast?.show(
    msg,
    tone,
  );
}

/** "Full Name (CODE)" for a NIM in the team list. */
function useWho(orang: OrangTim[]) {
  return useMemo(() => {
    const by = new Map(orang.map((o) => [o.nim, o]));
    return {
      by,
      who: (nim: string) => {
        const o = by.get(nim);
        return o ? (o.kode ? `${o.nama} (${o.kode})` : o.nama) : nim;
      },
      kode: (nim: string) => by.get(nim)?.kode ?? nim,
    };
  }, [orang]);
}

type Who = ReturnType<typeof useWho>;

/* ---------------------------------------------------------------- page */

export default function TeamPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const me = useMe();
  const [data, setData] = useState<TimData | null>(null);
  const [fail, setFail] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tab, setTab0] = useState<TabTim>("orang");
  // The tab follows the hash on load and on a same-page link (Console's
  // "Penugasan" link, the command palette), like the Server page.
  useEffect(() => {
    const on = () =>
      setTab0(
        location.hash === "#penugasan"
          ? "penugasan"
          : location.hash === "#pembayaran"
            ? "bayar"
            : "orang",
      );
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const setTab = (v: TabTim) => {
    setTab0(v);
    history.replaceState(null, "", v === "orang" ? location.pathname : HASH_TAB[v]);
  };

  const load = useCallback(async () => {
    try {
      const d = await getJson<{ ok: boolean } & TimData>(API);
      if (!d.ok) throw new Error("tim");
      setData(d);
      setFail(false);
    } catch {
      setFail(true);
    }
  }, []);

  useEffect(() => {
    if (me?.role === "asisten") void load();
  }, [me, load]);
  // Everyone gets their own units back; the Tim right gets the whole ledger.
  const bayar = useBayar(!!data);
  // On a phone the third tab starts off screen; keep the open one in view.
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const list = tabsRef.current;
    const on = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !on) return;
    const l = list.getBoundingClientRect();
    const o = on.getBoundingClientRect();
    if (o.right > l.right || o.left < l.left) list.scrollLeft += o.left - l.left - 16;
  }, [tab, data]);

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (me?.role !== "asisten") {
    return <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} why={t.signIn} />;
  }
  if (fail && !data) return <ErrorView code={500} lang={lang} onRetry={() => void load()} />;
  if (!data) return <span className="skeleton" style={{ height: 420 }} />;

  const admin = data.saya?.hak.tim === true;
  const person = open ? data.orang.find((o) => o.nim === open) : undefined;
  const tabs: TabTim[] = admin ? ["orang", "penugasan", "bayar"] : ["orang", "penugasan"];
  const shown: TabTim = tabs.includes(tab) ? tab : "orang";
  const nama = (nim: string | null) => {
    const o = data.orang.find((x) => x.nim === nim);
    return o ? namaAsisten(o, nim ?? "?") : (nim ?? "?");
  };

  return (
    <div className="tim">
      <header className="page-header tim__head">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.eyebrow}</span>
            <h1 className="page-header__title">{t.title}</h1>
          </div>
          <div className="page-header__actions">
            {shown === "bayar" ? (
              bayar.data && <XlsxButton lang={lang} data={bayar.data} nama={nama} />
            ) : shown === "penugasan" ? null : admin ? (
              <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
                <UserPlusIcon size={18} aria-hidden="true" />
                {t.add}
              </button>
            ) : (
              <Pill>
                <EyeIcon size={14} aria-hidden="true" />
                {t.viewOnly}
              </Pill>
            )}
          </div>
        </div>
      </header>

      <div className="tabs-scroll">
        <nav ref={tabsRef} className="tabs" role="tablist" aria-label={A[lang].tabsLabel}>
          {tabs.map((v, i) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={shown === v}
              tabIndex={shown === v ? 0 : -1}
              className="tabs__tab"
              onClick={() => setTab(v)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const d = e.key === "ArrowRight" ? 1 : -1;
                  setTab(tabs[(i + d + tabs.length) % tabs.length]);
                  const list = e.currentTarget.parentElement;
                  requestAnimationFrame(() =>
                    (list?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus(),
                  );
                }
              }}
            >
              {v === "bayar" ? B[lang].tab : A[lang].tabs[v]}
              {v === "orang" && <span className="tabs__count">{data.orang.length}</span>}
            </button>
          ))}
        </nav>
      </div>

      <Fade k={shown}>
        {shown === "orang" ? (
          <div className="stack stack--lg">
            <Holders data={data} t={t} lang={lang} admin={admin} reload={load} />
            <People
              data={data}
              t={t}
              lang={lang}
              onOpen={setOpen}
              hak={admin && bayar.data ? hakSemester(bayar.data) : null}
            />
          </div>
        ) : shown === "penugasan" ? (
          <AssignBoard
            lang={lang}
            bolehJadwal={data.saya?.hak.jadwal !== false && !!data.saya}
            nama={nama}
            meKode={(me.kode ?? "").toUpperCase()}
          />
        ) : bayar.data ? (
          <PayBoard
            lang={lang}
            data={bayar.data}
            nama={nama}
            orang={data.orang
              .filter((o) => o.status === "aktif")
              .map((o) => ({ nim: o.nim, label: nama(o.nim) }))
              .sort((a, b) => a.label.localeCompare(b.label))}
            reload={() => void bayar.load()}
            siapa={(nim) => {
              const o = data.orang.find((x) => x.nim === nim);
              if (!o) return nama(nim);
              return (
                <span className="who">
                  <span className={`acode${nim === me.nim ? " acode--me" : ""}`}>
                    {o.kode ?? "?"}
                  </span>
                  <span className="who__text">
                    <b>{o.nama}</b>
                    <span className="hint">
                      {jabatanLabel(kategoriOf(data, nim), o.divisi, lang)}
                    </span>
                  </span>
                </span>
              );
            }}
          />
        ) : bayar.fail ? (
          <ErrorView code={500} lang={lang} onRetry={() => void bayar.load()} />
        ) : (
          <span className="skeleton" style={{ height: 420 }} />
        )}
      </Fade>

      {person && (
        <PersonDrawer
          key={person.nim}
          person={person}
          data={data}
          t={t}
          lang={lang}
          admin={admin}
          bayar={admin || person.nim === data.saya?.nim ? bayar.data : null}
          onClose={() => setOpen(null)}
          reload={load}
        />
      )}
      {adding && (
        <AddDialog data={data} t={t} lang={lang} onClose={() => setAdding(false)} reload={load} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- badges */

const STATUS_TONE: Record<StatusOrang, "ok" | "warn" | undefined> = {
  aktif: "ok",
  cuti: "warn",
  nonaktif: undefined,
  alumni: undefined,
};

function StatusBadge({ status, lang }: { status: StatusOrang; lang: Lang }) {
  return <Pill tone={STATUS_TONE[status]}>{statusOrangLabel(status, lang)}</Pill>;
}

/** The head role a person holds now, if any. */
function kategoriOf(data: TimData, nim: string): Kategori | null {
  const p = data.pemegang.find((h) => h.nim === nim);
  return p && isKategori(p.kategori) ? p.kategori : null;
}

/* ------------------------------------------------------------ holders */

function Holders({
  data,
  t,
  lang,
  admin,
  reload,
}: {
  data: TimData;
  t: Tx;
  lang: Lang;
  admin: boolean;
  reload: () => Promise<void>;
}) {
  const w = useWho(data.orang);
  const pending = data.serahTerima.filter((s) => s.status === "menunggu");
  const [busy, setBusy] = useState<number | null>(null);
  const saya = data.saya?.nim ?? "";

  const act = async (s: Serah, aksi: "serah_putus" | "serah_batal", terima?: boolean) => {
    setBusy(s.id);
    const err = await kirim({ aksi, id: s.id, ...(aksi === "serah_putus" ? { terima } : {}) }, t);
    setBusy(null);
    if (err) return toast(err, "danger");
    const kat = isKategori(s.kategori) ? kategoriLabel(s.kategori, lang) : s.kategori;
    toast(
      aksi === "serah_batal"
        ? t.withdrawn
        : terima
          ? t.accepted(kat, w.who(s.keNim), w.who(s.dariNim))
          : t.declined,
      terima ? "ok" : "info",
    );
    await reload();
  };

  return (
    <section className="panel tim-holders">
      <div className="panel__head tim-holders__head">
        <h2 className="panel__title">{t.holders}</h2>
        <span className="hint">{t.holdersHint}</span>
      </div>
      <div className="holdgrid">
        {KATEGORI.map((k) => {
          const h = data.pemegang.find((p) => p.kategori === k);
          const pend = pending.find((s) => s.kategori === k);
          return (
            <div key={k} className={`holdrow${pend ? " is-pending" : ""}`}>
              <span className="holdrow__role">{kategoriLabel(k, lang)}</span>
              {h ? (
                <span className="holdrow__who">
                  <b>{w.who(h.nim)}</b>
                  <span className="hint">{t.since(tgl(h.mulai, lang))}</span>
                </span>
              ) : (
                <span className="hint">{t.vacant}</span>
              )}
              {pend ? (
                <Pill tone="warn">
                  <ArrowsLeftRightIcon size={14} aria-hidden="true" />
                  {t.toWhom(w.kode(pend.keNim))}
                </Pill>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
      {pending.map((s) => {
        const kat = isKategori(s.kategori) ? kategoriLabel(s.kategori, lang) : s.kategori;
        const canDecide = admin || s.dariNim === saya;
        const canWithdraw = !canDecide && s.dimintaOleh === saya;
        return (
          <div key={s.id} className="handover">
            <span className="handover__ic" aria-hidden="true">
              <HandshakeIcon size={24} />
            </span>
            <div className="handover__text">
              <b className="handover__title">{t.handover}</b>
              <span>
                {t.handoverBody(w.who(s.dimintaOleh), kat, w.who(s.dariNim), w.who(s.keNim))}
              </span>
              <span className="hint">
                {t.handoverWait(
                  `${tgl(s.dibuatPada, lang)} ${jamMenit(s.dibuatPada, lang)}`,
                  w.kode(s.dariNim),
                )}
              </span>
            </div>
            <div className="handover__act">
              {canDecide ? (
                <>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy === s.id}
                    onClick={() => void act(s, "serah_putus", false)}
                  >
                    {t.decline}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy === s.id}
                    onClick={() => void act(s, "serah_putus", true)}
                  >
                    <CheckCircleIcon size={18} aria-hidden="true" />
                    {t.accept}
                  </button>
                </>
              ) : canWithdraw ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy === s.id}
                  onClick={() => void act(s, "serah_batal")}
                >
                  {t.withdraw}
                </button>
              ) : (
                <Pill tone="warn">{t.waiting(w.kode(s.dariNim))}</Pill>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------- people */

function People({
  data,
  t,
  lang,
  onOpen,
  hak,
}: {
  data: TimData;
  t: Tx;
  lang: Lang;
  onOpen: (nim: string) => void;
  /** Earnings per NIM, for the Tim right only. */
  hak: Map<string, ReturnType<typeof jumlahkan>> | null;
}) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [div, setDiv] = useState("all");
  const [st, setSt] = useState("all");
  const saya = data.saya?.nim;

  // Handbook order: the Inti, the Kepala Divisi, then each division's
  // members; by name within each.
  const rank = (o: OrangTim) => {
    const k = kategoriOf(data, o.nim);
    if (k) return KATEGORI.indexOf(k);
    const d = DIVISI.indexOf(o.divisi as (typeof DIVISI)[number]);
    return KATEGORI.length + (d < 0 ? -1 : d) + 1;
  };
  const rows = [...data.orang]
    .sort((a, b) => rank(a) - rank(b) || a.nama.localeCompare(b.nama))
    .filter(
      (o) =>
        (tier === "all" || o.tier === tier) &&
        (div === "all" || (div === "inti" ? !o.divisi : o.divisi === div)) &&
        (st === "all" || o.status === st) &&
        `${o.nama} ${o.kode ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
    );

  const key = (e: KeyboardEvent, nim: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(nim);
    }
  };

  return (
    <>
      <div className="panel panel--tight tim-filter">
        <label className="searchbox">
          <MagnifyingGlassIcon size={16} aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search}
            aria-label={t.search}
          />
        </label>
        <SegmentedControl
          aria-label={t.role}
          value={tier}
          onValueChange={setTier}
          options={[
            { value: "all", label: t.all },
            ...TIER.map((x) => ({ value: x, label: tierLabel(x, lang) })),
          ]}
        />
        <Dropdown
          id="tim-div"
          label={t.division}
          hideLabel
          value={div}
          onChange={setDiv}
          options={[
            { value: "all", label: t.allDiv },
            { value: "inti", label: t.core },
            ...DIVISI.map((d) => ({ value: d, label: d })),
          ]}
        />
        <Dropdown
          id="tim-status"
          label={t.status}
          hideLabel
          value={st}
          onChange={setSt}
          options={[
            { value: "all", label: t.allStatus },
            ...STATUS_ORANG.map((s) => ({ value: s, label: statusOrangLabel(s, lang) })),
          ]}
        />
      </div>

      <section className="panel panel--flush tim-tablewrap">
        <table className="tim-table">
          <thead>
            <tr>
              <th>{t.colAsisten}</th>
              <th>{t.colRole}</th>
              <th>{t.colBadges}</th>
              <th>{t.colStatus}</th>
              <th>{t.colSeelabs}</th>
              <th>{t.colSlots}</th>
              {hak && <th className="tnum">{B[lang].colEarned}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.nim}
                tabIndex={0}
                data-off={o.status !== "aktif" ? "yes" : undefined}
                onClick={() => onOpen(o.nim)}
                onKeyDown={(e) => key(e, o.nim)}
              >
                <td data-col={t.colAsisten}>
                  <span className="who">
                    <span className={`acode${o.nim === saya ? " acode--me" : ""}`}>
                      {o.kode ?? "?"}
                    </span>
                    <span className="who__text">
                      <b>{o.nama}</b>
                      <span className="hint">
                        {jabatanLabel(kategoriOf(data, o.nim), o.divisi, lang)}
                      </span>
                    </span>
                  </span>
                </td>
                <td data-col={t.colRole}>
                  <TierBadge tier={o.tier} lang={lang} />
                </td>
                <td data-col={t.colBadges} data-empty={o.badges.length ? undefined : "yes"}>
                  <span className="tim-badges">
                    <PersonBadges badges={o.badges} lang={lang} sm />
                  </span>
                </td>
                <td data-col={t.colStatus}>
                  <StatusBadge status={o.status} lang={lang} />
                </td>
                <td
                  data-col={t.colSeelabs}
                  data-empty={o.seelabsAkun ? undefined : "yes"}
                  className="mono"
                >
                  {o.seelabsAkun ?? ""}
                </td>
                <td data-col={t.colSlots} className="tnum">
                  {data.slotMinggu[(o.kode ?? "").toUpperCase()] ?? 0}
                </td>
                {hak && (
                  <td data-col={B[lang].colEarned} className="tnum">
                    {rupiah(hak.get(o.nim)?.kotor ?? 0)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="hint tim-empty">{t.empty}</p>}
      </section>
      <span className="hint">{t.rowHint}</span>
    </>
  );
}

/* ------------------------------------------------- position and clash */

function jabatanOptions(data: TimData, t: Tx, lang: Lang, w: Who): DropdownOption[] {
  return [
    { value: "anggota", label: t.anggota },
    ...KATEGORI.map((k) => {
      const h = data.pemegang.find((p) => p.kategori === k);
      const kat = kategoriLabel(k, lang);
      return { value: k, label: h ? t.heldBy(kat, w.kode(h.nim)) : t.vacantOpt(kat) };
    }),
  ];
}

/** The holder blocking `nim` from taking `jab`, if someone else holds it. */
function clashFor(data: TimData, jab: string, nim: string | null): Pemegang | null {
  if (jab === "anggota") return null;
  const h = data.pemegang.find((p) => p.kategori === jab);
  return h && h.nim !== nim ? h : null;
}

function ClashNote({ holder, t, lang, w }: { holder: Pemegang; t: Tx; lang: Lang; w: Who }) {
  const kat = isKategori(holder.kategori) ? kategoriLabel(holder.kategori, lang) : holder.kategori;
  return (
    <div className="clash" role="status">
      <HandshakeIcon size={20} aria-hidden="true" />
      <div className="clash__text">
        <b>{t.clashTitle(kat, w.who(holder.nim))}</b>
        <span className="hint">{t.clashBody(tgl(holder.mulai, lang), w.kode(holder.nim))}</span>
      </div>
    </div>
  );
}

const DIV_OPTIONS = (t: Tx): DropdownOption[] => [
  { value: "", label: t.core },
  ...DIVISI.map((d) => ({ value: d, label: d })),
];

/* -------------------------------------------------------- person drawer */

function PersonDrawer({
  person: p,
  data,
  t,
  lang,
  admin,
  bayar,
  onClose,
  reload,
}: {
  person: OrangTim;
  data: TimData;
  t: Tx;
  lang: Lang;
  admin: boolean;
  /** Payments data when the viewer may see this person's earnings. */
  bayar: BayarData | null;
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const w = useWho(data.orang);
  const sendiri = data.saya?.nim === p.nim;
  const pencipta = p.badges.includes("pencipta");
  // The Pencipta's position is theirs to change; their rights never shrink.
  const editJab = admin && (!pencipta || sendiri);
  const kat0 = kategoriOf(data, p.nim);
  const [jab, setJab] = useState<string>(kat0 ?? "anggota");
  const [div, setDiv] = useState<string>(p.divisi ?? "");
  const [st, setSt] = useState<StatusOrang>(p.status);
  const [see, setSee] = useState(p.seelabsAkun ?? "");
  const [over, setOver] = useState<Partial<Record<string, boolean>>>(p.hakOverride ?? {});
  const [busy, setBusy] = useState(false);
  const [jejak, setJejak] = useState<Jejak[] | null>(null);

  useEffect(() => {
    let alive = true;
    void getJson<{ ok: boolean; jejak?: Jejak[] }>(`${API}?nim=${encodeURIComponent(p.nim)}`)
      .then((d) => alive && setJejak(d.jejak ?? []))
      .catch(() => alive && setJejak([]));
    return () => {
      alive = false;
    };
  }, [p.nim]);

  const clash = clashFor(data, jab, p.nim);
  const jabKepala = isKategori(jab) ? divisiKepala(jab) : null;
  const holder0 = kat0 ? data.pemegang.find((h) => h.kategori === kat0) : undefined;

  // Only what changed goes to the server.
  const changes: Record<string, unknown> = {};
  if (admin) {
    if (jab !== (kat0 ?? "anggota") && !clash) changes.jabatan = jab;
    if (!jabKepala && div !== (p.divisi ?? "")) changes.divisi = div || null;
    if (st !== p.status) changes.status = st;
    if (JSON.stringify(over) !== JSON.stringify(p.hakOverride ?? {})) changes.hakOverride = over;
  }
  if ((admin || sendiri) && see.trim() !== (p.seelabsAkun ?? "")) changes.seelabs = see.trim();
  const dirty = Object.keys(changes).length > 0;
  const canEdit = admin || sendiri;

  const save = async () => {
    setBusy(true);
    const err = dirty ? await kirim({ aksi: "ubah", nim: p.nim, ...changes }, t) : null;
    setBusy(false);
    if (err) return toast(err, "danger");
    toast(t.saved);
    await reload();
    onClose();
  };

  const askHandover = async () => {
    if (!clash) return;
    setBusy(true);
    // Save the other edits first, then ask for the role.
    const { jabatan: _j, ...rest } = changes;
    const err1 = Object.keys(rest).length
      ? await kirim({ aksi: "ubah", nim: p.nim, ...rest }, t)
      : null;
    const err2 = err1 ?? (await kirim({ aksi: "serah_minta", kategori: jab, keNim: p.nim }, t));
    setBusy(false);
    if (err2) return toast(err2, "danger");
    toast(t.askSent);
    await reload();
    onClose();
  };

  // A right's switch: on keeps what the tier gives (own-slot-only stays so),
  // off removes it. A value equal to the tier's drops the override.
  const setRight = (k: HakKey, on: boolean) => {
    const base = hakDasar(p, k);
    const next: HakNilai = on ? (base !== false ? base : true) : false;
    const o = { ...over };
    if (next === base) delete o[k];
    else o[k] = next === true;
    setOver(o);
  };

  const foot = clash ? (
    <div className="dialog__actions--12 tim-foot12">
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy}
        onClick={() => void askHandover()}
      >
        <HandshakeIcon size={18} aria-hidden="true" />
        {t.ask}
      </button>
      <button type="button" className="btn" onClick={() => setJab("anggota")}>
        {t.makeMember}
      </button>
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {t.cancel}
      </button>
    </div>
  ) : canEdit ? (
    <>
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {t.close}
      </button>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy || !dirty}
        onClick={() => void save()}
      >
        {t.save}
      </button>
    </>
  ) : undefined;

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={w.who(p.nim)}
      description={jabatanLabel(kat0, p.divisi, lang)}
      storeKey="tim-orang"
      defaultWidth={520}
      closeLabel={t.closeDrawer}
      resizeLabel={t.resize}
      foot={foot}
    >
      <div className="tim-drawer">
        <div className="tim-badges">
          <TierBadge tier={p.tier} lang={lang} />
          <PersonBadges badges={p.badges} lang={lang} />
          <StatusBadge status={st} lang={lang} />
        </div>

        <div className="field">
          {editJab ? (
            <Dropdown
              id="tim-jab"
              label={t.position}
              value={jab}
              onChange={setJab}
              options={jabatanOptions(data, t, lang, w)}
            />
          ) : (
            <>
              <span className="field__label">{t.position}</span>
              <span>{jabatanLabel(kat0, p.divisi, lang)}</span>
            </>
          )}
          {clash ? (
            <ClashNote holder={clash} t={t} lang={lang} w={w} />
          ) : (
            kat0 &&
            holder0 && (
              <span className="field__hint">
                {t.holdsSince(kategoriLabel(kat0, lang), tgl(holder0.mulai, lang))}
              </span>
            )
          )}
        </div>

        {admin && (
          <div className="field">
            <Dropdown
              id="tim-div-p"
              label={t.division}
              value={jabKepala ?? div}
              onChange={setDiv}
              disabled={!!jabKepala}
              options={DIV_OPTIONS(t)}
              hint={jabKepala ? t.divFollows : undefined}
            />
          </div>
        )}

        <div className="field">
          <span className="field__label">{t.memberStatus}</span>
          {admin ? (
            <SegmentedControl
              aria-label={t.memberStatus}
              value={st}
              onValueChange={(v) => setSt(v as StatusOrang)}
              options={STATUS_ORANG.map((s) => ({ value: s, label: statusOrangLabel(s, lang) }))}
            />
          ) : (
            <span>{statusOrangLabel(p.status, lang)}</span>
          )}
          <span className="field__hint">{t.statusHint}</span>
        </div>

        <label className="field">
          <span className="field__label">{t.seelabs}</span>
          {canEdit ? (
            <input
              className="field__input mono"
              value={see}
              placeholder={t.seelabsPh}
              maxLength={80}
              onChange={(e) => setSee(e.target.value)}
            />
          ) : (
            <span className={p.seelabsAkun ? "mono" : "hint"}>{p.seelabsAkun ?? t.notSet}</span>
          )}
          <span className="field__hint">{t.seelabsHint}</span>
        </label>

        <section className="tim-sec">
          <h3 className="tim-sec__title">{t.rights}</h3>
          <div className="rightsnote">
            <InfoIcon size={16} aria-hidden="true" />
            <span>{t.rightsNote}</span>
          </div>
          <div className="tim-rows rights">
            {HAK.map((k) => {
              const base = hakDasar(p, k);
              const val: HakNilai = pencipta ? true : (over[k] ?? base);
              const on = val !== false;
              return (
                <div key={k} className="tim-row">
                  <span className={`rightic${on ? " is-on" : ""}`} aria-hidden="true">
                    {on ? <CheckCircleIcon size={20} /> : <ProhibitIcon size={20} />}
                  </span>
                  <span className="rights__text">
                    <span>
                      {t.right[k]}
                      {val === "own" && <span className="hint"> · {t.ownOnly}</span>}
                    </span>
                    {!pencipta && val !== base && <Pill tone="violet">{t.override}</Pill>}
                    {k === "full" && p.badges.includes("dev") && <Pill tone="teal">DEV</Pill>}
                  </span>
                  {admin && !pencipta ? (
                    <Switch on={on} onChange={(v) => setRight(k, v)} label={t.right[k]} />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
          {pencipta && <span className="hint">{t.penciptaHint}</span>}
        </section>

        <section className="tim-sec">
          <h3 className="tim-sec__title">{t.slots}</h3>
          <SlotList slots={data.slotDaftar[(p.kode ?? "").toUpperCase()] ?? []} t={t} lang={lang} />
        </section>

        {bayar && <DrawerPay nim={p.nim} data={bayar} lang={lang} />}

        <section className="tim-sec">
          <h3 className="tim-sec__title">{t.trail}</h3>
          <Trail jejak={jejak} t={t} lang={lang} w={w} />
        </section>
      </div>
    </Drawer>
  );
}

function DrawerPay({ nim, data, lang }: { nim: string; data: BayarData; lang: Lang }) {
  const b = B[lang];
  const j = jumlahkan(data.units.filter((u) => u.nimPenilai === nim));
  return (
    <section className="tim-sec">
      <h3 className="tim-sec__title">{b.drawerPay}</h3>
      <div className="tim-paystats">
        <div className="stat">
          <b className="stat__value">{rupiah(j.kotor)}</b>
          <span className="stat__label">{b.earnedSem}</span>
        </div>
        <div className="stat">
          <b className="stat__value">
            {j.reguler} + {j.internasional}
          </b>
          <span className="stat__label">{b.unitsGroups}</span>
        </div>
      </div>
    </section>
  );
}

function SlotList({ slots, t, lang }: { slots: SlotOrang[]; t: Tx; lang: Lang }) {
  if (!slots.length) return <span className="hint">{t.noSlots}</span>;
  return (
    <div className="tim-rows">
      {slots.map((s) => (
        <div key={`${s.hari}-${s.slot}`} className="tim-row">
          <Pill>
            {hariLabel(s.hari, lang)} · {SLOT_MULAI[s.slot]}
          </Pill>
          <span>{s.peran === "tetap" ? t.tetap : t.pengganti}</span>
          <span className="hint">{kelasLabel(s.kelas, lang)}</span>
        </div>
      ))}
    </div>
  );
}

/** One audit line about a person, as a sentence. */
function kalimat(j: Jejak, t: Tx, lang: Lang, w: Who): string {
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(j.detail ?? "{}") as Record<string, unknown>;
  } catch {
    /* an unreadable detail still shows who and when */
  }
  const by = w.who(j.aktorNim);
  const katOf = (v: unknown) => (isKategori(v) ? kategoriLabel(v, lang) : String(v ?? ""));
  if (j.aksi === "tim_tambah") return t.j.added(by);
  if (j.aksi === "tim_serah_terima") {
    const what = t.j.serah(
      katOf(d.kategori),
      w.who(String(d.dari ?? "")),
      w.who(String(d.ke ?? "")),
      t.j.st[String(d.status)] ?? String(d.status ?? ""),
    );
    return t.j.by(what, by);
  }
  const parts: string[] = [];
  if (typeof d.jabatan === "string") {
    parts.push(t.j.jabatan(d.jabatan === "anggota" ? t.anggota : katOf(d.jabatan)));
  }
  if ("divisi" in d) parts.push(t.j.divisi(d.divisi ? String(d.divisi) : t.core));
  if (typeof d.status === "string" && (STATUS_ORANG as readonly string[]).includes(d.status)) {
    parts.push(t.j.status(statusOrangLabel(d.status as StatusOrang, lang)));
  }
  if ("seelabsAkun" in d) parts.push(t.j.seelabs);
  if ("hakOverride" in d) parts.push(t.j.hak);
  return t.j.by(parts.join(", ") || t.j.hak, by);
}

function Trail({ jejak, t, lang, w }: { jejak: Jejak[] | null; t: Tx; lang: Lang; w: Who }) {
  if (jejak === null) return <span className="skeleton" style={{ height: 44 }} />;
  if (!jejak.length) return <span className="hint">{t.noTrail}</span>;
  return (
    <div className="tim-rows">
      {jejak.map((j) => (
        <div key={j.id} className="tim-row tim-row--2">
          <span className="mono hint">
            {tgl(j.pada, lang)} {jamMenit(j.pada, lang)}
          </span>
          <span>{kalimat(j, t, lang, w)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- add dialog */

function AddDialog({
  data,
  t,
  lang,
  onClose,
  reload,
}: {
  data: TimData;
  t: Tx;
  lang: Lang;
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const w = useWho(data.orang);
  const [nama, setNama] = useState("");
  const [nim, setNim] = useState("");
  const [kode, setKode] = useState("");
  const [jab, setJab] = useState("anggota");
  const [div, setDiv] = useState<string>("ASO");
  const [see, setSee] = useState("");
  const [busy, setBusy] = useState(false);

  const taken = kode.length === 3 && data.orang.some((o) => o.kode?.toUpperCase() === kode);
  const clash = clashFor(data, jab, null);
  const jabKepala = isKategori(jab) ? divisiKepala(jab) : null;
  const valid = nama.trim().length >= 3 && /^\d{8,15}$/.test(nim) && /^[A-Z]{3}$/.test(kode);

  const send = async (mintaSerah: boolean) => {
    setBusy(true);
    const err = await kirim(
      {
        aksi: "tambah",
        nama: nama.trim(),
        nim,
        kode,
        jabatan: jab,
        divisi: jabKepala ?? (div || null),
        seelabs: see.trim(),
        mintaSerah,
      },
      t,
    );
    setBusy(false);
    if (err) return toast(err, "danger");
    toast(mintaSerah ? t.askSent : t.added);
    await reload();
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.addTitle}
      lang={lang}
      foot={clash ? "12" : "row"}
      actions={
        clash ? (
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !valid || taken}
              onClick={() => void send(true)}
            >
              <HandshakeIcon size={18} aria-hidden="true" />
              {t.ask}
            </button>
            <button type="button" className="btn" onClick={() => setJab("anggota")}>
              {t.makeMember}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t.cancel}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !valid || taken}
              onClick={() => void send(false)}
            >
              <UserPlusIcon size={18} aria-hidden="true" />
              {t.addBtn}
            </button>
          </>
        )
      }
    >
      <div className="tim-add">
        <label className="field">
          <span className="field__label">{t.fullName}</span>
          <input
            className="field__input"
            value={nama}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setNama(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{t.nim}</span>
          <input
            className="field__input mono"
            value={nim}
            inputMode="numeric"
            maxLength={15}
            autoComplete="off"
            onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className="field" data-invalid={taken ? "yes" : undefined}>
          <span className="field__label">{t.code}</span>
          <input
            className="field__input mono"
            value={kode}
            maxLength={3}
            autoComplete="off"
            onChange={(e) => setKode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
          {taken && (
            <span className="field__error">
              <WarningIcon size={14} aria-hidden="true" /> {t.codeTaken}
            </span>
          )}
        </label>
        <Dropdown
          id="tim-add-jab"
          label={t.position}
          value={jab}
          onChange={setJab}
          options={jabatanOptions(data, t, lang, w)}
        />
        <Dropdown
          id="tim-add-div"
          label={t.division}
          value={jabKepala ?? div}
          onChange={setDiv}
          disabled={!!jabKepala}
          options={DIV_OPTIONS(t)}
          hint={jabKepala ? t.divFollows : undefined}
        />
        <label className="field">
          <span className="field__label">{t.seelabs}</span>
          <input
            className="field__input mono"
            value={see}
            maxLength={80}
            autoComplete="off"
            placeholder={t.seelabsPh}
            onChange={(e) => setSee(e.target.value)}
          />
        </label>
      </div>
      {clash && <ClashNote holder={clash} t={t} lang={lang} w={w} />}
      <p className="hint tim-add__hint">{t.addHint}</p>
    </Dialog>
  );
}
