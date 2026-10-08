/**
 * Preparation, Mode TOT tab (2026-10-05). TOT (Training of Trainers) is the
 * Asisten's weekly practice run of next week's module, played with the 60
 * dummy Praktikan of src/lib/tot.ts: one group per division.
 *
 * Everyone signed in as Asisten sees the state; the switch needs the
 * Schedule right (Pengelola, Admin) and starting a TOT session the full
 * "pair" right, as a Praktikum Susulan does. Switching either way is
 * refused while a session runs (api/_lib/tot.ts).
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ArrowRightIcon, PlayIcon, TrashIcon } from "@phosphor-icons/react";
import Confirm from "../../ui/Confirm";
import StartCheck, { type BelumSiap } from "../StartCheck";
import Pill from "../../ui/Pill";
import { Stepper, Switch } from "../../ui/Controls";
import { dict, getJson, href, postJson, tanggalPanjang, useMe } from "../../../lib/app";
import { SESI_CAP_MENIT, SESI_MIN_MENIT } from "../../../lib/jadwal";
import { menitLabel, modulLabel } from "../../../lib/labels";
import { useSiaran } from "../../../lib/siaran";
import { DIVISI } from "../../../lib/hak";
import { TOT_PER_KELOMPOK } from "../../../lib/tot";
import { TOT_BERUBAH } from "../../shell/TotNotice";
import type { Lang } from "../../../lib/kelas";
import { pesan, type Strings } from "../strings";
import type { SesiRunning } from "../types";

interface TotState {
  aktif: boolean;
  sejak: string | null;
  olehKode: string | null;
  jumlah: number;
  /** Finished TOT sessions still kept. */
  riwayat?: number;
}

const T = dict({
  id: {
    title: "Mode TOT",
    on: "Aktif",
    off: "Mati",
    intro:
      "TOT (Training of Trainers) adalah latihan Asisten sebelum mengajar minggu depan. Selama Mode TOT aktif, hanya akun Praktikan TOT yang bisa masuk. Praktikan asli tidak bisa masuk sama sekali, dan roster yang sedang dipakai disimpan utuh lalu dikembalikan persis saat Mode TOT dimatikan.",
    keep: "Sesi TOT tidak masuk ke pendapatan, SeeLabs, atau laporan asli. Lihat riwayatnya di Laporan, filter TOT.",
    sw: "Mode TOT",
    since: (when: string, who: string | null) =>
      who ? `Aktif sejak ${when}, dinyalakan ${who}.` : `Aktif sejak ${when}.`,
    noRight: "Hanya Pengelola dan Admin yang bisa menyalakan atau mematikan Mode TOT.",
    running: "Akhiri sesi yang sedang berjalan dulu sebelum mengubah Mode TOT.",
    accounts: "Akun Praktikan TOT",
    accountsHint:
      "Masuk sebagai Praktikan dengan NIM ini, tanpa kata sandi. Saat sesi berjalan, isi juga Kode Masuk yang tampil di bar sesi.",
    group: (n: number) => `Kelompok ${n}`,
    sampai: "sampai",
    names: (d: string) => `TOT ${d} 01 sampai ${TOT_PER_KELOMPOK}`,
    startTitle: "Mulai Sesi TOT",
    startHint:
      "Mulai sekarang, enam kelompok divisi. Modul boleh yang masih tertutup untuk Praktikan asli.",
    module: "Modul",
    length: "Durasi",
    shorter: "Lebih singkat",
    longer: "Lebih lama",
    start: (m: string) => `Mulai TOT ${m}`,
    noPair: "Hanya Pengelola dan Admin yang bisa memulai sesi TOT.",
    totRunning: "Sesi TOT sedang berjalan.",
    openSession: "Buka Sesi",
    otherRunning: "Ada sesi yang sedang berjalan.",
    onTitle: "Nyalakan Mode TOT?",
    onBody:
      "Praktikan asli tidak bisa masuk sampai Mode TOT dimatikan, termasuk yang sedang masuk sekarang. Roster yang sedang dipakai disimpan dan dikembalikan persis saat dimatikan.",
    onOk: "Nyalakan",
    offTitle: "Matikan Mode TOT?",
    offBody:
      "Akun TOT berhenti bisa masuk dan roster asli dikembalikan seperti sebelum Mode TOT dinyalakan. Riwayat sesi TOT tetap tersimpan.",
    offOk: "Matikan",
    cancel: "Batal",
    turnedOn: "Mode TOT aktif.",
    turnedOff: "Mode TOT dimatikan. Roster asli sudah kembali.",
    started: "Sesi TOT dimulai.",
    history: (n: number) => `Riwayat TOT: ${n} sesi latihan tersimpan.`,
    clear: "Hapus Riwayat",
    clearTitle: "Hapus Riwayat TOT?",
    clearBody: (n: number) =>
      `${n} sesi TOT yang sudah selesai dihapus beserta nilai, jawaban, dan catatan masuknya. Sesi asli tidak tersentuh.`,
    cleared: (n: number) => `${n} sesi TOT dihapus.`,
  },
  en: {
    title: "TOT Mode",
    on: "On",
    off: "Off",
    intro:
      "TOT (Training of Trainers) is the Asisten's practice run before teaching next week. While TOT Mode is on, only the TOT Praktikan accounts can sign in. Real Praktikan can't sign in at all, and the roster in use is saved whole and put back exactly when TOT Mode is switched off.",
    keep: "TOT sessions never count toward pay, SeeLabs or the real reports. Find them in Reports under the TOT filter.",
    sw: "TOT Mode",
    since: (when: string, who: string | null) =>
      who ? `On since ${when}, switched on by ${who}.` : `On since ${when}.`,
    noRight: "Only Pengelola and Admins can switch TOT Mode on or off.",
    running: "End the running session first before changing TOT Mode.",
    accounts: "TOT Praktikan Accounts",
    accountsHint:
      "Sign in as Praktikan with these NIMs, no password. While a session runs, also type the Sign-in Code shown on the session bar.",
    group: (n: number) => `Group ${n}`,
    sampai: "to",
    names: (d: string) => `TOT ${d} 01 to ${TOT_PER_KELOMPOK}`,
    startTitle: "Start a TOT Session",
    startHint:
      "Starts now with the six division groups. The module may still be closed to real Praktikan.",
    module: "Module",
    length: "Length",
    shorter: "Shorter",
    longer: "Longer",
    start: (m: string) => `Start TOT ${m}`,
    noPair: "Only Pengelola and Admins can start a TOT session.",
    totRunning: "A TOT session is running.",
    openSession: "Open Session",
    otherRunning: "A session is running.",
    onTitle: "Switch TOT Mode On?",
    onBody:
      "Real Praktikan can't sign in until TOT Mode is switched off, including anyone signed in now. The roster in use is saved and put back exactly when it is switched off.",
    onOk: "Switch On",
    offTitle: "Switch TOT Mode Off?",
    offBody:
      "The TOT accounts stop working and the real roster is put back as it was before TOT Mode was switched on. TOT session history stays.",
    offOk: "Switch Off",
    cancel: "Cancel",
    turnedOn: "TOT Mode is on.",
    turnedOff: "TOT Mode is off. The real roster is back.",
    started: "TOT session started.",
    history: (n: number) => `TOT history: ${n} practice sessions kept.`,
    clear: "Clear History",
    clearTitle: "Clear TOT History?",
    clearBody: (n: number) =>
      `${n} finished TOT sessions are deleted with their scores, answers and sign-ins. Real sessions are untouched.`,
    cleared: (n: number) => `${n} TOT sessions deleted.`,
  },
  zh: {
    title: "TOT 模式",
    on: "开启",
    off: "关闭",
    intro:
      "TOT（培训师培训）是助教在下周上课前的练习。TOT 模式开启时，只有 TOT 学员账号能登录，真实学员完全不能登录；正在使用的名单会被完整保存，关闭 TOT 模式时原样恢复。",
    keep: "TOT 课程不计入酬劳、SeeLabs 或正式报告。可在报告的 TOT 筛选里查看。",
    sw: "TOT 模式",
    since: (when: string, who: string | null) =>
      who ? `自 ${when} 开启，由 ${who} 开启。` : `自 ${when} 开启。`,
    noRight: "只有 Pengelola 和 Admin 可以开启或关闭 TOT 模式。",
    running: "请先结束正在进行的课程，再更改 TOT 模式。",
    accounts: "TOT 学员账号",
    accountsHint:
      "用这些 NIM 以学员身份登录，无需密码。课程进行时，还要输入课程栏上显示的登录代码。",
    group: (n: number) => `第 ${n} 组`,
    sampai: "至",
    names: (d: string) => `TOT ${d} 01 至 ${TOT_PER_KELOMPOK}`,
    startTitle: "开始 TOT 课程",
    startHint: "现在开始，六个部门小组。模块可以是对真实学员仍关闭的。",
    module: "模块",
    length: "时长",
    shorter: "缩短",
    longer: "延长",
    start: (m: string) => `开始 TOT ${m}`,
    noPair: "只有 Pengelola 和 Admin 可以开始 TOT 课程。",
    totRunning: "TOT 课程正在进行。",
    openSession: "打开课程",
    otherRunning: "有课程正在进行。",
    onTitle: "开启 TOT 模式？",
    onBody:
      "在关闭 TOT 模式之前，真实学员无法登录，包括现在已登录的。正在使用的名单会被保存，关闭时原样恢复。",
    onOk: "开启",
    offTitle: "关闭 TOT 模式？",
    offBody: "TOT 账号将无法登录，真实名单恢复到开启前的样子。TOT 课程记录会保留。",
    offOk: "关闭",
    cancel: "取消",
    turnedOn: "TOT 模式已开启。",
    turnedOff: "TOT 模式已关闭，真实名单已恢复。",
    started: "TOT 课程已开始。",
    history: (n: number) => `TOT 记录：保存了 ${n} 节练习课。`,
    clear: "清除记录",
    clearTitle: "清除 TOT 记录？",
    clearBody: (n: number) =>
      `将删除 ${n} 节已结束的 TOT 课程及其分数、答案和登录记录。正式课程不受影响。`,
    cleared: (n: number) => `已删除 ${n} 节 TOT 课程。`,
  },
});

const DURASI_CEPAT = [60, 90, 120, 150];

export default function TotPanel({
  t,
  lang,
  sesi,
  onChanged,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning | null;
  onChanged: () => void;
}) {
  const k = T[lang];
  const me = useMe();
  const bolehUbah = me?.hak?.jadwal === true;
  const bolehMulai = me?.hak?.pair === true;
  const [st, setSt] = useState<TotState | null>(null);
  const [ask, setAsk] = useState<boolean | null>(null);
  const [hapus, setHapus] = useState(false);
  const [modul, setModul] = useState(1);
  const [durasi, setDurasi] = useState(120);
  const [busy, setBusy] = useState(false);
  const [belum, setBelum] = useState<BelumSiap | null>(null);

  const load = useCallback(() => {
    getJson<{ ok: boolean } & TotState>("/api/session/tot")
      .then((d) => d.ok && setSt(d))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useSiaran(["tot", "sesi"], load);

  async function ubah(aktif: boolean) {
    const d = await postJson<{ ok: boolean; kode?: string }>("/api/session/tot", { aktif });
    if (!d.ok) {
      window.Toast?.show(pesan(t, d.kode), "danger");
      return false;
    }
    window.Toast?.show(aktif ? k.turnedOn : k.turnedOff, "ok");
    // The banner on this page, without waiting for the live update.
    window.dispatchEvent(new Event(TOT_BERUBAH));
    load();
    onChanged();
    return true;
  }

  async function mulai(paksa?: string) {
    setBusy(true);
    try {
      const d = await postJson<{
        ok: boolean;
        kode?: string;
        apDiantre?: boolean | null;
        cek?: BelumSiap["cek"];
        serverId?: number | null;
      }>("/api/session", {
        jenis: "tot",
        modul,
        durasiMenit: durasi,
        butuhAp: modul === 4,
        paksa,
      });
      // The lab check found something: show it instead of a toast.
      if (d.kode === "belum_siap" && d.cek) {
        setBelum({ cek: d.cek, serverId: d.serverId ?? null });
        return;
      }
      setBelum(null);
      if (!d.ok) {
        window.Toast?.show(pesan(t, d.kode), "danger");
        return;
      }
      window.Toast?.show(k.started, "ok");
      if (d.apDiantre === false) window.Toast?.show(t.apNotQueued, "warn", { duration: 12_000 });
      // Preparation is already on /session: a hash alone wouldn't leave it.
      history.replaceState(null, "", `${href(lang, "/session")}#board`);
      location.reload();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  if (!st) return null;
  const aktif = st.aktif;
  const jalan = !!sesi;
  const sejak = st.sejak
    ? `${tanggalPanjang(st.sejak.slice(0, 10), lang)} ${new Date(st.sejak).toLocaleTimeString(
        "en-GB",
        { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" },
      )}`
    : "";

  return (
    <div className="stack">
      <section className="panel panel--solo">
        <div className="panel__head">
          <h2 className="panel__title">{k.title}</h2>
          <span className={`pill${aktif ? " pill--warn" : ""}`}>{aktif ? k.on : k.off}</span>
        </div>
        <p>{k.intro}</p>
        <p className="hint">{k.keep}</p>
        <div className="row" style={{ alignItems: "center", gap: "var(--space-3)" }}>
          <Switch
            on={aktif}
            onChange={(v) => setAsk(v)}
            label={k.sw}
            showLabel
            disabled={!bolehUbah || jalan}
          />
        </div>
        {aktif && st.sejak && <p className="hint">{k.since(sejak, st.olehKode)}</p>}
        {!bolehUbah && <p className="hint">{k.noRight}</p>}
        {bolehUbah && jalan && <p className="hint">{k.running}</p>}
        {bolehUbah && !!st.riwayat && (
          <div className="row" style={{ alignItems: "center", gap: "var(--space-3)" }}>
            <span className="hint grow">{k.history(st.riwayat)}</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHapus(true)}>
              <TrashIcon size={16} aria-hidden="true" />
              {k.clear}
            </button>
          </div>
        )}
      </section>

      {aktif && (
        <section className="panel panel--solo">
          <div className="panel__head">
            <h2 className="panel__title">{k.startTitle}</h2>
          </div>
          {sesi ? (
            <div className="row" style={{ alignItems: "center", gap: "var(--space-3)" }}>
              <p style={{ margin: 0 }}>{sesi.jenis === "tot" ? k.totRunning : k.otherRunning}</p>
              <a className="btn btn--primary" href={`${href(lang, "/session")}#board`}>
                {k.openSession}
                <ArrowRightIcon aria-hidden="true" />
              </a>
            </div>
          ) : !bolehMulai ? (
            <p className="hint">{k.noPair}</p>
          ) : (
            <>
              <p className="hint">{k.startHint}</p>
              <div className="field">
                <span className="field__label">{k.module}</span>
                <div className="modpick" role="radiogroup" aria-label={k.module}>
                  {[1, 2, 3, 4].map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={modul === m}
                      className="modpick__b"
                      style={{ "--m": `var(--mod-${m})` } as CSSProperties}
                      onClick={() => setModul(m)}
                    >
                      <span className="modpick__top">
                        <Pill modul={m}>{modulLabel(m, lang)}</Pill>
                      </span>
                      <b>{t.modulNama(m)}</b>
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field__label">{k.length}</span>
                <div className="startcard__len">
                  <Stepper
                    value={durasi}
                    onChange={setDurasi}
                    min={SESI_MIN_MENIT}
                    max={SESI_CAP_MENIT}
                    step={15}
                    label={k.length}
                    fmt={(v) => menitLabel(v, lang)}
                    lessLabel={k.shorter}
                    moreLabel={k.longer}
                  />
                  {DURASI_CEPAT.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="chipbtn"
                      aria-pressed={durasi === v}
                      aria-label={menitLabel(v, lang)}
                      onClick={() => setDurasi(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--lg btn--block"
                  disabled={busy}
                  data-loading={busy ? "yes" : undefined}
                  onClick={() => void mulai()}
                >
                  <PlayIcon size={20} weight="fill" aria-hidden="true" />
                  <span className="btn__label">{k.start(modulLabel(modul, lang))}</span>
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="panel panel--solo">
        <div className="panel__head">
          <h2 className="panel__title">{k.accounts}</h2>
        </div>
        <p className="hint">{k.accountsHint}</p>
        <ul className="totacc">
          {DIVISI.map((d, i) => (
            <li key={d} className="totacc__row">
              <span className="totacc__grp">
                {k.group(i + 1)} <b>{d}</b>
              </span>
              <span>
                <span className="mono">{`${i + 1}00000`}</span> {k.sampai}{" "}
                <span className="mono">{`${i + 1}0000${TOT_PER_KELOMPOK - 1}`}</span>
              </span>
              <span className="hint">{k.names(d)}</span>
            </li>
          ))}
        </ul>
      </section>

      <Confirm
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask ? k.onTitle : k.offTitle}
        body={ask ? k.onBody : k.offBody}
        confirmLabel={ask ? k.onOk : k.offOk}
        cancelLabel={k.cancel}
        tone={ask ? "danger" : "primary"}
        lang={lang}
        onConfirm={() => ubah(!!ask)}
      />

      <Confirm
        open={hapus}
        onOpenChange={setHapus}
        title={k.clearTitle}
        body={k.clearBody(st.riwayat ?? 0)}
        confirmLabel={k.clear}
        cancelLabel={k.cancel}
        tone="danger"
        lang={lang}
        onConfirm={async () => {
          const d = await postJson<{ ok: boolean; kode?: string; dihapus?: number }>(
            "/api/session/tot",
            { hapusRiwayat: true },
          ).catch(() => ({ ok: false, kode: undefined, dihapus: 0 }));
          if (!d.ok) {
            window.Toast?.show(pesan(t, d.kode), "danger");
            return false;
          }
          window.Toast?.show(k.cleared(d.dihapus ?? 0), "ok");
          load();
          onChanged();
        }}
      />

      <StartCheck
        data={belum}
        modul={modul}
        tot
        lang={lang}
        busy={busy}
        onClose={() => setBelum(null)}
        onRecheck={() => void mulai()}
        onForce={(alasan) => void mulai(alasan)}
      />
    </div>
  );
}
