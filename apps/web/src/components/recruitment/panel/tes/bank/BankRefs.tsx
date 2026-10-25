/**
 * Referensi (prompt 09, EXAM-ENGINE 8): pages a candidate may open while a
 * part runs, kept as a cleaned static copy in R2. Added from a link (the
 * server fetches it, checking every address it follows), or uploaded as an
 * .html file. Each is attached to a whole part or to single questions (the
 * question's own editor does the latter). The preview opens the very
 * document a seat gets, in a sandboxed frame.
 */
import { useState } from "react";
import { ArrowsClockwiseIcon, EyeIcon } from "@phosphor-icons/react";
import Confirm from "../../../../ui/Confirm";
import { FileDrop } from "../../../../ui/Controls";
import Dialog from "../../../../ui/Dialog";
import Pill from "../../../../ui/Pill";
import type { Lang } from "../../../../../lib/kelas";
import type {
  Attachments,
  ReferenceRow,
  ReferencesResponse,
} from "../../../../../lib/recruitment/bank-api";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { PHASE1_PARTS, type Phase1Part } from "../../../../../lib/recruitment/exam-types";
import { tanggalWib } from "../../../../../lib/recruitment/gates";
import { tgl } from "../../../shared";
import { BK } from "./bankStrings";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const hm = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 16);
const MAX_HTML = 6 * 1024 * 1024;

export default function BankRefs({
  lang,
  data,
  refresh,
}: {
  lang: Lang;
  data: ReferencesResponse;
  refresh: () => void;
}) {
  const t = BK[lang];
  const [addOpen, setAddOpen] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [view, setView] = useState<ReferenceRow | null>(null);
  const [del, setDel] = useState<ReferenceRow | null>(null);
  const [busy, setBusy] = useState<number | "add" | "up" | null>(null);
  const [url, setUrl] = useState("");
  const [selector, setSelector] = useState("");
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState<{ name: string; text: string } | null>(null);
  const [fail, setFail] = useState("");

  const att: Attachments = data.attachments;
  const onPart = (id: number, p: Phase1Part) => (att.partRefs[p] ?? []).includes(id);
  const uses = (id: number) => att.questionRefs.filter((q) => q.refs.includes(id)).length;
  const err = (kode: string) => t.refErr[kode] ?? t.refErr.other;

  function close() {
    setAddOpen(false);
    setUpOpen(false);
    setUrl("");
    setSelector("");
    setTitle("");
    setHtml(null);
    setFail("");
  }

  async function tambah() {
    setBusy("add");
    setFail("");
    const r = await recPost<{ ok: true }>("reference-add", {
      url: url.trim(),
      ...(selector.trim() ? { selector: selector.trim() } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
    });
    setBusy(null);
    if (isFail(r)) return setFail(err(r.kode));
    toast(t.refAdded);
    close();
    refresh();
  }

  async function unggah() {
    if (!html) return;
    setBusy("up");
    setFail("");
    const r = await recPost<{ ok: true }>("reference-upload", {
      html: html.text,
      ...(url.trim() ? { url: url.trim() } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
    });
    setBusy(null);
    if (isFail(r)) return setFail(err(r.kode));
    toast(t.refUploaded);
    close();
    refresh();
  }

  async function ambilUlang(r: ReferenceRow) {
    setBusy(r.id);
    const x = await recPost<{ ok: true }>("reference-refetch", { id: r.id });
    setBusy(null);
    if (isFail(x)) toast(err(x.kode), "danger");
    else toast(t.refRefetched);
    refresh();
  }

  async function lampir(r: ReferenceRow, p: Phase1Part, on: boolean) {
    const x = await recPost<{ ok: true }>("reference-attach", { id: r.id, part: p, on });
    if (isFail(x)) toast(err(x.kode), "danger");
    refresh();
  }

  async function hapus(r: ReferenceRow): Promise<boolean> {
    const x = await recPost<{ ok: true }>("reference-delete", { id: r.id });
    if (isFail(x)) {
      toast(err(x.kode), "danger");
      return false;
    }
    toast(t.refDeleted);
    refresh();
    return true;
  }

  return (
    <div className="stack">
      <div className="row row--between" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 2, maxWidth: 640 }}>
          <h2 className="h-title" style={{ margin: 0 }}>
            {t.refTitle}
          </h2>
          <span className="hint">{t.refLede}</span>
        </div>
        <div className="row r3bank__acts">
          <button type="button" className="btn btn--inverse" onClick={() => setUpOpen(true)}>
            {t.refUpload}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setAddOpen(true)}>
            {t.refAddUrl}
          </button>
        </div>
      </div>

      {data.references.length === 0 ? (
        <p className="empty-note">{t.refEmpty}</p>
      ) : (
        <div className="r3refs">
          {data.references.map((r) => (
            <article
              className="r3ref"
              key={r.id}
              data-bad={r.status === "gagal" || r.error ? "yes" : "no"}
            >
              <div className="r3ref__top">
                <div className="r3ref__main">
                  <b>{r.title}</b>
                  {r.url && <span className="hint r3ref__url">{r.url}</span>}
                  <span className="hint">
                    {r.fetchedAt
                      ? t.refFetched(
                          `${tgl(tanggalWib(new Date(r.fetchedAt)).tanggal, lang)} ${hm(r.fetchedAt)}`,
                        )
                      : ""}
                    {r.bytes ? ` · ${t.refSize(Math.max(1, Math.round(r.bytes / 1024)))}` : ""} ·{" "}
                    {t.refQuestions(uses(r.id))}
                  </span>
                  {r.error && <span className="r3err">{r.error}</span>}
                </div>
                <div className="r3ref__acts">
                  <Pill tone={r.status === "ok" ? "ok" : "danger"}>
                    {r.status === "ok" ? t.refStatusOk : t.refStatusFail}
                  </Pill>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setView(r)}
                  >
                    <EyeIcon size={16} aria-hidden="true" /> {t.refView}
                  </button>
                  {r.url && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy === r.id}
                      onClick={() => void ambilUlang(r)}
                    >
                      <ArrowsClockwiseIcon size={16} aria-hidden="true" /> {t.refRefetch}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--danger-soft btn--sm"
                    onClick={() => setDel(r)}
                  >
                    {t.refDelete}
                  </button>
                </div>
              </div>
              <div className="stack stack--sm">
                <span className="hint">{t.refPartsLabel}</span>
                <div className="rec-chips">
                  {PHASE1_PARTS.map((p) => (
                    <Pill
                      key={p}
                      pressed={onPart(r.id, p)}
                      onClick={() => void lampir(r, p, !onPart(r.id, p))}
                    >
                      {t.parts[p]}
                    </Pill>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(o) => !busy && !o && close()}
        title={t.refAddUrl}
        lang={lang}
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy === "add"}
              onClick={close}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy === "add" || !/^https?:\/\//i.test(url.trim())}
              onClick={() => void tambah()}
            >
              {busy === "add" ? t.refFetching : t.refFetch}
            </button>
          </>
        }
      >
        <div className="stack">
          <label className="stack stack--sm">
            <span className="label-caps">{t.refUrl}</span>
            <input
              className="field__input"
              id="r3-ref-url"
              type="url"
              inputMode="url"
              placeholder={t.refUrlPh}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.refSelector}</span>
            <input
              className="field__input"
              id="r3-ref-sel"
              value={selector}
              maxLength={200}
              onChange={(e) => setSelector(e.target.value)}
            />
            <span className="hint">{t.refSelectorHint}</span>
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.refTitleField}</span>
            <input
              className="field__input"
              id="r3-ref-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {fail && (
            <span className="r3err" role="alert">
              {fail}
            </span>
          )}
        </div>
      </Dialog>

      <Dialog
        open={upOpen}
        onOpenChange={(o) => !busy && !o && close()}
        title={t.refUploadTitle}
        description={t.refUploadDesc}
        lang={lang}
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy === "up"}
              onClick={close}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy === "up" || !html}
              onClick={() => void unggah()}
            >
              {busy === "up" ? t.refFetching : t.refUpload}
            </button>
          </>
        }
      >
        <div className="stack">
          {html ? (
            <div className="r3drop">
              <b>{html.name}</b>
              <span className="grow" />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setHtml(null)}
              >
                {t.importChange}
              </button>
            </div>
          ) : (
            <FileDrop
              accept={[".html", ".htm", "text/html"]}
              maxBytes={MAX_HTML}
              kinds={t.refFileKinds}
              lang={lang}
              dropLabel={t.refFile}
              onFile={(f) => void f.text().then((text) => setHtml({ name: f.name, text }))}
            />
          )}
          <label className="stack stack--sm">
            <span className="label-caps">{t.refUploadUrl}</span>
            <input
              className="field__input"
              type="url"
              inputMode="url"
              placeholder={t.refUrlPh}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="stack stack--sm">
            <span className="label-caps">{t.refTitleField}</span>
            <input
              className="field__input"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {fail && (
            <span className="r3err" role="alert">
              {fail}
            </span>
          )}
        </div>
      </Dialog>

      <Dialog
        open={!!view}
        onOpenChange={(o) => !o && setView(null)}
        title={view ? `${t.refViewTitle}: ${view.title}` : t.refViewTitle}
        description={t.refViewNote}
        size="xl"
        lang={lang}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setView(null)}>
            {t.close}
          </button>
        }
      >
        {view && (
          <iframe
            className="r3ref__frame"
            title={view.title}
            sandbox=""
            referrerPolicy="no-referrer"
            src={`/api/recruitment/ref?id=${view.id}`}
          />
        )}
      </Dialog>

      <Confirm
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t.refDeleteTitle}
        body={t.refDeleteBody}
        confirmLabel={t.refDelete}
        cancelLabel={t.cancel}
        lang={lang}
        onConfirm={() => (del ? hapus(del) : undefined)}
      />
    </div>
  );
}
