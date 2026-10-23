import { describe, expect, it } from "vitest";
import { cekBiodata, cekEvent, cekNimRek, cekTanggal } from "../recruitment/validate";

const BIODATA = {
  angkatan: 2025,
  kelas: "EL-48-01",
  phone: "0812 3456 7890",
  lineId: "raditya_x",
  address: "Jl. Telekomunikasi No. 1, Bandung",
  motivation: "Mau belajar bareng dan ikut membangun lab",
};

describe("cekBiodata", () => {
  it("accepts a full form and tidies the phone number", () => {
    const r = cekBiodata(BIODATA);
    expect(r).toEqual({ ok: true, biodata: { ...BIODATA, phone: "081234567890" } });
  });
  it("accepts +62 numbers", () => {
    const r = cekBiodata({ ...BIODATA, phone: "+62 812-3456-7890" });
    expect(r).toMatchObject({ ok: true, biodata: { phone: "+6281234567890" } });
  });
  it("trims text fields", () => {
    const r = cekBiodata({ ...BIODATA, kelas: "  EL-48-01 ", lineId: " x_y " });
    expect(r).toMatchObject({ ok: true, biodata: { kelas: "EL-48-01", lineId: "x_y" } });
  });
  it.each([
    ["angkatan", { angkatan: 1999 }],
    ["angkatan", { angkatan: "2025" }],
    ["angkatan", { angkatan: 2025.5 }],
    ["kelas", { kelas: "" }],
    ["kelas", { kelas: "x".repeat(41) }],
    ["phone", { phone: "12345" }],
    ["phone", { phone: "0812 not a number" }],
    ["lineId", { lineId: "" }],
    ["address", { address: "Bdg" }],
    ["address", { address: "x".repeat(301) }],
    ["motivation", { motivation: "" }],
    ["motivation", { motivation: "baris satu\nbaris dua" }],
    ["motivation", { motivation: "x".repeat(201) }],
  ])("refuses a bad %s", (field, over) => {
    expect(cekBiodata({ ...BIODATA, ...over })).toEqual({ ok: false, field });
  });
  it("refuses a missing field and a non object", () => {
    const { address: _a, ...rest } = BIODATA;
    expect(cekBiodata(rest)).toEqual({ ok: false, field: "address" });
    expect(cekBiodata(null)).toEqual({ ok: false, field: "biodata" });
    expect(cekBiodata("x")).toEqual({ ok: false, field: "biodata" });
  });
  it("drops fields it does not know", () => {
    const r = cekBiodata({ ...BIODATA, isAdmin: true });
    expect(r.ok && "isAdmin" in r.biodata).toBe(false);
  });
});

describe("cekNimRek", () => {
  it("accepts a student NIM and refuses anything that could escape an R2 key", () => {
    expect(cekNimRek("101022300172")).toBe(true);
    expect(cekNimRek("../x")).toBe(false);
    expect(cekNimRek("12/34")).toBe(false);
    expect(cekNimRek("")).toBe(false);
  });
});

describe("cekTanggal", () => {
  it("accepts real dates only", () => {
    expect(cekTanggal("2026-10-25")).toBe(true);
    expect(cekTanggal("2026-02-30")).toBe(false);
    expect(cekTanggal("2026-13-01")).toBe(false);
    expect(cekTanggal("26-10-25")).toBe(false);
    expect(cekTanggal(20261025)).toBe(false);
  });
});

const EVENT = {
  kind: "test",
  title: "Tes Tulis & Program",
  startsOn: "2026-11-17",
  endsOn: "2026-11-19",
  dayStart: "18:30",
  dayEnd: "21:00",
  place: "TULT",
  internal: false,
  audience: "own",
  gates: ["exam"],
  stage: "tes_tulis",
  color: null,
};

describe("cekEvent", () => {
  it("accepts a full event and fills the defaults of a short one", () => {
    expect(cekEvent(EVENT)).toEqual({ ok: true, event: EVENT });
    expect(
      cekEvent({ kind: "pleno", title: "Pleno", startsOn: "2026-11-16", endsOn: "2026-11-16" }),
    ).toEqual({
      ok: true,
      event: {
        kind: "pleno",
        title: "Pleno",
        startsOn: "2026-11-16",
        endsOn: "2026-11-16",
        dayStart: null,
        dayEnd: null,
        place: null,
        internal: false,
        audience: "all",
        gates: [],
        stage: null,
        color: null,
      },
    });
  });
  it.each([
    ["kind", { kind: "party" }],
    ["title", { title: "   " }],
    ["title", { title: "x".repeat(81) }],
    ["startsOn", { startsOn: "2026-02-30" }],
    ["endsOn", { endsOn: "2026-11-16" }],
    ["dayStart", { dayStart: null }],
    ["dayEnd", { dayEnd: "25:00" }],
    ["dayEnd", { dayEnd: "18:00" }],
    ["place", { place: "x".repeat(81) }],
    ["audience", { audience: "friends" }],
    ["gates", { gates: ["exam", "exam"] }],
    ["gates", { gates: ["unlock"] }],
    ["gates", { gates: "exam" }],
    ["stage", { stage: "finale" }],
    ["color", { color: "hotpink" }],
    ["internal", { internal: "yes" }],
  ])("refuses a bad %s", (field, over) => {
    expect(cekEvent({ ...EVENT, ...over })).toEqual({ ok: false, field });
  });
  it("turns an empty place into null and trims the title", () => {
    const r = cekEvent({ ...EVENT, place: "  ", title: "  Tes  " });
    expect(r).toMatchObject({ ok: true, event: { place: null, title: "Tes" } });
  });
  it("does not carry over fields it does not own", () => {
    const r = cekEvent({ ...EVENT, id: 99, editionId: 7, updatedBy: "x" });
    expect(r.ok && Object.keys(r.event).sort()).toEqual(Object.keys(EVENT).sort());
  });
});
