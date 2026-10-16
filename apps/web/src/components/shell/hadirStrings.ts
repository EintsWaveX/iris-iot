/**
 * Words for the attendance banner (HadirNotice.tsx, Phase 18): the reminder
 * to start or check in before the slot's base clock, the receipt, and the
 * How It Counts rows. Amounts come in as "Rp2.000" strings.
 */
import { dict } from "../../lib/app";

export const T = dict({
  id: {
    region: "Kehadiranmu",
    sesi: (n: number) => `Sesi ${n}`,
    susulan: "Sesi Susulan",
    timer: "Sisa waktu",
    // Before the base clock
    autoH: "Sesi dimulai otomatis",
    autoJumat: "Dimulai otomatis setelah Sholat Jum'at",
    autoHint: (base: string, telat: string, rp: string) =>
      `Hadir paling lambat ${base}. Mulai ${telat} dihitung telat ${rp} per menit. Memulai sesi juga menandai kamu hadir.`,
    // Running, not checked in yet
    jalanSendiri: (base: string) => `Sesi dimulai otomatis oleh IRIS ${base}`,
    jalanSaja: "Sesi sudah berjalan",
    masihTepat: (telat: string) => `Hadir sebelum ${telat} masih tepat waktu.`,
    potong: (rp: string, tambah: string, batas: string) =>
      `Potong ${rp} sekarang, bertambah ${tambah} tiap menit sampai ${batas}.`,
    lewat: (batas: string) =>
      `Lewat ${batas}. Hadir sekarang tercatat Mangkir Mengajar, dan sesi ini tidak dibayar kecuali PJ memutuskan lain.`,
    // Receipt
    tercatat: "Tercatat hadir",
    // Izin
    izinH: (sesi: string) => `Kamu Izin untuk ${sesi} hari ini`,
    izinP:
      "Tidak ada hitungan telat atau Mangkir. Kalau tetap datang, tandai hadir supaya tercatat.",
    // The auto-start was refused
    tolakH: (sesi: string, base: string) => `${sesi} tidak dimulai otomatis pukul ${base}`,
    tolakModul: (m: number) =>
      `Modul ${m} masih ditutup. Buka di Persiapan, Akses Modul, lalu mulai sesinya. Jam hadir tetap sama, jadi tandai hadir seperti biasa.`,
    tolakTot:
      "Mode TOT sedang aktif, jadi sesi asli tidak dimulai otomatis. Jam hadir tetap sama, jadi tandai hadir seperti biasa.",
    tolakLain:
      "IRIS tidak bisa memulainya sendiri. Mulai dari Konsol. Jam hadir tetap sama, jadi tandai hadir seperti biasa.",
    // Buttons
    hadir: "Saya Sudah di Ruang Praktikum",
    mulai: "Mulai Sesi Sekarang",
    mulaiSesi: "Mulai Sesi",
    cara: "Cara Dihitung",
    batal: (n: number) => `Batalkan (${n})`,
    tutup: "Tutup",
    bukaAkses: "Buka Akses Modul",
    // Toasts
    mulaiOk: (jam: string) => `Sesi dimulai ${jam} dan kamu tercatat hadir.`,
    gagal: "Gagal mengirim. Coba lagi.",
    sudah: "Kamu sudah tercatat hadir.",
    belumBuka: "Belum waktunya tandai hadir.",
    selesai: "Sesi ini sudah selesai.",
    tidakJadwal: "Kamu tidak dijadwalkan di sesi ini.",
    dibatalkan: "Kehadiran dibatalkan.",
    // Status labels
    sTepat: "Tepat Waktu",
    sTelat: (m: number) => `Telat ${m} Menit`,
    sMm: "Mangkir Mengajar",
    sBerjalan: (m: number) => `Belum Hadir · Telat ${m}`,
    sLewat: "Belum Hadir · Lewat Batas",
    // Pay line
    pTepat: "Dibayar penuh",
    pTelat: (rp: string) => `Potong ${rp}`,
    pMm: "Sesi ini tidak dibayar",
    // Rules popover
    jumat:
      "Jumat Sesi 3 dimulai 13:00 karena Sholat Jum'at, dan berjalan paling lama sampai 15:25 saat Sesi 4 dimulai.",
    rTepat: (b: string) => `Sampai ${b}`,
    rTepatT: "Tepat Waktu",
    rTelat: (a: string, b: string) => `${a} sampai ${b}`,
    rTelatT: (rp: string) => `Telat, ${rp} per menit`,
    rMm: (a: string) => `Mulai ${a}`,
    rMmT: "Telat 10 menit dan Mangkir Mengajar",
    rMangkir: "Tidak hadir sampai sesi selesai",
    rIzin: "Izin",
    rIzinT: "Tidak dihitung, tetap bisa tandai hadir",
    rCatatan:
      "Mangkir dan Mangkir Mengajar membuat sesi itu tidak dibayar. PJ slot bisa menggeser jam sesi atau mengubah status dengan alasan.",
  },
  en: {
    region: "Your attendance",
    sesi: (n: number) => `Session ${n}`,
    susulan: "Make-up Session",
    timer: "Time left",
    autoH: "The session starts by itself",
    autoJumat: "Starts by itself after Friday prayer",
    autoHint: (base: string, telat: string, rp: string) =>
      `Check in by ${base}. From ${telat} it counts as late, ${rp} a minute. Starting the session checks you in too.`,
    jalanSendiri: (base: string) => `IRIS started the session at ${base}`,
    jalanSaja: "The session is running",
    masihTepat: (telat: string) => `Checking in before ${telat} is still on time.`,
    potong: (rp: string, tambah: string, batas: string) =>
      `${rp} off now, ${tambah} more each minute until ${batas}.`,
    lewat: (batas: string) =>
      `Past ${batas}. Checking in now records Mangkir Mengajar, and this session isn't paid unless the PJ decides otherwise.`,
    tercatat: "Checked in at",
    izinH: (sesi: string) => `You're excused from ${sesi} today`,
    izinP: "No lateness or Mangkir counts. If you come anyway, check in so it's on record.",
    tolakH: (sesi: string, base: string) => `${sesi} didn't start by itself at ${base}`,
    tolakModul: (m: number) =>
      `Module ${m} is still closed. Open it in Preparation, Module Access, then start the session. The check in time stays the same, so check in as usual.`,
    tolakTot:
      "TOT Mode is on, so real sessions don't start by themselves. The check in time stays the same, so check in as usual.",
    tolakLain:
      "IRIS couldn't start it by itself. Start it from the Console. The check in time stays the same, so check in as usual.",
    hadir: "I'm in the Practicum Room",
    mulai: "Start the Session Now",
    mulaiSesi: "Start Session",
    cara: "How It Counts",
    batal: (n: number) => `Undo (${n})`,
    tutup: "Close",
    bukaAkses: "Open Module Access",
    mulaiOk: (jam: string) => `Session started at ${jam} and you're checked in.`,
    gagal: "Couldn't send. Try again.",
    sudah: "You're already checked in.",
    belumBuka: "It's not time to check in yet.",
    selesai: "This session is already over.",
    tidakJadwal: "You aren't scheduled in this session.",
    dibatalkan: "Check in taken back.",
    sTepat: "On Time",
    sTelat: (m: number) => `${m} Minutes Late`,
    sMm: "Mangkir Mengajar",
    sBerjalan: (m: number) => `Not Here · ${m} Late`,
    sLewat: "Not Here · Past the Limit",
    pTepat: "Paid in full",
    pTelat: (rp: string) => `${rp} off`,
    pMm: "This session isn't paid",
    jumat:
      "Friday Session 3 starts at 13:00 because of Friday prayer, and runs at most until 15:25 when Session 4 starts.",
    rTepat: (b: string) => `Until ${b}`,
    rTepatT: "On Time",
    rTelat: (a: string, b: string) => `${a} to ${b}`,
    rTelatT: (rp: string) => `Late, ${rp} a minute`,
    rMm: (a: string) => `From ${a}`,
    rMmT: "10 minutes late and Mangkir Mengajar",
    rMangkir: "Never here before the session ends",
    rIzin: "Excused",
    rIzinT: "Not counted, can still check in",
    rCatatan:
      "Mangkir and Mangkir Mengajar leave that session unpaid. The slot's PJ can move the session's clock or change a status with a reason.",
  },
  zh: {
    region: "你的出勤",
    sesi: (n: number) => `第 ${n} 节课`,
    susulan: "补课",
    timer: "剩余时间",
    autoH: "课会自动开始",
    autoJumat: "周五礼拜后自动开始",
    autoHint: (base: string, telat: string, rp: string) =>
      `请在 ${base} 前签到。从 ${telat} 起算迟到，每分钟扣 ${rp}。开始上课也会同时为你签到。`,
    jalanSendiri: (base: string) => `IRIS 已在 ${base} 开始上课`,
    jalanSaja: "课已在进行",
    masihTepat: (telat: string) => `在 ${telat} 之前签到仍算准时。`,
    potong: (rp: string, tambah: string, batas: string) =>
      `现在已扣 ${rp}，到 ${batas} 为止每分钟再加扣 ${tambah}。`,
    lewat: (batas: string) =>
      `已过 ${batas}。现在签到会记为 Mangkir Mengajar，除非 PJ 另作决定，这节课不计酬。`,
    tercatat: "签到于",
    izinH: (sesi: string) => `你今天${sesi}已 Izin`,
    izinP: "不计迟到，也不计 Mangkir。如果还是来了，请签到留个记录。",
    tolakH: (sesi: string, base: string) => `${sesi}没有在 ${base} 自动开始`,
    tolakModul: (m: number) =>
      `模块 ${m} 还没有开放。请先在准备页的模块权限里打开，再开始上课。签到时间不变，照常签到即可。`,
    tolakTot: "TOT 模式已开启，所以正式的课不会自动开始。签到时间不变，照常签到即可。",
    tolakLain: "IRIS 没能自动开始这节课。请从控制台开始。签到时间不变，照常签到即可。",
    hadir: "我已在实验室",
    mulai: "现在开始上课",
    mulaiSesi: "开始上课",
    cara: "怎么算",
    batal: (n: number) => `撤销（${n}）`,
    tutup: "关闭",
    bukaAkses: "打开模块权限",
    mulaiOk: (jam: string) => `课已在 ${jam} 开始，你也已签到。`,
    gagal: "发送失败，请再试一次。",
    sudah: "你已经签到了。",
    belumBuka: "还没到签到时间。",
    selesai: "这节课已经结束。",
    tidakJadwal: "你没有被安排在这节课。",
    dibatalkan: "签到已撤销。",
    sTepat: "准时",
    sTelat: (m: number) => `迟到 ${m} 分钟`,
    sMm: "Mangkir Mengajar",
    sBerjalan: (m: number) => `未到 · 已迟到 ${m} 分钟`,
    sLewat: "未到 · 超过时限",
    pTepat: "全额计酬",
    pTelat: (rp: string) => `扣 ${rp}`,
    pMm: "这节课不计酬",
    jumat: "星期五第 3 节课因为周五礼拜 13:00 开始，到 15:25 第 4 节课开始时结束。",
    rTepat: (b: string) => `${b} 之前`,
    rTepatT: "准时",
    rTelat: (a: string, b: string) => `${a} 到 ${b}`,
    rTelatT: (rp: string) => `迟到，每分钟扣 ${rp}`,
    rMm: (a: string) => `${a} 起`,
    rMmT: "迟到 10 分钟以上，算 Mangkir Mengajar",
    rMangkir: "下课前一直没来",
    rIzin: "Izin",
    rIzinT: "不计，仍可签到",
    rCatatan:
      "Mangkir 和 Mangkir Mengajar 的那节课不计酬。本时段的 PJ 可以写明原因，调整上课时间或修改状态。",
  },
});
