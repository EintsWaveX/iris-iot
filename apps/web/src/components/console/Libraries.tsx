/**
 * The two upload libraries in Persiapan (Phase 8):
 *
 * - SlidesLibrary: the presentation library (was PresentationManager.tsx),
 *   now with a drop zone, an active badge, and a confirm before delete.
 * - SchematicLibrary: the wiring schematics per module. Each module shows
 *   the built-in schematic unless an assistant uploaded one; uploads go to
 *   Vercel Blob the same way the slides do, and the newest upload becomes
 *   the module's active schematic. "Pakai bawaan" goes back to the
 *   built-in one without deleting anything.
 *
 * File bytes never pass through our API: the browser gets a short-lived
 * token and PUTs straight to Blob (see api/presentasi/[aksi].ts).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { upload } from "@vercel/blob/client";
import { EyeIcon, TrashIcon } from "@phosphor-icons/react";
import { FileDrop } from "../ui/Controls";
import Confirm from "../ui/Confirm";
import SchematicViewer from "../ui/SchematicViewer";
import { getJson, jamMenit, postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import type { Strings } from "./strings";

interface Deck {
  id: number;
  namaBerkas: string;
  url: string;
  diunggahOleh: string;
  diunggahPada: string;
  aktif: boolean;
}

interface Skema {
  id: number;
  modul: number;
  namaBerkas: string;
  url: string;
  diunggahOleh: string;
  diunggahPada: string;
  aktif: boolean;
}

export function SlidesLibrary({
  t,
  lang,
  kode,
}: {
  t: Strings;
  lang: Lang;
  kode: (nim: string) => string;
}) {
  const [list, setList] = useState<Deck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Deck | null>(null);

  const load = () =>
    getJson<{ ok: boolean; daftar: Deck[] }>("/api/presentasi/daftar")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);

  async function onFile(f: File) {
    setBusy(true);
    try {
      const blob = await upload(f.name, f, {
        access: "public",
        handleUploadUrl: "/api/presentasi/token",
      });
      const r = await postJson<{ ok: boolean }>("/api/presentasi/simpan", {
        url: blob.url,
        namaBerkas: f.name,
      });
      window.Toast?.show(r.ok ? t.uploaded : t.uploadFail, r.ok ? "ok" : "danger");
      await load();
    } catch {
      window.Toast?.show(t.uploadFail, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(d: Deck) {
    try {
      const r = d.aktif
        ? await postJson<{ ok: boolean }>("/api/presentasi/nonaktifkan")
        : await postJson<{ ok: boolean }>("/api/presentasi/aktifkan", { id: d.id });
      window.Toast?.show(d.aktif ? t.slidesOff : t.slidesSwitched, r.ok ? "ok" : "danger");
      await load();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.slidesLib}</h2>
          <p className="panel__sub">{t.slidesLibSub}</p>
        </div>
      </div>
      <FileDrop
        accept={["application/pdf"]}
        maxBytes={20 * 1024 * 1024}
        kinds="PDF"
        busy={busy}
        lang={lang}
        onFile={(f) => void onFile(f)}
        compact={!!list && list.length > 0}
      />
      {list === null ? (
        <span className="skeleton" style={{ height: 56 }} />
      ) : list.length === 0 ? (
        <p className="hint">{t.emptyLib}</p>
      ) : (
        <ul className="lib">
          {list.map((d) => (
            <li key={d.id} className="lib__row" data-aktif={d.aktif ? "yes" : undefined}>
              <span className="grow stack" style={{ gap: 2 }}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lib__name truncate"
                >
                  {d.namaBerkas}
                </a>
                <span className="hint">
                  {t.by(kode(d.diunggahOleh))} · {jamMenit(d.diunggahPada, lang)}
                </span>
              </span>
              {d.aktif && <span className="pill pill--ok">{t.activeBadge}</span>}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => void toggle(d)}
              >
                {d.aktif ? t.deactivate : t.activate}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm btn--icon"
                aria-label={`${t.delete} ${d.namaBerkas}`}
                onClick={() => setDel(d)}
              >
                <TrashIcon size={17} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Confirm
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t.deleteTitle(del?.namaBerkas ?? "")}
        body={t.deleteBody}
        confirmLabel={t.delete}
        lang={lang}
        onConfirm={async () => {
          if (!del) return;
          const r = await postJson<{ ok: boolean }>("/api/presentasi/hapus", { id: del.id }).catch(
            () => ({ ok: false }),
          );
          if (!r.ok) window.Toast?.show(t.fail, "danger");
          await load();
        }}
      />
    </section>
  );
}

export function SchematicLibrary({
  t,
  lang,
  kode,
}: {
  t: Strings;
  lang: Lang;
  kode: (nim: string) => string;
}) {
  const [list, setList] = useState<Skema[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [view, setView] = useState<{ src: string; title: string } | null>(null);
  const [del, setDel] = useState<Skema | null>(null);

  const load = () =>
    getJson<{ ok: boolean; daftar: Skema[] }>("/api/presentasi/schematic-list")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);

  async function onFile(modul: number, f: File) {
    setBusy(modul);
    try {
      const blob = await upload(`skema-m${modul}-${f.name}`, f, {
        access: "public",
        handleUploadUrl: "/api/presentasi/schematic-token",
      });
      const r = await postJson<{ ok: boolean }>("/api/presentasi/schematic-save", {
        url: blob.url,
        namaBerkas: f.name,
        modul,
      });
      window.Toast?.show(r.ok ? t.schemSwitched(modul) : t.uploadFail, r.ok ? "ok" : "danger");
      await load();
    } catch {
      window.Toast?.show(t.uploadFail, "danger");
    } finally {
      setBusy(null);
    }
  }

  async function act(url: string, body: object, msg: string) {
    try {
      const r = await postJson<{ ok: boolean }>(url, body);
      window.Toast?.show(r.ok ? msg : t.fail, r.ok ? "ok" : "danger");
      await load();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  return (
    <section className="panel prep__full">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.schemTitle}</h2>
          <p className="panel__sub">{t.schemSub}</p>
        </div>
      </div>
      <div className="schem-grid">
        {[1, 2, 3, 4].map((modul) => {
          const mine = (list ?? []).filter((s) => s.modul === modul);
          const active = mine.find((s) => s.aktif) ?? null;
          const src = active?.url ?? `/schematics/Module ${modul}.png`;
          const others = mine.filter((s) => !s.aktif);
          return (
            <div
              key={modul}
              className="schem-card"
              data-custom={active ? "yes" : undefined}
              style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}
            >
              <div className="schem-card__head">
                <span className="schem-card__mod">{modulLabel(modul, lang)}</span>
                <b className="grow truncate">{t.modulNama(modul)}</b>
                <span className={`pill ${active ? "pill--accent" : ""}`}>
                  {active ? t.schemCustom : t.schemDefault}
                </span>
              </div>
              <button
                type="button"
                className="schem-card__thumb sweep-hover"
                aria-label={`${t.schemView} ${t.modul(modul)}`}
                onClick={() =>
                  setView({
                    src,
                    title: `${t.modul(modul)} · ${active ? t.schemCustom : t.schemDefault}`,
                  })
                }
              >
                <img src={src} alt="" loading="lazy" />
                <span className="schem-cur__zoom">
                  <EyeIcon size={16} aria-hidden="true" /> {t.schemView}
                </span>
              </button>
              {active && (
                <span className="hint truncate">
                  {active.namaBerkas} · {t.by(kode(active.diunggahOleh))} ·{" "}
                  {jamMenit(active.diunggahPada, lang)}
                </span>
              )}
              <FileDrop
                accept={["image/png", "image/jpeg", "image/webp"]}
                maxBytes={8 * 1024 * 1024}
                kinds="PNG, JPG, WebP"
                busy={busy === modul}
                lang={lang}
                compact
                onFile={(f) => void onFile(modul, f)}
              />
              {active && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() =>
                    void act("/api/presentasi/schematic-default", { modul }, t.schemBack(modul))
                  }
                >
                  {t.schemUseDefault}
                </button>
              )}
              {others.length > 0 && (
                <ul className="schem-card__hist">
                  {others.map((s) => (
                    <li key={s.id}>
                      <img className="lib__thumb" src={s.url} alt="" loading="lazy" />
                      <span className="grow truncate hint">{s.namaBerkas}</span>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() =>
                          void act(
                            "/api/presentasi/schematic-activate",
                            { id: s.id },
                            t.schemSwitched(modul),
                          )
                        }
                      >
                        {t.activate}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm btn--icon"
                        aria-label={`${t.delete} ${s.namaBerkas}`}
                        onClick={() => setDel(s)}
                      >
                        <TrashIcon size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <SchematicViewer
        open={!!view}
        onOpenChange={(o) => !o && setView(null)}
        src={view?.src ?? ""}
        title={view?.title ?? ""}
        lang={lang}
      />
      <Confirm
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t.deleteTitle(del?.namaBerkas ?? "")}
        body={t.deleteBody}
        confirmLabel={t.delete}
        lang={lang}
        onConfirm={async () => {
          if (!del) return;
          await act("/api/presentasi/schematic-delete", { id: del.id }, t.delete);
        }}
      />
    </section>
  );
}
