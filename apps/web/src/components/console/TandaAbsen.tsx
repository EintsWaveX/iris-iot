/**
 * The Tidak Hadir switch's behaviour, shared by the inspector and the Tabel
 * Nilai: marking sets every field to 0 (asking first when real scores are
 * already in), unmarking removes the zeros. Both say what happened.
 */
import { useState } from "react";
import Confirm from "../ui/Confirm";
import { Checkbox } from "../ui/Controls";
import type { Lang } from "../../lib/kelas";
import type { Strings } from "./strings";
import type { NilaiLive } from "./data";
import type { NilaiAnggota } from "./types";

/**
 * The Tidak Hadir mark as a checkbox that says so: ticked means absent. A
 * switch left it unclear which way "on" meant (user, 2026-10-22).
 */
export function CekAbsen({
  t,
  nama,
  absen,
  disabled,
  onChange,
}: {
  t: Strings;
  nama: string;
  absen: boolean;
  disabled?: boolean;
  onChange: (absen: boolean) => void;
}) {
  return (
    <Checkbox
      checked={absen}
      label={t.absen}
      ariaLabel={t.absenFor(nama)}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function useTandaAbsen(
  t: Strings,
  lang: Lang,
  nilai: NilaiLive,
  holder: (a: NilaiAnggota) => string,
) {
  const [tanya, setTanya] = useState<NilaiAnggota | null>(null);

  async function kirim(a: NilaiAnggota, on: boolean) {
    const r = await nilai.setAbsen(a.nim, on);
    if (r === "ok") window.Toast?.show(on ? t.absenOn(a.nama) : t.absenOff(a.nama), "ok");
    else if (r === "owner") window.Toast?.show(t.notOwner(holder(a)), "danger");
    else window.Toast?.show(t.fail, "danger");
  }

  function ubah(a: NilaiAnggota, on: boolean) {
    const adaNilai = Object.values(a.skor).some((v) => v != null && v !== 0);
    if (on && adaNilai) setTanya(a);
    else void kirim(a, on);
  }

  const dialog = (
    <Confirm
      open={tanya !== null}
      onOpenChange={(o) => !o && setTanya(null)}
      title={t.absenTitle}
      body={tanya ? t.absenBody(tanya.nama) : ""}
      confirmLabel={t.absenConfirm}
      lang={lang}
      onConfirm={async () => {
        if (tanya) await kirim(tanya, true);
      }}
    />
  );

  return { ubah, dialog };
}
