/**
 * A message to one Praktikan about their TP (2026-10-21, the LMS's Kirim
 * Pesan, inside IRIS now): only they see it, on their Dasbor TP card and in
 * the module's TP step, titled with the sender's code. The grader opens it
 * for whoever grades that TP, the TP right and Admins; the earlier messages
 * to them sit below, and a sender takes back their own.
 * POST /api/tp/kabar { sasaran: "satu" }.
 */
import { useEffect, useState } from "react";
import Dialog from "../ui/Dialog";
import { DateField, TimeField } from "../ui/Controls";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { bagiWib, isoWib } from "../../lib/tp";
import { ISI_MAKS } from "../../lib/tp-kabar";
import { waktuPanjang } from "../tp/shared";
import { KS } from "./kabarStrings";
import type { KabarDiKelola } from "./KabarTab";

const tigaHari = () => bagiWib(new Date(Date.now() + 3 * 86_400_000).toISOString());

export default function PesanDialog({
  open,
  onOpenChange,
  lang,
  modul,
  nim,
  nama,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lang: Lang;
  modul: number;
  nim: string;
  nama: string;
}) {
  const t = KS[lang];
  const [isi, setIsi] = useState("");
  const [sampai, setSampai] = useState(tigaHari);
  const [sibuk, setSibuk] = useState(false);
  // Live: another Asisten's message or take-back shows at once.
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; boleh: boolean; kabar: KabarDiKelola[] }>("/api/tp/kabar").then((d) =>
        d.ok ? d : null,
      ),
    300_000,
    open,
    ["tp"],
  );
  const boleh = poll.data?.boleh ?? false;
  const lama = (poll.data?.kabar ?? []).filter((k) => k.sasaran === "satu" && k.nim === nim);
  useEffect(() => {
    if (!open) return;
    setIsi("");
    setSampai(tigaHari());
  }, [open, nim]);

  const kirim = async () => {
    setSibuk(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/tp/kabar", {
      modul,
      sasaran: "satu",
      nim,
      isi: { id: isi, en: "" },
      sampai: isoWib(sampai.tanggal, sampai.jam),
    }).catch(() => ({ ok: false, kode: "" }));
    setSibuk(false);
    window.Toast?.show(r.ok ? t.pesanOk : (t.galat[r.kode ?? ""] ?? t.gagal), r.ok ? "ok" : "warn");
    if (r.ok) onOpenChange(false);
  };
  const tarik = async (id: number) => {
    const r = await postJson<{ ok: boolean }>("/api/tp/kabar-hapus", { id }).catch(() => ({
      ok: false,
    }));
    window.Toast?.show(r.ok ? t.pesanTarikOk : t.gagal, r.ok ? "ok" : "warn");
    if (r.ok) poll.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !sibuk && onOpenChange(o)}
      title={t.pesanH(nama)}
      description={t.pesanDesc(modul)}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={sibuk || !isi.trim()}
            onClick={() => void kirim()}
          >
            {t.pesanKirim}
          </button>
        </>
      }
    >
      <div className="tpwinform">
        <label className="field">
          <span className="field__label">{t.pesanIsi}</span>
          <textarea
            className="field__input field__textarea"
            rows={4}
            maxLength={ISI_MAKS}
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
          />
          <span className="hint">{t.pesanIsiHint}</span>
        </label>
        <div className="field">
          <span className="field__label">{t.sampai}</span>
          <div className="tpwinform__row">
            <DateField
              value={sampai.tanggal}
              onChange={(v) => setSampai({ ...sampai, tanggal: v })}
              label={t.tglSampai}
              lang={lang}
            />
            <TimeField
              value={sampai.jam}
              onChange={(v) => setSampai({ ...sampai, jam: v })}
              label={t.jamSampai}
              lang={lang}
            />
          </div>
        </div>
        {lama.length > 0 && (
          <div className="field">
            <span className="field__label">{t.pesanLama}</span>
            <ul className="tppeserta__list">
              {lama.map((k) => {
                const tampil = !k.sampai || Date.parse(k.sampai) > Date.now();
                return (
                  <li key={k.id} data-selesai={tampil ? undefined : "yes"}>
                    <span className="grow stack" style={{ gap: 0 }}>
                      <span className="tpkabar__isi">{k.isi.id}</span>
                      <span className="hint">
                        {[
                          tampil
                            ? k.sampai
                              ? t.tampilSampai(waktuPanjang(k.sampai, lang))
                              : t.tampilTerus
                            : t.selesai,
                          t.oleh(k.oleh, waktuPanjang(k.pada, lang)),
                        ].join(" · ")}
                      </span>
                    </span>
                    {tampil && (boleh || k.milikku) && (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => void tarik(k.id)}
                      >
                        {t.pesanTarik}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
