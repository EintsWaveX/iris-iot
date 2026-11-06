/**
 * Free mode (6 Nov 2026): in Mode Latihan no time, stage, order or capacity gate blocks an action.
 * The shared rule functions ask `bebas()` and lift their gate when it is true. It is false everywhere
 * except where something installs a hook that says otherwise: the server installs one that is true only
 * inside a practice request (api/_lib/recruitment-latihan-ctx.ts), the page one that is true only while
 * the practice cookie is on (latihan-client.ts). A live request therefore never sees it.
 */
let hook: () => boolean = () => false;

export const setBebasHook = (f: () => boolean): void => {
  hook = f;
};

export const bebas = (): boolean => hook();
