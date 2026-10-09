/** The schematic bundled with the site; Module 4 (the hunt) has none, as
 * its content entry's empty `skema` says. Browser-safe; the API's
 * readiness check reads it too. */
export function skemaBawaan(modul: number): string | null {
  return modul === 4 ? null : `/schematics/Module ${modul}.png`;
}
