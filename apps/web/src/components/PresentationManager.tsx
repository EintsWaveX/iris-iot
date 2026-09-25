/**
 * The assistant's presentation library manager (Stage 9): upload, switch
 * which entry is active, delete. Upload goes straight from the browser to
 * Vercel Blob via @vercel/blob/client's upload() -- see
 * api/presentasi/[aksi].ts's header for why the file's bytes never pass
 * through our own function.
 *
 * Non-PDF and oversized files are refused here too, before ever touching
 * the network, even though the real enforcement is server-side in
 * onBeforeGenerateToken (a client check can always be bypassed, so it
 * exists purely to fail fast with a clear message instead of a token
 * request that would just be rejected).
 */
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import "./PresentationManager.css";

interface Entry {
  id: number;
  namaBerkas: string;
  url: string;
  diunggahOleh: string;
  diunggahPada: string;
  aktif: boolean;
}

const MAX_BYTES = 20 * 1024 * 1024;

export default function PresentationManager() {
  const [daftar, setDaftar] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = "presentasi-file-input";
  const mounted = useRef(true);

  async function muat() {
    try {
      const data = await fetch("/api/presentasi/daftar").then((r) => r.json());
      if (mounted.current && data.ok) setDaftar(data.daftar);
    } catch {
      // Left as an empty list -- the empty state below still says
      // something sensible rather than the page silently doing nothing.
    } finally {
      if (mounted.current) setLoaded(true);
    }
  }

  useEffect(() => {
    mounted.current = true;
    muat();
    return () => {
      mounted.current = false;
    };
  }, []);

  async function onUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setError(null);

    if (file.type !== "application/pdf") {
      setError("Hanya berkas PDF yang diterima.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Berkas terlalu besar (maksimum ${Math.floor(MAX_BYTES / 1024 / 1024)} MB).`);
      return;
    }

    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/presentasi/token",
      });
      const res = await fetch("/api/presentasi/simpan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, namaBerkas: file.name }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError("Berkas terunggah, tetapi gagal dicatat. Coba muat ulang.");
      } else {
        window.Toast?.show("Presentasi diunggah.", "ok");
      }
      await muat();
    } catch {
      setError("Gagal mengunggah. Periksa sambungan lalu coba lagi.");
    } finally {
      if (mounted.current) setUploading(false);
    }
  }

  async function aktifkan(id: number) {
    setBusyId(id);
    try {
      const res = await fetch("/api/presentasi/aktifkan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) {
        window.Toast?.show("Tidak dapat mengaktifkan presentasi ini.", "danger");
      }
      await muat();
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  async function nonaktifkan() {
    setBusyId(-1);
    try {
      const res = await fetch("/api/presentasi/nonaktifkan", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        window.Toast?.show("Tidak ada presentasi yang aktif.", "danger");
      } else {
        window.Toast?.show("Presentasi dinonaktifkan.", "ok");
      }
      await muat();
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  async function hapus(id: number) {
    setBusyId(id);
    try {
      const res = await fetch("/api/presentasi/hapus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) {
        window.Toast?.show("Tidak dapat menghapus presentasi ini.", "danger");
      }
      await muat();
    } catch {
      window.Toast?.show("Tidak dapat menghubungi server.", "danger");
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  return (
    <div className="presentation-manager">
      <input
        type="file"
        accept="application/pdf"
        id={inputId}
        className="presentation-manager__input"
        onChange={onUpload}
        disabled={uploading}
      />
      <label
        htmlFor={inputId}
        className="btn btn--primary presentation-manager__upload-btn"
        data-loading={uploading ? "yes" : "no"}
      >
        {uploading ? "Mengunggah…" : "Unggah PDF"}
      </label>

      {error && (
        <p className="presentation-manager__error" role="alert">
          {error}
        </p>
      )}

      {loaded && daftar.length === 0 && (
        <p className="presentation-manager__kosong">Belum ada presentasi yang diunggah.</p>
      )}

      <ul className="presentation-manager__list">
        {daftar.map((p) => (
          <li key={p.id} className="presentation-manager__item" data-aktif={p.aktif ? "yes" : "no"}>
            <div className="presentation-manager__info">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.namaBerkas}
              </a>
              <span className="presentation-manager__meta">
                {p.aktif ? "Aktif" : "Tidak aktif"} · diunggah oleh {p.diunggahOleh}
              </span>
            </div>
            <div className="presentation-manager__actions">
              {p.aktif ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => nonaktifkan()}
                  disabled={busyId !== null}
                >
                  Nonaktifkan
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => aktifkan(p.id)}
                  disabled={busyId === p.id}
                >
                  Aktifkan
                </button>
              )}
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => hapus(p.id)}
                disabled={busyId === p.id}
              >
                Hapus
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
