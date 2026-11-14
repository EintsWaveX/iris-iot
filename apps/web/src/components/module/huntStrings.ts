/** The Module 4 Perburuan step's words (ruled 2026-10-04). */
import { dict } from "../../lib/app";

const jam = (at: number) =>
  new Date(at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const H = dict({
  id: {
    step: "Perburuan",
    waitTitle: "Perburuan Belum Dimulai",
    waitBody:
      "Langkah ini terbuka sendiri begitu sesi perburuan berjalan di PC Server, tidak perlu memuat ulang. Sambil menunggu, pastikan Hunter kelompokmu lolos cek di Live.",
    waitNoPc: "Server perburuan di PC Server belum melapor. Tanyakan ke asistenmu.",
    waitAsisten:
      "Asistenmu belum menekan Mulai Perburuan. Langkah ini terbuka sendiri begitu perburuan dimulai, tidak perlu memuat ulang. Sambil menunggu, pastikan Hunter kelompokmu lolos cek di Live.",
    toLive: "Cek Hunter di Live",
    bannerOpen: "Perburuan Sudah Dibuka",
    bannerOpenHint: "Ambil HP, lalu buka langkah Perburuan.",
    bannerDone: "Perburuan Selesai",
    bannerDoneHint: "Hasil kelompokmu ada di langkah Perburuan.",
    toHunt: "Ke Perburuan",
    joinTitle: "Masuk dari HP",
    open: "TERBUKA",
    joinLede:
      "Langkah 1 cukup sekali, di satu HP kelompokmu. Langkah 2 dilakukan tiap orang di HP-nya sendiri.",
    stepWifi: "1 Nyalakan Hotspot",
    stepHunt: "2 Buka Perburuan",
    next: "Lanjut ke Langkah 2",
    hotspotTitle: "Nyalakan hotspot di satu HP kelompokmu",
    hotspotName: "Nama hotspot",
    hotspotPass: "Sandi",
    hotspotHint:
      "Hunter dan Beacon kelompokmu menyambung ke hotspot ini. Sambungkan Beacon dulu selagi dekat HP itu, baru sembunyikan. Setelah menyala, Beacon tidak perlu Wi-Fi lagi dan terus memancar sendiri, jadi boleh disembunyikan jauh dari hotspot. Jangan matikan; kalau mati, ia harus kembali dekat hotspot. HP pemilik hotspot dibawa berburu bersama Hunter.",
    hotspotOthers:
      "HP anggota lain tidak perlu menyambung ke mana pun. Cukup pakai data selulernya sendiri.",
    huntTitle: "Buka Perburuan",
    huntQr: "QR halaman perburuan",
    huntHint:
      "Di HP, ketik NIM-mu sendiri. Server menemukan kelompokmu. Buka lewat QR atau tautan ini, jangan ketik alamatnya sendiri.",
    huntHintAsisten: "Asisten masuk dengan token di halaman itu.",
    copy: "Salin tautan",
    copied: "Tautan disalin.",
    copyFail: "Tautan belum tersalin. Salin manual.",
    copyName: "Salin nama hotspot",
    copyPass: "Salin sandi",
    // Jaringan IRIS_IOT: PC lab membuat Wi-Fi, HP anggota tanpa internet.
    joinLedeLokal:
      "Satu orang satu HP. Pindai dari layar laptop ini: langkah 1 menyambungkan HP ke Wi-Fi IRIS_IOT, langkah 2 membuka papan skor.",
    stepWifiLokal: "1 Sambung Wi-Fi",
    wifiTitle: (ssid: string) => `Sambung ke Wi-Fi ${ssid}`,
    wifiQr: (ssid: string) => `QR Wi-Fi ${ssid}`,
    wifiHint:
      "Pindai dengan kamera. Kalau tidak bisa, pilih Wi-Fi itu di pengaturan HP, lalu masukkan sandi di bawah.",
    wifiNoNet: "Wi-Fi ini tanpa internet. Biarkan HP tetap tersambung selama perburuan.",
    copyKey: "Salin kunci papan",
    boardKey: "Kunci papan",
    boardKeyHint:
      "Kunci ini sudah terisi di HUNT_KEY pada file yang kamu unduh dari langkah Kode. Kuncinya khusus kelompokmu dan tidak berganti antar sesi, jadi papan yang sudah diunggah dengan kunci ini tidak perlu diunggah ulang. Hanya asisten yang bisa memutar kunci, dan itu terlihat di sini. Kalau kamu memakai salinan lama, tempel kunci ini ke HUNT_KEY.",
    keyRound: (n: number, at: number | null) =>
      n === 0
        ? "Kunci belum pernah diganti."
        : `Kunci putaran ${n}${at ? `, diganti ${jam(at)}` : ""}.`,
    keyOld:
      "PC menolak kunci yang dikirim papanmu. Tempel kunci di atas ke HUNT_KEY, lalu unggah ulang Hunter dan Beacon.",
    notListed:
      "NIM-mu belum ada di daftar perburuan. Minta asisten memperbarui roster di Persiapan.",
    teamTitle: "Kelompokmu di Perburuan",
    inCount: (n: number, of: number) => `${n}/${of} MASUK`,
    you: "kamu",
    notIn: "Belum masuk",
    phoneDead: "HP mati? Masuk lewat HP teman sekelompok dengan NIM-mu sendiri.",
    playing: (menit: string) =>
      `Perburuan berjalan ${menit}. Permainannya di HP, halaman ini hanya merangkum.`,
    peran: { pemandu: "Pemandu", pengintai: "Pengintai", operator: "Operator Radio" },
    heat: {
      hilang: "HILANG",
      dingin: "DINGIN",
      sejuk: "SEJUK",
      hangat: "HANGAT",
      panas: "PANAS",
      membara: "MEMBARA",
    } as Record<string, string>,
    statTime: "lama berburu (menit)",
    statRank: "urutan selesai",
    statClaims: "klaim dikirim",
    statResult: "hasil",
    found: "Ditemukan",
    notFound: "Belum ketemu",
    historyTitle: "Riwayat Perburuan",
    noHistory: "Belum ada peristiwa.",
    awardsTitle: "Penghargaan",
    noAwards: "Belum ada penghargaan untuk kelompokmu.",
    award: {
      podium: (n: number) => `PODIUM ${n}`,
      pendekat_tercepat: "PENDEKAT TERCEPAT",
      tautan_tercepat: "TAUTAN TERCEPAT",
      tautan_terandal: "TAUTAN TERANDAL",
    },
    ev: {
      zona: (heat: string) => `Masuk zona ${heat}`,
      klaim: "Klaim foto dikirim",
      tolak: (alasan: string) => (alasan ? `Klaim ditolak: ${alasan}` : "Klaim ditolak"),
      ditemukan: "Beacon ditemukan",
      sapuan: "Sapuan 8 arah dikirim",
      salip: "Menyalip kelompok lain",
      panggil: "Memanggil asisten",
    },
  },
  en: {
    step: "Hunt",
    waitTitle: "The Hunt Hasn't Started",
    waitBody:
      "This step opens by itself as soon as the hunt session runs on the PC Server, no reload needed. Meanwhile, make sure your group's Hunter passes the check in Live.",
    waitNoPc: "The hunt server on the PC Server hasn't reported yet. Ask your assistant.",
    waitAsisten:
      "Your assistant hasn't pressed Start the Hunt yet. This step opens by itself once the hunt starts, no reload needed. Meanwhile, make sure your group's Hunter passes the check in Live.",
    toLive: "Check the Hunter in Live",
    bannerOpen: "The Hunt Is Open",
    bannerOpenHint: "Grab your phone, then open the Hunt step.",
    bannerDone: "The Hunt Is Over",
    bannerDoneHint: "Your group's result is in the Hunt step.",
    toHunt: "Go to the Hunt",
    joinTitle: "Join From Your Phone",
    open: "OPEN",
    joinLede:
      "Step 1 is done once, on one phone in your group. Step 2 is done by everyone on their own phone.",
    stepWifi: "1 Turn On the Hotspot",
    stepHunt: "2 Open the Hunt",
    next: "On to Step 2",
    hotspotTitle: "Turn on a hotspot on one phone in your group",
    hotspotName: "Hotspot name",
    hotspotPass: "Password",
    hotspotHint:
      "Your group's Hunter and Beacon join this hotspot. Connect the Beacon first while it's next to that phone, then hide it. Once it's running, the Beacon doesn't need Wi-Fi any more and keeps transmitting on its own, so you can hide it far from the hotspot. Don't switch it off; if it restarts, it has to come back near the hotspot. The hotspot phone goes hunting with the Hunter.",
    hotspotOthers: "Everyone else's phone joins nothing. It just stays on its own mobile data.",
    huntTitle: "Open the Hunt",
    huntQr: "Hunt page QR",
    huntHint:
      "On the phone, type your own NIM. The server finds your group. Open it through the QR or this link, not by typing the address yourself.",
    huntHintAsisten: "Assistants sign in with the token on that page.",
    copy: "Copy the link",
    copied: "Link copied.",
    copyFail: "The link wasn't copied. Copy it by hand.",
    copyName: "Copy the hotspot name",
    copyPass: "Copy the password",
    // IRIS_IOT network: the lab PC makes the Wi-Fi, members' phones have no internet.
    joinLedeLokal:
      "One phone each. Scan from this laptop screen: step 1 joins the phone to the IRIS_IOT Wi-Fi, step 2 opens the scoreboard.",
    stepWifiLokal: "1 Join the Wi-Fi",
    wifiTitle: (ssid: string) => `Join the ${ssid} Wi-Fi`,
    wifiQr: (ssid: string) => `${ssid} Wi-Fi QR`,
    wifiHint:
      "Scan with the camera. If that fails, pick the Wi-Fi in the phone's settings and type the password below.",
    wifiNoNet: "This Wi-Fi has no internet. Keep the phone connected during the hunt.",
    copyKey: "Copy the board key",
    boardKey: "Board key",
    boardKeyHint:
      "This key is already filled into HUNT_KEY in the files you download from the Code step. It belongs to your group only and does not change between sessions, so a board already uploaded with this key does not need uploading again. Only an assistant can turn the keys, and it shows here when they do. If you are using an older copy, paste this key into HUNT_KEY.",
    keyRound: (n: number, at: number | null) =>
      n === 0
        ? "The key has never been changed."
        : `Key round ${n}${at ? `, changed at ${jam(at)}` : ""}.`,
    keyOld:
      "The PC is turning down the key your boards send. Paste the key above into HUNT_KEY, then upload the Hunter and Beacon again.",
    notListed:
      "Your NIM isn't on the hunt's list yet. Ask your assistant to update the roster in Preparation.",
    teamTitle: "Your Group in the Hunt",
    inCount: (n: number, of: number) => `${n}/${of} IN`,
    you: "you",
    notIn: "Not in yet",
    phoneDead: "Phone dead? Join on a groupmate's phone with your own NIM.",
    playing: (menit: string) =>
      `The hunt has run for ${menit}. It plays on the phones; this page only sums it up.`,
    peran: { pemandu: "Navigator", pengintai: "Scout", operator: "Radio Operator" },
    heat: {
      hilang: "LOST",
      dingin: "COLD",
      sejuk: "COOL",
      hangat: "WARM",
      panas: "HOT",
      membara: "BURNING",
    } as Record<string, string>,
    statTime: "hunt time (minutes)",
    statRank: "finish order",
    statClaims: "claims sent",
    statResult: "result",
    found: "Found",
    notFound: "Not found yet",
    historyTitle: "Hunt History",
    noHistory: "Nothing has happened yet.",
    awardsTitle: "Awards",
    noAwards: "No awards for your group yet.",
    award: {
      podium: (n: number) => `PODIUM ${n}`,
      pendekat_tercepat: "FASTEST CLOSER",
      tautan_tercepat: "FASTEST LINK",
      tautan_terandal: "MOST RELIABLE LINK",
    },
    ev: {
      zona: (heat: string) => `Entered the ${heat} zone`,
      klaim: "Photo claim sent",
      tolak: (alasan: string) => (alasan ? `Claim turned down: ${alasan}` : "Claim turned down"),
      ditemukan: "Beacon found",
      sapuan: "8-facing sweep sent",
      salip: "Overtook another group",
      panggil: "Called an assistant",
    },
  },
  zh: {
    step: "寻踪",
    waitTitle: "寻踪还没开始",
    waitBody:
      "PC 服务器上的寻踪一开始，这一步就会自己打开，不用刷新。等待时，先确认你们组的 Hunter 在实时页通过检查。",
    waitNoPc: "PC 服务器上的寻踪服务器还没报告。问问你的助教。",
    waitAsisten:
      "助教还没按开始寻踪。寻踪一开始，这一步就会自己打开，不用刷新。等待时，先确认你们组的 Hunter 在实时页通过检查。",
    toLive: "在实时页检查 Hunter",
    bannerOpen: "寻踪已开启",
    bannerOpenHint: "拿出手机，然后打开寻踪这一步。",
    bannerDone: "寻踪结束了",
    bannerDoneHint: "你们组的结果在寻踪这一步。",
    toHunt: "前往寻踪",
    joinTitle: "用手机加入",
    open: "已开放",
    joinLede: "第 1 步只需要在你们组的一部手机上做一次。第 2 步每个人用自己的手机做。",
    stepWifi: "1 打开热点",
    stepHunt: "2 打开寻踪",
    next: "前往第 2 步",
    hotspotTitle: "在你们组的一部手机上打开热点",
    hotspotName: "热点名称",
    hotspotPass: "密码",
    hotspotHint:
      "你们组的 Hunter 和 Beacon 都连这个热点。先在这部手机旁边把 Beacon 连上，再去藏它。Beacon 启动后不再需要 Wi-Fi，会自己继续发射，所以可以藏在离热点很远的地方。不要关掉它；一旦重启，就要回到热点附近。开热点的手机和 Hunter 一起去寻踪。",
    hotspotOthers: "其他人的手机不用连任何网络，用自己的移动数据就行。",
    huntTitle: "打开寻踪",
    huntQr: "寻踪页面二维码",
    huntHint:
      "在手机上输入你自己的 NIM，服务器会找到你的组。请用二维码或这个链接打开，不要自己输入网址。",
    huntHintAsisten: "助教在那个页面用令牌登录。",
    copy: "复制链接",
    copied: "链接已复制。",
    copyFail: "链接没有复制成功，请手动复制。",
    copyName: "复制热点名称",
    copyPass: "复制密码",
    // IRIS_IOT 网络：实验室 PC 提供 Wi-Fi，成员的手机没有网络。
    joinLedeLokal:
      "每人一部手机。扫描这台笔记本屏幕上的码：第 1 步让手机连上 IRIS_IOT Wi-Fi，第 2 步打开记分板。",
    stepWifiLokal: "1 连接 Wi-Fi",
    wifiTitle: (ssid: string) => `连接 ${ssid} Wi-Fi`,
    wifiQr: (ssid: string) => `${ssid} Wi-Fi 二维码`,
    wifiHint: "用相机扫描。扫不了就在手机的 Wi-Fi 设置里选这个网络，再输入下面的密码。",
    wifiNoNet: "这个 Wi-Fi 没有网络，整个寻踪期间也请保持连接。",
    copyKey: "复制板子密钥",
    boardKey: "板子密钥",
    boardKeyHint:
      "从代码步骤下载的文件里，HUNT_KEY 已经填好这个密钥。它只属于你们组，各节课之间不会更换，所以已经上传过这个密钥的板子不用再上传。只有助教能更换密钥，更换时这里会显示。如果你用的是旧副本，就把这个密钥粘贴到 HUNT_KEY 里。",
    keyRound: (n: number, at: number | null) =>
      n === 0 ? "密钥还没换过。" : `密钥第 ${n} 轮${at ? `，${jam(at)} 更换` : ""}。`,
    keyOld:
      "PC 不接受你们板子发来的密钥。把上面的密钥粘贴到 HUNT_KEY，然后重新上传 Hunter 和 Beacon。",
    notListed: "你的 NIM 还不在寻踪名单里。请助教在课前准备里更新名单。",
    teamTitle: "你的组在寻踪中",
    inCount: (n: number, of: number) => `${n}/${of} 已加入`,
    you: "你",
    notIn: "还没加入",
    phoneDead: "手机没电？用组员的手机，输入你自己的 NIM 加入。",
    playing: (menit: string) => `寻踪已进行 ${menit}。游戏在手机上进行，这里只做汇总。`,
    peran: { pemandu: "领航员", pengintai: "侦察员", operator: "无线电员" },
    heat: {
      hilang: "失联",
      dingin: "冷",
      sejuk: "凉",
      hangat: "温",
      panas: "热",
      membara: "滚烫",
    } as Record<string, string>,
    statTime: "寻踪用时（分钟）",
    statRank: "完成名次",
    statClaims: "已提交认领",
    statResult: "结果",
    found: "已找到",
    notFound: "还没找到",
    historyTitle: "寻踪记录",
    noHistory: "还没有发生什么。",
    awardsTitle: "奖项",
    noAwards: "你们组还没有奖项。",
    award: {
      podium: (n: number) => `第 ${n} 名`,
      pendekat_tercepat: "最快逼近",
      tautan_tercepat: "最快链路",
      tautan_terandal: "最稳链路",
    },
    ev: {
      zona: (heat: string) => `进入“${heat}”区`,
      klaim: "照片认领已提交",
      tolak: (alasan: string) => (alasan ? `认领被驳回：${alasan}` : "认领被驳回"),
      ditemukan: "找到了信标",
      sapuan: "已发送 8 方向扫描",
      salip: "超过了另一组",
      panggil: "呼叫了助教",
    },
  },
});
