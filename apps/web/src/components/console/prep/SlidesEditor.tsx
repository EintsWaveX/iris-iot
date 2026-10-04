/**
 * Preparation's Slides tab (Phase 9 Stage 3, mockup c-prep): add a deck as
 * a PDF (straight to Vercel Blob, see api/presentasi/[aksi].ts) or as a
 * Canva view link, and pick the one deck every student's Dashboard shows.
 */
import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { FilePdfIcon, LinkSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { FileDrop } from "../../ui/Controls";
import Confirm from "../../ui/Confirm";
import ErrorView from "../../ui/ErrorView";
import Fade from "../../ui/Fade";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import SegmentedControl from "../../ui/SegmentedControl";
import { dict, getJson, postJson, sejak } from "../../../lib/app";
import { useDirektori } from "../../../lib/people";
import { bacaTautan, TAUTAN_SLIDES } from "../../../lib/tautan";
import type { Lang } from "../../../lib/kelas";

const T = dict({
  id: {
    addTitle: "Tambah Presentasi",
    pdf: "Berkas PDF",
    canva: "Tautan Canva",
    src: "Sumber",
    canvaUrl: "Tautan desain Canva",
    bigWhy: (mb: string) => `Berkas yang kamu pilih ${mb} MB. Batasnya 20 MB.`,
    bigTodo: "Kecilkan PDF-nya, atau pakai tautan Canva.",
    canvaName: "Nama (boleh kosong)",
    canvaNamePh: "Misalnya Pengantar Modul 3",
    canvaHint:
      "Pakai tautan 'Lihat saja' dari tombol Bagikan di Canva. Praktikan melihatnya di Dasbor.",
    add: "Tambahkan",
    added: "Presentasi Canva ditambahkan ke daftar.",
    uploaded: "PDF diunggah.",
    uploadFail: "PDF gagal diunggah. Coba lagi.",
    listTitle: "Daftar Presentasi",
    listSub: "Satu presentasi aktif tampil di Dasbor semua praktikan.",
    empty: "Belum ada presentasi.",
    by: (who: string, when: string) => `${who} · ${when}`,
    active: "Aktif",
    makeActive: "Aktifkan",
    switched: (n: string) => `${n} sekarang tampil di Dasbor.`,
    del: "Hapus",
    delTitle: "Hapus Presentasi Ini?",
    delBody: "Praktikan tidak lagi melihatnya di Dasbor.",
    delFile: "Berkasnya juga dihapus dari penyimpanan dan tidak bisa dikembalikan.",
    deleted: "Presentasi dihapus.",
    fail: "Gagal. Coba lagi.",
    errors: {
      bukan_tautan: "Ini bukan tautan https.",
      canva_edit:
        "Ini tautan untuk mengedit. Ambil tautan 'Lihat saja' dari tombol Bagikan di Canva.",
      tidak_didukung: "Yang diterima cuma tautan desain Canva.",
    } as Record<string, string>,
  },
  en: {
    addTitle: "Add Slides",
    pdf: "PDF File",
    canva: "Canva Link",
    src: "Source",
    canvaUrl: "Canva design link",
    bigWhy: (mb: string) => `The file you chose is ${mb} MB. The limit is 20 MB.`,
    bigTodo: "Shrink the PDF, or use a Canva link.",
    canvaName: "Name (optional)",
    canvaNamePh: "For example Module 3 intro",
    canvaHint:
      "Use the view-only link from Canva's Share button. Students see the slides on their Dashboard.",
    add: "Add",
    added: "Canva slides added to the list.",
    uploaded: "PDF uploaded.",
    uploadFail: "Couldn't upload the PDF. Try again.",
    listTitle: "Slides",
    listSub: "One active deck shows on every student's Dashboard.",
    empty: "No slides yet.",
    by: (who: string, when: string) => `${who} · ${when}`,
    active: "Active",
    makeActive: "Make Active",
    switched: (n: string) => `${n} now shows on the Dashboard.`,
    del: "Delete",
    delTitle: "Delete These Slides?",
    delBody: "Students stop seeing them on their Dashboard.",
    delFile: "The file also leaves storage for good.",
    deleted: "Slides deleted.",
    fail: "That didn't work. Try again.",
    errors: {
      bukan_tautan: "That isn't an https link.",
      canva_edit: "That's an edit link. Take the view-only link from Canva's Share button.",
      tidak_didukung: "Only Canva design links work here.",
    } as Record<string, string>,
  },
  zh: {
    addTitle: "添加演示文稿",
    pdf: "PDF 文件",
    canva: "Canva 链接",
    src: "来源",
    canvaUrl: "Canva 设计链接",
    bigWhy: (mb: string) => `你选的文件有 ${mb} MB，上限是 20 MB。`,
    bigTodo: "把 PDF 压小一点，或者改用 Canva 链接。",
    canvaName: "名称（可不填）",
    canvaNamePh: "例如：模块 3 导读",
    canvaHint: "请用 Canva 分享按钮里的“仅查看”链接。学生会在仪表板上看到。",
    add: "添加",
    added: "Canva 演示文稿已加入列表。",
    uploaded: "PDF 已上传。",
    uploadFail: "PDF 上传失败，请再试一次。",
    listTitle: "演示文稿列表",
    listSub: "启用的那一份会显示在所有学生的仪表板上。",
    empty: "还没有演示文稿。",
    by: (who: string, when: string) => `${who} · ${when}`,
    active: "启用中",
    makeActive: "启用",
    switched: (n: string) => `${n} 现在显示在仪表板上。`,
    del: "删除",
    delTitle: "删除这份演示文稿？",
    delBody: "学生在仪表板上将看不到它。",
    delFile: "文件也会从存储中永久删除。",
    deleted: "演示文稿已删除。",
    fail: "没有成功，请再试一次。",
    errors: {
      bukan_tautan: "这不是 https 链接。",
      canva_edit: "这是编辑链接。请用 Canva 分享按钮里的“仅查看”链接。",
      tidak_didukung: "这里只接受 Canva 设计链接。",
    } as Record<string, string>,
  },
});

interface Deck {
  id: number;
  namaBerkas: string;
  url: string;
  jenis: "berkas" | "tautan";
  diunggahOleh: string;
  diunggahPada: string;
  aktif: boolean;
}

/** "https://www.canva.com/design/DAF8xQ2.../view?embed" -> "canva.com/design/DAF8xQ2…" */
function pendek(url: string): string {
  const m = /canva\.com\/design\/([^/]+)/.exec(url);
  return m ? `canva.com/design/${m[1].slice(0, 8)}…` : url;
}

export default function SlidesEditor({ lang }: { lang: Lang }) {
  const t = T[lang];
  const dir = useDirektori();
  const [list, setList] = useState<Deck[] | null>(null);
  const [src, setSrc] = useState<"pdf" | "canva">("pdf");
  // A PDF over 20 MB shows the 413 view: switch to a link, or pick again.
  const [tooBig, setTooBig] = useState<number | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [nama, setNama] = useState("");
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState<Deck | null>(null);

  const load = () =>
    getJson<{ ok: boolean; daftar: Deck[] }>("/api/presentasi/daftar")
      .then((d) => setList(d.ok ? d.daftar : []))
      .catch(() => setList([]));
  useEffect(() => void load(), []);

  const cek = bacaTautan(url, TAUTAN_SLIDES);
  const err = tried && !cek.ok ? t.errors[cek.kode] : null;

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

  async function addLink() {
    setTried(true);
    if (!cek.ok) return;
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/presentasi/tautan", {
      url,
      nama,
    }).catch(() => ({ ok: false, kode: undefined }));
    setBusy(false);
    if (!r.ok) return window.Toast?.show(t.errors[r.kode ?? ""] ?? t.fail, "danger");
    window.Toast?.show(t.added, "ok");
    setUrl("");
    setNama("");
    setTried(false);
    void load();
  }

  async function activate(d: Deck) {
    const r = await postJson<{ ok: boolean }>("/api/presentasi/aktifkan", { id: d.id }).catch(
      () => ({ ok: false }),
    );
    window.Toast?.show(r.ok ? t.switched(d.namaBerkas) : t.fail, r.ok ? "ok" : "danger");
    void load();
  }

  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel__head">
          <h3 className="panel__title">{t.addTitle}</h3>
        </div>
        <SegmentedControl
          fill
          aria-label={t.src}
          value={src}
          onValueChange={(v) => setSrc(v as "pdf" | "canva")}
          options={[
            { value: "pdf", label: t.pdf },
            { value: "canva", label: t.canva },
          ]}
        />
        <Fade k={src}>
          {src === "pdf" && tooBig !== null ? (
            <ErrorView
              code={413}
              lang={lang}
              why={t.bigWhy(String(Math.ceil(tooBig / 1024 / 1024)))}
              todo={t.bigTodo}
              onUseLink={() => {
                setTooBig(null);
                setSrc("canva");
              }}
              onPickFile={() => {
                setTooBig(null);
                setPick((n) => n + 1);
              }}
            />
          ) : src === "pdf" ? (
            <FileDrop
              accept={["application/pdf"]}
              maxBytes={20 * 1024 * 1024}
              kinds="PDF"
              busy={busy}
              lang={lang}
              onFile={(f) => void onFile(f)}
              onTooBig={(f) => setTooBig(f.size)}
              pick={pick}
            />
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void addLink();
              }}
            >
              <label className="field" data-invalid={err ? "yes" : undefined}>
                <span className="field__label">{t.canvaUrl}</span>
                <input
                  className="field__input"
                  type="url"
                  inputMode="url"
                  placeholder="https://www.canva.com/design/…/view"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={() => url && setTried(true)}
                  aria-invalid={err ? true : undefined}
                />
                {err ? (
                  <span className="field__error">{err}</span>
                ) : (
                  <span className="field__hint">{t.canvaHint}</span>
                )}
              </label>
              <label className="field">
                <span className="field__label">{t.canvaName}</span>
                <input
                  className="field__input"
                  maxLength={200}
                  placeholder={t.canvaNamePh}
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                />
              </label>
              <div className="panel__actions panel__actions--end">
                <button type="submit" className="btn btn--primary" disabled={busy || !url.trim()}>
                  <PlusIcon size={18} aria-hidden="true" />
                  {t.add}
                </button>
              </div>
            </form>
          )}
        </Fade>
      </section>

      <section className="panel">
        <div className="panel__head">
          <div className="stack stack--sm">
            <h3 className="panel__title">{t.listTitle}</h3>
            <p className="panel__sub">{t.listSub}</p>
          </div>
        </div>
        {list === null ? (
          <span className="skeleton" style={{ height: 112 }} />
        ) : list.length === 0 ? (
          <p className="hint">{t.empty}</p>
        ) : (
          <ul className="lib">
            {list.map((d) => {
              const Ico = d.jenis === "tautan" ? LinkSimpleIcon : FilePdfIcon;
              return (
                <li key={d.id} className="lib__row" data-aktif={d.aktif ? "yes" : undefined}>
                  <Ico size={20} aria-hidden="true" className="lib__icon" data-jenis={d.jenis} />
                  <span className="grow stack" style={{ gap: 2 }}>
                    <a
                      href={d.jenis === "tautan" ? d.url.replace(/\?embed$/, "") : d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="lib__name truncate"
                    >
                      {d.namaBerkas}
                    </a>
                    <span className="hint truncate">
                      {d.jenis === "tautan" ? `${pendek(d.url)} · ` : ""}
                      {t.by(dir.nama(d.diunggahOleh), sejak(d.diunggahPada, lang))}
                    </span>
                  </span>
                  {d.aktif ? (
                    <Pill tone="ok">{t.active}</Pill>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => void activate(d)}
                    >
                      {t.makeActive}
                    </button>
                  )}
                  <IconButton
                    icon={TrashIcon}
                    label={`${t.del} ${d.namaBerkas}`}
                    kind="danger"
                    sm
                    onClick={() => setDel(d)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Confirm
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t.delTitle}
        body={
          del
            ? `${del.namaBerkas}. ${t.delBody}${del.jenis === "berkas" ? ` ${t.delFile}` : ""}`
            : ""
        }
        confirmLabel={t.del}
        lang={lang}
        onConfirm={async () => {
          if (!del) return;
          const r = await postJson<{ ok: boolean }>("/api/presentasi/hapus", { id: del.id }).catch(
            () => ({ ok: false }),
          );
          window.Toast?.show(r.ok ? t.deleted : t.fail, r.ok ? "ok" : "danger");
          await load();
        }}
      />
    </div>
  );
}
