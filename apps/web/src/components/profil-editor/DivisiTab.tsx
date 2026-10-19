/**
 * Profil Lab › Divisi: per division its photo, one line and description
 * (saved together), and a photo per member (saved at once). The Inti hold
 * no division but get the same entry, saved under "INTI". Members,
 * positions and codes come from Tim.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Confirm from "../ui/Confirm";
import { Switch } from "../ui/Controls";
import { postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { DIVISI, type Divisi } from "../../lib/hak";
import {
  INFO_DIVISI,
  INFO_INTI,
  KUNCI_INTI,
  TEKS_MAKS,
  bahasaKosong,
  type Foto,
  type IntiProfil,
  type NonaktifProfil,
  type OrangProfil,
  type ProfilData,
  type TeksTiga,
} from "../../lib/profil";
import { P } from "../home/profil/profilStrings";
import { E } from "./editorStrings";
import { FotoPilih, TriField, toast } from "./fields";
import { tulis } from "./ProfilEditor";

type Pilihan = Divisi | "inti";

interface Draf {
  baris: TeksTiga;
  deskripsi: TeksTiga;
  /** undefined: unchanged. */
  foto: Foto | null | undefined;
}

/** What the form edits: a division, or the Inti as a group. */
interface Grup extends IntiProfil {
  kunci: string;
  judul: string;
  warna: string;
  anggota: OrangProfil[];
}

const darDivisi = (d: IntiProfil): Draf => ({
  baris: d.baris,
  deskripsi: d.deskripsi,
  foto: undefined,
});
const sama = (a: TeksTiga, b: TeksTiga) => a.id === b.id && a.en === b.en && a.zh === b.zh;

function Anggota({
  lang,
  list,
  warna,
  muat,
}: {
  lang: Lang;
  list: OrangProfil[];
  warna: string;
  muat: () => void;
}) {
  const t = E[lang];
  async function ganti(o: OrangProfil, foto: Foto | null) {
    const r = await tulis(lang, "foto-asisten", { kode: o.kode, foto }, true);
    if (r.ok) toast(foto ? t.fotoTersimpan(o.nama) : t.fotoTerhapus(o.nama));
    else toast(t.gagal, "danger");
    muat();
  }
  if (!list.length) return <p className="hint">{t.belumAnggota}</p>;
  return (
    <div className="pl-edpeople" style={{ "--c": warna } as CSSProperties}>
      {list.map((o) => (
        <div className="pl-edpeople__i" key={o.kode}>
          <FotoPilih
            lang={lang}
            foto={o.foto}
            label={o.kode}
            nama={`asisten-${o.kode}`}
            ratio="1"
            compact
            onFoto={(f) => ganti(o, f)}
            onHapus={() => ganti(o, null)}
          />
          <b>{o.nama}</b>
          <span className="hint">
            {P[lang].peran[o.peran]} · <span className="mono">{o.kode}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The division's inactive Asisten, each with a switch that shows them on
 *  Home (they then join the members above, photo and all). */
function Nonaktif({ lang, list, muat }: { lang: Lang; list: NonaktifProfil[]; muat: () => void }) {
  const t = E[lang];
  const [sibuk, setSibuk] = useState<string | null>(null);
  async function ganti(o: NonaktifProfil, tampil: boolean) {
    setSibuk(o.kode);
    const r = await tulis(lang, "tampil-asisten", { kode: o.kode, tampil }, true);
    setSibuk(null);
    if (r.ok) toast(tampil ? t.ditampilkan(o.nama) : t.disembunyikan(o.nama));
    else toast(t.gagal, "danger");
    muat();
  }
  return (
    <div className="stack stack--sm">
      <span className="field__label">{t.nonaktifJudul}</span>
      <span className="hint">{t.nonaktifHint}</span>
      <div className="pl-ednon">
        {list.map((o) => (
          <div className="pl-ednon__i" key={o.kode}>
            <span>
              <b>{o.nama}</b>
              <span className="hint mono">{o.kode}</span>
            </span>
            <Switch
              on={o.tampil}
              onChange={(v) => ganti(o, v)}
              label={`${t.tampilkan}: ${o.nama}`}
              busy={sibuk === o.kode}
              disabled={sibuk !== null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DivisiTab({
  lang,
  data,
  muat,
}: {
  lang: Lang;
  data: ProfilData;
  muat: () => void;
}) {
  const t = E[lang];
  const [sel, setSel] = useState<Pilihan>("ASO");
  const [tunda, setTunda] = useState<Pilihan | null>(null);
  const d: Grup = (() => {
    if (sel === "inti")
      return {
        kunci: KUNCI_INTI,
        judul: t.inti,
        warna: INFO_INTI.warna,
        ...data.intiGrup,
        anggota: data.inti,
      };
    const x = data.divisi.find((y) => y.kode === sel)!;
    return {
      ...x,
      kunci: x.kode,
      judul: `${x.kode} · ${INFO_DIVISI[x.kode].nama}`,
      warna: INFO_DIVISI[x.kode].warna,
    };
  })();
  const [draf, setDraf] = useState<Draf>(darDivisi(d));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nonaktif, setNonaktif] = useState<NonaktifProfil[]>([]);

  // The inactive Asisten, read again with every refresh of the profile.
  useEffect(() => {
    let hidup = true;
    postJson<{ ok: boolean; nonaktif?: NonaktifProfil[] }>("/api/profil/nonaktif-daftar", {})
      .then((r) => hidup && setNonaktif(r.nonaktif ?? []))
      .catch(() => null);
    return () => {
      hidup = false;
    };
  }, [data]);
  const nonaktifDi = nonaktif.filter((o) => o.divisi === sel);

  // A save of this division (here or elsewhere) refreshes what the form
  // starts from; a member's photo saving leaves the typing alone.
  const kunci = JSON.stringify([d.baris, d.deskripsi, d.foto]);
  useEffect(() => {
    setDraf(darDivisi(d));
    setTried(false);
  }, [sel, kunci]);

  const ubah =
    !sama(draf.baris, d.baris) || !sama(draf.deskripsi, d.deskripsi) || draf.foto !== undefined;
  const pilih = (p: Pilihan) => (ubah ? setTunda(p) : setSel(p));

  async function simpan() {
    setTried(true);
    if (bahasaKosong(draf.baris).length || bahasaKosong(draf.deskripsi).length) return;
    setBusy(true);
    const r = await tulis(lang, "divisi-simpan", {
      divisi: d.kunci,
      baris: draf.baris,
      deskripsi: draf.deskripsi,
      ...(draf.foto !== undefined ? { foto: draf.foto } : {}),
    });
    setBusy(false);
    if (!r.ok) toast(t.gagal, "danger");
    muat();
  }

  const fotoTampil = draf.foto === undefined ? d.foto : draf.foto;
  const daftar: Pilihan[] = ["inti", ...DIVISI];
  return (
    <div className="pl-edgrid">
      <div className="panel pl-edlist">
        {daftar.map((x) => {
          const n =
            x === "inti" ? data.inti.length : data.divisi.find((y) => y.kode === x)!.anggota.length;
          return (
            <button
              key={x}
              type="button"
              className="pl-edlist__i"
              aria-pressed={x === sel}
              style={
                { "--c": x === "inti" ? INFO_INTI.warna : INFO_DIVISI[x].warna } as CSSProperties
              }
              onClick={() => pilih(x)}
            >
              <span className="mono">{x === "inti" ? t.inti : x}</span>
              <span className="hint">{t.nAsisten(n)}</span>
            </button>
          );
        })}
      </div>

      <div className="panel stack pl-edcard">
        <div className="panel__head">
          <h2 className="panel__title">{d.judul}</h2>
        </div>
        <FotoPilih
          lang={lang}
          foto={fotoTampil}
          label={t.fotoDivisi}
          nama={`divisi-${d.kunci}`}
          ratio="16 / 9"
          onFoto={(f) => setDraf({ ...draf, foto: f })}
          onHapus={() => setDraf({ ...draf, foto: null })}
        />
        <TriField
          lang={lang}
          label={t.baris}
          value={draf.baris}
          onChange={(v) => setDraf({ ...draf, baris: v })}
          maks={TEKS_MAKS.baris}
          tried={tried}
        />
        <TriField
          lang={lang}
          label={t.deskripsi}
          value={draf.deskripsi}
          onChange={(v) => setDraf({ ...draf, deskripsi: v })}
          maks={TEKS_MAKS.deskripsi}
          long
          tried={tried}
        />
        <div className="stack stack--sm">
          <span className="field__label">{t.anggota}</span>
          <span className="hint">{t.anggotaHint}</span>
          <Anggota lang={lang} list={d.anggota} warna={d.warna} muat={muat} />
        </div>
        {nonaktifDi.length > 0 && <Nonaktif lang={lang} list={nonaktifDi} muat={muat} />}
        <div className="pl-edfoot">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!ubah || busy}
            onClick={() => {
              setDraf(darDivisi(d));
              setTried(false);
            }}
          >
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!ubah || busy}
            data-loading={busy ? "yes" : undefined}
            onClick={simpan}
          >
            {t.simpan}
          </button>
        </div>
      </div>

      <Confirm
        open={tunda !== null}
        onOpenChange={(o) => !o && setTunda(null)}
        title={t.buangJudul}
        body={t.buangIsi}
        confirmLabel={t.buang}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() => {
          if (tunda) setSel(tunda);
          setTunda(null);
        }}
      />
    </div>
  );
}
