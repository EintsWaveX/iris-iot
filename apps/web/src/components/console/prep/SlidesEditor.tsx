/**
 * Preparation's Slides tab, per module since 2026-10-08 (the Wiring
 * Schematics tab's pattern, SchematicEditor.tsx): one card per module with
 * a PDF (straight to Vercel Blob, see api/presentasi/[aksi].ts) and a Canva
 * view link. Uploading or linking replaces the card's deck of that kind;
 * both may be active, and the Praktikan switches between them. A Praktikan
 * sees a module's slides only once they did its practicum.
 * Decks from before then have no module; they wait under the cards until
 * an Asisten gives each one a module or deletes it.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { upload } from "@vercel/blob/client";
import {
  EyeIcon,
  FilePdfIcon,
  LinkSimpleIcon,
  PresentationChartIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { FileDrop } from "../../ui/Controls";
import Confirm from "../../ui/Confirm";
import ErrorView from "../../ui/ErrorView";
import Fade from "../../ui/Fade";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import SegmentedControl from "../../ui/SegmentedControl";
import SlidesDialog, { type Deck as Tampil } from "../../shell/SlidesDialog";
import { dict, getJson, MODUL_NAMA, postJson } from "../../../lib/app";
import { useDirektori } from "../../../lib/people";
import { modulLabel } from "../../../lib/labels";
import { bacaTautan, TAUTAN_SLIDES } from "../../../lib/tautan";
import type { Lang } from "../../../lib/kelas";
import TanpaHak, { useBolehJadwal } from "./TanpaHak";
import { useSiaran } from "../../../lib/siaran";
import Lalu from "../../ui/Lalu";

const T = dict({
  id: {
    pdf: "PDF",
    canva: "Canva",
    both: "PDF + Canva",
    none: "Kosong",
    src: "Sumber",
    view: "Lihat",
    preview: "Pratinjau langsung",
    emptyPdf: "Belum ada PDF. Unggah berkasnya di bawah.",
    emptyLink: "Belum ada tautan. Tempel tautan Canva di bawah.",
    noPdf: "Belum ada PDF",
    noLink: "Belum ada tautan",
    bigWhy: (mb: string) => `Berkas yang kamu pilih ${mb} MB. Batasnya 20 MB.`,
    bigTodo: "Kecilkan PDF-nya, atau pakai tautan Canva.",
    canvaUrl: "Tautan Canva",
    canvaName: "Nama (boleh kosong)",
    canvaNamePh: "Misalnya Pengantar Modul 3",
    save: "Pasang Tautan",
    replaced: (m: string) => `Presentasi ${m} diganti.`,
    uploadFail: "PDF gagal diunggah. Coba lagi.",
    fail: "Gagal. Coba lagi.",
    accepted:
      "Pakai tautan publik dari tombol Bagikan di Canva: canva.link/… atau canva.com/design/…/view. Praktikan melihat presentasi sebuah modul setelah mengikuti praktikumnya.",
    del: "Hapus",
    delTitle: (m: string) => `Hapus Presentasi ${m}?`,
    delBody: "Praktikan tidak lagi melihatnya.",
    delFile: "Berkasnya juga dihapus dari penyimpanan dan tidak bisa dikembalikan.",
    deleted: (m: string) => `Presentasi ${m} dihapus.`,
    oldTitle: "Belum Ada Modul",
    oldSub: "Presentasi dari sebelum presentasi dibuat per modul. Pilih modulnya, atau hapus.",
    useFor: "Pakai untuk",
    useForM: (m: string) => `Pakai untuk ${m}`,
    assigned: (n: string, m: string) => `${n} sekarang dipakai ${m}.`,
    by: (who: string, when: string) => `${who} · ${when}`,
    delOld: "Hapus Presentasi Ini?",
    deletedOld: "Presentasi dihapus.",
    errors: {
      bukan_tautan: "Ini bukan tautan https.",
      canva_edit:
        "Ini tautan untuk mengedit. Ambil tautan 'Lihat saja' dari tombol Bagikan di Canva.",
      canva_pendek:
        "Tautan canva.link ini tidak bisa dibuka. Cek tautannya, atau tempel tautan desain Canva.",
      tidak_didukung: "Yang diterima cuma tautan Canva: canva.link/… atau canva.com/design/….",
    } as Record<string, string>,
  },
  en: {
    pdf: "PDF",
    canva: "Canva",
    both: "PDF + Canva",
    none: "None",
    src: "Source",
    view: "View",
    preview: "Live preview",
    emptyPdf: "No PDF yet. Upload the file below.",
    emptyLink: "No link yet. Paste a Canva link below.",
    noPdf: "No PDF yet",
    noLink: "No link yet",
    bigWhy: (mb: string) => `The file you chose is ${mb} MB. The limit is 20 MB.`,
    bigTodo: "Shrink the PDF, or use a Canva link.",
    canvaUrl: "Canva link",
    canvaName: "Name (optional)",
    canvaNamePh: "For example Module 3 intro",
    save: "Use This Link",
    replaced: (m: string) => `${m} slides replaced.`,
    uploadFail: "Couldn't upload the PDF. Try again.",
    fail: "That didn't work. Try again.",
    accepted:
      "Use the public link from Canva's Share button: canva.link/… or canva.com/design/…/view. Students see a module's slides once they did its practicum.",
    del: "Delete",
    delTitle: (m: string) => `Delete the ${m} Slides?`,
    delBody: "Students stop seeing them.",
    delFile: "The file also leaves storage for good.",
    deleted: (m: string) => `${m} slides deleted.`,
    oldTitle: "No Module Yet",
    oldSub: "Slides from before slides went per module. Pick their module, or delete them.",
    useFor: "Use for",
    useForM: (m: string) => `Use for ${m}`,
    assigned: (n: string, m: string) => `${n} now belongs to ${m}.`,
    by: (who: string, when: string) => `${who} · ${when}`,
    delOld: "Delete These Slides?",
    deletedOld: "Slides deleted.",
    errors: {
      bukan_tautan: "That isn't an https link.",
      canva_edit: "That's an edit link. Take the view-only link from Canva's Share button.",
      canva_pendek: "That canva.link link won't open. Check it, or paste the Canva design link.",
      tidak_didukung: "Only Canva links work here: canva.link/… or canva.com/design/….",
    } as Record<string, string>,
  },
  zh: {
    pdf: "PDF",
    canva: "Canva",
    both: "PDF + Canva",
    none: "无",
    src: "来源",
    view: "查看",
    preview: "实时预览",
    emptyPdf: "还没有 PDF。请在下面上传文件。",
    emptyLink: "还没有链接。请在下面粘贴 Canva 链接。",
    noPdf: "还没有 PDF",
    noLink: "还没有链接",
    bigWhy: (mb: string) => `你选的文件有 ${mb} MB，上限是 20 MB。`,
    bigTodo: "把 PDF 压小一点，或者改用 Canva 链接。",
    canvaUrl: "Canva 链接",
    canvaName: "名称（可不填）",
    canvaNamePh: "例如：模块 3 导读",
    save: "使用此链接",
    replaced: (m: string) => `${m}的幻灯片已替换。`,
    uploadFail: "PDF 上传失败，请再试一次。",
    fail: "没有成功，请再试一次。",
    accepted:
      "请用 Canva 分享按钮里的公开链接：canva.link/… 或 canva.com/design/…/view。学生做完某个模块的实验后才能看到它的幻灯片。",
    del: "删除",
    delTitle: (m: string) => `删除${m}的幻灯片？`,
    delBody: "学生将看不到它。",
    delFile: "文件也会从存储中永久删除。",
    deleted: (m: string) => `${m}的幻灯片已删除。`,
    oldTitle: "尚未分配模块",
    oldSub: "这些是幻灯片按模块管理之前上传的。请选择所属模块，或删除。",
    useFor: "用于",
    useForM: (m: string) => `用于${m}`,
    assigned: (n: string, m: string) => `${n} 现在属于${m}。`,
    by: (who: string, when: string) => `${who} · ${when}`,
    delOld: "删除这份幻灯片？",
    deletedOld: "幻灯片已删除。",
    errors: {
      bukan_tautan: "这不是 https 链接。",
      canva_edit: "这是编辑链接。请用 Canva 分享按钮里的“仅查看”链接。",
      canva_pendek: "这个 canva.link 链接打不开。请检查，或粘贴 Canva 设计链接。",
      tidak_didukung: "这里只接受 Canva 链接：canva.link/… 或 canva.com/design/…。",
    } as Record<string, string>,
  },
});

interface Deck {
  id: number;
  modul: number | null;
  namaBerkas: string;
  url: string;
  jenis: "berkas" | "tautan";
  diunggahOleh: string;
  diunggahPada: string;
  aktif: boolean;
}

type Tx = (typeof T)["id"];

/** "https://www.canva.com/design/DAF8xQ2.../view?embed" -> "canva.com/design/DAF8xQ2…" */
function pendek(url: string): string {
  const m = /canva\.com\/design\/([^/]+)/.exec(url);
  return m ? `canva.com/design/${m[1].slice(0, 8)}…` : url;
}

const tampil = (d: Deck): Tampil => ({ url: d.url, namaBerkas: d.namaBerkas, jenis: d.jenis });

export default function SlidesEditor({ lang }: { lang: Lang }) {
  const t = T[lang];
  const boleh = useBolehJadwal();
  const dir = useDirektori();
  const [list, setList] = useState<Deck[] | null>(null);
  const [view, setView] = useState<{ list: Tampil[]; modul?: number } | null>(null);
  const [del, setDel] = useState<Deck | null>(null);

  const load = () =>
    getJson<{ ok: boolean; daftar: Deck[] }>("/api/presentasi/slides-list")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => void load(), []);
  useSiaran(["presentasi"], load);

  const nama = (m: number) => modulLabel(m, lang);
  const lama = (list ?? []).filter((d) => d.modul === null);

  async function assign(d: Deck, m: number) {
    const r = await postJson<{ ok: boolean }>("/api/presentasi/slides-assign", {
      id: d.id,
      modul: m,
    }).catch(() => ({ ok: false }));
    window.Toast?.show(r.ok ? t.assigned(d.namaBerkas, nama(m)) : t.fail, r.ok ? "ok" : "danger");
    void load();
  }

  return (
    <div className="stack">
      {!boleh && <TanpaHak lang={lang} />}
      <div className="schem-grid">
        {[1, 2, 3, 4].map((m) => (
          <DeckCard
            key={m}
            boleh={boleh}
            modul={m}
            judul={MODUL_NAMA[m]}
            aktif={{
              berkas: list?.find((d) => d.modul === m && d.aktif && d.jenis === "berkas") ?? null,
              tautan: list?.find((d) => d.modul === m && d.aktif && d.jenis === "tautan") ?? null,
            }}
            loading={list === null}
            t={t}
            lang={lang}
            onView={(d) => setView({ list: [tampil(d)], modul: m })}
            onDelete={setDel}
            onSaved={() => void load()}
          />
        ))}
      </div>
      <p className="hint" style={{ textAlign: "center" }}>
        {t.accepted}
      </p>

      {lama.length > 0 && (
        <section className="panel">
          <div className="panel__head">
            <div className="stack stack--sm">
              <h3 className="panel__title">{t.oldTitle}</h3>
              <p className="panel__sub">{t.oldSub}</p>
            </div>
          </div>
          <ul className="lib">
            {lama.map((d) => {
              const Ico = d.jenis === "tautan" ? LinkSimpleIcon : FilePdfIcon;
              return (
                <li key={d.id} className="lib__row">
                  <Ico size={20} aria-hidden="true" className="lib__icon" data-jenis={d.jenis} />
                  <span className="grow stack" style={{ gap: 2 }}>
                    <button
                      type="button"
                      className="lib__name truncate"
                      onClick={() => setView({ list: [tampil(d)] })}
                    >
                      {d.namaBerkas}
                    </button>
                    <span className="hint truncate">
                      {d.jenis === "tautan" ? `${pendek(d.url)} · ` : ""}
                      <Lalu
                        iso={d.diunggahPada}
                        lang={lang}
                        fmt={(s) => t.by(dir.nama(d.diunggahOleh), s)}
                      />
                    </span>
                  </span>
                  {boleh && (
                    <span className="row row--nowrap" role="group" aria-label={t.useFor}>
                      <span className="hint">{t.useFor}</span>
                      {[1, 2, 3, 4].map((m) => (
                        <button
                          key={m}
                          type="button"
                          className="btn btn--secondary btn--sm"
                          aria-label={t.useForM(nama(m))}
                          title={t.useForM(nama(m))}
                          onClick={() => void assign(d, m)}
                        >
                          {m}
                        </button>
                      ))}
                    </span>
                  )}
                  {boleh && (
                    <IconButton
                      icon={TrashIcon}
                      label={`${t.del} ${d.namaBerkas}`}
                      kind="danger"
                      sm
                      onClick={() => setDel(d)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SlidesDialog
        open={!!view}
        onOpenChange={(o) => !o && setView(null)}
        list={view?.list ?? []}
        modul={view?.modul}
        lang={lang}
      />
      <Confirm
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del?.modul ? t.delTitle(nama(del.modul)) : t.delOld}
        body={
          del
            ? `${del.namaBerkas}. ${t.delBody}${del.jenis === "berkas" ? ` ${t.delFile}` : ""}`
            : ""
        }
        confirmLabel={t.del}
        lang={lang}
        onConfirm={async () => {
          if (!del) return;
          const r = await postJson<{ ok: boolean }>("/api/presentasi/slides-delete", {
            id: del.id,
          }).catch(() => ({ ok: false }));
          const pesan = del.modul ? t.deleted(nama(del.modul)) : t.deletedOld;
          window.Toast?.show(r.ok ? pesan : t.fail, r.ok ? "ok" : "danger");
          await load();
        }}
      />
    </div>
  );
}

function DeckCard({
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
  aktif: { berkas: Deck | null; tautan: Deck | null };
  loading: boolean;
  t: Tx;
  lang: Lang;
  onView: (d: Deck) => void;
  onDelete: (d: Deck) => void;
  onSaved: () => void;
}) {
  // Each tab shows its own source: the PDF, or the link.
  const hanyaTautan = !aktif.berkas && !!aktif.tautan;
  const [mode, setMode] = useState<"pdf" | "link">(hanyaTautan ? "link" : "pdf");
  useEffect(() => setMode(hanyaTautan ? "link" : "pdf"), [hanyaTautan]);
  // The field shows the link in use; typing takes over.
  const tautanKini = aktif.tautan ? aktif.tautan.url.replace(/\?embed$/, "") : "";
  const [url, setUrl] = useState(tautanKini);
  const [namaLink, setNamaLink] = useState("");
  const [mengetik, setMengetik] = useState(false);
  useEffect(() => {
    if (!mengetik) setUrl(tautanKini);
  }, [tautanKini, mengetik]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // A PDF over 20 MB shows the 413 view: switch to a link, or pick again.
  const [tooBig, setTooBig] = useState<number | null>(null);
  const [pick, setPick] = useState(0);

  const cur = mode === "link" ? aktif.tautan : aktif.berkas;
  const title = `${modulLabel(modul, lang)} · ${judul}`;
  const cek = bacaTautan(url, TAUTAN_SLIDES);
  const err = tried && !cek.ok ? t.errors[cek.kode] : null;

  async function onFile(f: File) {
    setBusy(true);
    try {
      const blob = await upload(f.name, f, {
        access: "public",
        handleUploadUrl: "/api/presentasi/slides-token",
      });
      const r = await postJson<{ ok: boolean }>("/api/presentasi/slides-save", {
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
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/presentasi/slides-link", {
      modul,
      url,
      nama: namaLink,
    }).catch(() => ({ ok: false, kode: undefined }));
    setBusy(false);
    if (!r.ok) return window.Toast?.show(t.errors[r.kode ?? ""] ?? t.fail, "danger");
    window.Toast?.show(t.replaced(modulLabel(modul, lang)), "ok");
    setMengetik(false);
    setTried(false);
    setNamaLink("");
    onSaved();
  }

  const kind =
    aktif.berkas && aktif.tautan ? t.both : aktif.tautan ? t.canva : aktif.berkas ? t.pdf : t.none;
  const source = cur
    ? cur.jenis === "tautan"
      ? `${cur.namaBerkas} · ${pendek(cur.url)}`
      : cur.namaBerkas
    : mode === "link"
      ? t.noLink
      : t.noPdf;

  return (
    <div
      className="schem-card"
      data-custom={aktif.berkas || aktif.tautan ? "yes" : undefined}
      style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}
    >
      <div className="schem-card__head">
        <Pill modul={modul}>{modulLabel(modul, lang)}</Pill>
        <span className="grow" />
        <Pill tone={aktif.tautan ? "accent" : undefined}>{kind}</Pill>
      </div>
      {loading ? (
        <span className="skeleton schem-card__thumb" />
      ) : cur ? (
        <button
          type="button"
          className="schem-card__thumb schem-card__embed sweep-hover"
          aria-label={`${t.view} ${title}`}
          onClick={() => onView(cur)}
        >
          {cur.jenis === "tautan" ? (
            <PresentationChartIcon size={28} aria-hidden="true" />
          ) : (
            <FilePdfIcon size={28} aria-hidden="true" />
          )}
          <b>{cur.jenis === "tautan" ? "Canva" : "PDF"}</b>
          <span className="hint">
            {cur.jenis === "tautan" ? (
              t.preview
            ) : (
              <>
                <EyeIcon size={14} aria-hidden="true" /> {t.view}
              </>
            )}
          </span>
        </button>
      ) : (
        <div
          className="schem-card__thumb schem-card__embed schem-card__broken"
          role="img"
          aria-label={mode === "link" ? t.emptyLink : t.emptyPdf}
        >
          <PresentationChartIcon size={28} aria-hidden="true" />
          <span className="hint">{mode === "link" ? t.emptyLink : t.emptyPdf}</span>
        </div>
      )}
      <span className="hint mono truncate" title={source}>
        {source}
      </span>
      <SegmentedControl
        fill
        aria-label={`${t.src} ${modulLabel(modul, lang)}`}
        value={mode}
        onValueChange={(v) => setMode(v as "pdf" | "link")}
        options={[
          { value: "pdf", label: t.pdf },
          { value: "link", label: t.canva },
        ]}
      />
      {boleh && (
        <Fade k={mode}>
          {mode === "pdf" && tooBig !== null ? (
            <ErrorView
              code={413}
              lang={lang}
              why={t.bigWhy(String(Math.ceil(tooBig / 1024 / 1024)))}
              todo={t.bigTodo}
              onUseLink={() => {
                setTooBig(null);
                setMode("link");
              }}
              onPickFile={() => {
                setTooBig(null);
                setPick((n) => n + 1);
              }}
            />
          ) : mode === "pdf" ? (
            <FileDrop
              accept={["application/pdf"]}
              maxBytes={20 * 1024 * 1024}
              kinds="PDF"
              busy={busy}
              lang={lang}
              compact
              onFile={(f) => void onFile(f)}
              onTooBig={(f) => setTooBig(f.size)}
              pick={pick}
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
                <span className="field__label">{t.canvaUrl}</span>
                <input
                  className="field__input"
                  type="url"
                  inputMode="url"
                  placeholder="https://canva.link/…"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setMengetik(true);
                  }}
                  onBlur={() => url && setTried(true)}
                  aria-invalid={err ? true : undefined}
                />
                {err && <span className="field__error">{err}</span>}
              </label>
              <label className="field">
                <span className="field__label">{t.canvaName}</span>
                <input
                  className="field__input"
                  maxLength={200}
                  placeholder={t.canvaNamePh}
                  value={namaLink}
                  onChange={(e) => {
                    setNamaLink(e.target.value);
                    setMengetik(true);
                  }}
                />
              </label>
              <button
                type="submit"
                className="btn btn--secondary"
                disabled={busy || !url.trim() || (url.trim() === tautanKini && !namaLink.trim())}
              >
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
