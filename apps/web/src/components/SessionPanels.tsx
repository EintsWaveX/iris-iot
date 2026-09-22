/**
 * The new pieces of Stage 10's assistant console: per-group tiles
 * (attendance, blanks completed, per-group note and role), the "perlu
 * bantuan" stuck list, a broadcast form, and a server readiness panel.
 * session.astro's own vanilla script still owns session start/end/cancel
 * and the roster box -- ported, unchanged code, not new interactive UI.
 *
 * Deliberately absent here: connection state, last-message time and live
 * delay per group, which the plan's own bullet list for this panel names
 * alongside blanks completed. Those need a live telemetry source, and none
 * exists yet for any module from this site -- see the plan's own "how live
 * data actually reaches a browser" section, which is Stage 15's job, not
 * this one's. Showing a fabricated number here would be worse than a tile
 * that is honest about not having one yet.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { startPolling } from "../scripts/polling";
import "./SessionPanels.css";

interface KelompokPanel {
  id: number;
  nomor: number;
  nama: string;
  sesiAktif: boolean;
  catatan: string | null;
  peran: "beacon" | "hunter" | null;
  anggotaTotal: number;
  hadir: number;
  benar: number;
  total: number;
}

interface Stuck {
  kelompokId: number;
  nomor: number | null;
  soalKode: string;
  percobaan: number;
}

interface Heartbeat {
  pada: string;
  jamSelaras: boolean;
  modeJaringan: string | null;
  layanan: Record<string, string> | null;
}

interface ServerRow {
  id: number;
  nama: string;
  kode: string;
  denyutTerakhir: Heartbeat | null;
}

const OFFLINE_AFTER_MS = 60_000;
const LAYANAN_LABEL: Record<string, string> = {
  "modul2-ws": "WebSocket Modul 2",
  mosquitto: "Mosquitto (Modul 3)",
  modul4: "Papan skor Modul 4",
};

const KODE_PESAN: Record<string, string> = {
  format_salah: "Formatnya belum benar.",
  sesi_tidak_ada: "Sesi ini tidak ditemukan.",
  galat_server: "Server sedang bermasalah. Coba lagi sesaat lagi.",
};
function pesanUntuk(kode: string | undefined): string {
  return KODE_PESAN[kode ?? ""] ?? "Terjadi kesalahan.";
}

function isOnline(hb: Heartbeat | null): boolean {
  if (!hb) return false;
  return Date.now() - new Date(hb.pada).getTime() < OFFLINE_AFTER_MS;
}

export default function SessionPanels() {
  const [sesiId, setSesiId] = useState<number | null>(null);
  const [modul, setModul] = useState<number | null>(null);
  const [kelompok, setKelompok] = useState<KelompokPanel[]>([]);
  const [stuck, setStuck] = useState<Stuck[]>([]);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sending, setSending] = useState(false);

  // Per-tile catatan/peran drafts, keyed by kelompokId -- not overwritten
  // by a poll response while that tile's textarea has focus, the same
  // "don't clobber an in-progress edit" rule session.astro's roster box
  // already follows for the same reason.
  const [drafts, setDrafts] = useState<Record<number, { catatan: string; peran: string }>>({});
  const focusedRef = useRef<number | null>(null);

  async function muat() {
    try {
      const [laporan, daftarServer] = await Promise.all([
        fetch("/api/session/laporan").then((r) => r.json()),
        fetch("/api/server").then((r) => r.json()),
      ]);
      if (laporan.ok) {
        // Defensive fallbacks, not just optimism: this component has no
        // error boundary, so a response that's `ok: true` but missing an
        // expected array (a transient backend hiccup, an older deploy
        // still warming up) would otherwise crash the whole render tree
        // on the next .length/.map call and blank the console until a
        // full reload, instead of just skipping that poll's update.
        const kelompokList: KelompokPanel[] = laporan.kelompok ?? [];
        setSesiId(laporan.sesi?.id ?? null);
        setModul(laporan.sesi?.modul ?? null);
        setKelompok(kelompokList);
        setStuck(laporan.stuck ?? []);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const k of kelompokList) {
            if (focusedRef.current === k.id) continue;
            next[k.id] = { catatan: k.catatan ?? "", peran: k.peran ?? "" };
          }
          return next;
        });
      }
      if (daftarServer.ok) setServers(daftarServer.server ?? []);
    } catch {
      // Left at whatever the last successful poll produced.
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    const stop = startPolling(muat, 30_000);
    return stop;
  }, []);

  async function toggleAktif(k: KelompokPanel) {
    if (!sesiId) return;
    const aktif = !k.sesiAktif;
    setKelompok((prev) => prev.map((g) => (g.id === k.id ? { ...g, sesiAktif: aktif } : g)));
    try {
      const res = await fetch("/api/session/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesiId, kelompokId: k.id, aktif }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error();
    } catch {
      setKelompok((prev) =>
        prev.map((g) => (g.id === k.id ? { ...g, sesiAktif: k.sesiAktif } : g)),
      );
      window.Toast?.show("Tidak dapat mengubah status kelompok ini.", "danger");
    }
  }

  // Takes the values to save directly rather than reading drafts[kelompokId]
  // itself -- setDrafts() is async, so a caller that just called it and
  // then read the same state back would still see the PREVIOUS value here,
  // sending a stale peran/catatan pair one keystroke or one selection
  // behind whatever the assistant actually just set.
  async function saveCatatan(kelompokId: number, catatan: string, peran: string) {
    if (!sesiId) return;
    try {
      const res = await fetch("/api/session/catatan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesiId, kelompokId, catatan, peran: peran || null }),
      });
      const data = await res.json();
      if (!data.ok) window.Toast?.show(pesanUntuk(data.kode), "danger");
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    }
  }

  async function kirimSiaran(ev: FormEvent) {
    ev.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/session/siarkan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pesan }),
      });
      const data = await res.json();
      if (data.ok) {
        window.Toast?.show(pesan.trim() ? "Pengumuman dikirim." : "Pengumuman dihapus.", "ok");
        setPesan("");
      } else {
        window.Toast?.show(pesanUntuk(data.kode), "danger");
      }
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      setSending(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="session-panels">
      <section className="session-panels__section">
        <h2 className="session-panels__heading">Kelompok</h2>
        <div className="session-panels__tiles">
          {kelompok.map((k) => (
            <div
              key={k.id}
              className="session-panels__tile"
              style={{ "--tile-hue": `var(--group-${k.nomor})` } as React.CSSProperties}
              data-aktif={k.sesiAktif ? "yes" : "no"}
            >
              <div className="session-panels__tile-head">
                <span className="session-panels__tile-nomor">Kelompok {k.nomor}</span>
                <label className="session-panels__tile-toggle">
                  <input type="checkbox" checked={k.sesiAktif} onChange={() => toggleAktif(k)} />
                  aktif
                </label>
              </div>
              <p className="session-panels__tile-nama">{k.nama}</p>
              <dl className="session-panels__tile-stats">
                <div>
                  <dt>Hadir</dt>
                  <dd>
                    {k.hadir}/{k.anggotaTotal}
                  </dd>
                </div>
                <div>
                  <dt>Blank benar</dt>
                  <dd>
                    {k.benar}/{k.total}
                  </dd>
                </div>
              </dl>
              <select
                className="session-panels__peran"
                value={drafts[k.id]?.peran ?? ""}
                onChange={(e) => {
                  const peran = e.target.value;
                  const catatan = drafts[k.id]?.catatan ?? "";
                  setDrafts((prev) => ({ ...prev, [k.id]: { catatan, peran } }));
                  void saveCatatan(k.id, catatan, peran);
                }}
              >
                <option value="">Peran biasa</option>
                <option value="beacon">Beacon (Modul 4)</option>
                <option value="hunter">Hunter (Modul 4)</option>
              </select>
              <textarea
                id={`catatan-${k.id}`}
                className="session-panels__catatan"
                placeholder="Catatan untuk kelompok ini…"
                rows={2}
                value={drafts[k.id]?.catatan ?? ""}
                onFocus={() => {
                  focusedRef.current = k.id;
                }}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [k.id]: { peran: prev[k.id]?.peran ?? "", catatan: e.target.value },
                  }))
                }
                onBlur={() => {
                  focusedRef.current = null;
                  const draft = drafts[k.id];
                  if (draft) void saveCatatan(k.id, draft.catatan, draft.peran);
                }}
              />
            </div>
          ))}
          {kelompok.length === 0 && (
            <p className="session-panels__kosong">Belum ada kelompok pada sesi ini.</p>
          )}
        </div>
      </section>

      <section className="session-panels__section">
        <h2 className="session-panels__heading">Perlu bantuan</h2>
        {stuck.length === 0 ? (
          <p className="session-panels__kosong">Tidak ada kelompok yang tersendat saat ini.</p>
        ) : (
          <ul className="session-panels__stuck">
            {stuck.map((s, i) => (
              <li key={i} className="session-panels__stuck-item">
                <span className="session-panels__stuck-kelompok">Kelompok {s.nomor ?? "?"}</span>
                <span className="session-panels__stuck-soal mono">{s.soalKode}</span>
                <span className="session-panels__stuck-percobaan">{s.percobaan}× dicoba</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="session-panels__section">
        <h2 className="session-panels__heading">Pengumuman</h2>
        <form className="session-panels__siaran" onSubmit={kirimSiaran}>
          <input
            type="text"
            className="session-panels__siaran-input"
            placeholder="Contoh: sisa 10 menit, siap-siap unduh berkas"
            value={pesan}
            onChange={(e) => setPesan(e.target.value)}
            maxLength={200}
          />
          <button type="submit" className="session-panels__siaran-kirim" disabled={sending}>
            {pesan.trim() ? "Kirim" : "Hapus pengumuman"}
          </button>
        </form>
      </section>

      <section className="session-panels__section">
        <h2 className="session-panels__heading">Kesiapan server</h2>
        {servers.length === 0 ? (
          <p className="session-panels__kosong">Belum ada Orange Pi yang terdaftar.</p>
        ) : (
          <ul className="session-panels__servers">
            {servers.map((s) => {
              const hb = s.denyutTerakhir;
              const online = isOnline(hb);
              return (
                <li key={s.id} className="session-panels__server">
                  <div className="session-panels__server-head">
                    <span data-online={online ? "yes" : "no"} className="session-panels__dot" />
                    <a href={`/servers?id=${s.id}`}>{s.nama}</a>
                  </div>
                  {hb ? (
                    <ul className="session-panels__server-facts">
                      <li data-ok={hb.jamSelaras ? "yes" : "no"}>
                        {hb.jamSelaras ? "Jam selaras" : "Jam belum selaras"}
                      </li>
                      <li>{hb.modeJaringan ?? "mode tidak diketahui"}</li>
                      {Object.entries(hb.layanan ?? {}).map(([key, status]) => (
                        <li key={key} data-ok={status === "aktif" ? "yes" : "no"}>
                          {LAYANAN_LABEL[key] ?? key}: {status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="session-panels__kosong">Belum pernah mengirim denyut.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="session-panels__catatan-fase">
        Kendali perburuan Modul 4 dan tampilan tangga/lapisan langsung menyusul di tahap berikutnya
        -- keduanya menunggu jalur data langsung yang belum ada dari situs ini.
      </p>
      {modul === 4 && (
        <p className="session-panels__catatan-fase">
          Sesi ini Modul 4: papan skor perburuan tetap dijalankan dari Orange Pi sendiri.
        </p>
      )}
    </div>
  );
}
