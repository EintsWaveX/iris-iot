/**
 * Written reports list (Phase 9 Stage 6b, mockup r-docs): My Drafts, Sent
 * (mine) and All Reports (every sent one), filters by type and author, and
 * New Report, which asks for the type and opens the editor.
 */
import { slotLabel } from "../../lib/labels";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarBlankIcon,
  ChatCircleTextIcon,
  NoteIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  WarningOctagonIcon,
} from "@phosphor-icons/react";
import { getJson, kodeGalat, tanggalPanjang, type ErrorCode } from "../../lib/app";
import { blokAwal, JENIS_DOKUMEN, type JenisDokumen, type StatusDokumen } from "../../lib/laporan";
import type { Lang } from "../../lib/kelas";
import type { Direktori } from "../../lib/people";
import BackButton from "../ui/BackButton";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import TabLine from "../ui/TabLine";
import Fade from "../ui/Fade";
import ErrorView from "../ui/ErrorView";
import { kirim } from "./data";
import type { Tx } from "./strings";
import { useSiaran } from "../../lib/siaran";

export const TYPE_TONE: Record<JenisDokumen, "accent" | "danger" | "violet" | undefined> = {
  sesi: "accent",
  kerusakan: "danger",
  permintaan: "violet",
  lainnya: undefined,
};
const TYPE_IC = {
  sesi: CalendarBlankIcon,
  kerusakan: WarningOctagonIcon,
  permintaan: PaperPlaneTiltIcon,
  lainnya: NoteIcon,
};
const STAT_TONE: Record<StatusDokumen, "accent" | "warn" | "ok" | undefined> = {
  draf: undefined,
  terkirim: "accent",
  diproses: "warn",
  selesai: "ok",
};

export function TypeBadge({ jenis, t }: { jenis: JenisDokumen; t: Tx }) {
  const Ic = TYPE_IC[jenis];
  return (
    <Pill tone={TYPE_TONE[jenis]}>
      <Ic size={14} aria-hidden="true" />
      {t.types[jenis]}
    </Pill>
  );
}

interface DocRow {
  id: number;
  judul: string;
  jenis: JenisDokumen;
  status: StatusDokumen;
  konteks: { sesiId?: number; sebut?: string[] };
  penulisNim: string;
  diubahPada: string;
  dikirimPada: string | null;
  komentar: number;
}

type TabDoc = "draf" | "kirim" | "semua";
const idBaru = () => `b${Math.random().toString(36).slice(2, 9)}`;

/** Makes a draft and returns its id (the editor opens on it). */
export async function buatDraf(
  jenis: JenisDokumen,
  isi?: { judul?: string; blok?: unknown[]; sesiId?: number },
): Promise<number | null> {
  const r = await kirim<{ id: number }>("/api/session/dokumen", {
    aksi: "buat",
    jenis,
    judul: isi?.judul ?? "",
    blok: isi?.blok ?? blokAwal(jenis, idBaru),
    konteks: isi?.sesiId ? { sesiId: isi.sesiId } : {},
  });
  return r.ok ? r.id : null;
}

export default function Docs({
  t,
  lang,
  dir,
  me,
  onBack,
  onOpen,
}: {
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
  onBack: () => void;
  onOpen: (id: number) => void;
}) {
  const [rows, setRows] = useState<DocRow[] | null>(null);
  const [sesi, setSesi] = useState<{ id: number; tanggal: string; slot: number | null }[]>([]);
  const [fail, setFail] = useState<ErrorCode | false>(false);
  const [tab, setTab] = useState<TabDoc>("semua");
  const [jenis, setJenis] = useState<JenisDokumen | "all">("all");
  const [penulis, setPenulis] = useState("all");
  const [neu, setNeu] = useState(false);
  // ?baru=1 (an error page's "Laporkan") opens the type picker at once;
  // ?baru=kerusakan&konteks=N (the hand-over's "Laporkan Kerusakan") makes
  // that kind of draft, tied to the session, and opens it.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const b = q.get("baru");
    if (!b) return;
    const sesiId = Number(q.get("konteks")) || undefined;
    q.delete("baru");
    q.delete("konteks");
    const rest = q.toString().replace(/=(&|$)/g, "$1");
    history.replaceState(history.state, "", location.pathname + (rest ? `?${rest}` : ""));
    if ((JENIS_DOKUMEN as readonly string[]).includes(b)) {
      void buatDraf(b as JenisDokumen, { sesiId }).then((id) =>
        id ? onOpen(id) : window.Toast?.show(t.err, "danger"),
      );
    } else setNeu(true);
  }, []);
  const [busy, setBusy] = useState(false);
  useSiaran(["laporan"], () => void load());
  const load = useCallback(async () => {
    try {
      const d = await getJson<{ ok: boolean; laporan: DocRow[]; sesi: typeof sesi }>(
        "/api/session/dokumen",
      );
      if (!d.ok) throw new Error("dokumen");
      setRows(d.laporan);
      setSesi(d.sesi);
      setFail(false);
    } catch (e) {
      setFail(kodeGalat(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const all = rows ?? [];
  const list = useMemo(
    () =>
      all
        .filter((d) =>
          tab === "draf"
            ? d.status === "draf" && d.penulisNim === me
            : tab === "kirim"
              ? d.status !== "draf" && d.penulisNim === me
              : d.status !== "draf" || d.penulisNim === me,
        )
        .filter((d) => jenis === "all" || d.jenis === jenis)
        .filter((d) => penulis === "all" || d.penulisNim === penulis),
    [all, tab, jenis, penulis, me],
  );
  const penulisList = [...new Set(all.map((d) => d.penulisNim))].sort((a, b) =>
    dir.nama(a).localeCompare(dir.nama(b)),
  );
  const ctx = (d: DocRow) => {
    const s = sesi.find((x) => x.id === d.konteks.sesiId);
    return s
      ? `${tanggalPanjang(s.tanggal, lang)}${s.slot ? ` · ${slotLabel(s.slot, lang)}` : ""}`
      : "";
  };
  const baru = async (j: JenisDokumen) => {
    setBusy(true);
    const id = await buatDraf(j);
    setBusy(false);
    if (!id) return void window.Toast?.show(t.err, "danger");
    setNeu(false);
    onOpen(id);
  };

  return (
    <div className="rp">
      <BackButton lang={lang} label={t.docsBack} onClick={onBack} />
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.eyebrow}</span>
            <h1 className="page-header__title">{t.written}</h1>
          </div>
          <div className="page-header__actions">
            <button type="button" className="btn btn--primary" onClick={() => setNeu(true)}>
              <PlusIcon size={18} aria-hidden="true" />
              {t.newDoc}
            </button>
          </div>
        </div>
      </header>
      <TabLine
        label={t.written}
        value={tab}
        onChange={setTab}
        tabs={[
          {
            v: "draf",
            label: t.docTabs.draf,
            n: all.filter((d) => d.status === "draf" && d.penulisNim === me).length,
          },
          {
            v: "kirim",
            label: t.docTabs.kirim,
            n: all.filter((d) => d.status !== "draf" && d.penulisNim === me).length,
          },
          { v: "semua", label: t.docTabs.semua },
        ]}
      />
      <div className="rp-dbar">
        <Dropdown
          id="doc-jenis-f"
          label={t.jenis}
          hideLabel
          value={jenis}
          onChange={(v) => setJenis(v as JenisDokumen | "all")}
          options={[
            { value: "all", label: t.allTypes },
            ...JENIS_DOKUMEN.map((k) => ({ value: k, label: t.types[k] })),
          ]}
        />
        <Dropdown
          id="doc-penulis-f"
          label={t.penulis}
          hideLabel
          value={penulis}
          onChange={setPenulis}
          options={[
            { value: "all", label: t.allAuthors },
            ...penulisList.map((n) => ({ value: n, label: dir.nama(n) })),
          ]}
        />
        <span className="hint">{t.docsHint}</span>
      </div>
      <Fade k={tab}>
        <section className="panel">
          {fail && !rows ? (
            <ErrorView code={fail} lang={lang} onRetry={() => void load()} />
          ) : rows === null ? (
            <span className="skeleton" style={{ height: 220 }} />
          ) : list.length === 0 ? (
            <p className="rp-empty">{t.noDocs}</p>
          ) : (
            <div className="rp-stops rp-stops--doc">
              {list.map((d) => {
                const when = d.dikirimPada ?? d.diubahPada;
                const c = ctx(d);
                return (
                  <div
                    key={d.id}
                    className="rp-stops__row"
                    role="link"
                    tabIndex={0}
                    onClick={() => onOpen(d.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(d.id);
                      }
                    }}
                  >
                    <TypeBadge jenis={d.jenis} t={t} />
                    <span className="stack" style={{ gap: 2 }}>
                      <b>{d.judul || t.untitled}</b>
                      <span className="hint">
                        {dir.nama(d.penulisNim)} · {tanggalPanjang(when, lang)}
                        {c ? ` · ${c}` : ""}
                      </span>
                      {d.konteks.sebut?.includes(me) && d.penulisNim !== me && (
                        <span>
                          <Pill tone="gold">{t.mentionsYou}</Pill>
                        </span>
                      )}
                    </span>
                    <Pill tone={STAT_TONE[d.status]}>{t.stat[d.status]}</Pill>
                    <span className="row row--nowrap hint" aria-label={t.comments(d.komentar)}>
                      <ChatCircleTextIcon size={16} aria-hidden="true" />
                      {d.komentar}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </Fade>
      <Dialog
        open={neu}
        onOpenChange={setNeu}
        title={t.newDoc}
        description={t.newDocDesc}
        size="lg"
        lang={lang}
      >
        <div className="rp-newdoc">
          {JENIS_DOKUMEN.map((k) => {
            const Ic = TYPE_IC[k];
            return (
              <button
                key={k}
                type="button"
                className="rp-newdoc__b"
                disabled={busy}
                onClick={() => void baru(k)}
              >
                <span className="rp-newdoc__ic" data-tone={TYPE_TONE[k] ?? "none"}>
                  <Ic size={26} aria-hidden="true" />
                </span>
                <b>{t.types[k]}</b>
                <span className="hint">{t.typeHint[k]}</span>
              </button>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
