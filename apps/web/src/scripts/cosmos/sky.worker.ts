/**
 * Draws the painted sky's sprites off the main thread (see the note at the top of painters.ts).
 *
 * It answers one request, "the sprites for this theme", with plain data: PNG data URLs plus the sizes and
 * anchor points scene.ts needs. Data URLs, not blob URLs, because the site's Content-Security-Policy allows
 * `img-src 'self' data: https:` and a blob: source would be blocked.
 */
import { spritesAsync, type SpriteSet, type Theme } from "./painters";

export interface SkyRequest {
  id: number;
  T: Theme;
}
export type SkyReply = { id: number; set: SpriteSet } | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SkyRequest>) => void) | null;
  postMessage(reply: SkyReply): void;
};

scope.onmessage = (e) => {
  const { id, T } = e.data;
  spritesAsync(T).then(
    (set) => scope.postMessage({ id, set }),
    (err: unknown) => scope.postMessage({ id, error: String(err) }),
  );
};
