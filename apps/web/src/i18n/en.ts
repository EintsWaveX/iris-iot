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
    note: "Blank sections are marked with an underscore and a number. Filling in and checking answers here directly arrives in a later stage; for now, the code is shown as it appears in the printed journal.",
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
