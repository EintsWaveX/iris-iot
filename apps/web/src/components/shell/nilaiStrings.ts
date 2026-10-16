/**
 * Words for Lupa Input Nilai (Phase 18): the score reminder banner, the
 * Konsol home's inbox rows, the session end's list and Alihkan Penilaian.
 * Groups come in already named ("Kelompok 4 dan 5").
 */
import { dict } from "../../lib/app";

export const N = dict({
  id: {
    region: "Pengingat nilai",
    and: "dan",
    // Banner heads
    akhirH: (n: number) => `Sesi selesai. ${n} kelompokmu belum selesai dinilai`,
    akhirB: "Batasnya hari ini 23:59. Setelah itu SeeLabs butuh Token Khusus dari Laboran.",
    ingatH: (jam: string, n: number) => `Pengingat ${jam}: ${n} kelompok belum masuk SeeLabs`,
    sisa: (h: number, m: number) =>
      `Sisa ${h ? `${h} jam ` : ""}${m} menit sampai 23:59. Setelah itu SeeLabs butuh Token Khusus.`,
    antreH: (g: string) => `Robot SeeLabs masih antre untuk ${g}`,
    antreB:
      "Sudah lewat 23:00, jadi robot mungkin tidak sempat sebelum 23:59. Siapkan bookmarklet sebagai cadangan.",
    gagalH: (g: string) => `Robot SeeLabs gagal untuk ${g}`,
    gagalDitolak:
      "Kata sandi SeeLabs-mu ditolak. Perbarui di Akun, atau pakai bookmarklet lalu tandai sudah disimpan.",
    gagalToken: "SeeLabs minta Token Khusus. Masukkan di Tabel Nilai, lalu robot mencoba lagi.",
    gagalLain:
      "Robot belum berhasil menyimpan. Coba lagi dari Tabel Nilai, atau pakai bookmarklet lalu tandai sudah disimpan.",
    akunH: (g: string) => `${g} butuh akun SeeLabs Asisten lain`,
    akunB:
      "Satu akun SeeLabs hanya bisa dipakai di dua sesi sehari. Pilih akun sebelum Kirim Nilai; unitnya tetap milikmu.",
    pjH: (n: number) => `Sebagai PJ, ${n} kelompok sesi ini belum selesai`,
    pjB: (pegang: string) =>
      `Dipegang ${pegang}. Kalau pemegangnya tidak bisa menyelesaikan, alihkan penilaiannya dari Tabel Nilai.`,
    lewatH: (g: string) => `Lupa Input Nilai: ${g}`,
    menyusulH: (g: string) => `Nilai ${g} sudah masuk SeeLabs`,
    menyusulB: (kapan: string) =>
      `Diinput menyusul ${kapan}. Catatan Lupa Input Nilai tetap ada, dengan waktu susulannya.`,
    lewatB:
      "Lewat 23:59, jadi tercatat. Minta Token Khusus ke Laboran, ketik di sini, dan robot memasukkannya.",
    // Buttons
    selesai: "Selesaikan Nilai",
    tabel: "Buka Tabel Nilai",
    akun: "Pilih Akun SeeLabs",
    token: "Masukkan Token Khusus",
    sandi: "Perbarui Kata Sandi",
    // Konsol home rows
    tagSeelabs: "SEELABS",
    tagLupa: "LUPA INPUT",
    tagPj: "PJ",
    simpanLine: (m: string, when: string, g: string, robot: string) =>
      `${m} · ${when} · ${g} sudah dikirim, belum tersimpan di SeeLabs. Batas 23:59.${robot}`,
    robotAntre: " Robot masih antre.",
    robotGagal: " Robot gagal.",
    lupaLine: (m: string, when: string, g: string, kurang: string) =>
      `${m} · ${when} · ${g} tercatat Lupa Input Nilai, belum ${kurang}.`,
    pjLine: (m: string, when: string, g: string, pegang: string) =>
      `${m} · ${when} · ${g} belum selesai, dipegang ${pegang}. Kamu PJ sesi ini.`,
    kurangKirim: "Kirim Nilai",
    kurangSeelabs: "tersimpan di SeeLabs",
    menyusul: "Diinput Menyusul",
    // Session end
    akhiriOk: "Semua kelompokmu sudah dikirim dengan Kirim Nilai",
    akhiriJudul: (n: number) => `${n} kelompokmu belum dikirim dengan Kirim Nilai`,
    akhiriBelum:
      "Sesi tetap bisa diakhiri. Pengingat menyusul sampai 23:59, dan setelah itu tercatat sebagai Lupa Input Nilai.",
    // Alihkan Penilaian
    alihkan: "Alihkan Penilaian",
  },
  en: {
    region: "Score reminder",
    and: "and",
    akhirH: (n: number) =>
      `The session ended. ${n} of your groups ${n === 1 ? "isn't" : "aren't"} done`,
    akhirB: "The limit is 23:59 today. After that SeeLabs needs a Token Khusus from the Laboran.",
    ingatH: (jam: string, n: number) =>
      `${jam} reminder: ${n} ${n === 1 ? "group isn't" : "groups aren't"} in SeeLabs`,
    sisa: (h: number, m: number) =>
      `${h ? `${h} ${h === 1 ? "hour" : "hours"} ` : ""}${m} minutes left until 23:59. After that SeeLabs needs a Token Khusus.`,
    antreH: (g: string) => `The SeeLabs robot is still queued for ${g}`,
    antreB:
      "It is past 23:00, so the robot may not make it before 23:59. Have the bookmarklet ready as a backup.",
    gagalH: (g: string) => `The SeeLabs robot failed for ${g}`,
    gagalDitolak:
      "SeeLabs refused your password. Update it in Account, or use the bookmarklet and mark it saved.",
    gagalToken:
      "SeeLabs wants a Token Khusus. Enter it in the Score Table and the robot tries again.",
    gagalLain:
      "The robot could not save yet. Try again from the Score Table, or use the bookmarklet and mark it saved.",
    akunH: (g: string) => `${g} needs another Asisten's SeeLabs account`,
    akunB:
      "One SeeLabs account can only be used in two sessions a day. Pick an account before Kirim Nilai; the unit stays yours.",
    pjH: (n: number) =>
      `As PJ, ${n} ${n === 1 ? "group" : "groups"} of this session ${n === 1 ? "isn't" : "aren't"} done`,
    pjB: (pegang: string) =>
      `Held by ${pegang}. If the holder can't finish, move the scoring over from the Score Table.`,
    lewatH: (g: string) => `Lupa Input Nilai: ${g}`,
    menyusulH: (g: string) => `The ${g} scores are in SeeLabs`,
    menyusulB: (kapan: string) =>
      `Put in late at ${kapan}. The Lupa Input Nilai record stays, with the late time.`,
    lewatB:
      "Past 23:59, so it's recorded. Ask the Laboran for a Token Khusus, type it here, and the robot puts it in.",
    selesai: "Finish the Scores",
    tabel: "Open the Score Table",
    akun: "Pick a SeeLabs Account",
    token: "Enter a Token Khusus",
    sandi: "Update the Password",
    tagSeelabs: "SEELABS",
    tagLupa: "LUPA INPUT",
    tagPj: "PJ",
    simpanLine: (m: string, when: string, g: string, robot: string) =>
      `${m} · ${when} · ${g} sent, not saved in SeeLabs yet. Limit 23:59.${robot}`,
    robotAntre: " The robot is still queued.",
    robotGagal: " The robot failed.",
    lupaLine: (m: string, when: string, g: string, kurang: string) =>
      `${m} · ${when} · ${g} recorded as Lupa Input Nilai, ${kurang} still missing.`,
    pjLine: (m: string, when: string, g: string, pegang: string) =>
      `${m} · ${when} · ${g} not done, held by ${pegang}. You are this session's PJ.`,
    kurangKirim: "Kirim Nilai",
    kurangSeelabs: "the SeeLabs save",
    menyusul: "Put In Late",
    akhiriOk: "All your groups were sent with Kirim Nilai",
    akhiriJudul: (n: number) =>
      `${n} of your groups ${n === 1 ? "hasn't" : "haven't"} been sent with Kirim Nilai`,
    akhiriBelum:
      "You can still end the session. Reminders follow until 23:59, and after that it is recorded as Lupa Input Nilai.",
    alihkan: "Move the Scoring",
  },
  zh: {
    region: "成绩提醒",
    and: "和",
    akhirH: (n: number) => `课已结束。你还有 ${n} 个小组没有完成评分`,
    akhirB: "今天的截止时间是 23:59。之后 SeeLabs 需要 Laboran 提供的 Token Khusus。",
    ingatH: (jam: string, n: number) => `${jam} 提醒：${n} 个小组还没进入 SeeLabs`,
    sisa: (h: number, m: number) =>
      `距 23:59 还剩 ${h ? `${h} 小时 ` : ""}${m} 分钟。之后 SeeLabs 需要 Token Khusus。`,
    antreH: (g: string) => `${g}的 SeeLabs 机器人仍在排队`,
    antreB: "已过 23:00，机器人可能来不及在 23:59 前完成。请准备好书签脚本作为后备。",
    gagalH: (g: string) => `${g}的 SeeLabs 机器人失败了`,
    gagalDitolak: "SeeLabs 拒绝了你的密码。请在账户页更新，或用书签脚本后标记为已保存。",
    gagalToken: "SeeLabs 需要 Token Khusus。请在成绩表里输入，机器人会再试一次。",
    gagalLain: "机器人还没能保存。请在成绩表里重试，或用书签脚本后标记为已保存。",
    akunH: (g: string) => `${g}需要借用其他 Asisten 的 SeeLabs 账号`,
    akunB: "一个 SeeLabs 账号每天只能用于两节课。请在提交成绩前选好账号，课时费仍然归你。",
    pjH: (n: number) => `作为 PJ，这节课还有 ${n} 个小组没完成`,
    pjB: (pegang: string) => `由 ${pegang} 负责。如果负责人无法完成，请在成绩表里转交评分。`,
    lewatH: (g: string) => `Lupa Input Nilai：${g}`,
    menyusulH: (g: string) => `${g}的成绩已进入 SeeLabs`,
    menyusulB: (kapan: string) =>
      `于 ${kapan} 补录。Lupa Input Nilai 的记录会保留，并附上补录时间。`,
    lewatB: "已过 23:59，所以已记录。请向 Laboran 要 Token Khusus，在这里输入，机器人会帮你录入。",
    selesai: "完成评分",
    tabel: "打开成绩表",
    akun: "选择 SeeLabs 账号",
    token: "输入 Token Khusus",
    sandi: "更新密码",
    tagSeelabs: "SEELABS",
    tagLupa: "漏录成绩",
    tagPj: "PJ",
    simpanLine: (m: string, when: string, g: string, robot: string) =>
      `${m} · ${when} · ${g}已提交，但还没保存到 SeeLabs。截止 23:59。${robot}`,
    robotAntre: "机器人仍在排队。",
    robotGagal: "机器人失败了。",
    lupaLine: (m: string, when: string, g: string, kurang: string) =>
      `${m} · ${when} · ${g}已记为 Lupa Input Nilai，还缺${kurang}。`,
    pjLine: (m: string, when: string, g: string, pegang: string) =>
      `${m} · ${when} · ${g}未完成，由 ${pegang} 负责。你是这节课的 PJ。`,
    kurangKirim: "提交成绩",
    kurangSeelabs: "保存到 SeeLabs",
    menyusul: "已补录",
    akhiriOk: "你的小组都已用提交成绩发送",
    akhiriJudul: (n: number) => `你有 ${n} 个小组还没用提交成绩发送`,
    akhiriBelum: "仍然可以结束这节课。提醒会持续到 23:59，之后会记为 Lupa Input Nilai。",
    alihkan: "转交评分",
  },
});
