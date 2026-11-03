/**
 * The panel's Kandidat (prompt 03, mockup r1-panel): everyone who applied,
 * as a table from 820 px and a list below, with a search and a status
 * filter, and a side sheet per candidate. The sheet shows the biodata and
 * the three PDFs only to the documents right (Admin and the Ketua); the
 * approve right (Admin and the Ketua) approves, or bounces the application
 * back with a note the candidate sees on their page and on Home.
 * The approve right also sees the oprec account beside the practicum
 * roster's name, with Reset Akun (AkunCek, 2026-10-24).
 * While the Google Form is the way in (2026-10-25), hakPenuh adds candidates
 * here (Tambah CaAs), corrects their details and uploads their PDFs.
 *
 * GET candidates and GET candidate?id=; POST review. A review reaches the
 * candidate's own page through the reccandidates topic.
 */
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowRightIcon,
  CaretRightIcon,
  ChalkboardTeacherIcon,
  CpuIcon,
  DoorOpenIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  FlagIcon,
  GraduationCapIcon,
  HourglassMediumIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PathIcon,
  ScissorsIcon,
  SealCheckIcon,
  SlidersHorizontalIcon,
  TableIcon,
  TimerIcon,
  UserPlusIcon,
  WarningIcon,
  type IconProps,
} from "@phosphor-icons/react";
import Confirm from "../../ui/Confirm";
import Dialog from "../../ui/Dialog";
import Pill from "../../ui/Pill";
import { tanggalPanjang } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { isFail, recGet, recPost, useRecEdition } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import {
  type CandidateDetailResponse,
  type CandidateRow,
  type RecRights,
  type ReviewResponse,
} from "../../../lib/recruitment/types";
import { CP } from "../candidate/candidateStrings";
import { S2 } from "../s2Strings";
import { REC } from "../recruitmentStrings";
import { StatusPill } from "../shared";
import { NS } from "./nextStrings";
import { bukaBagian } from "../../../lib/recruitment/panel-tab";
import { PN } from "./panelStrings";
import AkunCek from "./kandidat/AkunCek";
import { KS, type Antre } from "./kandidat/kandidatStrings";
import Pager, { NOUN, usePager } from "../../ui/Pager";
import { unduhXlsx } from "../../../lib/xlsx";
import "../recruitment-kandidat.css";
import TambahCaAs, { BerkasPanitia } from "./kandidat/TambahCaAs";
import AturBerkas from "./kandidat/AturBerkas";
import BerkasReview from "./kandidat/BerkasReview";

import { useDocRules } from "../../../lib/recruitment/doc-rules";

const waktu = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${tanggalPanjang(w.tanggal, lang)}, ${w.jam}`;
};
const pendek = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${new Date(`${w.tanggal}T00:00:00Z`).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "zh" ? "zh-CN" : "id-ID",
    { day: "numeric", month: "long", timeZone: "UTC" },
  )}, ${w.jam}`;
};

function Lembar({
  lang,
  id,
  rights,
  canAdd,
  onClose,
  onChanged,
}: {
  lang: Lang;
  id: number;
  rights: RecRights;
  /** hakPenuh: correct the details and upload the PDFs (Tambah CaAs) */
  canAdd: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = PN[lang].cand;
  const r = REC[lang];
  const rules = useDocRules();
  const docs = CP[lang].docs;
  const yaTidak = (v: boolean | null | undefined) =>
    v === true ? t.ya : v === false ? t.tidak : null;
  const [d, setD] = useState<CandidateDetailResponse | null | "gagal">(null);
  const [minta, setMinta] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ubah, setUbah] = useState(false);
  const [hapus, setHapus] = useState(false);

  const muat = async () => {
    const res = await recGet<CandidateDetailResponse>("candidate", { id: String(id) });
    setD(isFail(res) ? "gagal" : res);
  };
  useEffect(() => {
    setD(null);
    void muat();
  }, [id]);

  async function putus(decision: "approve" | "revision", note?: string): Promise<boolean> {
    setBusy(true);
    const res = await recPost<ReviewResponse>("review", { id, decision, note });
    setBusy(false);
    if (isFail(res)) {
      window.Toast?.show(res.kode === "berkas_kurang" ? t.needDocs : t.fail, "danger");
      return false;
    }
    onChanged();
    await muat();
    return true;
  }

  const c = d && d !== "gagal" ? d.candidate : null;
  const boleh = rights.approve && !!c && ["applied", "revision", "approved"].includes(c.status);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={c?.nama ?? "…"}
      description={c ? t.sheetSub(c.nim, c.kelas ?? "-", String(c.angkatan ?? "-")) : undefined}
      size="lg"
      lang={lang}
      actions={
        boleh ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => setMinta(true)}
            >
              {t.askFix}
            </button>
            {c.status !== "approved" && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={async () => {
                  if (await putus("approve")) {
                    window.Toast?.show(t.approved(c.nama), "ok");
                    onClose();
                  }
                }}
              >
                <span className="btn__label">{t.approve}</span>
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {PN[lang].tambah.tutup}
          </button>
        )
      }
    >
      {d === null ? (
        <span className="skeleton" style={{ height: 240 }} />
      ) : d === "gagal" || !c ? (
        <p className="banner banner--warn">{t.loadFail}</p>
      ) : (
        <div className="stack stack--lg">
          <div className="row" style={{ gap: 8 }}>
            <StatusPill status={c.status} lang={lang} />
            <span className="hint">
              {t.appliedAt} {waktu(c.appliedAt, lang)}
            </span>
          </div>
          {d.biodata ? (
            <div className="rec-sum">
              {(
                [
                  [t.prodi, d.biodata.prodi ? PN[lang].tambah.prodiNama[d.biodata.prodi] : null],
                  [t.phone, d.biodata.phone],
                  [t.line, d.biodata.lineId],
                  [t.mkIot, yaTidak(d.biodata.mkIot)],
                  [t.praktikumIot, yaTidak(d.biodata.praktikumIot)],
                  [t.address, d.biodata.address],
                  [t.motivation, d.biodata.motivation],
                ] as const
              )
                .filter(([, v]) => !!v)
                .map(([k, v]) => (
                  <span key={k} style={{ display: "contents" }}>
                    <span className="hint">{k}</span>
                    <b>{v}</b>
                  </span>
                ))}
            </div>
          ) : null}
          <section className="stack stack--sm">
            <h3 className="rec-h3">{t.docsTitle}</h3>
            {canAdd && d.documents ? (
              <BerkasPanitia
                lang={lang}
                id={c.id}
                documents={d.documents}
                onChanged={() => {
                  onChanged();
                  void muat();
                }}
              />
            ) : d.documents ? (
              rules.required.map((k) => {
                const doc = d.documents!.find((x) => x.kind === k);
                return (
                  <div key={k} className="rec-doc">
                    <span className="rec-doc__ic" data-ok={doc ? "yes" : undefined} />
                    <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                      <b>{rules.label(k, lang, docs.kind[k])}</b>
                      <span className="hint rec-doc__f">
                        {doc ? `${Math.max(1, Math.round(doc.size / 1024))} KB` : t.notUploaded}
                      </span>
                    </span>
                    {doc && (
                      <a
                        className="btn btn--ghost btn--sm"
                        href={`/api/recruitment/berkas?id=${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t.view}
                      </a>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rec-note">
                <span>{t.noDocsRight}</span>
              </div>
            )}
          </section>
          {canAdd && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setUbah(true)}
              >
                {t.edit}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setHapus(true)}
              >
                {t.del}
              </button>
            </div>
          )}
          {rights.approve && (
            <AkunCek lang={lang} nim={c.nim} nama={c.nama} roster={c.namaRoster} judul="rec-h3" />
          )}
          {c.status === "revision" && c.reviewNote && (
            <div className="rec-note rec-note--warn">
              <b>{t.fixAsked}</b>
              <span>{c.reviewNote}</span>
              {c.reviewedAt && <span className="hint">{waktu(c.reviewedAt, lang)}</span>}
            </div>
          )}
        </div>
      )}
      {hapus && c && (
        <Confirm
          open
          onOpenChange={(o) => !o && setHapus(false)}
          title={t.delTitle(c.nama)}
          body={t.delBody}
          confirmLabel={t.delYes}
          lang={lang}
          onConfirm={async () => {
            const res = await recPost<{ ok: true }>("candidate-delete", { id });
            if (isFail(res)) {
              window.Toast?.show(
                res.kode === "sudah_ada_hasil" || res.kode === "sudah_jadi_asisten"
                  ? t.delBlocked
                  : t.delFail,
                "danger",
              );
              return false;
            }
            window.Toast?.show(t.delDone, "ok");
            onChanged();
            onClose();
          }}
        />
      )}
      {ubah && c && (
        <TambahCaAs
          lang={lang}
          open
          onOpenChange={(o) => !o && setUbah(false)}
          edit={{
            id: c.id,
            nim: c.nim,
            nama: c.nama,
            biodata: d && d !== "gagal" ? d.biodata : null,
          }}
          onSaved={() => {
            onChanged();
            void muat();
          }}
        />
      )}
      {minta && c && (
        <Dialog
          open
          onOpenChange={(o) => !o && setMinta(false)}
          title={t.fixTitle}
          description={t.fixDesc(c.nama)}
          size="sm"
          lang={lang}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setMinta(false)}>
                {r.cancel}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={async () => {
                  if (!catatan.trim()) return setGalat(t.noteRequired);
                  setGalat(null);
                  if (await putus("revision", catatan.trim())) {
                    window.Toast?.show(t.sent, "ok");
                    setMinta(false);
                    setCatatan("");
                  }
                }}
              >
                <span className="btn__label">{t.sendFix}</span>
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="rec-chips">
              {t.quick.map((x) => (
                <Pill key={x} onClick={() => setCatatan(x)} pressed={catatan === x}>
                  {x}
                </Pill>
              ))}
            </div>
            <label className="field" data-invalid={galat ? "yes" : undefined}>
              <span className="field__label">{t.noteLabel}</span>
              <textarea
                className="field__input"
                rows={3}
                maxLength={500}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
              />
              {galat && (
                <span className="field__error" role="alert">
                  {galat}
                </span>
              )}
            </label>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}

const IK_ANTRE: Record<Antre, ComponentType<IconProps>> = {
  menunggu: HourglassMediumIcon,
  revisi: WarningIcon,
  disetujui: SealCheckIcon,
  aktif: PathIcon,
  berhenti: FlagIcon,
  mundur: DoorOpenIcon,
};
const IK_TAHAP: Record<CandidateRow["stage"], ComponentType<IconProps>> = {
  berkas: FileTextIcon,
  first_meet: MapPinIcon,
  tes_tulis: TimerIcon,
  wawancara: ChalkboardTeacherIcon,
  tubes: CpuIcon,
  mengajar: GraduationCapIcon,
  penerimaan: SealCheckIcon,
};
const URUT: Antre[] = ["menunggu", "revisi", "disetujui", "aktif", "berhenti", "mundur"];

/** Where a CaAs stands: the document check while they are still at Berkas, the road after it. */
function antreOf(c: CandidateRow): Antre {
  if (c.status === "withdrawn") return "mundur";
  if (c.status === "out") return "berhenti";
  if (c.status === "applied") return "menunggu";
  if (c.status === "revision") return "revisi";
  return c.stage === "berkas" ? "disetujui" : "aktif";
}

/** The stages that have a Cutting tab, in order; Penerimaan has a tab of its own. */
const TAHAP_AKSI = [
  "berkas",
  "first_meet",
  "tes_tulis",
  "wawancara",
  "mengajar",
  "penerimaan",
] as const satisfies readonly CandidateRow["stage"][];

export default function Kandidat({
  lang,
  rights,
  rows,
  refresh,
}: {
  lang: Lang;
  rights: RecRights;
  rows: CandidateRow[];
  refresh: () => void;
  wide?: boolean;
}) {
  const t = PN[lang].cand;
  const k = KS[lang];
  const [q, setQ] = useState("");
  const [f, setF] = useState<Antre | "semua">("semua");
  const [cutSaja, setCutSaja] = useState(false);
  const [prodiBuka, setProdiBuka] = useState(false);
  const ns = NS[lang === "id" ? "id" : "en"];
  const rules = useDocRules();
  const [sel, setSel] = useState<number | null>(null);
  const [tambah, setTambah] = useState(false);
  const [atur, setAtur] = useState(false);
  const edisi = useRecEdition();
  const canAdd = edisi.data?.canAdd === true;
  const cari = q.trim().toLowerCase();
  const tiap = rows.map((c) => ({ c, st: antreOf(c) }));
  const cnt = (a: Antre) => tiap.filter((x) => x.st === a).length;
  // The chips: the three document-check queues always, the road ones once somebody is on it.
  const kunci = URUT.filter(
    (a) => a === "menunggu" || a === "revisi" || a === "disetujui" || cnt(a) > 0,
  );
  const daftarDulu = tiap.every(
    (x) => x.st === "menunggu" || x.st === "revisi" || x.st === "disetujui",
  );
  const tampil = tiap.filter(
    (x) =>
      (f === "semua" || x.st === f) &&
      (!cutSaja || x.c.potensiCut) &&
      (!cari || `${x.c.nama} ${x.c.nim}`.toLowerCase().includes(cari)),
  );
  const grup = kunci
    .map((a) => [a, tampil.filter((x) => x.st === a)] as const)
    .filter((g) => g[1].length);
  // Pages run over the whole list in group order; each page is then grouped again for display.
  const pg = usePager(
    grup.flatMap((g) => g[1]),
    { id: "kandidat", size: 20, reset: [cari, f, cutSaja] },
  );
  const halaman = kunci
    .map((a) => [a, pg.rows.filter((x) => x.st === a)] as const)
    .filter((g) => g[1].length);
  const desk = rights.documents && rights.approve;
  const berikut = rows.find((c) => c.status === "applied");
  // One shortcut per stage that has candidates, in the toolbar (not one button on every row).
  const tahapAksi = rights.cuttingPropose
    ? TAHAP_AKSI.filter((s) => rows.some((c) => c.stage === s))
    : [];

  function unduh() {
    void unduhXlsx(
      "pendaftar-oprec",
      k.cols,
      rows.map((c) => [
        c.nim,
        c.nama,
        c.kelas ?? "",
        c.angkatan ?? "",
        `${c.docs}/${rules.required.length}`,
        pendek(c.appliedAt, lang),
        ns.stages[c.stage],
        REC[lang].status[c.status],
        c.prodi ? PN[lang].tambah.prodiNama[c.prodi] : "",
        c.ipk ?? "",
        c.potensiCut ? "x" : "",
        c.revisions,
      ]),
      "Pendaftar",
    );
    // The mockup says so when the file starts (the browser shows its own download bar too).
    window.Toast?.show(
      lang === "id"
        ? "Mengunduh pendaftar-oprec-2026.xlsx."
        : lang === "zh"
          ? "正在下载 pendaftar-oprec-2026.xlsx。"
          : "Downloading pendaftar-oprec-2026.xlsx.",
      "ok",
    );
  }

  const Baris = ({ c, st }: { c: CandidateRow; st: Antre }) => {
    const Ik = IK_ANTRE[st];
    const Tg = IK_TAHAP[c.stage];
    const dokumen = rules.required.length;
    const late = !daftarDulu;
    return (
      <li className="rec9-line">
        <button
          type="button"
          className="rec9-row"
          data-st={st}
          data-late={late ? "yes" : undefined}
          onClick={() => setSel(c.id)}
        >
          <span className="rec9-row__st">
            <Ik size={18} aria-hidden="true" />
          </span>
          <span className="rec9-row__who">
            <b>{c.nama}</b>
            <span className="hint mono">
              {c.nim} · {c.kelas ?? "-"} · {c.angkatan ?? "-"}
              {c.ipk !== null &&
                ` · ${k.ipkOf(String(c.ipk).replace(".", lang === "id" ? "," : "."))}`}
            </span>
          </span>
          {/* One group: on a wide row its parts sit in the row's own columns; on a narrow one they wrap under the name. */}
          <span className="rec9-row__meta">
            <span className="rec9-row__stage" title={k.stageNow}>
              <Tg size={16} aria-hidden="true" />
              <span>{ns.stages[c.stage]}</span>
            </span>
            {!late && (
              <span className="rec9-row__docs" aria-label={k.docsOf(c.docs, dokumen)}>
                {Array.from({ length: dokumen }, (_, i) => (
                  <i key={i} data-on={i < c.docs ? "yes" : "no"} />
                ))}
                <small className="num">
                  {c.docs}/{dokumen}
                </small>
              </span>
            )}
            <span className="rec9-row__at hint">{pendek(c.appliedAt, lang)}</span>
            {/* One cell for every pill: a row with extra pills (Potensi Cut, revision) must not push the status pill into the caret column. */}
            <span className="rec9-row__pills">
              {c.potensiCut && (
                <Pill tone="warn">
                  <FlagIcon size={14} aria-hidden="true" /> {k.cutChip}
                </Pill>
              )}
              {c.revisions > 0 && (c.status === "applied" || c.status === "revision") && (
                <Pill tone={c.status === "applied" ? "accent" : "warn"}>
                  {c.status === "applied"
                    ? S2[lang].berkas.resent
                    : S2[lang].berkas.round(c.revisions)}
                </Pill>
              )}
              <StatusPill status={c.status} lang={lang} />
            </span>
          </span>
          <CaretRightIcon size={16} aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <div className="stack rec9-kand">
      {/* The size container: the list changes shape with the room it has, not with the window (the dialogs below stay outside it). */}
      <div className="rec9-kcon">
        <div className="rec9-kbar">
          <div className="rec9-chips" role="group" aria-label={k.filterStatus}>
            {(["semua", ...kunci] as const).map((a) => {
              const Ik = a === "semua" ? null : IK_ANTRE[a];
              return (
                <button
                  key={a}
                  type="button"
                  className="rec9-chip"
                  data-k={a}
                  aria-pressed={f === a}
                  onClick={() => setF(a)}
                >
                  {Ik && <Ik size={16} aria-hidden="true" />}
                  <span>{a === "semua" ? k.all : k.q[a].t}</span>
                  <b className="num">{a === "semua" ? rows.length : cnt(a)}</b>
                </button>
              );
            })}
            {rows.some((c) => c.potensiCut) && (
              <button
                type="button"
                className="rec9-chip"
                data-k="potensi"
                aria-pressed={cutSaja}
                title={k.cutChipHint}
                onClick={() => setCutSaja((v) => !v)}
              >
                <FlagIcon size={16} aria-hidden="true" />
                <span>{k.cutChip}</span>
                <b className="num">{rows.filter((c) => c.potensiCut).length}</b>
              </button>
            )}
          </div>
          <span className="grow" />
          {desk && berikut && (
            <button type="button" className="btn btn--primary" onClick={() => setSel(berikut.id)}>
              <span className="btn__label">{k.checkNext}</span>
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="row rec-tools">
          <div className="rec9-search">
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <input
              className="field__input"
              placeholder={t.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t.searchLabel}
            />
          </div>
          <span className="grow" />
          <span className="hint num">{t.count(tampil.length, rows.length)}</span>
          {tahapAksi.map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn--ghost btn--sm"
              title={s === "penerimaan" ? k.acceptOpen : k.cuttingOpen(ns.stages[s])}
              onClick={() => bukaBagian(s === "penerimaan" ? "penerimaan" : "cutting")}
            >
              {s === "penerimaan" ? (
                <SealCheckIcon size={18} aria-hidden="true" />
              ) : (
                <ScissorsIcon size={18} aria-hidden="true" />
              )}
              <span className="btn__label">
                {s === "penerimaan" ? k.accept : k.cutting(ns.stages[s])}
              </span>
            </button>
          ))}
          {rights.candidates && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setProdiBuka(true)}
            >
              <TableIcon size={18} aria-hidden="true" />
              <span className="btn__label">{k.byProdi}</span>
            </button>
          )}
          {desk && (
            <button type="button" className="btn btn--inverse btn--sm" onClick={unduh}>
              <DownloadSimpleIcon size={18} aria-hidden="true" />
              <span className="btn__label">{k.download}</span>
            </button>
          )}
          {rights.documents && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAtur(true)}>
              <SlidersHorizontalIcon size={18} aria-hidden="true" />
              <span className="btn__label">{ns.setDocs}</span>
            </button>
          )}
          {canAdd && (
            <button
              type="button"
              className="btn btn--inverse btn--sm"
              onClick={() => setTambah(true)}
            >
              <UserPlusIcon size={18} aria-hidden="true" />
              <span className="btn__label">{PN[lang].tambah.btn}</span>
            </button>
          )}
        </div>
        {grup.length ? (
          halaman.map(([a, baris]) => {
            const Ik = IK_ANTRE[a];
            return (
              <section className="rec9-group" data-st={a} key={a}>
                <div className="rec9-group__h">
                  <span className="rec9-group__ic">
                    <Ik size={16} aria-hidden="true" />
                  </span>
                  <b>{k.q[a].t}</b>
                  <span className="hint">{k.q[a].h}</span>
                  <span className="grow" />
                  <span className="hint num">
                    {grup.find((g) => g[0] === a)?.[1].length ?? baris.length}
                  </span>
                </div>
                <ul className="rec9-rows">
                  {baris.map((x) => (
                    <Baris key={x.c.id} c={x.c} st={x.st} />
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          <section className="panel">
            <span className="hint">{rows.length ? t.emptyFilter : t.empty}</span>
          </section>
        )}
        <Pager pg={pg} noun={NOUN[lang].caas} lang={lang} />
      </div>
      {sel !== null && rights.documents && rights.approve && (
        <BerkasReview
          lang={lang}
          id={sel}
          queue={rows.filter((c) => c.status === "applied")}
          canAdd={canAdd}
          onClose={() => setSel(null)}
          onChanged={refresh}
        />
      )}
      {sel !== null && !(rights.documents && rights.approve) && (
        <Lembar
          lang={lang}
          id={sel}
          rights={rights}
          canAdd={canAdd}
          onClose={() => setSel(null)}
          onChanged={refresh}
        />
      )}
      {rights.documents && atur && (
        <AturBerkas lang={lang} open onOpenChange={setAtur} onSaved={edisi.refresh} />
      )}
      {canAdd && (
        <TambahCaAs lang={lang} open={tambah} onOpenChange={setTambah} onSaved={refresh} />
      )}
      <Dialog
        open={prodiBuka}
        onOpenChange={setProdiBuka}
        title={k.prodiTitle}
        description={k.prodiSub}
        lang={lang}
      >
        <ProdiHitung lang={lang} tiap={tiap} />
      </Dialog>
    </div>
  );
}

/** SUMMARY of the sheet, kept live: registrants per prodi and where each stands. */
function ProdiHitung({ lang, tiap }: { lang: Lang; tiap: { c: CandidateRow; st: Antre }[] }) {
  const k = KS[lang];
  const nama = PN[lang].tambah.prodiNama;
  const kunci = ["te", "tt", "tb", null] as const;
  const baris = kunci
    .map((p) => {
      const di = tiap.filter((x) => (x.c.prodi ?? null) === p);
      const n = (a: Antre) => di.filter((x) => x.st === a).length;
      return {
        p,
        isi: [
          di.length,
          n("menunggu"),
          n("revisi"),
          n("disetujui") + n("aktif"),
          di.filter((x) => x.c.potensiCut).length,
          n("berhenti") + n("mundur"),
        ],
      };
    })
    .filter((r) => r.p !== null || r.isi[0] > 0);
  const jumlah = k.prodiCols.slice(1).map((_, i) => baris.reduce((a, r) => a + r.isi[i], 0));
  return (
    <div className="rec9-sum scrollx">
      <table>
        <thead>
          <tr>
            {k.prodiCols.map((h, i) => (
              <th key={h} scope="col" className={i ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {baris.map((r) => (
            <tr key={r.p ?? "none"}>
              <th scope="row">{r.p ? nama[r.p] : k.prodiNone}</th>
              {r.isi.map((v, i) => (
                <td key={i} className="num">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{k.total}</th>
            {jumlah.map((v, i) => (
              <td key={i} className="num">
                {v}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
