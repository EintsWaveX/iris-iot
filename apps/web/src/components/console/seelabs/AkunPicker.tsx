/** The lender picker for one group (a second group, or any group of a third
 *  session that day), shared by the running session's score tab and the
 *  SeeLabs page an ended session opens from "Pilih Akun SeeLabs". */
import { useState } from "react";
import { HandCoinsIcon } from "@phosphor-icons/react";
import Confirm from "../../ui/Confirm";
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

/** The groups `meNim` holds that SeeLabs has not been seen holding, for the
 *  "Sudah Kuinput Sendiri" mark (a group a robot save or read-back saved is
 *  left alone; one already marked stays listed so the mark can be taken back). */
export function kelompokBisaDitandai(seelabs: SeelabsData | null, meNim: string): number[] {
  return (seelabs?.kelompok ?? [])
    .filter((g) => g.penilai === meNim && (g.status !== "terkirim" || !!g.manual))
    .map((g) => g.nomor);
}

const jamWib = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "";

/** One group's "Sudah Kuinput Sendiri" row: mark it (after a confirm) or take the mark back. */
function TandaManual({
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
  const [tanya, setTanya] = useState(false);
  const { sg, perlu } = keperluanAkun(seelabs, meNim, nomor);
  if (!sg) return null;
  const label = kelompokLabel(nomor, lang);
  // The account it went through: the lender picked, else the scorer's own.
  const akun = perlu && sg.pinjam ? sg.akun : null;
  const tanpaPemberi = perlu && !akun;

  async function kirim(manual: boolean): Promise<boolean> {
    try {
      const r = await kirimSeelabs({
        aksi: "manual",
        sesiId: seelabs.sesi.id,
        kelompok: nomor,
        manual,
        akun,
      });
      if (!r.ok) {
        window.Toast?.show(pesanSl(t, r.kode), "danger");
        return false;
      }
      window.Toast?.show(manual ? t.manualMarked(label) : t.manualUnmarked(label), "ok");
      onChanged();
      return true;
    } catch {
      window.Toast?.show(t.codeFallback, "danger");
      return false;
    }
  }

  return (
    <div className="seeline">
      <span className="grow">
        <b>{label}</b>
        {sg.manual ? ` · ${t.manualOn(jamWib(sg.manual.pada))}` : ""}
        {!sg.manual && tanpaPemberi ? ` · ${t.manualNeedsLender}` : ""}
      </span>
      {sg.manual ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void kirim(false)}>
          {t.manualUndo}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={tanpaPemberi}
          onClick={() => setTanya(true)}
        >
          {t.manualBtn}
        </button>
      )}
      <Confirm
        open={tanya}
        onOpenChange={setTanya}
        title={t.manualConfirmTitle(label)}
        body={t.manualConfirmBody(akun ? dir.nama(akun) : "")}
        confirmLabel={t.manualConfirm}
        tone="primary"
        lang={lang}
        onConfirm={() => kirim(true)}
      />
    </div>
  );
}

/** The SeeLabs page's cards: a picker per group that needs a lender, and the
 *  "Sudah Kuinput Sendiri" marks for groups typed into SeeLabs by hand. */
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
  const bisa = kelompokBisaDitandai(seelabs, meNim);
  if (!seelabs || (butuh.length === 0 && bisa.length === 0)) return null;
  const penuh = seelabs.penuh.includes(meNim);
  return (
    <>
      {butuh.length > 0 && (
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
      )}
      {bisa.length > 0 && (
        <div className="stack stack--sm">
          <b>{t.manualTitle}</b>
          <span className="hint">{t.manualBody}</span>
          {bisa.map((n) => (
            <TandaManual
              key={n}
              lang={lang}
              seelabs={seelabs}
              nomor={n}
              meNim={meNim}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </>
  );
}
