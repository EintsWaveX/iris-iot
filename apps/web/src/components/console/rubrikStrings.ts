/**
 * The lab's score rubric as the score table shows it (user ruling
 * 2026-10-17). The Indonesian level texts are the rubric's own words;
 * English and Mandarin are translations. Level 0 is the same for all.
 */
import { dict } from "../../lib/app";
import type { Tingkat } from "../../lib/nilai-rubrik";

type Teks = Record<Tingkat, string>;

export const RB = dict({
  id: {
    nama: {
      D1: "Perakitan Komponen/Membuat Aplikasi",
      D2: "Pengoperasian Alat/Aplikasi",
      D3: "Diskusi Kelompok",
      D4: "Perancangan Rangkaian/Aplikasi",
      L1: "Jurnal Praktikum",
      L2: "Analisa Hasil Praktikum",
    } as Record<string, string>,
    level: {
      D1: {
        0: "Praktikan tidak mengikuti praktikum",
        45: "Praktikan tidak terlibat dalam perakitan komponen",
        65: "Praktikan ikut pembuatan komponen tetapi membuat praktikum tidak kondusif",
        80: "Praktikan ikut pembuatan komponen tetapi tidak paham",
        90: "Praktikan ikut pembuatan komponen dan dapat memahaminya",
      },
      D2: {
        0: "Praktikan tidak mengikuti praktikum",
        45: "Praktikan tidak terlibat dalam pengoperasian alat/aplikasi",
        65: "Praktikan tidak dapat mengoperasikan alat/aplikasi dengan baik dan tidak terlibat secara aktif.",
        80: "Praktikan dapat mengoperasikan alat/aplikasi namun tidak terlibat secara aktif.",
        90: "Praktikan terlibat secara aktif dalam pengoperasian alat/aplikasi dan dapat mengoperasikannya dengan baik.",
      },
      D3: {
        0: "Praktikan tidak mengikuti praktikum",
        45: "Praktikan tidak terlibat dalam diskusi kelompok serta membuat ruangan tidak kondusif",
        65: "Praktikan berdiskusi satu sama lain mengenai hal-hal di luar materi yang sedang dibahas",
        80: "Praktikan tidak mendiskusikan materi yang sedang dipelajari dengan asisten atau praktikan lainnya",
        90: "Praktikan berdiskusi mengenai materi yang dipelajari baik dengan asisten maupun antar sesama praktikan",
      },
      D4: {
        0: "Praktikan tidak mengikuti praktikum",
        45: "Praktikan tidak dapat membuat rangkaian/aplikasi",
        65: "Praktikan tidak dapat membuat rangkaian/aplikasi, namun terlibat secara aktif",
        80: "Praktikan dapat rangkaian/aplikasi namun kurang aktif",
        90: "Praktikan terlibat secara aktif dalam membuat rangkaian/aplikasi secara menyeluruh",
      },
      L2: {
        0: "Praktikan tidak mengikuti praktikum",
        45: "Praktikan tidak dapat mengerjakan Tugas Analisa yang telah diberikan",
        65: "Praktikan mengerjakan Tugas Analisa dengan bantuan teman",
        80: "Praktikan mengerjakan Tugas Analisa dengan mandiri walaupun masih terdapat kesalahan pada jawabannya",
        90: "Praktikan mengerjakan Tugas Analisa dengan mandiri dan pengerjaannya sesuai yang diharapkan",
      },
    } as Record<string, Teks>,
    pickLevel: "Pilih Level",
    levelHint: "Ketik 0, 4, 6, 8 atau 9 untuk memilih level 0, 45, 65, 80 atau 90.",
    levelTip: (k: string, nama: string) => `${k}, ${nama}. Klik untuk memilih level.`,
    auto: "Otomatis",
    autoTip:
      "Otomatis dari isian jurnal: blank benar dibagi semua blank, dikali 90. Ketik angka untuk menggantinya, kosongkan untuk kembali otomatis.",
    overrideTip: "Diisi asisten. Kosongkan untuk kembali ke nilai otomatis.",
    taTip:
      "Tulis total 0 sampai 100. Rinciannya: No. 1 Pengertian 15, No. 2 Sebutkan 15, No. 3 Jelaskan 20, No. 4 Jelaskan 20, No. 5 Praktek 30.",
    range:
      "Nilai tidak sesuai rubrik. D1 sampai D4 dan L2: 0, 45, 65, 80 atau 90. L1: 0 sampai 90. TA dan TP: 0 sampai 100.",
  },
  en: {
    nama: {
      D1: "Assembling Components and Building the App",
      D2: "Operating Tools and Apps",
      D3: "Group Discussion",
      D4: "Designing the Circuit or App",
      L1: "Lab Journal",
      L2: "Lab Results Analysis",
    } as Record<string, string>,
    level: {
      D1: {
        0: "The student did not take part in the practicum",
        45: "The student was not involved in assembling components",
        65: "The student helped build the components but made the practicum disruptive",
        80: "The student helped build the components but did not understand them",
        90: "The student helped build the components and understood them",
      },
      D2: {
        0: "The student did not take part in the practicum",
        45: "The student was not involved in operating the tools or apps",
        65: "The student could not operate the tools or apps well and was not actively involved.",
        80: "The student could operate the tools or apps but was not actively involved.",
        90: "The student was actively involved in operating the tools or apps and could operate them well.",
      },
      D3: {
        0: "The student did not take part in the practicum",
        45: "The student was not involved in the group discussion and made the room disruptive",
        65: "The student talked with others about things outside the topic being covered",
        80: "The student did not discuss the material being studied with the assistant or other students",
        90: "The student discussed the material being studied, both with the assistant and with other students",
      },
      D4: {
        0: "The student did not take part in the practicum",
        45: "The student could not build the circuit or app",
        65: "The student could not build the circuit or app, but was actively involved",
        80: "The student could build the circuit or app but was less active",
        90: "The student was actively involved in building the whole circuit or app",
      },
      L2: {
        0: "The student did not take part in the practicum",
        45: "The student could not do the analysis task they were given",
        65: "The student did the analysis task with a friend's help",
        80: "The student did the analysis task on their own, though some answers were wrong",
        90: "The student did the analysis task on their own and the work was as expected",
      },
    } as Record<string, Teks>,
    pickLevel: "Pick a Level",
    levelHint: "Type 0, 4, 6, 8 or 9 to pick level 0, 45, 65, 80 or 90.",
    levelTip: (k: string, nama: string) => `${k}, ${nama}. Click to pick a level.`,
    auto: "Auto",
    autoTip:
      "Automatic from the journal blanks: correct blanks over all blanks, times 90. Type a number to replace it, clear it to go back to automatic.",
    overrideTip: "Set by an assistant. Clear it to go back to the automatic value.",
    taTip:
      "Write the total, 0 to 100. The split: No. 1 Definition 15, No. 2 List 15, No. 3 Explain 20, No. 4 Explain 20, No. 5 Practice 30.",
    range:
      "That score does not fit the rubric. D1 to D4 and L2: 0, 45, 65, 80 or 90. L1: 0 to 90. TA and TP: 0 to 100.",
  },
  zh: {
    nama: {
      D1: "组装元件与制作应用",
      D2: "设备与应用操作",
      D3: "小组讨论",
      D4: "电路与应用设计",
      L1: "实验日志",
      L2: "实验结果分析",
    } as Record<string, string>,
    level: {
      D1: {
        0: "学生没有参加实验",
        45: "学生没有参与元件组装",
        65: "学生参与了元件制作，但让实验课秩序混乱",
        80: "学生参与了元件制作，但不理解",
        90: "学生参与了元件制作，并且能够理解",
      },
      D2: {
        0: "学生没有参加实验",
        45: "学生没有参与设备或应用的操作",
        65: "学生不能很好地操作设备或应用，也没有积极参与。",
        80: "学生能够操作设备或应用，但没有积极参与。",
        90: "学生积极参与设备或应用的操作，并且能够很好地操作。",
      },
      D3: {
        0: "学生没有参加实验",
        45: "学生没有参与小组讨论，并让教室秩序混乱",
        65: "学生之间讨论的是与当前内容无关的事情",
        80: "学生没有与助教或其他学生讨论正在学习的内容",
        90: "学生与助教以及其他学生讨论了所学的内容",
      },
      D4: {
        0: "学生没有参加实验",
        45: "学生无法完成电路或应用",
        65: "学生无法完成电路或应用，但积极参与",
        80: "学生能够完成电路或应用，但不够积极",
        90: "学生积极参与，完整地完成了电路或应用",
      },
      L2: {
        0: "学生没有参加实验",
        45: "学生无法完成布置的分析作业",
        65: "学生在同学的帮助下完成了分析作业",
        80: "学生独立完成了分析作业，但答案中仍有错误",
        90: "学生独立完成了分析作业，并且完成得符合预期",
      },
    } as Record<string, Teks>,
    pickLevel: "选择等级",
    levelHint: "输入 0、4、6、8 或 9，选择等级 0、45、65、80 或 90。",
    levelTip: (k: string, nama: string) => `${k}，${nama}。点击选择等级。`,
    auto: "自动",
    autoTip:
      "根据日志填空自动计算：答对的空数除以全部空数，再乘以 90。输入数字可替换，清空则恢复自动。",
    overrideTip: "由助教填写。清空后恢复自动值。",
    taTip:
      "填写总分，0 到 100。分项：第 1 题 概念 15，第 2 题 列举 15，第 3 题 说明 20，第 4 题 说明 20，第 5 题 实践 30。",
    range:
      "分数不符合评分标准。D1 至 D4 和 L2：0、45、65、80 或 90。L1：0 至 90。TA 和 TP：0 至 100。",
  },
});
