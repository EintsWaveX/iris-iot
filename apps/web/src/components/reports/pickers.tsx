/**
 * Adding blocks to a written report (Phase 9 Stage 6b, mockup r-builder):
 * the insert menu (search, text blocks, data blocks; a bottom sheet on
 * phones) and, for each data block, a picker that takes the snapshot the
 * block keeps.
 */
import { useEffect, useId, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  CalendarBlankIcon,
  CalendarDotsIcon,
  CameraIcon,
  ChartLineUpIcon,
  CheckSquareIcon,
  HandCoinsIcon,
  InfoIcon,
  ListDashesIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  ParagraphIcon,
  StudentIcon,
  TableIcon,
  TerminalWindowIcon,
  TextHIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { upload } from "@vercel/blob/client";
import { getJson, namaKelompok, tanggalPanjang } from "../../lib/app";
import { namaPeriode, rupiah } from "../../lib/bayar";
import { hariLabel, kelasLabel, kelompokLabel, modulLabel } from "../../lib/labels";
import {
  BLOK_DATA,
  BLOK_TEKS,
  type JenisBlok,
  type Kejadian,
  type SesiLaporan,
} from "../../lib/laporan";
import { semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariIniWib } from "../../lib/jadwal";
import type { Kelas, Lang } from "../../lib/kelas";
import type { Direktori } from "../../lib/people";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import { DateField, FileDrop } from "../ui/Controls";
import Pill from "../ui/Pill";
import { useBayar } from "../bayar/data";
import { jamKejadian, jamSlot, kalimatKejadian, labelSesi } from "./data";
import type { Rekap } from "./SessionPage";
import type { Tx } from "./strings";

export const IKON: Record<JenisBlok, ComponentType<IconProps>> = {
  p: ParagraphIcon,
  h: TextHIcon,
  list: ListDashesIcon,
  check: CheckSquareIcon,
  callout: InfoIcon,
  div: MinusIcon,
  sesi: CalendarBlankIcon,
  kelompok: UsersThreeIcon,
  praktikan: StudentIcon,
  nilai: TableIcon,
  chart: ChartLineUpIcon,
  kejadian: WarningIcon,
  foto: CameraIcon,
  serial: TerminalWindowIcon,
  slot: CalendarDotsIcon,
  bayar: HandCoinsIcon,
};

function useSempit() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w < 640;
}

export function InsertMenu({
  open,
  onClose,
  onPick,
  t,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (k: JenisBlok) => void;
  t: Tx;
  lang: Lang;
}) {
  const [q, setQ] = useState("");
  const sempit = useSempit();
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  const cocok = (k: JenisBlok) => {
    const [a, b] = t.blk[k];
    return `${a} ${b}`.toLowerCase().includes(q.trim().toLowerCase());
  };
  const grup = (judul: string, list: readonly JenisBlok[]) => {
    const shown = list.filter(cocok);
    if (!shown.length) return null;
    return (
      <div className="stack stack--sm">
        <span className="label-caps">{judul}</span>
        <div className="rp-insgrid">
          {shown.map((k) => {
            const Ic = IKON[k];
            const [a, b] = t.blk[k];
            return (
              <button
                key={k}
                type="button"
                className="rp-insb"
                onClick={() => {
                  onClose();
                  onPick(k);
                }}
              >
                <span className="rp-insb__ic">
                  <Ic size={20} aria-hidden="true" />
                </span>
                <span className="stack" style={{ gap: 0 }}>
                  <b>{a}</b>
                  {b && <span className="hint">{b}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.addBlock}
      description={sempit ? undefined : t.addBlockDesc}
      size="lg"
      sheet={sempit}
      lang={lang}
    >
      <label className="rp-searchbar">
        <MagnifyingGlassIcon size={18} aria-hidden="true" />
        <input
          value={q}
          placeholder={t.findBlock}
          aria-label={t.findBlock}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {grup(t.insText, BLOK_TEKS)}
      {grup(t.insData, BLOK_DATA)}
    </Dialog>
  );
}

/* ------------------------------------------------------------ pickers */

type Langkah = "sesi" | "grup" | "isi";

/** Data block pickers: they return the block's frozen value. */
export function DataPicker({
  kind,
  onClose,
  onInsert,
  rows,
  laporanId,
  t,
  lang,
  dir,
  me,
}: {
  kind: JenisBlok | null;
  onClose: () => void;
  onInsert: (v: unknown) => void;
  rows: SesiLaporan[];
  laporanId: number;
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
}) {
  const open = kind !== null;
  const [sesiId, setSesiId] = useState<number | null>(null);
  const [step, setStep] = useState<Langkah>("sesi");
  const [q, setQ] = useState("");
  const [rekap, setRekap] = useState<Rekap | null>(null);
  const [nomor, setNomor] = useState<number | null>(null);
  const [kej, setKej] = useState<Kejadian[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSesiId(null);
    setStep("sesi");
    setQ("");
    setRekap(null);
    setNomor(null);
    setKej(null);
  }, [open, kind]);
  const perluSesi =
    kind && ["sesi", "kelompok", "praktikan", "nilai", "kejadian", "serial"].includes(kind);
  const s = rows.find((r) => r.id === sesiId) ?? null;
  const sesiLabel = s ? `${labelSesi(s, lang)} · ${modulLabel(s.modul, lang)}` : "";

  useEffect(() => {
    if (!sesiId || !kind) return;
    if (["kelompok", "praktikan", "nilai", "serial"].includes(kind)) {
      setRekap(null);
      void getJson<{ ok: boolean } & Rekap>(`/api/session/rekap?sesiId=${sesiId}`)
        .then((d) => d.ok && setRekap(d))
        .catch(() => window.Toast?.show(t.err, "danger"));
    }
    if (kind === "kejadian") {
      setKej(null);
      void getJson<{ ok: boolean; kejadian: Kejadian[] }>(`/api/session/kejadian?sesiId=${sesiId}`)
        .then((d) => setKej(d.ok ? d.kejadian : []))
        .catch(() => setKej([]));
    }
  }, [sesiId, kind, t]);

  const ambilSesi = (r: SesiLaporan) => {
    if (kind === "sesi") {
      onInsert({
        id: r.id,
        tanggal: r.tanggal,
        slot: r.slot,
        mulai: r.mulai,
        modul: r.modul,
        kelas: r.kelas,
        status: r.status,
        asisten: [...new Set(r.pasangan.map((p) => p.nim))],
        hadir: r.hadir,
        dinilai: r.dinilai,
      });
      return;
    }
    setSesiId(r.id);
    setStep(kind === "kejadian" || kind === "praktikan" ? "isi" : "grup");
  };

  const ambilGrup = async (n: number) => {
    if (!rekap) return;
    const g = rekap.kelompok.find((x) => x.nomor === n)!;
    if (kind === "kelompok") {
      onInsert({
        sesi: sesiLabel,
        nomor: n,
        nama: g.nama,
        pemegang: g.pemegang,
        anggota: g.anggota.map((a) => a.nama),
        blank: g.blank,
      });
    } else if (kind === "nilai") {
      onInsert({ sesi: sesiLabel, nomor: n, baris: g.anggota, pada: new Date().toISOString() });
    } else if (kind === "serial") {
      setBusy(true);
      try {
        const d = await getJson<{ ok: boolean; baris: unknown[] }>(
          `/api/session/dokumen?serial=1&sesiId=${sesiId}&kelompok=${n}`,
        );
        if (!d.ok || !d.baris.length) {
          setNomor(n);
          window.Toast?.show(t.noSerial, "warn");
        } else onInsert({ sesi: sesiLabel, nomor: n, baris: d.baris });
      } catch {
        window.Toast?.show(t.err, "danger");
      }
      setBusy(false);
    }
  };

  const judul = kind ? t.blk[kind][0] : "";
  const backToSesi =
    perluSesi && step !== "sesi" ? (
      <button type="button" className="btn btn--ghost" onClick={() => setStep("sesi")}>
        {t.pickSesi}
      </button>
    ) : null;

  let body: React.ReactNode = null;
  if (kind === "foto")
    body = <FotoPick laporanId={laporanId} t={t} lang={lang} onDone={onInsert} />;
  else if (kind === "chart") body = <ChartPick t={t} lang={lang} onDone={onInsert} />;
  else if (kind === "slot")
    body = <SlotPick t={t} lang={lang} dir={dir} me={me} onDone={onInsert} />;
  else if (kind === "bayar") body = <BayarPick t={t} lang={lang} me={me} onDone={onInsert} />;
  else if (perluSesi && step === "sesi")
    body = <SesiPick rows={rows} value={sesiId} onPick={ambilSesi} t={t} lang={lang} />;
  else if (step === "grup")
    body = !rekap ? (
      <span className="skeleton" style={{ height: 160 }} />
    ) : (
      <div className="rp-pick">
        <span className="hint">{sesiLabel}</span>
        {rekap.kelompok.map((g) => (
          <button
            key={g.nomor}
            type="button"
            className="rp-pick__i"
            disabled={busy}
            aria-pressed={nomor === g.nomor}
            onClick={() => void ambilGrup(g.nomor)}
          >
            <Pill group={g.nomor}>{namaKelompok(g.nomor, g.nama)}</Pill>
            <span className="hint">{g.pemegang ? dir.nama(g.pemegang) : t.noHolder}</span>
          </button>
        ))}
      </div>
    );
  else if (kind === "praktikan")
    body = !rekap ? (
      <span className="skeleton" style={{ height: 160 }} />
    ) : (
      <div className="stack">
        <label className="rp-searchbar">
          <MagnifyingGlassIcon size={18} aria-hidden="true" />
          <input
            value={q}
            placeholder={t.pickPraktikan}
            aria-label={t.pickPraktikan}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="rp-pick">
          {rekap.kelompok.flatMap((g) =>
            g.anggota
              .filter(
                (a) =>
                  !q.trim() || `${a.nama} ${a.nim}`.toLowerCase().includes(q.trim().toLowerCase()),
              )
              .map((a) => (
                <button
                  key={a.nim}
                  type="button"
                  className="rp-pick__i"
                  onClick={() =>
                    onInsert({
                      sesi: sesiLabel,
                      nama: a.nama,
                      nim: a.nim,
                      nomor: g.nomor,
                      skor: a.skor,
                    })
                  }
                >
                  <b>{a.nama}</b>
                  <span className="hint mono">{a.nim}</span>
                  <Pill group={g.nomor}>{kelompokLabel(g.nomor, lang)}</Pill>
                </button>
              )),
          )}
        </div>
      </div>
    );
  else if (kind === "kejadian")
    body =
      kej === null ? (
        <span className="skeleton" style={{ height: 160 }} />
      ) : kej.length === 0 ? (
        <p className="hint">{t.noKejadian}</p>
      ) : (
        <div className="rp-pick">
          {kej.map((k) => {
            const { tag, teks } = kalimatKejadian(k, lang, (n) => dir.nama(n));
            return (
              <button
                key={k.id}
                type="button"
                className="rp-pick__i"
                onClick={() =>
                  onInsert({ sesi: sesiLabel, jam: jamKejadian(k, lang), tag: t.tag[tag], teks })
                }
              >
                <span className="mono hint">{jamKejadian(k, lang)}</span>
                <Pill>{t.tag[tag]}</Pill>
                <span>{teks}</span>
              </button>
            );
          })}
        </div>
      );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={judul}
      description={kind ? t.blk[kind][1] : undefined}
      size="lg"
      lang={lang}
      alt={backToSesi}
      actions={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          {t.cancel}
        </button>
      }
    >
      {body}
    </Dialog>
  );
}

function FotoPick({
  laporanId,
  t,
  lang,
  onDone,
}: {
  laporanId: number;
  t: Tx;
  lang: Lang;
  onDone: (v: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const kirim = async (f: File) => {
    setBusy(true);
    try {
      const blob = await upload(`laporan-${laporanId}-${f.name}`, f, {
        access: "public",
        handleUploadUrl: "/api/presentasi/lampiran-token",
      });
      const r = await fetch("/api/session/dokumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aksi: "lampiran",
          id: laporanId,
          nama: f.name,
          url: blob.url,
          tipe: f.type,
          ukuran: f.size,
        }),
      }).then((x) => x.json() as Promise<{ ok: boolean }>);
      if (!r.ok) throw new Error("lampiran");
      onDone({ url: blob.url, nama: f.name, tipe: f.type, ukuran: f.size, cap: "" });
    } catch {
      window.Toast?.show(t.uploadFail, "danger");
    }
    setBusy(false);
  };
  return (
    <FileDrop
      accept={["image/png", "image/jpeg", "image/webp", "application/pdf"]}
      maxBytes={10 * 1024 * 1024}
      kinds={t.fileKinds}
      busy={busy}
      lang={lang}
      onFile={(f) => void kirim(f)}
    />
  );
}

interface ServerRow {
  id: number;
  nama: string;
  kode: string;
}

function ChartPick({ t, lang, onDone }: { t: Tx; lang: Lang; onDone: (v: unknown) => void }) {
  const [srv, setSrv] = useState<ServerRow[] | null>(null);
  const [id, setId] = useState("");
  const [ukuran, setUkuran] = useState<"cpu" | "suhu" | "mem">("suhu");
  const [rentang, setRentang] = useState<"1h" | "24h" | "7d">("1h");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getJson<{ ok: boolean; server: ServerRow[] }>("/api/server")
      .then((d) => {
        const list = d.ok ? d.server : [];
        setSrv(list);
        if (list[0]) setId(String(list[0].id));
      })
      .catch(() => setSrv([]));
  }, []);
  const ambil = async () => {
    setBusy(true);
    try {
      const d = await getJson<{
        ok: boolean;
        seri: { pada: string; cpu: number | null; suhu: number | null; memori: number | null }[];
      }>(`/api/server/${id}?aksi=riwayat&rentang=${rentang}`);
      const kol = ukuran === "mem" ? "memori" : ukuran;
      const pts = (d.ok ? d.seri : [])
        .filter((r) => r[kol] != null)
        .map((r) => [new Date(r.pada).getTime(), Number(r[kol])] as [number, number]);
      if (pts.length < 2) {
        window.Toast?.show(t.noChart, "warn");
      } else {
        const s = srv?.find((x) => String(x.id) === id);
        onDone({
          server: s ? `${s.nama} (${s.kode})` : id,
          ukuran,
          rentang: t.range[rentang],
          pts,
          pada: new Date().toISOString(),
        });
      }
    } catch {
      window.Toast?.show(t.err, "danger");
    }
    setBusy(false);
  };
  if (srv === null) return <span className="skeleton" style={{ height: 120 }} />;
  if (!srv.length) return <p className="hint">{t.noServer}</p>;
  return (
    <div className="stack">
      <Dropdown
        id="pick-srv"
        label={t.pickServer}
        value={id}
        onChange={setId}
        options={srv.map((s) => ({ value: String(s.id), label: `${s.nama} (${s.kode})` }))}
      />
      <span className="label-caps">{t.pickMetric}</span>
      <div className="seg" role="radiogroup" aria-label={t.pickMetric}>
        {(["cpu", "suhu", "mem"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={ukuran === k}
            onClick={() => setUkuran(k)}
          >
            {t.metric[k]}
          </button>
        ))}
      </div>
      <span className="label-caps">{t.pickRange}</span>
      <div className="seg" role="radiogroup" aria-label={t.pickRange}>
        {(["1h", "24h", "7d"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={rentang === k}
            onClick={() => setRentang(k)}
          >
            {t.range[k]}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy || !id}
        onClick={() => void ambil()}
      >
        {t.insert}
      </button>
      <span className="hint">{tanggalPanjang(hariIniWib(), lang)}</span>
    </div>
  );
}

interface JadwalRow {
  id: number;
  semester: string;
  hari: number;
  slot: number;
  kelas: Kelas;
  asisten: string[];
}

function SlotPick({
  t,
  lang,
  dir,
  me,
  onDone,
}: {
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
  onDone: (v: unknown) => void;
}) {
  const [rows, setRows] = useState<JadwalRow[] | null>(null);
  const [slot, setSlot] = useState("");
  const [ke, setKe] = useState("");
  useEffect(() => {
    const sem = semesterDariTanggal(hariIniWib());
    void getJson<{ ok: boolean; jadwal: JadwalRow[] }>(`/api/session/schedule?semester=${sem}`)
      .then((d) => {
        const list = (d.ok ? d.jadwal : []).sort((a, b) => a.hari - b.hari || a.slot - b.slot);
        setRows(list);
        const mine = dir.byNim.get(me)?.kode;
        const pertama = list.find((j) => mine && j.asisten.includes(mine)) ?? list[0];
        if (pertama) setSlot(String(pertama.id));
      })
      .catch(() => setRows([]));
  }, [dir, me]);
  const orang = [...dir.byNim.values()]
    .filter((o) => o.nim !== me)
    .sort((a, b) => a.nama.localeCompare(b.nama));
  useEffect(() => {
    if (!ke && orang[0]) setKe(orang[0].nim);
  }, [orang, ke]);
  if (rows === null) return <span className="skeleton" style={{ height: 120 }} />;
  const j = rows.find((r) => String(r.id) === slot);
  return (
    <div className="stack">
      <Dropdown
        id="pick-slot"
        label={t.pickSlot}
        value={slot}
        onChange={setSlot}
        options={rows.map((r) => ({
          value: String(r.id),
          label: `${hariLabel(r.hari, lang)} · Slot ${r.slot} · ${jamSlot(r.slot)} · ${kelasLabel(r.kelas, lang)}`,
        }))}
      />
      <Dropdown
        id="pick-swap"
        label={t.pickSwap}
        value={ke}
        onChange={setKe}
        options={orang.map((o) => ({ value: o.nim, label: dir.nama(o.nim) }))}
      />
      <button
        type="button"
        className="btn btn--primary"
        disabled={!j || !ke}
        onClick={() => j && onDone({ hari: j.hari, slot: j.slot, kelas: j.kelas, dari: me, ke })}
      >
        {t.insert}
      </button>
    </div>
  );
}

function BayarPick({
  t,
  lang,
  me,
  onDone,
}: {
  t: Tx;
  lang: Lang;
  me: string;
  onDone: (v: unknown) => void;
}) {
  const { data } = useBayar(true);
  if (!data) return <span className="skeleton" style={{ height: 120 }} />;
  const units = data.units
    .filter((u) => u.nimPenilai === me)
    .slice(-40)
    .reverse();
  const tf = data.transfer
    .filter((x) => x.nim === me)
    .slice(-20)
    .reverse();
  if (!units.length && !tf.length) return <p className="hint">{t.noBayar}</p>;
  return (
    <div className="rp-pick">
      {tf.map((x) => {
        const teks = t.transferLine(
          x.jenis === "kotor" ? t.kotor : t.balik,
          namaPeriode(x.periode, lang),
        );
        return (
          <button
            key={`t${x.id}`}
            type="button"
            className="rp-pick__i"
            onClick={() => onDone({ jenis: x.jenis, teks, jumlah: x.jumlah, lunas: true })}
          >
            <Pill tone="ok">{x.jenis === "kotor" ? t.kotor : t.balik}</Pill>
            <span className="grow">{teks}</span>
            <b className="num">{rupiah(x.jumlah)}</b>
          </button>
        );
      })}
      {units.map((u) => {
        const teks = `${t.unitLine(u.kelompokNomor, tanggalPanjang(u.tanggal, lang))} · ${modulLabel(u.modul, lang)}`;
        return (
          <button
            key={`u${u.id}`}
            type="button"
            className="rp-pick__i"
            onClick={() => onDone({ jenis: "unit", teks, jumlah: u.kotor, lunas: false })}
          >
            <Pill tone={u.kelas === "internasional" ? "violet" : undefined}>
              {kelasLabel(u.kelas, lang)}
            </Pill>
            <span className="grow">{teks}</span>
            <b className="num">{rupiah(u.kotor)}</b>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ SesiPick */

/**
 * Picks one session in two steps: the date first (only days that had a
 * session can be picked), then a card per session that day, led by its
 * module. Used by Add Incident and the report builder's data blocks.
 */
type SesiKartu = Pick<SesiLaporan, "id" | "tanggal" | "mulai" | "slot" | "modul"> & {
  kelas?: Kelas;
};

export function SesiPick<S extends SesiKartu>({
  rows,
  value,
  onPick,
  t,
  lang,
  autoSingle = false,
  onClear,
}: {
  rows: S[];
  value: number | null;
  onPick: (r: S) => void;
  t: Tx;
  lang: Lang;
  /** Pick the only session of a date as soon as that date is chosen. */
  autoSingle?: boolean;
  /** A new date was chosen and no session on it is picked yet. */
  onClear?: () => void;
}) {
  const uid = useId();
  const hari = useMemo(() => new Set(rows.map((r) => r.tanggal)), [rows]);
  const urut = useMemo(() => [...hari].sort(), [hari]);
  const awal = rows.find((r) => r.id === value)?.tanggal ?? urut.at(-1) ?? "";
  const [tgl, setTgl] = useState(awal);
  useEffect(() => {
    if (!hari.has(tgl)) setTgl(awal);
  }, [hari]);
  const hariItu = rows
    .filter((r) => r.tanggal === tgl)
    .sort((a, b) => a.mulai.localeCompare(b.mulai));
  return (
    <div className="stack rp-sesipick">
      <div className="field">
        <span className="field__label" id={`${uid}-d`}>
          {t.sesiDate}
        </span>
        <DateField
          id={`${uid}-f`}
          value={tgl}
          onChange={(d) => {
            setTgl(d);
            const di = rows.filter((r) => r.tanggal === d);
            if (autoSingle && di.length === 1) onPick(di[0]);
            else if (!di.some((r) => r.id === value)) onClear?.();
          }}
          label={t.sesiDate}
          labelledBy={`${uid}-d`}
          lang={lang}
          min={urut[0]}
          max={urut.at(-1)}
          boleh={(d) => hari.has(d)}
        />
      </div>
      <div className="field">
        <span className="field__label" id={`${uid}-m`}>
          {t.sesiModule}
        </span>
        {hariItu.length === 0 ? (
          <p className="hint">{t.noSesiDay}</p>
        ) : (
          <div
            className="rp-sesicards"
            role="radiogroup"
            aria-labelledby={`${uid}-m`}
            // Balanced rows of up to four: 5 cards are 3 + 2, not 4 + 1.
            style={
              {
                "--cols": Math.ceil(hariItu.length / Math.ceil(hariItu.length / 4)),
                "--cols-sm": Math.min(hariItu.length, 2),
              } as CSSProperties
            }
          >
            {hariItu.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={r.id === value}
                className="rp-sesicard"
                onClick={() => onPick(r)}
              >
                <Pill modul={r.modul}>{modulLabel(r.modul, lang)}</Pill>
                <b>{r.slot ? t.slotN(r.slot, r.mulai) : t.susulanAt(r.mulai)}</b>
                {r.kelas && <span className="hint">{kelasLabel(r.kelas, lang)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
