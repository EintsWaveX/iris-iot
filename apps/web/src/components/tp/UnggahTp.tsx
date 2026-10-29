/**
 * The TP upload, inside the module's TP step (2026-10-21: TP is handed in
 * only in IRIS). Three steps: pick and order the pages (photos of the
 * paper, the camera on a phone, or a scanned PDF; drag or arrows to order,
 * rotate), check the PDF IRIS built, then send it with real progress.
 * The sending itself is src/lib/tp-unggah.ts.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
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
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  DotsSixVerticalIcon,
  FilePdfIcon,
  XIcon,
} from "@phosphor-icons/react";
import { FileDrop } from "../ui/Controls";
import Confirm from "../ui/Confirm";
import Drawer from "../ui/Drawer";
import PdfViewer from "../ui/PdfViewer";
import type { Lang } from "../../lib/kelas";
import {
  GagalUnggah,
  HALAMAN_MAKS,
  JENIS_UNGGAH,
  halamanBaru,
  kirimTp,
  lupakan,
  susunPdf,
  type HasilKirim,
  type Halaman,
  type Sudut,
  type Tahap,
} from "../../lib/tp-unggah";
import { TPS } from "./tpStrings";
import { ukuran, waktuPanjang } from "./shared";

/** A photo straight off a phone camera can be large; it is shrunk here. */
const BERKAS_MAKS = 25 * 1024 * 1024;

type Langkah =
  | { l: "pilih" }
  | { l: "susun"; i: number; n: number }
  | { l: "periksa"; pdf: Uint8Array; halaman: number }
  | { l: "kirim"; pdf: Uint8Array; halaman: number; tahap: Tahap };

export default function UnggahTp({
  lang,
  modul,
  adaBerkas,
  onSelesai,
}: {
  lang: Lang;
  modul: number;
  /** They already have a file: the new one replaces it. */
  adaBerkas: boolean;
  onSelesai: () => void;
}) {
  const t = TPS[lang];
  const [halaman, setHalaman] = useState<Halaman[]>([]);
  const [langkah, setLangkah] = useState<Langkah>({ l: "pilih" });
  const [galat, setGalat] = useState<string | null>(null);
  const [tanya, setTanya] = useState(false);
  const [terima, setTerima] = useState<HasilKirim | null>(null);
  const [sentuh, setSentuh] = useState(false);
  // A phone's step column is too narrow for the viewer's bar: it opens wide.
  const [sempit, setSempit] = useState(false);
  const [lihat, setLihat] = useState(false);
  const kamera = useRef<HTMLInputElement | null>(null);
  const henti = useRef<AbortController | null>(null);

  useEffect(() => {
    setSentuh(window.matchMedia("(pointer: coarse)").matches);
    const mq = window.matchMedia("(max-width: 560px)");
    const ikut = () => setSempit(mq.matches);
    ikut();
    mq.addEventListener("change", ikut);
    return () => mq.removeEventListener("change", ikut);
  }, []);

  const pratinjau = useMemo(
    () =>
      new Map(
        halaman
          .filter((h) => h.berkas.type.startsWith("image/"))
          .map((h) => [h.id, URL.createObjectURL(h.berkas)]),
      ),
    [halaman],
  );
  useEffect(() => () => pratinjau.forEach((u) => URL.revokeObjectURL(u)), [pratinjau]);

  // Pages picked but not sent, or a send running: leaving asks first.
  const adaYangHilang = halaman.length > 0 || langkah.l === "kirim";
  useEffect(() => {
    if (!adaYangHilang) return;
    const tahan = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", tahan);
    // Tells the page not to move away by itself (ModuleSteps' end-of-session jump).
    document.documentElement.dataset.tpUnggah = "yes";
    return () => {
      window.removeEventListener("beforeunload", tahan);
      delete document.documentElement.dataset.tpUnggah;
    };
  }, [adaYangHilang]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const tambah = (fs: File[]) => {
    setGalat(null);
    setTerima(null);
    const semua = [...halaman, ...fs.map(halamanBaru)];
    if (semua.length > HALAMAN_MAKS) setGalat(t.maksHalaman(HALAMAN_MAKS));
    setHalaman(semua.slice(0, HALAMAN_MAKS));
    setLangkah({ l: "pilih" });
  };
  const geser = (i: number, arah: -1 | 1) => {
    const j = i + arah;
    if (j < 0 || j >= halaman.length) return;
    setHalaman(arrayMove(halaman, i, j));
  };
  const putar = (id: string) =>
    setHalaman(
      halaman.map((h) => (h.id === id ? { ...h, putar: ((h.putar + 90) % 360) as Sudut } : h)),
    );
  const buang = (id: string) => {
    const h = halaman.find((x) => x.id === id);
    if (h) lupakan(h.berkas);
    setHalaman(halaman.filter((x) => x.id !== id));
  };
  const kosongkan = () => {
    halaman.forEach((h) => lupakan(h.berkas));
    setHalaman([]);
    setGalat(null);
    setLangkah({ l: "pilih" });
  };

  const periksa = async () => {
    setGalat(null);
    setLangkah({ l: "susun", i: 0, n: halaman.length });
    try {
      const r = await susunPdf(halaman, (i, n) => setLangkah({ l: "susun", i, n }));
      setLangkah({ l: "periksa", pdf: r.pdf, halaman: r.halaman });
    } catch (e) {
      setLangkah({ l: "pilih" });
      setGalat(t.galatUnggah[e instanceof GagalUnggah ? e.kode : "rusak"]);
    }
  };

  const kirim = async () => {
    if (langkah.l !== "periksa") return;
    const { pdf, halaman: n } = langkah;
    const ctl = new AbortController();
    henti.current = ctl;
    setGalat(null);
    setLangkah({ l: "kirim", pdf, halaman: n, tahap: { t: "tiket" } });
    const r = await kirimTp(
      modul,
      pdf,
      n,
      (tahap) => setLangkah({ l: "kirim", pdf, halaman: n, tahap }),
      ctl.signal,
    );
    henti.current = null;
    if (!r.ok) {
      setLangkah({ l: "periksa", pdf, halaman: n });
      if (r.kode === "batal") return window.Toast?.show(t.dibatalkan, "warn");
      return setGalat(t.galatUnggah[r.kode ?? "lain"] ?? t.galatUnggah.lain);
    }
    window.Toast?.show(r.sama ? t.unggahSama : t.unggahBerhasil, "ok");
    halaman.forEach((h) => lupakan(h.berkas));
    setHalaman([]);
    setLangkah({ l: "pilih" });
    setTerima({ ...r, ukuran: r.ukuran ?? pdf.length, halaman: r.halaman ?? n });
    onSelesai();
  };

  const sibuk = langkah.l === "susun" || langkah.l === "kirim";

  if (langkah.l === "periksa" || langkah.l === "kirim") {
    const k = langkah.l === "kirim" ? langkah.tahap : null;
    const persen = k?.t === "kirim" ? k.persen : k?.t === "pastikan" ? 100 : 0;
    return (
      <div className="tpup">
        <div className="stack stack--sm">
          <b>{t.periksaH}</b>
          <p className="hint">{t.periksaBody(langkah.halaman, ukuran(langkah.pdf.length, lang))}</p>
        </div>
        {sempit ? (
          <>
            <button
              type="button"
              className="btn btn--secondary tpup__lihat"
              onClick={() => setLihat(true)}
            >
              {t.lihatPdf}
            </button>
            <Drawer
              open={lihat}
              onOpenChange={setLihat}
              title={t.periksaH}
              description={t.periksaBody(langkah.halaman, ukuran(langkah.pdf.length, lang))}
              storeKey="tp-periksa"
              minWidth={360}
              closeLabel={t.tutup}
              resizeLabel={t.tutup}
            >
              <PdfViewer
                url="about:blank"
                data={langkah.pdf}
                name={`TP_Modul_${modul}.pdf`}
                lang={lang}
                shape="page"
              />
            </Drawer>
          </>
        ) : (
          <div className="tpup__pratinjau">
            <PdfViewer
              url="about:blank"
              data={langkah.pdf}
              name={`TP_Modul_${modul}.pdf`}
              lang={lang}
              shape="page"
            />
          </div>
        )}
        {galat && (
          <p className="tpup__err" role="alert">
            {galat}
          </p>
        )}
        {k ? (
          <div className="tpup__kirim" aria-live="polite">
            <div className="row row--between">
              <span className="hint">
                {k.t === "tiket"
                  ? t.mengunggah
                  : k.t === "pastikan"
                    ? t.memastikan
                    : k.coba
                      ? t.mencobaLagi(k.coba)
                      : t.mengunggahPersen(k.persen)}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={k.t === "pastikan"}
                onClick={() => henti.current?.abort()}
              >
                {t.batalUnggah}
              </button>
            </div>
            <span
              className="meter meter--lg"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={persen}
              aria-label={t.mengunggah}
              style={{ "--meter": persen } as CSSProperties}
            />
          </div>
        ) : (
          <div className="tpup__foot">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setLangkah({ l: "pilih" })}
            >
              {t.kembaliUbah}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => (adaBerkas ? setTanya(true) : void kirim())}
            >
              {t.kirimTp}
            </button>
          </div>
        )}
        <Confirm
          open={tanya}
          onOpenChange={setTanya}
          title={t.gantiH}
          body={t.gantiBody}
          confirmLabel={t.gantiYa}
          tone="primary"
          lang={lang}
          onConfirm={() => {
            setTanya(false);
            void kirim();
          }}
        />
      </div>
    );
  }

  return (
    <div className="tpup">
      {terima && !halaman.length && <TandaTerima lang={lang} r={terima} />}
      {halaman.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) return;
            const a = halaman.findIndex((h) => h.id === active.id);
            const z = halaman.findIndex((h) => h.id === over.id);
            setHalaman(arrayMove(halaman, a, z));
          }}
        >
          <SortableContext items={halaman.map((h) => h.id)} strategy={verticalListSortingStrategy}>
            <ol className="tpup__list" aria-label={t.jumlahHalaman(halaman.length)}>
              {halaman.map((h, i) => (
                <Baris key={h.id} id={h.id} label={t.geser} disabled={sibuk}>
                  {pratinjau.get(h.id) ? (
                    <img
                      className="tpup__thumb"
                      src={pratinjau.get(h.id)}
                      alt=""
                      style={{ transform: `rotate(${h.putar}deg)` }}
                    />
                  ) : (
                    <span className="tpup__thumb tpup__thumb--pdf" aria-hidden="true">
                      <FilePdfIcon size={22} />
                    </span>
                  )}
                  <span className="stack tpup__txt">
                    <b>{t.halamanKe(i + 1)}</b>
                    <span className="hint tpup__name">{h.berkas.name}</span>
                  </span>
                  <span className="tpup__act">
                    <Tombol
                      label={t.putarHalaman(i + 1)}
                      disabled={sibuk}
                      onClick={() => putar(h.id)}
                    >
                      <ArrowClockwiseIcon size={16} aria-hidden="true" />
                    </Tombol>
                    <Tombol
                      label={`${t.naikkan}: ${t.halamanKe(i + 1)}`}
                      disabled={sibuk || i === 0}
                      onClick={() => geser(i, -1)}
                    >
                      <ArrowUpIcon size={16} aria-hidden="true" />
                    </Tombol>
                    <Tombol
                      label={`${t.turunkan}: ${t.halamanKe(i + 1)}`}
                      disabled={sibuk || i === halaman.length - 1}
                      onClick={() => geser(i, 1)}
                    >
                      <ArrowDownIcon size={16} aria-hidden="true" />
                    </Tombol>
                    <Tombol
                      label={t.hapusHalaman(i + 1)}
                      disabled={sibuk}
                      danger
                      onClick={() => buang(h.id)}
                    >
                      <XIcon size={16} aria-hidden="true" />
                    </Tombol>
                  </span>
                </Baris>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className="tpup__ambil" data-kamera={sentuh ? "yes" : undefined}>
        {sentuh && (
          <>
            <input
              ref={kamera}
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = [...(e.target.files ?? [])];
                if (f.length) tambah(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn--secondary tpup__kamera"
              disabled={sibuk}
              onClick={() => kamera.current?.click()}
            >
              {t.fotoHalaman}
            </button>
          </>
        )}
        <FileDrop
          accept={JENIS_UNGGAH}
          maxBytes={BERKAS_MAKS}
          onFiles={tambah}
          busy={sibuk}
          lang={lang}
          kinds={t.unggahJenis}
          dropLabel={t.unggahDrop}
          compact={halaman.length > 0 || sentuh}
        />
      </div>
      {galat && (
        <p className="tpup__err" role="alert">
          {galat}
        </p>
      )}
      {halaman.length > 0 && (
        <div className="tpup__foot">
          <button type="button" className="btn btn--ghost" disabled={sibuk} onClick={kosongkan}>
            {t.kosongkan}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={sibuk}
            data-loading={langkah.l === "susun" ? "yes" : undefined}
            onClick={() => void periksa()}
          >
            {langkah.l === "susun"
              ? langkah.i
                ? t.menyiapkanKe(langkah.i, langkah.n)
                : t.menyiapkan
              : t.periksa}
          </button>
        </div>
      )}
    </div>
  );
}

/** One page: the pointer (or a long press) drags it; the arrows do the same. */
function Baris({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      className="tpup__item"
      data-drag={isDragging ? "yes" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="tpup__grip"
        aria-label={label}
        title={label}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <DotsSixVerticalIcon size={18} aria-hidden="true" />
      </button>
      {children}
    </li>
  );
}

function Tombol({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`iconbtn iconbtn--sm iconbtn--ghost${danger ? " iconbtn--danger" : ""}`}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** What IRIS got, right after the send. */
function TandaTerima({ lang, r }: { lang: Lang; r: HasilKirim }) {
  const t = TPS[lang];
  return (
    <div className="tpup__terima" role="status">
      <CheckCircleIcon size={22} weight="fill" aria-hidden="true" />
      <div className="stack stack--sm">
        <b>{t.tandaTerima}</b>
        <span className="hint">
          {r.dikirimPada ? t.diterimaPada(waktuPanjang(r.dikirimPada, lang)) : t.unggahSama}
        </span>
        <span className="hint">
          {[
            r.halaman ? t.jumlahHalaman(r.halaman) : null,
            r.ukuran ? ukuran(r.ukuran, lang) : null,
            r.kodeTerima ? t.kodeTerima(r.kodeTerima) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    </div>
  );
}
