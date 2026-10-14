/**
 * Preparation's Kode Jurnal tab (ASO code editor, 2026-10-05): the ASO
 * division and Admins keep each module's complete code files, id and en, and
 * mark which spans are blanks (src/lib/kode-jurnal.ts).
 *
 * Three views of the open file: Celah (select text, Make Blank; the side
 * panel edits the selected blank), Berkas Lengkap (paste or upload the
 * complete file; blanks are found again on their lines) and Pratinjau
 * Praktikan (the generated file). Work is saved as one shared draft per
 * module and published as a new version; publishing waits while a session
 * of that module runs.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  LockSimpleIcon,
  PlusIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Confirm from "../../ui/Confirm";
import Dialog from "../../ui/Dialog";
import Fade from "../../ui/Fade";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import SegmentedControl from "../../ui/SegmentedControl";
import { FileDrop, Stepper, Switch } from "../../ui/Controls";
import { getJson, jamMenit, postJson, tanggalPanjang } from "../../../lib/app";
import { modulLabel } from "../../../lib/labels";
import { detectLang, tokenize } from "../../../lib/highlight";
import { personalize } from "../../../lib/group-identity";
import {
  BAHASA_KODE,
  BLANK_TOKEN,
  barisDi,
  buatTemplat,
  cariKomentar,
  celahBaru,
  kanonikCelah,
  periksaBerkas,
  petunjukBaris,
  pindahkanCelah,
  rapikanNomor,
  tandaKomentar,
  urutkanCelah,
  type BahasaKode,
  type Celah,
  type KodeBerkas,
  type Masalah,
  type Rentang,
} from "../../../lib/kode-jurnal";
import type { Lang } from "../../../lib/kelas";
import { useSiaran } from "../../../lib/siaran";
import { K } from "./kodeStrings";
import "../../module/code.css";
import "./code-editor.css";
import { useBelumSimpan } from "../../../lib/belum-simpan";

interface Ringkas {
  id: number;
  nomor: number | null;
  status: "draf" | "terbit" | "arsip";
  catatan: string | null;
  diubahOleh: string;
  diubahPada: string;
  terbitOleh: string | null;
  terbitPada: string | null;
}

interface EditData {
  ok: boolean;
  kode?: string;
  modul: number;
  terbit: (Ringkas & { berkas: KodeBerkas[] }) | null;
  draf: (Ringkas & { berkas: KodeBerkas[] }) | null;
  riwayat: Ringkas[];
  terkunci: boolean;
}

type Mode = "celah" | "berkas" | "pratinjau";
type MasalahBerkas = Masalah & { berkas: string };

const LABEL_BAHASA: Record<BahasaKode, string> = { id: "ID", en: "EN" };
/** Penjelasan and Petunjuk also come in Mandarin, the UI's third language
 *  (2026-10-12); an empty ZH falls back to EN. */
const BAHASA_TEKS = ["id", "en", "zh"] as const;
const LABEL_TEKS: Record<(typeof BAHASA_TEKS)[number], string> = { ...LABEL_BAHASA, zh: "ZH" };

/** Files a slot takes: Python for a .py sketch; .ino or .cpp for an
 *  Arduino sketch. */
function jenisBerkas(path: string): string[] {
  return path.endsWith(".py") ? [".py", "text/x-python"] : [".ino", ".cpp", "text/x-c++src"];
}

function pada(iso: string, lang: Lang): string {
  const tanggal = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return `${tanggalPanjang(tanggal, lang)} ${jamMenit(iso)}`;
}

/** What blocks publishing, plus notes: the same checks the server runs. */
function masalahSemua(berkas: KodeBerkas[]): MasalahBerkas[] {
  const out: MasalahBerkas[] = [];
  for (const b of berkas) {
    for (const m of periksaBerkas(b)) out.push({ ...m, berkas: b.slug });
    for (const bahasa of BAHASA_KODE) {
      try {
        personalize(b.slug, b.sumber[bahasa], 2);
        personalize(b.slug, buatTemplat(b, bahasa), 2);
      } catch {
        out.push({ kode: "identitas", berat: true, bahasa, berkas: b.slug });
      }
    }
  }
  return out;
}

interface Potong {
  o: number;
  teks: string;
  kind?: string;
  celah?: Celah;
  blank?: number;
}

/** The file cut into lines of highlighted pieces, each knowing its offset,
 *  so a selection maps back to the text. Blanks become their own pieces. */
function potongBaris(src: string, path: string, marks: { r: Rentang; c?: Celah; n?: number }[]) {
  const tokens = tokenize(src, path.endsWith(".py") ? "py" : detectLang(src));
  const batas = new Set<number>();
  for (const m of marks) batas.add(m.r.awal).add(m.r.akhir);
  const lines: Potong[][] = [[]];
  let o = 0;
  for (const tok of tokens) {
    let mulai = 0;
    const cut = (akhir: number) => {
      if (akhir <= mulai) return;
      const teks = tok.text.slice(mulai, akhir);
      const at = o + mulai;
      const m = marks.find((x) => x.r.awal <= at && at < x.r.akhir);
      lines[lines.length - 1].push({ o: at, teks, kind: tok.kind, celah: m?.c, blank: m?.n });
      mulai = akhir;
    };
    for (let i = 0; i < tok.text.length; i++) {
      if (tok.text[i] === "\n") {
        cut(i);
        lines.push([]);
        mulai = i + 1;
      } else if (batas.has(o + i) && i > mulai) cut(i);
    }
    cut(tok.text.length);
    o += tok.text.length;
  }
  return lines;
}

/** A DOM selection point as an offset into the file. */
function offsetDi(node: Node, off: number): number | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const own = el?.closest<HTMLElement>("[data-o]");
  if (own) {
    const o = Number(own.dataset.o);
    return node.nodeType === Node.TEXT_NODE ? o + off : o + (off > 0 ? own.textContent!.length : 0);
  }
  const line = el?.closest<HTMLElement>(".cl");
  const pieces = line ? [...line.querySelectorAll<HTMLElement>("[data-o]")] : [];
  if (!pieces.length) return null;
  const last = pieces[pieces.length - 1];
  return off === 0 && node === line
    ? Number(pieces[0].dataset.o)
    : Number(last.dataset.o) + last.textContent!.length;
}

function CodeView({
  lines,
  pilih,
  onPick,
  boxRef,
  label,
  onSelect,
  children,
}: {
  lines: Potong[][];
  pilih?: string | null;
  onPick?: (c: Celah) => void;
  boxRef?: React.RefObject<HTMLDivElement | null>;
  label: string;
  onSelect?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className="code kodeed__code"
      ref={boxRef}
      tabIndex={0}
      aria-label={label}
      onMouseUp={onSelect}
      onKeyUp={(e) => e.shiftKey && onSelect?.()}
    >
      {lines.map((items, i) => {
        const punya = items.find((p) => p.celah || p.blank);
        return (
          <div
            key={i}
            className={`cl${punya ? " cl--blank" : ""}${punya?.celah && punya.celah.id === pilih ? " cl--target" : ""}`}
            data-st={punya?.celah?.id === pilih ? "key" : undefined}
          >
            <span className="ln" aria-hidden="true">
              {i + 1}
            </span>
            <span className="cl__t">
              {items.map((p, j) =>
                p.celah ? (
                  <mark
                    key={j}
                    data-o={p.o}
                    className="kodeed__mark"
                    aria-current={p.celah.id === pilih ? "true" : undefined}
                    onClick={() => onPick?.(p.celah!)}
                  >
                    {p.teks}
                  </mark>
                ) : p.blank ? (
                  <span key={j} data-o={p.o} className="kodeed__blank" data-n={p.blank}>
                    {p.teks}
                  </span>
                ) : (
                  <span key={j} data-o={p.o} className={p.kind ? `tok tok--${p.kind}` : undefined}>
                    {p.teks}
                  </span>
                ),
              )}
              {items.length === 0 && " "}
            </span>
          </div>
        );
      })}
      {children}
    </div>
  );
}

/** The complete file as an editor: a textarea over the same highlighted
 *  lines and gutter as the code card, scrolled together. */
function CodeArea({
  value,
  onChange,
  path,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  path: string;
  label: string;
}) {
  const lapis = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => potongBaris(value, path, []), [value, path]);
  return (
    <div className="code kodeed__area">
      <div className="kodeed__area-lapis" ref={lapis} aria-hidden="true">
        {lines.map((items, i) => (
          <div key={i} className="cl">
            <span className="ln">{i + 1}</span>
            <span className="cl__t">
              {items.map((p, j) => (
                <span key={j} className={p.kind ? `tok tok--${p.kind}` : undefined}>
                  {p.teks}
                </span>
              ))}
              {items.length === 0 && " "}
            </span>
          </div>
        ))}
      </div>
      <textarea
        className="kodeed__area-input"
        aria-label={label}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        wrap="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (!lapis.current) return;
          lapis.current.scrollTop = e.currentTarget.scrollTop;
          lapis.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onKeyDown={(e) => {
          // Tab indents instead of leaving the editor; Esc still leaves.
          if (e.key !== "Tab" || e.shiftKey) return;
          e.preventDefault();
          const el = e.currentTarget;
          const a = el.selectionStart;
          const v = el.value.slice(0, a) + "  " + el.value.slice(el.selectionEnd);
          onChange(v);
          requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
        }}
      />
    </div>
  );
}

/** The module page's pill tabs (`.seg`, module/code.css codehead), sized
 *  to their labels so file, language and view share one row. */
function Seg({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={className ? `seg ${className}` : "seg"}
      role="tablist"
      aria-label={label}
      data-segfit="off"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chips({
  items,
  onRemove,
  label,
}: {
  items: string[];
  onRemove: (i: number) => void;
  label: (j: string) => string;
}) {
  if (!items.length) return null;
  return (
    <ul className="kodeed__chips">
      {items.map((j, i) => (
        <li key={`${j}-${i}`} className="kodeed__chip">
          <code>{j}</code>
          <IconButton icon={XIcon} sm label={label(j)} onClick={() => onRemove(i)} />
        </li>
      ))}
    </ul>
  );
}

export default function CodeEditor({ lang }: { lang: Lang }) {
  const t = K[lang];
  const [modul, setModul] = useState(1);
  const [data, setData] = useState<EditData | null>(null);
  const [kerja, setKerja] = useState<KodeBerkas[] | null>(null);
  const [asal, setAsal] = useState("");
  const [dasar, setDasar] = useState<string | null>(null);
  const [fi, setFi] = useState(0);
  const [bahasa, setBahasa] = useState<BahasaKode>("id");
  const [mode, setMode] = useState<Mode>("celah");
  const [pilih, setPilih] = useState<string | null>(null);
  const [sel, setSel] = useState<{ r: Rentang; x: number; y: number } | null>(null);
  const [teksBerkas, setTeksBerkas] = useState("");
  const [ejaan, setEjaan] = useState("");
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState<string | null>(null);
  const [berubah, setBerubah] = useState<{ oleh: string | null } | null>(null);
  const [pindah, setPindah] = useState<number | null>(null);
  const [terbitOpen, setTerbitOpen] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [buangOpen, setBuangOpen] = useState(false);
  const [hapus, setHapus] = useState<Celah | null>(null);
  const [riwayatOpen, setRiwayatOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const dirty = !!kerja && JSON.stringify(kerja) !== asal;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useBelumSimpan(dirty);

  function terima(d: EditData) {
    setData(d);
    const base = d.draf?.berkas ?? d.terbit?.berkas ?? [];
    setKerja(base);
    setAsal(JSON.stringify(base));
    setDasar(d.draf?.diubahPada ?? null);
    setBerubah(null);
  }

  const muat = (m = modul) =>
    getJson<EditData>(`/api/modul/kode-edit?modul=${m}`)
      .then((d) => {
        if (!d.ok) return setGagal(t.galat[d.kode ?? ""] ?? t.gagal);
        setGagal(null);
        terima(d);
      })
      .catch(() => setGagal(t.gagal));

  useEffect(() => {
    setData(null);
    setKerja(null);
    setFi(0);
    setPilih(null);
    void muat(modul);
  }, [modul]);

  // Another editor saved or published: take it when nothing is unsaved here.
  useSiaran(["kode", "sesi"], () => {
    if (!dirtyRef.current) void muat();
    else
      getJson<EditData>(`/api/modul/kode-edit?modul=${modul}`)
        .then((d) => {
          if (d.ok && (d.draf?.diubahPada ?? null) !== dasar)
            setBerubah({ oleh: d.draf?.diubahOleh ?? null });
          if (d.ok) setData((x) => (x ? { ...x, terkunci: d.terkunci } : x));
        })
        .catch(() => {});
  });

  const file = kerja?.[fi] ?? null;
  const src = file?.sumber[bahasa] ?? "";
  const urut = useMemo(() => (file ? urutkanCelah(file.celah) : []), [file]);
  const pilihan = file?.celah.find((c) => c.id === pilih) ?? null;
  const masalah = useMemo(() => (kerja ? masalahSemua(kerja) : []), [kerja]);
  const berat = masalah.filter((m) => m.berat);
  const masalahCelah = (id: string) => masalah.filter((m) => m.celah === id && m.berat);

  const lines = useMemo(() => {
    if (!file) return [];
    if (mode === "pratinjau") {
      const tpl = buatTemplat(file, bahasa);
      const marks: { r: Rentang; n: number }[] = [];
      const re = new RegExp(`${BLANK_TOKEN}.*?\\((\\d+)\\)`, "g");
      for (const m of tpl.matchAll(re))
        marks.push({
          r: { awal: m.index!, akhir: m.index! + BLANK_TOKEN.length },
          n: Number(m[1]),
        });
      return potongBaris(tpl, file.path, marks);
    }
    const marks = file.celah.flatMap((c) =>
      c.posisi[bahasa] ? [{ r: c.posisi[bahasa]!, c }] : [],
    );
    return potongBaris(src, file.path, marks);
  }, [file, bahasa, mode, src]);

  useEffect(() => {
    if (mode === "berkas") setTeksBerkas(src);
  }, [mode, fi, bahasa, file?.sumber]);

  function ubahBerkas(fn: (b: KodeBerkas) => KodeBerkas) {
    setKerja((ks) => ks && ks.map((b, i) => (i === fi ? fn(b) : b)));
  }

  function ubahCelah(id: string, patch: Partial<Celah>) {
    ubahBerkas((b) => ({
      ...b,
      celah: b.celah.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function lompat(c: Celah) {
    setPilih(c.id);
    setEjaan("");
    requestAnimationFrame(() => {
      const r = c.posisi[bahasa];
      const el = r && box.current?.querySelector<HTMLElement>(`[data-o="${r.awal}"]`);
      const ln = el?.closest<HTMLElement>(".cl");
      if (box.current && ln)
        box.current.scrollTop = Math.max(0, ln.offsetTop - box.current.clientHeight / 2);
    });
  }

  function bacaPilihan() {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed || !box.current) return setSel(null);
    const range = s.getRangeAt(0);
    if (!box.current.contains(range.commonAncestorContainer)) return setSel(null);
    const a = offsetDi(range.startContainer, range.startOffset);
    const b = offsetDi(range.endContainer, range.endOffset);
    if (a === null || b === null || b <= a) return setSel(null);
    let awal = a;
    let akhir = b;
    while (awal < akhir && /\s/.test(src[awal]) && src[awal] !== "\n") awal++;
    while (akhir > awal && /\s/.test(src[akhir - 1]) && src[akhir - 1] !== "\n") akhir--;
    const rect = range.getBoundingClientRect();
    const host = box.current.getBoundingClientRect();
    if (akhir <= awal) return setSel(null);
    // The button lives inside the scroller, so it scrolls with the text.
    setSel({
      r: { awal, akhir },
      x: Math.max(8, Math.min(rect.left - host.left, host.width - 200)) + box.current.scrollLeft,
      y: rect.bottom - host.top + box.current.scrollTop + 6,
    });
  }

  // Selecting by touch or keyboard fires no mouseup: follow the selection.
  const bacaRef = useRef(bacaPilihan);
  bacaRef.current = bacaPilihan;
  useEffect(() => {
    if (mode !== "celah") return;
    let t: number | undefined;
    const on = () => {
      clearTimeout(t);
      t = window.setTimeout(() => bacaRef.current(), 120);
    };
    document.addEventListener("selectionchange", on);
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", on);
    };
  }, [mode]);

  /** Why this span can't be a blank here, or null. */
  function tolak(r: Rentang, kecuali?: string): string | null {
    if (!file) return "kosong";
    const teks = src.slice(r.awal, r.akhir);
    if (!teks.trim()) return "kosong";
    if (teks.includes("\n")) return "lintas";
    const baris = barisDi(src, r.awal);
    const k = cariKomentar(src.slice(baris.awal, baris.akhir), tandaKomentar(file.path));
    if (k !== -1 && baris.awal + k < r.akhir) return "komentar";
    for (const c of file.celah) {
      const p = c.posisi[bahasa];
      if (!p || c.id === kecuali) continue;
      if (p.awal < r.akhir && r.awal < p.akhir) return "tumpang";
      if (barisDi(src, p.awal).awal === baris.awal) return "sebaris";
    }
    return null;
  }

  function jadikan() {
    if (!file || !sel) return;
    const why = tolak(sel.r);
    if (why) return window.Toast?.show(t.gagalPilih[why], "warn");
    const c = celahBaru(file, bahasa, sel.r);
    ubahBerkas((b) => ({ ...b, celah: [...b.celah, c] }));
    const lain: BahasaKode = bahasa === "id" ? "en" : "id";
    if (!c.posisi[lain]) window.Toast?.show(t.tanpaPadanan(LABEL_BAHASA[lain]), "warn");
    setSel(null);
    window.getSelection()?.removeAllRanges();
    setPilih(c.id);
  }

  function tandaiDiSini() {
    if (!file || !sel || !pilihan) return;
    if (src.slice(sel.r.awal, sel.r.akhir) !== pilihan.jawaban)
      return window.Toast?.show(t.gagalPilih.beda, "warn");
    const why = tolak(sel.r, pilihan.id);
    if (why) return window.Toast?.show(t.gagalPilih[why], "warn");
    ubahCelah(pilihan.id, {
      posisi: { ...pilihan.posisi, [bahasa]: sel.r },
      petunjuk: {
        ...pilihan.petunjuk,
        [bahasa]: pilihan.petunjuk[bahasa] || petunjukBaris(src, sel.r, file.path),
      },
    });
    setSel(null);
    window.getSelection()?.removeAllRanges();
  }

  function gantiNomor(c: Celah, ke: number) {
    ubahBerkas((b) => ({
      ...b,
      celah: b.celah.map((x) =>
        x.id === c.id ? { ...x, nomor: ke } : x.nomor === ke ? { ...x, nomor: c.nomor } : x,
      ),
    }));
  }

  function terapkanBerkas() {
    if (!file) return;
    const baru = teksBerkas.replace(/\r\n?/g, "\n");
    const { celah, hilang } = pindahkanCelah(file, bahasa, baru);
    ubahBerkas((b) => ({ ...b, sumber: { ...b.sumber, [bahasa]: baru }, celah }));
    window.Toast?.show(
      t.diterapkan(celah.filter((c) => c.posisi[bahasa]).length, hilang.length),
      hilang.length ? "warn" : "ok",
    );
  }

  async function simpan(): Promise<boolean> {
    if (!kerja) return false;
    setBusy(true);
    const r = await postJson<{
      ok: boolean;
      kode?: string;
      oleh?: string | null;
      diubahPada?: string;
    }>("/api/modul/kode-simpan", { modul, berkas: kerja, dasar }).catch(
      () =>
        ({ ok: false, kode: undefined, oleh: null }) as { ok: false; kode?: string; oleh?: null },
    );
    setBusy(false);
    if (!r.ok) {
      if (r.kode === "draf_berubah") setBerubah({ oleh: r.oleh ?? null });
      else window.Toast?.show(t.galat[r.kode ?? ""] ?? t.gagal, "danger");
      return false;
    }
    setDasar(r.diubahPada ?? null);
    setAsal(JSON.stringify(kerja));
    window.Toast?.show(t.tersimpan, "ok");
    void muat();
    return true;
  }

  async function terbitkan(): Promise<boolean> {
    if (dirty && !(await simpan())) return false;
    const d = await getJson<EditData>(`/api/modul/kode-edit?modul=${modul}`).catch(() => null);
    const r = await postJson<{ ok: boolean; kode?: string; nomor?: number; oleh?: string | null }>(
      "/api/modul/kode-terbit",
      { modul, catatan, dasar: d?.draf?.diubahPada ?? dasar },
    ).catch(() => ({ ok: false }) as { ok: false; kode?: string; oleh?: null });
    if (!r.ok) {
      if (r.kode === "draf_berubah") setBerubah({ oleh: r.oleh ?? null });
      window.Toast?.show(t.galat[r.kode ?? ""] ?? t.gagal, "danger");
      return false;
    }
    window.Toast?.show(t.terbitOk(r.nomor ?? 0), "ok");
    setCatatan("");
    void muat();
    return true;
  }

  async function buang() {
    const r = await postJson<{ ok: boolean }>("/api/modul/kode-buang", { modul }).catch(() => ({
      ok: false,
    }));
    window.Toast?.show(r.ok ? t.dibuang : t.gagal, r.ok ? "ok" : "danger");
    void muat();
    return r.ok;
  }

  async function pulihkan(v: Ringkas) {
    const r = await postJson<{ ok: boolean; kode?: string; oleh?: string | null }>(
      "/api/modul/kode-pulihkan",
      { modul, id: v.id, dasar },
    ).catch(() => ({ ok: false }) as { ok: false; kode?: string; oleh?: null });
    if (!r.ok) {
      if (r.kode === "draf_berubah") setBerubah({ oleh: r.oleh ?? null });
      else window.Toast?.show(t.gagal, "danger");
      return;
    }
    window.Toast?.show(t.dipulihkan(v.nomor), "ok");
    setRiwayatOpen(false);
    void muat();
  }

  function keModul(m: number) {
    if (m === modul) return;
    if (dirty) setPindah(m);
    else setModul(m);
  }

  const tandaiSini = !!pilihan && !pilihan.posisi[bahasa];
  const tombolPilih = (
    <button
      type="button"
      className="btn btn--primary"
      disabled={!sel}
      onMouseDown={(e) => e.preventDefault()}
      onClick={tandaiSini ? tandaiDiSini : jadikan}
    >
      {!tandaiSini && <PlusIcon aria-hidden="true" />}
      {tandaiSini ? t.tandaiDi(LABEL_BAHASA[bahasa]) : t.jadikan}
    </button>
  );

  const namaModul = modulLabel(modul, lang);
  const terbit = data?.terbit ?? null;
  const draf = data?.draf ?? null;

  let isi: ReactNode;
  if (gagal) isi = <p className="banner banner--warn">{gagal}</p>;
  else if (!kerja || !file) isi = <p className="hint">{t.muat}</p>;
  else
    isi = (
      <>
        <div className="codehead kodeed__switches">
          <Seg
            label={t.berkas}
            className="codehead__files"
            value={String(fi)}
            onChange={(v) => {
              setFi(Number(v));
              setPilih(null);
              setSel(null);
            }}
            options={kerja.map((b, i) => ({ value: String(i), label: <code>{b.path}</code> }))}
          />
          <span className="codehead__tools kodeed__tools">
            <Seg
              label={t.bahasa}
              value={bahasa}
              onChange={(v) => {
                setBahasa(v as BahasaKode);
                setSel(null);
              }}
              options={BAHASA_KODE.map((b) => ({ value: b, label: LABEL_BAHASA[b] }))}
            />
            <Seg
              label={t.mode}
              value={mode}
              onChange={(v) => {
                setMode(v as Mode);
                setSel(null);
              }}
              options={(["celah", "berkas", "pratinjau"] as const).map((m) => ({
                value: m,
                label: t.modes[m],
              }))}
            />
          </span>
        </div>
        <Fade k={`${mode}-${fi}-${bahasa}`}>
          {mode === "celah" && (
            <div className="stack">
              <div className="kodeed__grid">
                <div className="panel codecard kodeed__card">
                  <CodeView
                    lines={lines}
                    pilih={pilih}
                    onPick={lompat}
                    boxRef={box}
                    label={`${file.path} ${LABEL_BAHASA[bahasa]}`}
                    onSelect={bacaPilihan}
                  >
                    {sel && (
                      <div className="kodeed__float" style={{ left: sel.x, top: sel.y }}>
                        {tombolPilih}
                      </div>
                    )}
                  </CodeView>
                </div>
                <aside className="kodeed__side">
                  <section className="panel stack kodeed__tambah">
                    <h3 className="panel__title">{t.tambahJudul}</h3>
                    {sel ? (
                      <p className="kodeed__terpilih">
                        <span className="hint">{t.terpilih}</span>
                        <code>{src.slice(sel.r.awal, sel.r.akhir)}</code>
                      </p>
                    ) : (
                      <ol className="hint kodeed__langkah">
                        {t.langkah.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ol>
                    )}
                    <div className="panel__actions">{tombolPilih}</div>
                  </section>
                  <section className="panel kodeed__daftar">
                    <h3 className="panel__title">
                      {t.daftar}
                      <span className="hint kodeed__jumlah">{urut.length}</span>
                    </h3>
                    {urut.length === 0 ? (
                      <p className="hint">{t.kosong}</p>
                    ) : (
                      <ul className="kodeed__list">
                        {urut.map((c) => {
                          const r = c.posisi[bahasa];
                          const baris = r ? src.slice(0, r.awal).split("\n").length : null;
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="kodeed__row"
                                aria-current={c.id === pilih ? "true" : undefined}
                                data-st={masalahCelah(c.id).length ? "bad" : "ok"}
                                aria-label={t.lihat(c.nomor)}
                                onClick={() => lompat(c)}
                              >
                                <span className="blankchip__dot" aria-hidden="true" />
                                <b className="kodeed__row-n">({c.nomor})</b>
                                <code className="kodeed__row-j">{c.jawaban}</code>
                                <span className="hint kodeed__row-l">
                                  {baris ? t.baris(baris) : t.belumDi(LABEL_BAHASA[bahasa])}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </aside>
              </div>
              {pilihan ? (
                <CelahForm
                  key={pilihan.id}
                  t={t}
                  c={pilihan}
                  total={file.celah.length}
                  src={file.sumber}
                  masalah={masalahCelah(pilihan.id)}
                  ejaan={ejaan}
                  setEjaan={setEjaan}
                  onChange={(patch) => ubahCelah(pilihan.id, patch)}
                  onNomor={(n) => gantiNomor(pilihan, n)}
                  onHapus={() => setHapus(pilihan)}
                />
              ) : (
                <section className="panel kodeed__detail kodeed__detail--kosong">
                  <h3 className="panel__title">{t.detailJudul}</h3>
                  <p className="hint">{t.detailKosong}</p>
                </section>
              )}
            </div>
          )}
          {mode === "berkas" && (
            <section className="panel stack">
              <p className="hint">{t.berkasHint}</p>
              <FileDrop
                accept={jenisBerkas(file.path)}
                maxBytes={1024 * 1024}
                kinds={jenisBerkas(file.path)
                  .filter((x) => x.startsWith("."))
                  .join(", ")}
                lang={lang}
                compact
                onFile={(f) => void f.text().then(setTeksBerkas)}
              />
              <div className="field">
                <span className="field__label">{t.berkasLabel(LABEL_BAHASA[bahasa])}</span>
                <CodeArea
                  value={teksBerkas}
                  onChange={setTeksBerkas}
                  path={file.path}
                  label={t.berkasLabel(LABEL_BAHASA[bahasa])}
                />
              </div>
              <div className="panel__actions panel__actions--end">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={teksBerkas === src}
                  onClick={() => setTeksBerkas(src)}
                >
                  {t.batal}
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={teksBerkas === src || !teksBerkas.trim()}
                  onClick={terapkanBerkas}
                >
                  {t.terapkan}
                </button>
              </div>
            </section>
          )}
          {mode === "pratinjau" && (
            <div className="stack">
              <p className="hint">{t.pratinjauHint}</p>
              <div className="panel codecard kodeed__card kodeed__card--pratinjau">
                <CodeView lines={lines} label={`${file.path} ${LABEL_BAHASA[bahasa]}`} />
              </div>
            </div>
          )}
        </Fade>
      </>
    );

  return (
    <div className="stack kodeed">
      <section className="panel stack">
        <SegmentedControl
          fill
          aria-label={t.modul}
          value={String(modul)}
          onValueChange={(v) => keModul(Number(v))}
          options={[1, 2, 3, 4].map((m) => ({ value: String(m), label: modulLabel(m, lang) }))}
        />
        <div className="kodeed__head">
          {data ? (
            <div className="kodeed__status">
              <Pill tone={terbit ? "ok" : "warn"}>{t.terbit(terbit?.nomor ?? null)}</Pill>
              {terbit?.terbitPada && (
                <span className="hint">
                  {t.olehPada(terbit.terbitOleh ?? "", pada(terbit.terbitPada, lang))}
                </span>
              )}
              <span className="hint kodeed__draf">
                {dirty ? (
                  <b>{t.belumDisimpan}</b>
                ) : draf ? (
                  t.drafAda(draf.diubahOleh, pada(draf.diubahPada, lang))
                ) : (
                  t.tanpaDraf
                )}
              </span>
            </div>
          ) : (
            <span />
          )}
          <div className="kodeed__actions">
            <IconButton
              icon={ClockCounterClockwiseIcon}
              label={t.riwayat}
              onClick={() => setRiwayatOpen(true)}
              disabled={!data}
            />
            {draf && (
              <button
                type="button"
                className="btn btn--danger-soft"
                onClick={() => setBuangOpen(true)}
              >
                {t.buang}
              </button>
            )}
            <button
              type="button"
              className={dirty ? "btn btn--primary" : "btn"}
              disabled={!dirty || busy}
              onClick={() => void simpan()}
            >
              {t.simpan}
            </button>
            <button
              type="button"
              className="btn btn--inverse"
              disabled={!data || (!draf && !dirty) || !!data.terkunci}
              onClick={() => setTerbitOpen(true)}
            >
              {t.terbitkan}
            </button>
          </div>
        </div>
        {data?.terkunci && (
          <div className="banner banner--lock">
            <LockSimpleIcon aria-hidden="true" />
            <span>{t.terkunci(namaModul)}</span>
          </div>
        )}
        {berubah && (
          <div className="banner banner--warn kodeed__berubah">
            <WarningIcon aria-hidden="true" />
            <span className="grow">{t.berubah(berubah.oleh)}</span>
            <button type="button" className="btn btn--sm" onClick={() => void muat()}>
              {t.muatUlang}
            </button>
          </div>
        )}
      </section>
      {isi}

      <Dialog
        open={terbitOpen}
        onOpenChange={setTerbitOpen}
        title={t.terbitTitle(namaModul)}
        description={t.terbitBody}
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setTerbitOpen(false)}>
              {t.batal}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={berat.length > 0 || busy}
              onClick={async () => {
                setBusy(true);
                const ok = await terbitkan();
                setBusy(false);
                if (ok) setTerbitOpen(false);
              }}
            >
              {t.terbitkan}
            </button>
          </>
        }
      >
        <div className="stack">
          {kerja && <DaftarMasalah t={t} masalah={masalah} kerja={kerja} />}
          <label className="field">
            <span className="field__label">{t.catatan}</span>
            <input
              className="field__input"
              maxLength={200}
              placeholder={t.catatanPh}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </label>
        </div>
      </Dialog>

      <Confirm
        open={buangOpen}
        onOpenChange={setBuangOpen}
        title={t.buangTitle}
        body={t.buangBody}
        confirmLabel={t.buang}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={buang}
      />

      <Confirm
        open={hapus !== null}
        onOpenChange={(o) => !o && setHapus(null)}
        title={t.hapusTitle(hapus?.nomor ?? 0)}
        body={t.hapusBody}
        confirmLabel={t.hapus}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() => {
          const id = hapus?.id;
          ubahBerkas((b) => ({ ...b, celah: rapikanNomor(b.celah.filter((c) => c.id !== id)) }));
          setPilih(null);
        }}
      />

      <Dialog
        open={riwayatOpen}
        onOpenChange={setRiwayatOpen}
        title={t.riwayatTitle}
        size="md"
        lang={lang}
      >
        <ul className="kodeed__riwayat">
          {(data?.riwayat ?? []).map((v) => (
            <li key={v.id} className="kodeed__versi">
              <div className="stack kodeed__versi-isi">
                <span className="kodeed__versi-judul">
                  <b>{t.versi(v.nomor)}</b>
                  {v.status === "terbit" && <Pill tone="ok">{t.aktif}</Pill>}
                </span>
                {v.terbitPada && (
                  <span className="hint">
                    {t.olehPada(v.terbitOleh ?? "", pada(v.terbitPada, lang))}
                  </span>
                )}
                {v.catatan && <span>{v.catatan}</span>}
              </div>
              <button
                type="button"
                className="btn btn--sm"
                disabled={dirty}
                onClick={() => void pulihkan(v)}
              >
                {t.pulihkan}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={pindah !== null}
        onOpenChange={(o) => !o && setPindah(null)}
        title={t.pindahTitle}
        description={t.pindahBody}
        size="sm"
        lang={lang}
        blocking
        foot="12"
        actions={
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={async () => {
                const ke = pindah;
                if (await simpan()) {
                  setPindah(null);
                  if (ke) setModul(ke);
                }
              }}
            >
              {t.simpanPindah}
            </button>
            <button
              type="button"
              className="btn btn--danger-soft"
              onClick={() => {
                const ke = pindah;
                setPindah(null);
                setAsal(JSON.stringify(kerja));
                if (ke) setModul(ke);
              }}
            >
              {t.buangPindah}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setPindah(null)}>
              {t.tetap}
            </button>
          </>
        }
      />
    </div>
  );
}

type Tx = (typeof K)["id"];

function DaftarMasalah({
  t,
  masalah,
  kerja,
}: {
  t: Tx;
  masalah: MasalahBerkas[];
  kerja: KodeBerkas[];
}) {
  const nomorDari = (m: MasalahBerkas) =>
    kerja.find((b) => b.slug === m.berkas)?.celah.find((c) => c.id === m.celah)?.nomor;
  const baris = (m: MasalahBerkas) => {
    const n = nomorDari(m);
    const path = kerja.find((b) => b.slug === m.berkas)?.path ?? m.berkas;
    const di = [path, m.bahasa ? LABEL_BAHASA[m.bahasa] : null, n ? `(${n})` : null]
      .filter(Boolean)
      .join(" ");
    return (
      <li key={`${m.kode}-${m.berkas}-${m.celah ?? ""}-${m.bahasa ?? ""}`}>
        <code>{di}</code> {t.masalah[m.kode]}
      </li>
    );
  };
  const berat = masalah.filter((m) => m.berat);
  const ringan = masalah.filter((m) => !m.berat);
  if (!berat.length && !ringan.length)
    return (
      <p className="banner banner--ok">
        <CheckCircleIcon aria-hidden="true" />
        <span>{t.terbitBody}</span>
      </p>
    );
  return (
    <>
      {berat.length > 0 && (
        <div className="banner banner--warn kodeed__masalah">
          <b>{t.masalahJudul}</b>
          <ul>{berat.map(baris)}</ul>
        </div>
      )}
      {ringan.length > 0 && (
        <div className="kodeed__masalah">
          <b>{t.peringatan}</b>
          <ul className="hint">{ringan.map(baris)}</ul>
        </div>
      )}
    </>
  );
}

function CelahForm({
  t,
  c,
  total,
  src,
  masalah,
  ejaan,
  setEjaan,
  onChange,
  onNomor,
  onHapus,
}: {
  t: Tx;
  c: Celah;
  total: number;
  src: Record<BahasaKode, string>;
  masalah: Masalah[];
  ejaan: string;
  setEjaan: (v: string) => void;
  onChange: (patch: Partial<Celah>) => void;
  onNomor: (n: number) => void;
  onHapus: () => void;
}) {
  const barisKe = (b: BahasaKode) => {
    const r = c.posisi[b];
    return r ? src[b].slice(0, r.awal).split("\n").length : null;
  };
  return (
    <section className="panel kodeed__detail">
      <div className="panel__head kodeed__detail-head">
        <h3 className="panel__title">
          {t.detailJudul} ({c.nomor}) <code>{c.jawaban}</code>
        </h3>
        <div className="kodeed__detail-act">
          <span className="kodeed__posisi" aria-label={t.posisi}>
            {BAHASA_KODE.map((b) => {
              const n = barisKe(b);
              return (
                <Pill key={b} tone={n ? "ok" : "warn"}>
                  {n ? t.diBaris(LABEL_BAHASA[b], n) : t.belumDi(LABEL_BAHASA[b])}
                </Pill>
              );
            })}
          </span>
          <button type="button" className="btn btn--danger-soft btn--sm" onClick={onHapus}>
            {t.hapus}
          </button>
        </div>
      </div>
      <div className="kodeed__detail-body">
        {masalah.length > 0 && (
          <ul className="banner banner--warn kodeed__masalah">
            {masalah.map((m, i) => (
              <li key={i}>
                {m.bahasa ? `${LABEL_BAHASA[m.bahasa]}: ` : ""}
                {t.masalah[m.kode]}
              </li>
            ))}
          </ul>
        )}
        <div className="kodeed__detail-grid">
          <div className="stack">
            <div className="field">
              <span className="field__label">{t.jawaban}</span>
              <code className="kodeed__jawaban">{c.jawaban}</code>
              <span className="field__hint">{t.jawabanHint}</span>
            </div>
            <div className="field">
              <span className="field__label">{t.nomor}</span>
              <Stepper
                value={c.nomor}
                min={1}
                max={total}
                label={t.nomor}
                lessLabel={t.nomorKurang}
                moreLabel={t.nomorLebih}
                onChange={onNomor}
              />
            </div>
          </div>
          <div className="stack">
            <label className="field">
              <span className="field__label">{t.juga}</span>
              <input
                className="field__input kodeed__mono"
                maxLength={200}
                placeholder={t.jugaPh}
                value={ejaan}
                onChange={(e) => setEjaan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const v = ejaan.trim();
                  if (v && !c.juga.includes(v) && v !== c.jawaban)
                    onChange({ juga: [...c.juga, v] });
                  setEjaan("");
                }}
              />
              <span className="field__hint">{t.jugaHint}</span>
            </label>
            <Chips
              items={c.juga}
              label={t.hapusEjaan}
              onRemove={(i) => onChange({ juga: c.juga.filter((_, j) => j !== i) })}
            />
            <div className="field">
              <span className="kodeed__switch">
                <Switch
                  on={c.perKelompok !== null}
                  label={t.perKelompok}
                  onChange={(on) =>
                    onChange({
                      perKelompok: on ? c.jawaban.replace(/\d+$/, "") + "{n}" : null,
                    })
                  }
                />
                <span className="field__label">{t.perKelompok}</span>
              </span>
              {c.perKelompok !== null && (
                <>
                  <input
                    className="field__input kodeed__mono"
                    maxLength={200}
                    aria-label={t.perKelompok}
                    value={c.perKelompok}
                    onChange={(e) => onChange({ perKelompok: e.target.value })}
                  />
                  <span className="field__hint">
                    {t.perKelompokHint} {t.contohKelompok(3, kanonikCelah(c, 3))}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="stack">
            {BAHASA_KODE.map((b) => (
              <label key={`p-${b}`} className="field">
                <span className="field__label">{t.petunjuk(LABEL_BAHASA[b])}</span>
                <input
                  className="field__input"
                  maxLength={300}
                  value={c.petunjuk[b]}
                  onChange={(e) => onChange({ petunjuk: { ...c.petunjuk, [b]: e.target.value } })}
                />
                {b === "en" && <span className="field__hint">{t.petunjukHint}</span>}
              </label>
            ))}
          </div>
          <div className="kodeed__detail-pair">
            {BAHASA_TEKS.map((b) => (
              <label key={`k-${b}`} className="field">
                <span className="field__label">{t.kenapa(LABEL_TEKS[b])}</span>
                <textarea
                  className="field__input field__textarea"
                  rows={3}
                  maxLength={400}
                  lang={b === "zh" ? "zh-CN" : b}
                  value={c.kenapa[b] ?? ""}
                  onChange={(e) => onChange({ kenapa: { ...c.kenapa, [b]: e.target.value } })}
                />
              </label>
            ))}
            <span className="field__hint kodeed__pair-hint">{t.kenapaHint}</span>
          </div>
          <div className="kodeed__detail-pair">
            {BAHASA_TEKS.map((b) => (
              <label key={`h-${b}`} className="field">
                <span className="field__label">{t.bantuan(LABEL_TEKS[b])}</span>
                <textarea
                  className="field__input field__textarea"
                  rows={3}
                  maxLength={400}
                  lang={b === "zh" ? "zh-CN" : b}
                  value={c.bantuan?.[b] ?? ""}
                  onChange={(e) =>
                    onChange({ bantuan: { id: "", en: "", ...c.bantuan, [b]: e.target.value } })
                  }
                />
              </label>
            ))}
            <span className="field__hint kodeed__pair-hint">{t.bantuanHint}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
