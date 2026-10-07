/**
 * Unsaved edits on this page (2026-10-07). Editors with a dirty state say so
 * here, so a live change that would pull the page from under them waits:
 * rights taken away while someone types (lib/app.ts useMe) apply once the
 * edits are saved or discarded, not mid-sentence.
 */
import { useEffect, useId } from "react";

const kotor = new Set<string>();
const pemantau = new Set<() => void>();

/** Whether any editor on this page holds unsaved edits. */
export function adaBelumSimpan(): boolean {
  return kotor.size > 0;
}

/** Runs `fn` each time the page goes from unsaved edits to none. */
export function saatBersih(fn: () => void): () => void {
  pemantau.add(fn);
  return () => pemantau.delete(fn);
}

function tandai(id: string, belum: boolean) {
  const tadi = kotor.size;
  if (belum) kotor.add(id);
  else kotor.delete(id);
  if (tadi > 0 && kotor.size === 0) for (const f of [...pemantau]) f();
}

/** React: report an editor's dirty state while it is mounted. */
export function useBelumSimpan(belum: boolean): void {
  const id = useId();
  useEffect(() => {
    tandai(id, belum);
  }, [id, belum]);
  useEffect(() => () => tandai(id, false), [id]);
}
