import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { kosongkanRuang } from "../recruitment-hapus";

/** A db that remembers which table each delete went to, and answers the room lookup with fixed ids. */
function fakeDb(rooms: number[]) {
  const dihapus: string[] = [];
  const db = {
    select: () => ({
      from: () => ({ where: async () => rooms.map((id) => ({ id })) }),
    }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: async () => void dihapus.push(getTableName(table)),
    }),
  };
  return { db: db as unknown as Parameters<typeof kosongkanRuang>[0], dihapus };
}

describe("kosongkanRuang", () => {
  it("clears what hangs off a room before its seats, in the same order as deleting one room", async () => {
    const { db, dihapus } = fakeDb([37, 41]);
    await kosongkanRuang(db, { editionId: 22 });
    expect(dihapus).toEqual([
      "rec_strike",
      "rec_c_submission",
      "rec_livecode",
      "rec_compile_job",
      "rec_mqtt_job",
      "rec_exam_seat",
    ]);
  });

  it("does nothing for an edition without rooms", async () => {
    const { db, dihapus } = fakeDb([]);
    await kosongkanRuang(db, { editionId: 22 });
    expect(dihapus).toEqual([]);
  });

  it("does nothing for an empty list of slots", async () => {
    const { db, dihapus } = fakeDb([37]);
    await kosongkanRuang(db, { slotIds: [] });
    expect(dihapus).toEqual([]);
  });

  it("works from a slot too", async () => {
    const { db, dihapus } = fakeDb([37]);
    await kosongkanRuang(db, { slotIds: [35] });
    expect(dihapus[dihapus.length - 1]).toBe("rec_exam_seat");
    expect(dihapus[0]).toBe("rec_strike");
  });
});
