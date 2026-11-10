import { getTableColumns } from "drizzle-orm";
import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { perintah } from "../../../src/lib/schema";
import { AKSI_KELUARAN_UMUM, saringKeluaran } from "../../../src/lib/server-shared";
import { kolomPerintah } from "../perintah-kolom";

describe("kolomPerintah", () => {
  it("returns the plain table columns for the full Server view", () => {
    expect(kolomPerintah(true)).toEqual(getTableColumns(perintah));
  });

  it("keeps every key (the answer's shape) but reads the log only for the public commands", () => {
    const k = kolomPerintah(false);
    expect(Object.keys(k)).toEqual(Object.keys(getTableColumns(perintah)));
    const { keluaran, ...rest } = k;
    expect(rest).toEqual(
      (({ keluaran: _omit, ...r }) => r)(getTableColumns(perintah) as Record<string, unknown>),
    );
    const q = new PgDialect().sqlToQuery(keluaran);
    expect(q.sql).toBe(
      'case when "perintah"."aksi" in ($1, $2) then "perintah"."keluaran" else null end',
    );
    expect(q.params).toEqual([...AKSI_KELUARAN_UMUM]);
  });

  it("agrees with saringKeluaran, which still runs on the result", () => {
    // What the SQL case would give for a row, then through the JS filter: unchanged.
    const aman = [{ aksi: "diag.journal", keluaran: null }];
    expect(saringKeluaran(aman, false)).toEqual(aman);
    const umum = [{ aksi: "diag.siap", keluaran: "{}" }];
    expect(saringKeluaran(umum, false)).toEqual(umum);
  });

  it("builds a real select that does not read the log column unless it is public", () => {
    const qb = new QueryBuilder();
    const kecil = qb.select(kolomPerintah(false)).from(perintah).toSQL().sql;
    expect(kecil).toContain('case when "aksi" in ($1, $2) then "keluaran" else null end');
    expect(kecil).not.toContain('"selesai_pada", "keluaran"');
    const penuh = qb.select(kolomPerintah(true)).from(perintah).toSQL().sql;
    expect(penuh).toContain('"keluaran"');
    expect(penuh).not.toContain("case when");
  });
});
