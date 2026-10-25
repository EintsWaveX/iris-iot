import { useEffect, useRef, useState } from "react";

/** A number that rolls when it changes (live seat counts). */
export function Roll({ n }: { n: number }) {
  const prev = useRef(n);
  const [k, setK] = useState(0);
  const dir = n < prev.current ? "down" : "up";
  useEffect(() => {
    if (prev.current !== n) {
      prev.current = n;
      setK((x) => x + 1);
    }
  }, [n]);
  return (
    <span className="r2roll num" data-dir={dir}>
      <span key={k} className={k ? "r2roll__n" : undefined}>
        {n}
      </span>
    </span>
  );
}
