/** The schematic bundled with the site; Module 4 (the hunt) has none, as
 * its content entry's empty `skema` says. Served by the API to whoever may
 * see the module's schematic (signed in; a Praktikan after doing it).
 * Browser-safe; the API's readiness check reads it too. */
export function skemaBawaan(modul: number): string | null {
  return modul === 4 ? null : `/api/presentasi/skema-bawaan?modul=${modul}`;
}
