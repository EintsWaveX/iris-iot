/**
 * "Open this CaAs in Kandidat" from another part of the panel (Cutting's
 * candidate drawer), with a way back. The panel swaps parts in place, so the
 * part that opens next cannot read the one that closed: the caller leaves a
 * note here and the next part picks it up when it mounts. Kept in memory only;
 * a refresh forgets it, which is fine for a shortcut.
 */
import type { PanelTab } from "./panel-tab";

export interface PanelHandoff {
  /** The candidate (rec_candidate id) to open */
  cand: number;
  /** The part to go back to */
  from: PanelTab;
}

let pending: PanelHandoff | null = null;

export const giveHandoff = (h: PanelHandoff): void => {
  pending = h;
};
/** Read without clearing, so a double render sees the same note. */
export const peekHandoff = (): PanelHandoff | null => pending;
export const clearHandoff = (): void => {
  pending = null;
};
