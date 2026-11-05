/**
 * Copying an edition's SETUP for Mode Latihan (5 Nov 2026), the part that makes practice a mirror of the real
 * Oprec. Setup is what the Panitia prepare before anyone acts: the calendar, the slots people pick, the
 * interview rubrics, the Tubes sessions and topics, the exam settings, the reference documents and the
 * Panitia roster. It is read from one edition and written into another with the ids that point at each
 * other (a slot's event, a part's reference, a question's references) carried over. Nothing a person did is
 * copied: no candidates, picks, attendance, rooms, answers, scores, teams or files.
 *
 * Two sources use it: the real edition (Samakan, and the first make) and the previous practice edition
 * (Mulai Ulang, which keeps what the Asisten set up while practicing). Only the second also carries the
 * question bank and the Live Coding problems, because the first never copies live questions (their answer
 * keys belong to the people who hold the bank right on the real edition).
 */
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { getDb } from "../../src/lib/db.js";
import {
  recCProblem,
  recCommittee,
  recEvent,
  recExamConfig,
  recPartRef,
  recQuestion,
  recReference,
  recRubric,
  recSlot,
  recTubesSession,
  recTubesTopic,
} from "../../src/lib/schema.js";

type Db = ReturnType<typeof getDb>;

type Baris<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export interface SetupLatihan {
  events: Baris<typeof recEvent>[];
  slots: Baris<typeof recSlot>[];
  rubrics: Baris<typeof recRubric>[];
  sessions: Baris<typeof recTubesSession>[];
  topics: Baris<typeof recTubesTopic>[];
  references: Baris<typeof recReference>[];
  partRefs: Baris<typeof recPartRef>[];
  committee: Baris<typeof recCommittee>[];
  /** The exam settings JSON, or null when the edition has none */
  config: Baris<typeof recExamConfig>["config"] | null;
  questions: Baris<typeof recQuestion>[];
  problems: Baris<typeof recCProblem>[];
}

/** The six sample Tubes topics (mockup rec5-data.js S5.TOPICS): used only when the source has no topics. */
export const TOPIK_CONTOH: [string, string][] = [
  [
    "Stasiun Cuaca Mini",
    "Rancang node sensor suhu, kelembapan dan tekanan yang mengirim data lewat MQTT ke dasbor web. Data harus tetap tersimpan bila jaringan putus sebentar.",
  ],
  [
    "Gerbang Akses RFID",
    "Bangun gerbang yang membaca kartu RFID, mencocokkannya dengan daftar di server dan mencatat setiap percobaan masuk lengkap dengan waktunya.",
  ],
  [
    "Pemantau Energi Ruangan",
    "Ukur arus dan tegangan satu ruangan, hitung dayanya, dan tampilkan grafik pemakaian per jam serta peringatan bila melewati batas.",
  ],
  [
    "Parkir Pintar",
    "Deteksi terisi atau kosongnya beberapa petak parkir, kirim statusnya ke satu halaman web yang diperbarui langsung.",
  ],
  [
    "Penyiram Tanaman Otomatis",
    "Baca kelembapan tanah, siram bila perlu, dan beri tahu lewat web bila tandon hampir habis. Jelaskan cara kamu mencegah penyiraman berlebih.",
  ],
  [
    "Pelacak Aset Gudang",
    "Lacak perpindahan beberapa kotak di gudang dengan tag dan beberapa penerima, lalu tampilkan lokasi terakhir tiap kotak.",
  ],
];

/** Reads the setup of an edition. `penuh` adds the question bank and the Live Coding problems. */
export async function bacaSetup(db: Db, edisiId: number, penuh: boolean): Promise<SetupLatihan> {
  const events = await db.select().from(recEvent).where(eq(recEvent.editionId, edisiId));
  const slots = await db.select().from(recSlot).where(eq(recSlot.editionId, edisiId));
  const rubrics = await db.select().from(recRubric).where(eq(recRubric.editionId, edisiId));
  const sessions = await db
    .select()
    .from(recTubesSession)
    .where(eq(recTubesSession.editionId, edisiId));
  const topics = await db.select().from(recTubesTopic).where(eq(recTubesTopic.editionId, edisiId));
  const references = await db
    .select()
    .from(recReference)
    .where(eq(recReference.editionId, edisiId));
  const partRefs = await db.select().from(recPartRef).where(eq(recPartRef.editionId, edisiId));
  const committee = await db.select().from(recCommittee).where(eq(recCommittee.editionId, edisiId));
  const [cfg] = await db.select().from(recExamConfig).where(eq(recExamConfig.editionId, edisiId));
  const questions = penuh
    ? await db.select().from(recQuestion).where(eq(recQuestion.editionId, edisiId))
    : [];
  const problems = penuh
    ? await db.select().from(recCProblem).where(eq(recCProblem.editionId, edisiId))
    : [];
  return {
    events,
    slots,
    rubrics,
    sessions,
    topics,
    references,
    partRefs,
    committee,
    config: cfg?.config ?? null,
    questions,
    problems,
  };
}

const tanpaId = <T extends { id: number }>(r: T): Omit<T, "id"> => {
  const { id: _id, ...sisa } = r;
  return sisa;
};

/** `returning` hands the new ids back in the order of the rows that went in; pair them with the old ids. */
const petakan = (lama: readonly { id: number }[], baru: readonly { id: number }[]) =>
  new Map<number, number>(lama.map((r, i) => [r.id, baru[i]!.id]));

/**
 * Writes `s` into the (already existing) edition `baru`. Returns the old-to-new id maps of the events and the
 * references. `topikContoh` fills the Tubes topics with the sample ones when the source had none, so that
 * the Tubes tab is never empty to try.
 */
export async function tulisSetup(
  tx: Db,
  s: SetupLatihan,
  baru: number,
  nim: string,
  opsi: { topikContoh: boolean },
): Promise<{ acara: Map<number, number>; rujukan: Map<number, number> }> {
  const sekarang = new Date();
  let acara = new Map<number, number>();
  if (s.events.length > 0) {
    const dibuat = await tx
      .insert(recEvent)
      .values(
        s.events.map((e) => ({
          ...tanpaId(e),
          editionId: baru,
          updatedBy: nim,
          updatedAt: sekarang,
        })),
      )
      .returning({ id: recEvent.id });
    acara = petakan(s.events, dibuat);
  }
  if (s.slots.length > 0)
    await tx.insert(recSlot).values(
      s.slots.map((x) => ({
        ...tanpaId(x),
        editionId: baru,
        eventId: x.eventId === null ? null : (acara.get(x.eventId) ?? null),
      })),
    );
  if (s.rubrics.length > 0)
    await tx.insert(recRubric).values(
      s.rubrics.map((r) => ({
        ...tanpaId(r),
        editionId: baru,
        updatedBy: nim,
        updatedAt: sekarang,
      })),
    );
  if (s.sessions.length > 0)
    await tx
      .insert(recTubesSession)
      .values(s.sessions.map((x) => ({ ...tanpaId(x), editionId: baru })));
  const topik =
    s.topics.length > 0
      ? s.topics.map((t) => ({ ...tanpaId(t), editionId: baru }))
      : opsi.topikContoh
        ? TOPIK_CONTOH.map(([title, brief], sort) => ({
            editionId: baru,
            title,
            brief,
            cap: 6,
            sort,
          }))
        : [];
  if (topik.length > 0) await tx.insert(recTubesTopic).values(topik);

  let rujukan = new Map<number, number>();
  if (s.references.length > 0) {
    const dibuat = await tx
      .insert(recReference)
      .values(s.references.map((r) => ({ ...tanpaId(r), editionId: baru })))
      .returning({ id: recReference.id });
    rujukan = petakan(s.references, dibuat);
  }
  const bagian = s.partRefs.filter((p) => rujukan.has(p.referenceId));
  if (bagian.length > 0)
    await tx
      .insert(recPartRef)
      .values(
        bagian.map((p) => ({ ...p, editionId: baru, referenceId: rujukan.get(p.referenceId)! })),
      );
  if (s.committee.length > 0)
    await tx
      .insert(recCommittee)
      .values(s.committee.map((c) => ({ ...tanpaId(c), editionId: baru })));

  // Exam settings keep the source's values but get their own salt, so no draw of the real exam repeats here.
  if (s.config)
    await tx.insert(recExamConfig).values({
      editionId: baru,
      config: s.config,
      salt: randomBytes(16).toString("hex"),
      lockedAt: null,
      updatedBy: nim,
    });

  // A practice bank carried over from the last practice: shown and voided marks belong to what was dealt, so they start clean.
  const hidup = s.questions.filter((q) => q.voidedAt === null);
  if (hidup.length > 0)
    await tx.insert(recQuestion).values(
      hidup.map((q) => ({
        ...tanpaId(q),
        editionId: baru,
        shownAt: null,
        refs:
          q.refs?.map((r) => rujukan.get(r)).filter((r): r is number => r !== undefined) ?? q.refs,
      })),
    );
  if (s.problems.length > 0)
    await tx
      .insert(recCProblem)
      .values(s.problems.map((p) => ({ ...tanpaId(p), editionId: baru, shownAt: null })));
  return { acara, rujukan };
}

/** Moves the practice slots and Tubes sessions of an edition by whole days (Lompat Tahap keeps them level with the events). */
export async function geserWaktu(tx: Db, edisiId: number, hari: number): Promise<void> {
  if (hari === 0) return;
  const geser = sql`${hari} * interval '1 day'`;
  await tx
    .update(recSlot)
    .set({
      startsAt: sql`${recSlot.startsAt} + ${geser}`,
      endsAt: sql`${recSlot.endsAt} + ${geser}`,
    })
    .where(eq(recSlot.editionId, edisiId));
  await tx
    .update(recTubesSession)
    .set({
      startsAt: sql`${recTubesSession.startsAt} + ${geser}`,
      endsAt: sql`${recTubesSession.endsAt} + ${geser}`,
    })
    .where(eq(recTubesSession.editionId, edisiId));
}
