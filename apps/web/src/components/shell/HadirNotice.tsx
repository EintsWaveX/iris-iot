/**
 * Attendance banner on every Asisten page (Phase 18): reminds you to start
 * or check in before the slot's base clock (the auto-start, :25), shows how
 * late you are and what it costs while the session runs, and takes the
 * check in with one press. GET /api/session/hadirku gives the slot and the
 * server's own status for you; between fetches the countdown, the ten late
 * cells and the amounts run off the page clock with the same pure rule the
 * server uses (lib/hadir-mengajar.ts).
 *
 * Starting: a plain start posts to /api/session with the module the lab
 * clock would use. Anything beyond that (the lab check list, a session
 * already there, a roster to make, a closed module) lives in the Konsol
 * home, so a refused start sends the person there instead of copying that
 * flow here.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { getJson, href, postJson, tanggalPanjang, type Me } from "../../lib/app";
import { useBatas, useSiaran } from "../../lib/siaran";
import {
  akhirSesiMaks,
  hitungHadir,
  potonganHadir,
  POTONGAN_AWAL,
  type Potongan,
} from "../../lib/hadir-mengajar";
import type { StatusLive } from "../../lib/hadir-mengajar";
import type { Lang } from "../../lib/kelas";
import Pill from "../ui/Pill";
import Popover from "../ui/Popover";
import NilaiBanner, { type NilaiData } from "./NilaiBanner";
import { T } from "./hadirStrings";
import "./HadirNotice.css";

interface BarisSaya {
  izin: boolean;
  diharapkan: boolean;
  hadirPada: string | null;
  status: StatusLive;
  menit: number | null;
  potong: number;
  nolkanUnit: boolean;
}

interface SlotData {
  kunci: string;
  tanggal: string;
  sesiId: number | null;
  slot: number | null;
  base: string;
  izin: boolean;
  diharapkan: boolean;
  sesi: { id: number; status: string } | null;
  saya: BarisSaya | null;
  modul: number | null;
  bolehMulai: boolean;
  otomatisTolak: { kode: string } | null;
  /** The cut setting in force (pengaturan potongan_telat) */
  potongan?: Potongan;
}

interface Hadirku {
  ok: boolean;
  slot: SlotData | null;
  /** Lupa Input Nilai: the score reminder, shown when no attendance state is */
  nilai?: NilaiData | null;
}

// Deliberately shorter than the server's 15 s window, so a press never lands on its edge
const BATAL_DETIK = 10;
const TOPIK = ["hadir", "sesi", "jadwal"] as const;
// Score saves fire on every field blur: their refetch waits at most once per 10 s
const TOPIK_NILAI = ["nilai", "seelabs"] as const;
const JARAK_NILAI = 10_000;

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const dua = (n: number) => String(n).padStart(2, "0");

/** A WIB clock "12:25" (or "12:25:30") from an instant; WIB is UTC+7 with no DST */
function jamWib(ms: number, detik = false): string {
  const d = new Date(ms + 7 * 3600_000);
  const hm = `${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}`;
  return detik ? `${hm}:${dua(d.getUTCSeconds())}` : hm;
}

const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${dua(Math.floor(t / 60))}:${dua(t % 60)}`;
};

/** The five rows of How It Counts, for one base clock */
export function Aturan({
  lang,
  base,
  jumat,
  potongan = POTONGAN_AWAL,
}: {
  lang: Lang;
  base: number;
  jumat: boolean;
  potongan?: Potongan;
}) {
  const t = T[lang];
  const tarif = rp(potongan.perMenit);
  return (
    <div className="hadir-rule">
      {jumat && <p className="hint">{t.jumat}</p>}
      <div className="hadir-rule__row">
        <b className="mono">{t.rTepat(jamWib(base))}</b>
        <span>{t.rTepatT}</span>
      </div>
      <div className="hadir-rule__row" data-tone="warn">
        <b className="mono">{t.rTelat(jamWib(base + 60_000), jamWib(base + 600_000))}</b>
        <span>{t.rTelatT(tarif)}</span>
      </div>
      <div className="hadir-rule__row" data-tone="danger">
        <b className="mono">{t.rMm(jamWib(base + 660_000))}</b>
        <span>{t.rMmT}</span>
      </div>
      <div className="hadir-rule__row" data-tone="danger">
        <b>{t.rMangkir}</b>
        <span>Mangkir</span>
      </div>
      <div className="hadir-rule__row" data-tone="violet">
        <b>{t.rIzin}</b>
        <span>{t.rIzinT}</span>
      </div>
      <p className="hint">{t.rCatatan}</p>
    </div>
  );
}

function CaraHitung({
  lang,
  base,
  jumat,
  potongan,
}: {
  lang: Lang;
  base: number;
  jumat: boolean;
  potongan: Potongan;
}) {
  const t = T[lang];
  return (
    <Popover
      align="end"
      className="hadir-rule__panel"
      trigger={
        <button type="button" className="btn btn--ghost btn--sm">
          {t.cara}
          <CaretDownIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
        </button>
      }
    >
      <Aturan lang={lang} base={base} jumat={jumat} potongan={potongan} />
    </Popover>
  );
}

export default function HadirNotice({ lang, me }: { lang: Lang; me: Me }) {
  const t = T[lang];
  const [data, setData] = useState<SlotData | null>(null);
  const [nilai, setNilai] = useState<NilaiData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The press made on this page: the receipt shows until it is closed
  const [baru, setBaru] = useState<{ kunci: string; pada: number } | null>(null);
  // The kunci whose receipt was closed, so the next slot's banner is not hidden
  const [tutup, setTutup] = useState<string | null>(null);
  const [undo, setUndo] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const aktif = me.role === "asisten";

  const muat = useCallback(() => {
    if (!aktif) return;
    getJson<Hadirku>("/api/session/hadirku")
      .then((d) => {
        if (!d.ok) return;
        setData(d.slot);
        setNilai(d.nilai ?? null);
      })
      .catch(() => {});
  }, [aktif]);
  useEffect(muat, [muat]);
  useSiaran(TOPIK, muat, aktif);
  useSiaran(TOPIK_NILAI, muat, aktif, JARAK_NILAI);

  // States flip on time: refetch at the base clock, one minute after it
  // (late starts) and at the Mangkir Mengajar line.
  const base = data ? new Date(data.base).getTime() : null;
  useBatas(base, TOPIK);
  useBatas(base === null ? null : base + 60_000, TOPIK);
  useBatas(base === null ? null : base + 660_000, TOPIK);

  // The score reminder flips at 20:00, 22:30, 23:00 and past the deadline
  const akhirHari = nilai ? new Date(nilai.batas).getTime() + 1000 : null;
  useBatas(akhirHari === null ? null : akhirHari - 4 * 3600_000, TOPIK_NILAI);
  useBatas(akhirHari === null ? null : akhirHari - 90 * 60_000, TOPIK_NILAI);
  useBatas(akhirHari === null ? null : akhirHari - 60 * 60_000, TOPIK_NILAI);
  useBatas(akhirHari, TOPIK_NILAI);

  // One page clock for the countdown, the cells and the amounts
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [!!data]);

  useEffect(() => {
    if (undo <= 0) return;
    const id = setTimeout(() => setUndo((u) => Math.max(0, u - 1)), 1000);
    return () => clearTimeout(id);
  }, [undo]);

  // The score reminder takes the place of an attendance state with nothing to show
  const skor = nilai ? <NilaiBanner lang={lang} data={nilai} /> : null;
  if (!aktif) return null;
  if (!data || base === null || tutup === data.kunci) return skor;
  const s = data;
  const saya = s.saya;
  const pot = s.potongan ?? POTONGAN_AWAL;
  if (!saya || !saya.diharapkan) return skor;
  const akhir = base + akhirSesiMaks(s.tanggal, s.slot, new Date(base)) * 60_000;
  const baruIni = baru?.kunci === s.kunci ? baru : null;
  if (now >= akhir && !baruIni) return skor;
  if (s.sesi?.status === "selesai" && !baruIni) return skor;

  const sesiNama = s.slot === null ? t.susulan : t.sesi(s.slot);
  const jumat = s.slot === 3 && new Date(`${s.tanggal}T00:00:00Z`).getUTCDay() === 5;
  const tgl = tanggalPanjang(s.tanggal, lang);
  const head = <span className="eyebrow">{`${tgl} · ${sesiNama}`}</span>;

  /* ------------------------------------------------------------ actions */
  async function masuk(): Promise<boolean> {
    const r = await postJson<{ ok: boolean; hadirPada?: string; kode?: string }>(
      "/api/session/hadirku",
      { aksi: "masuk", kunci: s.kunci },
    ).catch(() => null);
    if (!r) {
      window.Toast?.show(t.gagal, "danger");
      return false;
    }
    if (!r.ok) {
      const pesan: Record<string, string> = {
        sudah: t.sudah,
        belum_buka: t.belumBuka,
        sudah_selesai: t.selesai,
        tidak_dijadwalkan: t.tidakJadwal,
      };
      window.Toast?.show(pesan[r.kode ?? ""] ?? t.gagal, "danger");
      muat();
      return false;
    }
    setBaru({ kunci: s.kunci, pada: r.hadirPada ? new Date(r.hadirPada).getTime() : Date.now() });
    setUndo(BATAL_DETIK);
    muat();
    return true;
  }

  async function tandai() {
    setSibuk(true);
    try {
      await masuk();
    } finally {
      setSibuk(false);
    }
  }

  async function batalkan() {
    setSibuk(true);
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/hadirku", {
        aksi: "batal",
        kunci: s.kunci,
      }).catch(() => ({ ok: false }));
      if (r.ok) {
        setBaru(null);
        setUndo(0);
        window.Toast?.show(t.dibatalkan, "ok");
      } else window.Toast?.show(t.gagal, "danger");
      muat();
    } finally {
      setSibuk(false);
    }
  }

  // A plain start. The server checks the starter in as well (Task 4), so no
  // second press. Anything it refuses goes to the Konsol, where the lab check
  // list, a resume and a roster have their screens.
  async function mulai() {
    const keKonsol = () => {
      location.href = href(lang, "/session");
    };
    if (s.modul === null || (s.slot === null && !s.sesiId)) return keKonsol();
    setSibuk(true);
    try {
      // A scheduled Susulan starts from its draft, a regular slot by its number
      const mana =
        s.slot === null
          ? { jenis: "susulan", sesiId: s.sesiId }
          : { tanggal: s.tanggal, slot: s.slot };
      const x = await postJson<{ ok: boolean }>("/api/session", {
        ...mana,
        modul: s.modul,
        butuhAp: s.modul === 4,
      }).catch(() => null);
      if (!x?.ok) return keKonsol();
      window.Toast?.show(t.mulaiOk(jamWib(Date.now())), "ok");
      setBaru({ kunci: s.kunci, pada: Date.now() });
      setUndo(BATAL_DETIK);
      muat();
    } finally {
      setSibuk(false);
    }
  }

  const tombol = (
    label: string,
    onClick: () => void,
    kind: "primary" | "inverse" | "danger" | "ghost",
    cls = "",
  ) => (
    <button
      type="button"
      className={`btn btn--${kind} btn--sm ${cls}`.trim()}
      disabled={sibuk}
      onClick={onClick}
    >
      {label}
    </button>
  );
  const btnHadir = (kind: "primary" | "inverse" | "danger") =>
    tombol(t.hadir, () => void tandai(), kind);
  const btnMulai =
    s.bolehMulai && s.modul !== null ? tombol(t.mulai, () => void mulai(), "primary") : null;

  /* -------------------------------------------------------------- state */
  const hadirMs = saya.hadirPada ? new Date(saya.hadirPada).getTime() : (baruIni?.pada ?? null);
  const live = hitungHadir({
    hadir: hadirMs === null ? null : new Date(hadirMs),
    base: new Date(base),
    izin: false,
    diharapkan: true,
    selesai: false,
    now: new Date(now),
  });
  // The page clock's own reading of a status; the server row wins once fetched
  const pay = (h: { status: StatusLive; menit: number | null }) => {
    if (h.status === "mm") return { tx: t.pMm, tone: "danger" };
    if (h.status === "telat") {
      return { tx: t.pTelat(rp(potonganHadir(h, true, pot).potong)), tone: "warn" };
    }
    if (h.status === "tepat") return { tx: t.pTepat, tone: "ok" };
    return { tx: "", tone: "" };
  };
  const labelStatus = (h: { status: StatusLive; menit: number | null }) =>
    h.status === "tepat"
      ? t.sTepat
      : h.status === "telat"
        ? t.sTelat(h.menit ?? 0)
        : h.status === "mm"
          ? t.sMm
          : h.status === "berjalan"
            ? t.sBerjalan(h.menit ?? 0)
            : t.sLewat;
  const toneStatus = (st: StatusLive) =>
    st === "tepat" ? "ok" : st === "telat" || st === "berjalan" ? "warn" : "danger";

  const sudahJalan = s.sesi?.status === "berjalan" || now >= base;
  const cara = <CaraHitung lang={lang} base={base} jumat={jumat} potongan={pot} />;

  let tone: "ok" | "warn" | "danger" | "accent" | "violet";
  let main: ReactNode;
  let sub: ReactNode = null;
  let acts: ReactNode;

  if (hadirMs !== null) {
    // Receipt: only for the press made on this page; a later page load has
    // nothing left to remind.
    if (!baruIni) return skor;
    const h = saya.hadirPada
      ? { status: saya.status, menit: saya.menit }
      : { status: live.status, menit: live.menit };
    const p = saya.hadirPada
      ? saya.nolkanUnit
        ? { tx: t.pMm, tone: "danger" }
        : saya.potong > 0
          ? { tx: t.pTelat(rp(saya.potong)), tone: "warn" }
          : pay(h)
      : pay(h);
    tone = h.status === "tepat" ? "ok" : h.status === "telat" ? "warn" : "danger";
    main = (
      <span className="hadir__big">
        {t.tercatat} <b className="mono">{jamWib(hadirMs, true)}</b>
      </span>
    );
    sub = (
      <span className="hadir__facts">
        <Pill tone={toneStatus(h.status)}>{labelStatus(h)}</Pill>
        {p.tx && (
          <span className="hadir__pay" data-tone={p.tone}>
            {p.tx}
          </span>
        )}
        {saya.izin && <span className="hint">{t.izinP}</span>}
      </span>
    );
    acts =
      undo > 0
        ? tombol(t.batal(undo), () => void batalkan(), "ghost")
        : tombol(t.tutup, () => setTutup(s.kunci), "ghost");
  } else if (saya.izin) {
    tone = "violet";
    main = <span className="hadir__big">{t.izinH(sesiNama)}</span>;
    sub = <span className="hint">{t.izinP}</span>;
    acts = btnHadir("inverse");
  } else if (!sudahJalan) {
    tone = "accent";
    main = (
      <span className="hadir__big">
        {jumat ? t.autoJumat : t.autoH} <b className="mono">{jamWib(base)}</b>
      </span>
    );
    sub = (
      <span className="hadir__facts">
        <span className="hadir__count mono" role="timer" aria-label={t.timer}>
          {mmss(base - now)}
        </span>
        <span className="hint">
          {t.autoHint(jamWib(base), jamWib(base + 60_000), rp(pot.perMenit))}
        </span>
      </span>
    );
    acts = (
      <>
        {btnHadir(btnMulai ? "inverse" : "primary")}
        {btnMulai}
      </>
    );
  } else if (s.otomatisTolak) {
    // IRIS tried at the base clock and could not: say why, point at the fix
    tone = "danger";
    const kode = s.otomatisTolak.kode;
    main = <span className="hadir__big">{t.tolakH(sesiNama, jamWib(base))}</span>;
    sub = (
      <span className="hint">
        {kode === "mode_tot"
          ? t.tolakTot
          : kode.startsWith("modul") && s.modul !== null
            ? t.tolakModul(s.modul)
            : t.tolakLain}
      </span>
    );
    acts = (
      <>
        {btnHadir("inverse")}
        {kode.startsWith("modul") ? (
          <a className="btn btn--primary btn--sm" href={href(lang, "/preparation")}>
            {t.bukaAkses}
          </a>
        ) : (
          <a className="btn btn--primary btn--sm" href={href(lang, "/session")}>
            {t.mulaiSesi}
          </a>
        )}
      </>
    );
  } else {
    const lewat = live.status === "lewat";
    tone = lewat ? "danger" : "warn";
    main = (
      <span className="hadir__big">
        {s.sesi?.status === "berjalan" && now < base ? t.jalanSaja : t.jalanSendiri(jamWib(base))}
      </span>
    );
    const m = live.menit ?? 0;
    sub =
      live.status === "belum" ? (
        <span className="hint">{t.masihTepat(jamWib(base + 60_000))}</span>
      ) : (
        <span className="hadir__facts">
          <span className="hadir__meter" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} data-on={i < m ? "yes" : undefined} />
            ))}
          </span>
          <Pill tone={toneStatus(live.status)}>{labelStatus(live)}</Pill>
          <span className="hadir__pay" data-tone={lewat ? "danger" : "warn"}>
            {lewat
              ? t.lewat(jamWib(base + 600_000))
              : t.potong(
                  rp(Math.min(m, pot.maks) * pot.perMenit),
                  rp(pot.perMenit),
                  jamWib(base + pot.maks * 60_000),
                )}
          </span>
        </span>
      );
    acts = btnHadir(lewat ? "danger" : "primary");
  }

  const kelas =
    tone === "violet" ? "hadir--violet" : tone === "accent" ? "banner--accent" : `banner--${tone}`;
  return (
    <div
      className={`offline banner hadir ${kelas}`}
      role="region"
      aria-live="polite"
      aria-label={t.region}
    >
      <div className="hadir__text">
        {head}
        {main}
        {sub}
      </div>
      <div className="hadir__acts">
        {acts}
        {cara}
      </div>
    </div>
  );
}
