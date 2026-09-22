import type { ModuleStrings } from "./id";

/** English mirror of id.ts, for the en/ journal track's carousel copy. */
export const en: ModuleStrings = {
  indexTitle: "Practicum modules",
  indexLede:
    "Four modules, one board. Pick a module to open its brief, setup, code, and live view.",
  langSwitchLabel: "Indonesia",
  langSwitchHref: (modul?: number) => (modul ? `/modules/${modul}` : "/modules"),
  backToIndex: "All modules",
  stepLabels: {
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
  code: {
    heading: "Program source",
    note: "Fill in each blank box and click outside it to check the answer. A correct answer shows why; every answer saves automatically, so you can pick this back up any time.",
    download: "Download file",
    downloadHint: "Finish every blank in this file to unlock its download.",
    masuk: "Log in as a praktikan to fill in and save answers here.",
  },
  live: {
    heading: "Live view",
    body: "The ladder and protocol layer view for a running session is not available at this stage yet. This card becomes a link to the live view once that stage is built.",
  },
  nav: {
    prev: "Previous",
    next: "Next",
    stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
  },
};
