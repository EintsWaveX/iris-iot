/**
 * A written report (Phase 9 Stage 6b, mockup r-builder): a block document
 * with a title, a type and a session context. Drafts save as you type and
 * stay private; Send makes the content fixed and readable by every
 * Asisten, who can then comment. A request to the Admin goes on to In
 * Progress and Done (set by an Admin, with a reply). Blocks reorder by
 * their handle (pointer or keyboard) or the block menu.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarBlankIcon,
  CheckIcon,
  CopySimpleIcon,
  DotsSixVerticalIcon,
  DotsThreeVerticalIcon,
  FilePdfIcon,
  FloppyDiskIcon,
  LockSimpleIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SidebarSimpleIcon,
  TrashIcon,
  UsersFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import { getJson, tanggalPanjang } from "../../lib/app";
import {
  blokValid,
  langkahDokumen,
  type Blok,
  type JenisBlok,
  type JenisDokumen,
  type SesiLaporan,
  type StatusDokumen,
} from "../../lib/laporan";
import { modulLabel, slotLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import type { Direktori } from "../../lib/people";
import { unduhPdf, type BagianPdf } from "../../lib/pdf";
import { NILAI_KOMPONEN } from "../../lib/nilai-komponen";
import BackButton from "../ui/BackButton";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import Popover from "../ui/Popover";
import Tooltip from "../ui/Tooltip";
import ErrorView from "../ui/ErrorView";
import {
  BlokIsi,
  type VBayar,
  type VChart,
  type VFoto,
  type VKejadian,
  type VKelompok,
  type VNilai,
  type VPraktikan,
  type VSerial,
  type VSesi,
  type VSlot,
} from "./blocks";
import { DataPicker, InsertMenu } from "./pickers";
import { TypeBadge, TYPE_TONE } from "./Docs";
import { jamWib, kirim, labelSesi, tanggalWib } from "./data";
import type { Tx } from "./strings";
import { hariLabel, kelompokLabel } from "../../lib/labels";
import { rupiah } from "../../lib/bayar";
import { jamSlot } from "./data";

interface Laporan {
  id: number;
  judul: string;
  jenis: JenisDokumen;
  status: StatusDokumen;
  blok: Blok[];
  konteks: { sesiId?: number; sebut?: string[] };
  penulisNim: string;
  balasan: string | null;
  diprosesOleh: string | null;
  diubahPada: string;
  dikirimPada: string | null;
}
interface Komentar {
  id: number;
  nim: string;
  isi: string;
  pada: string;
}

const API = "/api/session/dokumen";
const idBaru = () => `b${Math.random().toString(36).slice(2, 9)}`;
const TEKS_BLOK: JenisBlok[] = ["p", "h", "list", "check", "callout", "div"];

function jamDetik(iso: string) {
  return jamWib(iso, true);
}

function nilaiAwal(k: JenisBlok): unknown {
  if (k === "check") return [[false, ""]];
  if (k === "list") return [""];
  if (k === "div") return undefined;
  return "";
}

/** One block as PDF parts. */
function blokKePdf(b: Blok, t: Tx, lang: Lang, dir: Direktori): BagianPdf[] {
  const v = b.v as never;
  switch (b.k) {
    case "p":
      return String(b.v ?? "").trim() ? [{ k: "p", teks: String(b.v) }] : [];
    case "h":
      return [{ k: "sub", teks: String(b.v ?? "") }];
    case "list":
      return ((b.v as string[]) ?? []).filter(Boolean).map((x) => ({ k: "p", teks: `•  ${x}` }));
    case "check":
      return ((b.v as [boolean, string][]) ?? []).map(([on, x]) => ({
        k: "p",
        teks: `${on ? "[x]" : "[ ]"}  ${x}`,
      }));
    case "callout":
      return [{ k: "p", teks: `»  ${String(b.v ?? "")}` }];
    case "div":
      return [{ k: "garis" }];
    case "sesi": {
      const s = v as VSesi;
      return [
        {
          k: "kv",
          baris: [
            [t.blk.sesi[0], `${labelSesi(s, lang)} · ${modulLabel(s.modul, lang)}`],
            [t.col.asisten, s.asisten.map((n) => dir.nama(n)).join(", ")],
            [t.col.hadir, `${s.hadir[0]}/${s.hadir[1]}`],
            [t.col.nilai, `${s.dinilai[0]}/${s.dinilai[1]}`],
          ],
        },
      ];
    }
    case "kelompok": {
      const g = v as VKelompok;
      return [
        {
          k: "kv",
          baris: [
            [kelompokLabel(g.nomor, lang), g.sesi],
            [t.members, g.anggota.join(", ")],
            [t.holder, g.pemegang ? dir.nama(g.pemegang) : t.noHolder],
            [t.progress, `${g.blank[0]}/${g.blank[1]}`],
          ],
        },
      ];
    }
    case "praktikan": {
      const p = v as VPraktikan;
      return [
        {
          k: "kv",
          baris: [
            [p.nama, `${p.nim} · ${kelompokLabel(p.nomor, lang)} · ${p.sesi}`],
            [
              t.sTabs.nilai,
              NILAI_KOMPONEN.filter((k) => p.skor[k] != null)
                .map((k) => `${k} ${p.skor[k]}`)
                .join(" · "),
            ],
          ],
        },
      ];
    }
    case "nilai": {
      const n = v as VNilai;
      return [
        { k: "p", teks: `${kelompokLabel(n.nomor, lang)} · ${n.sesi}`, abu: true },
        {
          k: "tabel",
          kepala: [t.nama, ...NILAI_KOMPONEN],
          baris: n.baris.map((r) => [r.nama, ...NILAI_KOMPONEN.map((k) => r.skor[k] ?? null)]),
        },
      ];
    }
    case "chart": {
      const c = v as VChart;
      const ys = c.pts.map((p) => p[1]);
      return [
        {
          k: "kv",
          baris: [
            [t.blk.chart[0], `${t.metric[c.ukuran]} · ${c.server} · ${c.rentang}`],
            ["Min / Max", `${Math.min(...ys)} / ${Math.max(...ys)}`],
          ],
        },
      ];
    }
    case "kejadian": {
      const k = v as VKejadian;
      return [{ k: "p", teks: `${k.jam} · ${k.tag} · ${k.teks} (${k.sesi})` }];
    }
    case "foto": {
      const f = v as VFoto;
      return [{ k: "p", teks: `${f.nama}${f.cap ? ` · ${f.cap}` : ""}\n${f.url}`, abu: true }];
    }
    case "serial": {
      const s = v as VSerial;
      return [
        { k: "p", teks: `${kelompokLabel(s.nomor, lang)} · ${s.sesi}`, abu: true },
        {
          k: "tabel",
          kepala: ["#", "TX", "RX", "ms"],
          baris: s.baris.map((r) => [r.seq, r.tx ?? "", r.rx ?? "", r.delayMs]),
        },
      ];
    }
    case "slot": {
      const s = v as VSlot;
      return [
        {
          k: "p",
          teks: `${hariLabel(s.hari, lang)} · ${slotLabel(s.slot, lang)} · ${jamSlot(s.slot)}: ${t.swap(dir.nama(s.dari), dir.nama(s.ke))}`,
        },
      ];
    }
    case "bayar": {
      const p = v as VBayar;
      return [{ k: "p", teks: `${p.teks} · ${rupiah(p.jumlah)}` }];
    }
  }
  return [];
}

function BlokBaris({
  b,
  i,
  n,
  ro,
  t,
  lang,
  dir,
  upd,
  onSlash,
  onAddBelow,
  onMove,
  onDup,
  onDel,
}: {
  b: Blok;
  i: number;
  n: number;
  ro: boolean;
  t: Tx;
  lang: Lang;
  dir: Direktori;
  upd: (v: unknown) => void;
  onSlash: () => void;
  onAddBelow: () => void;
  onMove: (d: number) => void;
  onDup: () => void;
  onDel: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: b.id, disabled: ro });
  const [menu, setMenu] = useState(false);
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  if (ro)
    return (
      <div className="rp-block rp-block--ro" data-k={b.k}>
        <div className="rp-block__body">
          <BlokIsi b={b} ro t={t} lang={lang} dir={dir} />
        </div>
      </div>
    );
  const item = (
    Ic: typeof ArrowUpIcon,
    label: string,
    fn: () => void,
    danger = false,
    disabled = false,
  ) => (
    <button
      type="button"
      className={`rp-menu__i${danger ? " rp-menu__i--danger" : ""}`}
      disabled={disabled}
      onClick={() => {
        setMenu(false);
        fn();
      }}
    >
      <Ic size={18} aria-hidden="true" />
      {label}
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rp-block${isDragging ? " is-dragging" : ""}`}
      data-k={b.k}
    >
      <Tooltip label={t.drag}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="rp-block__grip"
          aria-label={`${t.drag}: ${t.blk[b.k][0]}`}
          {...attributes}
          {...listeners}
        >
          <DotsSixVerticalIcon size={18} aria-hidden="true" />
        </button>
      </Tooltip>
      <div className="rp-block__body">
        <BlokIsi b={b} ro={false} upd={upd} onSlash={onSlash} t={t} lang={lang} dir={dir} />
      </div>
      <Popover
        open={menu}
        onOpenChange={setMenu}
        align="end"
        trigger={
          <span>
            <IconButton
              sm
              kind="ghost"
              icon={DotsThreeVerticalIcon}
              label={t.blockMenu}
              pressed={menu}
            />
          </span>
        }
      >
        <div className="rp-range__presets" style={{ minWidth: 210 }}>
          {item(ArrowUpIcon, t.up, () => onMove(-1), false, i === 0)}
          {item(ArrowDownIcon, t.down, () => onMove(1), false, i === n - 1)}
          {item(CopySimpleIcon, t.dup, onDup)}
          {item(TrashIcon, t.delBlock, onDel, true)}
        </div>
      </Popover>
      <Tooltip label={t.addBelow}>
        <button
          type="button"
          className="rp-block__add"
          aria-label={t.addBelow}
          onClick={onAddBelow}
        >
          <PlusIcon size={14} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}

function SidePanel({
  doc,
  t,
  lang,
  dir,
  me,
  admin,
  ro,
  sebut,
  setSebut,
  komentar,
  onKomentar,
  onStatus,
  sheet,
}: {
  doc: Laporan;
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
  admin: boolean;
  ro: boolean;
  sebut: string[];
  setSebut: (s: string[]) => void;
  komentar: Komentar[];
  onKomentar: (isi: string) => Promise<boolean>;
  onStatus: (s: "diproses" | "selesai", balasan: string) => Promise<void>;
  sheet?: boolean;
}) {
  const steps = langkahDokumen(doc.jenis);
  const now = steps.indexOf(doc.status);
  const [reply, setReply] = useState("");
  const [balas, setBalas] = useState(doc.balasan ?? "");
  const [busy, setBusy] = useState(false);
  const orang = [...dir.byNim.values()]
    .filter((o) => o.nim !== me && !sebut.includes(o.nim))
    .sort((a, b) => a.nama.localeCompare(b.nama));
  return (
    <aside className={`rp-docside${sheet ? " rp-docside--sheet" : ""}`}>
      <section className="rp-docside__sec">
        <span className="field__label">{t.sideStatus}</span>
        <div className="rp-docsteps">
          {steps.map((k, i) => (
            <span key={k} data-st={now > i ? "done" : now === i ? "now" : "wait"}>
              <i />
              {t.stat[k]}
            </span>
          ))}
        </div>
        {doc.balasan && (
          <div className="rp-comment">
            <b>{t.reply}</b>
            <span>{doc.balasan}</span>
            {doc.diprosesOleh && <span className="hint">{dir.nama(doc.diprosesOleh)}</span>}
          </div>
        )}
        {admin &&
          doc.jenis === "permintaan" &&
          doc.status !== "draf" &&
          doc.status !== "selesai" && (
            <>
              <textarea
                className="rp-textarea"
                style={{ minHeight: 70 }}
                placeholder={t.replyPh}
                aria-label={t.reply}
                value={balas}
                onChange={(e) => setBalas(e.target.value)}
              />
              <div className="row">
                {doc.status === "terkirim" && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onStatus("diproses", balas);
                      setBusy(false);
                    }}
                  >
                    {t.markProses}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onStatus("selesai", balas);
                    setBusy(false);
                  }}
                >
                  <CheckIcon size={16} aria-hidden="true" />
                  {t.markSelesai}
                </button>
              </div>
            </>
          )}
      </section>
      <section className="rp-docside__sec">
        <span className="field__label">{t.whoReads}</span>
        <span className="row">
          {doc.status === "draf" ? (
            <Pill>
              <LockSimpleIcon size={14} aria-hidden="true" />
              {t.onlyYouBadge}
            </Pill>
          ) : (
            <Pill tone="accent">
              <UsersFourIcon size={14} aria-hidden="true" />
              {t.everyone}
            </Pill>
          )}
        </span>
        <span className="hint">{t.whoReadsHint}</span>
      </section>
      <section className="rp-docside__sec">
        <span className="field__label">{t.mention}</span>
        <div className="row">
          {sebut.map((nim) => (
            <span key={nim} className="rp-chipp">
              <span>@{dir.byNim.get(nim)?.kode ?? nim}</span>
              {!ro && (
                <button
                  type="button"
                  aria-label={`${t.ctxRemove}: ${dir.nama(nim)}`}
                  onClick={() => setSebut(sebut.filter((x) => x !== nim))}
                >
                  <XIcon size={14} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
        {!ro && (
          <Dropdown
            id="doc-sebut"
            label={t.addMention}
            hideLabel
            value=""
            onChange={(v) => v && setSebut([...sebut, v])}
            options={[
              { value: "", label: t.addMention },
              ...orang.map((o) => ({ value: o.nim, label: dir.nama(o.nim) })),
            ]}
          />
        )}
      </section>
      {doc.status !== "draf" && (
        <section className="rp-docside__sec">
          <span className="field__label">{t.comments(komentar.length)}</span>
          {komentar.length === 0 && <span className="hint">{t.noComments}</span>}
          {komentar.map((k) => (
            <div key={k.id} className="rp-comment">
              <span className="row">
                <b>{dir.nama(k.nim)}</b>
                <span className="hint mono">
                  {tanggalPanjang(tanggalWib(k.pada), lang)} {jamWib(k.pada)}
                </span>
              </span>
              <span>{k.isi}</span>
            </div>
          ))}
          <textarea
            className="rp-textarea"
            style={{ minHeight: 70 }}
            placeholder={t.commentPh}
            aria-label={t.commentPh}
            value={reply}
            maxLength={2000}
            onChange={(e) => setReply(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!reply.trim() || busy}
            onClick={async () => {
              setBusy(true);
              if (await onKomentar(reply.trim())) setReply("");
              setBusy(false);
            }}
          >
            <PaperPlaneTiltIcon size={16} aria-hidden="true" />
            {t.sendComment}
          </button>
        </section>
      )}
    </aside>
  );
}

export default function Builder({
  id,
  rows,
  t,
  lang,
  dir,
  me,
  admin,
  onBack,
}: {
  id: number;
  rows: SesiLaporan[];
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
  admin: boolean;
  onBack: () => void;
}) {
  const [doc, setDoc] = useState<Laporan | null>(null);
  const [komentar, setKomentar] = useState<Komentar[]>([]);
  const [err, setErr] = useState<"none" | "gone" | "fail">("none");
  const [judul, setJudul] = useState("");
  const [jenis, setJenis] = useState<JenisDokumen>("lainnya");
  const [blok, setBlok] = useState<Blok[]>([]);
  const [sesiId, setSesiId] = useState<number | undefined>();
  const [sebut, setSebut] = useState<string[]>([]);
  const [st, setSt] = useState<"saved" | "saving" | "error">("saved");
  const [pada, setPada] = useState("");
  const [ins, setIns] = useState<{ at: number; ganti?: boolean } | null>(null);
  const [pick, setPick] = useState<{ k: JenisBlok; at: number; ganti?: boolean } | null>(null);
  const [send, setSend] = useState(false);
  const [del, setDel] = useState(false);
  const [side, setSide] = useState(false);
  const [ctxPick, setCtxPick] = useState(false);
  const [wide, setWide] = useState(() => window.innerWidth >= 1100);
  const dirty = useRef(false);
  const tmr = useRef<number | undefined>(undefined);
  const state = useRef({ judul, jenis, blok, sesiId, sebut });
  state.current = { judul, jenis, blok, sesiId, sebut };

  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1100);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await getJson<{
        ok: boolean;
        kode?: string;
        laporan: Laporan;
        komentar: Komentar[];
      }>(`${API}?id=${id}`);
      if (!d.ok) return setErr("gone");
      const l = d.laporan;
      setDoc(l);
      setKomentar(d.komentar);
      setJudul(l.judul);
      setJenis(l.jenis);
      setBlok((l.blok ?? []).filter(blokValid));
      setSesiId(l.konteks.sesiId);
      setSebut(l.konteks.sebut ?? []);
      setPada(l.diubahPada);
      setErr("none");
    } catch {
      setErr("fail");
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const ro = !doc || doc.status !== "draf" || doc.penulisNim !== me;

  const simpan = useCallback(async () => {
    window.clearTimeout(tmr.current);
    const s = state.current;
    setSt("saving");
    const r = await kirim<{ pada: string }>(API, {
      aksi: "simpan",
      id,
      judul: s.judul,
      jenis: s.jenis,
      blok: s.blok,
      konteks: { ...(s.sesiId ? { sesiId: s.sesiId } : {}), sebut: s.sebut },
    });
    if (r.ok) {
      dirty.current = false;
      setPada(r.pada);
      setSt("saved");
      return true;
    }
    setSt("error");
    return false;
  }, [id]);

  // Draft autosave, a moment after the last change.
  const ubah = () => {
    dirty.current = true;
    setSt("saving");
    window.clearTimeout(tmr.current);
    tmr.current = window.setTimeout(() => void simpan(), 1200);
  };
  useEffect(() => {
    if (!doc || ro) return;
    if (dirty.current) ubah();
  }, [judul, jenis, blok, sesiId, sebut]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      if (dirty.current) void simpan();
    };
  }, [simpan]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const edit = (fn: (b: Blok[]) => Blok[]) => {
    dirty.current = true;
    setBlok(fn);
  };
  const tambah = (k: JenisBlok, at: number, v?: unknown, ganti?: boolean) => {
    const nb: Blok = { id: idBaru(), k, v: v === undefined ? nilaiAwal(k) : v };
    edit((b) => {
      const x = b.slice();
      x.splice(at, ganti ? 1 : 0, nb);
      return x;
    });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-blok="${nb.id}"] textarea, [data-blok="${nb.id}"] input`)
        ?.focus(),
    );
  };
  const pilihBlok = (k: JenisBlok) => {
    if (!ins) return;
    if (TEKS_BLOK.includes(k)) tambah(k, ins.at, undefined, ins.ganti);
    else setPick({ k, at: ins.at, ganti: ins.ganti });
  };
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    edit((b) =>
      arrayMove(
        b,
        b.findIndex((x) => x.id === e.active.id),
        b.findIndex((x) => x.id === e.over!.id),
      ),
    );
  };
  const nama = (i: string | number) => {
    const b = blok.find((x) => x.id === i);
    return b ? t.blk[b.k][0] : "";
  };

  const kirimLaporan = async () => {
    if (!judul.trim()) return void window.Toast?.show(t.needTitle, "warn");
    if (!(await simpan())) return void window.Toast?.show(t.saveFail, "danger");
    const r = await kirim(API, { aksi: "kirim", id });
    setSend(false);
    if (!r.ok)
      return void window.Toast?.show(r.kode === "tanpa_judul" ? t.needTitle : t.err, "danger");
    window.Toast?.show(
      t.sent(
        sebut
          .map((n) => dir.byNim.get(n)?.kode ?? "")
          .filter(Boolean)
          .join(", "),
      ),
      "ok",
    );
    await load();
  };
  const hapusDraf = async () => {
    window.clearTimeout(tmr.current);
    dirty.current = false;
    const r = await kirim(API, { aksi: "hapus", id });
    setDel(false);
    if (!r.ok) return void window.Toast?.show(t.err, "danger");
    window.Toast?.show(t.draftDeleted, "ok");
    onBack();
  };
  const pdf = () => {
    const s = rows.find((r) => r.id === sesiId);
    const bagian: BagianPdf[] = [
      { k: "judul", teks: judul || t.untitled },
      {
        k: "meta",
        teks: [
          t.types[jenis],
          t.stat[doc?.status ?? "draf"],
          dir.nama(doc?.penulisNim ?? me),
          s ? labelSesi(s, lang) : "",
          t.pdfMeta(tanggalPanjang(new Date().toISOString(), lang)),
        ]
          .filter(Boolean)
          .join(" · "),
      },
      { k: "garis" },
      ...blok.flatMap((b) => blokKePdf(b, t, lang, dir)),
    ];
    if (komentar.length) {
      bagian.push(
        { k: "sub", teks: t.comments(komentar.length) },
        ...komentar.map((k) => ({ k: "p" as const, teks: `${dir.nama(k.nim)}: ${k.isi}` })),
      );
    }
    void unduhPdf(`laporan-${id}`, bagian, lang)
      .then(() => window.Toast?.show(t.pdfDone, "ok"))
      .catch(() => window.Toast?.show(t.err, "danger"));
  };

  const back = <BackButton lang={lang} label={t.allDocs} onClick={onBack} />;
  if (err === "gone")
    return (
      <div className="rp">
        {back}
        <ErrorView code={404} lang={lang} />
      </div>
    );
  if (err === "fail" && !doc)
    return (
      <div className="rp">
        {back}
        <ErrorView code={500} lang={lang} onRetry={() => void load()} />
      </div>
    );
  if (!doc)
    return (
      <div className="rp">
        {back}
        <span className="skeleton" style={{ height: 480 }} />
      </div>
    );

  const sesiKonteks = rows.find((r) => r.id === sesiId);
  const panel = (sheet?: boolean) => (
    <SidePanel
      doc={doc}
      t={t}
      lang={lang}
      dir={dir}
      me={me}
      admin={admin}
      ro={ro}
      sebut={sebut}
      setSebut={(s) => {
        dirty.current = true;
        setSebut(s);
      }}
      komentar={komentar}
      sheet={sheet}
      onKomentar={async (isi) => {
        const r = await kirim<{ komentar: Komentar }>(API, { aksi: "komentar", id, isi });
        if (!r.ok) {
          window.Toast?.show(t.err, "danger");
          return false;
        }
        setKomentar((k) => [...k, r.komentar]);
        return true;
      }}
      onStatus={async (status, balasan) => {
        const r = await kirim(API, { aksi: "status", id, status, balasan });
        if (!r.ok) return void window.Toast?.show(t.err, "danger");
        window.Toast?.show(status === "selesai" ? t.markedSelesai : t.markedProses, "ok");
        await load();
      }}
    />
  );
  const stateLabel = ro
    ? doc.dikirimPada
      ? t.sentBy(
          dir.nama(doc.penulisNim),
          `${tanggalPanjang(tanggalWib(doc.dikirimPada), lang)} ${jamDetik(doc.dikirimPada).slice(0, 5)}`,
        )
      : dir.nama(doc.penulisNim)
    : st === "saving"
      ? t.saving
      : st === "error"
        ? t.saveFail
        : t.draftSaved(jamDetik(pada));

  return (
    <div className="rp">
      {back}
      <div className="rp-docgrid">
        <div className="rp-doc">
          <div className="rp-doc__head">
            <input
              className="rp-doc__title"
              value={judul}
              readOnly={ro}
              placeholder={t.titlePh}
              aria-label={t.docTitle}
              maxLength={160}
              onChange={(e) => {
                dirty.current = true;
                setJudul(e.target.value);
              }}
            />
            <div className="rp-doc__meta">
              {ro ? (
                <TypeBadge jenis={jenis} t={t} />
              ) : (
                <Dropdown
                  id="doc-jenis"
                  label={t.jenis}
                  hideLabel
                  value={jenis}
                  onChange={(v) => {
                    dirty.current = true;
                    setJenis(v as JenisDokumen);
                  }}
                  options={(Object.keys(TYPE_TONE) as JenisDokumen[]).map((k) => ({
                    value: k,
                    label: t.types[k],
                  }))}
                />
              )}
              {sesiKonteks && (
                <span className="rp-chipp">
                  <CalendarBlankIcon size={16} aria-hidden="true" />
                  <span>
                    {labelSesi(sesiKonteks, lang)} · {modulLabel(sesiKonteks.modul, lang)}
                  </span>
                  {!ro && (
                    <Tooltip label={t.ctxRemove}>
                      <button
                        type="button"
                        aria-label={t.ctxRemove}
                        onClick={() => {
                          dirty.current = true;
                          setSesiId(undefined);
                        }}
                      >
                        <XIcon size={14} aria-hidden="true" />
                      </button>
                    </Tooltip>
                  )}
                </span>
              )}
              {!ro && !sesiKonteks && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setCtxPick(true)}
                >
                  <PlusIcon size={16} aria-hidden="true" />
                  {t.ctx}
                </button>
              )}
              <span className="rp-savestate" data-st={ro ? "saved" : st} role="status">
                {stateLabel}
              </span>
            </div>
            {ro && doc.penulisNim === me && doc.status !== "draf" && (
              <span className="hint">{t.readOnly}</span>
            )}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onEnd}
            accessibility={{
              screenReaderInstructions: { draggable: t.srHint },
              announcements: {
                onDragStart: ({ active }) => t.srLift(nama(active.id)),
                onDragOver: ({ active, over }) =>
                  over
                    ? t.srOver(nama(active.id), blok.findIndex((x) => x.id === over.id) + 1)
                    : undefined,
                onDragEnd: ({ active, over }) =>
                  over
                    ? t.srDrop(nama(active.id), blok.findIndex((x) => x.id === over.id) + 1)
                    : undefined,
                onDragCancel: ({ active }) => t.srCancel(nama(active.id)),
              },
            }}
          >
            <SortableContext items={blok.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="rp-doc__blocks">
                {blok.map((b, i) => (
                  <div key={b.id} data-blok={b.id}>
                    <BlokBaris
                      b={b}
                      i={i}
                      n={blok.length}
                      ro={ro}
                      t={t}
                      lang={lang}
                      dir={dir}
                      upd={(v) => edit((x) => x.map((y) => (y.id === b.id ? { ...y, v } : y)))}
                      onSlash={() => setIns({ at: i, ganti: true })}
                      onAddBelow={() => setIns({ at: i + 1 })}
                      onMove={(d) =>
                        edit((x) => arrayMove(x, i, Math.max(0, Math.min(x.length - 1, i + d))))
                      }
                      onDup={() =>
                        edit((x) => {
                          const y = x.slice();
                          y.splice(i + 1, 0, { ...b, id: idBaru(), v: structuredClone(b.v) });
                          return y;
                        })
                      }
                      onDel={() => {
                        const before = blok;
                        edit((x) => x.filter((y) => y.id !== b.id));
                        window.Toast?.show(t.blockDeleted, "info", {
                          action: { label: t.undo, onClick: () => edit(() => before) },
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {!ro && (
            <button
              type="button"
              className="rp-doc__addend"
              onClick={() => setIns({ at: blok.length })}
            >
              <PlusIcon size={20} aria-hidden="true" />
              {t.addBlock}
              <span className="hint">{t.orSlash}</span>
            </button>
          )}

          <div className="rp-doc__foot">
            {!wide && (
              <button type="button" className="btn" onClick={() => setSide(true)}>
                <SidebarSimpleIcon size={18} aria-hidden="true" />
                {t.details}
              </button>
            )}
            {!ro && (
              <button type="button" className="btn btn--danger-soft" onClick={() => setDel(true)}>
                <TrashIcon size={18} aria-hidden="true" />
                {t.delDraft}
              </button>
            )}
            <span className="grow" />
            <button type="button" className="btn btn--ghost" onClick={pdf}>
              <FilePdfIcon size={18} aria-hidden="true" />
              {t.exportPdf}
            </button>
            {!ro && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void simpan().then((ok) => ok && window.Toast?.show(t.draftSavedToast, "ok"))
                  }
                >
                  <FloppyDiskIcon size={18} aria-hidden="true" />
                  {t.saveDraft}
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setSend(true)}>
                  <PaperPlaneTiltIcon size={18} aria-hidden="true" />
                  {t.send}
                </button>
              </>
            )}
          </div>
        </div>
        {wide && panel()}
      </div>

      <InsertMenu open={!!ins} onClose={() => setIns(null)} onPick={pilihBlok} t={t} lang={lang} />
      <DataPicker
        kind={pick?.k ?? null}
        onClose={() => setPick(null)}
        onInsert={(v) => {
          if (pick) tambah(pick.k, pick.at, v, pick.ganti);
          setPick(null);
        }}
        rows={rows}
        laporanId={id}
        t={t}
        lang={lang}
        dir={dir}
        me={me}
      />
      <DataPicker
        kind={ctxPick ? "sesi" : null}
        onClose={() => setCtxPick(false)}
        onInsert={(v) => {
          dirty.current = true;
          setSesiId((v as VSesi).id);
          setCtxPick(false);
        }}
        rows={rows}
        laporanId={id}
        t={t}
        lang={lang}
        dir={dir}
        me={me}
      />
      <Dialog open={side} onOpenChange={setSide} title={t.details} sheet lang={lang}>
        {panel(true)}
      </Dialog>
      <Dialog
        open={send}
        onOpenChange={setSend}
        title={t.sendAsk}
        description={judul || t.untitled}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setSend(false)}>
              {t.cancel}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void kirimLaporan()}>
              <PaperPlaneTiltIcon size={18} aria-hidden="true" />
              {t.send}
            </button>
          </>
        }
      >
        <p>{t.sendBody}</p>
      </Dialog>
      <Dialog
        open={del}
        onOpenChange={setDel}
        title={t.delDraftAsk}
        description={judul || t.untitled}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDel(false)}>
              {t.cancel}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void hapusDraf()}>
              <TrashIcon size={18} aria-hidden="true" />
              {t.delDraft}
            </button>
          </>
        }
      >
        <p>{t.delDraftBody}</p>
      </Dialog>
    </div>
  );
}
