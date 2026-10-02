/**
 * Preparation's Wiring Schematics tab (Phase 9 Stage 3, mockup c-prep):
 * one card per module, each with one source. That is the schematic bundled
 * with the site, an uploaded image (Vercel Blob), or a link: a Wokwi,
 * Tinkercad or Canva design shown in a frame, or a direct image address
 * (src/lib/tautan.ts checks it, the server checks again). Uploading or
 * linking replaces the card's source; deleting goes back to the bundled one.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowSquareOutIcon, CircuitryIcon, EyeIcon, TrashIcon } from "@phosphor-icons/react";
import { FileDrop } from "../../ui/Controls";
import Confirm from "../../ui/Confirm";
import Dialog from "../../ui/Dialog";
import Fade from "../../ui/Fade";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import SchematicViewer from "../../ui/SchematicViewer";
import SegmentedControl from "../../ui/SegmentedControl";
import { dict, getJson, MODUL_NAMA, postJson } from "../../../lib/app";
import { modulLabel } from "../../../lib/labels";
import { bacaTautan, namaLayanan, TAUTAN_SKEMA, tautanBingkai } from "../../../lib/tautan";
import type { Lang } from "../../../lib/kelas";

const T = dict({
  id: {
    builtIn: "Bawaan",
    builtInSrc: "Gambar bawaan modul",
    image: "Gambar",
    link: "Tautan",
    src: "Sumber",
    view: "Lihat",
    open: "Buka di tab baru",
    preview: "Pratinjau langsung",
    linkLabel: "Tautan skema",
    save: "Pasang Tautan",
    del: "Hapus",
    delTitle: (m: string) => `Hapus Skema ${m}?`,
    delBody: "Modul ini kembali memakai gambar bawaannya.",
    delFile: "Gambarnya juga dihapus dari penyimpanan.",
    deleted: (m: string) => `Skema ${m} dihapus. Kembali ke gambar bawaan.`,
    replaced: (m: string) => `Skema ${m} diganti.`,
    uploadFail: "Gambar gagal diunggah. Coba lagi.",
    fail: "Gagal. Coba lagi.",
    accepted: "Tautan yang diterima: Wokwi, Tinkercad dan Canva, atau alamat gambar langsung.",
    errors: {
      bukan_tautan: "Ini bukan tautan https.",
      canva_edit:
        "Ini tautan untuk mengedit. Ambil tautan 'Lihat saja' dari tombol Bagikan di Canva.",
      tidak_didukung: "Tautan ini tidak dikenal. Pakai Wokwi, Tinkercad, Canva atau alamat gambar.",
    } as Record<string, string>,
  },
  en: {
    builtIn: "Built-in",
    builtInSrc: "The module's built-in image",
    image: "Image",
    link: "Link",
    src: "Source",
    view: "View",
    open: "Open in a new tab",
    preview: "Live preview",
    linkLabel: "Schematic link",
    save: "Use This Link",
    del: "Delete",
    delTitle: (m: string) => `Delete the ${m} Schematic?`,
    delBody: "This module goes back to its built-in image.",
    delFile: "The image also leaves storage.",
    deleted: (m: string) => `${m} schematic deleted. Back to the built-in image.`,
    replaced: (m: string) => `${m} schematic replaced.`,
    uploadFail: "Couldn't upload the image. Try again.",
    fail: "That didn't work. Try again.",
    accepted: "Accepted links: Wokwi, Tinkercad and Canva, or a direct image address.",
    errors: {
      bukan_tautan: "That isn't an https link.",
      canva_edit: "That's an edit link. Take the view-only link from Canva's Share button.",
      tidak_didukung: "Unknown link. Use Wokwi, Tinkercad, Canva or an image address.",
    } as Record<string, string>,
  },
  zh: {
    builtIn: "自带",
    builtInSrc: "模块自带的图片",
    image: "图片",
    link: "链接",
    src: "来源",
    view: "查看",
    open: "在新标签页打开",
    preview: "实时预览",
    linkLabel: "电路图链接",
    save: "使用此链接",
    del: "删除",
    delTitle: (m: string) => `删除${m}的电路图？`,
    delBody: "这个模块会改回使用自带的图片。",
    delFile: "图片也会从存储中删除。",
    deleted: (m: string) => `${m}的电路图已删除，改回自带图片。`,
    replaced: (m: string) => `${m}的电路图已替换。`,
    uploadFail: "图片上传失败，请再试一次。",
    fail: "没有成功，请再试一次。",
    accepted: "可接受的链接：Wokwi、Tinkercad、Canva，或图片的直接地址。",
    errors: {
      bukan_tautan: "这不是 https 链接。",
      canva_edit: "这是编辑链接。请用 Canva 分享按钮里的“仅查看”链接。",
      tidak_didukung: "无法识别这个链接。请用 Wokwi、Tinkercad、Canva 或图片地址。",
    } as Record<string, string>,
  },
});

interface Skema {
  id: number;
  modul: number;
  namaBerkas: string;
  url: string;
  jenis: "berkas" | "tautan";
  aktif: boolean;
}

type Tx = (typeof T)["id"];

export default function SchematicEditor({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [list, setList] = useState<Skema[] | null>(null);
  const [view, setView] = useState<{ src: string; title: string; frame: boolean } | null>(null);
  const [del, setDel] = useState<Skema | null>(null);

  const load = () =>
    getJson<{ ok: boolean; daftar: Skema[] }>("/api/presentasi/schematic-list")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => void load(), []);

  const nama = (m: number) => modulLabel(m, lang);

  return (
    <div className="stack">
      <div className="schem-grid">
        {[1, 2, 3, 4].map((m) => (
          <SchemCard
            key={m}
            modul={m}
            judul={MODUL_NAMA[m]}
            aktif={list?.find((s) => s.modul === m && s.aktif) ?? null}
            loading={list === null}
            t={t}
            lang={lang}
            onView={setView}
            onDelete={setDel}
            onSaved={() => void load()}
          />
        ))}
      </div>
      <p className="hint" style={{ textAlign: "center" }}>
        {t.accepted}
      </p>

      <SchematicViewer
        open={!!view && !view.frame}
        onOpenChange={(o) => !o && setView(null)}
        src={view?.src ?? ""}
        title={view?.title ?? ""}
        lang={lang}
      />
      <Dialog
        open={!!view && view.frame}
        onOpenChange={(o) => !o && setView(null)}
        title={view?.title ?? ""}
        size="xl"
        lang={lang}
        actions={
          view && (
            <a
              className="btn btn--secondary"
              href={view.src}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ArrowSquareOutIcon size={18} aria-hidden="true" />
              {t.open}
            </a>
          )
        }
      >
        {view?.frame && (
          <div className="schem-frame">
            <iframe src={view.src} title={view.title} allowFullScreen />
          </div>
        )}
      </Dialog>
      <Confirm
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t.delTitle(del ? nama(del.modul) : "")}
        body={del ? `${t.delBody}${del.jenis === "berkas" ? ` ${t.delFile}` : ""}` : ""}
        confirmLabel={t.del}
        lang={lang}
        onConfirm={async () => {
          if (!del) return;
          const r = await postJson<{ ok: boolean }>("/api/presentasi/schematic-delete", {
            id: del.id,
          }).catch(() => ({ ok: false }));
          window.Toast?.show(r.ok ? t.deleted(nama(del.modul)) : t.fail, r.ok ? "ok" : "danger");
          await load();
        }}
      />
    </div>
  );
}

function SchemCard({
  modul,
  judul,
  aktif,
  loading,
  t,
  lang,
  onView,
  onDelete,
  onSaved,
}: {
  modul: number;
  judul: string;
  aktif: Skema | null;
  loading: boolean;
  t: Tx;
  lang: Lang;
  onView: (v: { src: string; title: string; frame: boolean }) => void;
  onDelete: (s: Skema) => void;
  onSaved: () => void;
}) {
  const frame = !!aktif && aktif.jenis === "tautan" && tautanBingkai(aktif.url);
  const isLink = aktif?.jenis === "tautan";
  const [mode, setMode] = useState<"img" | "link">(isLink ? "link" : "img");
  const [url, setUrl] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMode(isLink ? "link" : "img"), [isLink]);

  const src = aktif?.url ?? `/schematics/Module ${modul}.png`;
  const title = `${modulLabel(modul, lang)} · ${judul}`;
  const cek = bacaTautan(url, TAUTAN_SKEMA);
  const err = tried && !cek.ok ? t.errors[cek.kode] : null;

  async function onFile(f: File) {
    setBusy(true);
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
      window.Toast?.show(
        r.ok ? t.replaced(modulLabel(modul, lang)) : t.uploadFail,
        r.ok ? "ok" : "danger",
      );
      onSaved();
    } catch {
      window.Toast?.show(t.uploadFail, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function saveLink() {
    setTried(true);
    if (!cek.ok) return;
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/presentasi/schematic-link", {
      modul,
      url,
    }).catch(() => ({ ok: false, kode: undefined }));
    setBusy(false);
    if (!r.ok) return window.Toast?.show(t.errors[r.kode ?? ""] ?? t.fail, "danger");
    window.Toast?.show(t.replaced(modulLabel(modul, lang)), "ok");
    setUrl("");
    setTried(false);
    onSaved();
  }

  const kind = !aktif ? t.builtIn : frame ? t.link : t.image;
  const source = !aktif
    ? t.builtInSrc
    : isLink
      ? aktif.url.replace(/^https:\/\//, "")
      : aktif.namaBerkas;

  return (
    <div
      className="schem-card"
      data-custom={aktif ? "yes" : undefined}
      style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}
    >
      <div className="schem-card__head">
        <Pill modul={modul}>{modulLabel(modul, lang)}</Pill>
        <b className="grow truncate">{judul}</b>
        <Pill tone={frame ? "accent" : undefined}>{kind}</Pill>
      </div>
      {loading ? (
        <span className="skeleton schem-card__thumb" />
      ) : frame ? (
        <button
          type="button"
          className="schem-card__thumb schem-card__embed sweep-hover"
          aria-label={`${t.view} ${title}`}
          onClick={() => onView({ src: aktif.url, title, frame: true })}
        >
          <CircuitryIcon size={28} aria-hidden="true" />
          <b>{namaLayanan(aktif.url)}</b>
          <span className="hint">{t.preview}</span>
        </button>
      ) : (
        <button
          type="button"
          className="schem-card__thumb sweep-hover"
          aria-label={`${t.view} ${title}`}
          onClick={() => onView({ src, title, frame: false })}
        >
          <img src={src} alt="" loading="lazy" />
          <span className="schem-cur__zoom">
            <EyeIcon size={16} aria-hidden="true" /> {t.view}
          </span>
        </button>
      )}
      <span className="hint mono truncate" title={source}>
        {source}
      </span>
      <SegmentedControl
        fill
        aria-label={`${t.src} ${modulLabel(modul, lang)}`}
        value={mode}
        onValueChange={(v) => setMode(v as "img" | "link")}
        options={[
          { value: "img", label: t.image },
          { value: "link", label: t.link },
        ]}
      />
      <Fade k={mode}>
        {mode === "img" ? (
          <FileDrop
            accept={["image/png", "image/jpeg", "image/webp"]}
            maxBytes={8 * 1024 * 1024}
            kinds="PNG, JPG, WebP"
            busy={busy}
            lang={lang}
            compact
            onFile={(f) => void onFile(f)}
          />
        ) : (
          <form
            className="stack stack--sm"
            onSubmit={(e) => {
              e.preventDefault();
              void saveLink();
            }}
          >
            <label className="field" data-invalid={err ? "yes" : undefined}>
              <span className="field__label">{t.linkLabel}</span>
              <input
                className="field__input"
                type="url"
                inputMode="url"
                placeholder="https://wokwi.com/projects/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => url && setTried(true)}
                aria-invalid={err ? true : undefined}
              />
              {err && <span className="field__error">{err}</span>}
            </label>
            <button type="submit" className="btn btn--secondary" disabled={busy || !url.trim()}>
              {t.save}
            </button>
          </form>
        )}
      </Fade>
      {aktif && (
        <div className="row row--end">
          <IconButton
            icon={TrashIcon}
            label={`${t.del} ${title}`}
            kind="danger"
            sm
            onClick={() => onDelete(aktif)}
          />
        </div>
      )}
    </div>
  );
}
