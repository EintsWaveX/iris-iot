/**
 * Sumber LMS, 2026-10-13: the "TP Modul N" assignments IRIS makes, matches
 * and deletes in every class course itself (KelolaDialog; since 2026-10-14
 * Buat and Samakan attach the saved set's PDF too), and who counts
 * in TP (PesertaPanel): IRIS's registered Praktikan only, with the
 * students the LMS alone has, the registered ones in no class course, and
 * a hand-kept exclusion list. Changing either is for the Pencipta, the
 * Admins and the ASO division.
 */
import { useEffect, useState } from "react";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  CircleNotchIcon,
  KeyIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Confirm from "../ui/Confirm";
import Disclose from "../ui/Disclose";
import IconButton from "../ui/IconButton";
import { Switch } from "../ui/Controls";
import { getJson, postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { tanggalSama, teksTugasLms, type JendelaTp } from "../../lib/tp";
import { waktuPanjang, type PaketData } from "../tp/shared";
import { pembuatPdfLms, type PdfLms } from "../tp/pdfLms";
import { LK } from "./lmsKelolaStrings";

export interface TugasInfo {
  id: number;
  cmid: number;
  nama: string;
  buka: string | null;
  tutup: string | null;
}
export interface KursusKelola {
  id: number;
  nama: string;
  label: string;
  kelas: string;
  peserta: number;
  tugas: Record<string, TugasInfo | null>;
}
export interface KelolaInfo {
  boleh: boolean;
  siap: boolean;
  sesiPada: string | null;
  jendela: Record<string, JendelaTp | null>;
}
export interface PesertaInfo {
  terdaftar: number;
  cocok: number;
  luar: { nim: string | null; nama: string; kursus: string }[] | null;
  tanpaLms: { nim: string; nama: string; kelas: string }[] | null;
  kecuali: { nim: string; nama: string; alasan: string; oleh: string; pada: string }[];
}

type Keadaan = "sesuai" | "beda" | "belum";
type Jalan =
  { s: "jalan" } | { s: "ok"; cocok: boolean } | { s: "gagal"; kode: string; rinci?: string };

export function keadaanTugas(t: TugasInfo | null, j: JendelaTp | null): Keadaan {
  if (!t) return "belum";
  return j && tanggalSama(t, j) ? "sesuai" : "beda";
}

/* ======================================================== KelolaDialog */

export function KelolaDialog({
  open,
  onOpenChange,
  lang,
  modul,
  kursus,
  kelola,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  modul: number;
  kursus: KursusKelola[];
  kelola: KelolaInfo;
  onDone: () => void;
}) {
  const t = LK[lang];
  const j = kelola.jendela[String(modul)] ?? null;
  const [tampil, setTampil] = useState(true);
  const [lampir, setLampir] = useState(true);
  const [teksReg, setTeksReg] = useState("");
  const [teksInt, setTeksInt] = useState("");
  const [jalan, setJalan] = useState<Record<number, Jalan>>({});
  const [sibuk, setSibuk] = useState(false);
  const [hapus, setHapus] = useState<KursusKelola[] | null>(null);

  const bisa = kelola.boleh && kelola.siap;
  const baris = kursus.map((k) => ({ k, t: k.tugas[String(modul)] ?? null }));
  const belum = baris.filter((b) => !b.t).map((b) => b.k);
  const ada = baris.filter((b) => b.t).map((b) => b.k);
  const beda = baris.filter((b) => keadaanTugas(b.t, j) === "beda").map((b) => b.k);

  // Each opening starts from the default text for the window and no results.
  const tutupJendela = j?.tutup ?? null;
  useEffect(() => {
    if (!open) return;
    setTampil(true);
    setLampir(true);
    setTeksReg(tutupJendela ? teksTugasLms(modul, tutupJendela, "id") : "");
    setTeksInt(tutupJendela ? teksTugasLms(modul, tutupJendela, "en") : "");
    setJalan({});
  }, [open, modul, tutupJendela]);

  const jalankan = async (daftar: KursusKelola[], langkah: "buat" | "ubah" | "hapus") => {
    setSibuk(true);
    let ok = 0;
    let gagal = 0;
    let belumSama = false;
    // The saved set's PDF, made once per class kind for the batch.
    let pdfUntuk: ((kelas: string) => Promise<PdfLms>) | null = null;
    if (lampir && langkah !== "hapus") {
      const d = await getJson<PaketData>(`/api/tp/paket?modul=${modul}`).catch(() => null);
      if (d?.ok) pdfUntuk = pembuatPdfLms(d);
      else {
        setSibuk(false);
        window.Toast?.show(t.pdfGagal, "warn");
        return;
      }
    }
    for (const k of daftar) {
      setJalan((x) => ({ ...x, [k.id]: { s: "jalan" } }));
      type Jawab = { ok: boolean; kode?: string; rinci?: string; cocok?: boolean };
      let pdf: PdfLms | undefined;
      try {
        pdf = pdfUntuk ? await pdfUntuk(k.kelas) : undefined;
      } catch {
        setJalan((x) => ({ ...x, [k.id]: { s: "gagal", kode: "pdf" } }));
        window.Toast?.show(t.pdfGagal, "warn");
        break;
      }
      const r = await postJson<Jawab>("/api/tp/lms-tugas", {
        modul,
        kursus: k.id,
        langkah,
        tampil,
        teks: k.kelas === "inter" ? teksInt : teksReg,
        ...(pdf ? { pdf } : {}),
      }).catch((): Jawab => ({ ok: false, kode: "lms_tak_terjangkau" }));
      if (r.ok) {
        ok++;
        if (!r.cocok) belumSama = true;
        setJalan((x) => ({ ...x, [k.id]: { s: "ok", cocok: !!r.cocok } }));
      } else {
        gagal++;
        setJalan((x) => ({
          ...x,
          [k.id]: { s: "gagal", kode: r.kode ?? "", rinci: r.rinci },
        }));
        // The same refusal would meet every class: stop at the first.
        if (
          [
            "perlu_kunci_privat",
            "lms_invalidprivatetoken",
            "lms_autologinkeygenerationlockout",
            "lms_masuk_gagal",
            "tidak_berhak",
            "belum_tersambung",
          ].includes(r.kode ?? "")
        )
          break;
      }
    }
    setSibuk(false);
    window.Toast?.show(
      belumSama && !gagal ? t.tanggalBelumSama : t.selesai(ok, gagal),
      gagal || belumSama ? "warn" : "ok",
    );
    onDone();
  };

  const keadaanSel = (k: KursusKelola, tg: TugasInfo | null) => {
    const r = jalan[k.id];
    if (r?.s === "jalan")
      return (
        <span className="tpkel__st" data-s="jalan">
          <CircleNotchIcon size={14} className="ctl-spin" aria-hidden="true" />
          {t.st.jalan}
        </span>
      );
    if (r?.s === "gagal")
      return (
        <span className="tpkel__st" data-s="gagal" title={r.rinci}>
          <XIcon size={14} aria-hidden="true" />
          {t.gagalDengan(r.kode, t.galat)}
        </span>
      );
    const s = keadaanTugas(tg, j);
    return (
      <span className="tpkel__st" data-s={s}>
        {s === "sesuai" ? (
          <CheckIcon size={14} aria-hidden="true" />
        ) : (
          <WarningIcon size={14} aria-hidden="true" />
        )}
        {t.st[s]}
      </span>
    );
  };

  const utama = belum.length ? (
    <button
      type="button"
      className="btn btn--primary"
      disabled={!bisa || !j || sibuk}
      onClick={() => void jalankan(belum, "buat")}
    >
      {t.buat(belum.length)}
    </button>
  ) : (
    <button
      type="button"
      className="btn btn--primary"
      disabled={!bisa || !j || sibuk || !ada.length}
      onClick={() => void jalankan(ada, "ubah")}
    >
      {beda.length || ada.length ? t.samakan(ada.length) : t.semuaSesuai}
    </button>
  );

  const hapusSemua = (
    <button
      type="button"
      className="btn btn--danger-soft"
      disabled={!bisa || sibuk}
      onClick={() => setHapus(ada)}
    >
      {t.hapusSemua}
    </button>
  );
  const tutup = (
    <button
      type="button"
      className="btn btn--ghost"
      disabled={sibuk}
      onClick={() => onOpenChange(false)}
    >
      {t.tutup}
    </button>
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!sibuk) onOpenChange(v);
        }}
        title={t.kelolaH(modul)}
        description={t.kelolaLede}
        size="lg"
        lang={lang}
        foot={belum.length && ada.length ? "22" : ada.length ? "12" : "row"}
        actions={
          belum.length > 0 && ada.length > 0 ? (
            // "22": Samakan | Buat, then Hapus | Tutup
            <>
              <button
                type="button"
                className="btn"
                disabled={!bisa || !j || sibuk}
                onClick={() => void jalankan(ada, "ubah")}
              >
                {t.samakan(ada.length)}
              </button>
              {utama}
              {hapusSemua}
              {tutup}
            </>
          ) : ada.length > 0 ? (
            // "12": Samakan across the top, then Hapus | Tutup
            <>
              {utama}
              {hapusSemua}
              {tutup}
            </>
          ) : (
            <>
              {tutup}
              {utama}
            </>
          )
        }
      >
        <div className="stack tpkel">
          {!kelola.boleh ? (
            <div className="banner">
              <KeyIcon size={20} aria-hidden="true" />
              <span>{t.tidakBoleh}</span>
            </div>
          ) : !kelola.siap ? (
            <div className="banner banner--warn">
              <KeyIcon size={20} aria-hidden="true" />
              <span className="stack stack--sm">
                <b>{t.perluKunciH}</b>
                <span>{t.perluKunciBody}</span>
              </span>
            </div>
          ) : (
            <p className="hint">{t.satuSesi}</p>
          )}
          <dl className="tpdl tpdl--one">
            <div>
              <dt>{t.jendela}</dt>
              <dd>
                {j
                  ? t.jendelaIsi(waktuPanjang(j.buka, lang), waktuPanjang(j.tutup, lang))
                  : t.tanpaJendela}
              </dd>
            </div>
          </dl>
          <div className="tpscroll">
            <table className="tptable tpkel__table">
              <thead>
                <tr>
                  <th>{t.kelas}</th>
                  <th>{t.keadaan}</th>
                  <th aria-label={t.hapus} />
                </tr>
              </thead>
              <tbody>
                {baris.map(({ k, t: tg }) => (
                  <tr key={k.id}>
                    <td>
                      <b className="mono">{k.label}</b>
                    </td>
                    <td>
                      <div className="tpkel__cell">
                        {keadaanSel(k, tg)}
                        {tg?.buka && tg.tutup && keadaanTugas(tg, j) === "beda" && (
                          <span className="hint">
                            {t.tanggalLms(
                              waktuPanjang(tg.buka, lang),
                              waktuPanjang(tg.tutup, lang),
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="num">
                      {tg && (
                        <span className="row row--nowrap tpkel__aksi">
                          <IconButton
                            icon={ArrowsClockwiseIcon}
                            label={t.samakan(1)}
                            sm
                            disabled={!bisa || !j || sibuk}
                            onClick={() => void jalankan([k], "ubah")}
                          />
                          <IconButton
                            icon={TrashIcon}
                            label={t.hapusSatu(k.label)}
                            kind="danger"
                            sm
                            disabled={!bisa || sibuk}
                            onClick={() => setHapus([k])}
                          />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row tpkel__tampil">
            <Switch on={tampil} onChange={setTampil} label={t.tampil} showLabel disabled={sibuk} />
            <span className="hint">{t.tampilHint}</span>
          </div>
          <div className="row tpkel__tampil">
            <Switch on={lampir} onChange={setLampir} label={t.lampir} showLabel disabled={sibuk} />
            <span className="hint">{t.lampirHint}</span>
          </div>
          <label className="field">
            <span className="field__label">{t.teksReg}</span>
            <textarea
              className="field__input"
              rows={3}
              value={teksReg}
              disabled={sibuk}
              onChange={(e) => setTeksReg(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{t.teksInt}</span>
            <textarea
              className="field__input"
              rows={3}
              value={teksInt}
              disabled={sibuk}
              onChange={(e) => setTeksInt(e.target.value)}
            />
            <span className="field__hint">{t.teksHint}</span>
          </label>
        </div>
      </Dialog>
      <Confirm
        open={!!hapus}
        onOpenChange={(v) => !v && setHapus(null)}
        title={
          hapus?.length === 1
            ? t.hapusSatuJudul(modul, hapus[0].label)
            : t.hapusJudul(modul, hapus?.length ?? 0)
        }
        body={t.hapusBody}
        confirmLabel={t.hapus}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() => {
          const d = hapus ?? [];
          setHapus(null);
          void jalankan(d, "hapus");
        }}
      />
    </>
  );
}

/* ======================================================== PesertaPanel */

export function PesertaPanel({
  lang,
  peserta,
  boleh,
  onDone,
}: {
  lang: Lang;
  peserta: PesertaInfo;
  boleh: boolean;
  onDone: () => void;
}) {
  const t = LK[lang];
  const [nim, setNim] = useState("");
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const kec = new Set(peserta.kecuali.map((k) => k.nim));

  const kirim = async (n: string, hapus: boolean, why = "") => {
    setSibuk(n);
    const r = await postJson<{ ok: boolean; kode?: string }>(
      "/api/tp/kecuali",
      hapus ? { nim: n, hapus: true } : { nim: n, alasan: why },
    ).catch(() => ({ ok: false, kode: "lms_tak_terjangkau" }));
    setSibuk(null);
    window.Toast?.show(
      r.ok ? (hapus ? t.ikutkanOk : t.kecualiOk) : t.gagalDengan(r.kode ?? "", t.galat),
      r.ok ? "ok" : "warn",
    );
    if (r.ok && !hapus && n === nim.trim()) {
      setNim("");
      setAlasan("");
    }
    if (r.ok) onDone();
  };

  const dihitung = peserta.terdaftar - peserta.kecuali.length;
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.pesertaH}</h2>
        <span className="hint">{t.pesertaLede}</span>
      </div>
      <dl className="tpdl tppeserta__n">
        <div>
          <dt>{t.terdaftar}</dt>
          <dd className="mono">{peserta.terdaftar}</dd>
        </div>
        <div>
          <dt>{t.dihitung}</dt>
          <dd className="mono">{dihitung}</dd>
        </div>
        <div>
          <dt>{t.cocok}</dt>
          <dd className="mono">{peserta.cocok}</dd>
        </div>
        <div>
          <dt>{t.luar}</dt>
          <dd className="mono">{peserta.luar?.length ?? "…"}</dd>
        </div>
        <div>
          <dt>{t.tanpaLms}</dt>
          <dd className="mono">{peserta.tanpaLms?.length ?? "…"}</dd>
        </div>
        <div>
          <dt>{t.dikecualikan}</dt>
          <dd className="mono">{peserta.kecuali.length}</dd>
        </div>
      </dl>

      <Disclose head={`${t.tanpaLms} (${peserta.tanpaLms?.length ?? 0})`}>
        <p className="hint">{t.tanpaLmsHint}</p>
        {peserta.tanpaLms === null ? (
          <p className="hint">{t.belumData}</p>
        ) : !peserta.tanpaLms.length ? (
          <p className="hint">{t.kosong}</p>
        ) : (
          <ul className="tppeserta__list">
            {peserta.tanpaLms.map((p) => (
              <li key={p.nim}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <b>{p.nama}</b>
                  <span className="hint mono">
                    {p.nim} · {p.kelas}
                  </span>
                </span>
                {boleh &&
                  (kec.has(p.nim) ? (
                    <span className="hint">{t.pill}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={sibuk !== null}
                      onClick={() => void kirim(p.nim, false)}
                    >
                      {t.kecualikan}
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </Disclose>

      <Disclose head={`${t.luar} (${peserta.luar?.length ?? 0})`}>
        <p className="hint">{t.luarHint}</p>
        {peserta.luar === null ? (
          <p className="hint">{t.belumData}</p>
        ) : !peserta.luar.length ? (
          <p className="hint">{t.kosong}</p>
        ) : (
          <ul className="tppeserta__list">
            {peserta.luar.map((p, i) => (
              <li key={`${p.nim ?? p.nama}-${i}`}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <b>{p.nama}</b>
                  <span className="hint mono">
                    {p.nim ?? t.tanpaNim} · {p.kursus}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Disclose>

      <Disclose head={`${t.dikecualikan} (${peserta.kecuali.length})`}>
        <p className="hint">{t.kecualiHint}</p>
        {peserta.kecuali.length ? (
          <ul className="tppeserta__list">
            {peserta.kecuali.map((k) => (
              <li key={k.nim}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <b>{k.nama}</b>
                  <span className="hint">
                    <span className="mono">{k.nim}</span>
                    {k.alasan ? ` · ${k.alasan}` : ""} ·{" "}
                    {t.oleh(k.oleh, waktuPanjang(k.pada, lang))}
                  </span>
                </span>
                {boleh && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={sibuk !== null}
                    onClick={() => void kirim(k.nim, true)}
                  >
                    {t.ikutkan}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t.kosong}</p>
        )}
        {boleh && (
          <form
            className="tppeserta__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (nim.trim()) void kirim(nim.trim(), false, alasan);
            }}
          >
            <label className="field">
              <span className="field__label">{t.kecualiNim}</span>
              <input
                className="field__input mono"
                inputMode="numeric"
                autoComplete="off"
                value={nim}
                onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className="field">
              <span className="field__label">{t.kecualiAlasan}</span>
              <input
                className="field__input"
                value={alasan}
                maxLength={200}
                onChange={(e) => setAlasan(e.target.value)}
              />
            </label>
            <button type="submit" className="btn" disabled={!nim.trim() || sibuk !== null}>
              {t.kecualikan}
            </button>
          </form>
        )}
      </Disclose>
    </section>
  );
}
