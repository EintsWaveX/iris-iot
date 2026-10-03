/**
 * "BETA" next to Mandarin wherever the language is picked: the Mandarin
 * interface is still being written and waits for DES's review.
 */
import Pill from "./Pill";

export default function BetaBadge() {
  return (
    <Pill tone="warn" className="beta-badge">
      Beta
    </Pill>
  );
}
