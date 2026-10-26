/**
 * The Live Coding draw (prompt 12, mockup r3-putar, EXAM-ENGINE 9.1): two
 * reels, topic then protocol. The server deals and stores the result first;
 * the reels only play it. Pressing Putar is idempotent, an automatic deal at
 * Start and the Master's re-roll play by themselves, and a reload shows the
 * landed cells at rest. After both land the brief appears with the other
 * end's addresses (tokens left out) and the phone hotspot card. No timer runs
 * during the draw.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../../../lib/kelas";
import type { LiveCodeSelf } from "../../../lib/recruitment/lc-api";
import {
  AUTO_PROTOCOL_MS,
  AUTO_TOPIC_MS,
  DECOY_ICONS,
  PROTOCOL_NAME,
  shouldPlay,
  type MotionTier,
} from "../../../lib/recruitment/lc-ui";
import type { Protocol } from "../../../lib/recruitment/exam-types";
import HotspotCard from "../exam/HotspotCard";
import { Md } from "../exam/render/text";
import { ProtocolIcon, TopicIcon } from "./icons";
import Reel, { type ReelAnswer, type ReelMode } from "./Reel";
import { LC } from "./lcStrings";
import type { LcApi } from "./useLc";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") =>
  (window as unknown as { Toast?: { show: (m: string, t: string) => void } }).Toast?.show(m, tone);

export default function Draw({
  lang,
  lc,
  tier,
  api,
  hotspot,
  onHotspot,
}: {
  lang: Lang;
  lc: LiveCodeSelf;
  tier: MotionTier;
  api: LcApi;
  hotspot: { ssid: string } | null;
  onHotspot: () => void;
}) {
  const L = LC[lang].draw;
  const [topicMode, setTopicMode] = useState<ReelMode>("idle");
  const [protoMode, setProtoMode] = useState<ReelMode>("idle");
  const [pressing, setPressing] = useState<"topic" | "protocol" | null>(null);
  const [topicLanded, setTopicLanded] = useState(!!lc.topic);
  const [protoLanded, setProtoLanded] = useState(!!lc.protocol);
  const seen = useRef(new Set<string>());
  const first = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const topicAnswer: ReelAnswer | null = useMemo(
    () => (lc.topic ? { label: lc.topic.title, glyph: <TopicIcon name={lc.topic.icon} /> } : null),
    [lc.topic],
  );
  const protoAnswer: ReelAnswer | null = useMemo(
    () =>
      lc.protocol
        ? { label: PROTOCOL_NAME[lc.protocol], glyph: <ProtocolIcon p={lc.protocol} /> }
        : null,
    [lc.protocol],
  );
  const topicDecoys = useMemo(
    () => DECOY_ICONS.map((n) => ({ label: L.decoy, glyph: <TopicIcon name={n} /> })),
    [L.decoy],
  );
  const protoDecoys = useMemo(
    () =>
      (lc.protocols.length ? lc.protocols : (["ble", "httpws", "mqtt"] as Protocol[])).map((p) => ({
        label: PROTOCOL_NAME[p],
        glyph: <ProtocolIcon p={p} />,
      })),
    [lc.protocols],
  );

  // A result that arrives without a press (the automatic deal, a re-roll) plays by itself.
  const topicAt = lc.landed.topic?.at ?? 0;
  const protoAt = lc.landed.protocol?.at ?? 0;
  useEffect(() => {
    const now = Date.now();
    if (lc.topic && topicAt && shouldPlay(seen.current, "topic", topicAt, now, first.current)) {
      seen.current.add(`topic:${topicAt}`);
      setTopicLanded(false);
      later(() => {
        setTopicMode("run");
        later(() => setTopicMode("land"), 60);
      }, AUTO_TOPIC_MS);
    } else if (lc.topic) {
      seen.current.add(`topic:${topicAt}`);
      setTopicLanded(true);
    }
    if (
      lc.protocol &&
      protoAt &&
      shouldPlay(seen.current, "protocol", protoAt, now, first.current)
    ) {
      seen.current.add(`protocol:${protoAt}`);
      setProtoLanded(false);
      // The protocol reel starts 1100 ms after the topic has landed (or at once when the topic stood)
      later(
        () => {
          setProtoMode("run");
          later(() => setProtoMode("land"), 60);
        },
        AUTO_TOPIC_MS + 1500 + AUTO_PROTOCOL_MS,
      );
    } else if (lc.protocol) {
      seen.current.add(`protocol:${protoAt}`);
      setProtoLanded(true);
    }
    first.current = false;
  }, [topicAt, protoAt, lc.topic?.id, lc.protocol]);

  async function press(what: "topic" | "protocol") {
    if (pressing) return;
    setPressing(what);
    if (what === "topic") {
      setTopicLanded(false);
      setTopicMode("run");
    } else {
      setProtoLanded(false);
      setProtoMode("run");
    }
    const r = await api.spin(what);
    setPressing(null);
    if (!r.ok) {
      if (what === "topic") setTopicMode("idle");
      else setProtoMode("idle");
      toast(r.kode === "topik_dulu" ? L.topicFirst : L.fail, "danger");
      return;
    }
    seen.current.add(`${what}:${r.at}`);
    if (what === "topic") setTopicMode("land");
    else setProtoMode("land");
  }

  const both = !!lc.topic && !!lc.protocol && topicLanded && protoLanded;
  const byWord = (k: "topic" | "protocol") => {
    const x = lc.landed[k];
    if (!x || x.by === "seat") return null;
    return x.by === "auto" ? L.auto : L.reroll(x.reason ? L.why[x.reason] : null);
  };
  const busyTopic = pressing === "topic" || topicMode === "run" || topicMode === "land";
  const busyProto = pressing === "protocol" || protoMode === "run" || protoMode === "land";

  return (
    <div className="r3lc r3draw">
      <header className="stack" style={{ gap: 6 }}>
        <span className="eyebrow rec-eyebrow">{L.eyebrow}</span>
        <h1 className="r3title">{L.title}</h1>
        <p className="lede">{L.lede}</p>
      </header>

      <div className="r3draw__reels">
        <section className="r3draw__reel" data-landed={topicLanded && lc.topic ? "yes" : "no"}>
          <h2 className="r3draw__h">{L.topicReel}</h2>
          <Reel
            kind="topic"
            tier={tier}
            mode={topicMode}
            answer={topicAnswer}
            decoys={topicDecoys}
            ariaLabel={L.topicReel}
            onLanded={() => {
              setTopicLanded(true);
              setTopicMode("idle");
            }}
          />
          <div className="r3draw__foot">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!!lc.topic || busyTopic}
              onClick={() => void press("topic")}
            >
              {busyTopic ? L.spinning : L.spin}
            </button>
            {byWord("topic") && <span className="hint r3draw__by">{byWord("topic")}</span>}
          </div>
        </section>

        <section
          className="r3draw__reel"
          data-wake={topicLanded && lc.topic ? "yes" : "no"}
          data-landed={protoLanded && lc.protocol ? "yes" : "no"}
        >
          <h2 className="r3draw__h">{L.protocolReel}</h2>
          <Reel
            kind="protocol"
            tier={tier}
            mode={protoMode}
            answer={protoAnswer}
            decoys={protoDecoys}
            ariaLabel={L.protocolReel}
            onLanded={() => {
              setProtoLanded(true);
              setProtoMode("idle");
            }}
          />
          <div className="r3draw__foot">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!lc.topic || !topicLanded || !!lc.protocol || busyProto}
              onClick={() => void press("protocol")}
            >
              {busyProto ? L.spinning : L.spin}
            </button>
            {byWord("protocol") && <span className="hint r3draw__by">{byWord("protocol")}</span>}
          </div>
        </section>
      </div>

      {both && lc.topic && lc.protocol && (
        <section className="panel stack r3draw__brief" aria-live="polite">
          <div className="panel__head">
            <div className="stack" style={{ gap: 2 }}>
              <span className="eyebrow rec-eyebrow">{L.brief}</span>
              <h2 className="panel__title">{lc.topic.title}</h2>
            </div>
            <span className="r3draw__proto">
              <ProtocolIcon p={lc.protocol} />
              {PROTOCOL_NAME[lc.protocol]}
            </span>
          </div>
          <Md src={lc.topic.brief} />
          {lc.topic.parts.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="hint">{L.parts}</span>
              <div className="r3chips">
                {lc.topic.parts.map((p) => (
                  <span key={p} className="pill">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Ends lang={lang} lc={lc} />
          <p className="hint">{L.editorNote}</p>
        </section>
      )}

      <HotspotCard lang={lang} saved={hotspot} onChanged={onHotspot} />
    </div>
  );
}

/** Where the other end of the protocol is, with the token left out */
function Ends({ lang, lc }: { lang: Lang; lc: LiveCodeSelf }) {
  const L = LC[lang].draw;
  const b = lc.boards[0];
  if (!lc.protocol || !b) return null;
  const e = b.endpoints;
  const rows: [string, string][] =
    lc.protocol === "ble"
      ? [
          [L.bleName, e.ble.name],
          [L.bleService, e.ble.service],
        ]
      : lc.protocol === "mqtt"
        ? [
            [L.mqttHost, e.mqtt.host],
            [L.mqttUp, e.mqtt.topicUp],
            [L.mqttDown, e.mqtt.topicDown],
          ]
        : [
            [L.wsAddr, e.ws],
            [L.httpAddr, e.http],
          ];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="hint">{L.ends}</span>
      <dl className="r3ends">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
      <span className="hint">{L.endsNote}</span>
    </div>
  );
}
