/**
 * Preparation's Wiring Schematics tab (Phase 9 Stage 3, mockup c-prep):
 * one card per module, each with one source. That is the schematic bundled
 * with the site, an uploaded image (Vercel Blob), or a link: a Wokwi,
 * Tinkercad or Canva design shown in a frame, or a direct image address
 * (src/lib/tautan.ts checks it, the server checks again). Uploading or
 * linking replaces the card's source of that kind; deleting goes back to the
 * bundled one. An image and a link may both be active (the Praktikan then
 * switches between them on the module page).
 * Module 4 bundles none, so its card starts empty.
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
import { dict, getJson, MODUL_NAMA, postJson, skemaBawaan } from "../../../lib/app";
import { modulLabel } from "../../../lib/labels";
import { bacaTautan, namaLayanan, TAUTAN_SKEMA, tautanBingkai } from "../../../lib/tautan";
import type { Lang } from "../../../lib/kelas";
import TanpaHak, { useBolehJadwal } from "./TanpaHak";
import { useSiaran } from "../../../lib/siaran";

const T = dict({
  id: {
    builtIn: "Bawaan",
    builtInSrc: "Gambar bawaan modul",
    none: "Kosong",
    noneSrc: "Modul ini tidak punya gambar bawaan",
    empty: "Belum ada skema. Unggah gambar atau pasang tautan Wokwi.",
    broken: "Gambar tidak bisa dimuat. Ganti dengan berkas atau tautan lain.",
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
    delBodyNone: "Modul ini kembali tanpa skema.",
    deletedNone: (m: string) => `Skema ${m} dihapus.`,
    both: "Gambar + Tautan",
    noLink: "Belum ada tautan",
    emptyLink: "Belum ada tautan. Tempel tautan Wokwi, Tinkercad atau Canva.",
    delBodyLink: "Tautan ini dilepas dari modul. Gambarnya tetap ada.",
    deletedLink: (m: string) => `Tautan skema ${m} dihapus.`,
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
    none: "None",
    noneSrc: "This module has no built-in image",
    empty: "No schematic yet. Upload an image or add a Wokwi link.",
    broken: "The image can't be loaded. Replace it with another file or link.",
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
    delBodyNone: "This module goes back to having no schematic.",
    deletedNone: (m: string) => `${m} schematic deleted.`,
    both: "Image + Link",
    noLink: "No link yet",
    emptyLink: "No link yet. Paste a Wokwi, Tinkercad or Canva link.",
    delBodyLink: "This link leaves the module. Its image stays.",
    deletedLink: (m: string) => `${m} schematic link deleted.`,
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
    none: "无",
    noneSrc: "这个模块没有自带的图片",
    empty: "还没有电路图。上传图片或添加 Wokwi 链接。",
    broken: "图片无法加载。请换一个文件或链接。",
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
    delBodyNone: "这个模块会改回没有电路图。",
    deletedNone: (m: string) => `${m}的电路图已删除。`,
    both: "图片 + 链接",
    noLink: "还没有链接",
    emptyLink: "还没有链接。请粘贴 Wokwi、Tinkercad 或 Canva 链接。",
    delBodyLink: "这个链接会从模块移除，图片保留。",
    deletedLink: (m: string) => `${m}的电路图链接已删除。`,
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
  const boleh = useBolehJadwal();
  const [list, setList] = useState<Skema[] | null>(null);
  const [view, setView] = useState<{ src: string; title: string; frame: boolean } | null>(null);
  const [del, setDel] = useState<Skema | null>(null);

  const load = () =>
    getJson<{ ok: boolean; daftar: Skema[] }>("/api/presentasi/schematic-list")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => void load(), []);
  useSiaran(["presentasi"], load);

  const nama = (m: number) => modulLabel(m, lang);

  return (
    <div className="stack">
      {!boleh && <TanpaHak lang={lang} />}
      <div className="schem-grid">
        {[1, 2, 3, 4].map((m) => (
          <SchemCard
            key={m}
            boleh={boleh}
            modul={m}
            judul={MODUL_NAMA[m]}
            aktif={{
              berkas: list?.find((s) => s.modul === m && s.aktif && s.jenis === "berkas") ?? null,
              tautan: list?.find((s) => s.modul === m && s.aktif && s.jenis === "tautan") ?? null,
            }}
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
        body={
          del
            ? del.jenis === "tautan"
              ? t.delBodyLink
              : `${skemaBawaan(del.modul) ? t.delBody : t.delBodyNone} ${t.delFile}`
            : ""
        }
        confirmLabel={t.del}
        lang={lang}
        onConfirm={async () => {
          if (!del) return;
          const r = await postJson<{ ok: boolean }>("/api/presentasi/schematic-delete", {
            id: del.id,
          }).catch(() => ({ ok: false }));
          const pesan =
            del.jenis === "tautan"
              ? t.deletedLink
              : skemaBawaan(del.modul)
                ? t.deleted
                : t.deletedNone;
          window.Toast?.show(r.ok ? pesan(nama(del.modul)) : t.fail, r.ok ? "ok" : "danger");
          await load();
        }}
      />
    </div>
  );
}

function SchemCard({
  boleh,
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
  /** The Jadwal right: without it the card only shows. */
  boleh: boolean;
  modul: number;
  judul: string;
  aktif: { berkas: Skema | null; tautan: Skema | null };
  loading: boolean;
  t: Tx;
  lang: Lang;
  onView: (v: { src: string; title: string; frame: boolean }) => void;
  onDelete: (s: Skema) => void;
  onSaved: () => void;
}) {
  // Each tab shows its own source: the image, or the link.
  const hanyaTautan = !aktif.berkas && !!aktif.tautan;
  const [mode, setMode] = useState<"img" | "link">(hanyaTautan ? "link" : "img");
  const [url, setUrl] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMode(hanyaTautan ? "link" : "img"), [hanyaTautan]);
  const cur = mode === "link" ? aktif.tautan : aktif.berkas;
  const frame = !!cur && cur.jenis === "tautan" && tautanBingkai(cur.url);
  const isLink = cur?.jenis === "tautan";

  const src = cur?.url ?? (mode === "img" ? skemaBawaan(modul) : null);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
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

  const kind =
    aktif.berkas && aktif.tautan
      ? t.both
      : aktif.tautan
        ? t.link
        : aktif.berkas
          ? t.image
          : skemaBawaan(modul)
            ? t.builtIn
            : t.none;
  const source = cur
    ? isLink
      ? cur.url.replace(/^https:\/\//, "")
      : cur.namaBerkas
    : mode === "link"
      ? t.noLink
      : src
        ? t.builtInSrc
        : t.noneSrc;

  return (
    <div
      className="schem-card"
      data-custom={aktif.berkas || aktif.tautan ? "yes" : undefined}
      style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}
    >
      <div className="schem-card__head">
        {/* The module name stays in the labels: the head only has room
            for the two pills without clipping (mockup c-prep Skema). */}
        <Pill modul={modul}>{modulLabel(modul, lang)}</Pill>
        <span className="grow" />
        <Pill tone={aktif.tautan ? "accent" : undefined}>{kind}</Pill>
      </div>
      {loading ? (
        <span className="skeleton schem-card__thumb" />
      ) : frame ? (
        <button
          type="button"
          className="schem-card__thumb schem-card__embed sweep-hover"
          aria-label={`${t.view} ${title}`}
          onClick={() => onView({ src: cur.url, title, frame: true })}
        >
          <CircuitryIcon size={28} aria-hidden="true" />
          <b>{namaLayanan(cur.url)}</b>
          <span className="hint">{t.preview}</span>
        </button>
      ) : !src ? (
        <div
          className="schem-card__thumb schem-card__embed schem-card__broken"
          role="img"
          aria-label={mode === "link" ? t.emptyLink : t.empty}
        >
          <CircuitryIcon size={28} aria-hidden="true" />
          <span className="hint">{mode === "link" ? t.emptyLink : t.empty}</span>
        </div>
      ) : broken ? (
        <div
          className="schem-card__thumb schem-card__embed schem-card__broken"
          role="img"
          aria-label={t.broken}
        >
          <CircuitryIcon size={28} aria-hidden="true" />
          <span className="hint">{t.broken}</span>
        </div>
      ) : (
        <button
          type="button"
          className="schem-card__thumb sweep-hover"
          aria-label={`${t.view} ${title}`}
          onClick={() => onView({ src, title, frame: false })}
        >
          <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
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
      {boleh && (
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
      )}
      {cur && boleh && (
        <div className="row row--end">
          <IconButton
            icon={TrashIcon}
            label={`${t.del} ${title}`}
            kind="danger"
            sm
            onClick={() => onDelete(cur)}
          />
        </div>
      )}
    </div>
  );
}
