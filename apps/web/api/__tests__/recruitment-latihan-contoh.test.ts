/**
 * The practice sample-makers fill a gap and never overwrite: an envelope's result, the proposals a lock lacks.
 * They do nothing outside a practice context.
 */
import { describe, expect, it } from "vitest";
import { lengkapiUsulan, pastikanHasil, pastikanTawaran } from "../_lib/recruitment-latihan-contoh";
import { jalankanLatihan, type KonteksLatihan } from "../_lib/recruitment-latihan-ctx";

const konteks: KonteksLatihan = {
  mode: "caas",
  nim: "101022300001",
  nama: "Latih",
  edisi: { id: 2, year: 3026, title: "Latihan", status: "latihan" } as KonteksLatihan["edisi"],
};
const dalamLatihan = <T>(f: () => Promise<T>): Promise<T> => jalankanLatihan(konteks, f);

/** A database that answers every select with `ada` and records what is written. */
function fakeDb(ada: Record<string, unknown>[]) {
  const tulis: { op: string; nilai: Record<string, unknown>; konflik?: boolean }[] = [];
  const baca: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) baca[m] = () => baca;
  baca.then = (ok: (v: unknown) => unknown) => ok(ada);
  const db = {
    select: () => baca,
    insert: () => ({
      values: (nilai: Record<string, unknown>) => {
        const w = { op: "insert", nilai, konflik: false };
        tulis.push(w);
        return {
          onConflictDoNothing: () => {
            w.konflik = true;
            return Promise.resolve();
          },
        };
      },
    }),
    update: () => ({
      set: (nilai: Record<string, unknown>) => {
        tulis.push({ op: "update", nilai });
        return { where: () => Promise.resolve() };
      },
    }),
  };
  return { db: db as never, tulis };
}

describe("pastikanHasil", () => {
  it("does nothing outside practice", async () => {
    const { db, tulis } = fakeDb([]);
    await pastikanHasil(db, 7, "berkas", "101022300900");
    expect(tulis).toEqual([]);
  });

  it("makes a locked, revealed Lolos result when there is none", async () => {
    const { db, tulis } = fakeDb([]);
    await dalamLatihan(() => pastikanHasil(db, 7, "berkas", "101022300900"));
    expect(tulis).toHaveLength(1);
    expect(tulis[0].op).toBe("insert");
    expect(tulis[0].konflik).toBe(true);
    expect(tulis[0].nilai).toMatchObject({
      candidateId: 7,
      stage: "berkas",
      proposal: "lolos",
      proposedBy: "101022300900",
      locked: true,
      lockedBy: "101022300900",
    });
    expect(tulis[0].nilai.revealAt).toBeInstanceOf(Date);
    expect(tulis[0].nilai).not.toHaveProperty("openedAt");
  });

  it("locks an unlocked row without changing its proposal or touching openedAt", async () => {
    const { db, tulis } = fakeDb([
      { id: 3, proposal: "gagal", proposedBy: "101022300111", locked: false },
    ]);
    await dalamLatihan(() => pastikanHasil(db, 7, "berkas", "101022300900"));
    expect(tulis).toHaveLength(1);
    expect(tulis[0].op).toBe("update");
    expect(tulis[0].nilai).toMatchObject({ proposal: "gagal", locked: true });
    expect(tulis[0].nilai).not.toHaveProperty("openedAt");
    expect(tulis[0].nilai).not.toHaveProperty("proposedBy");
  });

  it("gives an unlocked row with no proposal a Lolos", async () => {
    const { db, tulis } = fakeDb([{ id: 3, proposal: null, proposedBy: null, locked: false }]);
    await dalamLatihan(() => pastikanHasil(db, 7, "berkas", "101022300900"));
    expect(tulis[0].nilai).toMatchObject({
      proposal: "lolos",
      proposedBy: "101022300900",
      locked: true,
    });
  });

  it("leaves a locked row alone, and does it again without effect", async () => {
    const { db, tulis } = fakeDb([{ id: 3, proposal: "gagal", locked: true }]);
    await dalamLatihan(() => pastikanHasil(db, 7, "berkas", "101022300900"));
    await dalamLatihan(() => pastikanHasil(db, 7, "berkas", "101022300900"));
    expect(tulis).toEqual([]);
  });
});

describe("pastikanTawaran", () => {
  it("does nothing outside practice", async () => {
    const { db, tulis } = fakeDb([]);
    await pastikanTawaran(db, 7, "wawancara", "101022300900");
    expect(tulis).toEqual([]);
  });

  it("makes the Susulan offer when there is none", async () => {
    const { db, tulis } = fakeDb([]);
    await dalamLatihan(() => pastikanTawaran(db, 7, "wawancara", "101022300900"));
    expect(tulis).toHaveLength(1);
    expect(tulis[0].nilai).toMatchObject({
      candidateId: 7,
      stage: "wawancara",
      offeredBy: "101022300900",
    });
    expect(tulis[0].konflik).toBe(true);
  });

  it("leaves an existing offer alone", async () => {
    const { db, tulis } = fakeDb([{ id: 5 }]);
    await dalamLatihan(() => pastikanTawaran(db, 7, "wawancara", "101022300900"));
    expect(tulis).toEqual([]);
  });
});

describe("lengkapiUsulan", () => {
  it("does nothing outside practice", async () => {
    const { db, tulis } = fakeDb([]);
    await lengkapiUsulan(db, "berkas", [1, 2], "101022300900");
    expect(tulis).toEqual([]);
  });

  it("fills only the rows with no proposal and keeps the others", async () => {
    const { db, tulis } = fakeDb([
      { id: 11, candidateId: 1, proposal: "gagal" },
      { id: 12, candidateId: 2, proposal: null },
    ]);
    await dalamLatihan(() => lengkapiUsulan(db, "berkas", [1, 2, 3], "101022300900"));
    expect(tulis).toHaveLength(2);
    expect(tulis.find((w) => w.op === "update")?.nilai).toMatchObject({ proposal: "lolos" });
    const baru = tulis.find((w) => w.op === "insert");
    expect(baru?.nilai).toMatchObject({ candidateId: 3, stage: "berkas", proposal: "lolos" });
    expect(baru?.konflik).toBe(true);
  });

  it("does nothing for an empty list", async () => {
    const { db, tulis } = fakeDb([]);
    await dalamLatihan(() => lengkapiUsulan(db, "berkas", [], "101022300900"));
    expect(tulis).toEqual([]);
  });
});
