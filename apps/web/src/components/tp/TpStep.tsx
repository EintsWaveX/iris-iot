/**
 * The module page's TP step (Phase 13, mockups p13-tp and a13-tp), between
 * Ringkasan and the practicum steps, for every signed in Praktikan and
 * Asisten whether or not a session runs: the TP is done the week before.
 *
 * Praktikan: the window as a track with its countdown, the questions they
 * answer by NIM parity (1 and 10 for everyone, 2 to 9 by parity), how to
 * submit in the LMS, and what IRIS sees of their file; once their group's
 * scores are sent, each question's mark. All read only: TP is answered by
 * hand on paper (the lab's rule) and uploaded to the LMS as one PDF.
 *
 * Asisten: the final set's questions with who answers them, the keys behind
 * a switch (off by default, warns about the projector), which variants the
 * set was drawn from with the ways to edit it (Penilaian › Soal TP) and to
 * download its PDF, the window (Kepala Divisi and Inti change it), counts
 * per LMS class, and the way into Penilaian.
 *
 * Both can download the formal question PDF (src/lib/tp-pdf.ts).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  DownloadSimpleIcon,
  EyeIcon,
  FilePdfIcon,
  InfoIcon,
  LockSimpleIcon,
  PencilSimpleIcon,
  PlugsConnectedIcon,
  QuestionIcon,
  WarningIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Drawer from "../ui/Drawer";
import PdfViewer from "../ui/PdfViewer";
import Pill from "../ui/Pill";
import TabLine from "../ui/TabLine";
import BetaBadge from "../ui/BetaBadge";
import { ProgressRing, StateView } from "../ui/Display";
import { DateField, Switch, TimeField } from "../ui/Controls";
import { getJson, href, postJson, useMe } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { unduhPdfTp } from "../../lib/tp-pdf";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import {
  TP_NOMOR,
  TP_POIN,
  bagiWib,
  bahasaKelas,
  jendelaBerikut,
  paritas,
  totalTp,
  type BahasaTp,
  type JendelaTp,
  type KeadaanJendela,
  type KelasTp,
  type PolaJendela,
  type SoalTampil,
} from "../../lib/tp";
import { hariIniWib } from "../../lib/jadwal";
import { TPS } from "./tpStrings";
import {
  Countdown,
  KeadaanPill,
  SoalList,
  StatusPill,
  WinTrack,
  hariJam,
  hariJamPendek,
  judulJendela,
  jam,
  kunciDari,
  modulStyle,
  soalDari,
  ukuran,
  usePaket,
  useTpSaya,
  waktuPanjang,
  type JendelaInfo,
  type TpSayaModul,
} from "./shared";

export default function TpStep({ lang, modul }: { lang: Lang; modul: number }) {
  const me = useMe();
  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (me?.role === "asisten") return <TpAsisten lang={lang} modul={modul} />;
  if (me?.role === "praktikan") return <TpPraktikan lang={lang} modul={modul} nim={me.nim} />;
  return null;
}

/* ============================================================ Praktikan */

function TpPraktikan({ lang, modul, nim }: { lang: Lang; modul: number; nim: string }) {
  const t = TPS[lang];
  const poll = useTpSaya(true, modul);
  const d = poll.data;
  const [lihat, setLihat] = useState(false);
  if (!d) {
    if (poll.errors >= 2)
      return (
        <StateView
          tone="danger"
          icon={<WarningIcon size={28} />}
          title={t.gagalMuat}
          actions={
            <button type="button" className="btn btn--primary" onClick={poll.refresh}>
              {t.coba}
            </button>
          }
        />
      );
    return <span className="skeleton" style={{ height: 420 }} />;
  }
  const m = d.modul[0];
  return (
    <div className="tpgrid">
      <div className="tpgrid__hero">
        <Hero lang={lang} modul={modul} j={m.jendela} k={m.keadaan} />
      </div>
      <div className="stack stack--lg tpgrid__main">
        {m.keadaan === "belum" ? (
          <section className="panel">
            <StateView
              icon={<LockSimpleIcon size={28} />}
              title={t.soalTersembunyi}
              body={t.soalTersembunyiBody(hariJam(m.jendela!.buka, lang))}
            />
          </section>
        ) : (
          <SoalPraktikan
            lang={lang}
            modul={modul}
            nim={nim}
            nomor={d.nomor}
            soal={d.soal ?? []}
            soalZh={d.soalZh}
            kelas={d.kelas}
            semester={d.semester}
            jendela={m.jendela}
            petunjuk={d.petunjuk?.[bahasaKelas(d.kelas)] ?? ""}
          />
        )}
      </div>
      <div className="stack stack--lg tpgrid__side">
        <Milikku
          lang={lang}
          m={m}
          nomor={d.nomor}
          terakhir={d.sinkron.terakhir}
          onLihat={() => setLihat(true)}
        />
        <Cara lang={lang} modul={modul} m={m} kursus={d.kursus} />
        <div className="panel panel--tight tphelp">
          <QuestionIcon size={20} aria-hidden="true" />
          <p className="hint">{t.bantuan}</p>
        </div>
      </div>
      {m.kirimanId !== null && m.berkas[0] && (
        <Drawer
          open={lihat}
          onOpenChange={setLihat}
          title={t.berkasmu}
          description={t.dariLms}
          storeKey="tp-berkas"
          minWidth={420}
          closeLabel={t.tutup}
          resizeLabel={t.tutup}
        >
          <PdfViewer
            url={`/api/tp/berkas?id=${m.kirimanId}&i=0`}
            name={m.berkas[0].nama}
            lang={lang}
            shape="page"
          />
        </Drawer>
      )}
    </div>
  );
}

function Hero({
  lang,
  modul,
  j,
  k,
  children,
}: {
  lang: Lang;
  modul: number;
  j: JendelaInfo | null;
  k: KeadaanJendela | null;
  children?: ReactNode;
}) {
  const t = TPS[lang];
  return (
    <section className="panel panel--raised panel--key tphero" style={modulStyle(modul)}>
      <div className="row">
        <Pill modul={modul}>
          {t.tp} · {modulLabel(modul, lang)}
        </Pill>
        <KeadaanPill k={k} lang={lang} />
      </div>
      <h2 className="tphero__h">{judulJendela(k, j, lang)}</h2>
      {j && k !== "tutup" && (
        <div className="tphero__left">
          <span className="label-caps">{k === "buka" ? t.tutupDalam : t.bukaDalam}</span>
          <Countdown to={k === "buka" ? j.tutup : j.buka} lang={lang} />
        </div>
      )}
      {j ? <WinTrack j={j} lang={lang} /> : <p className="hint">{t.heroNoneBody}</p>}
      {j && (
        <span className="hint">
          {t.sampai(waktuPanjang(j.buka, lang), waktuPanjang(j.tutup, lang))}
          {j.sumber === "lms" && ` · ${t.jendelaLms}`}
        </span>
      )}
      {children}
    </section>
  );
}

/** The questions, read only: TP is answered by hand on paper (the lab's
 *  rule), scanned to one PDF and uploaded to the LMS. */
function SoalPraktikan({
  lang,
  modul,
  nim,
  nomor,
  soal,
  soalZh,
  kelas,
  semester,
  jendela,
  petunjuk,
}: {
  lang: Lang;
  modul: number;
  nim: string;
  nomor: number[];
  soal: SoalTampil[];
  soalZh?: SoalTampil[];
  kelas: KelasTp;
  semester: string;
  jendela: JendelaTp | null;
  petunjuk: string;
}) {
  const t = TPS[lang];
  const [show, setShow] = useState<"mine" | "all">("mine");
  const [zh, setZh] = useState(false);
  const adaZh = lang === "zh" && !!soalZh?.length;
  const tampil = zh && adaZh ? soalZh! : soal;
  const [pdfJalan, setPdfJalan] = useState(false);
  const unduhSoal = async () => {
    setPdfJalan(true);
    try {
      const nama = await unduhPdfTp({
        modul,
        bahasa: bahasaKelas(kelas),
        kelas,
        semester,
        jendela,
        petunjuk,
        soal,
      });
      window.Toast?.show(t.pdfDiunduh(nama), "ok");
    } catch {
      window.Toast?.show(t.pdfGagal, "warn");
    }
    setPdfJalan(false);
  };
  return (
    <section className="panel">
      <div className="panel__head tpsoalhead">
        <h2 className="panel__title">{t.soalH}</h2>
        <TabLine
          seg
          value={show}
          onChange={setShow}
          label={t.tampilkan}
          tabs={[
            { v: "mine", label: t.soalKu(nomor.length) },
            { v: "all", label: t.soalSemua(TP_NOMOR) },
          ]}
        />
      </div>
      <div className="banner banner--accent tpnote">
        <InfoIcon size={20} aria-hidden="true" />
        <span>{t.catatanNim(nim.slice(-1), paritas(nim) === "genap", nomor.length)}</span>
      </div>
      <div className="row tpsoalbar">
        <button
          type="button"
          className="btn btn--sm"
          disabled={pdfJalan || !soal.length}
          onClick={() => void unduhSoal()}
        >
          <DownloadSimpleIcon size={16} aria-hidden="true" />
          {pdfJalan ? t.membuatPdf : t.unduhSoal}
        </button>
        {adaZh && (
          <Switch on={zh} onChange={setZh} label={t.lihatZh} showLabel badge={<BetaBadge />} />
        )}
      </div>
      <SoalList
        soal={tampil}
        lang={lang}
        mine={nomor}
        tampil={show === "mine" ? nomor : undefined}
      />
    </section>
  );
}

function Milikku({
  lang,
  m,
  nomor,
  terakhir,
  onLihat,
}: {
  lang: Lang;
  m: TpSayaModul;
  nomor: number[];
  terakhir: string | null;
  onLihat: () => void;
}) {
  const t = TPS[lang];
  const tutup = m.keadaan === "tutup";
  const st = m.status === "belum" && tutup ? "kosong" : m.status;
  const berkas = m.berkas[0];
  const fileRow = berkas && (
    <div className="tpfile">
      <FilePdfIcon size={22} aria-hidden="true" />
      <div className="stack tpfile__txt">
        <b className="tpfile__n">{berkas.nama}</b>
        <span className="hint">
          {ukuran(berkas.ukuran, lang)}
          {m.dikirimPada &&
            m.diambilPada &&
            ` · ${t.dikirimDiambil(hariJamPendek(m.dikirimPada, lang), jam(m.diambilPada))}`}
        </span>
      </div>
      <button type="button" className="btn btn--sm" onClick={onLihat}>
        <EyeIcon size={16} aria-hidden="true" />
        {t.lihat}
      </button>
    </div>
  );
  let body: ReactNode;
  if (st === "nilai" && m.skor) {
    const per = Object.fromEntries(Object.entries(m.skor).map(([k, v]) => [Number(k), v.skor]));
    const total = m.total ?? totalTp(per, nomor) ?? 0;
    body = (
      <>
        <div className="row row--nowrap tpscorehead">
          <ProgressRing value={total} max={100} label={String(total)} color="var(--ok)" size="lg" />
          <div className="stack stack--sm">
            <StatusPill s="nilai" lang={lang} />
            <h3 className="tpstate__h">{t.nilaiH}</h3>
          </div>
        </div>
        <ul className="tpmarks">
          {nomor.map((no) => (
            <li key={no}>
              <span className="tpmarks__no">{no}</span>
              <span className="grow">
                {m.skor?.[no]?.catatan || <span className="hint">{t.tanpaCatatan}</span>}
              </span>
              <b className="mono">
                {m.skor?.[no]?.skor ?? "-"}/{TP_POIN}
              </b>
            </li>
          ))}
        </ul>
        {m.dinilaiOleh && <p className="hint">{t.dinilaiOleh(m.dinilaiOleh)}</p>}
        {fileRow}
      </>
    );
  } else if (st === "masuk" || st === "telat") {
    body = (
      <>
        <StatusPill
          s={st}
          lang={lang}
          extra={st === "telat" && m.telatMenit ? t.telatMenit(m.telatMenit) : undefined}
        />
        <h3 className="tpstate__h">{st === "telat" ? t.telatH : t.masukH}</h3>
        {fileRow}
        <p className="hint">{st === "telat" ? t.telatBody : t.masukBody}</p>
      </>
    );
  } else if (st === "kosong") {
    body = (
      <>
        <StatusPill s="kosong" lang={lang} />
        <h3 className="tpstate__h">{t.kosongH}</h3>
        <p className="hint">{t.kosongBody}</p>
      </>
    );
  } else {
    body = (
      <>
        <StatusPill s="belum" lang={lang} />
        <h3 className="tpstate__h">{m.keadaan === "belum" ? t.belumBisa : t.belumH}</h3>
        <p className="hint">
          {t.belumBody(m.keadaan === "belum" || !terakhir ? null : waktuPanjang(terakhir, lang))}
        </p>
      </>
    );
  }
  return <section className="panel panel--raised tpstate">{body}</section>;
}

function Cara({
  lang,
  modul,
  m,
  kursus,
}: {
  lang: Lang;
  modul: number;
  m: TpSayaModul;
  kursus: { label: string; url: string } | null;
}) {
  const t = TPS[lang];
  const buka = m.keadaan === "buka" || m.keadaan === null;
  const link = m.tugasUrl ?? kursus?.url ?? null;
  const tip =
    m.keadaan === "belum" && m.jendela
      ? t.lmsBelumBuka(hariJam(m.jendela.buka, lang))
      : m.keadaan === "tutup"
        ? t.lmsTutup
        : undefined;
  return (
    <section className="panel">
      <h2 className="panel__title">{t.caraH}</h2>
      <ol className="tpsteps">
        <li>
          <span>1</span>
          <p>{t.cara1}</p>
        </li>
        <li>
          <span>2</span>
          <div className="stack stack--sm">
            <p>{kursus ? t.cara2(modul) : t.cara2Tanpa(modul)}</p>
            {kursus && <span className="hint tpcourse">{kursus.label}</span>}
            {link && buka ? (
              <a className="btn btn--primary" href={link} target="_blank" rel="noopener noreferrer">
                {t.kumpulLms}
                <ArrowSquareOutIcon size={18} aria-hidden="true" />
              </a>
            ) : (
              <button type="button" className="btn btn--primary" aria-disabled="true" title={tip}>
                {t.kumpulLms}
                <ArrowSquareOutIcon size={18} aria-hidden="true" />
              </button>
            )}
            {tip && <span className="hint">{tip}</span>}
          </div>
        </li>
        <li>
          <span>3</span>
          <p>{t.cara3}</p>
        </li>
      </ol>
    </section>
  );
}

/* ============================================================== Asisten */

interface ModulTp {
  ok: boolean;
  jendela: JendelaInfo | null;
  keadaan: KeadaanJendela | null;
  pola: PolaJendela;
  masuk: number;
  peserta: number;
  dinilai: number;
  perKursus: { label: string; peserta: number; masuk: number; ada: boolean }[];
  hilang: { label: string; peserta: number }[];
  sinkron: {
    tersambung: boolean;
    terakhir: string | null;
    hasil: string | null;
    galat: string | null;
  };
  bolehUbah: boolean;
  bolehLms: boolean;
}

function TpAsisten({ lang, modul }: { lang: Lang; modul: number }) {
  const t = TPS[lang];
  const poll = usePoll(
    () => getJson<ModulTp>(`/api/tp/modul?modul=${modul}`).then((d) => (d.ok ? d : null)),
    120_000,
    true,
    ["tp"],
    0,
    modul,
  );
  const d = poll.data;
  const pk = usePaket(modul);
  const paket = pk.data?.paket;
  const [bahasa, setBahasa] = useState<BahasaTp>(
    lang === "en" ? "en" : lang === "zh" ? "zh" : "id",
  );
  const [kunciOn, setKunciOn] = useState(false);
  const [ubah, setUbah] = useState(false);
  const [pdfJalan, setPdfJalan] = useState(false);
  const soal = useMemo(() => (paket ? soalDari(paket, bahasa) : []), [paket, bahasa]);
  const kunci = useMemo(() => (paket ? kunciDari(paket, bahasa) : null), [paket, bahasa]);
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;

  const unduh = async () => {
    if (!paket || !pk.data) return;
    setPdfJalan(true);
    try {
      const nama = await unduhPdfTp({
        modul,
        bahasa,
        kelas: bahasa === "en" ? "inter" : bahasa === "id" ? "reguler" : null,
        semester: pk.data.semester,
        jendela: d.jendela,
        petunjuk: paket.petunjuk[bahasa],
        soal,
      });
      window.Toast?.show(t.pdfDiunduh(nama), "ok");
    } catch {
      window.Toast?.show(t.pdfGagal, "warn");
    }
    setPdfJalan(false);
  };
  const ada = d.perKursus.filter((k) => k.ada).length;
  return (
    <div className="tpgrid tpgrid--a">
      <div className="stack stack--lg tpgrid__main">
        <section className="panel">
          <div className="panel__head tpsoalhead">
            <h2 className="panel__title">{t.soalModulH(modul)}</h2>
            <div className="row tpsoalhead__ctl">
              <TabLine
                seg
                value={bahasa}
                onChange={setBahasa}
                label={t.kelas}
                tabs={[
                  { v: "id" as const, label: t.reguler },
                  { v: "en" as const, label: t.internasional },
                  ...(lang === "zh"
                    ? [
                        {
                          v: "zh" as const,
                          label: (
                            <>
                              中文 <BetaBadge />
                            </>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              <Switch on={kunciOn} onChange={setKunciOn} label={t.tampilkanKunci} showLabel />
            </div>
          </div>
          {kunciOn && (
            <div className="banner banner--warn">
              <WarningIcon size={20} aria-hidden="true" />
              <span>{t.kunciProyektor}</span>
            </div>
          )}
          {paket && paket.varian.length > 1 && (
            <div className="tpmix">
              <span className="label-caps">{t.paketH}</span>
              <div className="row">
                {paket.varian.map((v, i) => (
                  <Pill key={v.kode} tone={i ? undefined : "accent"}>
                    {t.varianNama(v.kode, v.nama)} ·{" "}
                    {(pk.data?.beda ?? []).filter((no) => paket.pilih[no - 1] === i).length}
                  </Pill>
                ))}
              </div>
              <span className="hint">
                {t.paketDari(paket.varian.map((v) => v.kode).join(", "))}
              </span>
            </div>
          )}
          <div className="row tpsoalbar">
            <a className="btn btn--sm" href={href(lang, `/grading?modul=${modul}#soal`)}>
              <PencilSimpleIcon size={16} aria-hidden="true" />
              {t.ubahSoal}
            </a>
            <button
              type="button"
              className="btn btn--sm"
              disabled={pdfJalan || !paket}
              onClick={() => void unduh()}
            >
              <DownloadSimpleIcon size={16} aria-hidden="true" />
              {pdfJalan ? t.membuatPdf : t.unduhPdf}
            </button>
          </div>
          {paket ? (
            <SoalList soal={soal} lang={lang} poin kunci={kunciOn ? kunci : undefined} />
          ) : (
            <span className="skeleton" style={{ height: 320 }} />
          )}
        </section>
      </div>
      <div className="tpgrid__hero">
        <Hero lang={lang} modul={modul} j={d.jendela} k={d.keadaan}>
          <div className="tpstats">
            {[
              { l: t.status.masuk, n: d.masuk, dari: d.peserta || d.masuk },
              { l: t.status.nilai, n: d.dinilai, dari: d.masuk },
            ].map((x) => (
              <div key={x.l} className="stat tpstat">
                <span className="label-caps">{x.l}</span>
                <span className="stat__value num">
                  {x.n}
                  <small> / {x.dari}</small>
                </span>
                <span
                  className="meter"
                  role="img"
                  aria-label={`${x.n}/${x.dari}`}
                  style={
                    {
                      "--meter": x.dari ? Math.round((x.n / x.dari) * 100) : 0,
                    } as CSSProperties
                  }
                />
              </div>
            ))}
          </div>
          <div className="tpbtns">
            <a className="btn btn--primary" href={href(lang, `/grading?modul=${modul}`)}>
              {t.nilaiTp}
              <ArrowRightIcon size={18} aria-hidden="true" />
            </a>
            {d.bolehUbah && (
              <button type="button" className="btn" onClick={() => setUbah(true)}>
                <CalendarBlankIcon size={18} aria-hidden="true" />
                {d.jendela?.sumber === "iris" ? t.ubahJendela : t.aturJendela}
              </button>
            )}
          </div>
        </Hero>
      </div>
      <div className="stack stack--lg tpgrid__side">
        <a
          className="panel panel--tight tplmscard"
          href={href(lang, d.bolehLms ? "/grading#lms" : "/grading")}
        >
          <PlugsConnectedIcon size={22} aria-hidden="true" />
          <span className="stack stack--sm grow">
            <b>
              {d.sinkron.tersambung ? t.lmsRingkas(ada, d.perKursus.length, modul) : t.lmsBelum}
            </b>
            <span className="hint">
              {d.sinkron.terakhir
                ? t.sinkronTerakhir(waktuPanjang(d.sinkron.terakhir, lang))
                : t.belumSinkron}
            </span>
          </span>
          <CaretRightIcon size={18} aria-hidden="true" />
        </a>
        <section className="panel">
          <h2 className="panel__title">{t.terkumpulPerKelas}</h2>
          {d.perKursus.length ? (
            <ul className="tpper">
              {d.perKursus.map((k) => (
                <li key={k.label} data-ada={k.ada ? "yes" : "no"}>
                  <span className="mono">{k.label}</span>
                  <span
                    className="meter"
                    role="img"
                    aria-label={`${k.masuk}/${k.peserta}`}
                    style={
                      {
                        "--meter": k.peserta ? Math.round((k.masuk / k.peserta) * 100) : 0,
                      } as CSSProperties
                    }
                  />
                  <span className="mono hint">
                    {k.ada ? (
                      `${k.masuk}/${k.peserta}`
                    ) : (
                      <WarningIcon size={16} aria-label={t.tidakDitemukan} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t.belumAdaKelas}</p>
          )}
        </section>
      </div>
      <JendelaDialog
        open={ubah}
        onOpenChange={setUbah}
        lang={lang}
        modul={modul}
        j={d.jendela}
        pola={d.pola}
        onSaved={poll.refresh}
      />
    </div>
  );
}

export function JendelaDialog({
  open,
  onOpenChange,
  lang,
  modul,
  j,
  pola,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  modul: number;
  j: (JendelaTp & { sumber?: string }) | null;
  pola: PolaJendela;
  onSaved: () => void;
}) {
  const t = TPS[lang];
  const awal = j ?? jendelaBerikut(pola, hariIniWib());
  const [a, setA] = useState(() => bagiWib(awal.buka));
  const [b, setB] = useState(() => bagiWib(awal.tutup));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const x = j ?? jendelaBerikut(pola, hariIniWib());
    setA(bagiWib(x.buka));
    setB(bagiWib(x.tutup));
  }, [open]);
  const kirim = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/tp/jendela", {
      modul,
      ...body,
    }).catch(() => ({ ok: false, kode: "" }));
    setBusy(false);
    if (!r.ok)
      return window.Toast?.show(r.kode === "format_salah" ? t.jendelaSalah : t.gagal, "warn");
    window.Toast?.show(t.jendelaDisimpan, "ok");
    onOpenChange(false);
    onSaved();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.jendelaJudul(modul)}
      description={t.jendelaDesc}
      lang={lang}
      alt={
        j?.sumber === "iris" ? (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void kirim({ hapus: true })}
          >
            {t.pakaiLms}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void kirim({ buka: a, tutup: b })}
          >
            {t.simpan}
          </button>
        </>
      }
    >
      <div className="tpwinform">
        <div className="field">
          <span className="field__label">{t.dibuka}</span>
          <div className="tpwinform__row">
            <DateField
              value={a.tanggal}
              onChange={(v) => setA({ ...a, tanggal: v })}
              label={t.tglBuka}
              lang={lang}
            />
            <TimeField
              value={a.jam}
              onChange={(v) => setA({ ...a, jam: v })}
              label={t.jamBuka}
              lang={lang}
            />
          </div>
        </div>
        <div className="field">
          <span className="field__label">{t.ditutup}</span>
          <div className="tpwinform__row">
            <DateField
              value={b.tanggal}
              onChange={(v) => setB({ ...b, tanggal: v })}
              label={t.tglTutup}
              lang={lang}
            />
            <TimeField
              value={b.jam}
              onChange={(v) => setB({ ...b, jam: v })}
              label={t.jamTutup}
              lang={lang}
            />
          </div>
        </div>
        <p className="hint">{t.jendelaHint}</p>
      </div>
    </Dialog>
  );
}
