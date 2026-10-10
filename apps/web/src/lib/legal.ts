/**
 * The privacy notice and terms of use, in the three site languages. Plain
 * words, one idea per paragraph; the view renders sections in order.
 */
import type { Lang } from "./kelas.js";
import { LAB_CONTACT, RETENTION_MONTHS } from "./lab.js";

export type LegalSection = { title: string; body: string[]; list?: string[] };
export type LegalDoc = { title: string; lede: string; since: string; sections: LegalSection[] };

// ---------- Shared Facts ----------
// ---------- Shared Facts ----------
// ---------- Shared Facts ----------

const SINCE: Record<Lang, string> = {
  id: "Berlaku sejak Sabtu, 10 Oktober 2026.",
  en: "In effect since Saturday, 10 October 2026.",
  zh: "自 2026 年 10 月 10 日（星期六）起生效。",
};

function reach(lang: Lang): string {
  const mail = LAB_CONTACT.email;
  const insta = LAB_CONTACT.instagram;
  const extra = [mail, insta && `Instagram ${insta}`].filter(Boolean).join(", ");
  if (lang === "en")
    return `Tell the Assistant Coordinator at P304, Deli Building, or any assistant during your session${extra ? `, or write to ${extra}` : ""}.`;
  if (lang === "zh")
    return `请到 Deli 楼 P304 告诉助教协调员，或在实验课上告诉任何一位助教${extra ? `，也可以联系 ${extra}` : ""}。`;
  return `Sampaikan ke Koordinator Asisten di P304 Gedung Deli, atau ke asisten mana pun saat sesimu${extra ? `, atau lewat ${extra}` : ""}.`;
}

// ---------- Shared Facts ----------
// ---------- Shared Facts ----------
// ---------- Shared Facts ----------

// ---------- Privacy Notice ----------
// ---------- Privacy Notice ----------
// ---------- Privacy Notice ----------

export function privacy(lang: Lang): LegalDoc {
  if (lang === "en")
    return {
      title: "Privacy Notice",
      lede: "This site runs the IRIS Laboratory IoT practicum. This page explains what we keep, why, who can see it, how long it stays, and how to ask for a copy or a deletion. We follow Indonesia's Personal Data Protection Law (Law No. 27 of 2022).",
      since: SINCE.en,
      sections: [
        {
          title: "Who Runs It",
          body: [
            "IRIS Laboratory, ASIC Division, Electrical Engineering, School of Electrical Engineering, Telkom University, P304, Deli Building. The Assistant Coordinator answers for the practicum data.",
          ],
        },
        {
          title: "What We Keep",
          body: ["Only what the practicum needs:"],
          list: [
            "Who you are: NIM, name, class and group, taken from SeeLabs and the lab schedule.",
            "Attendance: when you signed in to a session, the session code used, and the IP address of each sign in attempt. The attempts stop code guessing and are the proof that you attended.",
            "Your work: blank answers and how many tries they took, hint requests, data captured from your board, and your preparation checklist.",
            "Scores and the assistant's notes on your group.",
            "Feedback: stored with your NIM so each session gets one feedback per person. Assistants see it without your name or NIM.",
            "For assistants: name, NIM, assistant code, teaching slots, SeeLabs user name (never the SeeLabs password) and pay records.",
          ],
        },
        {
          title: "Why",
          body: [
            "To run sessions, score your work, count attendance, pay assistants and improve the modules. Nothing is sold or used for advertising.",
          ],
        },
        {
          title: "Who Sees It",
          body: [
            "You see your own records. The assistants on duty see the groups they teach, and lab admins see everything they need to run the semester. Assistants enter your final scores into Telkom University's SeeLabs.",
          ],
        },
        {
          title: "Cookies and Browser Storage",
          body: [
            "The site sets two cookies, both needed for it to work: your sign in session and your language. Your display choices (theme, detail, clock) stay in your browser's local storage. There are no advertising cookies, no trackers and no third party analytics, so there is no cookie banner.",
          ],
        },
        {
          title: "Services We Use",
          body: [
            "Vercel hosts the site and stored files, Neon hosts the database, and Cloudflare carries the live console between the lab's Orange Pi and the site. Pages that show a presentation or a circuit simulation embed Canva, Wokwi or Tinkercad, which may set their own cookies when you open them.",
          ],
        },
        {
          title: "How Long",
          body: [
            `Records stay for the semester and ${RETENTION_MONTHS} months after it ends, for score appeals, then they are deleted. Scores already sent to SeeLabs follow Telkom University's own rules.`,
          ],
        },
        {
          title: "Your Rights",
          body: [
            "You can ask for a copy of your data, ask us to correct it, ask us to delete it (except what must stay to keep a score valid), and withdraw consent for anything optional.",
            `${reach("en")} We answer within three working days.`,
          ],
        },
        {
          title: "Changes",
          body: [
            "When this notice changes, the date at the top changes too, and a real change is announced in the practicum.",
          ],
        },
      ],
    };

  if (lang === "zh")
    return {
      title: "隐私声明",
      lede: "本站用于 IRIS 实验室的物联网实验课。本页说明我们保存哪些数据、用途、谁能看到、保存多久，以及如何申请副本或删除。我们遵守印度尼西亚《个人数据保护法》（2022 年第 27 号法律）。",
      since: SINCE.zh,
      sections: [
        {
          title: "管理方",
          body: [
            "Telkom University 电气工程学院 电气工程专业 ASIC 部门 IRIS 实验室，Deli 楼 P304。助教协调员负责实验数据。",
          ],
        },
        {
          title: "我们保存的数据",
          body: ["只保存实验课需要的数据："],
          list: [
            "身份：学号、姓名、班级和小组，来自 SeeLabs 和实验室课表。",
            "出勤：你登录实验课的时间、使用的课堂代码，以及每次登录尝试的 IP 地址。登录记录用来防止猜测代码，也是你出勤的证明。",
            "你的作业：代码填空的答案和尝试次数、提示请求、从开发板采集的数据，以及准备清单。",
            "成绩和助教对你小组的备注。",
            "反馈：与学号一起保存，确保每人每节课只提交一次。助教看到的反馈不显示姓名和学号。",
            "助教：姓名、学号、助教代码、授课时段、SeeLabs 用户名（从不保存 SeeLabs 密码）和报酬记录。",
          ],
        },
        {
          title: "用途",
          body: [
            "用于进行实验课、评分、统计出勤、支付助教报酬和改进模块。数据不会出售，也不会用于广告。",
          ],
        },
        {
          title: "谁能看到",
          body: [
            "你可以看到自己的记录。值班助教可以看到他们负责的小组，实验室管理员可以看到运行本学期所需的数据。助教会把最终成绩录入 Telkom University 的 SeeLabs。",
          ],
        },
        {
          title: "Cookie 与浏览器存储",
          body: [
            "本站只设置两个必要的 cookie：登录会话和语言。显示设置（主题、细节、时钟）保存在浏览器的本地存储中。没有广告 cookie、没有追踪器，也没有第三方统计，所以没有 cookie 提示横幅。",
          ],
        },
        {
          title: "使用的服务",
          body: [
            "Vercel 托管网站和文件，Neon 托管数据库，Cloudflare 在实验室的 Orange Pi 与本站之间传输实时控制台。显示演示文稿或电路仿真的页面会嵌入 Canva、Wokwi 或 Tinkercad，打开时它们可能设置自己的 cookie。",
          ],
        },
        {
          title: "保存多久",
          body: [
            `记录保存到本学期结束后 ${RETENTION_MONTHS} 个月，以便处理成绩申诉，之后删除。已录入 SeeLabs 的成绩遵循 Telkom University 自己的规定。`,
          ],
        },
        {
          title: "你的权利",
          body: [
            "你可以申请数据副本、要求更正、要求删除（为保证成绩有效而必须保留的除外），也可以撤回对可选项目的同意。",
            `${reach("zh")}我们会在三个工作日内答复。`,
          ],
        },
        { title: "变更", body: ["本声明变更时，顶部的日期会随之更新，重要变更会在实验课上通知。"] },
      ],
    };

  return {
    title: "Kebijakan Privasi",
    lede: "Situs ini dipakai untuk praktikum IoT Laboratorium IRIS. Halaman ini menjelaskan data apa yang kami simpan, untuk apa, siapa yang bisa melihatnya, berapa lama disimpan, dan cara meminta salinan atau penghapusan. Kami mengikuti Undang Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.",
    since: SINCE.id,
    sections: [
      {
        title: "Siapa Pengelolanya",
        body: [
          "Laboratorium IRIS, Divisi ASIC, S1 Teknik Elektro, Fakultas Teknik Elektro, Telkom University, P304 Gedung Deli. Koordinator Asisten bertanggung jawab atas data praktikum.",
        ],
      },
      {
        title: "Data yang Kami Simpan",
        body: ["Hanya yang dibutuhkan praktikum:"],
        list: [
          "Identitas: NIM, nama, kelas dan kelompok, diambil dari SeeLabs dan jadwal lab.",
          "Kehadiran: waktu kamu masuk ke sesi, kode sesi yang dipakai, dan alamat IP tiap percobaan masuk. Catatan ini mencegah tebak kode dan menjadi bukti kehadiranmu.",
          "Pekerjaanmu: jawaban blank kode beserta jumlah percobaannya, permintaan petunjuk, data tangkapan dari papanmu, dan daftar persiapan.",
          "Nilai dan catatan asisten untuk kelompokmu.",
          "Umpan balik: disimpan bersama NIM supaya satu orang hanya memberi satu umpan balik per sesi. Asisten melihatnya tanpa nama dan NIM.",
          "Untuk asisten: nama, NIM, kode asisten, slot mengajar, nama akun SeeLabs (kata sandi SeeLabs tidak pernah disimpan) dan catatan honor.",
        ],
      },
      {
        title: "Untuk Apa",
        body: [
          "Untuk menjalankan sesi, menilai pekerjaanmu, menghitung kehadiran, membayar asisten dan memperbaiki modul. Data tidak dijual dan tidak dipakai untuk iklan.",
        ],
      },
      {
        title: "Siapa yang Bisa Melihat",
        body: [
          "Kamu melihat catatanmu sendiri. Asisten yang bertugas melihat kelompok yang mereka pegang, dan admin lab melihat yang dibutuhkan untuk menjalankan semester. Asisten memasukkan nilai akhirmu ke SeeLabs Telkom University.",
        ],
      },
      {
        title: "Cookie dan Penyimpanan di Peramban",
        body: [
          "Situs ini memakai dua cookie, keduanya wajib supaya situs berjalan: sesi masukmu dan bahasamu. Pilihan tampilan (tema, detail latar, jam) disimpan di penyimpanan lokal peramban. Tidak ada cookie iklan, pelacak atau analitik pihak ketiga, jadi tidak ada spanduk cookie.",
        ],
      },
      {
        title: "Layanan yang Kami Pakai",
        body: [
          "Vercel menyimpan situs dan berkas, Neon menyimpan basis data, dan Cloudflare meneruskan konsol langsung antara Orange Pi lab dan situs. Halaman yang menampilkan presentasi atau simulasi rangkaian memuat Canva, Wokwi atau Tinkercad, yang bisa memasang cookie sendiri saat kamu membukanya.",
        ],
      },
      {
        title: "Berapa Lama Disimpan",
        body: [
          `Catatan disimpan selama semester berjalan dan ${RETENTION_MONTHS} bulan setelahnya untuk keperluan banding nilai, lalu dihapus. Nilai yang sudah masuk SeeLabs mengikuti aturan Telkom University.`,
        ],
      },
      {
        title: "Hakmu",
        body: [
          "Kamu boleh meminta salinan datamu, meminta perbaikan, meminta penghapusan (kecuali yang wajib disimpan supaya nilaimu tetap sah), dan menarik persetujuan untuk hal yang tidak wajib.",
          `${reach("id")} Kami jawab paling lambat tiga hari kerja.`,
        ],
      },
      {
        title: "Perubahan",
        body: [
          "Kalau kebijakan ini berubah, tanggal di atas ikut berubah, dan perubahan penting diumumkan saat praktikum.",
        ],
      },
    ],
  };
}

// ---------- Privacy Notice ----------
// ---------- Privacy Notice ----------
// ---------- Privacy Notice ----------

// ---------- Terms of Use ----------
// ---------- Terms of Use ----------
// ---------- Terms of Use ----------

export function terms(lang: Lang): LegalDoc {
  if (lang === "en")
    return {
      title: "Terms of Use",
      lede: "These terms cover everyone who uses this site: practicum students, assistants and visitors reading the modules.",
      since: SINCE.en,
      sections: [
        {
          title: "What the Site Is For",
          body: [
            "This site runs the IRIS Laboratory IoT practicum at Telkom University: the modules, the session journal, live board data and scoring. The modules and the handbook are open to everyone; the journal is for students who attend the practicum.",
          ],
        },
        {
          title: "Your Account",
          body: [
            "Sign in only with your own NIM. Don't sign in as someone else and don't pass a session code to anyone who isn't in the room. Assistants keep their password to themselves.",
          ],
        },
        {
          title: "Academic Integrity",
          body: [
            "Blank answers and captured data must come from your own group's work. Copying answers, faking board data or signing in for an absent friend is reported to the Assistant Coordinator and handled under the lab's practicum rules in the handbook.",
          ],
        },
        {
          title: "Lab Equipment",
          body: [
            "Use the Orange Pi, the routers and the boards as the assistants direct. Report damage or a fault to the assistant on duty right away.",
          ],
        },
        {
          title: "For Assistants",
          body: [
            "Use students' data only for the practicum. Don't share scores, NIMs or feedback outside the lab team, and send scores through the steps the site provides.",
          ],
        },
        {
          title: "When Something Goes Wrong",
          body: [
            "If the site or a lab service stops during a session, follow the assistant's instructions. Each blank answer is saved when you check it; an assistant can extend the session or mark you present by hand.",
          ],
        },
        {
          title: "Content",
          body: [
            "The modules, journals, slides and schematics belong to IRIS Laboratory. Use them for learning; ask the lab before publishing them elsewhere. Typefaces and icons keep their own open licences, listed in the footer.",
          ],
        },
        { title: "Questions", body: [reach("en")] },
      ],
    };

  if (lang === "zh")
    return {
      title: "使用条款",
      lede: "本条款适用于所有使用本站的人：实验课学生、助教以及阅读模块的访客。",
      since: SINCE.zh,
      sections: [
        {
          title: "本站用途",
          body: [
            "本站用于 Telkom University IRIS 实验室的物联网实验课：模块、课堂实验报告、开发板实时数据和评分。模块和手册对所有人开放；实验报告只供参加实验课的学生使用。",
          ],
        },
        {
          title: "你的账号",
          body: [
            "只能用你自己的学号登录。不要冒充他人登录，也不要把课堂代码告诉不在教室里的人。助教要保管好自己的密码。",
          ],
        },
        {
          title: "学术诚信",
          body: [
            "代码填空的答案和采集的数据必须来自你们小组自己的工作。抄答案、伪造开发板数据或替缺席的同学登录，会报告给助教协调员，并按手册中的实验室规则处理。",
          ],
        },
        {
          title: "实验室设备",
          body: [
            "按照助教的指示使用 Orange Pi、路由器和开发板。设备损坏或故障请立即告诉值班助教。",
          ],
        },
        {
          title: "给助教",
          body: [
            "学生数据只能用于实验课。不要在实验室团队之外分享成绩、学号或反馈，并通过本站提供的步骤提交成绩。",
          ],
        },
        {
          title: "出现问题时",
          body: [
            "如果本站或实验室服务在课上中断，请听从助教的安排。每次检查填空时答案都会保存；助教可以延长课时或手动标记出勤。",
          ],
        },
        {
          title: "内容",
          body: [
            "模块、实验报告、幻灯片和电路图归 IRIS 实验室所有。可用于学习；在其他地方发布前请先询问实验室。字体和图标遵循各自的开源许可，见页脚。",
          ],
        },
        { title: "问题", body: [reach("zh")] },
      ],
    };

  return {
    title: "Ketentuan Penggunaan",
    lede: "Ketentuan ini berlaku untuk semua yang memakai situs ini: praktikan, asisten, dan pengunjung yang membaca modul.",
    since: SINCE.id,
    sections: [
      {
        title: "Situs Ini untuk Apa",
        body: [
          "Situs ini menjalankan praktikum IoT Laboratorium IRIS, Telkom University: modul, jurnal sesi, data papan secara langsung dan penilaian. Modul dan handbook terbuka untuk semua; jurnal untuk praktikan yang mengikuti praktikum.",
        ],
      },
      {
        title: "Akunmu",
        body: [
          "Masuk hanya dengan NIM milikmu sendiri. Jangan masuk sebagai orang lain dan jangan memberikan kode sesi ke orang yang tidak ada di ruangan. Asisten menjaga kata sandinya sendiri.",
        ],
      },
      {
        title: "Integritas Akademik",
        body: [
          "Jawaban blank dan data tangkapan harus hasil kerja kelompokmu sendiri. Menyalin jawaban, memalsukan data papan, atau masuk untuk teman yang tidak hadir dilaporkan ke Koordinator Asisten dan ditangani menurut aturan praktikum lab di handbook.",
        ],
      },
      {
        title: "Perangkat Lab",
        body: [
          "Pakai Orange Pi, router dan papan sesuai arahan asisten. Laporkan kerusakan atau gangguan ke asisten yang bertugas saat itu juga.",
        ],
      },
      {
        title: "Untuk Asisten",
        body: [
          "Pakai data praktikan hanya untuk praktikum. Jangan menyebarkan nilai, NIM atau umpan balik di luar tim lab, dan kirim nilai lewat langkah yang disediakan situs.",
        ],
      },
      {
        title: "Kalau Ada Gangguan",
        body: [
          "Kalau situs atau layanan lab berhenti saat sesi, ikuti arahan asisten. Jawabanmu tersimpan setiap kali dicek; asisten bisa memperpanjang sesi atau menandai hadir secara manual.",
        ],
      },
      {
        title: "Konten",
        body: [
          "Modul, jurnal, slide dan skema milik Laboratorium IRIS. Silakan dipakai untuk belajar; minta izin lab sebelum menerbitkannya di tempat lain. Huruf dan ikon mengikuti lisensi terbukanya masing masing, tercantum di bagian bawah halaman.",
        ],
      },
      { title: "Pertanyaan", body: [reach("id")] },
    ],
  };
}

// ---------- Terms of Use ----------
// ---------- Terms of Use ----------
// ---------- Terms of Use ----------
