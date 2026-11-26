/**
 * A panel that is still loading: the skeleton, until the connection has failed
 * twice in a row; then a plain note with a retry, instead of a skeleton that
 * never ends (the polls retry on their own, so the note also goes away alone).
 */
import { dict } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";
import type { PollState } from "../../../../lib/hooks";
import Skeleton from "../../../ui/Skeleton";

const W = dict<{ fail: string; retry: string }>({
  id: { fail: "Belum bisa dimuat. Aplikasi mencoba lagi sendiri.", retry: "Coba Lagi" },
  en: { fail: "Could not load yet. The app keeps trying on its own.", retry: "Try Again" },
  zh: { fail: "暂时无法加载。应用会自动重试。", retry: "重试" },
});

export default function Memuat({
  lang,
  poll,
  height,
}: {
  lang: Lang;
  poll: Pick<PollState<unknown>, "errors" | "refresh">;
  height: number;
}) {
  if (poll.errors < 2) return <Skeleton height={height} />;
  const w = W[lang];
  return (
    <div className="rec-note rec-note--warn" role="alert">
      <span>{w.fail}</span>{" "}
      <button type="button" className="btn btn--ghost btn--sm" onClick={poll.refresh}>
        <span className="btn__label">{w.retry}</span>
      </button>
    </div>
  );
}
