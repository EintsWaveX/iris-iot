/**
 * Reports › Audit as sentences (Phase 9 Stage 6b, mockup r-home Audit):
 * "<b>Full Name (CODE)</b> started a Module 3 session". Each audit action
 * gets an icon, its tab and the words after the actor's name, in three
 * languages. Unknown actions still read as a plain line.
 */
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsClockwiseIcon,
  ChalkboardTeacherIcon,
  BankIcon,
  BroadcastIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  ChatTextIcon,
  CoinsIcon,
  FileTextIcon,
  HandCoinsIcon,
  HandHeartIcon,
  HandshakeIcon,
  HardDrivesIcon,
  KeyIcon,
  ListChecksIcon,
  LockKeyIcon,
  MegaphoneIcon,
  MonitorIcon,
  NotePencilIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlayIcon,
  ShieldStarIcon,
  SlidersHorizontalIcon,
  StopIcon,
  TerminalWindowIcon,
  TrashIcon,
  UserPlusIcon,
  UserSwitchIcon,
  UsersThreeIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { tanggalPanjang } from "../../lib/app";
import { jenisAudit, type JenisAudit } from "../../lib/audit-jenis";
import { rupiah } from "../../lib/bayar";
import { hariLabel, kelompokLabel, modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";

export interface AuditRow {
  id: number;
  pada: string;
  aktorNim: string;
  aksi: string;
  detail: string | null;
}

export interface AuditKonteks {
  sesi: { id: number; tanggal: string; slot: number | null; modul: number }[];
  kelompok: { id: number; nomor: number }[];
  jadwal: { id: number; hari: number; slot: number }[];
  server: { id: number; nama: string; kode: string }[];
}

export interface Kalimat {
  icon: Icon;
  teks: string;
  jenis: JenisAudit | "lain";
  danger?: boolean;
  /** Konsol Pi: the terminal record, shown on request. */
  transkrip?: string;
}

type D = Record<string, unknown>;
interface Bantu {
  lang: Lang;
  who: (nim: unknown) => string;
  sesi: (id: unknown) => string;
  grup: (d: D) => string;
  slot: (jadwalId: unknown, tanggal?: unknown) => string;
  server: (id: unknown) => string;
}

const W = {
  id: {
    sesiMulai: (m: string, s: string) => `memulai sesi ${m}${s}`,
    sesiAkhiri: (s: string) => `mengakhiri sesi ${s}`,
    sesiBatal: (s: string) => `membatalkan sesi ${s}`,
    sesiLanjut: (s: string) => `melanjutkan sesi ${s}`,
    sesiDurasi: (s: string, a: unknown, b: unknown) =>
      `mengubah lama sesi ${s} dari ${a} jadi ${b} menit`,
    siarkan: (p: string) => (p ? `mengirim pengumuman: "${p}"` : "menghapus pengumuman"),
    pasangan: (g: string, ke: string, dari: string, al: string) =>
      `memasangkan ${ke} dengan ${g}${dari ? ` (sebelumnya ${dari})` : ""}${al ? `. Alasan: ${al}` : ""}`,
    ambilAlih: (g: string) => `mengambil alih ${g}`,
    bantuan: (g: string) => `menjawab angkat tangan ${g}`,
    nilai: (n: unknown, k: unknown, s: string) => `mengisi nilai ${k} untuk ${n} di ${s}`,
    seelabsAkun: (g: string, a: string) =>
      a ? `memakai akun SeeLabs ${a} untuk ${g}` : `melepas akun SeeLabs pinjaman untuk ${g}`,
    seelabsSimpan: (g: string) => `menandai nilai ${g} sudah disimpan di SeeLabs`,
    seelabsBelum: (g: string) => `menandai nilai ${g} belum disimpan di SeeLabs`,
    transfer: (j: string, rp: string, who: string, p: unknown) =>
      `menandai ${j === "balik" ? "transfer balik" : "transfer kotor"} ${rp} ${j === "balik" ? "dari" : "ke"} ${who} (${p}) sudah dibayar`,
    transferBatal: (who: string) => `membatalkan tanda transfer untuk ${who}`,
    tarifUnit: (r: string, i: string) =>
      `mengatur tarif per kelompok: Reguler ${r}, Internasional ${i}`,
    kasTarif: (p: unknown, mulai: string) => `mengatur uang kas jadi ${p}% mulai ${mulai}`,
    kasExc: (who: string, p: unknown) => `memberi ${who} pengecualian uang kas ${p}%`,
    kasExcHapus: (who: string) => `menghapus pengecualian uang kas ${who}`,
    timTambah: (who: string) => `menambahkan ${who} ke Tim`,
    timUbah: (who: string) => `mengubah data ${who}`,
    hak: (who: string) => `mengubah hak akses ${who} (pengecualian Admin)`,
    serah: (st: string, kat: string, a: string, b: string) =>
      ({
        menunggu: `meminta serah terima ${kat} dari ${a} ke ${b}`,
        diterima: `menerima serah terima ${kat} dari ${a} ke ${b}`,
        ditolak: `menolak serah terima ${kat} dari ${a} ke ${b}`,
        dibatalkan: `membatalkan serah terima ${kat} dari ${a} ke ${b}`,
      })[st] ?? `serah terima ${kat}: ${a} ke ${b}`,
    bantu: (s: string) => `menawarkan bantuan (Saya Bantu) di ${s}`,
    minta: (who: string, s: string) => `meminta ${who} menggantikan di ${s}`,
    jawab: (ok: boolean) =>
      ok ? "menerima permintaan menggantikan" : "menolak permintaan menggantikan",
    konfirmasi: (ok: boolean) => (ok ? "menerima tawaran bantuan" : "menolak tawaran bantuan"),
    penugasanBatal: "membatalkan permintaan atau tawaran penugasan",
    izin: (who: string, s: string) => `mengumumkan izin ${who} di ${s} dan mencari pengganti`,
    jadwalUbah: (s: string) => `mengubah slot ${s} di Jadwal`,
    jadwalImpor: (n: unknown) => `mengimpor jadwal (${n} slot)`,
    jadwalPengaturan: "mengubah pengaturan jendela mulai di Jadwal",
    jadwalJendela: (s: string, m: unknown) => `mengatur jendela mulai ${s} jadi ${m} menit`,
    rosterSlot: (s: string, n: unknown) => `menyimpan roster ${s} (${n} praktikan)`,
    rosterSusulan: (n: unknown) => `menyimpan roster susulan (${n} praktikan)`,
    rosterSet: "mengganti roster lama",
    praktikanTambah: (n: unknown) => `menambahkan ${n} praktikan`,
    susulanDraf: (t: string) => `membuat draf susulan ${t}`,
    modulAkses: (m: string) => (m ? `membuka akses ${m}` : "menutup semua akses modul"),
    totNyala: "menyalakan Mode TOT; roster asli disimpan",
    totMati: "mematikan Mode TOT; roster asli dikembalikan",
    tot: " (TOT)",
    brief: (m: string, b: string) => `mengubah Ringkasan ${m} (${b})`,
    presentasi: "mengubah slide presentasi",
    skema: (m: string) => `mengubah skema rangkaian ${m}`,
    serverDaftar: (s: string) => `mendaftarkan server ${s}`,
    serverUbah: (s: string) => `mengubah pengaturan ${s}`,
    serverHapus: (s: string) => `menghapus server ${s}`,
    serverToken: (s: string) => `membuat token pendaftaran baru untuk ${s}`,
    perintah: (a: unknown, s: string) => `mengirim perintah ${a} ke ${s}`,
    perintahUlang: "mengulang sebuah perintah server",
    perintahBatal: "membatalkan sebuah perintah server",
    perintahHapus: (s: string) => `membersihkan log perintah ${s}`,
    riwayatHapus: (s: string) => `membersihkan riwayat ${s}`,
    kelompokSet: (g: string, on: boolean) => `${on ? "mengaktifkan" : "menonaktifkan"} ${g}`,
    kelompokCatatan: (g: string) => `menulis catatan untuk ${g}`,
    kejadianTambah: (s: string) => `menambah kejadian di ${s}`,
    kejadianUbah: (s: string) => `mengubah kejadian di ${s}`,
    kejadianHapus: (s: string) => `menghapus kejadian di ${s}`,
    kejadianPulih: (s: string) => `mengembalikan kejadian di ${s}`,
    catatanSesi: (s: string) => `menulis laporan sesi ${s}`,
    laporanKirim: (j: unknown) => `mengirim laporan "${j}"`,
    laporanStatus: (j: unknown, st: string) => `menandai laporan "${j}" ${st}`,
    sandiAtur: "mengatur kata sandinya",
    sandiGanti: "mengganti kata sandinya",
    konsol: "memakai Konsol Pi",
    konsolTarget: (t: unknown) =>
      t === "terminal" ? "terminal (SSH)" : t === ":0" ? "layar Pi (HDMI)" : "desktop virtual",
    konsolMinta: (x: string, srv: string, pk: string, why: unknown, langsung: boolean) =>
      `${langsung ? "membuka tanpa persetujuan" : "meminta"} Konsol Pi ${x} di ${srv} (${pk}): ${why}`,
    konsolPaksa: (pk: string, why: unknown) => `memaksa ${pk} saat sesi berjalan: ${why}`,
    konsolSetujui: (pk: string) => `menyetujui ${pk}`,
    konsolTolak: (pk: string, why: string) => `menolak ${pk}${why ? `: ${why}` : ""}`,
    konsolBatal: (pk: string) => `membatalkan permintaan ${pk}`,
    konsolBuka: (pk: string, x: string) => `membuka ${pk} (${x})`,
    konsolAkhiri: (pk: string) => `menutup ${pk}`,
    konsolPutus: (pk: string, why: unknown) => `memutus ${pk}: ${why}`,
    konsolSelesai: (pk: string, data: string) => `${pk} selesai, ${data} lewat`,
    konsolOke: (pk: string) => `sudah melihat ${pk}`,
    konsolTanya: (pk: string, q: unknown) => `bertanya soal ${pk}: ${q}`,
    konsolGabung: (pk: string) => `ikut masuk ke ${pk}`,
    konsolMintaGabung: (pk: string, why: unknown) => `minta ikut masuk ke ${pk}: ${why}`,
    konsolGabungJawab: (pk: string, who: string, ok: boolean) =>
      `${ok ? "mengizinkan" : "menolak"} ${who} masuk ke ${pk}`,
    konsolKendali: (pk: string, who: string) => `memberi kendali ${pk} ke ${who}`,
    statusProses: "diproses",
    statusSelesai: "selesai",
    lain: (a: string) => a.replace(/_/g, " "),
  },
  en: {
    sesiMulai: (m: string, s: string) => `started a ${m} session${s}`,
    sesiAkhiri: (s: string) => `ended the ${s} session`,
    sesiBatal: (s: string) => `cancelled the ${s} session`,
    sesiLanjut: (s: string) => `resumed the ${s} session`,
    sesiDurasi: (s: string, a: unknown, b: unknown) =>
      `changed the ${s} session from ${a} to ${b} minutes`,
    siarkan: (p: string) => (p ? `sent an announcement: "${p}"` : "cleared the announcement"),
    pasangan: (g: string, ke: string, dari: string, al: string) =>
      `paired ${ke} with ${g}${dari ? ` (was ${dari})` : ""}${al ? `. Reason: ${al}` : ""}`,
    ambilAlih: (g: string) => `took over ${g}`,
    bantuan: (g: string) => `answered ${g}'s raised hand`,
    nilai: (n: unknown, k: unknown, s: string) => `entered the ${k} score for ${n} in ${s}`,
    seelabsAkun: (g: string, a: string) =>
      a ? `used ${a}'s SeeLabs account for ${g}` : `stopped borrowing a SeeLabs account for ${g}`,
    seelabsSimpan: (g: string) => `marked ${g}'s scores as saved in SeeLabs`,
    seelabsBelum: (g: string) => `marked ${g}'s scores as not saved in SeeLabs`,
    transfer: (j: string, rp: string, who: string, p: unknown) =>
      `marked the ${j === "balik" ? "transfer back" : "gross transfer"} of ${rp} ${j === "balik" ? "from" : "to"} ${who} (${p}) as paid`,
    transferBatal: (who: string) => `undid a transfer mark for ${who}`,
    tarifUnit: (r: string, i: string) => `set the rate per group: Regular ${r}, International ${i}`,
    kasTarif: (p: unknown, mulai: string) => `set the cash fund to ${p}% from ${mulai}`,
    kasExc: (who: string, p: unknown) => `gave ${who} a cash fund exception of ${p}%`,
    kasExcHapus: (who: string) => `removed ${who}'s cash fund exception`,
    timTambah: (who: string) => `added ${who} to the Team`,
    timUbah: (who: string) => `changed ${who}'s details`,
    hak: (who: string) => `changed ${who}'s rights (Admin override)`,
    serah: (st: string, kat: string, a: string, b: string) =>
      ({
        menunggu: `asked to hand ${kat} from ${a} to ${b}`,
        diterima: `accepted handing ${kat} from ${a} to ${b}`,
        ditolak: `declined handing ${kat} from ${a} to ${b}`,
        dibatalkan: `withdrew handing ${kat} from ${a} to ${b}`,
      })[st] ?? `${kat} handover: ${a} to ${b}`,
    bantu: (s: string) => `offered to help (I'll Help) on ${s}`,
    minta: (who: string, s: string) => `asked ${who} to cover ${s}`,
    jawab: (ok: boolean) => (ok ? "accepted a request to cover" : "declined a request to cover"),
    konfirmasi: (ok: boolean) => (ok ? "accepted an offer to help" : "declined an offer to help"),
    penugasanBatal: "withdrew an assignment request or offer",
    izin: (who: string, s: string) => `announced ${who} is excused on ${s} and asked for a cover`,
    jadwalUbah: (s: string) => `changed the ${s} slot in the Schedule`,
    jadwalImpor: (n: unknown) => `imported the schedule (${n} slots)`,
    jadwalPengaturan: "changed the start window settings in the Schedule",
    jadwalJendela: (s: string, m: unknown) => `set the ${s} start window to ${m} minutes`,
    rosterSlot: (s: string, n: unknown) => `saved the ${s} roster (${n} students)`,
    rosterSusulan: (n: unknown) => `saved a makeup roster (${n} students)`,
    rosterSet: "replaced the old roster",
    praktikanTambah: (n: unknown) => `added ${n} students`,
    susulanDraf: (t: string) => `made a makeup draft for ${t}`,
    modulAkses: (m: string) => (m ? `opened ${m}` : "closed every module"),
    totNyala: "switched TOT Mode on; the real roster was saved",
    totMati: "switched TOT Mode off; the real roster was put back",
    tot: " (TOT)",
    brief: (m: string, b: string) => `changed the ${m} Brief (${b})`,
    presentasi: "changed the presentation slides",
    skema: (m: string) => `changed the ${m} wiring schematic`,
    serverDaftar: (s: string) => `registered the server ${s}`,
    serverUbah: (s: string) => `changed ${s}'s settings`,
    serverHapus: (s: string) => `removed the server ${s}`,
    serverToken: (s: string) => `made a new enrol token for ${s}`,
    perintah: (a: unknown, s: string) => `sent the command ${a} to ${s}`,
    perintahUlang: "repeated a server command",
    perintahBatal: "cancelled a server command",
    perintahHapus: (s: string) => `cleared ${s}'s command log`,
    riwayatHapus: (s: string) => `cleared ${s}'s history`,
    kelompokSet: (g: string, on: boolean) => `${on ? "turned on" : "turned off"} ${g}`,
    kelompokCatatan: (g: string) => `wrote a note for ${g}`,
    kejadianTambah: (s: string) => `added an incident to ${s}`,
    kejadianUbah: (s: string) => `edited an incident in ${s}`,
    kejadianHapus: (s: string) => `deleted an incident in ${s}`,
    kejadianPulih: (s: string) => `brought back an incident in ${s}`,
    catatanSesi: (s: string) => `wrote the ${s} session report`,
    laporanKirim: (j: unknown) => `sent the report "${j}"`,
    laporanStatus: (j: unknown, st: string) => `marked the report "${j}" ${st}`,
    sandiAtur: "set their password",
    sandiGanti: "changed their password",
    konsol: "used the Pi Console",
    konsolTarget: (t: unknown) =>
      t === "terminal" ? "terminal (SSH)" : t === ":0" ? "Pi screen (HDMI)" : "virtual desktop",
    konsolMinta: (x: string, srv: string, pk: string, why: unknown, langsung: boolean) =>
      `${langsung ? "opened without approval" : "asked for"} the Pi Console ${x} on ${srv} (${pk}): ${why}`,
    konsolPaksa: (pk: string, why: unknown) => `forced ${pk} during a session: ${why}`,
    konsolSetujui: (pk: string) => `approved ${pk}`,
    konsolTolak: (pk: string, why: string) => `rejected ${pk}${why ? `: ${why}` : ""}`,
    konsolBatal: (pk: string) => `cancelled the request ${pk}`,
    konsolBuka: (pk: string, x: string) => `opened ${pk} (${x})`,
    konsolAkhiri: (pk: string) => `closed ${pk}`,
    konsolPutus: (pk: string, why: unknown) => `cut off ${pk}: ${why}`,
    konsolSelesai: (pk: string, data: string) => `${pk} ended, ${data} moved`,
    konsolOke: (pk: string) => `has seen ${pk}`,
    konsolTanya: (pk: string, q: unknown) => `asked about ${pk}: ${q}`,
    konsolGabung: (pk: string) => `joined ${pk}`,
    konsolMintaGabung: (pk: string, why: unknown) => `asked to join ${pk}: ${why}`,
    konsolGabungJawab: (pk: string, who: string, ok: boolean) =>
      `${ok ? "let" : "didn't let"} ${who} into ${pk}`,
    konsolKendali: (pk: string, who: string) => `gave control of ${pk} to ${who}`,
    statusProses: "In Progress",
    statusSelesai: "Done",
    lain: (a: string) => a.replace(/_/g, " "),
  },
  zh: {
    sesiMulai: (m: string, s: string) => `开始了${m}的课${s}`,
    sesiAkhiri: (s: string) => `结束了 ${s} 的课`,
    sesiBatal: (s: string) => `取消了 ${s} 的课`,
    sesiLanjut: (s: string) => `继续了 ${s} 的课`,
    sesiDurasi: (s: string, a: unknown, b: unknown) => `把 ${s} 的课从 ${a} 分钟改成 ${b} 分钟`,
    siarkan: (p: string) => (p ? `发了公告：“${p}”` : "清除了公告"),
    pasangan: (g: string, ke: string, dari: string, al: string) =>
      `让 ${ke} 带${g}${dari ? `（原来是 ${dari}）` : ""}${al ? `。原因：${al}` : ""}`,
    ambilAlih: (g: string) => `接手了${g}`,
    bantuan: (g: string) => `回应了${g}的举手`,
    nilai: (n: unknown, k: unknown, s: string) => `在 ${s} 给 ${n} 填了 ${k} 分数`,
    seelabsAkun: (g: string, a: string) =>
      a ? `用 ${a} 的 SeeLabs 账号提交${g}` : `不再为${g}借用 SeeLabs 账号`,
    seelabsSimpan: (g: string) => `把${g}的分数标为已存到 SeeLabs`,
    seelabsBelum: (g: string) => `把${g}的分数标为还没存到 SeeLabs`,
    transfer: (j: string, rp: string, who: string, p: unknown) =>
      `把${j === "balik" ? `${who} 的转回` : `给 ${who} 的总额转账`} ${rp}（${p}）标为已付`,
    transferBatal: (who: string) => `撤销了 ${who} 的转账标记`,
    tarifUnit: (r: string, i: string) => `设定每组费率：普通班 ${r}，国际班 ${i}`,
    kasTarif: (p: unknown, mulai: string) => `从 ${mulai} 起把团队基金设为 ${p}%`,
    kasExc: (who: string, p: unknown) => `给 ${who} 设了团队基金例外 ${p}%`,
    kasExcHapus: (who: string) => `删除了 ${who} 的团队基金例外`,
    timTambah: (who: string) => `把 ${who} 加进团队`,
    timUbah: (who: string) => `修改了 ${who} 的资料`,
    hak: (who: string) => `修改了 ${who} 的权限（管理员例外）`,
    serah: (st: string, kat: string, a: string, b: string) =>
      ({
        menunggu: `申请把${kat}从 ${a} 交给 ${b}`,
        diterima: `同意把${kat}从 ${a} 交给 ${b}`,
        ditolak: `拒绝把${kat}从 ${a} 交给 ${b}`,
        dibatalkan: `撤回把${kat}从 ${a} 交给 ${b}`,
      })[st] ?? `${kat}交接：${a} 到 ${b}`,
    bantu: (s: string) => `在 ${s} 提出帮忙`,
    minta: (who: string, s: string) => `请 ${who} 代 ${s} 的课`,
    jawab: (ok: boolean) => (ok ? "接受了代课请求" : "拒绝了代课请求"),
    konfirmasi: (ok: boolean) => (ok ? "接受了帮忙" : "拒绝了帮忙"),
    penugasanBatal: "撤回了一个安排请求或帮忙",
    izin: (who: string, s: string) => `公布 ${who} 在 ${s} 请假并找人代课`,
    jadwalUbah: (s: string) => `修改了课表里的 ${s}`,
    jadwalImpor: (n: unknown) => `导入了课表（${n} 个时段）`,
    jadwalPengaturan: "修改了课表的开课窗口设置",
    jadwalJendela: (s: string, m: unknown) => `把 ${s} 的开课窗口设为 ${m} 分钟`,
    rosterSlot: (s: string, n: unknown) => `保存了 ${s} 的名单（${n} 位学员）`,
    rosterSusulan: (n: unknown) => `保存了补课名单（${n} 位学员）`,
    rosterSet: "替换了旧名单",
    praktikanTambah: (n: unknown) => `添加了 ${n} 位学员`,
    susulanDraf: (t: string) => `为 ${t} 建了补课草稿`,
    modulAkses: (m: string) => (m ? `开放了${m}` : "关闭了所有模块"),
    totNyala: "开启了 TOT 模式，真实名单已保存",
    totMati: "关闭了 TOT 模式，真实名单已恢复",
    tot: "（TOT）",
    brief: (m: string, b: string) => `修改了${m}的简介（${b}）`,
    presentasi: "修改了演示幻灯片",
    skema: (m: string) => `修改了${m}的接线图`,
    serverDaftar: (s: string) => `登记了服务器 ${s}`,
    serverUbah: (s: string) => `修改了 ${s} 的设置`,
    serverHapus: (s: string) => `删除了服务器 ${s}`,
    serverToken: (s: string) => `为 ${s} 生成了新的登记令牌`,
    perintah: (a: unknown, s: string) => `向 ${s} 发送了命令 ${a}`,
    perintahUlang: "重发了一条服务器命令",
    perintahBatal: "取消了一条服务器命令",
    perintahHapus: (s: string) => `清空了 ${s} 的命令记录`,
    riwayatHapus: (s: string) => `清空了 ${s} 的历史`,
    kelompokSet: (g: string, on: boolean) => `${on ? "启用了" : "停用了"}${g}`,
    kelompokCatatan: (g: string) => `给${g}写了备注`,
    kejadianTambah: (s: string) => `在 ${s} 添加了事件`,
    kejadianUbah: (s: string) => `编辑了 ${s} 的事件`,
    kejadianHapus: (s: string) => `删除了 ${s} 的事件`,
    kejadianPulih: (s: string) => `恢复了 ${s} 的事件`,
    catatanSesi: (s: string) => `写了 ${s} 的课次报告`,
    laporanKirim: (j: unknown) => `发送了报告“${j}”`,
    laporanStatus: (j: unknown, st: string) => `把报告“${j}”标为${st}`,
    sandiAtur: "设置了密码",
    sandiGanti: "修改了密码",
    konsol: "使用了 Pi 控制台",
    konsolTarget: (t: unknown) =>
      t === "terminal" ? "终端（SSH）" : t === ":0" ? "Pi 屏幕（HDMI）" : "虚拟桌面",
    konsolMinta: (x: string, srv: string, pk: string, why: unknown, langsung: boolean) =>
      `${langsung ? "无需批准直接打开了" : "申请了"} ${srv} 的 Pi 控制台${x}（${pk}）：${why}`,
    konsolPaksa: (pk: string, why: unknown) => `在课程进行中强制打开了 ${pk}：${why}`,
    konsolSetujui: (pk: string) => `批准了 ${pk}`,
    konsolTolak: (pk: string, why: string) => `拒绝了 ${pk}${why ? `：${why}` : ""}`,
    konsolBatal: (pk: string) => `取消了申请 ${pk}`,
    konsolBuka: (pk: string, x: string) => `打开了 ${pk}（${x}）`,
    konsolAkhiri: (pk: string) => `关闭了 ${pk}`,
    konsolPutus: (pk: string, why: unknown) => `断开了 ${pk}：${why}`,
    konsolSelesai: (pk: string, data: string) => `${pk} 已结束，传输 ${data}`,
    konsolOke: (pk: string) => `已查看 ${pk}`,
    konsolTanya: (pk: string, q: unknown) => `就 ${pk} 提问：${q}`,
    konsolGabung: (pk: string) => `加入了 ${pk}`,
    konsolMintaGabung: (pk: string, why: unknown) => `申请加入 ${pk}：${why}`,
    konsolGabungJawab: (pk: string, who: string, ok: boolean) =>
      `${ok ? "同意" : "拒绝"} ${who} 加入 ${pk}`,
    konsolKendali: (pk: string, who: string) => `把 ${pk} 的控制交给 ${who}`,
    statusProses: "处理中",
    statusSelesai: "完成",
    lain: (a: string) => a.replace(/_/g, " "),
  },
};

const KATEGORI: Record<Lang, Record<string, string>> = {
  id: {
    ketua: "Koordinator",
    wakil: "Wakil Koordinator",
    sekretaris: "Sekretaris",
    bendahara: "Bendahara",
  },
  en: {
    ketua: "Coordinator",
    wakil: "Deputy Coordinator",
    sekretaris: "Secretary",
    bendahara: "Treasurer",
  },
  zh: { ketua: "协调人", wakil: "副协调人", sekretaris: "秘书", bendahara: "财务" },
};
function katLabel(k: unknown, lang: Lang): string {
  const s = String(k ?? "");
  if (s.startsWith("kepala-")) {
    const d = s.slice(7);
    return lang === "en"
      ? `${d} Division Chief`
      : lang === "zh"
        ? `${d} 部门负责人`
        : `Kepala Divisi ${d}`;
  }
  return KATEGORI[lang][s] ?? s;
}

export function bantuAudit(
  lang: Lang,
  ctx: AuditKonteks,
  nama: (nim: string) => string,
  slotJam: (slot: number) => string,
): Bantu {
  const sesiOf = new Map(ctx.sesi.map((s) => [s.id, s]));
  const kelOf = new Map(ctx.kelompok.map((k) => [k.id, k.nomor]));
  const jadOf = new Map(ctx.jadwal.map((j) => [j.id, j]));
  const srvOf = new Map(ctx.server.map((s) => [s.id, s]));
  const slotWord = lang === "zh" ? "时段" : "Slot";
  return {
    lang,
    who: (nim) => (typeof nim === "string" && nim ? nama(nim) : "?"),
    sesi: (id) => {
      const s = sesiOf.get(Number(id));
      if (!s) return lang === "en" ? "a session" : lang === "zh" ? "一节课" : "sebuah sesi";
      const tgl = tanggalPanjang(s.tanggal, lang);
      return s.slot ? `${tgl} · ${slotWord} ${s.slot}` : tgl;
    },
    grup: (d) => {
      const n = Number.isInteger(d.nomor)
        ? (d.nomor as number)
        : (kelOf.get(Number(d.kelompokId)) ??
          (Number.isInteger(d.kelompokNomor) ? (d.kelompokNomor as number) : null));
      return n
        ? kelompokLabel(n, lang)
        : lang === "en"
          ? "a group"
          : lang === "zh"
            ? "一个组"
            : "sebuah kelompok";
    },
    slot: (jadwalId, tanggal) => {
      const j = jadOf.get(Number(jadwalId));
      const tgl = typeof tanggal === "string" ? tanggalPanjang(tanggal, lang) : null;
      if (!j) return tgl ?? "?";
      return `${tgl ?? hariLabel(j.hari, lang)} · ${slotWord} ${j.slot} (${slotJam(j.slot)})`;
    },
    server: (id) => {
      const s = srvOf.get(Number(id));
      return s
        ? `${s.nama} (${s.kode})`
        : lang === "en"
          ? "a server"
          : lang === "zh"
            ? "一台服务器"
            : "sebuah server";
    },
  };
}

/** "PK-0007", as the Konsol Pi summary card names it. */
const pk = (id: unknown) => `PK-${String(Number(id) || 0).padStart(4, "0")}`;

export function kalimatAudit(row: AuditRow, b: Bantu): Kalimat {
  const w = W[b.lang];
  let d: D = {};
  try {
    d = (JSON.parse(row.detail ?? "{}") as D) ?? {};
  } catch {
    // an unreadable detail still reads as who did what
  }
  const jenis = jenisAudit(row.aksi, d);
  const k = (icon: Icon, teks: string, danger?: boolean): Kalimat => ({
    icon,
    teks,
    jenis,
    danger,
  });
  const slotHari = (hari: unknown, slot: unknown) =>
    `${hariLabel(Number(hari), b.lang)} · ${b.lang === "zh" ? "时段" : "Slot"} ${slot}`;
  switch (row.aksi) {
    case "sesi_mulai": {
      const m = modulLabel(Number(d.modul), b.lang);
      const tgl = typeof d.tanggal === "string" ? tanggalPanjang(d.tanggal, b.lang) : "";
      const sfx = tgl
        ? ` · ${tgl}${d.slot ? ` · ${b.lang === "zh" ? "时段" : "Slot"} ${d.slot}` : ""}`
        : "";
      return k(PlayIcon, w.sesiMulai(m, sfx) + (d.jenis === "tot" ? w.tot : ""));
    }
    case "sesi_akhiri":
      return k(StopIcon, w.sesiAkhiri(b.sesi(d.sesiId)));
    case "sesi_batal":
      return k(XCircleIcon, w.sesiBatal(b.sesi(d.sesiId)));
    case "sesi_lanjutkan":
      return k(ArrowsClockwiseIcon, w.sesiLanjut(b.sesi(d.sesiId)));
    case "sesi_durasi":
      return k(CalendarBlankIcon, w.sesiDurasi(b.sesi(d.sesiId), d.dari, d.ke));
    case "sesi_siarkan":
      return k(MegaphoneIcon, w.siarkan(typeof d.pesan === "string" ? d.pesan : ""));
    case "penugasan_ubah":
      return k(
        UserSwitchIcon,
        w.pasangan(
          b.grup(d),
          d.ke ? b.who(d.ke) : "?",
          d.dari ? b.who(d.dari) : "",
          typeof d.alasan === "string" ? d.alasan : "",
        ),
      );
    case "penugasan_ambil_alih":
      return k(UserSwitchIcon, w.ambilAlih(b.grup(d)));
    case "bantuan_selesai":
      return k(HandHeartIcon, w.bantuan(b.grup(d)));
    case "nilai_set":
      return k(PencilSimpleIcon, w.nilai(d.nim, d.komponen, b.sesi(d.sesiId)));
    case "seelabs_akun":
      return k(HandCoinsIcon, w.seelabsAkun(b.grup(d), d.akun ? b.who(d.akun) : ""));
    case "seelabs_simpan":
      return k(ListChecksIcon, w.seelabsSimpan(b.grup(d)));
    case "seelabs_belum":
      return k(ListChecksIcon, w.seelabsBelum(b.grup(d)));
    case "transfer_tandai":
      return k(
        BankIcon,
        w.transfer(String(d.jenis), rupiah(Number(d.jumlah) || 0), b.who(d.nim), d.periode),
      );
    case "transfer_batal":
      return k(BankIcon, w.transferBatal(b.who(d.nim)));
    case "tarif_unit":
      return k(
        CoinsIcon,
        w.tarifUnit(rupiah(Number(d.reguler) || 0), rupiah(Number(d.internasional) || 0)),
      );
    case "kas_tarif":
      return k(
        CoinsIcon,
        w.kasTarif(
          d.persen,
          typeof d.berlakuMulai === "string" ? tanggalPanjang(d.berlakuMulai, b.lang) : "?",
        ),
      );
    case "kas_pengecualian":
      return k(CoinsIcon, w.kasExc(b.who(d.nim), d.persen));
    case "kas_pengecualian_hapus":
      return k(CoinsIcon, w.kasExcHapus(b.who(d.nim)));
    case "tim_tambah":
      return k(UserPlusIcon, w.timTambah(b.who(d.nim)));
    case "tim_ubah":
      return "hakOverride" in d
        ? k(ShieldStarIcon, w.hak(b.who(d.nim)))
        : k(UsersThreeIcon, w.timUbah(b.who(d.nim)));
    case "tim_serah_terima":
      return k(
        HandshakeIcon,
        w.serah(String(d.status), katLabel(d.kategori, b.lang), b.who(d.dari), b.who(d.ke)),
      );
    case "penugasan_bantu":
      return k(HandHeartIcon, w.bantu(b.slot(d.jadwalId, d.tanggal)));
    case "penugasan_minta":
      return k(UserSwitchIcon, w.minta(b.who(d.nim), b.slot(d.jadwalId, d.tanggal)));
    case "penugasan_jawab":
      return k(UserSwitchIcon, w.jawab(d.terima === true));
    case "penugasan_konfirmasi":
      return k(HandHeartIcon, w.konfirmasi(d.terima === true));
    case "penugasan_batal":
      return k(XCircleIcon, w.penugasanBatal);
    case "izin_umumkan":
      return k(XCircleIcon, w.izin(b.who(d.nim), b.slot(d.jadwalId, d.tanggal)));
    case "jadwal_ubah":
      return k(CalendarDotsIcon, w.jadwalUbah(slotHari(d.hari, d.slot)));
    case "jadwal_impor":
      return k(CalendarDotsIcon, w.jadwalImpor(d.slot));
    case "jadwal_pengaturan":
      return k(SlidersHorizontalIcon, w.jadwalPengaturan);
    case "jadwal_jendela":
      return k(SlidersHorizontalIcon, w.jadwalJendela(slotHari(d.hari, d.slot), d.menit));
    case "roster_slot":
      return k(UsersThreeIcon, w.rosterSlot(slotHari(d.hari, d.slot), d.praktikan));
    case "roster_susulan":
      return k(UsersThreeIcon, w.rosterSusulan(d.praktikan));
    case "roster_set":
      return k(UsersThreeIcon, w.rosterSet);
    case "praktikan_tambah":
      return k(UserPlusIcon, w.praktikanTambah(d.ditambah));
    case "susulan_draf":
      return k(
        CalendarBlankIcon,
        w.susulanDraf(typeof d.tanggal === "string" ? tanggalPanjang(d.tanggal, b.lang) : "?"),
      );
    case "tot_nyala":
      return k(ChalkboardTeacherIcon, w.totNyala);
    case "tot_mati":
      return k(ChalkboardTeacherIcon, w.totMati);
    case "modul_akses_ubah": {
      const t = Array.isArray(d.terbuka) ? (d.terbuka as number[]) : [];
      return k(LockKeyIcon, w.modulAkses(t.map((m) => modulLabel(m, b.lang)).join(", ")));
    }
    case "modul_brief":
      return k(
        NotePencilIcon,
        w.brief(modulLabel(Number(d.modul), b.lang), String(d.bahasa ?? "").toUpperCase()),
      );
    case "presentasi_unggah":
    case "presentasi_tautan":
    case "presentasi_aktifkan":
    case "presentasi_nonaktifkan":
    case "presentasi_hapus":
      return k(FileTextIcon, w.presentasi);
    case "skema_unggah":
    case "skema_tautan":
    case "skema_aktifkan":
    case "skema_bawaan":
    case "skema_hapus":
      return k(FileTextIcon, w.skema(modulLabel(Number(d.modul), b.lang)));
    case "server_daftar":
      return k(HardDrivesIcon, w.serverDaftar(b.server(d.serverId)));
    case "server_ubah":
      return k(HardDrivesIcon, w.serverUbah(b.server(d.id)));
    case "server_hapus":
      return k(TrashIcon, w.serverHapus(String(d.kode ?? "?")), true);
    case "server_token_baru":
      return k(KeyIcon, w.serverToken(b.server(d.id)));
    case "perintah_kirim":
      return k(TerminalWindowIcon, w.perintah(d.aksi, b.server(d.serverId)));
    case "perintah_ulang":
      return k(TerminalWindowIcon, w.perintahUlang);
    case "perintah_batal":
      return k(TerminalWindowIcon, w.perintahBatal);
    case "perintah_hapus":
      return k(TrashIcon, w.perintahHapus(b.server(d.serverId)));
    case "riwayat_hapus":
      return k(TrashIcon, w.riwayatHapus(b.server(d.serverId)));
    case "sesi_kelompok_set":
      return k(UsersThreeIcon, w.kelompokSet(b.grup(d), d.aktif === true));
    case "sesi_kelompok_catatan":
      return k(NotePencilIcon, w.kelompokCatatan(b.grup(d)));
    case "kejadian_tambah":
      return k(WarningIcon, w.kejadianTambah(b.sesi(d.sesiId)));
    case "kejadian_ubah":
      return k(WarningIcon, w.kejadianUbah(b.sesi(d.sesiId)));
    case "kejadian_hapus":
      return k(TrashIcon, w.kejadianHapus(b.sesi(d.sesiId)));
    case "kejadian_pulih":
      return k(WarningIcon, w.kejadianPulih(b.sesi(d.sesiId)));
    case "catatan_sesi":
      return k(NotePencilIcon, w.catatanSesi(b.sesi(d.sesiId)));
    case "laporan_kirim":
      return k(PaperPlaneTiltIcon, w.laporanKirim(d.judul));
    case "laporan_status":
      return k(
        ChatTextIcon,
        w.laporanStatus(d.judul, d.status === "selesai" ? w.statusSelesai : w.statusProses),
      );
    case "sandi_diatur":
      return k(KeyIcon, w.sandiAtur);
    case "sandi_diganti":
      return k(KeyIcon, w.sandiGanti);
    case "konsol_minta":
      return k(
        TerminalWindowIcon,
        w.konsolMinta(
          w.konsolTarget(d.target),
          b.server(d.serverId),
          pk(d.id),
          d.alasan,
          d.pencipta === true || d.tanpaPersetujuan === true,
        ),
      );
    case "konsol_gabung":
      return k(TerminalWindowIcon, w.konsolGabung(pk(d.id)));
    case "konsol_minta_gabung":
      return k(TerminalWindowIcon, w.konsolMintaGabung(pk(d.id), d.alasan));
    case "konsol_gabung_setujui":
    case "konsol_gabung_tolak":
      return k(
        row.aksi === "konsol_gabung_setujui" ? TerminalWindowIcon : XCircleIcon,
        w.konsolGabungJawab(pk(d.id), b.who(d.nim), row.aksi === "konsol_gabung_setujui"),
      );
    case "konsol_kendali":
      return k(TerminalWindowIcon, w.konsolKendali(pk(d.id), b.who(d.ke)));
    case "konsol_paksa":
      return k(WarningIcon, w.konsolPaksa(pk(d.id), d.alasan), true);
    case "konsol_setujui":
      return k(TerminalWindowIcon, w.konsolSetujui(pk(d.id)));
    case "konsol_tolak":
      return k(XCircleIcon, w.konsolTolak(pk(d.id), String(d.catatan ?? d.teks ?? "")));
    case "konsol_batal":
      return k(XCircleIcon, w.konsolBatal(pk(d.id)));
    case "konsol_buka":
      return k(TerminalWindowIcon, w.konsolBuka(pk(d.id), w.konsolTarget(d.target)));
    case "konsol_akhiri":
      return k(StopIcon, w.konsolAkhiri(pk(d.id)));
    case "konsol_putus":
      return k(StopIcon, w.konsolPutus(pk(d.id), d.alasan), true);
    case "konsol_selesai": {
      const n = Number(d.bytes);
      const data = Number.isFinite(n)
        ? n < 1024 * 1024
          ? `${Math.max(1, Math.round(n / 1024))} KB`
          : `${(n / 1024 ** 2).toFixed(1)} MB`
        : "?";
      return {
        ...k(MonitorIcon, w.konsolSelesai(pk(d.id), data)),
        transkrip: typeof d.transkrip === "string" && d.transkrip ? d.transkrip : undefined,
      };
    }
    case "konsol_oke":
      return k(MonitorIcon, w.konsolOke(pk(d.id)));
    case "konsol_tanya":
      return k(ChatTextIcon, w.konsolTanya(pk(d.id), d.teks));
    default:
      if (row.aksi.startsWith("konsol_")) return k(MonitorIcon, w.konsol);
      return k(BroadcastIcon, w.lain(row.aksi));
  }
}
