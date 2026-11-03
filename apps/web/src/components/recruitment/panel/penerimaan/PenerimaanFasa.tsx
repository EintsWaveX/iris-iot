/**
 * Penerimaan after the confirm, as the mockup draws it (screens-rec8.js Hasil and Tutup): the result of Jadikan Asisten
 * (a hero, the people who were created, the audit log and what comes next), then closing the edition (the retention
 * clock, how it closes, what turns read-only and what happens to the data).
 */
import { NOUN, Paged } from "../../../ui/Pager";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  ConfettiIcon,
  FileTextIcon,
  LockSimpleIcon,
  NotePencilIcon,
  ShieldCheckIcon,
  SealCheckIcon,
  UserCheckIcon,
  UserPlusIcon,
  ClipboardTextIcon,
  ArrowLeftIcon,
  type IconProps,
} from "@phosphor-icons/react";
import type { ComponentType, CSSProperties } from "react";
import HoldButton from "../../../ui/HoldButton";
import Pill from "../../../ui/Pill";
import { Stepper, Switch } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import type { PnListResponse, PnRow } from "../../../../lib/recruitment/pn-client";
import { Stc, tgl } from "../../shared";

type Words = {
  hero: {
    done: string;
    again: string;
    created: (n: number) => string;
    byAgain: (by: string, at: string, n: number) => string;
    by: (by: string, at: string, reveal: string) => string;
    celebrate: string;
    toClose: string;
  };
  table: {
    title: string;
    hint: (n: number) => string;
    cols: [string, string, string, string, string];
    none: string;
    alsoPrak: string;
    asisten: string;
    kept: string;
  };
  audit: {
    title: string;
    entries: (n: number) => string;
    run: string;
    skipOnly: (n: number) => string;
    made: (n: number, m: number) => string;
    again: string;
  };
  next: {
    title: string;
    open: string;
    place: string;
    placeHint: string;
    close: string;
    closeHint: (d: number, on: string, m: number) => string;
  };
  legend: string;
  tutup: {
    openEyebrow: string;
    autoEyebrow: string;
    handEyebrow: string;
    notStarted: string;
    head: (purge: string) => string;
    headOpen: (m: number) => string;
    leadAuto: (on: string, d: number) => string;
    leadHand: (on: string) => string;
    leadPlan: (on: string, d: number) => string;
    leadOff: string;
    dayOf: (done: number, total: number) => string;
    clockOpen: (total: number, until: string) => string;
    daysLeft: string;
    days: string;
    tl: string;
    tlReveal: string;
    tlAuto: string;
    tlHand: string;
    tlPlan: string;
    tlPurge: string;
    hold: string;
    back: string;
    howTitle: string;
    howLede: string;
    swTitle: string;
    swHint: string;
    nTitle: string;
    nHint: (rev: string, on: string) => string;
    byTitle: string;
    byHint: string;
    badgeAvail: string;
    badgeUsed: string;
    badgeNot: string;
    retTitle: string;
    retHint: string;
    nDays: (n: number) => string;
    nMonths: (n: number) => string;
    roTitle: string;
    roLocked: string;
    roAfter: string;
    locks: string[];
    roHint: string;
    dataTitle: string;
    keeps: { ic: string; t: string; s: string; purge: boolean }[];
    stays: string;
    guard: string;
    legend: (n: number, out: number) => string;
    done: string;
    ro: string;
  };
};

const W: Record<Lang, Words> = {
  id: {
    hero: {
      done: "Jadikan Asisten selesai",
      again: "Sudah dilakukan",
      created: (n) => `${n} Asisten baru dibuat`,
      byAgain: (by, at, n) =>
        `Dijalankan oleh ${by} pada ${at}. Kalau dijalankan lagi, ${n} orang yang sudah ada dilewati.`,
      by: (by, at, reveal) => `Oleh ${by} pada ${at}. Amplop mereka terbuka ${reveal}.`,
      celebrate: "Putar Perayaan",
      toClose: "Lanjut Tutup Edisi",
    },
    table: {
      title: "Asisten yang Dibuat",
      hint: (n) => `${n} orang · tanpa divisi · status Aktif`,
      cols: ["Kode", "Nama", "Divisi", "Lencana", "Riwayat Praktikan"],
      none: "Belum ada",
      alsoPrak: "Juga Praktikan",
      asisten: "Asisten",
      kept: "Riwayat tersimpan",
    },
    audit: {
      title: "Catatan Audit",
      run: "Jadikan Asisten dijalankan",
      entries: (n) => `${n} entri`,
      skipOnly: (n) => `0 dibuat, ${n} dilewati karena sudah ada`,
      made: (n, m) => `${n} dibuat, ${m} dilewati`,
      again: "Jalankan Lagi (Aman)",
    },
    next: {
      title: "Berikutnya",
      open: "Amplop terbuka",
      place: "Panitia menempatkan divisi",
      placeHint: "Asisten baru belum punya divisi",
      close: "Edisi ditutup",
      closeHint: (d, on, m) =>
        `Ketua menutupnya, atau otomatis ${d} hari setelah pengumuman (${on}). Jam penyimpanan ${m} bulan mulai berjalan.`,
    },
    legend: "Asisten baru yang bukan Panitia tidak bisa membuka dokumen atau jawaban kandidat.",
    tutup: {
      openEyebrow: "Jam penyimpanan belum berjalan",
      autoEyebrow: "Edisi ditutup otomatis",
      handEyebrow: "Edisi ditutup oleh Ketua",
      notStarted: "belum",
      head: (purge) => `Dokumen dan jawaban dihapus ${purge}`,
      headOpen: (m) => `Menutup edisi memulai jam ${m} bulan`,
      leadAuto: (on, d) => `Ditutup otomatis ${on}, ${d} hari setelah pengumuman.`,
      leadHand: (on) => `Ditutup Ketua ${on}.`,
      leadPlan: (on, d) =>
        `Kalau tidak ditutup lebih dulu, edisi menutup sendiri ${on}, ${d} hari setelah pengumuman.`,
      leadOff: "Penutupan otomatis mati. Hanya Ketua yang bisa menutup edisi.",
      dayOf: (done, total) =>
        `Hari ke ${done} dari ${total}. Pekerjaan penghapusan yang sudah ada yang menghapusnya, bukan layar ini.`,
      clockOpen: (total, until) =>
        `Jamnya ${total} hari, sampai ${until}. Setelah itu pekerjaan penghapusan yang sudah ada menghapus dokumen dan jawaban.`,
      daysLeft: "hari lagi",
      days: "hari",
      tl: "Garis waktu penutupan",
      tlReveal: "Pengumuman",
      tlAuto: "Ditutup otomatis",
      tlHand: "Ditutup Ketua",
      tlPlan: "Tutup otomatis",
      tlPurge: "Dokumen dihapus",
      hold: "Tutup Edisi Sekarang",
      back: "Kembali ke Hasil",
      howTitle: "Cara Edisi Ditutup",
      howLede:
        "Dua cara berjalan bersama: Ketua menutupnya sendiri, atau edisi menutup sendiri. Yang lebih dulu menang. Hanya Ketua yang mengubah angka di sini, dan angkanya terkunci setelah ditutup.",
      swTitle: "Tutup otomatis",
      swHint:
        "Edisi menutup sendiri beberapa hari setelah pengumuman, supaya jam penyimpanan tidak bergantung pada ingatan siapa pun.",
      nTitle: "Hari setelah pengumuman (N)",
      nHint: (rev, on) => `Pengumuman ${rev}, jadi menutup ${on}. Bawaan 14 hari.`,
      byTitle: "Oleh Ketua",
      byHint:
        "Kapan saja setelah Jadikan Asisten: tahan Tutup Edisi Sekarang. Menutup lebih awal memulai jam penyimpanan lebih awal.",
      badgeAvail: "Tersedia",
      badgeUsed: "Dipakai",
      badgeNot: "Tidak dipakai",
      retTitle: "Jam penyimpanan",
      retHint:
        "Berapa bulan dokumen dan jawaban kandidat disimpan sejak edisi ditutup, hanya dilihat Panitia. Bawaan 6 bulan.",
      nDays: (n) => `${n} hari`,
      nMonths: (n) => `${n} bulan`,
      roTitle: "Jadi Hanya Bisa Dibaca",
      roLocked: "Terkunci",
      roAfter: "Setelah ditutup",
      locks: [
        "Cutting, Plotting, Tes dan Penilaian",
        "Daftar Penerimaan dan kode",
        "Kalender dan Papan Panitia",
        "Pendaftaran dan jadwal kandidat",
      ],
      roHint:
        "Setiap tab Panitia menampilkan pita Edisi ditutup dan mengunci tombol yang mengubah data. Membaca dan download laporan tetap boleh.",
      dataTitle: "Apa yang Terjadi pada Data",
      keeps: [
        { ic: "file", t: "Dokumen kandidat", s: "Dilihat Panitia saja, lalu dihapus", purge: true },
        {
          ic: "note",
          t: "Jawaban tes dan lembar penilaian",
          s: "Dilihat Panitia saja, lalu dihapus",
          purge: true,
        },
        {
          ic: "user",
          t: "Akun, kode dan riwayat Asisten baru",
          s: "Bukan data kandidat, tetap ada",
          purge: false,
        },
        { ic: "clip", t: "Catatan audit", s: "Tetap ada", purge: false },
      ],
      stays: "Tetap",
      guard:
        "Asisten baru yang bukan Panitia tidak pernah bisa membuka dokumen atau jawaban kandidat, sebelum maupun sesudah penutupan.",
      legend: (n, out) =>
        `${n} Asisten dibuat, ${out} CaAs tidak diterima. Perjalanan CaAs yang tidak diterima dibekukan; mereka tetap melihat perjalanannya sendiri sampai data dihapus.`,
      done: "Edisi ditutup.",
      ro: "Hanya Ketua yang bisa mengubah ini.",
    },
  },
  en: {
    hero: {
      done: "Make Them Asisten is done",
      again: "Already done",
      created: (n) => `${n} new Asisten created`,
      byAgain: (by, at, n) =>
        `Run by ${by} on ${at}. If it runs again, the ${n} who already exist are skipped.`,
      by: (by, at, reveal) => `By ${by} on ${at}. Their envelopes open ${reveal}.`,
      celebrate: "Play the Celebration",
      toClose: "Continue to Close",
    },
    table: {
      title: "Asisten Created",
      hint: (n) => `${n} people · no division · status Active`,
      cols: ["Code", "Name", "Division", "Badges", "Praktikan history"],
      none: "None yet",
      alsoPrak: "Also Praktikan",
      asisten: "Asisten",
      kept: "History kept",
    },
    audit: {
      title: "Audit Log",
      run: "Make Them Asisten run",
      entries: (n) => `${n} ${n === 1 ? "entry" : "entries"}`,
      skipOnly: (n) => `0 created, ${n} skipped because they exist`,
      made: (n, m) => `${n} created, ${m} skipped`,
      again: "Run Again (Safe)",
    },
    next: {
      title: "What Is Next",
      open: "Envelopes open",
      place: "Panitia place divisions",
      placeHint: "New Asisten have no division yet",
      close: "The edition closes",
      closeHint: (d, on, m) =>
        `The Ketua closes it, or it closes by itself ${d} days after the reveal (${on}). The ${m} month retention clock starts.`,
    },
    legend: "New Asisten who are not Panitia cannot open candidates' documents or answers.",
    tutup: {
      openEyebrow: "Retention clock not started",
      autoEyebrow: "Edition closed automatically",
      handEyebrow: "Edition closed by the Ketua",
      notStarted: "not yet",
      head: (purge) => `Documents and answers are deleted on ${purge}`,
      headOpen: (m) => `Closing starts a ${m} month clock`,
      leadAuto: (on, d) => `Closed automatically on ${on}, ${d} days after the reveal.`,
      leadHand: (on) => `Closed by the Ketua on ${on}.`,
      leadPlan: (on, d) =>
        `If nobody closes it sooner, the edition closes by itself on ${on}, ${d} days after the reveal.`,
      leadOff: "Automatic closing is off. Only the Ketua can close the edition.",
      dayOf: (done, total) =>
        `Day ${done} of ${total}. The existing purge job does the deleting, not this screen.`,
      clockOpen: (total, until) =>
        `The clock is ${total} days, until ${until}. After that the existing purge job deletes documents and answers.`,
      daysLeft: "days left",
      days: "days",
      tl: "Closing timeline",
      tlReveal: "Reveal",
      tlAuto: "Closed automatically",
      tlHand: "Closed by the Ketua",
      tlPlan: "Closes by itself",
      tlPurge: "Documents deleted",
      hold: "Close the Edition Now",
      back: "Back to the Result",
      howTitle: "How the Edition Closes",
      howLede:
        "Both ways run together: the Ketua closes it, or it closes by itself. Whichever comes first wins. Only the Ketua changes the numbers here, and they lock once it is closed.",
      swTitle: "Close by itself",
      swHint:
        "The edition closes by itself some days after the reveal, so the retention clock never depends on anyone remembering.",
      nTitle: "Days after the reveal (N)",
      nHint: (rev, on) => `The reveal is ${rev}, so it closes ${on}. 14 days by default.`,
      byTitle: "By the Ketua",
      byHint:
        "Any time after Make Them Asisten: hold Close the Edition Now. Closing sooner starts the retention clock sooner.",
      badgeAvail: "Available",
      badgeUsed: "Used",
      badgeNot: "Not used",
      retTitle: "Retention",
      retHint:
        "How many months candidate documents and answers are kept from the day the edition closes, seen by Panitia only. 6 months by default.",
      nDays: (n) => `${n} days`,
      nMonths: (n) => `${n} months`,
      roTitle: "Becomes Read Only",
      roLocked: "Locked",
      roAfter: "After closing",
      locks: [
        "Cutting, Plotting, Tests and Grading",
        "The Penerimaan list and codes",
        "Calendar and the Panitia board",
        "Applications and candidate schedules",
      ],
      roHint:
        "Every Panitia tab shows the Edition closed strip and locks the buttons that change data. Reading and downloading reports stay allowed.",
      dataTitle: "What Happens to the Data",
      keeps: [
        {
          ic: "file",
          t: "Candidate documents",
          s: "Seen by Panitia only, then deleted",
          purge: true,
        },
        {
          ic: "note",
          t: "Test answers and grading sheets",
          s: "Seen by Panitia only, then deleted",
          purge: true,
        },
        {
          ic: "user",
          t: "New Asisten accounts, codes and history",
          s: "Not candidate data, stays",
          purge: false,
        },
        { ic: "clip", t: "Audit log", s: "Stays", purge: false },
      ],
      stays: "Stays",
      guard:
        "New Asisten who are not Panitia can never open candidates' documents or answers, before or after closing.",
      legend: (n, out) =>
        `${n} Asisten created, ${out} CaAs not accepted. Their journeys are frozen; they keep seeing their own journey until the data is deleted.`,
      done: "Edition closed.",
      ro: "Only the Ketua can change this.",
    },
  },
  zh: {
    hero: {
      done: "转为助教已完成",
      again: "已经完成",
      created: (n) => `已创建 ${n} 名新助教`,
      byAgain: (by, at, n) =>
        `由 ${by} 于 ${at} 执行。之后的尝试跳过了已存在的 ${n} 人，没有重复创建任何人。`,
      by: (by, at, reveal) => `由 ${by} 于 ${at} 执行。他们的信封于 ${reveal} 开启。`,
      celebrate: "播放庆祝",
      toClose: "继续关闭本届",
    },
    table: {
      title: "已创建的助教",
      hint: (n) => `${n} 人 · 暂无分组 · 状态：活跃`,
      cols: ["代码", "姓名", "分组", "徽章", "实验学员记录"],
      none: "暂无",
      alsoPrak: "同时是实验学员",
      asisten: "助教",
      kept: "记录保留",
    },
    audit: {
      title: "审计记录",
      run: "转为助教已运行",
      entries: (n) => `${n} 条`,
      skipOnly: (n) => `创建 0 人，${n} 人已存在而跳过`,
      made: (n, m) => `创建 ${n} 人，跳过 ${m} 人`,
      again: "再次执行（安全）",
    },
    next: {
      title: "接下来",
      open: "信封开启",
      place: "组委会安排分组",
      placeHint: "新助教暂时没有分组",
      close: "本届关闭",
      closeHint: (d, on, m) =>
        `由组长关闭，或在公布后 ${d} 天自动关闭（${on}）。${m} 个月的保留期随之开始。`,
    },
    legend: "不是组委会成员的新助教无法打开候选人的文件或答案。",
    tutup: {
      openEyebrow: "保留期尚未开始",
      autoEyebrow: "本届已自动关闭",
      handEyebrow: "本届已由组长关闭",
      notStarted: "尚未",
      head: (purge) => `文件和答案将于 ${purge} 删除`,
      headOpen: (m) => `关闭本届会开始 ${m} 个月的保留期`,
      leadAuto: (on, d) => `于 ${on} 自动关闭，即公布后 ${d} 天。`,
      leadHand: (on) => `组长于 ${on} 关闭。`,
      leadPlan: (on, d) => `若无人提前关闭，本届将于 ${on} 自动关闭，即公布后 ${d} 天。`,
      leadOff: "自动关闭已关。只有组长可以关闭本届。",
      dayOf: (done, total) => `第 ${done} 天，共 ${total} 天。删除由现有的清理任务完成，不是本页。`,
      clockOpen: (total, until) =>
        `保留期共 ${total} 天，至 ${until}。之后现有的清理任务会删除文件和答案。`,
      daysLeft: "天剩余",
      days: "天",
      tl: "关闭时间线",
      tlReveal: "公布",
      tlAuto: "自动关闭",
      tlHand: "组长关闭",
      tlPlan: "自动关闭",
      tlPurge: "文件删除",
      hold: "立即关闭本届",
      back: "返回结果",
      howTitle: "本届如何关闭",
      howLede:
        "两种方式同时有效：组长自己关闭，或本届自动关闭，谁先到谁生效。只有组长可以改这里的数字，关闭后即锁定。",
      swTitle: "自动关闭",
      swHint: "本届在公布后几天自动关闭，保留期因此不依赖任何人记得。",
      nTitle: "公布后天数（N）",
      nHint: (rev, on) => `公布日为 ${rev}，因此 ${on} 关闭。默认 14 天。`,
      byTitle: "由组长",
      byHint: "转为助教之后随时可以：按住“立即关闭本届”。提前关闭会提前开始保留期。",
      badgeAvail: "可用",
      badgeUsed: "已使用",
      badgeNot: "未使用",
      retTitle: "保留期",
      retHint: "候选人的文件和答案从本届关闭之日起保留多少个月，仅组委会可见。默认 6 个月。",
      nDays: (n) => `${n} 天`,
      nMonths: (n) => `${n} 个月`,
      roTitle: "变为只读",
      roLocked: "已锁定",
      roAfter: "关闭后",
      locks: ["筛选、排期、测试与评分", "录取名单和代码", "日历和组委会看板", "报名和候选人日程"],
      roHint:
        "每个组委会标签页都会显示“本届已关闭”横幅，并锁定会修改数据的按钮。查看和下载报告仍可进行。",
      dataTitle: "数据会怎样",
      keeps: [
        { ic: "file", t: "候选人文件", s: "仅组委会可见，之后删除", purge: true },
        { ic: "note", t: "测试答案和评分表", s: "仅组委会可见，之后删除", purge: true },
        { ic: "user", t: "新助教的账号、代码和记录", s: "不是候选人数据，保留", purge: false },
        { ic: "clip", t: "审计记录", s: "保留", purge: false },
      ],
      stays: "保留",
      guard: "不是组委会成员的新助教，无论关闭前后，都无法打开候选人的文件或答案。",
      legend: (n, out) =>
        `已创建 ${n} 名助教，${out} 名候选人未录取。他们的旅程被冻结；在数据删除前仍可看到自己的旅程。`,
      done: "本届已关闭。",
      ro: "只有组长可以修改。",
    },
  },
};

const KEEP_IC: Record<string, ComponentType<IconProps>> = {
  file: FileTextIcon,
  note: NotePencilIcon,
  user: UserCheckIcon,
  clip: ClipboardTextIcon,
};

const dayMs = 86_400_000;
const hariAntara = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / dayMs);
const tglJamWib = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const tglIso = (d: Date) => d.toISOString().slice(0, 10);
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);

/** The people created, from the rows that were promoted. */
export function Hasil({
  lang,
  d,
  rows,
  can,
  onAgain,
  onReplay,
  onClose,
}: {
  lang: Lang;
  d: PnListResponse;
  rows: PnRow[];
  can: boolean;
  onAgain: () => void;
  onReplay: () => void;
  onClose: () => void;
}) {
  const t = W[lang];
  const baru = rows.filter((r) => r.promotedNim);
  const runs = d.runs;
  const first = runs[runs.length - 1];
  const re = runs.length > 1;
  const reveal = d.revealAt ? tgl(tglIso(new Date(d.revealAt)), lang) : "-";
  const on = d.close.closeAt ? tgl(tglIso(new Date(d.close.closeAt)), lang) : "-";
  const Hero = re ? ShieldCheckIcon : SealCheckIcon;
  return (
    <div className="r8-hasil">
      <section className="panel r8-hero" data-st={re ? "again" : "new"} aria-live="polite">
        <span className="r8-hero__seal">
          <Hero size={32} aria-hidden="true" />
        </span>
        <div className="stack stack--sm" style={{ minWidth: 0 }}>
          <span className="eyebrow">{re ? t.hero.again : t.hero.done}</span>
          <h2 className="r8-hero__t">{t.hero.created(first?.created ?? baru.length)}</h2>
          <span className="hint">
            {first
              ? re
                ? t.hero.byAgain(first.by, tglJamWib(first.at, lang), baru.length)
                : t.hero.by(first.by, tglJamWib(first.at, lang), reveal)
              : ""}
          </span>
        </div>
        <span className="grow" />
        <div className="r8-hero__acts">
          <button type="button" className="btn btn--inverse" onClick={onReplay}>
            <ConfettiIcon size={18} aria-hidden="true" />
            <span className="btn__label">{t.hero.celebrate}</span>
          </button>
          {can && (
            <button type="button" className="btn btn--primary" onClick={onClose}>
              <LockSimpleIcon size={18} aria-hidden="true" />
              <span className="btn__label">{t.hero.toClose}</span>
            </button>
          )}
        </div>
      </section>
      <div className="r8-hcols">
        <section className="panel rec-tablecard r8-tablecard">
          <div className="panel__head">
            <h2 className="panel__title">{t.table.title}</h2>
            <span className="hint">{t.table.hint(baru.length)}</span>
          </div>
          <Paged items={baru} id="penerimaan-hasil" size={20} noun={NOUN[lang].caas} lang={lang}>
            {(rowsP) => (
              <div className="scrollx">
                <table className="table rec-table r8-table r8-htable">
                  <thead>
                    <tr>
                      {t.table.cols.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsP.map((r) => (
                      <tr key={r.id} className="r8-row">
                        <td>
                          <span className="r8-pcode mono">{r.code}</span>
                        </td>
                        <td>
                          <div className="r8-who">
                            <b>{r.nama}</b>
                            <span className="mono hint">{r.nim}</span>
                          </div>
                        </td>
                        <td>
                          <Pill>{t.table.none}</Pill>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <Pill tone="ok">{t.table.asisten}</Pill>
                            {r.alsoPraktikan && <Pill>{t.table.alsoPrak}</Pill>}
                          </div>
                        </td>
                        <td>
                          {r.alsoPraktikan ? (
                            <span className="r8-keep">
                              <CheckIcon size={16} aria-hidden="true" />
                              {t.table.kept}
                            </span>
                          ) : (
                            <span className="hint">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        </section>
        <aside className="stack">
          <section className="panel r8-audit">
            <div className="panel__head">
              <h2 className="panel__title">{t.audit.title}</h2>
              <Pill>{t.audit.entries(runs.length)}</Pill>
            </div>
            <ul className="r8-log">
              {runs.map((e) => (
                <li key={e.at} data-skip={e.created === 0 ? "yes" : "no"}>
                  <span className="r8-log__ic">
                    {e.created === 0 ? (
                      <ArrowsClockwiseIcon size={16} aria-hidden="true" />
                    ) : (
                      <UserPlusIcon size={16} aria-hidden="true" />
                    )}
                  </span>
                  <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <b>{t.audit.run}</b>
                    <span className="hint">
                      {e.created === 0
                        ? t.audit.skipOnly(e.skipped)
                        : t.audit.made(e.created, e.skipped)}
                    </span>
                    <span className="hint mono">
                      {tglJamWib(e.at, lang)} · {e.by}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {can && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onAgain}>
                <ArrowsClockwiseIcon size={16} aria-hidden="true" />
                <span className="btn__label">{t.audit.again}</span>
              </button>
            )}
          </section>
          <section className="panel r8-next">
            <div className="panel__head">
              <h2 className="panel__title">{t.next.title}</h2>
            </div>
            <ol className="r8-nextl">
              <li>
                <span className="r8-nextl__n">1</span>
                <div className="stack" style={{ gap: 1 }}>
                  <b>{t.next.open}</b>
                  <span className="hint">{reveal}</span>
                </div>
              </li>
              <li>
                <span className="r8-nextl__n">2</span>
                <div className="stack" style={{ gap: 1 }}>
                  <b>{t.next.place}</b>
                  <span className="hint">{t.next.placeHint}</span>
                </div>
              </li>
              <li>
                <span className="r8-nextl__n">3</span>
                <div className="stack" style={{ gap: 1 }}>
                  <b>{t.next.close}</b>
                  <span className="hint">
                    {t.next.closeHint(d.close.closeDays, on, d.close.retentionMonths)}
                  </span>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>
      <span className="hint r8-legend">
        <ShieldCheckIcon size={16} aria-hidden="true" /> {t.legend}
      </span>
    </div>
  );
}

/** Closing the edition. */
export function Tutup({
  lang,
  d,
  rows,
  can,
  onBack,
  refresh,
}: {
  lang: Lang;
  d: PnListResponse;
  rows: PnRow[];
  can: boolean;
  onBack: () => void;
  refresh: () => void;
}) {
  const t = W[lang].tutup;
  const c = d.close;
  const closed = c.closed;
  const auto = closed && !c.closedAt;
  const planned = !closed && c.autoClose && !!c.closeAt;
  const closedOn = c.closedAt ?? c.closeAt;
  const purge = c.keepUntil;
  const total =
    closedOn && purge
      ? Math.max(1, hariAntara(new Date(closedOn), new Date(purge)))
      : c.retentionMonths * 30;
  const done =
    closed && closedOn
      ? Math.min(total, Math.max(0, hariAntara(new Date(closedOn), new Date())))
      : 0;
  const left = total - done;
  const f = (iso: string | null) => (iso ? tgl(tglIso(new Date(iso)), lang) : t.notStarted);
  const baru = rows.filter((r) => r.promotedNim).length;
  const out = rows.filter((r) => r.decision === "tolak").length;
  const edit = can && !closed;

  const simpan = async (
    p: Partial<{ closeDays: number; retentionMonths: number; autoClose: boolean }>,
  ) => {
    const r = await recPost<{ ok: true }>("setting-save", {
      key: "penerimaan",
      value: {
        quota: d.quota,
        closeDays: p.closeDays ?? c.closeDays,
        retentionMonths: p.retentionMonths ?? c.retentionMonths,
        autoClose: p.autoClose ?? c.autoClose,
      },
    });
    if (isFail(r)) return toast(String(r.kode), "danger");
    refresh();
  };
  const tutup = async () => {
    const r = await recPost<{ ok: true }>("pn-close", { confirm: true });
    if (isFail(r)) return toast(String(r.kode), "danger");
    toast(t.done);
    refresh();
  };

  const lead = closed
    ? auto
      ? t.leadAuto(f(closedOn), c.closeDays)
      : t.leadHand(f(closedOn))
    : planned
      ? t.leadPlan(f(closedOn), c.closeDays)
      : t.leadOff;
  const tl: { k: string; t: string; d: string | null }[] = [
    { k: "reveal", t: t.tlReveal, d: d.revealAt },
    {
      k: "close",
      t: closed ? (auto ? t.tlAuto : t.tlHand) : planned ? t.tlPlan : t.tlHand,
      d: closedOn,
    },
    { k: "purge", t: t.tlPurge, d: purge },
  ];

  return (
    <div className="r8-tutup" data-closed={closed ? "yes" : "no"}>
      <section className="panel r8-clock">
        <div
          className="r8-clock__ring"
          style={{ "--p": total && closed ? Math.round((done / total) * 100) : 0 } as CSSProperties}
          role="img"
          aria-label={`${done} / ${total}`}
        >
          <div className="r8-clock__in">
            <b className="num">{closed ? left : total}</b>
            <small>{closed ? t.daysLeft : t.days}</small>
          </div>
        </div>
        <div className="stack stack--sm" style={{ minWidth: 0 }}>
          <span className="eyebrow">
            {closed ? (auto ? t.autoEyebrow : t.handEyebrow) : t.openEyebrow}
          </span>
          <h2 className="r8-hero__t">
            {closed ? t.head(f(purge)) : t.headOpen(c.retentionMonths)}
          </h2>
          <span className="hint">
            {lead} {closed ? t.dayOf(done, total) : t.clockOpen(total, f(purge))}
          </span>
          <ol className="r8-tl3" aria-label={t.tl}>
            {tl.map((x) => (
              <li key={x.k} data-k={x.k}>
                <b>{x.t}</b>
                <span className="hint num">{x.d ? tgl(tglIso(new Date(x.d)), lang) : "-"}</span>
              </li>
            ))}
          </ol>
        </div>
        <span className="grow" />
        {!closed &&
          (can ? (
            <div className="stack stack--sm r8-clock__act">
              <HoldButton
                label={t.hold}
                tint="warn"
                icon={LockSimpleIcon}
                ms={1400}
                onDone={() => void tutup()}
              />
              <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
                <ArrowLeftIcon size={16} aria-hidden="true" />
                <span className="btn__label">{t.back}</span>
              </button>
            </div>
          ) : (
            <span className="hint">{t.ro}</span>
          ))}
      </section>

      <section className="panel r8-how" aria-label={t.howTitle}>
        <div className="panel__head">
          <div className="stack" style={{ gap: 2 }}>
            <h2 className="panel__title">{t.howTitle}</h2>
            <span className="hint">{t.howLede}</span>
          </div>
          <Stc tip="Subject to Change" />
        </div>
        <div className="r8-how__rows">
          <div className="r8-how__r">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{t.swTitle}</b>
              <span className="hint">{t.swHint}</span>
            </span>
            <Switch
              on={c.autoClose}
              label={t.swTitle}
              disabled={!edit}
              onChange={(v) => void simpan({ autoClose: v })}
            />
          </div>
          <div className="r8-how__r" data-off={c.autoClose ? undefined : "yes"}>
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{t.nTitle}</b>
              <span className="hint">
                {t.nHint(f(d.revealAt), c.closeAt ? f(c.closeAt) : t.notStarted)}
              </span>
            </span>
            {edit ? (
              <Stepper
                value={c.closeDays}
                min={1}
                max={90}
                label={t.nTitle}
                fmt={t.nDays}
                lessLabel="-"
                moreLabel="+"
                onChange={(v) => void simpan({ closeDays: v })}
              />
            ) : (
              <b className="num">{t.nDays(c.closeDays)}</b>
            )}
          </div>
          <div className="r8-how__r">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{t.byTitle}</b>
              <span className="hint">{t.byHint}</span>
            </span>
            <Pill tone={closed ? undefined : "ok"}>
              {closed ? (auto ? t.badgeNot : t.badgeUsed) : t.badgeAvail}
            </Pill>
          </div>
          <div className="r8-how__r">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{t.retTitle}</b>
              <span className="hint">{t.retHint}</span>
            </span>
            {edit ? (
              <Stepper
                value={c.retentionMonths}
                min={1}
                max={24}
                label={t.retTitle}
                fmt={t.nMonths}
                lessLabel="-"
                moreLabel="+"
                onChange={(v) => void simpan({ retentionMonths: v })}
              />
            ) : (
              <b className="num">{t.nMonths(c.retentionMonths)}</b>
            )}
          </div>
        </div>
        {!can && <span className="hint">{t.ro}</span>}
      </section>

      <div className="r8-tcols">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.roTitle}</h2>
            <Pill tone={closed ? "warn" : undefined}>{closed ? t.roLocked : t.roAfter}</Pill>
          </div>
          <ul className="r8-locks">
            {t.locks.map((x) => (
              <li key={x} data-on={closed ? "yes" : "no"}>
                <LockSimpleIcon size={16} aria-hidden="true" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <span className="hint">{t.roHint}</span>
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.dataTitle}</h2>
          </div>
          <ul className="r8-keeps">
            {t.keeps.map((k) => {
              const Ik = KEEP_IC[k.ic];
              return (
                <li key={k.t}>
                  <span className="r8-keeps__ic">
                    <Ik size={16} aria-hidden="true" />
                  </span>
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <b>{k.t}</b>
                    <span className="hint">{k.s}</span>
                  </div>
                  {k.purge ? <Pill tone="warn">{f(purge)}</Pill> : <Pill tone="ok">{t.stays}</Pill>}
                </li>
              );
            })}
          </ul>
          <div className="rec-note r8-guard">
            <ShieldCheckIcon size={16} aria-hidden="true" />
            <span>{t.guard}</span>
          </div>
        </section>
      </div>
      <span className="hint r8-legend">{t.legend(baru, out)}</span>
    </div>
  );
}
