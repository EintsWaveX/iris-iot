import { beforeAll, beforeEach, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";
});

const { createKuisTiket, readKuisTiket, createSessionCookie, readSessionCookie, KUIS_TIKET_DETIK } =
  await import("../auth");
const { pakaiTiket, lupakanTiket } = await import("../../../api/_lib/kuis-tiket");

const orang = {
  role: "praktikan" as const,
  nim: "2311102001",
  nama: "Alya",
  kelompokNomor: 3,
  sesiId: 9,
};

describe("quiz hand-over ticket", () => {
  beforeEach(() => lupakanTiket());

  it("round-trips who is signed in", () => {
    const t = createKuisTiket(orang, 1_000_000);
    const isi = readKuisTiket(t, 1_000_000);
    expect(isi?.payload).toEqual(orang);
    expect(isi?.nonce.length).toBeGreaterThan(8);
  });

  it("lasts a minute and no longer", () => {
    const t = createKuisTiket(orang, 1_000_000);
    expect(readKuisTiket(t, 1_000_000 + (KUIS_TIKET_DETIK - 1) * 1000)).not.toBeNull();
    expect(readKuisTiket(t, 1_000_000 + (KUIS_TIKET_DETIK + 1) * 1000)).toBeNull();
  });

  it("rejects a tampered ticket, junk and a session cookie", () => {
    const t = createKuisTiket(orang);
    const [, sig] = t.split(".");
    const palsu = Buffer.from(
      JSON.stringify({ p: { ...orang, role: "asisten" }, n: "abc", exp: 9_999_999_999 }),
    ).toString("base64url");
    expect(readKuisTiket(`${palsu}.${sig}`)).toBeNull();
    expect(readKuisTiket("kacau")).toBeNull();
    expect(readKuisTiket(undefined)).toBeNull();
    expect(readKuisTiket(42)).toBeNull();
    // A session cookie is signed under another label, so it can never be a ticket.
    expect(readKuisTiket(createSessionCookie(orang))).toBeNull();
  });

  it("is not a session cookie", () => {
    expect(readSessionCookie(createKuisTiket(orang))).toBeNull();
  });

  it("can be redeemed once", () => {
    const isi = readKuisTiket(createKuisTiket(orang))!;
    expect(pakaiTiket(isi.nonce, isi.exp)).toBe(true);
    expect(pakaiTiket(isi.nonce, isi.exp)).toBe(false);
  });

  it("forgets a nonce once its ticket would have expired", () => {
    expect(pakaiTiket("n1", 100, 50_000)).toBe(true);
    expect(pakaiTiket("n2", 100, 200_000)).toBe(true); // n1 expired and was purged
    expect(pakaiTiket("n1", 300, 200_000)).toBe(true);
  });

  it("gives two tickets for the same person different nonces", () => {
    const a = readKuisTiket(createKuisTiket(orang))!;
    const b = readKuisTiket(createKuisTiket(orang))!;
    expect(a.nonce).not.toBe(b.nonce);
  });
});
