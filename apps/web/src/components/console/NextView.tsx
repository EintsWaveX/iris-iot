/**
 * "Siapkan sesi berikutnya" (Phase 9 Stage 3, mockup c-next), reached from
 * the after-session screen once a session reached 150 minutes. One list in
 * two halves:
 *
 * - Groups that didn't finish (a wrong blank, or a student missing a
 *   score): each carries on in a makeup session (the default) or is just
 *   closed. "Create a Makeup Session Draft" asks for a date and time and
 *   copies those groups into the draft (POST /api/session/susulan with
 *   lanjutanDari), numbered again from 1.
 * - Hand the room over: the next slot today, then the Orange Pi actions the
 *   next module needs (restart its services; the hotspot only around
 *   Module 4), each sent with /api/action like the Server page does.
 *
 * Not here yet, by design: clearing the serial buffers and resetting the
 * hunt round need agent commands that don't exist; kit counts need a
 * table; SeeLabs status comes with Stage 3g and the report draft with
 * Stage 6.
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CalendarPlusIcon,
  CheckCircleIcon,
  WifiHighIcon,
} from "@phosphor-icons/react";
import BackButton from "../ui/BackButton";
import Dialog from "../ui/Dialog";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { DateField, TimeField } from "../ui/Controls";
import { getJson, namaKelompok, postJson, tanggalPanjang } from "../../lib/app";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { hariDariTanggal } from "../../lib/jadwal-parser";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import { useDirektori } from "../../lib/people";
import { pesan, type Strings } from "./strings";
import { kapanSesi } from "./DoneView";
import { belumSelesai, useRingkasSesi } from "./ringkasSesi";
import type { SesiRunning } from "./types";

/** The Orange Pi service each module runs (Module 1 runs none). */
const LAYANAN: Record<number, string | undefined> = { 2: "modul2-ws", 3: "mosquitto", 4: "modul4" };

interface SlotHariIni {
  slot: number;
  status: string;
  asisten: string[];
  roster: { praktikan: number };
}

export default function NextView({
  t,
  lang,
  sesi,
  onBack,
  onPrep,
  onHome,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  onBack: () => void;
  /** Opens Preparation on a roster: "4-3" for a slot, "d12" for a draft. */
  onPrep: (pilih: string | null) => void;
  onHome: () => void;
}) {
  const sum = useRingkasSesi(sesi.id);
  const dir = useDirektori();
  const unfin = (sum?.grup ?? []).filter(belumSelesai);
  const [picks, setPicks] = useState<Record<number, "lanjut" | "tutup">>({});
  const [dlg, setDlg] = useState(false);
  const [made, setMade] = useState<{ id: number; text: string } | null>(null);
  const [slots, setSlots] = useState<SlotHariIni[] | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void getJson<{ ok: boolean; hariIni: SlotHariIni[] }>("/api/session/beranda")
      .then((d) => setSlots(d.ok ? d.hariIni : []))
      .catch(() => setSlots([]));
  }, []);

  const lanjut = unfin.filter((g) => (picks[g.nomor] ?? "lanjut") === "lanjut");
  const today = sesi.tanggal === hariIniWib();
  const next = today
    ? (slots ?? [])
        .filter((s) => s.status === "aktif" && (sesi.slot ? s.slot > sesi.slot : true))
        .sort((a, b) => a.slot - b.slot)[0]
    : undefined;
  const m = sesi.modul;
  const mName = modulLabel(m, lang);
  const layanan = LAYANAN[m];
  // The next slot runs this week's module; the hotspot is Module 4's.
  const hotspot: "on" | "off" | null = m === 4 ? (next ? "on" : "off") : null;

  async function kirim(key: string, aksi: string, argumen: Record<string, string>) {
    try {
      const d = await getJson<{ ok: boolean; server: { id: number }[] }>("/api/server");
      if (!d.ok || d.server.length !== 1) return window.Toast?.show(t.cmdNoPi, "warn");
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/action", {
        tipe: "kirim",
        serverId: d.server[0].id,
        aksi,
        argumen,
      });
      if (!r.ok) return window.Toast?.show(pesan(t, r.kode), "danger");
      setSent((x) => ({ ...x, [key]: true }));
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  return (
    <div className="nextv" style={{ "--mod-hue": `var(--mod-${m})` } as CSSProperties}>
      <BackButton lang={lang} label={t.nextBack} onClick={onBack} />
      <header className="page-header__heading">
        <span className="page-header__eyebrow">{t.nextEyebrow(mName, kapanSesi(t, sesi))}</span>
        <h1 className="page-header__title">{t.nextTitle}</h1>
        <p className="page-header__subtitle">{t.nextLede}</p>
      </header>

      <div className="grid-2 nextv__grid">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.unfinTitle}</h2>
            {unfin.length > 0 && <Pill tone="warn">{unfin.length}</Pill>}
          </div>
          {!sum ? (
            <span className="skeleton" style={{ height: 160 }} />
          ) : unfin.length === 0 ? (
            <div className="nextv__empty">
              <CheckCircleIcon size={28} aria-hidden="true" />
              <b>{t.unfinNone}</b>
              <span className="hint">{t.unfinNoneBody}</span>
            </div>
          ) : (
            <div className="stack">
              {unfin.map((g) => (
                <div
                  key={g.id}
                  className="unfin"
                  style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
                >
                  <div className="row" style={{ gap: 8 }}>
                    <Pill group={g.nomor}>{t.group(g.nomor)}</Pill>
                    <span className="hint">
                      {namaKelompok(g.nomor, g.nama)} · {g.asisten ? dir.nama(g.asisten) : "?"}
                    </span>
                  </div>
                  <div className="unfin__miss">
                    <span>
                      <small>{t.colBlanks}</small>
                      <b className="num">
                        {g.benar}/{g.total}
                      </b>
                    </span>
                    <span>
                      <small>{t.colScores}</small>
                      <b className="num">
                        {g.lengkap}/{g.anggota}
                      </b>
                    </span>
                    <span>
                      <small>{t.colNote}</small>
                      <b>{g.catatan ? t.noteYes : t.noteNo}</b>
                    </span>
                  </div>
                  <SegmentedControl
                    fill
                    aria-label={t.group(g.nomor)}
                    value={picks[g.nomor] ?? "lanjut"}
                    onValueChange={(v) =>
                      setPicks({ ...picks, [g.nomor]: v as "lanjut" | "tutup" })
                    }
                    options={[
                      { value: "lanjut", label: t.pickGo },
                      { value: "tutup", label: t.pickClose },
                    ]}
                  />
                </div>
              ))}
              {made ? (
                <div className="nextv__made">
                  <CheckCircleIcon size={20} aria-hidden="true" />
                  <span className="grow">{made.text}</span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => onPrep(`d${made.id}`)}
                  >
                    {t.draftOpen}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary btn--lg btn--block"
                  disabled={lanjut.length === 0}
                  onClick={() => setDlg(true)}
                >
                  <CalendarPlusIcon size={20} aria-hidden="true" />
                  {t.makeDraft}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.roomTitle}</h2>
          </div>
          <div className="nextv__slot">
            {slots === null ? (
              <span className="skeleton" style={{ height: 44 }} />
            ) : next ? (
              <span className="stack" style={{ gap: 2 }}>
                <b>
                  {t.roomNext(next.slot, (SLOT_MULAI[next.slot] ?? "").replace(":", "."), mName)}
                </b>
                <span className="row" style={{ gap: 4 }}>
                  {[...new Set(next.asisten)].map((k) => (
                    <span key={k} className="acode">
                      {k}
                    </span>
                  ))}
                  <span className="hint">{t.roomStudents(next.roster.praktikan)}</span>
                </span>
              </span>
            ) : (
              <span>{t.roomLast}</span>
            )}
          </div>
          <ul className="cmdlist">
            <li>
              <ArrowsClockwiseIcon size={20} aria-hidden="true" />
              <span className="grow">
                {layanan ? t.cmdRestart(mName) : t.cmdNoService(mName)}
                {layanan && <span className="hint mono"> {layanan}</span>}
              </span>
              {layanan ? (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={sent.layanan}
                  onClick={() => void kirim("layanan", "layanan.mulai_ulang", { layanan })}
                >
                  {sent.layanan ? t.cmdDone : t.cmdRun}
                </button>
              ) : (
                <Pill>{t.cmdSkip}</Pill>
              )}
            </li>
            <li>
              <WifiHighIcon size={20} aria-hidden="true" />
              <span className="grow">
                {hotspot === "on"
                  ? t.cmdHotOn
                  : hotspot === "off"
                    ? t.cmdHotOff
                    : t.cmdHotSkip(mName)}
              </span>
              {hotspot ? (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={sent.ap}
                  onClick={() => void kirim("ap", hotspot === "on" ? "ap.nyala" : "ap.mati", {})}
                >
                  {sent.ap ? t.cmdDone : t.cmdRun}
                </button>
              ) : (
                <Pill>{t.cmdSkip}</Pill>
              )}
            </li>
          </ul>
        </section>
      </div>

      <div className="nextv__act">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() =>
            next ? onPrep(`${hariDariTanggal(sesi.tanggal)}-${next.slot}`) : onHome()
          }
        >
          {next ? t.nextDoneSlot : t.nextDoneLab}
          <ArrowRightIcon size={18} aria-hidden="true" />
        </button>
      </div>

      {dlg && (
        <DraftDialog
          t={t}
          lang={lang}
          sesiId={sesi.id}
          kelompok={lanjut.map((g) => g.nomor)}
          onClose={() => setDlg(false)}
          onMade={(id, tgl) => {
            setDlg(false);
            setMade({ id, text: t.draftMade(tanggalPanjang(tgl, lang)) });
          }}
        />
      )}
    </div>
  );
}

function DraftDialog({
  t,
  lang,
  sesiId,
  kelompok,
  onClose,
  onMade,
}: {
  t: Strings;
  lang: Lang;
  sesiId: number;
  kelompok: number[];
  onClose: () => void;
  onMade: (id: number, tanggal: string) => void;
}) {
  const [tanggal, setTanggal] = useState(hariIniWib());
  const [jam, setJam] = useState("13:00");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string; id?: number }>("/api/session/susulan", {
      tanggal,
      mulai: jam,
      lanjutanDari: sesiId,
      kelompok,
    }).catch(() => ({ ok: false }) as { ok: boolean; kode?: string; id?: number });
    setBusy(false);
    if (!r.ok || !r.id) return window.Toast?.show(pesan(t, r.kode), "danger");
    window.Toast?.show(t.draftMade(tanggalPanjang(tanggal, lang)), "ok");
    onMade(r.id, tanggal);
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.draftTitle}
      description={t.draftDesc(kelompok.length)}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void create()}
          >
            {t.draftCreate}
          </button>
        </>
      }
    >
      <div className="draftgrid">
        <div className="field">
          <span className="field__label" id="nx-date">
            {t.draftDate}
          </span>
          <DateField
            value={tanggal}
            onChange={setTanggal}
            label={t.draftDate}
            labelledBy="nx-date"
            lang={lang}
            min={hariIniWib()}
          />
        </div>
        <div className="field">
          <span className="field__label" id="nx-time">
            {t.draftTime}
          </span>
          <TimeField
            value={jam}
            onChange={setJam}
            label={t.draftTime}
            labelledBy="nx-time"
            lang={lang}
            from={6}
            to={21}
            step={15}
          />
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {kelompok.map((n) => (
          <Pill key={n} group={n}>
            {t.group(n)}
          </Pill>
        ))}
      </div>
    </Dialog>
  );
}
