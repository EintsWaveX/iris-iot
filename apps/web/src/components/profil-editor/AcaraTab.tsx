/**
 * Profil Lab › Acara: pick Workshop, ToT or Rekruitasi, then an edition
 * (newest first) or a new one: its title, date, place and write up in
 * three languages, and its photos in Home's order with one as the cover.
 * The edition and its whole photo list save together.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  CircleNotchIcon,
  ImageIcon,
  StarIcon,
  XIcon,
} from "@phosphor-icons/react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Confirm from "../ui/Confirm";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import { DatePicker } from "../ui/Controls";
import { tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import {
  FOTO_PER_ACARA,
  FOTO_TIPE_MASUK,
  JENIS_ACARA,
  TEKS_MAKS,
  bahasaKosong,
  isJenisAcara,
  sampulAcara,
  teksDi,
  type Acara,
  type FotoAcara,
  type JenisAcara,
  type ProfilData,
  type TeksTiga,
} from "../../lib/profil";
import { E } from "./editorStrings";
import { TEKS_KOSONG, TriField, toast } from "./fields";
import { FotoGagal, unggahFoto } from "./fotoUnggah";
import { tulis } from "./ProfilEditor";

interface FotoDraf extends Omit<FotoAcara, "id"> {
  id: number | null;
  /** A stable key for a photo not saved yet. */
  k: string;
}

interface Draf {
  judul: TeksTiga;
  tempat: TeksTiga;
  ringkasan: TeksTiga;
  tanggal: string;
  foto: FotoDraf[];
  sampul: number;
}

const kosong = (): Draf => ({
  judul: TEKS_KOSONG,
  tempat: TEKS_KOSONG,
  ringkasan: TEKS_KOSONG,
  tanggal: "",
  foto: [],
  sampul: 0,
});

function dariAcara(a: Acara): Draf {
  const s = sampulAcara(a);
  return {
    judul: a.judul,
    tempat: a.tempat,
    ringkasan: a.ringkasan,
    tanggal: a.tanggal,
    foto: a.foto.map((f) => ({ ...f, k: String(f.id) })),
    sampul: Math.max(
      0,
      a.foto.findIndex((f) => f.id === s?.id),
    ),
  };
}

function jenisDariUrl(): JenisAcara {
  if (typeof location === "undefined") return "workshop";
  const v = new URLSearchParams(location.search).get("jenis");
  return isJenisAcara(v) ? v : "workshop";
}

/** One photo tile; the pointer drags it to a new place (the arrows do the
 *  same from the keyboard). */
function Petak({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      className="pl-edphotos__i"
      data-drag={isDragging ? "yes" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role="listitem"
    >
      {children}
    </div>
  );
}

function Formulir({
  lang,
  jenis,
  acara,
  muat,
  onSelesai,
}: {
  lang: Lang;
  jenis: JenisAcara;
  acara: Acara | null;
  muat: () => void;
  /** After a save of a new edition (its id) or a delete (null). */
  onSelesai: (id: number | null) => void;
}) {
  const t = E[lang];
  const awal = acara ? dariAcara(acara) : kosong();
  const [d, setD] = useState<Draf>(awal);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unggah, setUnggah] = useState(0);
  const [hapus, setHapus] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const kunci = acara ? JSON.stringify(acara) : "baru";
  useEffect(() => {
    setD(acara ? dariAcara(acara) : kosong());
    setTried(false);
  }, [kunci]);

  const ubah = JSON.stringify(d) !== JSON.stringify(awal);
  const judulNow = teksDi(d.judul, lang) || t.edisiBaru;

  async function tambah(files: FileList | null) {
    const list = [...(files ?? [])].slice(0, FOTO_PER_ACARA - d.foto.length);
    if (files && files.length > list.length) toast(t.fotoBanyak(FOTO_PER_ACARA), "danger");
    if (input.current) input.current.value = "";
    for (const f of list) {
      setUnggah((n) => n + 1);
      try {
        const foto = await unggahFoto(f, `acara-${jenis}`);
        setD((x) => ({
          ...x,
          foto: [...x.foto, { id: null, ...foto, alt: null, k: `${Date.now()}-${Math.random()}` }],
        }));
      } catch (err) {
        toast(t[err instanceof FotoGagal ? err.kode : "gagalUnggah"], "danger");
      } finally {
        setUnggah((n) => n - 1);
      }
    }
  }

  function geser(i: number, arah: -1 | 1) {
    const j = i + arah;
    if (j < 0 || j >= d.foto.length) return;
    const foto = [...d.foto];
    [foto[i], foto[j]] = [foto[j], foto[i]];
    const sampul = d.sampul === i ? j : d.sampul === j ? i : d.sampul;
    setD({ ...d, foto, sampul });
  }

  function buang(i: number) {
    const foto = d.foto.filter((_, x) => x !== i);
    const sampul = d.sampul === i ? 0 : d.sampul > i ? d.sampul - 1 : d.sampul;
    setD({ ...d, foto, sampul });
  }

  async function simpan() {
    setTried(true);
    const kurang = [d.judul, d.tempat, d.ringkasan].some((x) => bahasaKosong(x).length);
    if (kurang || !d.tanggal) return;
    setBusy(true);
    const r = await tulis(lang, "acara-simpan", {
      ...(acara ? { id: acara.id } : {}),
      jenis,
      judul: d.judul,
      tempat: d.tempat,
      ringkasan: d.ringkasan,
      tanggal: d.tanggal,
      sampul: d.sampul,
      foto: d.foto.map(({ id, besar, kecil, alt }) => ({ id, besar, kecil, alt })),
    });
    setBusy(false);
    if (!r.ok) return toast(t.gagal, "danger");
    if (!acara && r.id) onSelesai(r.id);
    muat();
  }

  return (
    <div className="panel stack pl-edcard">
      <div className="panel__head">
        <h2 className="panel__title">{judulNow}</h2>
      </div>
      <TriField
        lang={lang}
        label={t.judulAcara}
        value={d.judul}
        onChange={(v) => setD({ ...d, judul: v })}
        maks={TEKS_MAKS.judul}
        tried={tried}
      />
      <div className="pl-edrow">
        <div className="stack stack--sm">
          <DatePicker
            label={t.tanggal}
            value={d.tanggal}
            onChange={(v) => setD({ ...d, tanggal: v })}
            lang={lang}
          />
          {tried && !d.tanggal && <span className="field__error">{t.tanggalWajib}</span>}
        </div>
        <TriField
          lang={lang}
          label={t.tempat}
          value={d.tempat}
          onChange={(v) => setD({ ...d, tempat: v })}
          maks={TEKS_MAKS.tempat}
          tried={tried}
        />
      </div>
      <TriField
        lang={lang}
        label={t.ringkasan}
        value={d.ringkasan}
        onChange={(v) => setD({ ...d, ringkasan: v })}
        maks={TEKS_MAKS.ringkasan}
        long
        tried={tried}
      />
      <div className="stack stack--sm">
        <span className="field__label">{t.foto(d.foto.length)}</span>
        <span className="hint">{t.fotoHint}</span>
        <div className="pl-edphotos" role="list">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return;
              const a = d.foto.findIndex((f) => f.k === active.id);
              const z = d.foto.findIndex((f) => f.k === over.id);
              const sampulK = d.foto[d.sampul]?.k;
              const foto = arrayMove(d.foto, a, z);
              setD({
                ...d,
                foto,
                sampul: Math.max(
                  0,
                  foto.findIndex((f) => f.k === sampulK),
                ),
              });
            }}
          >
            <SortableContext items={d.foto.map((f) => f.k)} strategy={rectSortingStrategy}>
              {d.foto.map((f, i) => (
                <Petak key={f.k} id={f.k}>
                  <img
                    src={f.kecil}
                    alt={`${judulNow} ${i + 1}`}
                    decoding="async"
                    draggable={false}
                  />
                  {i === d.sampul && <span className="pl-edphotos__cover">{t.sampul}</span>}
                  <span className="pl-edphotos__star">
                    <IconButton
                      icon={StarIcon}
                      label={t.jadikanSampul}
                      sm
                      pressed={i === d.sampul}
                      onClick={() => setD({ ...d, sampul: i })}
                    />
                  </span>
                  <span className="pl-edphotos__bar">
                    <IconButton
                      icon={CaretLeftIcon}
                      label={t.geserKiri}
                      sm
                      disabled={i === 0}
                      onClick={() => geser(i, -1)}
                    />
                    <IconButton
                      icon={CaretRightIcon}
                      label={t.geserKanan}
                      sm
                      disabled={i === d.foto.length - 1}
                      onClick={() => geser(i, 1)}
                    />
                    <IconButton
                      icon={XIcon}
                      label={t.hapusFoto}
                      sm
                      kind="danger"
                      onClick={() => buang(i)}
                    />
                  </span>
                </Petak>
              ))}
            </SortableContext>
          </DndContext>
          {d.foto.length < FOTO_PER_ACARA && (
            <button
              type="button"
              className="pl-pick pl-pick__btn pl-edphotos__add"
              onClick={() => input.current?.click()}
              disabled={unggah > 0}
            >
              {unggah > 0 ? (
                <CircleNotchIcon className="ctl-spin" size={24} aria-label={t.mengunggah} />
              ) : (
                <ImageIcon size={24} aria-hidden="true" />
              )}
              <span>{unggah > 0 ? `${t.mengunggah} (${unggah})` : t.tambahFoto}</span>
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept={FOTO_TIPE_MASUK.join(",")}
            multiple
            hidden
            onChange={(e) => tambah(e.target.files)}
          />
        </div>
      </div>
      <div className="pl-edfoot">
        {acara && (
          <button
            type="button"
            className="btn btn--ghost pl-edfoot__alt"
            onClick={() => setHapus(true)}
          >
            {t.hapusEdisi}
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          disabled={(!ubah && !!acara) || busy}
          onClick={() => (acara ? setD(dariAcara(acara)) : onSelesai(null))}
        >
          {t.batal}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!ubah || busy || unggah > 0}
          data-loading={busy ? "yes" : undefined}
          onClick={simpan}
        >
          {t.simpan}
        </button>
      </div>
      {acara && (
        <Confirm
          open={hapus}
          onOpenChange={setHapus}
          title={t.hapusEdisiJudul(teksDi(acara.judul, lang))}
          body={t.hapusEdisiIsi}
          confirmLabel={t.hapusEdisi}
          cancelLabel={t.batal}
          lang={lang}
          onConfirm={async () => {
            const r = await tulis(lang, "acara-hapus", { id: acara.id }, true);
            if (!r.ok) {
              toast(t.gagal, "danger");
              return false;
            }
            toast(t.terhapus);
            onSelesai(null);
            muat();
          }}
        />
      )}
    </div>
  );
}

export default function AcaraTab({
  lang,
  data,
  muat,
}: {
  lang: Lang;
  data: ProfilData;
  muat: () => void;
}) {
  const t = E[lang];
  const [jenis, setJenis] = useState<JenisAcara>(jenisDariUrl);
  const list = data.acara.filter((a) => a.jenis === jenis).reverse();
  // An edition's id, "baru" for a new one, or null before one is picked.
  const [sel, setSel] = useState<number | "baru" | null>(list[0]?.id ?? null);
  const acara = typeof sel === "number" ? (data.acara.find((a) => a.id === sel) ?? null) : null;

  useEffect(() => {
    if (sel === null || (typeof sel === "number" && !acara)) setSel(list[0]?.id ?? null);
  }, [jenis, data]);

  return (
    <div className="stack">
      <SegmentedControl
        value={jenis}
        onValueChange={(v) => {
          setJenis(v as JenisAcara);
          setSel(data.acara.filter((a) => a.jenis === v).at(-1)?.id ?? null);
        }}
        options={JENIS_ACARA.map((j) => ({ value: j, label: t.jenis[j] }))}
        fill
        aria-label={t.jenisAcara}
      />
      <div className="pl-edgrid">
        <div className="panel pl-edlist">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              className="pl-edlist__i"
              aria-pressed={a.id === sel}
              onClick={() => setSel(a.id)}
            >
              <b>{teksDi(a.judul, lang)}</b>
              <span className="hint">{tanggalPanjang(a.tanggal, lang)}</span>
            </button>
          ))}
          {!list.length && <p className="hint">{t.belumEdisi}</p>}
          <button
            type="button"
            className="btn btn--inverse"
            aria-pressed={sel === "baru"}
            onClick={() => setSel("baru")}
          >
            {t.tambahEdisi}
          </button>
        </div>
        {sel !== null && (
          <Formulir
            key={`${jenis}-${sel}`}
            lang={lang}
            jenis={jenis}
            acara={acara}
            muat={muat}
            onSelesai={(id) => setSel(id ?? list.find((a) => a.id !== acara?.id)?.id ?? null)}
          />
        )}
      </div>
    </div>
  );
}
