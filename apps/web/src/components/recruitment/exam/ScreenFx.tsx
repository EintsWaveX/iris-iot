/**
 * The exam pages' atmosphere (2026-11-07, the user's notes on the FITB screenshot): a few calm
 * sparkling stars in the margins, like the QR wall's but slower and fainter, and a glow along the
 * screen edges whose colour and speed follow the time the seat has left. Both are decorative
 * (aria-hidden, no pointer events) and sit behind the questions and dialogs; reduced motion gets a
 * still glow and no stars, Low Detail a still, lighter glow and no stars.
 */
import type { CSSProperties } from "react";
import { glowLevel, glowReach } from "../../../lib/recruitment/glow";
import type { Motion } from "./parts";

const STARS = Array.from({ length: 18 }, (_, i) => {
  // A fixed scatter (no randomness, so a reload looks the same), kept to the margins and corners.
  const r = (n: number) => Math.abs((Math.sin((i + 1) * n) * 10000) % 1);
  const left = i % 2 === 0;
  return {
    x: left ? 1.5 + r(12.9898) * 14 : 84.5 + r(12.9898) * 14,
    y: 6 + r(78.233) * 86,
    s: 8 + Math.round(r(39.346) * 10),
    d: Math.round(r(11.135) * 90) / 10,
    t: 6 + Math.round(r(93.989) * 50) / 10,
    cool: i % 3 === 1,
  };
});

/** Slow four-point stars twinkling in the side margins. */
export function CalmStars({ motion }: { motion: Motion }) {
  if (motion !== "full") return null;
  return (
    <div className="r3stars" data-m={motion} aria-hidden="true">
      {STARS.map((s, i) => (
        <i
          key={i}
          data-c={s.cool ? "b" : undefined}
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.s,
              height: s.s,
              "--d": `${s.d}s`,
              "--t": `${s.t}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A glow around the screen edge: cool and slow with plenty of time, warm, then red and quick as it runs out. */
export function EdgeGlow({
  left,
  total,
  frozen,
  motion,
}: {
  left: number;
  total: number;
  /** Paused or not running: the glow holds still and dims */
  frozen: boolean;
  motion: Motion;
}) {
  return (
    <div
      className="r3glow"
      data-lv={glowLevel(left, total)}
      data-frozen={frozen ? "yes" : undefined}
      data-m={motion}
      style={{ "--g": glowReach(left, total).toFixed(3) } as CSSProperties}
      aria-hidden="true"
    />
  );
}
