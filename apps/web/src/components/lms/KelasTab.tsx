/**
 * LMS › Kelas: the 11 class courses with their counts, and a drawer per
 * class with its people (IRIS status, group and slot, last time in the
 * LMS, an LMS message), its sections and activities (show or hide each),
 * and its groups against the IRIS groups (Samakan Grup).
 */
import { useMemo, useState } from "react";
import Drawer from "../ui/Drawer";
import Dialog from "../ui/Dialog";
import Pill from "../ui/Pill";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import { Switch } from "../ui/Controls";
import { getJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { LS } from "./lmsStrings";
import { BatchDialog, Head, galatTeks, langkah } from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  ChatCircleTextIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import Lalu from "../ui/Lalu";

interface KursusKelas {
  id: number;
  label: string;
  nama: string;
  kelas: "reguler" | "inter";
  iris: number;
  luar: number;
  mahasiswa: number | null;
  grup: number | null;
  aktivitas: number | null;
}
interface DataKelas {
  ok: boolean;
  kode?: string;
  galat: string | null;
  infoPada: string | null;
  lmsUrl: string;
  kursus: KursusKelas[];
  boleh: boolean;
}

const HARI: Record<Lang, string[]> = {
  id: ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
  en: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  zh: ["", "周一", "周二", "周三", "周四", "周五", "周六"],
};

export default function KelasTab({ lang }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = LS[lang];
  const [segar, setSegar] = useState(0);
  const poll = usePoll(
    () => getJson<DataKelas>(`/api/lms/kelas${segar ? "?segar=1" : ""}`),
    300_000,
    true,
    ["lms", "tp"],
    0,
    segar,
  );
  const d = poll.data;
  const [pilih, setPilih] = useState<KursusKelas | null>(null);
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;
  if (!d.ok) return <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>;
  const kelasL = (k: "reguler" | "inter") => (k === "inter" ? t.kelasInter : t.kelasReguler);
  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      <section className="panel slr-card">
        <Head
          title={t.kelasH}
          desc={t.kelasHint}
          aside={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setSegar((x) => x + 1)}
            >
              <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
              {t.segarkan}
            </button>
          }
        />
        {d.galat && <p className="banner banner--warn">{galatTeks(d.galat, lang)}</p>}
        <div className="tpscroll">
          <table className="tptable lms-kls">
            <thead>
              <tr>
                <th>{t.kelas}</th>
                <th className="num">{t.kMahasiswa}</th>
                <th className="num">{t.kDiIris}</th>
                <th className="num">{t.hanyaLms}</th>
                <th className="num">{t.kGrup}</th>
                <th className="num">{t.kAktivitas}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.kursus.map((k) => (
                <tr key={k.id} aria-selected={pilih?.id === k.id}>
                  <td>
                    <b className="mono">{k.label}</b>{" "}
                    <span className="hint">{kelasL(k.kelas)}</span>
                  </td>
                  <td className="num mono">{k.mahasiswa ?? "·"}</td>
                  <td className="num mono">{k.iris}</td>
                  <td className="num mono" data-warn={k.luar > 0 ? "yes" : undefined}>
                    {k.luar}
                  </td>
                  <td className="num mono">{k.grup ?? "·"}</td>
                  <td className="num mono">{k.aktivitas ?? "·"}</td>
                  <td className="num">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setPilih(k)}
                    >
                      {t.buka}
                      <CaretRightIcon
                        size={16}
                        weight="bold"
                        className="btn__go"
                        aria-hidden="true"
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.infoPada && (
          <span className="hint">
            <Lalu iso={d.infoPada} lang={lang} fmt={t.dibaca} />
          </span>
        )}
      </section>
      {pilih && (
        <KelasDrawer
          lang={lang}
          k={pilih}
          boleh={d.boleh}
          onClose={() => setPilih(null)}
          onChanged={poll.refresh}
        />
      )}
    </div>
  );
}

interface Orang {
  id: number;
  nama: string;
  nim: string | null;
  status: string;
  kode: string | null;
  kelompok: { hari: number; slot: number; nomor: number } | null;
  akses: string | null;
}
interface Bagian {
  id: number;
  nomor: number;
  nama: string;
  tampil: boolean;
  modul: { cmid: number; nama: string; jenis: string; tampil: boolean }[];
}
interface Grup {
  id: number | null;
  nama: string;
  anggota: number;
  iris: boolean;
  kurang: number | null;
}

function KelasDrawer({
  lang,
  k,
  boleh,
  onClose,
  onChanged,
}: {
  lang: Lang;
  k: KursusKelas;
  boleh: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = LS[lang];
  const [sub, setSub] = useState<"orang" | "isi" | "grup">("orang");
  const [ulang, setUlang] = useState(0);
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; kode?: string; orang?: Orang[]; bagian?: Bagian[]; grup?: Grup[] }>(
        `/api/lms/kelas-isi?kursus=${k.id}&bagian=${sub}`,
      ),
    600_000,
    true,
    ["lms"],
    0,
    `${k.id}-${sub}-${ulang}`,
  );
  const d = poll.data;
  const [cari, setCari] = useState("");
  const [pesan, setPesan] = useState<Orang | null>(null);
  const [samakan, setSamakan] = useState(false);
  const [sedang, setSedang] = useState<number | null>(null);
  const orang = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (d?.orang ?? []).filter(
      (o) => !q || o.nama.toLowerCase().includes(q) || (o.nim ?? "").includes(q),
    );
  }, [d?.orang, cari]);
  const tone = (s: string) =>
    s === "terdaftar" ? "ok" : s === "luar" ? "warn" : s === "keduanya" ? "accent" : undefined;
  const tampil = async (m: Bagian["modul"][number], v: boolean) => {
    setSedang(m.cmid);
    const r = await langkah("/api/lms/tampil", { kursus: k.id, cmid: m.cmid, tampil: v });
    setSedang(null);
    window.Toast?.show(
      r.ok ? t.tampilOk(m.nama, v) : galatTeks(r.kode, lang),
      r.ok ? "ok" : "warn",
    );
    poll.refresh();
  };
  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`${k.label} · ${k.kelas === "inter" ? t.kelasInter : t.kelasReguler}`}
      description={t.kelasSub(k.mahasiswa, k.grup)}
      storeKey="lms-kelas"
      minWidth={420}
      closeLabel={t.tutup}
      resizeLabel={t.tutup}
    >
      <div className="stack">
        <SegmentedControl
          aria-label={t.kelas}
          fill
          value={sub}
          onValueChange={(v) => setSub(v as typeof sub)}
          options={[
            { value: "orang", label: t.orang },
            { value: "isi", label: t.isi },
            { value: "grup", label: t.grup },
          ]}
        />
        {!d ? (
          <span className="skeleton" style={{ height: 320 }} />
        ) : !d.ok ? (
          <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>
        ) : sub === "orang" ? (
          <div className="stack">
            <label className="lms-search">
              <MagnifyingGlassIcon size={18} aria-hidden="true" />
              <input
                className="field__input"
                placeholder={t.cari}
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                aria-label={t.cari}
              />
            </label>
            <ul className="lms-people">
              {orang.map((o) => (
                <li key={o.id}>
                  <span className="stack stack--sm">
                    <b>{o.nama}</b>
                    <span className="hint mono">{o.nim ?? "·"}</span>
                  </span>
                  <span className="stack stack--sm lms-people__mid">
                    <Pill tone={tone(o.status)}>
                      {o.kelompok && o.status !== "luar"
                        ? t.kelompokSlot(
                            HARI[lang][o.kelompok.hari] ?? "",
                            o.kelompok.slot,
                            o.kelompok.nomor,
                          )
                        : (t.st[o.status] ?? o.status)}
                    </Pill>
                    <span className="hint">
                      {t.terakhirLms} <Lalu iso={o.akses} lang={lang} />
                    </span>
                  </span>
                  {boleh ? (
                    <IconButton
                      icon={ChatCircleTextIcon}
                      label={t.kirimPesanKe(o.nama)}
                      onClick={() => setPesan(o)}
                    />
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : sub === "isi" ? (
          <div className="stack">
            <p className="hint">{t.isiHint}</p>
            {(d.bagian ?? []).map((b) => (
              <div className="lms-sec" key={b.id}>
                <b>{b.nama || `#${b.nomor}`}</b>
                {b.modul.length > 0 && (
                  <ul>
                    {b.modul.map((m) => (
                      <li key={m.cmid}>
                        <span className="grow">{m.nama}</span>
                        {!m.tampil && <Pill>{t.tersembunyi}</Pill>}
                        <Switch
                          on={m.tampil}
                          onChange={(v) => void tampil(m, v)}
                          label={`${t.tampil}: ${m.nama}`}
                          disabled={!boleh || sedang === m.cmid}
                          busy={sedang === m.cmid}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="stack">
            <p className="hint">{t.grupHint}</p>
            {(d.grup ?? []).length ? (
              <div className="tpscroll">
                <table className="tptable">
                  <thead>
                    <tr>
                      <th>{t.grupLms}</th>
                      <th className="num">{t.anggota}</th>
                      <th>{t.kelompokIris}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.grup ?? []).map((g) => (
                      <tr key={g.nama}>
                        <td className="mono">{g.nama}</td>
                        <td className="num mono">{g.anggota}</td>
                        <td>
                          {!g.iris ? (
                            <Pill>{t.grupLuar}</Pill>
                          ) : g.id === null ? (
                            <Pill tone="warn">{t.grupBaru}</Pill>
                          ) : g.kurang ? (
                            <Pill tone="warn">{t.grupKurang(g.kurang)}</Pill>
                          ) : (
                            <Pill tone="ok">{t.grupSama}</Pill>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hint">{t.grupKosong}</p>
            )}
            {boleh && (d.grup ?? []).some((g) => g.iris && (g.id === null || g.kurang)) && (
              <div className="slr-acts">
                <button type="button" className="btn btn--primary" onClick={() => setSamakan(true)}>
                  {t.samakanGrup}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {pesan && <PesanDialog lang={lang} kursus={k.id} o={pesan} onClose={() => setPesan(null)} />}
      <BatchDialog
        open={samakan}
        onOpenChange={setSamakan}
        lang={lang}
        title={t.grupJalan(k.label)}
        kursus={[{ id: k.id, label: k.label }]}
        jalan={(id) => langkah("/api/lms/grup", { kursus: id })}
        selesai={t.grupOk}
        onDone={() => {
          setUlang((x) => x + 1);
          onChanged();
        }}
      />
    </Drawer>
  );
}

function PesanDialog({
  lang,
  kursus,
  o,
  onClose,
}: {
  lang: Lang;
  kursus: number;
  o: Orang;
  onClose: () => void;
}) {
  const t = LS[lang];
  const [teks, setTeks] = useState("");
  const [busy, setBusy] = useState(false);
  const kirim = async () => {
    setBusy(true);
    const r = await langkah("/api/lms/pesan", { kursus, userid: o.id, teks });
    setBusy(false);
    window.Toast?.show(r.ok ? t.pesanOk : galatTeks(r.kode, lang), r.ok ? "ok" : "warn");
    if (r.ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t.pesanH(o.nama)}
      description={t.pesanDesc}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !teks.trim()}
            onClick={() => void kirim()}
          >
            {t.kirim}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t.pesanIsi}</span>
        <textarea
          className="field__input"
          rows={5}
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
        />
      </label>
    </Dialog>
  );
}
