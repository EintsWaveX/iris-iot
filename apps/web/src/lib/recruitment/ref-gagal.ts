/**
 * What the reader frame shows when a reference cannot be handed out (prompt 14):
 * a short page in the seat's language instead of the API's JSON. It is served
 * under the same strict headers as a stored page (no script, nothing loaded),
 * so it says the same thing whether the reference is missing, not the seat's,
 * or the store did not answer, and ids still cannot be probed.
 */
export type RefLang = "id" | "en" | "zh";

const TEKS: Record<RefLang, { title: string; body: string }> = {
  id: {
    title: "Referensi Belum Bisa Dibuka",
    body: "Halaman ini belum bisa ditampilkan sekarang. Coba pilih lagi sebentar lagi. Kalau masih begini, angkat tangan dan panggil pengawas.",
  },
  en: {
    title: "This Reference Can't Open Yet",
    body: "This page can't be shown right now. Pick it again in a moment. If it still won't open, raise your hand for the proctor.",
  },
  zh: {
    title: "参考资料暂时无法打开",
    body: "此页面暂时无法显示。请稍后再选一次。如果仍然打不开，请举手告诉监考老师。",
  },
};

export const refLang = (v: unknown): RefLang => (v === "en" || v === "zh" ? v : "id");

export function refGagalHtml(lang: RefLang): string {
  const t = TEKS[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${t.title}</title><style>:root{color-scheme:dark light}html,body{height:100%}body{margin:0;display:grid;place-items:center;font:15px/1.6 system-ui,sans-serif;background:Canvas;color:CanvasText}main{max-width:34em;padding:24px;text-align:center}h1{font-size:17px;margin:0 0 8px}p{margin:0;opacity:.8}</style></head><body><main><h1>${t.title}</h1><p>${t.body}</p></main></body></html>`;
}
