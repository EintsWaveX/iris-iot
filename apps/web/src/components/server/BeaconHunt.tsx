/**
 * The Module 4 board layout (2026-11-13): how many Beacons the lab uses, and which groups each one
 * serves (src/lib/beacon-bersama.ts). One control, two homes like JaringanHunt: a card on the
 * Server page's Settings and inline in the Konsol's Mulai Perburuan dialog. Changing it is refused
 * once the hunt has started (api/_lib/beacon-api.ts).
 */
import { useState } from "react";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import {
  bacaBeacon,
  jumlahBeaconEfektif,
  kelompokDilayani,
  type PengaturanBeacon,
  type PolaBeacon,
} from "../../lib/beacon-bersama";
import SegmentedControl from "../ui/SegmentedControl";
import { Stepper } from "../ui/Controls";
import { B } from "./beaconStrings";

interface Keadaan {
  ok: boolean;
  jumlah: number | null;
  pola: PolaBeacon;
  jumlahKelompok: number;
  terkunci: boolean;
  sesiModul4: boolean;
}

export default function BeaconHunt({ lang, kartu = false }: { lang: Lang; kartu?: boolean }) {
  const t = B[lang];
  const baca = usePoll(
    () => getJson<Keadaan>("/api/session/beacons"),
    60_000,
    true,
    ["sesi", "buru", "server"],
    0,
    "beacon-hunt",
  );
  const [sibuk, setSibuk] = useState(false);
  const data = baca.data;
  const p: PengaturanBeacon | null = data
    ? bacaBeacon({ jumlah: data.jumlah, pola: data.pola })
    : null;
  const G = data?.jumlahKelompok ?? 0;
  const dibagi = !!p && p.jumlah !== null && p.jumlah < G;

  async function simpan(baru: PengaturanBeacon) {
    if (!p || sibuk || data?.terkunci) return;
    if (baru.jumlah === p.jumlah && baru.pola === p.pola) return;
    setSibuk(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/beacons", baru).catch(
      () => ({ ok: false, kode: undefined }) as { ok: boolean; kode?: string },
    );
    setSibuk(false);
    if (r.ok) window.Toast?.show(t.saved, "ok");
    else window.Toast?.show(r.kode === "hunt_berjalan" ? t.locked : t.fail, "danger");
    baca.refresh();
  }

  // One line per Beacon: which groups it serves
  const garis: string[] = [];
  if (p && dibagi) {
    const dilihat = new Set<number>();
    for (let g = 1; g <= G && garis.length < jumlahBeaconEfektif(p, G); g++) {
      if (dilihat.has(g)) continue;
      const lingkup = kelompokDilayani(g, G, p);
      lingkup.forEach((x) => dilihat.add(x));
      garis.push(t.line(garis.length + 1, lingkup));
    }
  }

  const isi = (
    <div className="stack stack--sm">
      {p && G > 1 && (
        <>
          <SegmentedControl
            fill
            value={p.jumlah === null ? "satu" : "bagi"}
            onValueChange={(v) =>
              void simpan({ ...p, jumlah: v === "satu" ? null : Math.max(1, G - 1) })
            }
            aria-label={t.label}
            options={[
              { value: "satu", label: t.perGroup },
              { value: "bagi", label: t.shared },
            ]}
          />
          {p.jumlah !== null && (
            <>
              <Stepper
                value={Math.min(p.jumlah, G)}
                onChange={(v) => void simpan({ ...p, jumlah: v })}
                min={1}
                max={G}
                label={t.label}
                lessLabel={t.less}
                moreLabel={t.more}
                disabled={!!data?.terkunci || sibuk}
              />
              <SegmentedControl
                fill
                value={p.pola}
                onValueChange={(v) => void simpan({ ...p, pola: v as PolaBeacon })}
                aria-label={t.pattern}
                options={[
                  { value: "selang", label: t.interleaved },
                  { value: "berurutan", label: t.contiguous },
                ]}
              />
            </>
          )}
        </>
      )}
      {garis.length > 0 && (
        <ul className="hint" aria-live="polite">
          {garis.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <p className="hint" aria-live="polite">
        {data?.terkunci ? t.lockedHint : dibagi ? t.sharedHint : t.ownHint}
      </p>
      {data?.sesiModul4 && !data.terkunci && dibagi && <p className="hint">{t.redownload}</p>}
    </div>
  );

  if (!kartu) return isi;
  return (
    <section className="panel">
      <div className="stack stack--sm">
        <h2 className="panel__title">{t.title}</h2>
        <span className="hint">{t.sub}</span>
      </div>
      {isi}
    </section>
  );
}
