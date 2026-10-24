/**
 * Penilaian › Pengaturan TP (2026-10-21): the TP settings the LMS screens
 * used to hold, now that TP lives only in IRIS. Who counts in TP (Peserta
 * TP: the IRIS roster less the exclusions), the semester's default window,
 * and the IRIS and SeeLabs cross-check. Every Asisten reads it; the
 * exclusions are the TP right's, the default window the Pencipta's and
 * Admins'.
 */
import { useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Disclose from "../ui/Disclose";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import { TimeField } from "../ui/Controls";
import PerpanjangDialog from "./PerpanjangDialog";
import { getJson, href, postJson, useTick } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import type { PolaJendela } from "../../lib/tp";
import { TPS } from "../tp/tpStrings";
import { waktuPanjang } from "../tp/shared";
import { PT } from "./pengaturanStrings";

interface Kecuali {
  nim: string;
  nama: string;
  alasan: string;
  oleh: string;
  pada: string;
}

export interface SilangInfo {
  iris: number;
  seelabs: {
    pada: string;
    total: number;
    klp: number;
    bukanIris: { nim: string; nama: string }[];
    tanpaSeelabs: { nim: string; nama: string; kelas: string }[];
  } | null;
  asisten: { nim: string; nama: string; kode: string; kelas: string }[];
}

interface Pengaturan {
  ok: boolean;
  /** The default window: Pencipta and Admins. */
  bolehPola: boolean;
  /** The exclusions: the TP right. */
  bolehKecuali: boolean;
  peserta: { terdaftar: number; kecuali: Kecuali[] };
  pola: PolaJendela;
  silang: SilangInfo;
  /** Changes anyone's extension here: the TP right, or an Admin. */
  bolehPerpanjang: boolean;
  cek: Cek[];
  perpanjang: Perpanjang[];
}

type Cek =
  | { k: "jendela"; modul: number }
  | { k: "pemegang" | "nilai"; modul: number; n: number }
  | { k: "tanpaSeelabs" | "bukanIris" | "perpanjang"; n: number };

interface Perpanjang {
  modul: number;
  nim: string;
  nama: string;
  sampai: string;
  alasan: string | null;
  oleh: string;
  pada: string;
}

/** Scrolls to a panel of this tab. */
const ke = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function PengaturanTab({ lang }: { lang: Lang }) {
  const t = TPS[lang];
  const poll = usePoll(
    () => getJson<Pengaturan>("/api/tp/pengaturan").then((d) => (d.ok ? d : null)),
    120_000,
    true,
    ["tp"],
  );
  const d = poll.data;
  const [bawaan, setBawaan] = useState(false);
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;
  return (
    <div className="stack stack--lg">
      <CekPanel lang={lang} cek={d.cek} />
      <div className="tppengaturan__grid">
        <div className="stack stack--lg">
          <PesertaPanel
            lang={lang}
            peserta={d.peserta}
            boleh={d.bolehKecuali}
            onDone={poll.refresh}
          />
          <PerpanjangPanel
            lang={lang}
            daftar={d.perpanjang}
            boleh={d.bolehPerpanjang}
            onDone={poll.refresh}
          />
        </div>
        <div className="stack stack--lg">
          <section className="panel">
            <h2 className="panel__title">{t.jendelaBawaan}</h2>
            <dl className="tpdl tpdl--one">
              <div>
                <dt>{t.jendelaBawaan}</dt>
                <dd>
                  {t.polaTeks(
                    t.hari[d.pola.hariBuka],
                    d.pola.jamBuka,
                    t.hari[d.pola.hariTutup],
                    d.pola.jamTutup,
                  )}
                </dd>
              </div>
            </dl>
            <p className="hint">{t.bawaanHint}</p>
            {d.bolehPola && (
              <div className="panel__actions">
                <button type="button" className="btn" onClick={() => setBawaan(true)}>
                  {t.ubahBawaan}
                </button>
              </div>
            )}
          </section>
          <SilangPanel lang={lang} silang={d.silang} />
        </div>
        <BawaanDialog
          open={bawaan}
          onOpenChange={setBawaan}
          lang={lang}
          pola={d.pola}
          onDone={poll.refresh}
        />
      </div>
    </div>
  );
}

/* ======================================================= Perlu Dicek */

/** What needs a look, each with the way to it; the LMS Ringkasan's
 *  checklist on IRIS's own facts (2026-10-21). */
function CekPanel({ lang, cek }: { lang: Lang; cek: Cek[] }) {
  const t = PT[lang];
  const baris = cek.map((c) => {
    switch (c.k) {
      case "jendela":
        return {
          judul: t.cek.jendela(c.modul),
          hint: t.cek.jendelaHint,
          tombol: t.bukaModul,
          url: href(lang, `/modules/${c.modul}?step=tp`),
        };
      case "pemegang":
      case "nilai":
        return {
          judul: t.cek[c.k](c.n, c.modul),
          hint: c.k === "nilai" ? t.cek.nilaiHint : t.cek.pemegangHint,
          tombol: t.keNilai,
          url: href(lang, `/grading?modul=${c.modul}`),
        };
      case "tanpaSeelabs":
      case "bukanIris":
        return {
          judul: t.cek[c.k](c.n),
          hint: c.k === "bukanIris" ? t.cek.bukanIrisHint : t.cek.tanpaSeelabsHint,
          tombol: t.lihat,
          ke: "tp-silang",
        };
      default:
        return {
          judul: t.cek.perpanjang(c.n),
          hint: t.cek.perpanjangHint,
          tombol: t.lihat,
          ke: "tp-perpanjangan",
        };
    }
  });
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.cekH}</h2>
      </div>
      {baris.length ? (
        <ul className="tpcek">
          {baris.map((b) => (
            <li key={b.judul}>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <b>{b.judul}</b>
                <span className="hint">{b.hint}</span>
              </span>
              {b.url ? (
                <a className="btn btn--ghost btn--sm" href={b.url}>
                  {b.tombol}
                  <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
                </a>
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => ke(b.ke!)}>
                  {b.tombol}
                  <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{t.cekKosong}</p>
      )}
    </section>
  );
}

/* ====================================================== extensions */

/** Every extension this semester: the running ones, then the ended ones
 *  folded; each opens the Grader's own extension dialog. */
function PerpanjangPanel({
  lang,
  daftar,
  boleh,
  onDone,
}: {
  lang: Lang;
  daftar: Perpanjang[];
  boleh: boolean;
  onDone: () => void;
}) {
  const t = PT[lang];
  useTick(60_000);
  const [ubah, setUbah] = useState<Perpanjang | null>(null);
  const [semua, setSemua] = useState(false);
  const now = Date.now();
  const jalan = daftar.filter((p) => Date.parse(p.sampai) > now).reverse();
  const lewat = daftar.filter((p) => Date.parse(p.sampai) <= now);
  const baris = (p: Perpanjang, aktif: boolean) => (
    <li key={`${p.modul}-${p.nim}`}>
      <span className="grow stack" style={{ gap: 0 }}>
        <b>{p.nama}</b>
        <span className="hint">
          <span className="mono">{p.nim}</span>
          {p.alasan ? ` · ${p.alasan}` : ""} · {t.oleh(p.oleh, waktuPanjang(p.pada, lang))}
        </span>
      </span>
      <span className="stack tpcek__sisi">
        <Pill modul={p.modul}>{t.pjModul(p.modul)}</Pill>
        <span className="hint">{t.pjSampai(waktuPanjang(p.sampai, lang))}</span>
      </span>
      {boleh && aktif && (
        <button type="button" className="btn btn--sm" onClick={() => setUbah(p)}>
          {t.ubah}
        </button>
      )}
    </li>
  );
  return (
    <section className="panel" id="tp-perpanjangan">
      <div className="panel__head">
        <h2 className="panel__title">{t.pjH}</h2>
        <span className="hint">{t.pjLede}</span>
        {boleh && (
          <button type="button" className="btn btn--sm" onClick={() => setSemua(true)}>
            {TPS[lang].semuaTombol}
          </button>
        )}
      </div>
      {jalan.length ? (
        <ul className="tppeserta__list">{jalan.map((p) => baris(p, true))}</ul>
      ) : (
        <p className="hint">{t.pjKosong}</p>
      )}
      {lewat.length > 0 && (
        <Disclose head={t.pjLewat(lewat.length)}>
          <ul className="tppeserta__list">{lewat.map((p) => baris(p, false))}</ul>
        </Disclose>
      )}
      {semua && (
        <PerpanjangDialog
          open
          semua
          onOpenChange={(v) => !v && setSemua(false)}
          lang={lang}
          modul={1}
          nim=""
          nama=""
          ada={null}
          onSaved={onDone}
        />
      )}
      {ubah && (
        <PerpanjangDialog
          open
          onOpenChange={(v) => !v && setUbah(null)}
          lang={lang}
          modul={ubah.modul}
          nim={ubah.nim}
          nama={ubah.nama}
          ada={{ sampai: ubah.sampai, alasan: ubah.alasan }}
          onSaved={onDone}
        />
      )}
    </section>
  );
}

/* ======================================================== Peserta TP */

function PesertaPanel({
  lang,
  peserta,
  boleh,
  onDone,
}: {
  lang: Lang;
  peserta: Pengaturan["peserta"];
  boleh: boolean;
  onDone: () => void;
}) {
  const t = PT[lang];
  const [nim, setNim] = useState("");
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);

  const kirim = async (n: string, hapus: boolean, why = "") => {
    setSibuk(n);
    const r = await postJson<{ ok: boolean; kode?: string }>(
      "/api/tp/kecuali",
      hapus ? { nim: n, hapus: true } : { nim: n, alasan: why },
    ).catch(() => ({ ok: false, kode: "" }));
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
          <dd className="mono">{peserta.terdaftar - peserta.kecuali.length}</dd>
        </div>
        <div>
          <dt>{t.dikecualikan}</dt>
          <dd className="mono">{peserta.kecuali.length}</dd>
        </div>
      </dl>
      <p className="hint">{t.kecualiHint}</p>
      {peserta.kecuali.length ? (
        <ul className="tppeserta__list">
          {peserta.kecuali.map((k) => (
            <li key={k.nim}>
              <span className="grow stack" style={{ gap: 0 }}>
                <b>{k.nama}</b>
                <span className="hint">
                  <span className="mono">{k.nim}</span>
                  {k.alasan ? ` · ${k.alasan}` : ""} · {t.oleh(k.oleh, waktuPanjang(k.pada, lang))}
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
    </section>
  );
}

/* ========================================================= Silang Data */

function SilangPanel({ lang, silang }: { lang: Lang; silang: SilangInfo }) {
  const t = PT[lang];
  const s = silang.seelabs;
  const tile = (label: string, n: number | string) => (
    <div className="tpsilang__tile">
      <dt>{label}</dt>
      <dd className="mono">{n}</dd>
    </div>
  );
  const daftar = (rows: { nim: string; nama: string; sub?: string }[]) =>
    rows.length ? (
      <ul className="tppeserta__list">
        {rows.map((p) => (
          <li key={p.nim}>
            <span className="grow stack" style={{ gap: 0 }}>
              <b>{p.nama}</b>
              <span className="hint mono">{p.sub ? `${p.nim} · ${p.sub}` : p.nim}</span>
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="hint">{t.kosong}</p>
    );
  return (
    <section className="panel tpsilang" id="tp-silang">
      <div className="panel__head">
        <h2 className="panel__title">{t.silangH}</h2>
        <span className="hint">{t.silangLede}</span>
      </div>
      <dl className="tpsilang__tiles">
        {tile(t.sIris, silang.iris)}
        {tile(t.sSeelabs, s ? s.total : "…")}
        {tile(t.sAsisten, silang.asisten.length)}
      </dl>
      <p className="hint tpsilang__pada">
        {s ? t.sSeelabsPada(waktuPanjang(s.pada, lang).split(" · ")[0], s.klp) : t.sSeelabsBelum}
      </p>
      <div className="tpsilang__isi">
        <Disclose head={`${t.asistenH} (${silang.asisten.length})`}>
          <p className="hint">{t.asistenHint}</p>
          {silang.asisten.length ? (
            <ul className="tppeserta__list tpsilang__list">
              {silang.asisten.map((a) => (
                <li key={a.nim}>
                  <span className="grow stack" style={{ gap: 0 }}>
                    <b>{a.nama}</b>
                    <span className="hint mono">
                      {a.nim} · {a.kode}
                    </span>
                  </span>
                  <span className="stack tpsilang__kelas">
                    <b>{t.sebagaiAsisten}</b>
                    <span className="hint">{t.kelasIris[a.kelas] ?? a.kelas}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t.kosong}</p>
          )}
        </Disclose>
        {s && (
          <>
            <Disclose head={t.bukanIrisH(s.bukanIris.length)}>{daftar(s.bukanIris)}</Disclose>
            <Disclose head={t.tanpaSeelabsH(s.tanpaSeelabs.length)}>
              {daftar(s.tanpaSeelabs.map((p) => ({ ...p, sub: t.kelasIris[p.kelas] ?? p.kelas })))}
            </Disclose>
          </>
        )}
      </div>
    </section>
  );
}

/* ===================================================== default window */

function BawaanDialog({
  open,
  onOpenChange,
  lang,
  pola,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  pola: PolaJendela;
  onDone: () => void;
}) {
  const t = TPS[lang];
  const [p, setP] = useState(pola);
  const hari = [1, 2, 3, 4, 5, 6, 7].map((h) => ({ value: String(h), label: t.hari[h] }));
  const kirim = async () => {
    const r = await postJson<{ ok: boolean }>("/api/tp/jendela", { pola: p }).catch(() => ({
      ok: false,
    }));
    window.Toast?.show(r.ok ? t.bawaanDisimpan : t.gagal, r.ok ? "ok" : "warn");
    if (r.ok) {
      onOpenChange(false);
      onDone();
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setP(pola);
        onOpenChange(v);
      }}
      title={t.bawaanJudul}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void kirim()}>
            {t.simpan}
          </button>
        </>
      }
    >
      <div className="tpwinform">
        <div className="field">
          <span className="field__label">{t.dibuka}</span>
          <div className="tpwinform__row">
            <Dropdown
              id="tp-hari-buka"
              label={t.hariBuka}
              hideLabel
              options={hari}
              value={String(p.hariBuka)}
              onChange={(v) => setP({ ...p, hariBuka: Number(v) })}
            />
            <TimeField
              value={p.jamBuka}
              onChange={(v) => setP({ ...p, jamBuka: v })}
              label={t.jamBuka}
              lang={lang}
            />
          </div>
        </div>
        <div className="field">
          <span className="field__label">{t.ditutup}</span>
          <div className="tpwinform__row">
            <Dropdown
              id="tp-hari-tutup"
              label={t.hariTutup}
              hideLabel
              options={hari}
              value={String(p.hariTutup)}
              onChange={(v) => setP({ ...p, hariTutup: Number(v) })}
            />
            <TimeField
              value={p.jamTutup}
              onChange={(v) => setP({ ...p, jamTutup: v })}
              label={t.jamTutup}
              lang={lang}
            />
          </div>
        </div>
        <p className="hint">{t.bawaanHint}</p>
      </div>
    </Dialog>
  );
}
