/**
 * The assistant's active presentation, embedded for every praktikan
 * (Stage 9). Fetches once on mount rather than polling: unlike the session
 * banner, which changes minute to minute, swapping the active slide deck
 * is a rare assistant action, not something a student needs to see land
 * within seconds of it happening.
 */
import { useEffect, useState } from "react";
import "./PresentationCard.css";

interface Entry {
  namaBerkas: string;
  url: string;
}

export default function PresentationCard() {
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    fetch("/api/presentasi/aktif")
      .then((r) => r.json())
      .then((data) => {
        if (mounted) setEntry(data.ok ? data.presentasi : null);
      })
      .catch(() => {
        if (mounted) setEntry(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // undefined is the brief in-flight moment before the first response --
  // rendering nothing then avoids a flash of the empty state on every load.
  if (entry === undefined) return null;

  if (entry === null) {
    return (
      <div className="presentation-card presentation-card--kosong">
        <p className="presentation-card__kosong-teks">Belum ada presentasi aktif.</p>
      </div>
    );
  }

  return (
    <div className="presentation-card">
      <iframe src={entry.url} title={entry.namaBerkas} className="presentation-card__frame" />
      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className="presentation-card__buka"
      >
        Buka di tab baru
      </a>
    </div>
  );
}
