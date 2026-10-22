/** The lender picker for one group (a second group, or any group of a third
 *  session that day), shared by the running session's score tab and the
 *  SeeLabs page an ended session opens from "Pilih Akun SeeLabs". */
import { useState } from "react";
import { HandCoinsIcon } from "@phosphor-icons/react";
import Dropdown from "../../ui/Dropdown";
import { kelompokLabel } from "../../../lib/labels";
import { useDirektori } from "../../../lib/people";
import type { Lang } from "../../../lib/kelas";
import { kirimSeelabs, type SeelabsData } from "./data";
import { SL, pesanSl } from "./strings";

/** What a group needs, from where `meNim` stands in this session. */
export function keperluanAkun(seelabs: SeelabsData | null, meNim: string, nomor: number) {
  const sg = seelabs?.kelompok.find((x) => x.nomor === nomor) ?? null;
  const punyaku = seelabs
    ? seelabs.kelompok.filter((x) => x.penilai === meNim).map((x) => x.nomor)
    : [];
  const mine = !!sg && sg.penilai === meNim;
  // My account already carries two earlier sessions today: every group of
  // this one needs a lender, the lowest numbered included.
  const penuh = mine && !!seelabs?.penuh.includes(meNim);
  const kedua = mine && punyaku.indexOf(nomor) > 0;
  return { sg, punyaku, penuh, kedua, perlu: penuh || kedua };
}

/** The groups of this session `meNim` has to find a lender for. */
export function kelompokButuhPinjam(seelabs: SeelabsData | null, meNim: string): number[] {
  return (seelabs?.kelompok ?? [])
    .map((g) => g.nomor)
    .filter((n) => keperluanAkun(seelabs, meNim, n).perlu);
}

export function AkunPicker({
  lang,
  seelabs,
  nomor,
  meNim,
  onChanged,
}: {
  lang: Lang;
  seelabs: SeelabsData;
  nomor: number;
  meNim: string;
  onChanged: () => void;
}) {
  const t = SL[lang];
  const dir = useDirektori();
  const [busy, setBusy] = useState(false);
  const { sg } = keperluanAkun(seelabs, meNim, nomor);
  if (!sg) return null;
  const label = kelompokLabel(nomor, lang);
  // Whoever this group's holder covers is offered first; the rest in the
  // usual order.
  const saran = seelabs.saran?.[nomor];
  const pemberi = saran
    ? [saran, ...seelabs.pemberi.filter((nim) => nim !== saran)]
    : seelabs.pemberi;

  async function pilih(v: string) {
    const akun = v === "none" ? null : v;
    if (akun === (sg!.pinjam ? sg!.akun : null)) return;
    setBusy(true);
    try {
      const r = await kirimSeelabs({
        aksi: "akun",
        sesiId: seelabs.sesi.id,
        kelompok: nomor,
        akun,
      });
      if (!r.ok) {
        window.Toast?.show(pesanSl(t, r.kode), "danger");
        return;
      }
      window.Toast?.show(
        akun ? t.lenderLogged(dir.nama(meNim), dir.nama(akun), label) : t.lenderCleared(label),
        "ok",
      );
      onChanged();
    } catch {
      window.Toast?.show(t.codeFallback, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dropdown
      id={`see-akun-${nomor}`}
      label={t.accountFor(label)}
      value={sg.pinjam && sg.akun ? sg.akun : "none"}
      disabled={busy}
      onChange={(v) => void pilih(v)}
      options={[
        { value: "none", label: t.pickLender },
        ...(sg.pinjam && sg.akun && !seelabs.pemberi.includes(sg.akun)
          ? [{ value: sg.akun, label: dir.nama(sg.akun) }]
          : []),
        ...pemberi.map((nim) => ({
          value: nim,
          label: dir.nama(nim),
          ...(nim === saran ? { note: t.lenderSuggested } : {}),
        })),
        ...seelabs.pemberiTolak
          .filter((x) => !(x.alasan === "dipinjam" && x.kelompok === nomor))
          .map((x) => ({
            value: x.nim,
            label: dir.nama(x.nim),
            disabled: true,
            note:
              x.alasan === "pegang"
                ? t.lenderWhyHold
                : x.alasan === "dua_sesi"
                  ? t.lenderWhyCap
                  : t.lenderWhyLent(kelompokLabel(x.kelompok ?? 0, lang)),
          })),
      ]}
    />
  );
}

/** The SeeLabs page's card: one picker per group that needs a lender. */
export default function AkunPanel({
  lang,
  seelabs,
  meNim,
  onChanged,
}: {
  lang: Lang;
  seelabs: SeelabsData | null;
  meNim: string;
  onChanged: () => void;
}) {
  const t = SL[lang];
  const butuh = kelompokButuhPinjam(seelabs, meNim);
  if (!seelabs || butuh.length === 0) return null;
  const penuh = seelabs.penuh.includes(meNim);
  return (
    <div className="banner banner--warn dmbanner">
      <HandCoinsIcon size={20} aria-hidden="true" />
      <div className="stack stack--sm grow">
        <b>{penuh ? t.capTitle : t.holdTitle(butuh.length)}</b>
        <span>{penuh ? t.capBody : t.panelBody}</span>
        {butuh.map((n) => (
          <AkunPicker
            key={n}
            lang={lang}
            seelabs={seelabs}
            nomor={n}
            meNim={meNim}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}
