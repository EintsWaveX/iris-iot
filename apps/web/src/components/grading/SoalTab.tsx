/**
 * Penilaian › Soal TP (2026-10-12): each module's TP bank and its paper.
 * All Asisten see it and download from it; the jadwal
 * or kode right edits it (Kepala Divisi, Inti, the ASO division).
 *
 * Left, the editor: the module's variants (Module 4 starts with LoRaWAN and
 * Peer to Peer, up to five), each with the ten questions in Bahasa
 * Indonesia, English and Mandarin (Beta): question, parts, answer key in
 * light markup with diagrams. One Simpan saves the lot; a newer save by
 * someone else is caught and offered to compare. Right: the final set, each
 * number drawn at random from the variants (Acak Ulang draws again, a
 * number can be picked by hand), the formal PDF in any of the three
 * languages with a preview (Praktikan read the set in IRIS; 2026-10-21 the
 * LMS upload checklist left with the LMS). Two tabs at every width
 * (2026-10-14): Editor Soal, and the rest (Soal Akhir beside the PDF where
 * there's room).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

/** Mandarin's name with the Beta badge, for a language switch. */
const zhBeta = (nama: string): ReactNode => (
  <>
    {nama} <BetaBadge />
  </>
);
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  InfoIcon,
  PlusIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import TabLine from "../ui/TabLine";
import Fade from "../ui/Fade";
import { useMinWidth } from "../../lib/hooks";
import BetaBadge from "../ui/BetaBadge";
import IconButton from "../ui/IconButton";
import Confirm from "../ui/Confirm";
import Dialog from "../ui/Dialog";
import Drawer from "../ui/Drawer";
import PdfViewer from "../ui/PdfViewer";
import { FileDrop, Switch } from "../ui/Controls";
import { MODUL_NAMA, postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import {
  BAHASA_TP,
  KODE_VARIAN,
  MAKS_VARIAN,
  TP_NOMOR,
  acakPilih,
  isiSoal,
  nomorBeda,
  soalAkhir,
  tampilSoal,
  type BahasaTp,
  type SoalTp,
  type VarianTp,
} from "../../lib/tp";
import { buatPdfTp, namaBerkasTp, unduhPdfTp, type TpPdfIsi } from "../../lib/tp-pdf";
import { TPS } from "../tp/tpStrings";
import {
  SasaranPill,
  TeksTp,
  modulStyle,
  usePaket,
  waktuPanjang,
  type PaketData,
} from "../tp/shared";
// The module picker (.modpick); on its own page since Kelola TP (2026-10-21).
import "../console/console.css";

type Paket = PaketData["paket"];
interface Draf {
  varian: VarianTp[];
  pilih: number[];
  petunjuk: Record<BahasaTp, string>;
}

const drafDari = (p: Paket): Draf => ({
  varian: p.varian,
  pilih: p.pilih,
  petunjuk: p.petunjuk,
});
const jsonDraf = (d: Draf) => JSON.stringify(d);

/** A picked image, made small enough for the bank (about 1200 px wide). */
async function gambarDariBerkas(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1200 / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const png = c.toDataURL("image/png");
  return png.length < 850_000 ? png : c.toDataURL("image/jpeg", 0.85);
}

export default function SoalTab({
  lang,
  modul,
  setModul,
}: {
  lang: Lang;
  modul: number;
  setModul: (m: number) => void;
}) {
  const t = TPS[lang];
  const pk = usePaket(modul);
  const data = pk.data && pk.data.paket.modul === modul ? pk.data : null;
  const [draf, setDraf] = useState<Draf | null>(null);
  const [dasar, setDasar] = useState<{ modul: number; versi: number; json: string } | null>(null);
  const [vi, setVi] = useState(0);
  const [bahasa, setBahasa] = useState<BahasaTp>(
    lang === "en" ? "en" : lang === "zh" ? "zh" : "id",
  );
  const [kunciOn, setKunciOn] = useState(true);
  const sm = !useMinWidth(520);
  const [mtab, setMtab] = useState<"ubah" | "hasil">("ubah");
  const [sibuk, setSibuk] = useState(false);
  const [tanya, setTanya] = useState<null | {
    judul: string;
    isi: string;
    ok: string;
    jalan: () => Promise<void> | void;
  }>(null);
  const [bentrok, setBentrok] = useState<Paket | null>(null);
  const [hapusV, setHapusV] = useState<number | null>(null);
  const [kembali, setKembali] = useState(false);
  const [pindah, setPindah] = useState<number | null>(null);

  const kotor = !!draf && !!dasar && jsonDraf(draf) !== dasar.json;

  // Take the server's bank when there is nothing of mine to lose.
  useEffect(() => {
    if (!data) return;
    const p = data.paket;
    if (!draf || !dasar || dasar.modul !== modul || (!kotor && dasar.versi !== p.versi)) {
      const d = drafDari(p);
      setDraf(d);
      setDasar({ modul, versi: p.versi, json: jsonDraf(d) });
      setVi((x) => Math.min(x, p.varian.length - 1));
    }
  }, [data, modul]);

  const ambil = (p: Paket) => {
    const d = drafDari(p);
    setDraf(d);
    setDasar({ modul, versi: p.versi, json: jsonDraf(d) });
    setVi((x) => Math.min(x, p.varian.length - 1));
  };

  const beda = useMemo(() => (draf ? nomorBeda(draf.varian) : []), [draf]);
  if (!data || !draf || !dasar || dasar.modul !== modul)
    return (
      <div className="stack stack--lg">
        <ModulPick lang={lang} modul={modul} pilih={(m) => setModul(m)} />
        <span className="skeleton" style={{ height: 520 }} />
      </div>
    );

  const boleh = data.bolehUbah;
  const dibuka = data.keadaan === "buka" || data.keadaan === "tutup";
  const v = draf.varian[vi] ?? draf.varian[0];
  const baruDiServer = kotor && data.paket.versi !== dasar.versi;

  /* --------------------------------------------------------- the edits */
  const ubahSoal = (no: number, f: (s: SoalTp) => SoalTp) =>
    setDraf({
      ...draf,
      varian: draf.varian.map((x, i) =>
        i === vi ? { ...x, soal: x.soal.map((s, j) => (j === no - 1 ? f(s) : s)) } : x,
      ),
    });
  const ubahIsi = (no: number, ubah: Partial<SoalTp[BahasaTp]>) =>
    ubahSoal(no, (s) => ({ ...s, [bahasa]: { ...s[bahasa], ...ubah } }));
  const tambahVarian = () => {
    if (draf.varian.length >= MAKS_VARIAN) return;
    const salin: VarianTp = JSON.parse(JSON.stringify(v));
    const baru = { ...salin, kode: KODE_VARIAN[draf.varian.length], nama: "" };
    setDraf({ ...draf, varian: [...draf.varian, baru] });
    setVi(draf.varian.length);
  };
  const buangVarian = (i: number) => {
    const varian = draf.varian
      .filter((_, j) => j !== i)
      .map((x, j) => ({ ...x, kode: KODE_VARIAN[j] }));
    const pilih = draf.pilih.map((x) => (x === i ? 0 : x > i ? x - 1 : x));
    setDraf({ ...draf, varian, pilih });
    setVi(0);
  };

  /** Runs `jalan`, first asking when Praktikan have already seen the set. */
  const jagaDibuka = (jalan: () => Promise<void> | void) => {
    if (!dibuka) return void jalan();
    setTanya({ judul: t.sudahDibukaH, isi: t.sudahDibukaBody, ok: t.tetapUbah, jalan });
  };

  const kirim = async (versi: number) => {
    // Indonesian and English are the papers that count; both must be there.
    for (const x of draf.varian)
      for (const [j, s] of x.soal.entries())
        for (const b of ["id", "en"] as const)
          if (!s[b].teks.trim()) {
            setVi(draf.varian.indexOf(x));
            setBahasa(b);
            window.Toast?.show(t.wajibIsi(j + 1, t.bahasaNama[b]), "warn");
            return;
          }
    setSibuk(true);
    const r = await postJson<{ ok: boolean; versi?: number; kode?: string; terbaru?: Paket }>(
      "/api/tp/paket",
      { modul, versi, ...draf },
    ).catch(() => ({ ok: false, kode: "" }) as { ok: false; kode: string; terbaru?: Paket });
    setSibuk(false);
    if (r.ok && r.versi !== undefined) {
      setDasar({ modul, versi: r.versi, json: jsonDraf(draf) });
      window.Toast?.show(t.disimpan, "ok");
      pk.refresh();
      return;
    }
    if (r.kode === "versi_berubah" && r.terbaru) return setBentrok(r.terbaru);
    window.Toast?.show(r.kode === "tidak_berhak" ? t.hanyaLihatSoal : t.gagal, "warn");
  };
  const simpan = () => jagaDibuka(() => kirim(dasar.versi));

  const pakaiPilih = (pilih: number[], toast?: string) => {
    if (kotor) {
      setDraf({ ...draf, pilih });
      return;
    }
    jagaDibuka(async () => {
      const lama = draf;
      setDraf({ ...draf, pilih });
      const r = await postJson<{ ok: boolean; versi?: number; kode?: string; terbaru?: Paket }>(
        "/api/tp/pilih",
        { modul, versi: dasar.versi, pilih },
      ).catch(() => ({ ok: false, kode: "" }) as { ok: false; kode: string; terbaru?: Paket });
      if (r.ok && r.versi !== undefined) {
        setDasar({ modul, versi: r.versi, json: jsonDraf({ ...draf, pilih }) });
        if (toast) window.Toast?.show(toast, "ok");
        pk.refresh();
      } else {
        setDraf(lama);
        if (r.kode === "versi_berubah" && r.terbaru) ambil(r.terbaru);
        window.Toast?.show(t.gagal, "warn");
      }
    });
  };
  const acak = () => pakaiPilih(acakPilih(draf.varian, draf.pilih), t.diacak);

  const keBawaan = async () => {
    const r = await postJson<{ ok: boolean }>("/api/tp/bawaan", { modul }).catch(() => ({
      ok: false,
    }));
    if (!r.ok) {
      window.Toast?.show(t.gagal, "warn");
      return false;
    }
    window.Toast?.show(t.dikembalikan, "ok");
    setDraf(null);
    setDasar(null);
    pk.refresh();
  };

  const kosongDi = (b: BahasaTp) => v.soal.filter((s) => !s[b].teks.trim()).length;
  const isiPdf = (b: BahasaTp, kunci: boolean): TpPdfIsi => {
    const akhir = soalAkhir(draf.varian, draf.pilih);
    return {
      modul,
      bahasa: b,
      kelas: b === "en" ? "inter" : b === "id" ? "reguler" : null,
      semester: data.semester,
      jendela: data.jendela,
      petunjuk: draf.petunjuk[b],
      soal: akhir.map((s) => tampilSoal(s, b)),
      ...(kunci
        ? { kunci: akhir.map((s) => ({ teks: isiSoal(s, b).kunci, gambar: s.gambar })) }
        : {}),
    };
  };

  /* ------------------------------------------------------------ the parts */
  const kepala = (
    <div className="panel__head tpbank__head">
      <div className="stack stack--sm">
        <h2 className="panel__title">{t.soalTpH(modul)}</h2>
        <span className="hint">
          {kotor ? (
            <Pill tone="warn">{t.belumDisimpan}</Pill>
          ) : data.paket.bawaan ? (
            t.bawaanBelumDiubah
          ) : (
            t.tersimpanOleh(
              data.paket.diubahOleh?.kode ?? "-",
              data.paket.diubahPada ? waktuPanjang(data.paket.diubahPada, lang) : "",
            )
          )}
        </span>
      </div>
      {boleh && (
        <div className="row tpbank__acts">
          {!data.paket.bawaan && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setKembali(true)}
            >
              <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden="true" />
              {t.kembalikan}
            </button>
          )}
          {kotor && (
            <button type="button" className="btn btn--sm" onClick={() => ambil(data.paket)}>
              {t.batalkan}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!kotor || sibuk}
            onClick={simpan}
          >
            {t.simpan}
          </button>
        </div>
      )}
    </div>
  );

  const editor = (
    <section className="panel tpbank__ed">
      {kepala}
      {!boleh && (
        <div className="banner banner--accent">
          <InfoIcon size={20} aria-hidden="true" />
          <span>{t.hanyaLihatSoal}</span>
        </div>
      )}
      {baruDiServer && (
        <div className="banner banner--warn">
          <WarningIcon size={20} aria-hidden="true" />
          <span className="grow">{t.adaBaru(data.paket.diubahOleh?.kode ?? "-")}</span>
          <button type="button" className="btn btn--sm" onClick={() => ambil(data.paket)}>
            {t.muat}
          </button>
        </div>
      )}

      <div className="tpbank__vbar" role="tablist" aria-label={t.varian}>
        {draf.varian.map((x, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === vi}
            className="tpbank__v"
            onClick={() => setVi(i)}
          >
            <b className="mono">{KODE_VARIAN[i]}</b>
            <span>{x.nama || t.varianNama(KODE_VARIAN[i], "")}</span>
          </button>
        ))}
        {boleh && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-disabled={draf.varian.length >= MAKS_VARIAN || undefined}
            title={
              draf.varian.length >= MAKS_VARIAN
                ? t.maksVarian(MAKS_VARIAN)
                : t.tambahVarianHint(MAKS_VARIAN)
            }
            onClick={tambahVarian}
          >
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            {t.tambahVarian}
          </button>
        )}
      </div>
      {boleh && (
        <div className="row tpbank__vtools">
          <label className="field grow">
            <span className="field__label">{t.namaVarian}</span>
            <input
              className="field__input"
              value={v.nama}
              maxLength={40}
              placeholder={t.namaVarianPh}
              onChange={(e) =>
                setDraf({
                  ...draf,
                  varian: draf.varian.map((x, i) =>
                    i === vi ? { ...x, nama: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          {draf.varian.length > 1 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHapusV(vi)}>
              {t.hapusVarian}
            </button>
          )}
        </div>
      )}

      <div className="row tpbank__lang">
        <TabLine
          seg
          value={bahasa}
          onChange={setBahasa}
          label={t.bahasa}
          tabs={BAHASA_TP.map((b) => ({
            v: b,
            label: b === "zh" ? zhBeta(t.bahasaNama.zh) : t.bahasaNama[b],
            n: kosongDi(b) || undefined,
          }))}
        />
        <Switch on={kunciOn} onChange={setKunciOn} label={t.tampilkanKunci} showLabel />
      </div>
      {bahasa === "zh" && (
        <div className="banner banner--accent">
          <InfoIcon size={20} aria-hidden="true" />
          <span>
            {t.zhCatatan}
            {kosongDi("zh") ? ` ${t.kosongN(kosongDi("zh"))}.` : ""}
          </span>
        </div>
      )}

      <div className="field">
        <span className="field__label">{t.petunjukH}</span>
        <textarea
          className="field__input"
          rows={Math.min(8, Math.max(3, draf.petunjuk[bahasa].split("\n").length + 1))}
          readOnly={!boleh}
          value={draf.petunjuk[bahasa]}
          onChange={(e) =>
            setDraf({ ...draf, petunjuk: { ...draf.petunjuk, [bahasa]: e.target.value } })
          }
        />
        <span className="hint">{t.petunjukHint}</span>
      </div>

      <ol className="tpbq__list">
        {v.soal.slice(0, TP_NOMOR).map((s, j) => (
          <KartuSoal
            key={`${vi}-${j}`}
            lang={lang}
            no={j + 1}
            s={s}
            bahasa={bahasa}
            beda={beda.includes(j + 1)}
            boleh={boleh}
            kunciOn={kunciOn}
            ubahIsi={(u) => ubahIsi(j + 1, u)}
            ubahGambar={(g) => ubahSoal(j + 1, (x) => ({ ...x, gambar: g.length ? g : undefined }))}
          />
        ))}
      </ol>
    </section>
  );

  const akhir = (
    <Akhir
      lang={lang}
      draf={draf}
      beda={beda}
      bahasa={bahasa}
      boleh={boleh}
      bawaan={data.paket.bawaan}
      onAcak={acak}
      onPilih={(no, i) => pakaiPilih(draf.pilih.map((x, k) => (k === no - 1 ? i : x)))}
    />
  );
  const pdf = (
    <div className="stack stack--lg">
      <Ekspor lang={lang} modul={modul} kotor={kotor} isiPdf={isiPdf} />
    </div>
  );
  const hasil = (
    <div className="tpbank__hasil">
      {akhir}
      {pdf}
    </div>
  );

  return (
    <div className="stack stack--lg tpbank" style={modulStyle(modul)}>
      <ModulPick
        lang={lang}
        modul={modul}
        pilih={(m) => (m === modul ? undefined : kotor ? setPindah(m) : setModul(m))}
      />
      <p className="hint">{t.bankLede}</p>
      <TabLine
        value={mtab}
        onChange={setMtab}
        label={t.bagian}
        tabs={[
          { v: "ubah", label: sm ? t.tabEditorSm : t.tabEditor },
          { v: "hasil", label: sm ? t.tabHasilSm : t.tabHasil },
        ]}
      />
      <Fade k={mtab}>{mtab === "ubah" ? editor : hasil}</Fade>
      {kotor && boleh && mtab !== "ubah" && (
        <div className="tpbank__float">
          <span className="hint grow">{t.belumDisimpan}</span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={sibuk}
            onClick={simpan}
          >
            {t.simpan}
          </button>
        </div>
      )}

      {tanya && (
        <Confirm
          open
          onOpenChange={(o) => !o && setTanya(null)}
          title={tanya.judul}
          body={tanya.isi}
          confirmLabel={tanya.ok}
          cancelLabel={t.batal}
          tone="primary"
          lang={lang}
          onConfirm={async () => {
            const j = tanya.jalan;
            setTanya(null);
            await j();
          }}
        />
      )}
      <Confirm
        open={hapusV !== null}
        onOpenChange={(o) => !o && setHapusV(null)}
        title={t.hapusVarianH(KODE_VARIAN[hapusV ?? 0])}
        body={t.hapusVarianBody}
        confirmLabel={t.hapus}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() => {
          if (hapusV !== null) buangVarian(hapusV);
        }}
      />
      <Confirm
        open={kembali}
        onOpenChange={setKembali}
        title={t.kembalikanH}
        body={t.kembalikanBody}
        confirmLabel={t.kembalikan}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={keBawaan}
      />
      <Confirm
        open={pindah !== null}
        onOpenChange={(o) => !o && setPindah(null)}
        title={t.belumDisimpan}
        body={t.buangBody}
        confirmLabel={t.buang}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() => {
          const m = pindah;
          setPindah(null);
          setDraf(null);
          setDasar(null);
          if (m) setModul(m);
        }}
      />
      <Dialog
        open={!!bentrok}
        onOpenChange={(o) => !o && setBentrok(null)}
        title={t.bentrokH}
        description={t.bentrokBody(bentrok?.diubahOleh?.kode ?? "-")}
        lang={lang}
        size="sm"
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (bentrok) ambil(bentrok);
                setBentrok(null);
              }}
            >
              <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
              {t.muatTerbaru}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={sibuk}
              onClick={() => {
                const b = bentrok;
                setBentrok(null);
                if (b) void kirim(b.versi);
              }}
            >
              {t.timpa}
            </button>
          </>
        }
      />
    </div>
  );
}

/* ================================================================ parts */

function ModulPick({
  lang,
  modul,
  pilih,
}: {
  lang: Lang;
  modul: number;
  pilih: (m: number) => void;
}) {
  const t = TPS[lang];
  return (
    <div className="modpick tpmodpick" role="radiogroup" aria-label={t.pilihModul}>
      {[1, 2, 3, 4].map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={m === modul}
          className="modpick__b"
          style={modulStyle(m)}
          onClick={() => pilih(m)}
        >
          <span className="row">
            <Pill modul={m}>{modulLabel(m, lang)}</Pill>
          </span>
          <span className="hint">{MODUL_NAMA[m]}</span>
        </button>
      ))}
    </div>
  );
}

function KartuSoal({
  lang,
  no,
  s,
  bahasa,
  beda,
  boleh,
  kunciOn,
  ubahIsi,
  ubahGambar,
}: {
  lang: Lang;
  no: number;
  s: SoalTp;
  bahasa: BahasaTp;
  beda: boolean;
  boleh: boolean;
  kunciOn: boolean;
  ubahIsi: (u: Partial<SoalTp[BahasaTp]>) => void;
  ubahGambar: (g: string[]) => void;
}) {
  const t = TPS[lang];
  const x = s[bahasa];
  const [lihat, setLihat] = useState(!boleh);
  const [muat, setMuat] = useState(false);
  const bagian = x.bagian ?? [];
  const gambar = s.gambar ?? [];
  const baris = (v: string, min: number, max: number) =>
    Math.min(max, Math.max(min, v.split("\n").length + 1));
  return (
    <li className="tpbq" data-beda={beda ? "yes" : "no"}>
      <div className="row tpbq__head">
        <span className="tpsoal__no">{no}</span>
        <SasaranPill no={no} lang={lang} />
        {beda ? (
          <Pill tone="accent">{t.bedaVarian}</Pill>
        ) : (
          <span className="hint">{t.samaVarian}</span>
        )}
      </div>
      <label className="field">
        <span className="field__label">{t.teksSoal}</span>
        <textarea
          className="field__input"
          rows={baris(x.teks, 2, 8)}
          readOnly={!boleh}
          value={x.teks}
          aria-label={t.soalNo(no)}
          onChange={(e) => ubahIsi({ teks: e.target.value })}
        />
      </label>
      {(bagian.length > 0 || boleh) && (
        <ol className="tpbq__parts">
          {bagian.map((b, i) => (
            <li key={i}>
              <span className="tpbq__h">{"abcdefgh"[i]}.</span>
              <textarea
                className="field__input"
                rows={baris(b, 1, 6)}
                readOnly={!boleh}
                value={b}
                aria-label={t.bagianNo("abcdefgh"[i])}
                onChange={(e) =>
                  ubahIsi({ bagian: bagian.map((y, k) => (k === i ? e.target.value : y)) })
                }
              />
              {boleh && (
                <IconButton
                  icon={XIcon}
                  label={t.hapusBagian("abcdefgh"[i])}
                  onClick={() => {
                    const sisa = bagian.filter((_, k) => k !== i);
                    ubahIsi({ bagian: sisa.length ? sisa : undefined });
                  }}
                />
              )}
            </li>
          ))}
          {boleh && bagian.length < 8 && (
            <li>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => ubahIsi({ bagian: [...bagian, ""] })}
              >
                <PlusIcon size={16} weight="bold" aria-hidden="true" />
                {t.tambahBagian}
              </button>
            </li>
          )}
        </ol>
      )}
      {kunciOn && (
        <div className="tpbq__key">
          <div className="row row--between">
            <span className="label-caps">{t.kunciSoal}</span>
            {boleh && (
              <TabLine
                seg
                value={lihat ? "lihat" : "tulis"}
                onChange={(v) => setLihat(v === "lihat")}
                label={t.kunciSoal}
                tabs={[
                  { v: "tulis", label: t.tulisKunci },
                  { v: "lihat", label: t.pratinjau },
                ]}
              />
            )}
          </div>
          {lihat ? (
            x.kunci.trim() ? (
              <TeksTp md={x.kunci} gambar={gambar} lang={lang} />
            ) : (
              <p className="hint">{t.kunciKosong}</p>
            )
          ) : (
            <>
              <textarea
                className="field__input tpbq__mono"
                rows={baris(x.kunci, 4, 18)}
                value={x.kunci}
                aria-label={`${t.kunciSoal} ${no}`}
                spellCheck={false}
                onChange={(e) => ubahIsi({ kunci: e.target.value })}
              />
              <span className="hint">{t.kunciHint}</span>
            </>
          )}
          {(gambar.length > 0 || boleh) && (
            <div className="tpbq__imgs">
              {gambar.map((g, i) => (
                <figure key={i} className="tpbq__img">
                  <img src={g} alt={t.gambarNo(i + 1)} />
                  <figcaption className="hint mono">[[gambar {i + 1}]]</figcaption>
                  {boleh && (
                    <IconButton
                      icon={XIcon}
                      label={t.hapusGambar(i + 1)}
                      onClick={() => ubahGambar(gambar.filter((_, k) => k !== i))}
                    />
                  )}
                </figure>
              ))}
              {boleh && gambar.length < 6 && (
                <FileDrop
                  compact
                  lang={lang}
                  accept={["image/png", "image/jpeg"]}
                  kinds="PNG, JPG"
                  maxBytes={4 * 1024 * 1024}
                  busy={muat}
                  onFile={async (f) => {
                    setMuat(true);
                    try {
                      const url = await gambarDariBerkas(f);
                      ubahGambar([...gambar, url]);
                      if (!/\[\[gambar \d+\]\]/.test(x.kunci))
                        ubahIsi({
                          kunci: `${x.kunci.trimEnd()}\n[[gambar ${gambar.length + 1}]]`.trim(),
                        });
                    } catch {
                      window.Toast?.show(t.gambarBesar, "warn");
                    }
                    setMuat(false);
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** A question whole: its lead, then every part. */
function SoalUtuh({ q }: { q: { teks: string; bagian?: string[] } }) {
  return (
    <div className="tpakhir__t">
      <p>{q.teks}</p>
      {!!q.bagian?.length && (
        <ol className="tpsoal__parts" type="a">
          {q.bagian.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Akhir({
  lang,
  draf,
  beda,
  bahasa,
  boleh,
  bawaan,
  onAcak,
  onPilih,
}: {
  lang: Lang;
  draf: Draf;
  beda: number[];
  bahasa: BahasaTp;
  boleh: boolean;
  bawaan: boolean;
  onAcak: () => void;
  onPilih: (no: number, i: number) => void;
}) {
  const t = TPS[lang];
  const banyak = draf.varian.length > 1;
  const akhir = soalAkhir(draf.varian, draf.pilih);
  const belum = banyak && bawaan && draf.pilih.every((x) => x === 0);
  return (
    <section className="panel tpakhir">
      <div className="panel__head">
        <h2 className="panel__title">{t.akhirH}</h2>
        {boleh && banyak && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!beda.length}
            onClick={onAcak}
          >
            {t.acakUlang}
          </button>
        )}
      </div>
      <p className="hint">{!banyak ? t.paketSatu : belum ? t.belumDiacak : t.akhirHint}</p>
      {banyak && (
        <div className="row">
          {draf.varian.map((v, i) => (
            <Pill key={i} tone={i ? undefined : "accent"}>
              {t.varianNama(KODE_VARIAN[i], v.nama)} ·{" "}
              {beda.filter((no) => draf.pilih[no - 1] === i).length}
            </Pill>
          ))}
        </div>
      )}
      <ol className="tpakhir__l">
        {akhir.map((s, i) => {
          const no = i + 1;
          const b = beda.includes(no);
          return (
            <li key={no} data-beda={b ? "yes" : "no"}>
              <span className="tpsoal__no">{no}</span>
              <SoalUtuh q={tampilSoal(s, bahasa)} />
              {banyak &&
                (b && boleh ? (
                  <span className="tpakhir__pick" role="radiogroup" aria-label={t.pilihVarian(no)}>
                    {draf.varian.map((_, k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={draf.pilih[i] === k}
                        className="mono"
                        onClick={() => draf.pilih[i] !== k && onPilih(no, k)}
                      >
                        {KODE_VARIAN[k]}
                      </button>
                    ))}
                  </span>
                ) : b ? (
                  <Pill mono>{KODE_VARIAN[draf.pilih[i]]}</Pill>
                ) : null)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Ekspor({
  lang,
  modul,
  kotor,
  isiPdf,
}: {
  lang: Lang;
  modul: number;
  kotor: boolean;
  isiPdf: (b: BahasaTp, kunci: boolean) => TpPdfIsi;
}) {
  const t = TPS[lang];
  const [b, setB] = useState<BahasaTp>(lang === "en" ? "en" : lang === "zh" ? "zh" : "id");
  const [jalan, setJalan] = useState<null | "soal" | "kunci" | "lihat">(null);
  const [lihat, setLihat] = useState<{ url: string; data: Uint8Array; nama: string } | null>(null);
  useEffect(
    () => () => {
      if (lihat) URL.revokeObjectURL(lihat.url);
    },
    [lihat],
  );
  const unduh = async (kunci: boolean) => {
    setJalan(kunci ? "kunci" : "soal");
    try {
      const nama = await unduhPdfTp(isiPdf(b, kunci));
      window.Toast?.show(t.pdfDiunduh(nama), "ok");
    } catch {
      window.Toast?.show(t.pdfGagal, "warn");
    }
    setJalan(null);
  };
  const pratinjau = async () => {
    setJalan("lihat");
    try {
      const isi = isiPdf(b, false);
      const data = await buatPdfTp(isi);
      const url = URL.createObjectURL(
        new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      );
      setLihat({ url, data, nama: namaBerkasTp(isi) });
    } catch {
      window.Toast?.show(t.pdfGagal, "warn");
    }
    setJalan(null);
  };
  return (
    <section className="panel tpbank__pdf">
      <h2 className="panel__title">{t.eksporH}</h2>
      <TabLine
        seg
        value={b}
        onChange={setB}
        label={t.bahasaPdf}
        tabs={BAHASA_TP.map((x) => ({
          v: x,
          label: x === "zh" ? zhBeta(t.bahasaPendek.zh) : t.bahasaPendek[x],
        }))}
      />
      {kotor && <p className="hint">{t.pdfBerubah}</p>}
      <div className="tpbank__pdfbtns">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!!jalan}
          onClick={() => void unduh(false)}
        >
          {jalan === "soal" ? t.membuatPdf : t.pdfSoal}
        </button>
        <button type="button" className="btn" disabled={!!jalan} onClick={() => void pratinjau()}>
          {jalan === "lihat" ? t.membuatPdf : t.lihatPdf}
        </button>
      </div>
      <div className="tpbank__kunci">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!!jalan}
          onClick={() => void unduh(true)}
        >
          <DownloadSimpleIcon size={16} weight="bold" aria-hidden="true" />
          {jalan === "kunci" ? t.membuatPdf : t.pdfKunci}
        </button>
        <span className="hint">{t.pdfKunciHint}</span>
      </div>
      {lihat && (
        <Drawer
          open
          onOpenChange={(o) => !o && setLihat(null)}
          title={t.pratinjauH(modul)}
          description={lihat.nama}
          storeKey="tp-pdf"
          minWidth={480}
          closeLabel={t.tutup}
          resizeLabel={t.tutup}
        >
          <PdfViewer url={lihat.url} data={lihat.data} name={lihat.nama} lang={lang} shape="page" />
        </Drawer>
      )}
    </section>
  );
}
