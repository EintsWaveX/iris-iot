/**
 * The way into /recruitment/test from the candidate's page (prompt 10): a card
 * that shows only to a candidate whose Tes Tulis room is open (check-in,
 * a part running, or Live Coding), and goes away when the room finishes. It
 * listens to the `recroom` siaran topic, so it appears the moment the pengawas
 * opens the room, with no reload and no timer.
 */
import { usePollBersama } from "../../../lib/hooks";
import { isFail, recGet } from "../../../lib/recruitment/client";
import type { Lang } from "../../../lib/kelas";
import { href } from "../../../lib/app";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { dict } from "../../../lib/app";

const T = dict({
  id: {
    title: "Ruang Tesmu Sudah Dibuka",
    body: "Pengawas sudah membuka ruang. Masuk, lakukan pengecekan, lalu tunggu sampai pengawas memulai.",
    go: "Masuk Ruang Tes",
  },
  en: {
    title: "Your Test Room Is Open",
    body: "The pengawas has opened the room. Go in, run the checks, then wait for the pengawas to start.",
    go: "Enter the Test Room",
  },
  zh: {
    title: "你的考场已开放",
    body: "监考已开放考场。请进入、完成检查，然后等待监考开始。",
    go: "进入考场",
  },
});

export default function TestDoor({ lang, enabled }: { lang: Lang; enabled: boolean }) {
  const t = T[lang];
  const door = usePollBersama(
    "rec-test-door",
    async () => {
      const r = await recGet<TestView>("test");
      if (!isFail(r)) return r;
      if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
      return null;
    },
    300_000,
    enabled,
    ["recroom"],
  );
  const stage = door.data?.room?.stage;
  if (!enabled || !stage || stage === "setup" || stage === "finished") return null;
  return (
    <section className="rec-note" aria-live="polite">
      <b>{t.title}</b>
      <span>{t.body}</span>
      <div>
        <a className="btn btn--primary" href={href(lang, "/recruitment/test")}>
          {t.go}
        </a>
      </div>
    </section>
  );
}
