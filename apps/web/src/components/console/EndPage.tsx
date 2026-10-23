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
 * - SeeLabs: the SeeLabs line (the robot's status) and the guide.
 * - Selesai: journals lock into history, sent scores show on the
 *   Dashboard; To the Console or Get the Next Session Ready (NextView).
 *
 * 2026-10-22: the Praktikan's line stepper across the top; each group's
 * blanks as a ring; Still Open names its groups as chips; Nilai shows how
 * full each group is and offers Kirim Nilai only once it can be sent;
 * SeeLabs lists each group's status; Selesai sums up what went out.
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  CaretRightIcon,
  CheckCircleIcon,
  LockSimpleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { CountUp, ProgressRing } from "../ui/Display";
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
import type { Titik } from "../../lib/langkah-garis";
import { useSegar } from "../../lib/siaran";
import LineStepper from "../module/LineStepper";
import { pesan, type Strings } from "./strings";
import { useRingkasSesi } from "./ringkasSesi";
import KirimNilai from "./KirimNilai";
import SeelabsLine, { belumTersimpan } from "./seelabs/SeelabsLine";
import StatusPill from "./seelabs/StatusPill";
import { SL } from "./seelabs/strings";
import type { SeelabsData } from "./seelabs/data";
import { l1Anggota, type NilaiLive } from "./data";
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
    openScores: (n: number) => `${n} praktikan belum dinilai lengkap`,
    openBlanks: (a: number, b: number) => `Blank benar ${a}/${b}`,
    openNote: "Catatan kelompok masih kosong",
    toScores: "Ke Nilai",
    toSeelabs: "Ke SeeLabs",
    see: "Lihat",
    fill: "Isi",
    sendTitle: "Kirim Nilai per Kelompok",
    sendSub: "Kirim Nilai muncul begitu kelompoknya lengkap. Yang terkirim dihitung ke pembayaran.",
    fullTable: "Tabel Nilai Lengkap",
    here: (a: number, b: number) => `${a}/${b} hadir`,
    scored: (a: number, b: number) => `nilai lengkap ${a}/${b}`,
    noteOk: "ada catatan",
    noteNo: "belum ada catatan",
    filled: (a: number, b: number) => `${a}/${b} kolom terisi`,
    asisten: (k: string) => `Asisten ${k}`,
    seelabsTitle: "Kirim ke SeeLabs",
    seelabsSub:
      "Robot menyimpan nilai ke SeeLabs setelah Kirim Nilai. Status tiap kelompok ada di sini.",
    seelabsTot: "Sesi TOT tidak dikirim ke SeeLabs.",
    seelabsWait: "Status SeeLabs belum terbaca. Coba lagi sebentar.",
    guide: "Panduan",
    finish: "Selesai",
    doneTitle: "Sesi Beres",
    doneBody:
      "Jurnal Praktikan terkunci jadi riwayat. Nilai yang terkirim tampil di Dasbor mereka. Umpan balik bisa diisi kapan saja.",
    sumSent: (a: number, b: number) => `Nilai terkirim ${a} dari ${b} kelompok`,
    sumSeelabs: (a: number, b: number) => `Tersimpan di SeeLabs ${a} dari ${b} kelompok`,
    sumSeelabsTot: "SeeLabs tidak dipakai di sesi TOT",
    sumFeedback: (a: number, b: number) => `Umpan balik masuk ${a} dari ${b}`,
  },
  en: {
    title: (m: string) => `${m} Session Ended`,
    sub: (jam: string, menit: number, sampai: string | null) =>
      `Ended ${jam} · ${menit} minutes${sampai ? ` · can resume until ${sampai}` : ""}`,
    steps: { rekap: "Recap", nilai: "Scores", seelabs: "SeeLabs", selesai: "Done" },
    happened: "What Happened",
    open: "Still Open",
    tag: { nilai: "SCORES", blank: "BLANK", catatan: "NOTE", seelabs: "SEELABS" },
    openScores: (n: number) => `${n} students not fully scored`,
    openBlanks: (a: number, b: number) => `Blanks right ${a}/${b}`,
    openNote: "The group note is still empty",
    toScores: "To Scores",
    toSeelabs: "To SeeLabs",
    see: "See",
    fill: "Fill",
    sendTitle: "Send Scores per Group",
    sendSub: "Kirim Nilai shows once a group is complete. Sent groups count toward pay.",
    fullTable: "Full Score Table",
    here: (a: number, b: number) => `${a}/${b} here`,
    scored: (a: number, b: number) => `fully scored ${a}/${b}`,
    noteOk: "note written",
    noteNo: "no note yet",
    filled: (a: number, b: number) => `${a}/${b} fields filled`,
    asisten: (k: string) => `Assistant ${k}`,
    seelabsTitle: "Send to SeeLabs",
    seelabsSub:
      "The robot saves the scores to SeeLabs after Kirim Nilai. Each group's status is here.",
    seelabsTot: "TOT sessions don't go to SeeLabs.",
    seelabsWait: "The SeeLabs status hasn't come in yet. Try again in a moment.",
    guide: "Guide",
    finish: "Finish",
    doneTitle: "Session Wrapped Up",
    doneBody:
      "The students' journals lock into history. Sent scores show on their Dashboard. Feedback stays open any time.",
    sumSent: (a: number, b: number) => `Scores sent for ${a} of ${b} groups`,
    sumSeelabs: (a: number, b: number) => `Saved in SeeLabs for ${a} of ${b} groups`,
    sumSeelabsTot: "SeeLabs isn't used in TOT sessions",
    sumFeedback: (a: number, b: number) => `Feedback in from ${a} of ${b}`,
  },
  zh: {
    title: (m: string) => `${m}的课已结束`,
    sub: (jam: string, menit: number, sampai: string | null) =>
      `${jam} 结束 · ${menit} 分钟${sampai ? ` · ${sampai} 前可继续` : ""}`,
    steps: { rekap: "回顾", nilai: "成绩", seelabs: "SeeLabs", selesai: "完成" },
    happened: "发生了什么",
    open: "还没处理完",
    tag: { nilai: "成绩", blank: "空格", catatan: "备注", seelabs: "SEELABS" },
    openScores: (n: number) => `${n} 名学生成绩没填完`,
    openBlanks: (a: number, b: number) => `填对 ${a}/${b}`,
    openNote: "小组备注还是空的",
    toScores: "去成绩",
    toSeelabs: "去 SeeLabs",
    see: "查看",
    fill: "填写",
    sendTitle: "按组发送成绩",
    sendSub: "小组填完后才会出现“发送分数”。发送后计入报酬。",
    fullTable: "完整成绩表",
    here: (a: number, b: number) => `${a}/${b} 出席`,
    scored: (a: number, b: number) => `成绩填完 ${a}/${b}`,
    noteOk: "有备注",
    noteNo: "还没有备注",
    filled: (a: number, b: number) => `已填 ${a}/${b} 格`,
    asisten: (k: string) => `助教 ${k}`,
    seelabsTitle: "提交到 SeeLabs",
    seelabsSub: "点“发送分数”后，机器人会把分数保存到 SeeLabs。每个小组的状态在这里。",
    seelabsTot: "TOT 课不提交到 SeeLabs。",
    seelabsWait: "还没读到 SeeLabs 状态。稍后再试。",
    guide: "指南",
    finish: "完成",
    doneTitle: "这节课处理完了",
    doneBody: "学生的实验报告锁定为记录。已发送的成绩显示在他们的仪表板上。反馈随时可以填。",
    sumSent: (a: number, b: number) => `${b} 个小组中已发送 ${a} 个的成绩`,
    sumSeelabs: (a: number, b: number) => `${b} 个小组中 ${a} 个已存入 SeeLabs`,
    sumSeelabsTot: "TOT 课不使用 SeeLabs",
    sumFeedback: (a: number, b: number) => `${b} 人中 ${a} 人已反馈`,
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
  seelabsKode = null,
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
  /** Why there is no SeeLabs data ("sesi_tot"), from useSeelabs. */
  seelabsKode?: string | null;
  nilai: NilaiLive;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  onSeelabs: () => void;
  onScores: () => void;
  onResumed: () => void;
  onNext: () => void;
  onNew: () => void;
}) {
  const e = E[lang];
  const sl = SL[lang];
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

  // Each group's fields: how many of all are filled, and whether it went out.
  const isian = (nilai.data?.kelompok ?? []).map((g) => {
    const d = nilai.data!;
    const kurang = g.anggota.reduce((a, m) => {
      const skor: typeof m.skor = { ...m.skor, L1: l1Anggota(m, g.l1) };
      return a + d.komponen.filter((c) => skor[c] == null).length;
    }, 0);
    const semua = g.anggota.length * d.komponen.length;
    return { g, kurang, semua, terkirim: !!d.terkirim[g.nomor] };
  });
  const terkirimN = isian.filter((x) => x.terkirim).length;
  const tersimpan = (seelabs?.kelompok ?? []).filter((g) => g.status === "terkirim").length;
  const tot = seelabsKode === "sesi_tot" || sesi.jenis === "tot";
  const belumSl = belumTersimpan(seelabs);

  const open: {
    tag: keyof typeof e.tag;
    tone: string;
    text: string;
    nomor: number[];
    act: [string, () => void];
  }[] = [];
  const kurangNilai = grup.filter((g) => g.lengkap < g.anggota);
  const kurangBlank = grup.filter((g) => g.benar < g.total);
  const tanpaCatatan = grup.filter((g) => !g.catatan);
  if (kurangNilai.length)
    open.push({
      tag: "nilai",
      tone: "warn",
      text: e.openScores(kurangNilai.reduce((a, g) => a + g.anggota - g.lengkap, 0)),
      nomor: kurangNilai.map((g) => g.nomor),
      act: [e.fill, () => setStep("nilai")],
    });
  if (kurangBlank.length)
    open.push({
      tag: "blank",
      tone: "violet",
      text: e.openBlanks(
        kurangBlank.reduce((a, g) => a + g.benar, 0),
        kurangBlank.reduce((a, g) => a + g.total, 0),
      ),
      nomor: kurangBlank.map((g) => g.nomor),
      act: [e.see, onScores],
    });
  if (tanpaCatatan.length)
    open.push({
      tag: "catatan",
      tone: "accent",
      text: e.openNote,
      nomor: tanpaCatatan.map((g) => g.nomor),
      act: [e.see, onScores],
    });

  const titik: Titik[] = STEPS.map((_, i) => (i < idx ? "selesai" : i === idx ? "kini" : "buka"));
  const nada = (s: Step) =>
    s === "nilai" && terkirimN < isian.length
      ? ("warn" as const)
      : s === "seelabs" && !tot && belumSl.length > 0
        ? ("warn" as const)
        : undefined;
  // Each group as its number in its own hue, named in full for readers.
  const chipsNomor = (nomor: number[]) => (
    <span className="endopen__chips" role="list">
      {nomor.map((k) => (
        <span
          key={k}
          role="listitem"
          className="endopen__k num"
          title={t.groupShort(k)}
          aria-label={t.groupShort(k)}
          style={{ "--g": `var(--group-${k})` } as CSSProperties}
        >
          {k}
        </span>
      ))}
    </span>
  );

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

      <LineStepper
        lang={lang}
        steps={STEPS}
        step={step}
        label={e.steps}
        titik={titik}
        prev={idx > 0 ? STEPS[idx - 1] : null}
        next={idx < STEPS.length - 1 ? STEPS[idx + 1] : null}
        nada={nada}
        siap={false}
        alasan={null}
        tertahan={false}
        tip={() => undefined}
        onGo={setStep}
        onPrev={() => idx > 0 && setStep(STEPS[idx - 1])}
        onNext={() => idx < STEPS.length - 1 && setStep(STEPS[idx + 1])}
      />

      <Fade k={step}>
        {step === "rekap" ? (
          <div className="dt__grid endflow__rekap">
            <section className="panel panel--key lp">
              <div className="panel__head">
                <h2 className="panel__title">{e.happened}</h2>
              </div>
              <div className="lp__nums lp__nums--4 endflow__nums">
                <div>
                  <b className="num">
                    <CountUp value={n} />/{total}
                  </b>
                  <span>{t.statFeedback}</span>
                </div>
                <div>
                  <b className="num">{sum ? `${sum.lengkap}/${sum.siswa}` : <Nil dot />}</b>
                  <span>{t.statScores}</span>
                </div>
                <div>
                  <b className="num">{sum ? `${sum.benar}/${sum.total}` : <Nil dot />}</b>
                  <span>{t.statBlanks}</span>
                </div>
                <div>
                  <b className="num">{sum?.delay != null ? `${sum.delay} ms` : <Nil dot />}</b>
                  <span>{t.statDelay}</span>
                </div>
              </div>
              {!sum ? (
                <span className="skeleton" style={{ height: 140 }} />
              ) : (
                <ul className="endgrp">
                  {grup.map((g) => (
                    <li
                      key={g.id}
                      className="endgrp__row"
                      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
                    >
                      <ProgressRing value={g.benar} max={Math.max(1, g.total)} color="var(--g)" />
                      <span className="stack endgrp__who">
                        <b>
                          {t.group(g.nomor)} · {namaKelompok(g.nomor, g.nama)}
                        </b>
                        <span className="hint">
                          {e.scored(g.lengkap, g.anggota)} · {g.catatan ? e.noteOk : e.noteNo}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="panel__actions">
                <a className="btn" href={href(lang, `/reports?sesi=${sesi.id}`)}>
                  {t.doneReport}
                </a>
              </div>
            </section>
            <section className="panel endflow__open">
              <div className="panel__head">
                <h2 className="panel__title">{e.open}</h2>
                {open.length > 0 && <Pill tone="warn">{open.length}</Pill>}
              </div>
              <SeelabsLine lang={lang} data={seelabs} onOpen={() => setStep("seelabs")} as="div" />
              {!sum ? (
                <span className="skeleton" style={{ height: 96 }} />
              ) : open.length === 0 ? (
                <p className="hint">{t.afterNone}</p>
              ) : (
                <ol className="endopen">
                  {open.map((x) => (
                    <li key={x.tag} className="endopen__row">
                      <span className="elog__tag mono" data-tone={x.tone}>
                        {e.tag[x.tag]}
                      </span>
                      <span className="stack endopen__main">
                        <span>{x.text}</span>
                        {chipsNomor(x.nomor)}
                      </span>
                      <button type="button" className="btn btn--sm" onClick={x.act[1]}>
                        {x.act[0]}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="panel__actions">
                {capped ? (
                  <button type="button" className="btn" onClick={onNext}>
                    {t.afterNextReady}
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost" onClick={() => void resume()}>
                    {t.afterResume}
                  </button>
                )}
                <button type="button" className="btn btn--primary" onClick={() => setStep("nilai")}>
                  {e.toScores}
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
              <ul className="endgrp endgrp--nilai">
                {isian.map(({ g, kurang, semua, terkirim }) => {
                  const owner = nilai.data!.pemilik[g.id] ?? null;
                  const hadirN = g.anggota.filter((a) => !a.absen).length;
                  const isi = semua - kurang;
                  return (
                    <li
                      key={g.id}
                      className="endgrp__row"
                      style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
                    >
                      <span className="stack endgrp__who">
                        <span className="mtx__g" style={{ cursor: "default" }}>
                          <i />
                          {t.group(g.nomor)} · {namaKelompok(g.nomor, g.nama)}
                        </span>
                        <span className="hint">
                          {e.asisten(kodeOf(owner))} · {e.here(hadirN, g.anggota.length)}
                        </span>
                      </span>
                      <span className="endgrp__act">
                        {terkirim || kurang === 0 ? (
                          <KirimNilai
                            t={t}
                            nilai={nilai}
                            kelompokId={g.id}
                            canEdit={!owner || owner === meNim}
                            seelabs={seelabs}
                            compact
                          />
                        ) : (
                          <>
                            <span className="endgrp__meter">
                              <span
                                className="meter"
                                style={
                                  {
                                    "--meter": Math.round((isi / Math.max(1, semua)) * 100),
                                    "--meter-hue": "var(--g)",
                                  } as CSSProperties
                                }
                              />
                              <span className="hint num">{e.filled(isi, semua)}</span>
                            </span>
                            <button type="button" className="btn btn--sm" onClick={onScores}>
                              {e.fill}
                            </button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="panel__actions">
              <button type="button" className="btn" onClick={onScores}>
                {e.fullTable}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setStep("seelabs")}>
                {e.toSeelabs}
              </button>
            </div>
          </section>
        ) : step === "seelabs" ? (
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{e.seelabsTitle}</h2>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onSeelabs}>
                {e.guide}
                <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
              </button>
            </div>
            {tot ? (
              <p className="hint">{e.seelabsTot}</p>
            ) : !seelabs ? (
              <p className="hint">{e.seelabsWait}</p>
            ) : (
              <>
                <span className="hint">{e.seelabsSub}</span>
                <SeelabsLine lang={lang} data={seelabs} as="div" />
                <ul className="endgrp endgrp--sl">
                  {seelabs.kelompok.map((k) => (
                    <li
                      key={k.nomor}
                      className="endgrp__row"
                      style={{ "--g": `var(--group-${k.nomor})` } as CSSProperties}
                    >
                      <span className="mtx__g" style={{ cursor: "default" }}>
                        <i />
                        {t.group(k.nomor)}
                      </span>
                      <span className="endgrp__act">
                        <StatusPill t={sl} status={k.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="panel__actions">
              <button type="button" className="btn btn--primary" onClick={() => setStep("selesai")}>
                {e.finish}
              </button>
            </div>
          </section>
        ) : (
          <section className="panel panel--key lp endflow__done">
            <div className="todo10__empty endflow__fin">
              <span className="state10__ic endflow__ic">
                <CheckCircleIcon size={30} aria-hidden="true" />
              </span>
              <b>{e.doneTitle}</b>
              <span className="hint">{e.doneBody}</span>
            </div>
            <ul className="endsum">
              {[
                {
                  ok: isian.length > 0 && terkirimN === isian.length,
                  text: e.sumSent(terkirimN, isian.length),
                },
                tot
                  ? { ok: true, text: e.sumSeelabsTot }
                  : {
                      ok: isian.length > 0 && tersimpan === isian.length,
                      text: e.sumSeelabs(tersimpan, isian.length),
                    },
                { ok: total > 0 && n >= total, text: e.sumFeedback(n, total) },
              ].map((x, i) => (
                <li
                  key={i}
                  className="endsum__row"
                  data-ok={x.ok ? "yes" : undefined}
                  style={{ "--i": i } as CSSProperties}
                >
                  {x.ok ? (
                    <CheckCircleIcon size={18} aria-hidden="true" />
                  ) : (
                    <WarningIcon size={18} aria-hidden="true" />
                  )}
                  {x.text}
                </li>
              ))}
            </ul>
            <div className="panel__actions">
              <button type="button" className="btn" onClick={onNew}>
                {t.doneNew}
              </button>
              <button type="button" className="btn btn--primary" onClick={onNext}>
                {t.afterNextReady}
              </button>
            </div>
          </section>
        )}
      </Fade>
    </div>
  );
}
