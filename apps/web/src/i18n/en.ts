import type { ModuleStrings } from "./id";

/** English mirror of id.ts, for the en/ journal track's carousel copy. */
export const en: ModuleStrings = {
  indexTitle: "Practicum modules",
  indexLede:
    "Four modules, one board. Pick a module to open its brief, setup, code, and live view.",
  indexCardOpen: "Open module",
  indexLocked: "Locked",
  moduleWord: "Module",
  langSwitchLabel: "Indonesia",
  langSwitchHref: (modul?: number) => (modul ? `/modules/${modul}` : "/modules"),
  backToIndex: "All Modules",
  jurnal: {
    title: (m: number) => `The Module ${m} journal is not open for you yet`,
    body: "Setup, code and live open once you have joined this module's practicum. Meanwhile, read the module in the first step.",
    masuk: "Sign in",
    baca: "Read the module",
  },
  modulDoc: (m: number) => `Module ${m} · IRIS IoT`,
  stepLabels: {
    modul: "Module",
    brief: "Brief",
    setup: "Setup",
    code: "Code",
    live: "Live",
  },
  brief: {
    heading: "Summary",
    gameHeading: "How the game works",
  },
  setup: {
    toolchainHeading: "Toolchain",
    hardwareHeading: "Components",
    pinHeading: "Pins",
    checklistHeading: "Before running the program",
  },
  live: {
    heading: "Live view",
    // Module 1 gets real data from a group PC connecting its Central board
    // over USB (BoardLink), not from the PC, so it has its own wording.
    // Modules 2 through 4 use the "Real" versions via bodyFor/disclosureFor.
    body: "This module's ladder and protocol layer view shows real data once a group PC connects its Central board on the live page, and simulates it in your browser until then.",
    bodyReal:
      "This module's ladder and protocol layer view shows real data from a running session and board once it arrives, and simulates it in your browser until then.",
    bodyFor: (modul: number) => (modul === 1 ? en.live.body : en.live.bodyReal),
    cta: "Open the live view",
    backToModule: "Back to Module",
    tabLadder: "Flow",
    tabLayers: "Layers",
    tabSandbox: "Try it yourself",
    disclosure:
      "Data on this page is real once a group PC connects its Central board, and simulated in your browser until then.",
    disclosureReal:
      "Data on this page is real, from a running session and board, once it arrives, and simulated in your browser until then.",
    disclosureFor: (modul: number) => (modul === 1 ? en.live.disclosure : en.live.disclosureReal),
    fireHint: "Press the button to send one test message and watch it cross every layer.",
    jalurLabel: (jalur: number) => `Flow: ${jalur} lanes`,
  },
  nav: {
    prev: "Previous",
    next: "Next",
    stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
  },
};
