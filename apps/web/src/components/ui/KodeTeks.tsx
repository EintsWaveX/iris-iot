/**
 * A sentence with its code in the code editor's font (lib/kode-teks.ts):
 * "getService() mencari layanan ... GROUP_ID ...".
 */
import { useMemo } from "react";
import { pecahKode } from "../../lib/kode-teks";

export default function KodeTeks({ teks }: { teks: string }) {
  const potongan = useMemo(() => pecahKode(teks), [teks]);
  return (
    <>
      {potongan.map((p, i) =>
        p.kode ? (
          <code key={i} className="kode-inline">
            {p.teks}
          </code>
        ) : (
          p.teks
        ),
      )}
    </>
  );
}
