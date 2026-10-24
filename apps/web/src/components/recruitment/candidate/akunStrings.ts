/** The oprec account dialog and menu (2026-10-24): id, en, zh. */
import type { Lang } from "../../../lib/kelas";

interface AkunStrings {
  title: { masuk: string; daftar: string };
  desc: string;
  tabs: { masuk: string; daftar: string };
  nim: string;
  nimHint: string;
  nama: string;
  namaHint: string;
  sandi: string;
  sandiBaru: string;
  sandiHint: string;
  ulang: string;
  klaim: string;
  klaimHint: string;
  lupa: string;
  terpisah: string;
  btn: { masuk: string; daftar: string; tunggu: string; batal: string };
  err: {
    nim: string;
    nama: string;
    sandi: string;
    ulang: string;
    salah: string;
    terkunci: string;
    akunAda: string;
    nimAsisten: string;
    perluKlaim: string;
    klaimSalah: string;
    offline: string;
    lain: string;
  };
  menu: { label: string; keluar: string; akun: string; badge: string };
  masukDulu: string;
  asisten: string;
  asistenBtn: string;
  /** Admin's side, in the Berkas review sheet */
  panel: {
    title: string;
    sama: string;
    beda: (roster: string) => string;
    tanpaRoster: string;
    reset: string;
    resetTitle: string;
    resetBody: (nim: string) => string;
    resetGo: string;
    kodeTitle: string;
    kodeBody: string;
    tutup: string;
    gagal: string;
  };
}

export const AK: Record<Lang, AkunStrings> = {
  id: {
    title: { masuk: "Masuk Akun Oprec", daftar: "Buat Akun Oprec" },
    desc: "Akun ini khusus Open Recruitment, terpisah dari akun praktikum.",
    tabs: { masuk: "Masuk", daftar: "Buat Akun" },
    nim: "NIM",
    nimHint: "10 atau 12 digit, sesuai KTM.",
    nama: "Nama Lengkap",
    namaHint: "Nama asli sesuai KTM. Admin mencocokkannya dengan berkasmu.",
    sandi: "Sandi",
    sandiBaru: "Buat Sandi",
    sandiHint: "Minimal 8 karakter. Jangan pakai sandi akun kampusmu.",
    ulang: "Ulangi Sandi",
    klaim: "Kode Klaim",
    klaimHint: "Akun NIM ini pernah di-reset Admin. Masukkan kode klaim yang Admin berikan.",
    lupa: "Lupa sandi? Hubungi Admin Open Recruitment untuk Reset Akun.",
    terpisah: "Sudah punya akun praktikum? Tetap buat akun ini dulu, ya.",
    btn: { masuk: "Masuk", daftar: "Buat Akun", tunggu: "Sebentar…", batal: "Nanti Saja" },
    err: {
      nim: "NIM harus 10 atau 12 digit angka.",
      nama: "Tulis nama lengkapmu, minimal 3 huruf.",
      sandi: "Sandi minimal 8 karakter.",
      ulang: "Kedua sandi belum sama.",
      salah: "NIM atau sandi salah.",
      terkunci: "Terlalu banyak percobaan. Coba lagi 15 menit lagi.",
      akunAda: "NIM ini sudah punya akun. Masuk saja, atau hubungi Admin kalau itu bukan kamu.",
      nimAsisten: "NIM ini milik Asisten, jadi tidak bisa mendaftar.",
      perluKlaim: "Masukkan kode klaim dari Admin dulu.",
      klaimSalah: "Kode klaim salah. Cek lagi pesan dari Admin.",
      offline: "Koneksi terputus. Coba lagi sebentar lagi.",
      lain: "Ada yang salah. Coba lagi, ya.",
    },
    menu: {
      label: "Akun Oprec",
      keluar: "Keluar dari Akun Oprec",
      akun: "Akun Oprec",
      badge: "Caas",
    },
    masukDulu: "Masuk ke akun oprec dulu untuk melanjutkan.",
    asisten: "Asisten dan Panitia masuk dengan akun IRIS Praktikum.",
    asistenBtn: "Masuk sebagai Asisten",
    panel: {
      title: "Akun Oprec",
      sama: "Nama akun sama dengan roster praktikum.",
      beda: (r) => `Nama di roster praktikum: ${r}. Beda dengan nama akun, cocokkan dengan CV.`,
      tanpaRoster:
        "NIM ini tidak ada di roster praktikum (wajar untuk angkatan 2025 dan 2026). Cocokkan nama dengan CV.",
      reset: "Reset Akun",
      resetTitle: "Reset Akun Oprec",
      resetBody: (nim) =>
        `Sandi akun ${nim} dihapus dan semua perangkatnya keluar. Pemilik NIM membuat akun lagi dengan kode klaim yang muncul setelah ini. Berikan kodenya hanya setelah kamu yakin itu orangnya.`,
      resetGo: "Reset dan Buat Kode",
      kodeTitle: "Kode Klaim",
      kodeBody:
        "Kode ini hanya muncul sekali. Kirim ke pemilik NIM, lalu ia memilih Buat Akun dan memasukkannya.",
      tutup: "Selesai",
      gagal: "Reset gagal. Coba lagi, ya.",
    },
  },
  en: {
    title: { masuk: "Sign In to Oprec", daftar: "Create an Oprec Account" },
    desc: "This account is only for Open Recruitment, separate from the practicum sign in.",
    tabs: { masuk: "Sign In", daftar: "Create Account" },
    nim: "NIM",
    nimHint: "10 or 12 digits, as on your student card.",
    nama: "Full Name",
    namaHint: "Your real name as on your student card. Admin checks it against your files.",
    sandi: "Password",
    sandiBaru: "Create a Password",
    sandiHint: "At least 8 characters. Don't reuse your campus password.",
    ulang: "Repeat Password",
    klaim: "Claim Code",
    klaimHint: "Admin reset the account for this NIM. Type the claim code Admin gave you.",
    lupa: "Forgot your password? Ask the Open Recruitment Admin for an account reset.",
    terpisah: "Already have a practicum sign in? Make this account anyway.",
    btn: { masuk: "Sign In", daftar: "Create Account", tunggu: "One moment…", batal: "Later" },
    err: {
      nim: "A NIM is 10 or 12 digits.",
      nama: "Type your full name, at least 3 letters.",
      sandi: "A password has at least 8 characters.",
      ulang: "The two passwords don't match yet.",
      salah: "Wrong NIM or password.",
      terkunci: "Too many tries. Try again in 15 minutes.",
      akunAda: "This NIM already has an account. Sign in, or contact Admin if it isn't yours.",
      nimAsisten: "This NIM belongs to an Asisten, so it can't apply.",
      perluKlaim: "Type the claim code from Admin first.",
      klaimSalah: "Wrong claim code. Check Admin's message again.",
      offline: "You're offline. Try again in a moment.",
      lain: "Something went wrong. Please try again.",
    },
    menu: {
      label: "Oprec Account",
      keluar: "Sign Out of Oprec",
      akun: "Oprec Account",
      badge: "Caas",
    },
    masukDulu: "Sign in to your oprec account to continue.",
    asisten: "Asisten and Panitia sign in with their IRIS Praktikum account.",
    asistenBtn: "Sign In as Asisten",
    panel: {
      title: "Oprec Account",
      sama: "The account name matches the practicum roster.",
      beda: (r) =>
        `Practicum roster name: ${r}. It differs from the account name, so check the CV.`,
      tanpaRoster:
        "This NIM is not on the practicum roster (normal for batch 2025 and 2026). Check the name against the CV.",
      reset: "Reset Account",
      resetTitle: "Reset Oprec Account",
      resetBody: (nim) =>
        `The password of ${nim} is removed and every device is signed out. The NIM's owner makes the account again with the claim code shown next. Give it only once you're sure it's them.`,
      resetGo: "Reset and Make a Code",
      kodeTitle: "Claim Code",
      kodeBody:
        "This code shows only once. Send it to the NIM's owner, who picks Create Account and types it in.",
      tutup: "Done",
      gagal: "The reset failed. Please try again.",
    },
  },
  zh: {
    title: { masuk: "登录招新账号", daftar: "创建招新账号" },
    desc: "此账号仅用于招新，与实验课登录分开。",
    tabs: { masuk: "登录", daftar: "创建账号" },
    nim: "学号",
    nimHint: "10 位或 12 位数字，与学生证一致。",
    nama: "全名",
    namaHint: "请填写学生证上的真实姓名，管理员会与你的材料核对。",
    sandi: "密码",
    sandiBaru: "设置密码",
    sandiHint: "至少 8 个字符。请勿使用校园账号的密码。",
    ulang: "再次输入密码",
    klaim: "认领码",
    klaimHint: "管理员已重置此学号的账号。请输入管理员给你的认领码。",
    lupa: "忘记密码？请联系招新管理员重置账号。",
    terpisah: "已有实验课账号？也请先创建此账号。",
    btn: { masuk: "登录", daftar: "创建账号", tunggu: "请稍候…", batal: "稍后" },
    err: {
      nim: "学号应为 10 位或 12 位数字。",
      nama: "请填写全名，至少 3 个字。",
      sandi: "密码至少 8 个字符。",
      ulang: "两次输入的密码不一致。",
      salah: "学号或密码错误。",
      terkunci: "尝试次数过多，请 15 分钟后再试。",
      akunAda: "此学号已有账号。请直接登录；若不是你本人，请联系管理员。",
      nimAsisten: "此学号属于助教，不能报名。",
      perluKlaim: "请先输入管理员给的认领码。",
      klaimSalah: "认领码错误，请再核对管理员的消息。",
      offline: "网络已断开，请稍后再试。",
      lain: "出了点问题，请再试一次。",
    },
    menu: { label: "招新账号", keluar: "退出招新账号", akun: "招新账号", badge: "报名者" },
    masukDulu: "请先登录招新账号再继续。",
    asisten: "助教与招新委员会请用 IRIS 实验课账号登录。",
    asistenBtn: "以助教身份登录",
    panel: {
      title: "招新账号",
      sama: "账号姓名与实验课名单一致。",
      beda: (r) => `实验课名单上的姓名：${r}。与账号姓名不同，请核对简历。`,
      tanpaRoster: "此学号不在实验课名单中（2025 和 2026 级属正常）。请将姓名与简历核对。",
      reset: "重置账号",
      resetTitle: "重置招新账号",
      resetBody: (nim) =>
        `${nim} 的密码将被删除，所有设备都会退出登录。学号本人需用接下来显示的认领码重新创建账号。请确认是本人后再给出认领码。`,
      resetGo: "重置并生成认领码",
      kodeTitle: "认领码",
      kodeBody: "此认领码只显示一次。请发给学号本人，由其选择创建账号并输入。",
      tutup: "完成",
      gagal: "重置失败，请再试一次。",
    },
  },
};
