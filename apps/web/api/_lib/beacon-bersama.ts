/**
 * A Beacon that serves more than one group (2026-11-13: 5 Hunters and 2 Beacons). The practicum Beacon
 * sketch is left exactly as students read it; when a Beacon has extra groups the site appends this block
 * at build time, like iris-update.ts, and hooks it into loop() through one same-line rewrite.
 *
 * Each extra group transmits in that group's own TDMA slot (the sketch's nextSlot() formula), with that
 * group's sync word, its own sequence counter and its own board key in the scoreboard report. The
 * primary group (GROUP_ID) keeps running as the sketch wrote it; the radio's sync word is put back to
 * LORA_SYNC_WORD after every extra packet because the primary never sets it again.
 */
import { KUNCI_RE } from "../../src/lib/live-build.js";

export interface TambahanBeacon {
  grup: number;
  /** The group's LoRa sync word as C source, like "0xF3" */
  sync: string;
  /** The group's board key */
  kunci: string;
}

/** loop() in every language's Beacon sketch has this line exactly once */
const BARIS_KAIT = /^(\s*)webSocket\.loop\(\);/m;
const SYNC_RE = /^0x[0-9A-F]{2}$/;
/** An extra packet more than this late would run into the next group's slot, so it is skipped */
const TERLAMBAT_MS = 15;

function periksa(t: TambahanBeacon[]): void {
  const grups = new Set<number>();
  for (const x of t) {
    if (!Number.isInteger(x.grup) || x.grup < 1 || x.grup > 99)
      throw new Error(`beacon-bersama: bad group ${x.grup}`);
    if (grups.has(x.grup)) throw new Error(`beacon-bersama: group ${x.grup} twice`);
    grups.add(x.grup);
    if (!SYNC_RE.test(x.sync)) throw new Error(`beacon-bersama: bad sync word for group ${x.grup}`);
    if (!KUNCI_RE.test(x.kunci)) throw new Error(`beacon-bersama: bad key for group ${x.grup}`);
  }
}

/** The C++ block for these extra groups */
export function blokBeaconBersama(t: TambahanBeacon[]): string {
  periksa(t);
  const n = t.length;
  return String.raw`
// ---- IRIS shared Beacon (added by the site when it builds; not part of the practicum code) ----
const int irisSharedN = ${n};
const int irisSharedGroup[] = {${t.map((x) => x.grup).join(", ")}};
const uint8_t irisSharedSync[] = {${t.map((x) => x.sync).join(", ")}};
const char* const irisSharedKey[] = {${t.map((x) => `"${x.kunci}"`).join(", ")}};
static int64_t irisSharedNext[irisSharedN];
static uint32_t irisSharedSeq[irisSharedN];
static bool irisSharedReady = false;

// nextSlot() of the sketch, for another group
static int64_t irisSharedSlot(int g, int64_t now) {
  int64_t start = now - now % TDMA_PERIOD_MS + (g - 1) % TDMA_SLOTS * TDMA_SLOT_MS;
  return start > now ? start : start + TDMA_PERIOD_MS;
}

void irisSharedLoop() {
  int64_t now = clockMs();
  if (!irisSharedReady) {
    irisSharedReady = true;
    for (int i = 0; i < irisSharedN; i++) irisSharedNext[i] = irisSharedSlot(irisSharedGroup[i], now);
    return;
  }
  for (int i = 0; i < irisSharedN; i++) {
    if (now < irisSharedNext[i]) continue;
    bool late = now - irisSharedNext[i] > ${TERLAMBAT_MS};
    irisSharedNext[i] = irisSharedSlot(irisSharedGroup[i], now);
    if (late) continue;
    irisSharedSeq[i]++;
    String sentAt = wallClockTimestamp();
    String payload = String(irisSharedGroup[i]) + " " + String(irisSharedSeq[i]) + " " + sentAt;
    LoRa.setSyncWord(irisSharedSync[i]);
    LoRa.beginPacket();
    LoRa.print(payload);
    LoRa.endPacket();
    LoRa.setSyncWord(LORA_SYNC_WORD);
    char report[96];
    snprintf(report, sizeof(report), "{\"grup\":%d,\"k\":\"%s\",\"seq\":%lu,\"tx\":\"%s\"}",
             irisSharedGroup[i], irisSharedKey[i], (unsigned long)irisSharedSeq[i], sentAt.c_str());
    webSocket.sendTXT(report);
    Serial.printf("[%s] Shared beacon: group %d packet #%lu\n", sentAt.c_str(),
                  irisSharedGroup[i], (unsigned long)irisSharedSeq[i]);
    return;
  }
}
// ---- end of the IRIS shared Beacon ----
`;
}

/**
 * The Beacon sketch with its extra groups: unchanged for an empty list, otherwise the one hook line
 * is extended (same line, so no line number moves) and the block appended. Throws when the hook line
 * is not found exactly once, like the other rewrites.
 */
export function pasangBeaconBersama(text: string, t: TambahanBeacon[]): string {
  if (t.length === 0) return text;
  const blok = blokBeaconBersama(t);
  const cocok = text.match(new RegExp(BARIS_KAIT.source, "gm"));
  if (!cocok || cocok.length !== 1)
    throw new Error(
      `beacon-bersama: the loop() hook line matched ${cocok?.length ?? 0} times, expected exactly 1`,
    );
  return (
    text.replace(
      BARIS_KAIT,
      (_m, awal: string) => `${awal}webSocket.loop(); void irisSharedLoop(); irisSharedLoop();`,
    ) + blok
  );
}
