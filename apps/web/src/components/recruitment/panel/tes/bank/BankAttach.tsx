/**
 * What a question carries besides its text and key: pictures (uploaded to R2,
 * named in the prompt as `![alt](img:id)`). There are no references.
 */
import { useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { FileDrop } from "../../../../ui/Controls";
import IconButton from "../../../../ui/IconButton";
import Pill from "../../../../ui/Pill";
import type { Lang } from "../../../../../lib/kelas";
import { freshId, imageUse, type Draft } from "../../../../../lib/recruitment/bank-draft";
import { GAMBAR_MAKS, GAMBAR_MIME, kirimGambar } from "../../../../../lib/recruitment/bank-upload";
import type { Tx } from "./BankKeys";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const mediaUrl = (key: string) => `/api/recruitment/media?key=${encodeURIComponent(key)}`;

export function ImagesEditor({
  d,
  set,
  t,
  lang,
}: {
  d: Draft;
  set: (d: Draft) => void;
  t: Tx;
  lang: Lang;
}) {
  const [busy, setBusy] = useState(false);
  const images = d.body.images ?? [];
  const use = imageUse(d.body.prompt, images);
  const put = (next: typeof images, prompt = d.body.prompt) =>
    set({
      ...d,
      body: { ...d.body, prompt, ...(next.length ? { images: next } : { images: undefined }) },
    } as Draft);

  async function pilih(f: File) {
    setBusy(true);
    const r = await kirimGambar(f);
    setBusy(false);
    if (!r.ok) {
      toast(
        r.kode === "belum_diatur"
          ? t.imageNotReady
          : r.kode === "terlalu_besar"
            ? t.imageBig
            : r.kode === "jenis"
              ? t.imageType
              : t.imageFail,
        "danger",
      );
      return;
    }
    const id = freshId(images.map((i) => i.id));
    const alt = f.name.replace(/\.[^.]+$/, "").slice(0, 80);
    put([...images, { id, key: r.key, alt, w: r.w, h: r.h }]);
  }

  return (
    <div className="stack stack--sm">
      <span className="label-caps">{t.images}</span>
      {use.missing.map((id) => (
        <span className="r3err" key={id}>
          {t.imageMissing(id)}
        </span>
      ))}
      {images.length > 0 && (
        <div className="bkimgs">
          {images.map((im) => (
            <div className="bkimg" key={im.id}>
              <img className="bkimg__thumb" src={mediaUrl(im.key)} alt={im.alt} loading="lazy" />
              <div className="bkimg__main">
                <input
                  className="field__input"
                  value={im.alt}
                  maxLength={200}
                  aria-label={t.imageAlt}
                  placeholder={t.imageAlt}
                  onChange={(e) =>
                    put(images.map((x) => (x.id === im.id ? { ...x, alt: e.target.value } : x)))
                  }
                />
                <div className="row">
                  <span className="hint mono">img:{im.id}</span>
                  {use.unused.includes(im.id) ? (
                    <>
                      <Pill>{t.imageUnused}</Pill>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() =>
                          put(
                            images,
                            `${d.body.prompt.replace(/\s+$/, "")}\n\n![${im.alt}](img:${im.id})`,
                          )
                        }
                      >
                        {t.imageInsert}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <IconButton
                sm
                icon={TrashIcon}
                label={t.imageRemove}
                onClick={() => put(images.filter((x) => x.id !== im.id))}
              />
            </div>
          ))}
        </div>
      )}
      <FileDrop
        compact
        accept={[...GAMBAR_MIME]}
        maxBytes={GAMBAR_MAKS}
        kinds={t.imageKinds}
        busy={busy}
        lang={lang}
        onFile={(f) => void pilih(f)}
        dropLabel={t.imageAdd}
      />
    </div>
  );
}
