/**
 * The Live room's Lapisan view: the messages the Langsung view shows (real
 * ones, or the simulator's until the group's first real reading), each one
 * opened layer by layer with its own send and receive times, delay and
 * signal. The newest message is followed until one is picked.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { RAILS, describeLayers, type Reading } from "../../lib/telemetry-sim";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import "./layer-view.css";

interface LayerCaption {
  nama: string;
  nilai: string;
}

const LIST_MAX = 30;

const T = dict({
  id: {
    messages: "Pesan",
    pickHint: "Pilih pesan untuk melihat lapisannya. Tanpa pilihan, pesan terbaru diikuti.",
    follow: "Ikuti Terbaru",
    following: "Mengikuti pesan terbaru",
    waiting: "Menunggu pesan pertama…",
    lost: "hilang",
    sent: "kirim",
    received: "terima",
    lostLine: (n: number) => `#${n} hilang di tengah jalan`,
    okLine: (r: Reading) =>
      `#${r.seq} · kirim ${r.tx ?? "?"} · terima ${r.rx} · delta ${r.delayMs ?? "?"} ms`,
  },
  en: {
    messages: "Messages",
    pickHint: "Pick a message to see its layers. With none picked, the newest is followed.",
    follow: "Follow Newest",
    following: "Following the newest message",
    waiting: "Waiting for the first message…",
    lost: "lost",
    sent: "sent",
    received: "received",
    lostLine: (n: number) => `#${n} was lost on the way`,
    okLine: (r: Reading) =>
      `#${r.seq} · sent ${r.tx ?? "?"} · received ${r.rx} · delta ${r.delayMs ?? "?"} ms`,
  },
  zh: {
    messages: "消息",
    pickHint: "选一条消息查看它的各层。没有选择时跟随最新一条。",
    follow: "跟随最新",
    following: "正在跟随最新消息",
    waiting: "等待第一条消息…",
    lost: "丢失",
    sent: "发送",
    received: "收到",
    lostLine: (n: number) => `#${n} 在路上丢了`,
    okLine: (r: Reading) =>
      `#${r.seq} · 发送 ${r.tx ?? "?"} · 收到 ${r.rx} · 差 ${r.delayMs ?? "?"} ms`,
  },
});

/** One message's identity across refetches */
function keyOf(r: Reading): string {
  return `${r.id ?? ""}|${r.seq}|${r.tx ?? ""}|${r.rx ?? ""}`;
}

export default function LayerView({
  lang,
  modul,
  group,
  history,
  layers,
}: {
  lang: Lang;
  modul: number;
  group: number;
  history: Reading[];
  layers: LayerCaption[];
}) {
  const t = T[lang];
  const [picked, setPicked] = useState<string | null>(null);
  const rails = RAILS[modul] ?? RAILS[1];

  // Newest first; a pick on another group means nothing here.
  const list = useMemo(() => history.slice(-LIST_MAX).reverse(), [history]);
  useEffect(() => setPicked(null), [group]);

  const shown = (picked && list.find((r) => keyOf(r) === picked)) || list[0] || null;
  const values = shown ? describeLayers(shown, lang) : null;

  // Each newly shown message walks down the layers one after another.
  const shownKey = shown ? keyOf(shown) : "";
  useEffect(() => {
    if (!shownKey) return;
    requestAnimationFrame(() => {
      window.Motion?.enter(".lapis__layer", { stagger: 0.12, distance: 10 });
    });
  }, [shownKey]);

  return (
    <section
      className="panel lapis"
      style={{ "--tile-hue": `var(--group-${group})` } as CSSProperties}
    >
      <div className="lapis__grid">
        <div className="lapis__side">
          <div className="row row--between">
            <h2 className="panel__title">{t.messages}</h2>
            {picked && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setPicked(null)}
              >
                {t.follow}
              </button>
            )}
          </div>
          <span className="hint">{picked ? t.pickHint : t.following}</span>
          {list.length === 0 ? (
            <p className="hint">{t.waiting}</p>
          ) : (
            <ol className="lapis__list">
              {list.map((r) => {
                const k = keyOf(r);
                const on = k === (shown ? keyOf(shown) : "");
                return (
                  <li key={k}>
                    <button
                      type="button"
                      className="lapis__msg"
                      aria-pressed={on}
                      data-lost={r.rx === null ? "yes" : undefined}
                      onClick={() => setPicked(k)}
                    >
                      <b className="num">#{r.seq}</b>
                      <span className="mono hint">
                        {t.sent} {r.tx ?? "?"}
                        {" · "}
                        {r.rx === null ? t.lost : `${t.received} ${r.rx}`}
                      </span>
                      <span className="num lapis__delay">
                        {r.rx === null ? "×" : r.delayMs !== null ? `${r.delayMs} ms` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="lapis__detail">
          {shown && values ? (
            <>
              <div className="lapis__rails" key={shownKey}>
                {rails.map((label, i) => (
                  <div
                    key={label}
                    className="lapis__rail"
                    style={{ "--rail-index": i, "--rail-count": rails.length - 1 } as CSSProperties}
                  >
                    <span className="lapis__rail-label">{label}</span>
                  </div>
                ))}
                <span className="lapis__arrow" data-lost={shown.rx === null ? "yes" : "no"} />
              </div>
              <p className="lapis__readout mono">
                {shown.rx === null ? t.lostLine(shown.seq) : t.okLine(shown)}
              </p>
              <ol className="lapis__layers">
                {layers.map((layer, i) => (
                  <li key={layer.nama} className="lapis__layer">
                    <div className="lapis__layer-head">
                      <span className="lapis__layer-index">{layers.length - i}</span>
                      <span>{layer.nama}</span>
                    </div>
                    <p className="lapis__layer-value mono">{values[i]}</p>
                    <p className="lapis__layer-caption">{layer.nilai}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="hint">{t.waiting}</p>
          )}
        </div>
      </div>
    </section>
  );
}
