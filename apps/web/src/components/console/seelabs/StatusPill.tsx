/** A group's SeeLabs status as a pill (Terkirim, Berubah, Siap, Butuh Akun,
 *  Kosong). The status itself comes from the robot's saves and reads. */
import type { StatusSeelabs } from "../../../lib/seelabs";
import type { SeelabsStrings } from "./strings";

const TONE: Record<StatusSeelabs, string> = {
  terkirim: "ok",
  berubah: "warn",
  siap: "accent",
  butuh_akun: "warn",
  kosong: "",
};

export default function StatusPill({ t, status }: { t: SeelabsStrings; status: StatusSeelabs }) {
  return (
    <span className={`pill${TONE[status] ? ` pill--${TONE[status]}` : ""}`}>
      {t.status[status]}
    </span>
  );
}
