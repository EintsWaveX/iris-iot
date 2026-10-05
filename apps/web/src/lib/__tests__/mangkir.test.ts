import { describe, expect, it } from "vitest";
import { mulaiTerjadwal, nilaiKehadiran, statusHadirValid } from "../mangkir";

const T = "2026-10-06";
const at = (jam: string) => new Date(`${T}T${jam}:00+07:00`);

describe("mangkir", () => {
  it("reads the start in WIB", () => {
    expect(mulaiTerjadwal(T, "06:30").toISOString()).toBe("2026-10-05T23:30:00.000Z");
  });

  it("counts up to five minutes after the start as on time", () => {
    expect(nilaiKehadiran(T, "06:30", at("06:20"), false).status).toBe("tepat");
    expect(nilaiKehadiran(T, "06:30", at("06:35"), false).status).toBe("tepat");
  });

  it("marks a later arrival Mangkir/Ngajar with the minutes after the start", () => {
    expect(nilaiKehadiran(T, "09:30", at("09:36"), false)).toEqual({
      status: "mangkir_ngajar",
      telatMenit: 6,
    });
    expect(nilaiKehadiran(T, "15:30", at("16:12"), true).telatMenit).toBe(42);
  });

  it("is Mangkir only once the session has ended without them", () => {
    expect(nilaiKehadiran(T, "12:30", null, true).status).toBe("mangkir");
    expect(nilaiKehadiran(T, "12:30", null, false, at("12:34")).status).toBe("belum");
    expect(nilaiKehadiran(T, "12:30", null, false, at("12:36")).status).toBe("lewat");
  });

  it("knows the stored statuses", () => {
    expect(statusHadirValid("mangkir_ngajar")).toBe(true);
    expect(statusHadirValid("lewat")).toBe(false);
  });
});
