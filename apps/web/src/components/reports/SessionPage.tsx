/**
 * One session's report (Phase 9 Stage 6b, mockup r-session): header with
 * exports, attendance and scores, blanks and delay (each opens its per-group
 * breakdown), a card per group with its Asisten and SeeLabs account, then
 * Incidents, Scores (editable for the groups you held, every change in the
 * log), the session's Written Report (saves as you type) and Feedback.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  FileCsvIcon,
  FilePdfIcon,
  FileXlsIcon,
  FloppyDiskIcon,
  LockSimpleIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { getJson, localeOf, namaKelompok, tanggalPanjang } from "../../lib/app";
import { NILAI_KOMPONEN, type NilaiKomponen } from "../../lib/nilai-komponen";
import { kelasLabel, kelompokLabel, modulLabel } from "../../lib/labels";
import type { Kelas, Lang } from "../../lib/kelas";
import type { Direktori } from "../../lib/people";
import type { Ringkasan } from "../../lib/umpan-balik";
import { LABEL_CHIP } from "../../lib/umpan-balik";
import { unduhPdf, type BagianPdf } from "../../lib/pdf";
import BackButton from "../ui/BackButton";
import Dialog from "../ui/Dialog";
import Fade from "../ui/Fade";
import Pill from "../ui/Pill";
import TabLine from "../ui/TabLine";
import ErrorView from "../ui/ErrorView";
import { AddIncident, IncidentList, useKejadian } from "./Incidents";
import { type Format, ekspor, jamWib, kirim, tanggalWib } from "./data";
import type { Tx } from "./strings";
import { useSiaran } from "../../lib/siaran";

type Skor = Partial<Record<NilaiKomponen, number>>;

interface KelompokRekap {
  nomor: number;
  nama: string | null;
  pemegang: string | null;
  akunSeelabs: string | null;
  statusSeelabs: "terkirim" | "berubah" | "siap" | "butuh_akun" | "kosong" | null;
  hadir: [number, number];
  blank: [number, number];
  delay: { median: number | null; n: number };
  anggota: { nim: string; nama: string; skor: Skor }[];
}

interface Rekap {
  sesi: {
    id: number;
    tanggal: string;
    mulai: string;
    slot: number | null;
    modul: number;
    kelas: Kelas;
    status: string;
    jenis: string;
    durasiDetik: number | null;
  };
  hadir: [number, number];
  kelompok: KelompokRekap[];
  catatan: { id: number; teks: string; oleh: string; pada: string } | null;
  nilaiLog: { pada: string; oleh: string; nim: string | null; komponen: string | null }[];
  lab: Ringkasan;
  saya: Ringkasan | null;
  pegang: number[];
}

const TABS = ["kejadian", "nilai", "tulis", "umpan"] as const;
type TabSesi = (typeof TABS)[number];

const SEELABS_TONE = {
  terkirim: "ok",
  berubah: "warn",
  siap: "warn",
  butuh_akun: "danger",
  kosong: undefined,
} as const;

function total(skor: Skor): number | null {
  const v = NILAI_KOMPONEN.map((k) => skor[k]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, x) => a + x, 0) : null;
}

export default function SessionPage({
  sesiId,
  t,
  lang,
  dir,
  me,
  onBack,
  onBlockReport,
}: {
  sesiId: number;
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
  onBack: () => void;
  onBlockReport: (teks: string, s: Rekap["sesi"]) => void;
}) {
  const [data, setData] = useState<Rekap | null>(null);
  const [err, setErr] = useState<"none" | "gone" | "fail">("none");
  const [tab, setTab] = useState<TabSesi>(() => {
    const h = location.hash.slice(1);
    return (TABS as readonly string[]).includes(h) ? (h as TabSesi) : "kejadian";
  });
  const [chart, setChart] = useState<"blank" | "delay" | null>(null);
  // A link to a tab (Home's "Isi Nilai" lands on #nilai, 2026-10-06)
  // brings that tab into view once the page has drawn, not just selects it.
  const dilihat = useRef(false);
  useEffect(() => {
    if (!data || dilihat.current || !location.hash) return;
    dilihat.current = true;
    requestAnimationFrame(() =>
      document
        .querySelector(".rp-sesi-tabs")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [data]);
  useSiaran(["sesi", "nilai", "laporan", "umpan"], () => void load());
  const load = useCallback(async () => {
    try {
      const d = await getJson<{ ok: boolean; kode?: string } & Rekap>(
        `/api/session/rekap?sesiId=${sesiId}`,
      );
      if (!d.ok) return setErr(d.kode === "sesi_tidak_ada" ? "gone" : "fail");
      setData(d);
      setErr("none");
    } catch {
      setErr("fail");
    }
  }, [sesiId]);
  useEffect(() => {
    void load();
  }, [load]);
  const kej = useKejadian([sesiId]);
  const pilihTab = (v: TabSesi) => {
    setTab(v);
    history.replaceState(null, "", `${location.pathname}${location.search}#${v}`);
  };

  const back = <BackButton lang={lang} label={t.back} onClick={onBack} />;
  if (err === "gone")
    return (
      <div className="rp">
        {back}
        <ErrorView code={404} lang={lang} why={t.notFound} />
      </div>
    );
  if (err === "fail" && !data)
    return (
      <div className="rp">
        {back}
        <ErrorView code={500} lang={lang} onRetry={() => void load()} />
      </div>
    );
  if (!data)
    return (
      <div className="rp">
        {back}
        <span className="skeleton" style={{ height: 420 }} />
      </div>
    );

  const s = data.sesi;
  const judul = t.slotTitle(tanggalPanjang(s.tanggal, lang), s.slot, s.mulai);
  const dinilai = data.kelompok.reduce(
    (a, g) => [
      a[0] + g.anggota.filter((x) => total(x.skor) != null).length,
      a[1] + g.anggota.length,
    ],
    [0, 0],
  );
  const blank = data.kelompok.reduce((a, g) => [a[0] + g.blank[0], a[1] + g.blank[1]], [0, 0]);
  const delays = data.kelompok.filter((g) => g.delay.median != null);
  const delayRata = delays.length
    ? Math.round(delays.reduce((a, g) => a + (g.delay.median ?? 0), 0) / delays.length)
    : null;
  const st = s.status === "berjalan" ? "jalan" : dinilai[0] < dinilai[1] ? "kurang" : "lengkap";

  const exportSesi = (fmt: Format) => {
    const kepala = [t.nama, "NIM", t.kelompok, t.holder, ...NILAI_KOMPONEN, t.total];
    const baris = data.kelompok.flatMap((g) =>
      g.anggota.map((a) => [
        a.nama,
        a.nim,
        kelompokLabel(g.nomor, lang),
        g.pemegang ? dir.nama(g.pemegang) : "",
        ...NILAI_KOMPONEN.map((k) => a.skor[k] ?? null),
        total(a.skor),
      ]),
    );
    const nama = `laporan-sesi-${s.tanggal}-${s.slot ?? s.mulai.replace(":", "")}`;
    const meta = `${modulLabel(s.modul, lang)} · ${kelasLabel(s.kelas, lang)} · ${t.stHadir} ${data.hadir[0]}/${data.hadir[1]}`;
    let job: Promise<void>;
    if (fmt === "pdf") {
      const bagian: BagianPdf[] = [
        { k: "judul", teks: judul },
        {
          k: "meta",
          teks: `${meta} · ${t.pdfMeta(tanggalPanjang(new Date().toISOString(), lang))}`,
        },
        {
          k: "kv",
          baris: data.kelompok.map((g) => [
            namaKelompok(g.nomor, g.nama),
            `${g.pemegang ? dir.nama(g.pemegang) : t.noHolder} · ${t.stHadir} ${g.hadir[0]}/${g.hadir[1]} · ${t.progress} ${g.blank[0]}/${g.blank[1]}`,
          ]),
        },
        { k: "sub", teks: t.sTabs.nilai },
        { k: "tabel", kepala, baris },
      ];
      if (data.catatan?.teks.trim()) {
        bagian.push({ k: "sub", teks: t.writtenTitle }, { k: "p", teks: data.catatan.teks });
      }
      job = unduhPdf(nama, bagian, lang);
    } else {
      job = ekspor(fmt, nama, judul, meta, kepala, baris, lang);
    }
    void job
      .then(() => window.Toast?.show(t.exported(baris.length, fmt.toUpperCase()), "ok"))
      .catch(() => window.Toast?.show(t.err, "danger"));
  };

  return (
    <div className="rp">
      {back}
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <div className="row">
              <Pill modul={s.modul} lg>
                {modulLabel(s.modul, lang)}
              </Pill>
              <Pill tone={s.kelas === "internasional" ? "violet" : undefined}>
                {kelasLabel(s.kelas, lang)}
              </Pill>
              {s.jenis === "susulan" && <Pill>{t.susulan}</Pill>}
              {s.jenis === "tot" && <Pill tone="warn">{t.tot}</Pill>}
              <Pill tone={st === "kurang" ? "warn" : "ok"}>{t.st[st]}</Pill>
            </div>
            <h1 className="page-header__title">{judul}</h1>
          </div>
          <div className="page-header__actions">
            {(
              [
                ["xlsx", FileXlsIcon, "XLSX"],
                ["csv", FileCsvIcon, "CSV"],
                ["pdf", FilePdfIcon, "PDF"],
              ] as const
            ).map(([k, Ic, l]) => (
              <button key={k} type="button" className="btn btn--sm" onClick={() => exportSesi(k)}>
                <Ic size={18} aria-hidden="true" />
                {l}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="rp-stats">
        <div className="rp-stat">
          <b>
            {data.hadir[0]}/{data.hadir[1]}
          </b>
          <span>{t.stHadir}</span>
        </div>
        <div className="rp-stat">
          <b>
            {dinilai[0]}/{dinilai[1]}
          </b>
          <span>{t.stNilai}</span>
        </div>
        <button type="button" className="rp-stat" onClick={() => setChart("blank")}>
          <b>
            {blank[0]}/{blank[1]}
          </b>
          <span>{t.stBlank}</span>
        </button>
        <button type="button" className="rp-stat" onClick={() => setChart("delay")}>
          <b>{delayRata == null ? "·" : `${delayRata.toLocaleString(localeOf(lang))} ms`}</b>
          <span>{t.stDelay}</span>
        </button>
      </div>

      <div className="rp-g5">
        {data.kelompok.map((g) => (
          <section
            key={g.nomor}
            className="panel rp-gcard"
            style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
          >
            <Pill group={g.nomor}>{namaKelompok(g.nomor, g.nama)}</Pill>
            <span className="hint">{t.holder}</span>
            <b>{g.pemegang ? dir.nama(g.pemegang) : t.noHolder}</b>
            <span className="rp-seelabs">
              <span className="hint">SeeLabs</span>
              <b className="mono">
                {g.akunSeelabs ? (dir.byNim.get(g.akunSeelabs)?.kode ?? "?") : "·"}
              </b>
              {g.statusSeelabs && (
                <Pill tone={SEELABS_TONE[g.statusSeelabs]}>{t.seelabsSt[g.statusSeelabs]}</Pill>
              )}
            </span>
          </section>
        ))}
      </div>

      <TabLine
        label={t.sessReport}
        className="rp-sesi-tabs"
        value={tab}
        onChange={pilihTab}
        tabs={TABS.map((v) => ({
          v,
          label: t.sTabs[v],
          n: v === "kejadian" ? (kej.rows?.length ?? undefined) : undefined,
        }))}
      />
      <Fade k={tab}>
        {tab === "kejadian" && <IncidentsCard sesi={s} kej={kej} t={t} lang={lang} dir={dir} />}
        {tab === "nilai" && (
          <ScoresCard data={data} t={t} lang={lang} dir={dir} me={me} reload={load} />
        )}
        {tab === "tulis" && (
          <WrittenCard data={data} t={t} dir={dir} onBlockReport={onBlockReport} />
        )}
        {tab === "umpan" && <FeedbackCard data={data} t={t} lang={lang} />}
      </Fade>

      <Dialog
        open={chart !== null}
        onOpenChange={(o) => !o && setChart(null)}
        title={chart === "delay" ? t.stDelay : t.stBlank}
        description={t.perGroup}
        lang={lang}
        actions={
          <button type="button" className="btn" onClick={() => setChart(null)}>
            {t.close}
          </button>
        }
      >
        {chart === "delay" && !delays.length ? (
          <p className="hint">{t.nodelay}</p>
        ) : (
          <div className="stack">
            {data.kelompok.map((g) => {
              const maks = Math.max(1, ...data.kelompok.map((x) => x.delay.median ?? 0));
              const v =
                chart === "delay"
                  ? (g.delay.median ?? 0) / maks
                  : g.blank[1]
                    ? g.blank[0] / g.blank[1]
                    : 0;
              return (
                <div key={g.nomor} className="rp-cmprow__bar">
                  <span className="hint">{kelompokLabel(g.nomor, lang)}</span>
                  <span
                    className="meter meter--lg"
                    aria-hidden="true"
                    style={
                      {
                        "--meter": v * 100,
                        "--meter-hue": `var(--group-${g.nomor})`,
                      } as CSSProperties
                    }
                  />
                  <b className="num" style={{ minWidth: "7ch" }}>
                    {chart === "delay"
                      ? g.delay.median == null
                        ? "·"
                        : `${g.delay.median} ms`
                      : `${g.blank[0]}/${g.blank[1]}`}
                  </b>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function IncidentsCard({
  sesi,
  kej,
  t,
  lang,
  dir,
}: {
  sesi: Rekap["sesi"];
  kej: ReturnType<typeof useKejadian>;
  t: Tx;
  lang: Lang;
  dir: Direktori;
}) {
  const [add, setAdd] = useState(false);
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.whatHappened}</h2>
        <button type="button" className="btn" onClick={() => setAdd(true)}>
          <PlusIcon size={18} aria-hidden="true" />
          {t.addInc}
        </button>
      </div>
      {kej.fail ? (
        <p className="hint">{t.err}</p>
      ) : kej.rows === null ? (
        <span className="skeleton" style={{ height: 160 }} />
      ) : kej.rows.length === 0 ? (
        <p className="hint">{t.noIncidents}</p>
      ) : (
        <IncidentList
          rows={kej.rows}
          t={t}
          lang={lang}
          dir={dir}
          onChanged={() => void kej.load()}
        />
      )}
      <AddIncident
        open={add}
        onClose={() => setAdd(false)}
        sesi={[sesi]}
        t={t}
        lang={lang}
        onAdded={() => void kej.load()}
      />
    </section>
  );
}

function ScoresCard({
  data,
  t,
  lang,
  dir,
  me,
  reload,
}: {
  data: Rekap;
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
  reload: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bisa = (g: KelompokRekap) => g.pemegang === me || g.pemegang == null;
  const bisaApa = data.kelompok.some((g) => g.pemegang === me);
  const key = (nim: string, k: NilaiKomponen) => `${nim}|${k}`;
  const salah = Object.values(draft).some((v) => v !== "" && !/^(100|\d{1,2})$/.test(v));
  const simpan = async () => {
    const ubah = Object.entries(draft).filter(([k, v]) => {
      const [nim, komp] = k.split("|");
      const lama = data.kelompok.flatMap((g) => g.anggota).find((a) => a.nim === nim)?.skor[
        komp as NilaiKomponen
      ];
      return v !== "" && Number(v) !== lama;
    });
    if (!ubah.length) {
      setEdit(false);
      setDraft({});
      return void window.Toast?.show(t.scoresNone, "info");
    }
    setBusy(true);
    let ok = 0;
    for (const [k, v] of ubah) {
      const [nim, komponen] = k.split("|");
      const r = await kirim("/api/session/nilai", {
        sesiId: data.sesi.id,
        nim,
        komponen,
        skor: Number(v),
      });
      if (r.ok) ok++;
    }
    setBusy(false);
    await reload();
    setDraft({});
    setEdit(false);
    if (ok === ubah.length) window.Toast?.show(t.scoresSaved(ok), "ok");
    else window.Toast?.show(t.err, "danger");
  };
  // One log line per writer per minute.
  const log = useMemo(() => {
    const m = new Map<string, { oleh: string; jam: string; n: number }>();
    for (const r of data.nilaiLog) {
      const k = `${r.oleh}|${r.pada.slice(0, 16)}`;
      const e = m.get(k) ?? {
        oleh: r.oleh,
        jam: `${tanggalPanjang(tanggalWib(r.pada), lang)} ${jamWib(r.pada)}`,
        n: 0,
      };
      e.n++;
      m.set(k, e);
    }
    return [...m.values()];
  }, [data.nilaiLog, lang]);
  return (
    <section className="panel panel--flush">
      <div className="row row--between" style={{ padding: "16px 20px" }}>
        <span className="hint" style={{ flex: "1 1 320px" }}>
          {bisaApa ? t.scoresHint : t.scoresHintRO}
        </span>
        {bisaApa && (
          <span className="row">
            {edit && (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => {
                  setEdit(false);
                  setDraft({});
                }}
              >
                {t.cancel}
              </button>
            )}
            <button
              type="button"
              className={`btn ${edit ? "btn--primary" : "btn--inverse"}`}
              disabled={busy || (edit && salah)}
              onClick={() => (edit ? void simpan() : setEdit(true))}
            >
              {edit ? (
                <FloppyDiskIcon size={18} aria-hidden="true" />
              ) : (
                <PencilSimpleIcon size={18} aria-hidden="true" />
              )}
              {edit ? t.saveScores : t.editScores}
            </button>
          </span>
        )}
      </div>
      {edit && salah && (
        <p className="hint" style={{ color: "var(--danger)", padding: "0 20px" }}>
          {t.scoreBad}
        </p>
      )}
      <div className="rp-scrollx" tabIndex={0} aria-label={t.sTabs.nilai}>
        <table className="rp-table rp-table--tight">
          <thead>
            <tr>
              <th>{t.nama}</th>
              <th>{t.kelompok}</th>
              {NILAI_KOMPONEN.map((k) => (
                <th key={k}>{k}</th>
              ))}
              <th>{t.total}</th>
            </tr>
          </thead>
          <tbody>
            {data.kelompok.flatMap((g) =>
              g.anggota.map((a) => (
                <tr key={a.nim}>
                  <td>
                    {a.nama}
                    <div className="hint mono">{a.nim}</div>
                  </td>
                  <td>
                    <Pill group={g.nomor}>{kelompokLabel(g.nomor, lang)}</Pill>
                  </td>
                  {NILAI_KOMPONEN.map((k) => {
                    const v = a.skor[k];
                    const kk = key(a.nim, k);
                    if (edit && bisa(g)) {
                      const val = draft[kk] ?? (v == null ? "" : String(v));
                      return (
                        <td key={k}>
                          <input
                            className="rp-cell"
                            inputMode="numeric"
                            aria-label={`${a.nama} ${k}`}
                            aria-invalid={val !== "" && !/^(100|\d{1,2})$/.test(val)}
                            value={val}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [kk]: e.target.value.replace(/\D/g, "").slice(0, 3),
                              })
                            }
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={k} className="num">
                        {v == null ? <span className="hint">·</span> : v}
                      </td>
                    );
                  })}
                  <td className="num">
                    <b>{total(a.skor) ?? "·"}</b>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      {log.length > 0 && (
        <div className="rp-auditline">
          <span className="label-caps">{t.scoreLog}</span>
          {log.slice(0, 12).map((x) => (
            <p key={x.oleh + x.jam}>{t.scoreLogLine(dir.nama(x.oleh), x.n, x.jam)}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function WrittenCard({
  data,
  t,
  dir,
  onBlockReport,
}: {
  data: Rekap;
  t: Tx;
  dir: Direktori;
  onBlockReport: (teks: string, s: Rekap["sesi"]) => void;
}) {
  const [txt, setTxt] = useState(data.catatan?.teks ?? "");
  const [st, setSt] = useState<"idle" | "saving" | "saved" | "error">(
    data.catatan ? "saved" : "idle",
  );
  const [info, setInfo] = useState(
    data.catatan ? { pada: data.catatan.pada, oleh: data.catatan.oleh } : null,
  );
  const tmr = useRef<number | undefined>(undefined);
  const latest = useRef(txt);
  const simpan = useCallback(async () => {
    const r = await kirim<{ pada: string; oleh: string }>("/api/session/rekap", {
      sesiId: data.sesi.id,
      teks: latest.current,
    });
    if (r.ok) {
      setInfo({ pada: r.pada, oleh: r.oleh });
      setSt("saved");
    } else setSt("error");
  }, [data.sesi.id]);
  useEffect(() => () => window.clearTimeout(tmr.current), []);
  const onType = (v: string) => {
    setTxt(v);
    latest.current = v;
    setSt("saving");
    window.clearTimeout(tmr.current);
    tmr.current = window.setTimeout(() => void simpan(), 900);
  };
  const label =
    st === "saving"
      ? t.saving
      : st === "error"
        ? t.saveFail
        : info
          ? t.savedBy(jamWib(info.pada, true), dir.nama(info.oleh))
          : t.notSaved;
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.writtenTitle}</h2>
        <span className="rp-savestate" data-st={st} role="status">
          {label}
        </span>
      </div>
      <textarea
        className="rp-textarea rp-textarea--tall"
        aria-label={t.writtenTitle}
        placeholder={t.writtenPh}
        value={txt}
        maxLength={20000}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => {
          if (st === "saving") {
            window.clearTimeout(tmr.current);
            void simpan();
          }
        }}
      />
      <div className="row">
        <button type="button" className="btn btn--sm" onClick={() => onBlockReport(txt, data.sesi)}>
          <NotePencilIcon size={18} aria-hidden="true" />
          {t.toBlock}
        </button>
        <span className="hint">{t.toBlockHint}</span>
      </div>
    </section>
  );
}

function FeedbackCard({ data, t, lang }: { data: Rekap; t: Tx; lang: Lang }) {
  const fmt = (n: number | null) =>
    n == null
      ? "·"
      : n.toLocaleString(localeOf(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ringkas = (r: Ringkasan) => (
    <>
      <div className="row">
        <b className="rp-big">{fmt(r.rataRata)}</b>
        <span className="hint">{t.labOf(r.jumlah)}</span>
      </div>
      {r.chips.length > 0 && (
        <div className="row">
          {r.chips.map((c) => (
            <Pill key={c.chip}>
              {LABEL_CHIP[c.chip]?.[lang] ?? c.chip} · {c.n}
            </Pill>
          ))}
        </div>
      )}
      {r.komentar.slice(0, 5).map((k, i) => (
        <blockquote key={`${i}-${k.pada}`} className="rp-quote">
          <p>{k.teks}</p>
        </blockquote>
      ))}
    </>
  );
  return (
    <div className="rp-g2">
      <section className="panel">
        <h2 className="panel__title">{t.labTitle}</h2>
        {ringkas(data.lab)}
      </section>
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">{t.yourRating}</h2>
          <Pill>
            <LockSimpleIcon size={14} aria-hidden="true" />
            {t.private}
          </Pill>
        </div>
        {data.saya ? (
          <>
            {ringkas(data.saya)}
            <span className="hint">{t.onlyYou}</span>
          </>
        ) : (
          <p className="hint">{t.notHeld}</p>
        )}
      </section>
    </div>
  );
}

export type { Rekap };
