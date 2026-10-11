/**
 * Persiapan › Skema › Tabel Pin: each module's pin table, the pin cells
 * editable (component names stay as bundled). A pin the sketch declares
 * shows its constant; saving rewrites it in the code everywhere the site
 * shows code (src/lib/pin-kode.ts), and every Pin dan Skema card follows.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowCounterClockwiseIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import Nil from "../../ui/Nil";
import Pill from "../../ui/Pill";
import { dict, MODUL_NAMA, postJson } from "../../../lib/app";
import { modulLabel } from "../../../lib/labels";
import { angkaPin, cekBarisPin, tautanSel, type BarisPin } from "../../../lib/pin-kode";
import { ambilPin, usePin } from "../../module/usePin";
import type { Lang } from "../../../lib/kelas";

const T = dict({
  id: {
    title: "Tabel Pin",
    sub: "Ubah pin di sini: tabel dan diagram di setiap kartu Pin dan Skema ikut berubah, begitu juga konstanta pinnya di kode.",
    part: "Komponen",
    pin: "Pin",
    code: "Di kode",
    changed: "Diubah",
    reset: "Kembalikan ke Bawaan",
    save: "Simpan Pin",
    saved: (m: string) => `Pin ${m} disimpan. Kode ikut berubah.`,
    restored: (m: string) => `Pin ${m} kembali ke bawaan.`,
    bad: "Pin yang dipakai kode harus berupa GPIO, misalnya GPIO4 atau GP27.",
    fail: "Gagal menyimpan. Coba lagi.",
  },
  en: {
    title: "Pin Tables",
    sub: "Change pins here: the table and diagram on every Pin dan Skema card follow, and so do the pin constants in the code.",
    part: "Part",
    pin: "Pin",
    code: "In the code",
    changed: "Changed",
    reset: "Restore Built-in",
    save: "Save Pins",
    saved: (m: string) => `${m} pins saved. The code follows.`,
    restored: (m: string) => `${m} pins back to built-in.`,
    bad: "A pin the code uses must be a GPIO, such as GPIO4 or GP27.",
    fail: "Couldn't save. Try again.",
  },
  zh: {
    title: "引脚表",
    sub: "在这里修改引脚：每张引脚与电路图卡片的表格和接线图都会跟着变，代码里的引脚常量也一样。",
    part: "元件",
    pin: "引脚",
    code: "代码中",
    changed: "已修改",
    reset: "恢复默认",
    save: "保存引脚",
    saved: (m: string) => `${m}的引脚已保存，代码同步更新。`,
    restored: (m: string) => `${m}的引脚已恢复默认。`,
    bad: "代码用到的引脚必须是 GPIO，例如 GPIO4 或 GP27。",
    fail: "保存失败，请再试一次。",
  },
});

export default function PinEditor({ lang, boleh }: { lang: Lang; boleh: boolean }) {
  const t = T[lang];
  const data = usePin();
  if (!data) return <span className="skeleton" style={{ height: 240 }} />;
  return (
    <section className="panel pinedit">
      <div className="stack stack--sm">
        <h2 className="panel__title">{t.title}</h2>
        <span className="hint">{t.sub}</span>
      </div>
      <div className="pinedit__grid">
        {[1, 2, 3, 4].map((m) =>
          data.bawaan[String(m)] ? (
            <PinCard
              key={m}
              lang={lang}
              modul={m}
              boleh={boleh}
              bawaan={data.bawaan[String(m)]}
              simpan={data.pin[String(m)] ?? null}
            />
          ) : null,
        )}
      </div>
    </section>
  );
}

function PinCard({
  lang,
  modul,
  boleh,
  bawaan,
  simpan,
}: {
  lang: Lang;
  modul: number;
  boleh: boolean;
  bawaan: BarisPin;
  simpan: BarisPin | null;
}) {
  const t = T[lang];
  const kini = simpan ?? bawaan;
  const [baris, setBaris] = useState<BarisPin>(kini);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  // A save from elsewhere shows at once, unless this card has edits
  const key = JSON.stringify(kini);
  const ubah = JSON.stringify(baris) !== key;
  useEffect(() => {
    if (!ubah) setBaris(kini);
  }, [key]);

  const salah = new Set(cekBarisPin(modul, bawaan, baris));
  const nama = modulLabel(modul, lang);

  async function kirim(isi: BarisPin | null) {
    setTried(true);
    if (isi && salah.size) return window.Toast?.show(t.bad, "warn");
    setBusy(true);
    const r = await postJson<{ ok: boolean }>("/api/presentasi/pin-simpan", {
      modul,
      baris: isi,
    }).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) return window.Toast?.show(t.fail, "danger");
    window.Toast?.show(isi ? t.saved(nama) : t.restored(nama), "ok");
    setTried(false);
    if (!isi) setBaris(bawaan);
    void ambilPin(true);
  }

  // One row per pin cell: a table with two column pairs gives two rows each
  const sel: { r: number; k: number }[] = [];
  bawaan.forEach((row, r) => row.forEach((_, k) => k % 2 === 1 && sel.push({ r, k })));

  return (
    <div className="pinedit__card" style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}>
      <div className="row row--between">
        <span className="row" style={{ gap: 8 }}>
          <Pill modul={modul}>{nama}</Pill>
          <b className="truncate">{MODUL_NAMA[modul]}</b>
        </span>
        {simpan && <Pill tone="accent">{t.changed}</Pill>}
      </div>
      <table className="pinedit__table">
        <thead>
          <tr>
            <th scope="col">{t.part}</th>
            <th scope="col">{t.pin}</th>
            <th scope="col">{t.code}</th>
          </tr>
        </thead>
        <tbody>
          {sel.map(({ r, k }) => {
            const tautan = tautanSel(modul, r, k);
            const v = baris[r]?.[k] ?? "";
            const bad = tried && salah.has(`${r}:${k}`);
            return (
              <tr key={`${r}:${k}`}>
                <td>{bawaan[r][k - 1]}</td>
                <td>
                  <input
                    className="field__input mono pinedit__in"
                    value={v}
                    disabled={!boleh || busy}
                    aria-label={`${t.pin} ${bawaan[r][k - 1]}`}
                    aria-invalid={bad || undefined}
                    data-invalid={bad ? "yes" : undefined}
                    maxLength={40}
                    onChange={(e) =>
                      setBaris((b) =>
                        b.map((row, i) =>
                          i === r ? row.map((c, j) => (j === k ? e.target.value : c)) : row,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  {tautan ? (
                    <span className="mono hint">
                      {tautan.jenis === "adc"
                        ? `ADC(${angkaPin(v) ?? "?"})`
                        : `${tautan.nama} = ${angkaPin(v) ?? "?"}`}
                    </span>
                  ) : (
                    <Nil lang={lang} dot />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {boleh && (
        <div className="pinedit__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || (!simpan && !ubah)}
            onClick={() => (simpan ? void kirim(null) : setBaris(bawaan))}
          >
            <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
            {t.reset}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !ubah}
            onClick={() => void kirim(baris)}
          >
            <FloppyDiskIcon size={18} aria-hidden="true" />
            {t.save}
          </button>
        </div>
      )}
    </div>
  );
}
