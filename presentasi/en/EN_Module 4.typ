// =====================================================================
// MODULE 4 — LONG RANGE COMMUNICATION (LoRa)
// Introductory practicum presentation, target duration 20-25 minutes.
//
// Compile from the project root directory:
//   typst compile --root . "presentasi/en/EN_Module 4.typ"
//
// The --root flag is required: this file references assets and code
// files outside the presentasi folder using project-root-absolute paths.
// =====================================================================

#import "/presentasi/template/slides.typ": *

#show: iris-theme.with(
  title: "Module 4 — Long Range Communication (LoRa)",
  subtitle: "IoT Device Programming Practicum",
  lang: "en",
)

#title-slide(
  title: [MODULE 4],
  topic: [LONG RANGE COMMUNICATION (LoRa)],
  subtitle: [LoRa Peer-to-Peer],
  lang: "en",
)

#include "parts/01-theory.typ"

#include "parts/02-implementation.typ"
