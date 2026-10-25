/**
 * A candidate who got Tidak Lolos (07b ruling): the Berikutnya card is
 * hidden, and the envelope chip says the same thing as the header.
 */
import { describe, expect, it } from "vitest";
import { REC } from "../../components/recruitment/recruitmentStrings";
import { S2 } from "../../components/recruitment/s2Strings";
import { showsNextCard } from "../recruitment/gates";
import type { CandidateStatus } from "../recruitment/types";

describe("showsNextCard", () => {
  it("hides the Berikutnya card for a cut candidate only", () => {
    expect(showsNextCard("out")).toBe(false);
    const rest: CandidateStatus[] = ["applied", "revision", "approved", "withdrawn", "accepted"];
    for (const s of rest) expect(showsNextCard(s)).toBe(true);
    expect(showsNextCard(null)).toBe(true);
  });
});

describe("the Gagal chip in the envelope inbox", () => {
  it.each(["id", "en", "zh"] as const)("uses the header's Tidak Lolos wording in %s", (lang) => {
    expect(S2[lang].inbox.gagal).toBe(REC[lang].status.out);
  });
});
