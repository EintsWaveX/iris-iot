/**
 * Penilaian › grading one Praktikan's TP (mockup a13-grader): the group's
 * members, their PDF (from R2, through IRIS), and Per Soal beside it with only
 * the questions that NIM answers. Each question scores 0, ½ or Penuh in one
 * press or any value in the box; the ring adds up live, out of 100, and a
 * complete TP goes into the session's TP column. J and K move between
 * Praktikan. Three columns from 1280, two at tablet, Berkas and Per Soal
 * tabs on a phone.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  CalendarPlusIcon,
  ChatTextIcon,
  ClockIcon,
  CopyIcon,
  FileIcon,
  HourglassIcon,
  LockSimpleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import { PillGanti } from "../ui/PillGanti";
import TabLine from "../ui/TabLine";
import IconButton from "../ui/IconButton";
import BackButton from "../ui/BackButton";
import PdfViewer from "../ui/PdfViewer";
import PerpanjangDialog from "./PerpanjangDialog";
import PesanDialog from "./PesanDialog";
import { KS } from "./kabarStrings";
import { hakPenuh } from "../../lib/hak";
import Fade from "../ui/Fade";
import { ProgressRing, StateView } from "../ui/Display";
import { Switch } from "../ui/Controls";
import { getJson, postJson, useMe } from "../../lib/app";
import { useMinWidth, usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel } from "../../lib/labels";
import { bahasaKelas, pisahJawaban, poinNomor, totalTp } from "../../lib/tp";
import { TPS } from "../tp/tpStrings";
import {
  KunciBox,
  inisial,
  kunciDari,
  soalDari,
  usePaket,
  waktuPanjang,
  type PaketData,
} from "../tp/shared";
import type { DetailPraktikan, GrupDinilai } from "./types";
import "../console/console.css";

type Skor = Record<number, { skor: number | null; catatan: string | null }>;

export default function Grader({
  lang,
  modul,
  grup,
  awal,
  onBack,
  onChanged,
}: {
  lang: Lang;
  modul: number;
  grup: GrupDinilai;
  awal: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const t = TPS[lang];
  const [i, setI] = useState(Math.min(awal, Math.max(0, grup.anggota.length - 1)));
  const m = grup.anggota[i];
  const sedang = useMinWidth(820);
  const [ptab, setPtab] = useState<"berkas" | "soal">("berkas");
  // The final set and its keys, once for the whole group.
  const paket = usePaket(modul).data?.paket ?? null;
  const poll = usePoll(
    () =>
      getJson<DetailPraktikan>(
        `/api/tp/praktikan?modul=${modul}&nim=${encodeURIComponent(m.nim)}`,
      ).then((d) => (d.ok ? d : null)),
    60_000,
    !!m,
    ["tp"],
    0,
    `${modul}:${m?.nim}`,
  );
  const d = poll.data && poll.data.nim === m?.nim ? poll.data : null;
  // Kirim Pesan: whoever grades this TP, the TP right and Admins.
  const me = useMe();
  const bolehKabar =
    me?.hak?.tp === true || (!!me?.tier && hakPenuh({ tier: me.tier, badges: me.badges ?? [] }));
  const [pesan, setPesan] = useState(false);

  const go = (step: number) => {
    const n = grup.anggota.length;
    if (!n) return;
    setI((x) => (x + step + n) % n);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (el?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        go(1);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  // The rail keeps the picked one in view when it scrolls sideways.
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = rail.current;
    const el = r?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (r && el && r.scrollWidth > r.clientWidth)
      r.scrollTo({ left: el.offsetLeft - r.offsetLeft - 8 });
  }, [i]);

  if (!m) return null;
  const railEl = (
    <div className="grader__bar">
      <IconButton icon={CaretLeftIcon} label={t.praktikanSebelum} onClick={() => go(-1)} />
      <div className="grader__rail" role="tablist" aria-label={t.anggota} ref={rail}>
        {grup.anggota.map((a, j) => (
          <button
            key={a.nim}
            type="button"
            role="tab"
            aria-selected={j === i}
            className="grader__m"
            onClick={() => setI(j)}
          >
            <span className="tpmem__av" aria-hidden="true">
              {inisial(a.nama)}
            </span>
            <span className="stack">
              <b className="tpmem__n">{a.nama}</b>
              <span className="hint">
                {t.status[a.status]}
                {a.status === "nilai" && a.total != null ? ` · ${a.total}` : ""}
              </span>
            </span>
          </button>
        ))}
      </div>
      <IconButton icon={CaretRightIcon} label={t.praktikanBerikut} onClick={() => go(1)} />
    </div>
  );

  const isi = d ? (
    <Isi
      key={d.nim}
      lang={lang}
      modul={modul}
      paket={paket}
      d={d}
      sedang={sedang}
      ptab={ptab}
      setPtab={setPtab}
      go={go}
      onSaved={() => {
        poll.refresh();
        onChanged();
      }}
    />
  ) : (
    <span className="skeleton" style={{ height: 520 }} />
  );

  return (
    <div
      className="grader"
      style={
        { "--g": `var(--group-${((((grup.nomor ?? 1) || 1) - 1) % 10) + 1})` } as CSSProperties
      }
    >
      <div className="grader__top">
        <BackButton lang={lang} label={t.penilaian} onClick={onBack} />
        <div className="row grader__title">
          <Pill modul={modul}>TP {modulLabel(modul, lang)}</Pill>
          {grup.nomor ? (
            <Pill group={grup.nomor}>{kelompokLabel(grup.nomor, lang)}</Pill>
          ) : (
            <Pill>{t.tanpaKelompokH}</Pill>
          )}
          {grup.klp && <Pill mono>KLP {grup.klp}</Pill>}
          {grup.ganti && <PillGanti ganti={grup.ganti} lang={lang} />}
          {(d?.boleh || bolehKabar) && (
            <button
              type="button"
              className="btn btn--ghost btn--sm grader__pesan"
              onClick={() => setPesan(true)}
            >
              <ChatTextIcon size={16} aria-hidden="true" />
              {KS[lang].pesanBtn}
            </button>
          )}
        </div>
        {pesan && (
          <PesanDialog
            open
            onOpenChange={setPesan}
            lang={lang}
            modul={modul}
            nim={m.nim}
            nama={m.nama}
          />
        )}
      </div>
      {railEl}
      {sedang ? <div className="grader__grid">{isi}</div> : isi}
    </div>
  );
}

function Isi({
  lang,
  modul,
  paket,
  d,
  sedang,
  ptab,
  setPtab,
  go,
  onSaved,
}: {
  lang: Lang;
  modul: number;
  paket: PaketData["paket"] | null;
  d: DetailPraktikan;
  sedang: boolean;
  ptab: "berkas" | "soal";
  setPtab: (v: "berkas" | "soal") => void;
  go: (step: number) => void;
  onSaved: () => void;
}) {
  const t = TPS[lang];
  const bahasa = bahasaKelas(d.kelas);
  const soal = useMemo(() => (paket ? soalDari(paket, bahasa) : []), [paket, bahasa]);
  const kunci = useMemo(() => (paket ? kunciDari(paket, bahasa) : null), [paket, bahasa]);
  const [skor, setSkor] = useState<Skor>(() =>
    Object.fromEntries(
      Object.entries(d.skor).map(([k, v]) => [Number(k), { skor: v.skor, catatan: v.catatan }]),
    ),
  );
  // Another Asisten's change (live) while nothing is being typed here.
  const sejak = useRef(JSON.stringify(d.skor));
  useEffect(() => {
    const now = JSON.stringify(d.skor);
    if (now === sejak.current) return;
    sejak.current = now;
    setSkor(
      Object.fromEntries(
        Object.entries(d.skor).map(([k, v]) => [Number(k), { skor: v.skor, catatan: v.catatan }]),
      ),
    );
  }, [d.skor]);
  const nomor = d.nomor;
  // Scores another Asisten gave before the Per Modul list changed.
  const lainDari = (no: number) => d.skor[no]?.lain ?? null;
  const lainNo = nomor.filter((no) => lainDari(no) && skor[no]?.skor != null);
  const lainKode = [...new Set(lainNo.map((no) => lainDari(no)!))].join(", ");
  const per = Object.fromEntries(nomor.map((no) => [no, skor[no]?.skor ?? null]));
  const total = totalTp(per, nomor);
  const nDone = nomor.filter((no) => skor[no]?.skor != null).length;
  const [fokus, setFokus] = useState<number | null>(
    () => nomor.find((no) => skor[no]?.skor == null) ?? nomor[0],
  );
  const [semuaKunci, setSemuaKunci] = useState(false);
  const [intip, setIntip] = useState<Record<number, boolean>>({});
  const [berkasI, setBerkasI] = useState(0);
  const [teksPdf, setTeksPdf] = useState<string[] | null>(null);
  const [lompat, setLompat] = useState<{ n: number; kali: number } | undefined>(undefined);
  const jawabanPdf = useMemo(
    () => (teksPdf ? pisahJawaban(teksPdf, nomor) : {}),
    [teksPdf, nomor.join()],
  );

  const k = d.kiriman;
  const berkas = k?.berkas[berkasI];
  const pdf = !!berkas && /pdf/i.test(berkas.mime || berkas.nama);
  const telat = !!k && k.telatMenit !== null;
  const kunciNilai = !d.boleh || (telat && k?.terimaTelat !== true);

  const tulis = async (no: number, ubah: { skor?: number | null; catatan?: string }) => {
    const lama = skor[no] ?? { skor: null, catatan: null };
    const baru = {
      skor: ubah.skor !== undefined ? ubah.skor : lama.skor,
      catatan: ubah.catatan ?? lama.catatan,
    };
    setSkor((s) => ({ ...s, [no]: baru }));
    if (baru.skor === null && ubah.catatan !== undefined) return true; // a note waits for a score
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/tp/nilai", {
      modul,
      nim: d.nim,
      nomor: no,
      skor: baru.skor,
      ...(ubah.catatan !== undefined ? { catatan: ubah.catatan } : {}),
    }).catch(() => ({ ok: false, kode: "" }));
    if (!r.ok) {
      setSkor((s) => ({ ...s, [no]: lama }));
      window.Toast?.show(
        r.kode === "bukan_pemegang"
          ? d.pemegang
            ? t.bukanPemegang
            : t.bukanAdmin
          : r.kode === "telat_belum_diterima"
            ? t.telatBelum
            : t.gagal,
        "warn",
      );
      return false;
    }
    onSaved();
    return true;
  };
  /** Takes the earlier grader's scores as they are, under my name. */
  const setujui = async () => {
    let semua = true;
    for (const no of lainNo) semua = (await tulis(no, { skor: skor[no]!.skor })) && semua;
    if (semua) window.Toast?.show(t.disetujui, "ok");
  };
  const loncat = (no: number) => {
    setFokus(no);
    const h = jawabanPdf[no]?.halaman;
    if (h) setLompat({ n: h, kali: Date.now() });
    if (!sedang) setPtab("berkas");
  };

  const [pjBuka, setPjBuka] = useState(false);
  const aksi = async (url: string, body: Record<string, unknown>, ok?: string) => {
    const r = await postJson<{ ok: boolean; kode?: string }>(url, {
      modul,
      nim: d.nim,
      ...body,
    }).catch(() => ({
      ok: false,
      kode: "",
    }));
    if (!r.ok)
      return window.Toast?.show(
        r.kode === "bukan_pemegang" ? (d.pemegang ? t.bukanPemegang : t.bukanAdmin) : t.gagal,
        "warn",
      );
    if (ok) window.Toast?.show(ok, "ok");
    onSaved();
  };

  /* ------------------------------------------------------------ viewer */
  const viewer = (
    <div className="grader__view">
      {d.tpSeelabs != null && (
        <div className="banner">
          <CopyIcon size={20} aria-hidden="true" />
          <span className="grow">{t.tpSeelabs(d.tpSeelabs)}</span>
        </div>
      )}
      {k?.tanda === "kosong" ? (
        <section className="panel">
          <StateView
            tone="danger"
            icon={<XIcon size={28} />}
            title={t.ditandaiH}
            actions={
              d.boleh && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void aksi("/api/tp/tanda", { kosong: false })}
                >
                  {t.batalTanda}
                </button>
              )
            }
          />
        </section>
      ) : !k || !k.berkas.length ? (
        <section className="panel">
          <PerpanjangDialog
            open={pjBuka}
            onOpenChange={setPjBuka}
            lang={lang}
            modul={modul}
            nim={d.nim}
            nama={d.nama}
            ada={d.perpanjang ?? null}
            onSaved={onSaved}
          />
          {d.perpanjang && (
            <div className="banner grader__pj">
              <CalendarPlusIcon size={20} aria-hidden="true" />
              <span className="grow">
                {t.perpanjangAktif(waktuPanjang(d.perpanjang.sampai, lang))}
                {d.perpanjang.alasan ? ` · ${d.perpanjang.alasan}` : ""}
              </span>
              {d.boleh && (
                <button type="button" className="btn btn--sm" onClick={() => setPjBuka(true)}>
                  {t.ubahPerpanjang}
                </button>
              )}
            </div>
          )}
          <StateView
            icon={<HourglassIcon size={28} />}
            title={t.belumBerkas}
            body={t.belumBerkasBody(d.nama.split(" ")[0] ?? d.nama, d.keadaan === "tutup")}
            actions={
              d.boleh &&
              d.keadaan === "tutup" && (
                <>
                  {!d.perpanjang && (
                    <button type="button" className="btn" onClick={() => setPjBuka(true)}>
                      {t.beriPerpanjang}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => void aksi("/api/tp/tanda", { kosong: true }, t.ditandaiKosong)}
                  >
                    {t.tandaiKosong}
                  </button>
                </>
              )
            }
          />
        </section>
      ) : (
        <>
          {k?.perpanjangan && (
            <div className="banner">
              <CalendarPlusIcon size={20} aria-hidden="true" />
              <span className="grow">
                {t.panjangBanner(
                  waktuPanjang(k.dikirimPada!, lang),
                  waktuPanjang(k.perpanjangan, lang),
                )}
              </span>
            </div>
          )}
          {telat && (
            <div
              className={`banner ${k.terimaTelat === false ? "banner--danger" : "banner--warn"}`}
            >
              <ClockIcon size={20} aria-hidden="true" />
              <span className="grow">
                {t.telatBanner(waktuPanjang(k.dikirimPada!, lang), t.telatMenit(k.telatMenit!))}{" "}
                {k.terimaTelat === null && t.telatPutuskan}
                {k.terimaTelat === false && t.telatTolak}
              </span>
              {d.boleh && (
                <>
                  <Switch
                    on={k.terimaTelat === true}
                    onChange={(v) => void aksi("/api/tp/telat", { terima: v })}
                    label={t.terimaLabel}
                  />
                  <span className="label-caps">{t.terima}</span>
                  {k.terimaTelat === null && (
                    <button
                      type="button"
                      className="btn btn--sm btn--danger-soft"
                      onClick={() => void aksi("/api/tp/telat", { terima: false })}
                    >
                      {t.tolakTelat}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {k.berkas.length > 1 && (
            <div className="row grader__files" role="group" aria-label={t.pilihBerkas}>
              {k.berkas.map((b) => (
                <Pill key={b.i} pressed={b.i === berkasI} onClick={() => setBerkasI(b.i)}>
                  {b.nama}
                </Pill>
              ))}
            </div>
          )}
          {pdf ? (
            <PdfViewer
              key={`${k.id}-${berkasI}`}
              url={`/api/tp/berkas?id=${k.id}&i=${berkasI}`}
              name={berkas!.nama}
              lang={lang}
              shape="page"
              lompat={lompat}
              onTeks={setTeksPdf}
            />
          ) : (
            <section className="panel">
              <StateView
                icon={<FileIcon size={28} />}
                title={t.bukanPdfH}
                body={t.bukanPdfBody}
                actions={
                  <a className="btn" href={`/api/tp/berkas?id=${k.id}&i=${berkasI}&unduh=1`}>
                    {t.unduh}
                  </a>
                }
              />
            </section>
          )}
        </>
      )}
    </div>
  );

  /* ---------------------------------------------------------- Per Soal */
  const kartu = (no: number) => {
    const q = soal[no - 1];
    const open = fokus === no;
    const v = skor[no]?.skor ?? null;
    const dariPdf = jawabanPdf[no];
    return (
      <div
        key={no}
        className="tpq"
        data-open={open ? "yes" : "no"}
        data-done={v != null ? "yes" : "no"}
      >
        <button
          type="button"
          className="tpq__head"
          aria-expanded={open}
          onClick={() => (open ? setFokus(null) : loncat(no))}
        >
          <span className="tpsoal__no">{no}</span>
          <span className="tpq__t">{q?.teks}</span>
          {lainDari(no) && v != null && <Pill tone="warn">{t.nilaiLainSoal(lainDari(no)!)}</Pill>}
          <span className="tpq__v mono">{v != null ? `${v}/${poinNomor(no)}` : "·"}</span>
        </button>
        {open && (
          <div className="tpq__body">
            {q?.bagian && (
              <ol className="tpsoal__parts" type="a">
                {q.bagian.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            )}
            {dariPdf?.teks ? (
              <div className="tpans">
                <div className="row row--between">
                  <span className="label-caps">{t.jawabanPdf}</span>
                  <button
                    type="button"
                    className="tplink"
                    onClick={() => setLompat({ n: dariPdf.halaman, kali: Date.now() })}
                  >
                    {t.halaman(dariPdf.halaman)}
                  </button>
                </div>
                <p>{dariPdf.teks}</p>
              </div>
            ) : pdf ? (
              <div className="tpans tpans--none">
                <span className="hint">{t.tanpaTeks}</span>
                {dariPdf && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setLompat({ n: dariPdf.halaman, kali: Date.now() })}
                  >
                    {t.lihatHalaman(dariPdf.halaman)}
                  </button>
                )}
              </div>
            ) : null}
            {semuaKunci || intip[no] ? (
              <KunciBox k={kunci?.[no - 1] ?? null} lang={lang} />
            ) : (
              <button
                type="button"
                className="tplink"
                onClick={() => setIntip({ ...intip, [no]: true })}
              >
                {t.intipKunci}
              </button>
            )}
            <div className="tpscore" role="group" aria-label={t.nilaiNo(no)}>
              {(
                [
                  [0, "0"],
                  [poinNomor(no) / 2, t.setengah],
                  [poinNomor(no), t.penuh],
                ] as const
              ).map(([x, l]) => (
                <Pill
                  key={l}
                  pressed={v === x}
                  // Pressing the chip that is on again takes the score back (empty).
                  onClick={
                    kunciNilai ? undefined : () => void tulis(no, { skor: v === x ? null : x })
                  }
                >
                  {l}
                </Pill>
              ))}
              <NilaiBebas
                nilai={v}
                maks={poinNomor(no)}
                off={kunciNilai}
                label={t.nilaiBebas}
                onSet={(x) => void tulis(no, { skor: x })}
              />
              <span className="hint">/ {poinNomor(no)}</span>
            </div>
            <CatatanField
              awal={skor[no]?.catatan ?? ""}
              off={kunciNilai}
              placeholder={t.catatanPlaceholder}
              label={t.catatan}
              onSave={(c) => void tulis(no, { catatan: c })}
            />
          </div>
        )}
      </div>
    );
  };

  const panel = (
    <section className="panel grader__soal">
      <div className="grader__sum">
        <ProgressRing
          value={nDone}
          max={nomor.length}
          label={`${nDone}/${nomor.length}`}
          color="var(--ok)"
        />
        <div className="stack stack--sm grow">
          {nDone === nomor.length ? (
            <>
              <b>{t.tpTotal(total ?? 0)}</b>
              <span className="hint">{t.semuaSudah}</span>
            </>
          ) : (
            <>
              <b>{t.dinilaiDari(nDone, nomor.length)}</b>
              <span className="hint">{t.sementara(total ?? 0)}</span>
            </>
          )}
        </div>
        <Switch on={semuaKunci} onChange={setSemuaKunci} label={t.semuaKunci} />
        <span className="label-caps">{t.kunci}</span>
      </div>
      {!d.boleh && (
        <div className="banner">
          <LockSimpleIcon size={20} aria-hidden="true" />
          <span>{d.pemegang ? t.hanyaLihat(d.pemegangKode ?? d.pemegang) : t.hanyaLihatAdmin}</span>
        </div>
      )}
      {d.boleh && lainNo.length > 0 && (
        <div className="banner banner--warn">
          <WarningIcon size={20} aria-hidden="true" />
          <span className="grow">{t.nilaiLainBanner(lainKode)}</span>
          <button type="button" className="btn btn--sm" onClick={() => void setujui()}>
            {t.setujuiNilai}
          </button>
        </div>
      )}
      <div className="grader__qs">{nomor.map(kartu)}</div>
      <div className="grader__foot">
        <span className="hint">{t.graderFoot}</span>
        <div className="grader__btns">
          <button type="button" className="btn btn--ghost" onClick={() => go(-1)}>
            <CaretLeftIcon size={16} weight="bold" className="btn__back" aria-hidden="true" />
            {t.sebelumnya}
          </button>
          <button
            type="button"
            className="btn btn--nilai"
            data-st={nDone >= nomor.length ? "sent" : "todo"}
            onClick={() => {
              if (nDone) window.Toast?.show(t.tersimpanNama(d.nama), "ok");
              go(1);
            }}
          >
            {nDone >= nomor.length ? t.simpanLanjutSudah : t.simpanLanjut}
          </button>
        </div>
      </div>
    </section>
  );

  if (sedang)
    return (
      <>
        {viewer}
        {panel}
      </>
    );
  return (
    <div className="stack">
      <TabLine
        seg
        value={ptab}
        onChange={setPtab}
        label={t.tampilan}
        tabs={[
          { v: "berkas", label: t.tabBerkas },
          { v: "soal", label: t.tabPerSoal(nDone, nomor.length) },
        ]}
      />
      <Fade k={ptab}>{ptab === "berkas" ? viewer : panel}</Fade>
    </div>
  );
}

function NilaiBebas({
  nilai,
  maks,
  off,
  label,
  onSet,
}: {
  nilai: number | null;
  maks: number;
  off: boolean;
  label: string;
  onSet: (v: number | null) => void;
}) {
  const [v, setV] = useState(nilai == null ? "" : String(nilai));
  useEffect(() => setV(nilai == null ? "" : String(nilai)), [nilai]);
  const simpan = () => {
    const s = v.trim().replace(",", ".");
    if (s === "") return nilai != null && onSet(null);
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > maks) return setV(nilai == null ? "" : String(nilai));
    if (n !== nilai) onSet(Math.round(n * 10) / 10);
  };
  return (
    <input
      className="field__input mono tpscore__in"
      inputMode="decimal"
      aria-label={label}
      disabled={off}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={simpan}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

function CatatanField({
  awal,
  off,
  placeholder,
  label,
  onSave,
}: {
  awal: string;
  off: boolean;
  placeholder: string;
  label: string;
  onSave: (c: string) => void;
}) {
  const [v, setV] = useState(awal);
  useEffect(() => setV(awal), [awal]);
  return (
    <input
      className="field__input"
      disabled={off}
      placeholder={placeholder}
      aria-label={label}
      maxLength={500}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== (awal ?? "").trim() && onSave(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
