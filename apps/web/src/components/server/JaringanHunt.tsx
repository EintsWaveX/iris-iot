/**
 * The Module 4 network switch (2026-11-11): IRIS_IOT (the PC's hotspot) or
 * the internet (phone hotspots, hunt.irisiotlab.com). One control, two homes:
 * a card on the Server page's Settings and inline in the Konsol's Mulai
 * Perburuan dialog, so the Asisten sees and can change it right where the
 * hunt starts (the guided fallback when the internet side isn't ready).
 * Changing it is refused once the hunt has started (api/_lib/jaringan-api.ts).
 */
import { useState } from "react";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { jaringanValid, type Jaringan } from "../../lib/jaringan";
import SegmentedControl from "../ui/SegmentedControl";
import { J } from "./jaringanStrings";

interface Keadaan {
  ok: boolean;
  jaringan: Jaringan;
  terkunci: boolean;
  sesiModul4: boolean;
}

export default function JaringanHunt({ lang, kartu = false }: { lang: Lang; kartu?: boolean }) {
  const t = J[lang];
  const baca = usePoll(
    () => getJson<Keadaan>("/api/session/jaringan"),
    60_000,
    true,
    ["sesi", "buru", "server"],
    0,
    "jaringan-hunt",
  );
  const [sibuk, setSibuk] = useState(false);
  const data = baca.data;
  const sekarang = data && jaringanValid(data.jaringan) ? data.jaringan : null;

  async function pilih(baru: string) {
    if (!jaringanValid(baru) || baru === sekarang || sibuk || data?.terkunci) return;
    setSibuk(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/jaringan", {
      jaringan: baru,
    }).catch(() => ({ ok: false, kode: undefined }) as { ok: boolean; kode?: string });
    setSibuk(false);
    if (r.ok) window.Toast?.show(t.saved, "ok");
    else window.Toast?.show(r.kode === "hunt_berjalan" ? t.locked : t.fail, "danger");
    baca.refresh();
  }

  const isi = (
    <div className="stack stack--sm">
      <SegmentedControl
        fill
        value={sekarang ?? ""}
        onValueChange={(v) => void pilih(v)}
        aria-label={t.label}
        options={[
          { value: "iris_iot", label: t.irisIot },
          { value: "internet", label: t.internet },
        ]}
      />
      <p className="hint" aria-live="polite">
        {data?.terkunci
          ? t.lockedHint
          : sekarang === "iris_iot"
            ? t.irisIotHint
            : sekarang === "internet"
              ? t.internetHint
              : ""}
      </p>
      {data?.sesiModul4 && !data.terkunci && <p className="hint">{t.redownload}</p>}
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
