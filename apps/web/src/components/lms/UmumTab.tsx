/**
 * LMS › Pengumuman: one announcement into every class's Announcements
 * forum, the International class getting the English text. Templates
 * fill from IRIS data (the TP window, scores out). Now, or scheduled (the
 * Orange Pi's heartbeat sends it on time). IRIS's announcements can be
 * taken down from every class at once.
 */
import { useRef, useState } from "react";
import Pill from "../ui/Pill";
import IconButton from "../ui/IconButton";
import Confirm from "../ui/Confirm";
import SegmentedControl from "../ui/SegmentedControl";
import { DateField, Switch, TimeField } from "../ui/Controls";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { waktuPanjang } from "../tp/shared";
import { LS } from "./lmsStrings";
import {
  BatchDialog,
  ClassPick,
  Head,
  galatTeks,
  langkah,
  sasaranKursus,
  type JawabLangkah,
  type KursusRingan,
  type Sasaran,
} from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";
import { TrashIcon } from "@phosphor-icons/react";

type Dua = { id: string; en: string };
interface DataUmum {
  ok: boolean;
  kode?: string;
  umum: {
    id: string;
    judul: string;
    judulEn: string;
    oleh: string;
    pada: string;
    jadwal: string | null;
    tujuan: number;
    terkirim: number;
  }[];
  templat: { modul: number } & Record<"buka" | "tutup" | "nilai", { judul: Dua; isi: Dua }>;
  kursus: KursusRingan[];
  otomatis: boolean;
  boleh: boolean;
}
type Tpl = "buka" | "tutup" | "nilai";

function tplDariUrl(): Tpl {
  if (typeof location === "undefined") return "buka";
  const v = new URLSearchParams(location.search).get("tpl");
  return v === "tutup" || v === "nilai" ? v : "buka";
}

export default function UmumTab({ lang }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = LS[lang];
  const poll = usePoll(() => getJson<DataUmum>("/api/lms/umum"), 300_000, true, ["lms"]);
  const d = poll.data;
  const [tpl, setTpl0] = useState<Tpl>(tplDariUrl);
  const [isi, setIsi] = useState<{ judul: Dua; isi: Dua } | null>(null);
  const [sasaran, setSasaran] = useState<Sasaran>("semua");
  const [kapan, setKapan] = useState<"sekarang" | "jadwal">("sekarang");
  const [tgl, setTgl] = useState("");
  const [jam, setJam] = useState("18:00");
  const [jalan, setJalan] = useState(false);
  const [tarik, setTarik] = useState<DataUmum["umum"][number] | null>(null);
  const [tarikJalan, setTarikJalan] = useState<DataUmum["umum"][number] | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);
  // The announcement a batch writes: the first class makes it, the rest
  // name it (a ref, so the next step sees it without waiting on a render).
  const idBaru = useRef<string | null>(null);
  if (!d) return <span className="skeleton" style={{ height: 520 }} />;
  if (!d.ok) return <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>;
  const kini = isi ?? d.templat[tpl];
  const setTpl = (v: Tpl) => {
    setTpl0(v);
    setIsi(d.templat[v]);
  };
  const ubah = (f: "judul" | "isi", b: "id" | "en", v: string) =>
    setIsi({ ...kini, [f]: { ...kini[f], [b]: v } });
  const tujuan = sasaranKursus(d.kursus, sasaran);
  const jadwal = kapan === "jadwal" && tgl ? `${tgl}T${jam}:00+07:00` : null;
  const siap =
    kini.judul.id.trim() &&
    kini.isi.id.trim() &&
    tujuan.length &&
    (kapan === "sekarang" || (jadwal && Date.parse(jadwal) > Date.now()));
  const otomatis = auto ?? d.otomatis;
  const kirimJadwal = async () => {
    const r = await langkah("/api/lms/umum", {
      kursus: tujuan[0].id,
      tujuan: tujuan.map((k) => k.id),
      judul: kini.judul,
      isi: kini.isi,
      jadwal,
    });
    window.Toast?.show(
      r.ok ? t.jadwalOk(waktuPanjang(jadwal!, lang)) : galatTeks(r.kode, lang),
      r.ok ? "ok" : "warn",
    );
    poll.refresh();
  };
  const setOto = async (v: boolean) => {
    setAuto(v);
    const r = await postJson<{ ok: boolean }>("/api/lms/otomatis", {
      kunci: "umum",
      nyala: v,
    }).catch(() => ({ ok: false }));
    if (!r.ok) setAuto(!v);
    poll.refresh();
  };
  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      <div className="lms-two">
        <section className="panel slr-card">
          <Head title={t.umumH} desc={t.umumHint} />
          <div className="field">
            <span className="field__label">{t.templat}</span>
            <SegmentedControl
              aria-label={t.templat}
              fill
              value={tpl}
              onValueChange={(v) => setTpl(v as Tpl)}
              options={[
                { value: "buka", label: t.tplBuka },
                { value: "tutup", label: t.tplTutup },
                { value: "nilai", label: t.tplNilai },
              ]}
            />
          </div>
          <div className="lms-pair">
            <label className="field">
              <span className="field__label">{t.judulId}</span>
              <input
                className="field__input"
                value={kini.judul.id}
                maxLength={200}
                onChange={(e) => ubah("judul", "id", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">{t.judulEn}</span>
              <input
                className="field__input"
                value={kini.judul.en}
                maxLength={200}
                onChange={(e) => ubah("judul", "en", e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">{t.isiId}</span>
            <textarea
              className="field__input"
              rows={4}
              value={kini.isi.id}
              onChange={(e) => ubah("isi", "id", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{t.isiEn}</span>
            <textarea
              className="field__input"
              rows={4}
              value={kini.isi.en}
              onChange={(e) => ubah("isi", "en", e.target.value)}
            />
          </label>
          <ClassPick lang={lang} kursus={d.kursus} value={sasaran} onChange={setSasaran} />
          <span className="hint">{t.emailHint}</span>
          <div className="field">
            <span className="field__label">{t.kapan}</span>
            <SegmentedControl
              aria-label={t.kapan}
              fill
              value={kapan}
              onValueChange={(v) => setKapan(v as typeof kapan)}
              options={[
                { value: "sekarang", label: t.sekarang },
                { value: "jadwal", label: t.jadwalkan },
              ]}
            />
            {kapan === "jadwal" && (
              <div className="lms-datetime">
                <DateField value={tgl} onChange={setTgl} label={t.tanggal} lang={lang} />
                <TimeField value={jam} onChange={setJam} label={t.jam} lang={lang} />
              </div>
            )}
          </div>
          {d.boleh && (
            <div className="slr-acts">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!siap}
                onClick={() => {
                  if (kapan === "jadwal") return void kirimJadwal();
                  idBaru.current = null;
                  setJalan(true);
                }}
              >
                {kapan === "jadwal" ? t.jadwalkan : t.umumkanKe(tujuan.length)}
              </button>
            </div>
          )}
        </section>
        <div className="stack stack--lg">
          <section className="panel slr-card">
            <Head title={t.otoUmumH} />
            <label className="slr-agree">
              <span className="stack stack--sm">
                <b>{t.otoUmum}</b>
                <span className="hint">{t.otoUmumHint}</span>
              </span>
              <Switch
                on={otomatis}
                onChange={(v) => void setOto(v)}
                label={t.otoUmum}
                disabled={!d.boleh}
              />
            </label>
          </section>
          <section className="panel slr-card">
            <Head title={t.sudahH} />
            {d.umum.length ? (
              <ul className="lms-ext">
                {d.umum.map((u) => (
                  <li key={u.id}>
                    <span className="stack stack--sm">
                      <b>{lang === "en" ? u.judulEn || u.judul : u.judul}</b>
                      <span className="hint">
                        {u.jadwal && !u.terkirim
                          ? t.dijadwalkan(waktuPanjang(u.jadwal, lang))
                          : waktuPanjang(u.pada, lang)}{" "}
                        · {u.oleh}
                      </span>
                    </span>
                    <Pill tone={u.terkirim === u.tujuan ? "ok" : undefined}>
                      {u.terkirim ? t.diKelas(u.terkirim, u.tujuan) : t.belum}
                    </Pill>
                    {d.boleh ? (
                      <IconButton icon={TrashIcon} label={t.tarik} onClick={() => setTarik(u)} />
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{t.sudahKosong}</p>
            )}
          </section>
        </div>
      </div>
      <BatchDialog
        open={jalan}
        onOpenChange={setJalan}
        lang={lang}
        title={t.umumJalan(tujuan.length)}
        kursus={tujuan}
        jalan={async (id): Promise<JawabLangkah> => {
          // The first class writes the announcement down; the rest name it.
          const r = await postJson<JawabLangkah & { id?: string }>(
            "/api/lms/umum",
            idBaru.current
              ? { kursus: id, id: idBaru.current }
              : { kursus: id, tujuan: tujuan.map((k) => k.id), judul: kini.judul, isi: kini.isi },
          ).catch((): JawabLangkah & { id?: string } => ({
            ok: false,
            kode: "lms_tak_terjangkau",
          }));
          if (r.id) idBaru.current = r.id;
          return r;
        }}
        selesai={t.umumOk}
        onDone={() => {
          idBaru.current = null;
          poll.refresh();
        }}
      />
      <Confirm
        open={!!tarik}
        onOpenChange={(v) => !v && setTarik(null)}
        title={t.tarikJudul(tarik?.judul ?? "")}
        body={t.tarikBody}
        confirmLabel={t.tarik}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() => {
          setTarikJalan(tarik);
          setTarik(null);
        }}
      />
      <BatchDialog
        open={!!tarikJalan}
        onOpenChange={(v) => !v && setTarikJalan(null)}
        lang={lang}
        title={t.tarikJalan}
        kursus={tarikJalan ? d.kursus : []}
        jalan={(id) => langkah("/api/lms/umum-tarik", { id: tarikJalan!.id, kursus: id })}
        selesai={t.tarikOk}
        onDone={poll.refresh}
      />
    </div>
  );
}
