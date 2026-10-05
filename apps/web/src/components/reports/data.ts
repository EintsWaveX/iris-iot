/** Reports data in the browser (Phase 9 Stage 6b): the session rows every
 *  tab reads, the incident log lines as sentences, and exports. */
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson, tanggalPanjang } from "../../lib/app";
import { unduhCsv } from "../../lib/csv";
import { slotToMulai } from "../../lib/jadwal";
import { kelompokLabel, menitLabel } from "../../lib/labels";
import type { Kejadian, SesiLaporan } from "../../lib/laporan";
import type { Lang } from "../../lib/kelas";
import { unduhPdf, type BagianPdf } from "../../lib/pdf";
import { unduhXlsx } from "../../lib/xlsx";
import { useSiaran } from "../../lib/siaran";

/** `tot`: Mode TOT's practice sessions instead of the real ones; the API
 *  never mixes the two. */
export function useRiwayat(enabled = true, tot = false) {
  const [rows, setRows] = useState<SesiLaporan[] | null>(null);
  const [fail, setFail] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await getJson<{ ok: boolean; sesi?: SesiLaporan[] }>(
        tot ? "/api/session/riwayat?tot=1" : "/api/session/riwayat",
      );
      if (!d.ok) throw new Error("riwayat");
      setRows(d.sesi ?? []);
      setFail(false);
    } catch {
      setFail(true);
    }
  }, [tot]);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);
  useSiaran(["sesi", "nilai", "laporan", "umpan", "bayar"], () => void load(), enabled);
  return { rows, fail, load };
}

export function kirim<T = { ok: boolean; kode?: string }>(url: string, body: unknown) {
  return postJson<T & { ok: boolean; kode?: string }>(url, body).catch(
    () => ({ ok: false, kode: "jaringan" }) as T & { ok: boolean; kode?: string },
  );
}

/** "Kamis, 1 Oktober 2026 · Slot 3" (or the start time for a makeup). */
export function labelSesi(s: Pick<SesiLaporan, "tanggal" | "slot" | "mulai">, lang: Lang): string {
  const tgl = tanggalPanjang(s.tanggal, lang);
  if (!s.slot) return `${tgl} · ${s.mulai}`;
  return `${tgl} · ${lang === "zh" ? "时段" : "Slot"} ${s.slot}`;
}

export function jamSlot(slot: number | null, mulai?: string): string {
  return (slot ? slotToMulai(slot) : null) ?? mulai ?? "";
}

/* -------------------------------------------------------- incident lines */

export type TagKejadian = "sistem" | "asisten" | "pasangan" | "seelabs" | "tangan";

const KJ = {
  id: {
    mulai: (who: string) => `Sesi dimulai oleh ${who}.`,
    akhiri: (who: string) => `Sesi diakhiri oleh ${who}.`,
    batal: (who: string) => `Sesi dibatalkan oleh ${who}.`,
    lanjutkan: (who: string) => `Sesi dilanjutkan oleh ${who}.`,
    durasi: (who: string, a: string, b: string) => `${who} mengubah lama sesi dari ${a} jadi ${b}.`,
    siarkan: (who: string, p: string) => `Pengumuman dikirim oleh ${who}: "${p}"`,
    pasangan: (ke: string, g: string, awal: string, al: string) =>
      `${ke} melakukan penilaian ke ${g}${awal ? ` (berubah dari pemasangan awal: ${awal} dengan ${g})` : ""}.${al ? ` Alasan: ${al}` : ""}`,
    lepas: (g: string, al: string) => `${g} dilepas dari asistennya.${al ? ` Alasan: ${al}` : ""}`,
    akun: (who: string, g: string, akun: string) =>
      akun
        ? `${who} memakai akun SeeLabs ${akun} untuk ${g}. Transfernya tercatat di Tim, Pembayaran.`
        : `${who} melepas akun SeeLabs pinjaman untuk ${g}.`,
    tangan: (g: string) => `${g} angkat tangan.`,
    jawab: (g: string, who: string, m: string) =>
      `Angkat tangan ${g} dijawab ${who}${m ? ` ${m} kemudian` : ""}.`,
  },
  en: {
    mulai: (who: string) => `Session started by ${who}.`,
    akhiri: (who: string) => `Session ended by ${who}.`,
    batal: (who: string) => `Session cancelled by ${who}.`,
    lanjutkan: (who: string) => `Session resumed by ${who}.`,
    durasi: (who: string, a: string, b: string) =>
      `${who} changed the session length from ${a} to ${b}.`,
    siarkan: (who: string, p: string) => `Announcement sent by ${who}: "${p}"`,
    pasangan: (ke: string, g: string, awal: string, al: string) =>
      `${ke} scores ${g}${awal ? ` (changed from the original pairing: ${awal} with ${g})` : ""}.${al ? ` Reason: ${al}` : ""}`,
    lepas: (g: string, al: string) => `${g} lost its assistant.${al ? ` Reason: ${al}` : ""}`,
    akun: (who: string, g: string, akun: string) =>
      akun
        ? `${who} uses ${akun}'s SeeLabs account for ${g}. The transfer is listed on Team, Payments.`
        : `${who} stopped borrowing a SeeLabs account for ${g}.`,
    tangan: (g: string) => `${g} raised a hand.`,
    jawab: (g: string, who: string, m: string) =>
      `${g}'s raised hand answered by ${who}${m ? ` ${m} later` : ""}.`,
  },
  zh: {
    mulai: (who: string) => `${who} 开始了这节课。`,
    akhiri: (who: string) => `${who} 结束了这节课。`,
    batal: (who: string) => `${who} 取消了这节课。`,
    lanjutkan: (who: string) => `${who} 继续了这节课。`,
    durasi: (who: string, a: string, b: string) => `${who} 把课时从 ${a} 改成 ${b}。`,
    siarkan: (who: string, p: string) => `${who} 发了公告：“${p}”`,
    pasangan: (ke: string, g: string, awal: string, al: string) =>
      `${ke} 给${g}打分${awal ? `（原来的配对：${awal} 带${g}）` : ""}。${al ? `原因：${al}` : ""}`,
    lepas: (g: string, al: string) => `${g}没有助教了。${al ? `原因：${al}` : ""}`,
    akun: (who: string, g: string, akun: string) =>
      akun
        ? `${who} 用 ${akun} 的 SeeLabs 账号提交${g}。转账记在团队的付款里。`
        : `${who} 不再为${g}借用 SeeLabs 账号。`,
    tangan: (g: string) => `${g}举手了。`,
    jawab: (g: string, who: string, m: string) => `${who}${m ? ` ${m}后` : ""}回应了${g}的举手。`,
  },
};

/** One incident line as its tag and sentence. */
export function kalimatKejadian(
  k: Kejadian,
  lang: Lang,
  who: (nim: string | null | undefined) => string,
): { tag: TagKejadian; teks: string } {
  const w = KJ[lang];
  const d = k.detail as Record<string, unknown>;
  const g = Number.isInteger(d.nomor)
    ? kelompokLabel(d.nomor as number, lang)
    : lang === "en"
      ? "A group"
      : lang === "zh"
        ? "一个组"
        : "Sebuah kelompok";
  const by = who(k.aktorNim);
  switch (k.jenis) {
    case "catatan":
      return { tag: "asisten", teks: String(d.teks ?? "") };
    case "mulai":
      return { tag: "sistem", teks: w.mulai(by) };
    case "akhiri":
      return { tag: "sistem", teks: w.akhiri(by) };
    case "batal":
      return { tag: "sistem", teks: w.batal(by) };
    case "lanjutkan":
      return { tag: "sistem", teks: w.lanjutkan(by) };
    case "durasi":
      return {
        tag: "sistem",
        teks: w.durasi(by, menitLabel(Number(d.dari), lang), menitLabel(Number(d.ke), lang)),
      };
    case "siarkan":
      return { tag: "sistem", teks: w.siarkan(by, String(d.pesan ?? "")) };
    case "pasangan": {
      const al = typeof d.alasan === "string" ? d.alasan : "";
      if (!d.ke) return { tag: "pasangan", teks: w.lepas(g, al) };
      const awal = d.awal && d.awal !== d.ke ? who(d.awal as string) : "";
      return { tag: "pasangan", teks: w.pasangan(who(d.ke as string), g, awal, al) };
    }
    case "akun_seelabs":
      return {
        tag: "seelabs",
        teks: w.akun(by, g, d.akun ? who(d.akun as string) : ""),
      };
    case "tangan":
      return { tag: "tangan", teks: w.tangan(g) };
    case "tangan_jawab": {
      const det = Number(d.detik);
      const m = Number.isFinite(det) ? menitLabel(Math.max(1, Math.round(det / 60)), lang) : "";
      return { tag: "tangan", teks: w.jawab(g, by, m) };
    }
    default:
      return { tag: "sistem", teks: k.jenis.replace(/_/g, " ") };
  }
}

/** "13:04" (or "13:04:02") in lab time, the mockup's clock format in
 *  every language. */
export function jamWib(iso: string | Date, detik = false): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(detik ? { second: "2-digit" } : {}),
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
}

/** The lab-time calendar date of an instant, "2026-10-01". */
export function tanggalWib(iso: string | Date): string {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function jamKejadian(k: Pick<Kejadian, "pada">, _lang?: Lang): string {
  return jamWib(k.pada);
}

/* ---------------------------------------------------------------- export */

export type Format = "xlsx" | "csv" | "pdf";

export async function ekspor(
  format: Format,
  nama: string,
  judul: string,
  meta: string,
  kepala: string[],
  baris: (string | number | null)[][],
  lang: Lang,
): Promise<void> {
  if (format === "xlsx") return unduhXlsx(nama, kepala, baris, judul.slice(0, 31));
  if (format === "csv") {
    unduhCsv(
      `${nama}.csv`,
      kepala,
      baris.map((r) => r.map((c) => c ?? "")),
    );
    return;
  }
  const bagian: BagianPdf[] = [
    { k: "judul", teks: judul },
    { k: "meta", teks: meta },
    { k: "tabel", kepala, baris },
  ];
  return unduhPdf(nama, bagian, lang);
}
