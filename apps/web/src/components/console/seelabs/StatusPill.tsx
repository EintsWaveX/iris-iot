/** A group's SeeLabs status as a pill (Terkirim, Berubah, Siap, Butuh Akun,
 *  Kosong). The status itself comes from the robot's saves and reads. */
import { jamMenit } from "../../../lib/app";
import type { StatusSeelabs } from "../../../lib/seelabs";
import type { SeelabsStrings } from "./strings";

const TONE: Record<StatusSeelabs, string> = {
  terkirim: "ok",
  berubah: "warn",
  siap: "accent",
  butuh_akun: "warn",
  kosong: "",
};

export default function StatusPill({
  t,
  status,
  pada,
}: {
  t: SeelabsStrings;
  status: StatusSeelabs;
  /** When the robot last saved the group; Terkirim says it. */
  pada?: string | null;
}) {
  return (
    <span className={`pill${TONE[status] ? ` pill--${TONE[status]}` : ""}`}>
      {t.status[status]}
      {status === "terkirim" && pada ? ` ${jamMenit(pada)}` : ""}
    </span>
  );
}
