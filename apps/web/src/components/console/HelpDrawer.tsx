/**
 * Ada Masalah? (Phase 10, mockup c12-run help center): what an Asisten
 * opens when something goes wrong mid session.
 *
 * - A row of live checks: the site's recent errors, the live relay, the
 *   Pi's heartbeat, its services, the groups' data and the Pi clock.
 * - Searchable problems by area, each with what was found right now and
 *   buttons that do the fix (or open where it is done).
 * - Still stuck: the Pi Console, and a note into the session's history.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowsClockwiseIcon,
  BookOpenTextIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckSquareIcon,
  ClockIcon,
  CpuIcon,
  DoorOpenIcon,
  EyeSlashIcon,
  GlobeSimpleIcon,
  HandCoinsIcon,
  HandshakeIcon,
  HardDrivesIcon,
  LockKeyOpenIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PulseIcon,
  TerminalWindowIcon,
  TimerIcon,
  UserPlusIcon,
  UserSwitchIcon,
  WifiSlashIcon,
  type Icon as PhIcon,
} from "@phosphor-icons/react";
import Drawer from "../ui/Drawer";
import Pill from "../ui/Pill";
import { dict, getJson, href, postJson } from "../../lib/app";
import { kelompokLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { useSiaranStatus } from "../../lib/siaran";
import { sendCommand, svcTone } from "../server/ops";
import { jamLab } from "../shared/Instruments";
import TambahPraktikan from "./TambahPraktikan";
import type { ServerState } from "./data";
import { isOnline, type GroupRow, type SesiRunning } from "./types";
import "./help-drawer.css";

const HD = dict({
  id: {
    title: "Ada Masalah?",
    sub: "Dicek otomatis tiap 10 detik. Yang kuning perlu dilihat.",
    close: "Tutup",
    resize: "Ubah lebar laci",
    sys: {
      site: "Situs",
      siteOk: "normal",
      siteBad: (n: number, m: number) => `${n} galat ${m} menit terakhir`,
      relay: "Siaran langsung",
      relayOk: "terhubung",
      relayBad: "terputus, data diambil berkala",
      pi: "Pi",
      piOk: (s: number) => `denyut ${s} detik lalu`,
      piBad: "tidak ada denyut",
      piNone: "belum ada server",
      svc: "Layanan",
      svcOk: (n: number) => `${n} aktif`,
      svcBad: (x: string) => `${x} tidak aktif`,
      data: "Data kelompok",
      dataOk: "semua mengirim",
      dataBad: (x: string) => `${x} belum mengirim`,
      clock: "Jam Pi",
      clockOk: "selaras",
      clockBad: "tidak selaras",
    },
    search: "Cari: masuk, data, broker, SeeLabs…",
    spotted: "Terdeteksi",
    cat: {
      orang: "Praktikan dan kelompok",
      data: "Papan dan data",
      server: "Server",
      sesi: "Sesi",
      nilai: "Nilai dan SeeLabs",
      situs: "Situs dan proyektor",
    },
    masuk: "Praktikan tidak bisa masuk",
    masukFound: (list: string) => `Gagal masuk 10 menit terakhir: ${list}.`,
    masukNone: "Tidak ada percobaan gagal 10 menit terakhir.",
    masukCode: (k: string) => ` Kode masuk sesi ini: ${k}.`,
    kodeSalah: "kode salah",
    bukanRoster: "tidak di roster",
    addRoster: "Tambah ke Roster",
    unlock: (nim: string) => `Buka Kunci ${nim}`,
    unlocked: (nim: string) => `Kunci ${nim} dibuka. Minta dia memasukkan kode lagi.`,
    notLocked: "NIM ini sudah tidak terkunci.",
    pindah: "Praktikan di kelompok yang salah",
    pindahFound:
      "Pindahkan di Persiapan Langsung; alasannya dicatat dan roster mingguan tidak berubah.",
    openPrep: "Persiapan Langsung",
    hadir: "Hadir tapi tercatat tidak hadir",
    hadirFound: (n: number) =>
      n ? `${n} praktikan belum tercatat masuk.` : "Semua praktikan sudah tercatat masuk.",
    diam: "Papan kelompok tidak mengirim data",
    diamFound: (x: string) => `${x} belum mengirim data di sesi ini.`,
    diamNone: "Semua kelompok sudah mengirim data.",
    openGroup: (g: string) => `Buka ${g}`,
    announce: "Umumkan",
    delay: "Delay di jurnal aneh",
    delayFound: (ok: boolean) =>
      ok
        ? "Jam Pi selaras dengan situs. Papan memakai jam Pi lewat NTP."
        : "Jam Pi tidak selaras dengan situs. Selaraskan dulu, lalu minta kelompok mengulang pengukuran.",
    sync: "Sinkronkan Jam Pi",
    layanan: "Broker atau layanan modul mati",
    layananFound: (x: string) => x,
    openServer: "Buka Laci Server",
    pi: "Pi tidak merespons",
    piFound: (ok: boolean) =>
      ok
        ? "Denyut normal. Kalau berhenti lebih dari 2 menit, banner merah muncul di atas papan."
        : "Pi tidak mengirim denyut. Cek daya dan jaringan Pi, lalu lihat Konsol Pi.",
    konsol: "Konsol Pi",
    net: "Diagnosis Jaringan",
    waktu: "Waktu kurang",
    waktuFound: (n: number) => `Sisa ${n} menit. Perpanjang tetap sebelum slot berikutnya.`,
    plus: (n: number) => `+${n} Menit`,
    extended: (n: number) => `Sesi sekarang ${n} menit.`,
    extendFail: "Tidak bisa diperpanjang lagi.",
    asisten: "Asisten harus pergi",
    asistenFound:
      "Serahkan kelompoknya di Persiapan Langsung, lewat Ganti Asisten di tiap kelompok.",
    seelabs: "Akun SeeLabs tidak melihat kelompoknya",
    seelabsFound:
      "SeeLabs hanya menampilkan kelompok shift yang dicentang di Input Jaga (paling banyak 2 shift sehari).",
    guide: "Panduan SeeLabs",
    hold: "Titipkan ke Akun Lain",
    segar: "Halaman tidak memperbarui sendiri",
    segarFound: (live: boolean) =>
      live
        ? "Siaran langsung terhubung."
        : "Siaran langsung terputus. Data tetap diambil tiap beberapa detik.",
    reload: "Muat Ulang Data",
    kunci: "Kunci jawaban tampil di proyektor",
    kunciFound: (on: boolean) =>
      on ? "Tampilkan Kunci menyala di layar ini." : "Tampilkan Kunci mati di layar ini.",
    hideKeys: "Sembunyikan Semua Kunci",
    done: "Dikerjakan.",
    stuck: "Belum Ketemu?",
    note: "Catat kejadian di riwayat sesi",
    notePh: "Contoh: router lab mati 5 menit, sesi diperpanjang",
    noteGo: "Catat",
    noted: "Dicatat di riwayat sesi.",
    fail: "Tidak bisa sekarang. Coba lagi.",
    empty: "Tidak ada yang cocok.",
  },
  en: {
    title: "Something Wrong?",
    sub: "Checked every 10 seconds. Yellow needs a look.",
    close: "Close",
    resize: "Resize the drawer",
    sys: {
      site: "Site",
      siteOk: "normal",
      siteBad: (n: number, m: number) => `${n} errors in ${m} minutes`,
      relay: "Live relay",
      relayOk: "connected",
      relayBad: "down, data polled instead",
      pi: "Pi",
      piOk: (s: number) => `beat ${s} seconds ago`,
      piBad: "no heartbeat",
      piNone: "no server yet",
      svc: "Services",
      svcOk: (n: number) => `${n} up`,
      svcBad: (x: string) => `${x} not running`,
      data: "Group data",
      dataOk: "all sending",
      dataBad: (x: string) => `${x} sent nothing yet`,
      clock: "Pi clock",
      clockOk: "in sync",
      clockBad: "out of sync",
    },
    search: "Search: sign in, data, broker, SeeLabs…",
    spotted: "Spotted",
    cat: {
      orang: "Students and groups",
      data: "Boards and data",
      server: "Server",
      sesi: "The session",
      nilai: "Scores and SeeLabs",
      situs: "Site and projector",
    },
    masuk: "A student can't sign in",
    masukFound: (list: string) => `Failed sign ins in the last 10 minutes: ${list}.`,
    masukNone: "No failed sign ins in the last 10 minutes.",
    masukCode: (k: string) => ` This session's sign in code: ${k}.`,
    kodeSalah: "wrong code",
    bukanRoster: "not on the roster",
    addRoster: "Add to the Roster",
    unlock: (nim: string) => `Unlock ${nim}`,
    unlocked: (nim: string) => `${nim} is unlocked. Ask them to enter the code again.`,
    notLocked: "This NIM isn't locked anymore.",
    pindah: "A student is in the wrong group",
    pindahFound:
      "Move them in Live Preparation; the reason is recorded and the weekly roster stays.",
    openPrep: "Live Preparation",
    hadir: "Here but marked absent",
    hadirFound: (n: number) =>
      n ? `${n} students have no sign in yet.` : "Every student is signed in.",
    diam: "A group's board sends nothing",
    diamFound: (x: string) => `${x} sent no data in this session yet.`,
    diamNone: "Every group has sent data.",
    openGroup: (g: string) => `Open ${g}`,
    announce: "Announce",
    delay: "The journal's delays look wrong",
    delayFound: (ok: boolean) =>
      ok
        ? "The Pi clock is in sync with the site. Boards take the Pi's time over NTP."
        : "The Pi clock is out of sync with the site. Sync it, then have the groups measure again.",
    sync: "Sync the Pi Clock",
    layanan: "The broker or a module service is down",
    layananFound: (x: string) => x,
    openServer: "Open the Server Drawer",
    pi: "The Pi doesn't respond",
    piFound: (ok: boolean) =>
      ok
        ? "Heartbeat normal. If it stops for over 2 minutes, a red banner shows above the board."
        : "The Pi sends no heartbeat. Check its power and network, then the Pi Console.",
    konsol: "Pi Console",
    net: "Network Check",
    waktu: "Running out of time",
    waktuFound: (n: number) => `${n} minutes left. Extend, still before the next slot.`,
    plus: (n: number) => `+${n} Minutes`,
    extended: (n: number) => `The session is now ${n} minutes.`,
    extendFail: "It can't be extended any further.",
    asisten: "An assistant has to leave",
    asistenFound:
      "Hand their groups over in Live Preparation, with Change Assistant on each group.",
    seelabs: "A SeeLabs account can't see its group",
    seelabsFound:
      "SeeLabs only lists groups of shifts ticked in Input Jaga (2 shifts a day at most).",
    guide: "SeeLabs Guide",
    hold: "Hold Through Another Account",
    segar: "The page doesn't update by itself",
    segarFound: (live: boolean) =>
      live ? "Live relay connected." : "Live relay down. Data still refreshes every few seconds.",
    reload: "Reload the Data",
    kunci: "Answer keys show on the projector",
    kunciFound: (on: boolean) =>
      on ? "Show the Keys is on at this screen." : "Show the Keys is off at this screen.",
    hideKeys: "Hide Every Key",
    done: "Done.",
    stuck: "Still Stuck?",
    note: "Note it in the session history",
    notePh: "For example: lab router down 5 minutes, session extended",
    noteGo: "Note It",
    noted: "Noted in the session history.",
    fail: "Not possible right now. Try again.",
    empty: "Nothing matches.",
  },
  zh: {
    title: "出问题了？",
    sub: "每 10 秒自动检查。黄色的需要看一下。",
    close: "关闭",
    resize: "调整侧栏宽度",
    sys: {
      site: "网站",
      siteOk: "正常",
      siteBad: (n: number, m: number) => `${m} 分钟内 ${n} 个错误`,
      relay: "实时推送",
      relayOk: "已连接",
      relayBad: "已断开，改为定时拉取",
      pi: "Pi",
      piOk: (s: number) => `${s} 秒前有心跳`,
      piBad: "没有心跳",
      piNone: "还没有服务器",
      svc: "服务",
      svcOk: (n: number) => `${n} 个运行中`,
      svcBad: (x: string) => `${x} 没有运行`,
      data: "小组数据",
      dataOk: "都在发送",
      dataBad: (x: string) => `${x} 还没发送`,
      clock: "Pi 时钟",
      clockOk: "已同步",
      clockBad: "没同步",
    },
    search: "搜索：登录、数据、broker、SeeLabs…",
    spotted: "已发现",
    cat: {
      orang: "学生和小组",
      data: "开发板和数据",
      server: "服务器",
      sesi: "这节课",
      nilai: "成绩和 SeeLabs",
      situs: "网站和投影",
    },
    masuk: "学生进不来",
    masukFound: (list: string) => `最近 10 分钟登录失败：${list}。`,
    masukNone: "最近 10 分钟没有登录失败。",
    masukCode: (k: string) => ` 这节课的签到码：${k}。`,
    kodeSalah: "签到码错误",
    bukanRoster: "不在名单上",
    addRoster: "加入名单",
    unlock: (nim: string) => `解锁 ${nim}`,
    unlocked: (nim: string) => `${nim} 已解锁。请他再输入一次签到码。`,
    notLocked: "这个 NIM 已经没有锁定了。",
    pindah: "学生分错组了",
    pindahFound: "在实时准备里换组；原因会被记录，每周名单不变。",
    openPrep: "实时准备",
    hadir: "人在但记为缺席",
    hadirFound: (n: number) => (n ? `${n} 名学生还没有登录记录。` : "所有学生都已登录。"),
    diam: "小组开发板没有发送数据",
    diamFound: (x: string) => `${x}这节课还没发送数据。`,
    diamNone: "所有组都已发送数据。",
    openGroup: (g: string) => `打开${g}`,
    announce: "公告",
    delay: "实验报告里的延迟不对",
    delayFound: (ok: boolean) =>
      ok
        ? "Pi 时钟和网站同步。开发板通过 NTP 用 Pi 的时间。"
        : "Pi 时钟和网站不同步。先同步，再让小组重新测量。",
    sync: "同步 Pi 时钟",
    layanan: "Broker 或模块服务停了",
    layananFound: (x: string) => x,
    openServer: "打开服务器侧栏",
    pi: "Pi 没有响应",
    piFound: (ok: boolean) =>
      ok
        ? "心跳正常。停止超过 2 分钟时，看板上方会出现红色横幅。"
        : "Pi 没有心跳。检查电源和网络，再看 Pi 控制台。",
    konsol: "Pi 控制台",
    net: "网络诊断",
    waktu: "时间不够",
    waktuFound: (n: number) => `还剩 ${n} 分钟。延长，但要在下一个时段之前。`,
    plus: (n: number) => `+${n} 分钟`,
    extended: (n: number) => `这节课现在是 ${n} 分钟。`,
    extendFail: "不能再延长了。",
    asisten: "助教要离开",
    asistenFound: "在实时准备里，通过每个组的更换助教交接。",
    seelabs: "SeeLabs 账号看不到自己的组",
    seelabsFound: "SeeLabs 只显示在 Input Jaga 里勾选的时段的组（每天最多 2 个时段）。",
    guide: "SeeLabs 指南",
    hold: "通过其他账号代存",
    segar: "页面不会自己更新",
    segarFound: (live: boolean) =>
      live ? "实时推送已连接。" : "实时推送已断开。数据仍每隔几秒刷新。",
    reload: "重新加载数据",
    kunci: "答案显示在投影上",
    kunciFound: (on: boolean) => (on ? "这个屏幕开着显示答案。" : "这个屏幕关着显示答案。"),
    hideKeys: "隐藏所有答案",
    done: "已完成。",
    stuck: "还没解决？",
    note: "记到这节课的记录里",
    notePh: "例如：实验室路由器断了 5 分钟，课已延长",
    noteGo: "记录",
    noted: "已记到这节课的记录。",
    fail: "现在不行。再试一次。",
    empty: "没有匹配的。",
  },
});

interface Waspada {
  galat: { jumlah: number; menit: number; ambang: number };
  gagalMasuk?: { nim: string; jenis: string; pada: string }[];
}

interface Act {
  label: string;
  icon: PhIcon;
  primary?: boolean;
  run?: () => void | Promise<void>;
  href?: string;
}
interface Issue {
  id: string;
  cat: keyof (typeof HD)["id"]["cat"];
  icon: PhIcon;
  title: string;
  found: string;
  warn?: boolean;
  acts: Act[];
}

export default function HelpDrawer({
  lang,
  open,
  onOpenChange,
  sesi,
  sisa,
  groups,
  servers,
  kunci,
  onKunci,
  onView,
  onGroup,
  onAnnounce,
  onServer,
  onSeelabs,
  onRefresh,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sesi: SesiRunning;
  sisa: number;
  groups: GroupRow[];
  servers: ServerState | null;
  kunci: boolean;
  onKunci: (v: boolean) => void;
  onView: (v: "prep") => void;
  onGroup: (id: number) => void;
  onAnnounce: () => void;
  onServer: () => void;
  onSeelabs: (tab?: "panduan" | "titipan") => void;
  onRefresh: () => void;
}) {
  const h = HD[lang];
  const relay = useSiaranStatus();
  const [w, setW] = useState<Waspada | null>(null);
  const [q, setQ] = useState("");
  const [buka, setBuka] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [add, setAdd] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const load = () =>
      getJson<{ ok: boolean } & Waspada>("/api/session/waspada")
        .then((d) => d.ok && setW(d))
        .catch(() => {});
    void load();
    const id = setInterval(() => {
      void load();
      setTick((x) => x + 1);
    }, 10_000);
    return () => clearInterval(id);
  }, [open]);

  const d = piDari(servers);
  const hb = d?.denyutTerakhir ?? null;
  const piOn = d ? isOnline(hb, d.batasLuringDetik) : false;
  const umur = hb ? Math.max(0, Math.round((Date.now() - Date.parse(hb.pada)) / 1000)) : null;
  const svc = Object.entries(hb?.layanan ?? {});
  const svcBad = svc.filter(([, st]) => svcTone(st) === "bad");
  const svcUp = svc.filter(([, st]) => svcTone(st) === "ok").length;
  const aktif = groups.filter((g) => g.sesiAktif);
  const sunyi = aktif.filter((g) => (g.telemetri?.count ?? 0) === 0);
  const absen = aktif.reduce((a, g) => a + Math.max(0, g.anggotaTotal - g.hadir), 0);
  const gagal = w?.gagalMasuk ?? [];
  // Three groups by name, then how many more.
  const daftarG = (xs: GroupRow[]) =>
    xs
      .slice(0, 3)
      .map((g) => kelompokLabel(g.nomor, lang))
      .join(", ") + (xs.length > 3 ? ` +${xs.length - 3}` : "");

  const sys: [boolean, string, string][] = [
    [
      !w || w.galat.jumlah < w.galat.ambang,
      h.sys.site,
      w && w.galat.jumlah >= w.galat.ambang
        ? h.sys.siteBad(w.galat.jumlah, w.galat.menit)
        : h.sys.siteOk,
    ],
    [relay === "live", h.sys.relay, relay === "live" ? h.sys.relayOk : h.sys.relayBad],
    [
      piOn,
      d ? d.server.nama : h.sys.pi,
      !d ? h.sys.piNone : piOn && umur !== null ? h.sys.piOk(umur) : h.sys.piBad,
    ],
    [
      svcBad.length === 0,
      h.sys.svc,
      svcBad.length ? h.sys.svcBad(svcBad.map(([k]) => k).join(", ")) : h.sys.svcOk(svcUp),
    ],
    [sunyi.length === 0, h.sys.data, sunyi.length ? h.sys.dataBad(daftarG(sunyi)) : h.sys.dataOk],
    [
      hb?.jamSelaras !== false,
      h.sys.clock,
      hb?.jamSelaras === false ? h.sys.clockBad : h.sys.clockOk,
    ],
  ];

  async function extend(by: number) {
    const cur = sesi.durasiMenit ?? 150;
    const r = await postJson<{ ok: boolean; durasiMenit?: number }>("/api/session/durasi", {
      menit: cur + by,
    }).catch(() => ({ ok: false }) as { ok: boolean; durasiMenit?: number });
    if (!r.ok) return window.Toast?.show(h.extendFail, "warn");
    window.Toast?.show(h.extended(r.durasiMenit ?? cur + by), "ok");
    onRefresh();
  }

  const close = () => onOpenChange(false);
  const issues: Issue[] = useMemo(() => {
    const list: Issue[] = [
      {
        id: "masuk",
        cat: "orang",
        icon: DoorOpenIcon,
        title: h.masuk,
        warn: gagal.length > 0,
        found:
          (gagal.length
            ? h.masukFound(
                gagal
                  .slice(0, 4)
                  .map(
                    (x) =>
                      `${x.nim} (${x.jenis === "kode" ? h.kodeSalah : h.bukanRoster}, ${jamLab(x.pada)})`,
                  )
                  .join(", "),
              )
            : h.masukNone) + (sesi.kodeMasuk ? h.masukCode(sesi.kodeMasuk) : ""),
        acts: [
          {
            label: h.addRoster,
            icon: UserPlusIcon,
            primary: gagal.length > 0,
            run: () => setAdd(true),
          },
          // A wrong code twice locks that NIM; lift it here.
          ...[...new Set(gagal.filter((x) => x.jenis === "kode").map((x) => x.nim))]
            .slice(0, 3)
            .map((nim) => ({
              label: h.unlock(nim),
              icon: LockKeyOpenIcon,
              run: () => void bukaKunci(nim),
            })),
        ],
      },
      {
        id: "pindah",
        cat: "orang",
        icon: UserSwitchIcon,
        title: h.pindah,
        found: h.pindahFound,
        acts: [{ label: h.openPrep, icon: UserSwitchIcon, run: () => (close(), onView("prep")) }],
      },
      {
        id: "hadir",
        cat: "orang",
        icon: CheckSquareIcon,
        title: h.hadir,
        found: h.hadirFound(absen),
        acts: [{ label: h.openPrep, icon: CheckSquareIcon, run: () => (close(), onView("prep")) }],
      },
      {
        id: "diam",
        cat: "data",
        icon: WifiSlashIcon,
        title: h.diam,
        warn: sunyi.length > 0 && aktif.length > sunyi.length,
        found: sunyi.length ? h.diamFound(daftarG(sunyi)) : h.diamNone,
        acts: [
          ...sunyi.slice(0, 2).map((g, i) => ({
            label: h.openGroup(kelompokLabel(g.nomor, lang)),
            icon: PulseIcon,
            primary: i === 0,
            run: () => (close(), onGroup(g.id)),
          })),
          ...(sesi.kendali !== false
            ? [{ label: h.announce, icon: MegaphoneIcon, run: () => (close(), onAnnounce()) }]
            : []),
        ],
      },
      {
        id: "delay",
        cat: "data",
        icon: ClockIcon,
        title: h.delay,
        warn: hb?.jamSelaras === false,
        found: h.delayFound(hb?.jamSelaras !== false),
        acts: d
          ? [
              {
                label: h.sync,
                icon: ArrowsClockwiseIcon,
                primary: hb?.jamSelaras === false,
                run: () => void sendCommand(d.server.id, "jam.selaraskan", {}, lang),
              },
            ]
          : [],
      },
      {
        id: "layanan",
        cat: "server",
        icon: HardDrivesIcon,
        title: h.layanan,
        warn: svcBad.length > 0,
        found: h.layananFound(
          svc.length ? svc.map(([k, st]) => `${k}: ${st}`).join(" · ") : h.sys.piNone,
        ),
        acts: [
          {
            label: h.openServer,
            icon: HardDrivesIcon,
            primary: svcBad.length > 0,
            run: () => (close(), onServer()),
          },
        ],
      },
      {
        id: "pi",
        cat: "server",
        icon: CpuIcon,
        title: h.pi,
        warn: !!d && !piOn,
        found: h.piFound(piOn),
        acts: [
          ...(d
            ? [
                {
                  label: h.konsol,
                  icon: TerminalWindowIcon,
                  href: href(lang, `/servers?id=${d.server.id}`),
                },
                {
                  label: h.net,
                  icon: GlobeSimpleIcon,
                  run: () => void sendCommand(d.server.id, "diag.jaringan", {}, lang),
                },
              ]
            : []),
          { label: h.openServer, icon: HardDrivesIcon, run: () => (close(), onServer()) },
        ],
      },
      {
        id: "waktu",
        cat: "sesi",
        icon: TimerIcon,
        title: h.waktu,
        warn: sisa <= 15,
        found: h.waktuFound(sisa),
        acts:
          sesi.kendali !== false
            ? [
                { label: h.plus(15), icon: TimerIcon, run: () => extend(15) },
                { label: h.plus(30), icon: TimerIcon, run: () => extend(30) },
              ]
            : [],
      },
      {
        id: "asisten",
        cat: "sesi",
        icon: HandshakeIcon,
        title: h.asisten,
        found: h.asistenFound,
        acts: [{ label: h.openPrep, icon: UserSwitchIcon, run: () => (close(), onView("prep")) }],
      },
      {
        id: "seelabs",
        cat: "nilai",
        icon: HandCoinsIcon,
        title: h.seelabs,
        found: h.seelabsFound,
        acts: [
          { label: h.guide, icon: BookOpenTextIcon, run: () => (close(), onSeelabs("panduan")) },
          { label: h.hold, icon: HandCoinsIcon, run: () => (close(), onSeelabs("titipan")) },
        ],
      },
      {
        id: "segar",
        cat: "situs",
        icon: ArrowsClockwiseIcon,
        title: h.segar,
        warn: relay === "putus",
        found: h.segarFound(relay === "live"),
        acts: [
          {
            label: h.reload,
            icon: ArrowsClockwiseIcon,
            run: () => (onRefresh(), window.Toast?.show(h.done, "ok")),
          },
        ],
      },
      {
        id: "kunci",
        cat: "situs",
        icon: EyeSlashIcon,
        title: h.kunci,
        warn: kunci,
        found: h.kunciFound(kunci),
        acts: kunci
          ? [
              {
                label: h.hideKeys,
                icon: EyeSlashIcon,
                primary: true,
                run: () => (onKunci(false), window.Toast?.show(h.done, "ok")),
              },
            ]
          : [],
      },
    ];
    return list;
    // tick re-runs the checks every 10 seconds while open.
  }, [lang, w, servers, groups, relay, kunci, sisa, tick, sesi]);

  // The first problem that was spotted opens by itself.
  useEffect(() => {
    if (open && buka === null) setBuka(issues.find((i) => i.warn)?.id ?? "masuk");
  }, [open]);

  const cari = q.trim().toLowerCase();
  const shown = issues.filter((i) => !cari || `${i.title} ${i.found}`.toLowerCase().includes(cari));
  const cats = [...new Set(shown.map((i) => i.cat))];

  async function bukaKunci(nim: string) {
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/hadir", {
      aksi: "bukakunci",
      nim,
    }).catch(() => ({ ok: false, kode: "gagal" }));
    window.Toast?.show(
      r.ok ? h.unlocked(nim) : r.kode === "tidak_terkunci" ? h.notLocked : h.fail,
      r.ok ? "ok" : "danger",
    );
  }

  async function catat() {
    const r = await postJson<{ ok: boolean }>("/api/session/kejadian", {
      aksi: "tambah",
      sesiId: sesi.id,
      teks: note.trim(),
    }).catch(() => ({ ok: false }));
    if (!r.ok) return window.Toast?.show(h.fail, "danger");
    setNote("");
    window.Toast?.show(h.noted, "ok");
  }

  const actBtn = (a: Act): ReactNode =>
    a.href ? (
      <a key={a.label} className="btn btn--sm" href={a.href}>
        <a.icon size={16} aria-hidden="true" />
        {a.label}
      </a>
    ) : (
      <button
        key={a.label}
        type="button"
        className={`btn btn--sm${a.primary ? " btn--primary" : ""}`}
        onClick={() => void a.run?.()}
      >
        <a.icon size={16} aria-hidden="true" />
        {a.label}
      </button>
    );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={h.title}
      description={h.sub}
      storeKey="console-help"
      minWidth={420}
      closeLabel={h.close}
      resizeLabel={h.resize}
    >
      <div className="stack stack--lg hdrawer">
        <div className="sysrow">
          {sys.map(([ok, l, v]) => (
            <span key={l} className="sysrow__i" data-t={ok ? "ok" : "warn"}>
              <span
                className={`dot ${ok ? "dot--ok" : "dot--warn dot--pulse"}`}
                aria-hidden="true"
              />
              <b>{l}</b>
              <span className="hint">{v}</span>
            </span>
          ))}
        </div>
        <label className="hdrawer__search">
          <MagnifyingGlassIcon size={18} aria-hidden="true" />
          <input
            className="field__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={h.search}
            aria-label={h.search}
          />
        </label>
        {shown.length === 0 && <p className="hint">{h.empty}</p>}
        {cats.map((c) => (
          <section key={c} className="stack stack--sm">
            <span className="label-caps">{h.cat[c]}</span>
            {shown
              .filter((i) => i.cat === c)
              .map((i) => {
                const isOpen = buka === i.id;
                return (
                  <div
                    key={i.id}
                    className="trbl"
                    data-open={isOpen ? "yes" : "no"}
                    data-tone={i.warn ? "warn" : undefined}
                  >
                    <button
                      type="button"
                      className="trbl__h"
                      aria-expanded={isOpen}
                      onClick={() => setBuka(isOpen ? null : i.id)}
                    >
                      <i.icon size={20} aria-hidden="true" />
                      <b className="grow">{i.title}</b>
                      {i.warn && <Pill tone="warn">{h.spotted}</Pill>}
                      {isOpen ? (
                        <CaretUpIcon size={14} aria-hidden="true" />
                      ) : (
                        <CaretDownIcon size={14} aria-hidden="true" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="trbl__body">
                        <p className="trbl__found">
                          <MagnifyingGlassIcon size={14} aria-hidden="true" />
                          <span>{i.found}</span>
                        </p>
                        {i.acts.length > 0 && (
                          <div className="trbl__acts">{i.acts.map(actBtn)}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </section>
        ))}
        <section className="panel hdrawer__stuck">
          <h3 className="panel__title">{h.stuck}</h3>
          {d && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <a className="btn" href={href(lang, `/servers?id=${d.server.id}`)}>
                <TerminalWindowIcon size={18} aria-hidden="true" />
                {h.konsol}
              </a>
            </div>
          )}
          <div className="field">
            <span className="field__label">{h.note}</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="field__input grow"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={h.notePh}
                maxLength={300}
              />
              <button
                type="button"
                className="btn"
                disabled={note.trim().length < 4}
                onClick={() => void catat()}
              >
                {h.noteGo}
              </button>
            </div>
          </div>
        </section>
      </div>
      <TambahPraktikan
        lang={lang}
        open={add}
        onOpenChange={setAdd}
        groups={groups.map((g) => ({ nomor: g.nomor, aktif: g.sesiAktif }))}
        onAdded={onRefresh}
      />
    </Drawer>
  );
}

/** The lab Pi: the one server's detail, else the first listed server (a
 *  rig or a lab with a spare Pi lists more than one). */
function piDari(servers: ServerState | null) {
  if (servers?.detail) return servers.detail;
  const s = servers?.list[0];
  return s
    ? { server: s, denyutTerakhir: s.denyutTerakhir, batasLuringDetik: s.batasLuringDetik }
    : null;
}

/** Whether Ada Masalah? should show a yellow dot: the Pi silent, a service
 *  down, the clock off, or a group that sent nothing while others did. */
export function adaMasalah(servers: ServerState | null, groups: GroupRow[]): boolean {
  const d = piDari(servers);
  const hb = d?.denyutTerakhir ?? null;
  if (d && !isOnline(hb, d.batasLuringDetik)) return true;
  if (Object.values(hb?.layanan ?? {}).some((st) => svcTone(st) === "bad")) return true;
  if (hb && hb.jamSelaras === false) return true;
  const aktif = groups.filter((g) => g.sesiAktif);
  const sunyi = aktif.filter((g) => (g.telemetri?.count ?? 0) === 0).length;
  return sunyi > 0 && sunyi < aktif.length;
}
