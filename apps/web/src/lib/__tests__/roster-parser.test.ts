import { describe, it, expect } from "vitest";
import { parseRosterPaste, rosterToPaste } from "../roster-parser";

// Fixtures mirror modul4/SETUP.md section 4's own paste examples and
// modul4/tools/uji_protokol.py's NIM fixtures, so this test is checking the
// TypeScript port against the same cases the original JavaScript was
// proven against.

describe("parseRosterPaste", () => {
  it("parses the documented separators: comma, tab, semicolon, space", () => {
    const text = [
      "#1 Kelompok Cakra",
      "2311102001, Alya Rahmawati",
      "2311102014\tBagus Prasetyo",
      "2311102027;Citra Dewi Lestari",
      "2311102033 Dimas Aditya",
    ].join("\n");

    const result = parseRosterPaste(text);

    expect(result.errors).toEqual([]);
    expect(result.total).toBe(4);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toEqual({
      nomor: 1,
      nama: "Kelompok Cakra",
      anggota: [
        { nim: "2311102001", nama: "Alya Rahmawati" },
        { nim: "2311102014", nama: "Bagus Prasetyo" },
        { nim: "2311102027", nama: "Citra Dewi Lestari" },
        { nim: "2311102033", nama: "Dimas Aditya" },
      ],
    });
  });

  it("accepts a bare NIM with no name as a valid member", () => {
    const result = parseRosterPaste("#1 Kelompok Cakra\n2311102001");
    expect(result.errors).toEqual([]);
    expect(result.groups[0].anggota).toEqual([{ nim: "2311102001", nama: "" }]);
  });

  it("upper-cases the NIM and re-opens an existing group without wiping it", () => {
    const text = ["#2 Kelompok Bayu", "abcd1234, Someone", "#2", "efgh5678, Someone Else"].join(
      "\n",
    );
    const result = parseRosterPaste(text);
    expect(result.errors).toEqual([]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].nama).toBe("Kelompok Bayu"); // not overwritten by the bare "#2"
    expect(result.groups[0].anggota.map((m) => m.nim)).toEqual(["ABCD1234", "EFGH5678"]);
  });

  it("flags a member line before any group header", () => {
    const result = parseRosterPaste("2311102001, Alya Rahmawati");
    expect(result.errors).toEqual([{ baris: 1, kode: "tanpa_kelompok" }]);
    expect(result.total).toBe(0);
  });

  it("flags a line that is neither a bare NIM nor NIM+separator+name", () => {
    const result = parseRosterPaste("#1\nnot a valid line at all !!");
    expect(result.errors).toEqual([{ baris: 2, kode: "baris_tidak_valid" }]);
  });

  it("flags a duplicate NIM within the same paste and keeps only the first", () => {
    const text = ["#1 A", "2311102001, First", "#2 B", "2311102001, Second"].join("\n");
    const result = parseRosterPaste(text);
    expect(result.errors).toEqual([{ baris: 4, kode: "nim_ganda", nim: "2311102001" }]);
    expect(result.total).toBe(1);
    expect(result.groups[1].anggota).toEqual([]);
  });

  it("truncates a name longer than 40 characters", () => {
    const longName = "A".repeat(60);
    const result = parseRosterPaste(`#1\n2311102001, ${longName}`);
    expect(result.groups[0].anggota[0].nama).toHaveLength(40);
  });

  it("ignores blank lines between entries", () => {
    const result = parseRosterPaste("#1 A\n\n2311102001, Alya\n\n\n#2 B\n2311102002, Bagus");
    expect(result.errors).toEqual([]);
    expect(result.groups).toHaveLength(2);
  });

  it("round-trips through rosterToPaste", () => {
    const parsed = parseRosterPaste(
      "#1 Kelompok Cakra\n2311102001, Alya Rahmawati\n#2 Kelompok Bayu\n2311102002, Bagus",
    );
    const rendered = rosterToPaste(parsed.groups);
    const reparsed = parseRosterPaste(rendered);
    expect(reparsed.groups).toEqual(parsed.groups);
    expect(reparsed.errors).toEqual([]);
  });
});
