import type { Lang } from "../lib/kelas";
import { en } from "./en";
import { id, type ModuleStrings } from "./id";

/** Mandarin mirror of id.ts (Phase 9 Stage 8). The handbook text itself
 *  stays ID/EN; only this page chrome is translated. */
export const zh: ModuleStrings = {
  indexTitle: "实验模块",
  indexLede: "四个模块，一块板子。选一个模块，打开它的概要、准备、代码和实时视图。",
  indexCardOpen: "打开模块",
  indexLocked: "已锁定",
  moduleWord: "模块",
  langSwitchLabel: "Indonesia",
  langSwitchHref: (modul?: number) => (modul ? `/modules/${modul}` : "/modules"),
  backToIndex: "所有模块",
  jurnal: {
    title: (m: number) => `模块 ${m} 的日志还没对你开放`,
    body: "参加这个模块的实验课后，准备、代码和实时视图就会打开。在那之前，可以先在第一步读模块。",
    masuk: "登录",
    baca: "读模块",
  },
  modulDoc: (m: number) => `模块 ${m} · IRIS IoT`,
  stepLabels: {
    modul: "模块",
    brief: "概要",
    setup: "准备",
    code: "代码",
    live: "Live",
  },
  brief: {
    heading: "概要",
    gameHeading: "游戏怎么玩",
  },
  setup: {
    toolchainHeading: "工具链",
    hardwareHeading: "元件",
    pinHeading: "引脚",
    checklistHeading: "运行程序之前",
  },
  live: {
    heading: "实时视图",
    body: "一旦有组的电脑在实时页面连上 Central 板，这个模块的流程图和协议层视图就会显示真实数据；在那之前在你的浏览器里模拟。",
    bodyReal:
      "一旦有正在进行的课和板子的数据，这个模块的流程图和协议层视图就会显示真实数据；在那之前在你的浏览器里模拟。",
    bodyFor: (modul: number) => (modul === 1 ? zh.live.body : zh.live.bodyReal),
    cta: "打开实时视图",
    backToModule: "回到模块",
    tabLadder: "流程",
    tabLayers: "协议层",
    tabSandbox: "自己试试",
    disclosure:
      "有组的电脑连上 Central 板后，这个页面的数据就是真实的；在那之前在你的浏览器里模拟。",
    disclosureReal:
      "有正在进行的课和板子的数据后，这个页面的数据就是真实的；在那之前在你的浏览器里模拟。",
    disclosureFor: (modul: number) => (modul === 1 ? zh.live.disclosure : zh.live.disclosureReal),
    fireHint: "按下按钮发送一条测试消息，看它穿过每一层。",
    jalurLabel: (jalur: number) => `流程：${jalur} 条通道`,
  },
  nav: {
    prev: "上一步",
    next: "下一步",
    stepOf: (current: number, total: number) => `第 ${current} 步，共 ${total} 步`,
  },
};

/** The module page chrome for a language. */
export function stringsFor(lang: Lang): ModuleStrings {
  return lang === "zh" ? zh : lang === "en" ? en : id;
}
