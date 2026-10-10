/**
 * After Akhiri Sesi (Phase 10, mockup c12-end): one page walks the wrap up
 * in four steps that can be taken in any order. It replaces the Phase 9
 * DoneView and keeps all of it.
 *
 * - Rekap: feedback filling live, scores complete, blanks right, average
 *   delay; each group's blanks; Still Open (scores, blanks, the group note,
 *   SeeLabs) with a way to each; Resume the Session until minute 150, else
 *   Get the Next Session Ready; the session report.
 * - Nilai: Kirim Nilai per complete group, the empty field count for the
 *   others with Fill (the Score Table).
 * - SeeLabs: the SeeLabs line, Copy for SeeLabs and the Panduan.
 * - Selesai: journals lock into history, sent scores show on the
 *   Dashboard; To the Console or Get the Next Session Ready (NextView).
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  CalendarDotsIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  HouseIcon,
  LockSimpleIcon,
  PencilSimpleIcon,
  TableIcon,
} from "@phosphor-icons/react";
import { CountUp } from "../ui/Display";
import Fade from "../ui/Fade";
import Pill from "../ui/Pill";
import {
  dict,
  getJson,
  href,
  jamMenit,
  menitBerjalan,
  namaKelompok,
  postJson,
} from "../../lib/app";
import { SESI_CAP_MENIT } from "../../lib/jadwal";
import { hariDariTanggal } from "../../lib/jadwal-parser";
import type { Lang } from "../../lib/kelas";
import { modulLabel, tri } from "../../lib/labels";
import { useSegar } from "../../lib/siaran";
import { pesan, type Strings } from "./strings";
import { useRingkasSesi } from "./ringkasSesi";
import KirimNilai from "./KirimNilai";
import SeelabsLine from "./seelabs/SeelabsLine";
import type { SeelabsData } from "./seelabs/data";
import type { SeelabsTab } from "./seelabs/SeelabsView";
import type { NilaiLive } from "./data";
import type { AsistenRef, SesiRunning } from "./types";
import "./run.css";
import "./day.css";
import "../shared/instruments.css";
import Nil from "../ui/Nil";

export function kapanSesi(t: Strings, sesi: SesiRunning): string {
  const hari = t.hari[hariDariTanggal(sesi.tanggal)];
  return sesi.slot ? `${hari} ${t.slot(sesi.slot).toLowerCase()}` : `${hari} · ${sesi.mulai}`;
}

const E = dict({
  id: {
    title: (m: string) => `Sesi ${m} Diakhiri`,
    sub: (jam: string, menit: number, sampai: string | null) =>
      `Diakhiri ${jam} · ${menit} menit${sampai ? ` · bisa dilanjutkan sampai ${sampai}` : ""}`,
    steps: { rekap: "Rekap", nilai: "Nilai", seelabs: "SeeLabs", selesai: "Selesai" },
    happened: "Yang Terjadi",
    open: "Belum Beres",
    tag: { nilai: "NILAI", blank: "BLANK", catatan: "CATATAN", seelabs: "SEELABS" },
    openScores: (g: string, n: number) => `${g}: ${n} praktikan belum dinilai lengkap.`,
    openBlanks: (g: string, a: number, b: number) => `${g}: blank benar ${a}/${b}.`,
    openNote: (g: string) => `${g}: catatan kelompok kosong.`,
    toScores: "Ke Nilai",
    toSeelabs: "Ke SeeLabs",
    see: "Lihat",
    fill: "Isi",
    sendTitle: "Kirim Nilai per Kelompok",
    sendSub: "Hanya kelompok lengkap yang bisa dikirim. Yang terkirim dihitung ke pembayaran.",
    fullTable: "Tabel Nilai Lengkap",
    here: (a: number, b: number) => `${a}/${b} hadir`,
    asisten: (k: string) => `Asisten ${k}`,
    seelabsTitle: "Salin ke SeeLabs",
    seelabsSub:
      "Salin, buka SeeLabs, lalu jalankan bookmarklet. Simpan Penilaian tetap kamu yang menekan.",
    copy: "Salin untuk SeeLabs",
    guide: "Panduan",
    finish: "Selesai",
    doneTitle: "Sesi Beres",
    doneBody:
      "Jurnal Praktikan terkunci jadi riwayat. Nilai yang terkirim tampil di Dasbor mereka. Umpan balik bisa diisi kapan saja.",
  },
  en: {
    title: (m: string) => `${m} Session Ended`,
    sub: (jam: string, menit: number, sampai: string | null) =>
      `Ended ${jam} · ${menit} minutes${sampai ? ` · can resume until ${sampai}` : ""}`,
    steps: { rekap: "Recap", nilai: "Scores", seelabs: "SeeLabs", selesai: "Done" },
    happened: "What Happened",
    open: "Still Open",
    tag: { nilai: "SCORES", blank: "BLANK", catatan: "NOTE", seelabs: "SEELABS" },
    openScores: (g: string, n: number) => `${g}: ${n} students not fully scored.`,
    openBlanks: (g: string, a: number, b: number) => `${g}: blanks right ${a}/${b}.`,
    openNote: (g: string) => `${g}: the group note is empty.`,
    toScores: "To Scores",
    toSeelabs: "To SeeLabs",
    see: "See",
    fill: "Fill",
    sendTitle: "Send Scores per Group",
    sendSub: "Only complete groups can be sent. Sent groups count toward pay.",
    fullTable: "Full Score Table",
    here: (a: number, b: number) => `${a}/${b} here`,
    asisten: (k: string) => `Assistant ${k}`,
    seelabsTitle: "Copy to SeeLabs",
    seelabsSub:
      "Copy, open SeeLabs, then run the bookmarklet. You still press Simpan Penilaian yourself.",
    copy: "Copy for SeeLabs",
    guide: "Guide",
    finish: "Finish",
    doneTitle: "Session Wrapped Up",
    doneBody:
      "The students' journals lock into history. Sent scores show on their Dashboard. Feedback stays open any time.",
  },
  zh: {
    title: (m: string) => `${m}的课已结束`,
    sub: (jam: string, menit: number, sampai: string | null) =>
      `${jam} 结束 · ${menit} 分钟${sampai ? ` · ${sampai} 前可继续` : ""}`,
    steps: { rekap: "回顾", nilai: "成绩", seelabs: "SeeLabs", selesai: "完成" },
    happened: "发生了什么",
    open: "还没处理完",
    tag: { nilai: "成绩", blank: "空格", catatan: "备注", seelabs: "SEELABS" },
    openScores: (g: string, n: number) => `${g}：${n} 名学生成绩没填完。`,
    openBlanks: (g: string, a: number, b: number) => `${g}：填对 ${a}/${b}。`,
    openNote: (g: string) => `${g}：小组备注是空的。`,
    toScores: "去成绩",
    toSeelabs: "去 SeeLabs",
    see: "查看",
    fill: "填写",
    sendTitle: "按组发送成绩",
    sendSub: "只有填完的组能发送。发送后计入报酬。",
    fullTable: "完整成绩表",
    here: (a: number, b: number) => `${a}/${b} 出席`,
    asisten: (k: string) => `助教 ${k}`,
    seelabsTitle: "复制到 SeeLabs",
    seelabsSub: "复制，打开 SeeLabs，再运行书签脚本。保存评分仍由你自己按。",
    copy: "复制到 SeeLabs",
    guide: "指南",
    finish: "完成",
    doneTitle: "这节课处理完了",
    doneBody: "学生的实验报告锁定为记录。已发送的成绩显示在他们的仪表板上。反馈随时可以填。",
  },
});

type Step = "rekap" | "nilai" | "seelabs" | "selesai";
const STEPS: Step[] = ["rekap", "nilai", "seelabs", "selesai"];

export default function EndPage({
  t,
  lang,
  sesi,
  hadir,
  seelabs,
  nilai,
  asisten,
  meNim,
  onSeelabs,
  onScores,
  onResumed,
  onNext,
  onNew,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning & { selesaiPada?: string };
  hadir: number;
  seelabs: SeelabsData | null;
  nilai: NilaiLive;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  onSeelabs: (tab?: SeelabsTab) => void;
  onScores: () => void;
  onResumed: () => void;
  onNext: () => void;
  onNew: () => void;
}) {
  const e = E[lang];
  const [step, setStep] = useState<Step>("rekap");
  const [n, setN] = useState(0);
  const sum = useRingkasSesi(sesi.id);
  // Each new feedback counts up at once (umpan, and the 60 s safety net).
  const segarUmpan = useSegar(["umpan"]);
  useEffect(() => {
    let alive = true;
    getJson<{ ok: boolean; ringkasan: { jumlah: number } }>(
      `/api/session/feedback?scope=lab&sesiId=${sesi.id}`,
    )
      .then((d) => alive && d.ok && setN(d.ringkasan.jumlah))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sesi.id, segarUmpan]);

  // Resume works until 150 minutes after the start.
  const capped = menitBerjalan(sesi.mulaiPada) >= SESI_CAP_MENIT;
  const ran = Math.min(
    SESI_CAP_MENIT,
    Math.round(
      sesi.selesaiPada && sesi.mulaiPada
        ? (new Date(sesi.selesaiPada).getTime() - new Date(sesi.mulaiPada).getTime()) / 60_000
        : menitBerjalan(sesi.mulaiPada),
    ),
  );
  const sampai =
    !capped && sesi.mulaiPada
      ? jamMenit(new Date(Date.parse(sesi.mulaiPada) + SESI_CAP_MENIT * 60_000).toISOString(), lang)
      : null;
  const total = Math.max(hadir, n, sum?.siswa ?? 0);
  const grup = sum?.grup ?? [];

  async function resume() {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/lanjutkan", {
        sesiId: sesi.id,
      });
      if (!r.ok) return window.Toast?.show(pesan(t, r.kode), "danger");
      window.Toast?.show(t.resumed, "ok");
      onResumed();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  const idx = STEPS.indexOf(step);
  const kodeOf = (nim: string | null) =>
    nim ? (asisten.get(nim)?.kode ?? nim).toUpperCase() : tri(lang, "belum ada", "nobody", "无");
  const open: { tag: keyof typeof e.tag; tone: string; text: string; act: [string, () => void] }[] =
    [];
  // One line per kind, naming its groups (mockup c12-end).
  const daftar = (xs: typeof grup) => xs.map((g) => t.group(g.nomor)).join(", ");
  const kurangNilai = grup.filter((g) => g.lengkap < g.anggota);
  const kurangBlank = grup.filter((g) => g.benar < g.total);
  const tanpaCatatan = grup.filter((g) => !g.catatan);
  if (kurangNilai.length)
    open.push({
      tag: "nilai",
      tone: "warn",
      text: e.openScores(
        daftar(kurangNilai),
        kurangNilai.reduce((a, g) => a + g.anggota - g.lengkap, 0),
      ),
      act: [e.fill, () => setStep("nilai")],
    });
  if (kurangBlank.length)
    open.push({
      tag: "blank",
      tone: "violet",
      text: e.openBlanks(
        daftar(kurangBlank),
        kurangBlank.reduce((a, g) => a + g.benar, 0),
        kurangBlank.reduce((a, g) => a + g.total, 0),
      ),
      act: [e.see, onScores],
    });
  if (tanpaCatatan.length)
    open.push({
      tag: "catatan",
      tone: "accent",
      text: e.openNote(daftar(tanpaCatatan)),
      act: [e.see, onScores],
    });

  return (
    <div
      className="stack stack--lg endflow"
      style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}
    >
      <header className="page-header__heading">
        <span className="page-header__eyebrow">
          {t.afterEyebrow(modulLabel(sesi.modul, lang), kapanSesi(t, sesi))}
        </span>
        <h1 className="page-header__title">{e.title(modulLabel(sesi.modul, lang))}</h1>
        <p className="page-header__subtitle">
          {e.sub(sesi.selesaiPada ? jamMenit(sesi.selesaiPada, lang) : "", ran, sampai)}
        </p>
      </header>

      <ol className="endsteps">
        {STEPS.map((k, i) => (
          <li key={k}>
            <button
              type="button"
              className="endsteps__b sweep-hover"
              data-state={i < idx ? "done" : i === idx ? "now" : "later"}
              aria-current={i === idx ? "step" : undefined}
              onClick={() => setStep(k)}
            >
              <span className="seq__node mono" aria-hidden="true">
                {i < idx ? <CheckIcon size={14} weight="bold" /> : i + 1}
              </span>
              <b>{e.steps[k]}</b>
            </button>
          </li>
        ))}
      </ol>

      <Fade k={step}>
        {step === "rekap" ? (
          <div className="dt__grid">
            <section className="panel panel--key lp">
              <div className="panel__head">
                <h2 className="panel__title">{e.happened}</h2>
              </div>
              <div className="lp__nums lp__nums--4">
                <div>
                  <b className="mono">
                    <CountUp value={n} />/{total}
                  </b>
                  <span>{t.statFeedback}</span>
                </div>
                <div>
                  <b className="mono">{sum ? `${sum.lengkap}/${sum.siswa}` : <Nil dot />}</b>
                  <span>{t.statScores}</span>
                </div>
                <div>
                  <b className="mono">{sum ? `${sum.benar}/${sum.total}` : <Nil dot />}</b>
                  <span>{t.statBlanks}</span>
                </div>
                <div>
                  <b className="mono">
                    {sum?.delay != null ? `${sum.delay} ms` : <Nil lang={lang} />}
                  </b>
                  <span>{t.statDelay}</span>
                </div>
              </div>
              {!sum ? (
                <span className="skeleton" style={{ height: 140 }} />
              ) : (
                <div className="stack stack--sm">
                  {grup.map((g) => (
                    <div
                      key={g.id}
                      className="endrow"
                      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
                    >
                      <b>
                        {t.group(g.nomor)} · {namaKelompok(g.nomor, g.nama)}
                      </b>
                      <span
                        className="cells__row grow"
                        style={{ "--c": "var(--g)" } as CSSProperties}
                      >
                        {Array.from({ length: Math.max(1, Math.min(g.total, 16)) }, (_, j) => (
                          <i
                            key={j}
                            data-on={
                              j <
                              Math.round((g.benar / Math.max(1, g.total)) * Math.min(g.total, 16))
                                ? "yes"
                                : "no"
                            }
                          />
                        ))}
                      </span>
                      <span className="num hint">
                        {g.benar}/{g.total}
                      </span>
                      <span className="num hint">{e.here(g.lengkap, g.anggota)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="panel__actions">
                <a className="btn" href={href(lang, `/reports?sesi=${sesi.id}`)}>
                  <ChartBarIcon size={18} aria-hidden="true" />
                  {t.doneReport}
                </a>
              </div>
            </section>
            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">{e.open}</h2>
                {open.length > 0 && <Pill tone="warn">{open.length}</Pill>}
              </div>
              <SeelabsLine lang={lang} data={seelabs} onOpen={() => onSeelabs("salin")} as="div" />
              {!sum ? (
                <span className="skeleton" style={{ height: 96 }} />
              ) : open.length === 0 ? (
                <p className="hint">{t.afterNone}</p>
              ) : (
                <ol className="elog todo10">
                  {open.map((x, i) => (
                    <li key={i} className="elog__row todo10__row">
                      <span className="elog__tag mono" data-tone={x.tone}>
                        {e.tag[x.tag]}
                      </span>
                      <span className="elog__text">{x.text}</span>
                      <span className="todo10__acts">
                        <button type="button" className="btn btn--sm" onClick={x.act[1]}>
                          {x.act[0]}
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="panel__actions">
                {capped ? (
                  <button type="button" className="btn" onClick={onNext}>
                    <CalendarDotsIcon size={18} aria-hidden="true" />
                    {t.afterNextReady}
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost" onClick={() => void resume()}>
                    <ArrowClockwiseIcon size={18} aria-hidden="true" />
                    {t.afterResume}
                  </button>
                )}
                <button type="button" className="btn btn--primary" onClick={() => setStep("nilai")}>
                  {e.toScores}
                  <ArrowRightIcon size={18} aria-hidden="true" />
                </button>
              </div>
              {capped ? (
                <span className="hint">
                  <LockSimpleIcon size={14} aria-hidden="true" /> {t.afterCapped}
                </span>
              ) : (
                <span className="hint">{t.afterStopped(ran, SESI_CAP_MENIT - ran)}</span>
              )}
            </section>
          </div>
        ) : step === "nilai" ? (
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{e.sendTitle}</h2>
              <span className="hint">{e.sendSub}</span>
            </div>
            {!nilai.data ? (
              <span className="skeleton" style={{ height: 200 }} />
            ) : (
              <div className="stack stack--sm">
                {nilai.data.kelompok.map((g) => {
                  const owner = nilai.data!.pemilik[g.id] ?? null;
                  const hadirN = g.anggota.filter((a) => !a.absen).length;
                  return (
                    <div
                      key={g.id}
                      className="endrow endrow--big"
                      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
                    >
                      <span className="mtx__g" style={{ cursor: "default" }}>
                        <i />
                        {t.group(g.nomor)} · {namaKelompok(g.nomor, g.nama)}
                      </span>
                      <span className="hint grow">
                        {e.asisten(kodeOf(owner))} · {e.here(hadirN, g.anggota.length)}
                      </span>
                      <KirimNilai
                        t={t}
                        nilai={nilai}
                        kelompokId={g.id}
                        canEdit={!owner || owner === meNim}
                        compact
                      />
                      <button type="button" className="btn btn--sm" onClick={onScores}>
                        <PencilSimpleIcon size={16} aria-hidden="true" />
                        {e.fill}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="panel__actions">
              <button type="button" className="btn" onClick={onScores}>
                <TableIcon size={18} aria-hidden="true" />
                {e.fullTable}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setStep("seelabs")}>
                {e.toSeelabs}
                <ArrowRightIcon size={18} aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : step === "seelabs" ? (
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{e.seelabsTitle}</h2>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onSeelabs("panduan")}
              >
                <BookOpenTextIcon size={16} aria-hidden="true" />
                {e.guide}
              </button>
            </div>
            <span className="hint">{e.seelabsSub}</span>
            <SeelabsLine lang={lang} data={seelabs} onOpen={() => onSeelabs("salin")} as="div" />
            <div className="panel__actions">
              <button type="button" className="btn" onClick={() => onSeelabs("salin")}>
                <CopyIcon size={18} aria-hidden="true" />
                {e.copy}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setStep("selesai")}>
                {e.finish}
                <ArrowRightIcon size={18} aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : (
          <section className="panel panel--key lp endflow__done">
            <div className="todo10__empty">
              <span className="state10__ic">
                <CheckCircleIcon size={30} aria-hidden="true" />
              </span>
              <b>{e.doneTitle}</b>
              <span className="hint">{e.doneBody}</span>
            </div>
            <div className="panel__actions">
              <button type="button" className="btn" onClick={onNew}>
                <HouseIcon size={18} aria-hidden="true" />
                {t.doneNew}
              </button>
              <button type="button" className="btn btn--primary" onClick={onNext}>
                <CalendarDotsIcon size={18} aria-hidden="true" />
                {t.afterNextReady}
              </button>
            </div>
          </section>
        )}
      </Fade>
    </div>
  );
}
