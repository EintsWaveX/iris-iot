/** A PC key fingerprint ("53B1:F24B:..."), which wraps only after a colon so
 *  no group of four is split on a narrow screen. */
export default function Sidik({ nilai, className = "" }: { nilai: string; className?: string }) {
  const kelompok = nilai.split(":");
  return (
    <span className={`mono slr-fp ${className}`.trim()}>
      {kelompok.map((k, i) => (
        <span key={i}>
          {k}
          {i < kelompok.length - 1 && (
            <>
              :<wbr />
            </>
          )}
        </span>
      ))}
    </span>
  );
}
