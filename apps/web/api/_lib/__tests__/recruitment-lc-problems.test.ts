/**
 * The problem bank's API (B7.5): what may be saved, when a problem may become
 * ready, what locks after a real deal. The database is a scripted fake (each
 * read or write takes the next prepared answer); what is checked is what the
 * handler decides and writes.
 */
import { describe, expect, it, vi } from "vitest";
import { SEED_PROBLEMS } from "../../../src/lib/recruitment/seed-problems";
import type { ApiRequest, ApiResponse } from "../http";
import type { Db } from "../recruitment-data";

vi.mock("../../../src/lib/auth.js", () => ({ writeAudit: vi.fn(async () => undefined) }));

import {
  cekMasalah,
  hapusMasalah,
  simpanMasalah,
  type KonteksMasalah,
} from "../recruitment-lc-problems";

type Call = { op: string; set?: unknown; values?: unknown };
function scripted(answers: unknown[][]) {
  const calls: Call[] = [];
  const chain = (op: string) => {
    const c: Call = { op };
    calls.push(c);
    const t: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy"]) t[m] = () => t;
    t.set = (v: unknown) => ((c.set = v), t);
    t.values = (v: unknown) => ((c.values = v), t);
    t.returning = () => t;
    t.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(answers.shift() ?? []).then(res, rej);
    return t;
  };
  const db = {
    select: () => chain("select"),
    update: () => chain("update"),
    insert: () => chain("insert"),
    delete: () => chain("delete"),
  } as unknown as Db;
  return { db, calls };
}

function ctx(db: Db, body: unknown, query: Record<string, unknown> = {}) {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    status(n: number) {
      out.status = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
      return res;
    },
    setHeader() {},
    end() {},
  } as unknown as ApiResponse;
  const k: KonteksMasalah = {
    req: { body, query, method: "POST" } as unknown as ApiRequest,
    res,
    db,
    edisiId: 1,
    nim: "AKD",
  };
  return { k, out };
}

const draft = () => structuredClone(SEED_PROBLEMS[0]);
const row = (over: Record<string, unknown> = {}) => ({
  id: 5,
  editionId: 1,
  ...draft(),
  status: "draft",
  sample: false,
  version: 3,
  checkOk: true,
  checkedAt: new Date(1),
  shownAt: null,
  ...over,
});

describe("simpanMasalah", () => {
  it("creates a problem as a draft", async () => {
    const { db, calls } = scripted([[row({ id: 9, version: 1, checkOk: null, checkedAt: null })]]);
    const { k, out } = ctx(db, { draft: draft() });
    await simpanMasalah(k);
    expect(out.status).toBe(200);
    expect(calls.find((c) => c.op === "insert")!.values).toMatchObject({
      status: "draft",
      createdBy: "AKD",
    });
  });

  it("refuses a draft with the wrong shape or content, and says which field", async () => {
    const a = ctx(scripted([]).db, { draft: { nope: 1 } });
    await simpanMasalah(a.k);
    expect(a.out.status).toBe(400);
    const bad = draft();
    bad.tests = bad.tests.slice(0, 1);
    const b = ctx(scripted([]).db, { draft: bad });
    await simpanMasalah(b.k);
    expect(b.out.status).toBe(400);
    expect(b.out.body.errors).toEqual([{ field: "tests", kode: "tes_kurang" }]);
  });

  it("refuses a save made on an older version", async () => {
    const { db } = scripted([[row()]]);
    const { k, out } = ctx(db, { id: 5, version: 2, draft: draft() });
    await simpanMasalah(k);
    expect(out.status).toBe(409);
    expect(out.body.kode).toBe("versi_lama");
  });

  it("changing a hidden test clears the check, so it cannot go ready without a new one", async () => {
    const changed = draft();
    changed.tests[0].output = "999\n";
    const a = scripted([[row()]]);
    const r1 = ctx(a.db, { id: 5, version: 3, draft: changed, status: "ready" });
    await simpanMasalah(r1.k);
    expect(r1.out.body.kode).toBe("belum_dicek");
    expect(a.calls.some((c) => c.op === "update")).toBe(false);
    // saved as a draft it goes through, with the check cleared and the version up
    const b = scripted([[row()], [row({ version: 4, checkOk: null })]]);
    const r2 = ctx(b.db, { id: 5, version: 3, draft: changed });
    await simpanMasalah(r2.k);
    expect(r2.out.status).toBe(200);
    expect(b.calls.find((c) => c.op === "update")!.set).toMatchObject({
      status: "draft",
      checkOk: null,
      checkedAt: null,
      version: 4,
    });
  });

  it("fixing only the text keeps the check and may be made ready", async () => {
    const fixed = draft();
    fixed.body.statement = "Baca dua bilangan bulat a dan b, lalu cetak jumlahnya.";
    const { db, calls } = scripted([[row()], [row({ version: 4, status: "ready" })]]);
    const { k, out } = ctx(db, { id: 5, version: 3, draft: fixed, status: "ready" });
    await simpanMasalah(k);
    expect(out.status).toBe(200);
    expect(calls.find((c) => c.op === "update")!.set).toMatchObject({
      status: "ready",
      checkOk: true,
    });
  });

  it("after a real deal the tests, samples, limits and reference are locked but the text is not", async () => {
    const changed = draft();
    changed.limits.timeMs = 2000;
    const a = ctx(scripted([[row({ shownAt: new Date(5) })]]).db, {
      id: 5,
      version: 3,
      draft: changed,
    });
    await simpanMasalah(a.k);
    expect(a.out.body.kode).toBe("struktur_terkunci");
    const text = draft();
    text.title = "Jumlah Dua Bilangan Bulat";
    const b = ctx(scripted([[row({ shownAt: new Date(5) })], [row({ version: 4 })]]).db, {
      id: 5,
      version: 3,
      draft: text,
    });
    await simpanMasalah(b.k);
    expect(b.out.status).toBe(200);
  });
});

describe("cekMasalah and hapusMasalah", () => {
  it("queues the reference solution as a check job with no seat", async () => {
    const { db, calls } = scripted([
      [{ id: 5, reference: "int main(void){return 0;}" }],
      [{ id: 5 }],
      [],
      [{ id: 77 }],
    ]);
    const { k, out } = ctx(db, { id: 5 });
    await cekMasalah(k);
    expect(out.status).toBe(200);
    expect(out.body.check).toBe(77);
    expect(calls.find((c) => c.op === "insert")!.values).toMatchObject({
      kind: "check",
      seatId: null,
      problemId: 5,
    });
  });

  it("will not delete a problem a seat was dealt", async () => {
    const a = ctx(scripted([[row({ shownAt: new Date(5) })]]).db, { id: 5 });
    await hapusMasalah(a.k);
    expect(a.out.body.kode).toBe("sudah_tampil");
    const s = scripted([[row()]]);
    const b = ctx(s.db, { id: 5 });
    await hapusMasalah(b.k);
    expect(b.out.status).toBe(200);
    expect(s.calls.some((c) => c.op === "delete")).toBe(true);
  });
});
