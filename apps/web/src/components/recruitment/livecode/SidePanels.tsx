/**
 * The side card of the Live Coding editor (prompt 12, mockup r3-lc): the other
 * end of the seat's protocol, the board's serial monitor and the seat's
 * traffic. The other end is a panel per protocol (MQTT, WebSocket, HTTP, BLE)
 * talking over the page's gateway socket; its words are what the room's log
 * keeps and what the graders read later.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import TabLine, { type TabItem } from "../../ui/TabLine";
import type { Lang } from "../../../lib/kelas";
import type { LiveCodeSelf } from "../../../lib/recruitment/lc-api";
import { clock, lastPerTopic, type TrafficLine } from "../../../lib/recruitment/lc-ui";
import { LC } from "./lcStrings";
import type { useLcGateway } from "./useLcGateway";
import type { useExamSerial } from "./useExamSerial";
import type { useBle } from "./useBle";
import { serialOk } from "./flash";

type Gw = ReturnType<typeof useLcGateway>;
type Side = "other" | "serial" | "traffic";

/** Keeps a list scrolled to its newest line unless the reader scrolled up */
function useStick(dep: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);
  const stuck = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return {
    ref,
    onScroll: () => {
      const el = ref.current;
      if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    },
  };
}

const VIA: Record<TrafficLine["via"], string> = {
  ws: "WS",
  http: "HTTP",
  mqtt: "MQTT",
  ble: "BLE",
};

export function LineRow({ l, lang }: { l: TrafficLine; lang: Lang }) {
  const L = LC[lang].side;
  return (
    <li className="r3ln" data-dir={l.dir}>
      <span className="r3ln__t num">{clock(l.t)}</span>
      <span className="r3ln__via">{VIA[l.via]}</span>
      <span className="r3ln__dir" aria-label={L.dir[l.dir]}>
        {l.dir === "up" ? "↑" : l.dir === "down" ? "↓" : "·"}
      </span>
      {l.b ? <span className="r3ln__b">{l.b}</span> : null}
      <span className="r3ln__k">{l.k}</span>
      <span className="r3ln__d">{l.b64 ? `(base64) ${l.d}` : l.d}</span>
    </li>
  );
}

export function TrafficList({
  lines,
  lang,
  empty,
}: {
  lines: TrafficLine[];
  lang: Lang;
  empty: string;
}) {
  const s = useStick(lines.length);
  return (
    <div className="r3lines" ref={s.ref} onScroll={s.onScroll}>
      {lines.length === 0 ? (
        <span className="hint">{empty}</span>
      ) : (
        <ul>
          {lines.map((l, i) => (
            <LineRow key={i} l={l} lang={lang} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Compose({
  lang,
  prefix,
  nameField,
  disabled,
  onSend,
  label,
  placeholder,
}: {
  lang: Lang;
  prefix?: string;
  nameField?: boolean;
  disabled: boolean;
  onSend: (name: string, text: string) => void;
  label: string;
  placeholder: string;
}) {
  const L = LC[lang].side;
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const ok = !disabled && text.length > 0 && (!nameField || /^[A-Za-z0-9_-]{1,40}$/.test(name));
  return (
    <form
      className="r3compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onSend(name, text);
        setText("");
      }}
    >
      {prefix && <span className="r3compose__prefix num">{prefix}</span>}
      {nameField && (
        <input
          className="field__input r3compose__name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder={L.topicName}
          aria-label={L.topicName}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      <input
        className="field__input r3compose__text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1024))}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className="btn btn--inverse" disabled={!ok}>
        {L.send}
      </button>
    </form>
  );
}

export default function SidePanels({
  lang,
  lc,
  board,
  gw,
  serial,
  ble,
}: {
  lang: Lang;
  lc: LiveCodeSelf;
  board: 1 | 2;
  gw: Gw;
  serial: ReturnType<typeof useExamSerial>;
  ble: ReturnType<typeof useBle>;
}) {
  const L = LC[lang].side;
  const [tab, setTab] = useState<Side>("other");
  const mine = useMemo(() => gw.lines.filter((l) => l.s === lc.seatId), [gw.lines, lc.seatId]);
  const [onlyBoard, setOnlyBoard] = useState(false);
  const traffic = useMemo(
    () => (onlyBoard ? mine.filter((l) => !l.b || l.b === board) : mine),
    [mine, onlyBoard, board],
  );
  const tabs: TabItem<Side>[] = [
    { v: "other", label: L.other },
    { v: "serial", label: L.serial },
    { v: "traffic", label: L.traffic, n: mine.length },
  ];
  const proto = lc.protocol;
  const variant = lc.variant;
  const live = gw.status === "live";

  let other: ReactNode = null;
  if (proto === "mqtt")
    other = <MqttPanel lang={lang} lc={lc} gw={gw} lines={mine} board={board} />;
  else if (proto === "httpws" && variant === "ws")
    other = <WsPanel lang={lang} gw={gw} lines={mine} board={board} />;
  else if (proto === "httpws") other = <HttpPanel lang={lang} gw={gw} lines={mine} board={board} />;
  else if (proto === "ble") other = <BlePanel lang={lang} ble={ble} board={board} />;

  return (
    <aside className="r3side panel" aria-label={L.title}>
      <div className="r3side__head">
        <TabLine tabs={tabs} value={tab} onChange={setTab} label={L.title} />
        <span className="r3side__link" data-s={gw.status} title={L.link[gw.status]}>
          <i />
          <span>{L.link[gw.status]}</span>
        </span>
      </div>
      {gw.secretMissing && <p className="hint">{L.noGateway}</p>}
      <div className="r3side__body">
        {tab === "other" && other}
        {tab === "serial" && (
          <div className="stack" style={{ gap: 8, minHeight: 0, flex: 1 }}>
            <div className="row">
              <button
                type="button"
                className="btn btn--inverse"
                disabled={!serialOk() || serial.status === "open"}
                onClick={() => void serial.connect()}
              >
                {L.connectSerial}
              </button>
              {serial.status === "open" && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void serial.close()}
                >
                  {L.disconnectSerial}
                </button>
              )}
              <span className="hint">
                {!serialOk() ? L.needChrome : L.serialStatus[serial.status]}
              </span>
            </div>
            <div className="r3lines r3lines--serial">
              <SerialList lines={serial.lines} empty={L.serialEmpty} />
            </div>
          </div>
        )}
        {tab === "traffic" && (
          <div className="stack" style={{ gap: 8, minHeight: 0, flex: 1 }}>
            <div className="row">
              <button
                type="button"
                className="pill"
                aria-pressed={onlyBoard}
                onClick={() => setOnlyBoard((x) => !x)}
              >
                {L.onlyBoard(board)}
              </button>
              <span className="hint">{L.trafficHint}</span>
            </div>
            <TrafficList lines={traffic} lang={lang} empty={L.trafficEmpty} />
          </div>
        )}
      </div>
      {!live && gw.status !== "off" && tab !== "serial" && <p className="hint">{L.reconnecting}</p>}
    </aside>
  );
}

function SerialList({
  lines,
  empty,
}: {
  lines: { id: number; t: number; text: string }[];
  empty: string;
}) {
  const s = useStick(lines.length);
  return (
    <div className="r3lines__in" ref={s.ref} onScroll={s.onScroll}>
      {lines.length === 0 ? (
        <span className="hint">{empty}</span>
      ) : (
        <ul>
          {lines.map((x) => (
            <li key={x.id} className="r3ln r3ln--serial">
              <span className="r3ln__t num">{clock(x.t)}</span>
              <span className="r3ln__d">{x.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ MQTT */

function MqttPanel({
  lang,
  lc,
  gw,
  lines,
  board,
}: {
  lang: Lang;
  lc: LiveCodeSelf;
  gw: Gw;
  lines: TrafficLine[];
  board: 1 | 2;
}) {
  const L = LC[lang].side.mqtt;
  const prefix = `rec/s${lc.seatId}/down/`;
  const topics = useMemo(() => [...lastPerTopic(lines, lc.seatId).values()], [lines, lc.seatId]);
  const mqttLines = useMemo(() => lines.filter((l) => l.via === "mqtt"), [lines]);
  return (
    <div className="stack r3panel" style={{ gap: 10 }}>
      <div className="row">
        <span className={"pill " + (gw.mqtt ? "pill--ok" : "pill--warn")}>
          {gw.mqtt === null ? L.unknown : gw.mqtt ? L.monitorOn : L.monitorOff}
        </span>
        <span className="hint">{L.hint}</span>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <span className="hint">{L.topics}</span>
        {topics.length === 0 ? (
          <span className="hint">{L.none}</span>
        ) : (
          <ul className="r3topics">
            {topics.map((t) => (
              <li key={t.k}>
                <span className="r3topics__k num">{t.k.replace(`rec/s${lc.seatId}/`, "")}</span>
                <b className="num">{t.d}</b>
                <span className="hint num">{clock(t.t)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Compose
        lang={lang}
        prefix={prefix}
        nameField
        disabled={gw.status !== "live"}
        label={L.value}
        placeholder={L.value}
        onSend={(name, text) => gw.send({ t: "send", b: board, via: "mqtt", k: name, d: text })}
      />
      {gw.nak && gw.nak.via === "mqtt" && Date.now() - gw.nak.at < 6000 && (
        <span className="hint" data-tone="warn">
          {L.nak[gw.nak.why as keyof typeof L.nak] ?? L.nak.broker}
        </span>
      )}
      <TrafficList lines={mqttLines.slice(-60)} lang={lang} empty={L.empty} />
    </div>
  );
}

/* ------------------------------------------------------------- WebSocket */

function WsPanel({
  lang,
  gw,
  lines,
  board,
}: {
  lang: Lang;
  gw: Gw;
  lines: TrafficLine[];
  board: 1 | 2;
}) {
  const L = LC[lang].side.ws;
  const on = gw.boards.some((x) => x.via === "ws" && x.b === board);
  const ws = useMemo(
    () => lines.filter((l) => l.via === "ws" && (!l.b || l.b === board)),
    [lines, board],
  );
  return (
    <div className="stack r3panel" style={{ gap: 10 }}>
      <div className="row">
        <span className={"pill " + (on ? "pill--ok" : "")}>{on ? L.on : L.off}</span>
        <span className="hint">{L.hint}</span>
      </div>
      <Compose
        lang={lang}
        disabled={gw.status !== "live" || !on}
        label={L.frame}
        placeholder={L.frame}
        onSend={(_n, text) => gw.send({ t: "send", b: board, via: "ws", d: text })}
      />
      {gw.nak && gw.nak.via === "ws" && Date.now() - gw.nak.at < 6000 && (
        <span className="hint" data-tone="warn">
          {L.nak[gw.nak.why as keyof typeof L.nak] ?? L.nak.luring}
        </span>
      )}
      <TrafficList lines={ws} lang={lang} empty={L.empty} />
    </div>
  );
}

/* ------------------------------------------------------------------ HTTP */

function HttpPanel({
  lang,
  gw,
  lines,
  board,
}: {
  lang: Lang;
  gw: Gw;
  lines: TrafficLine[];
  board: 1 | 2;
}) {
  const L = LC[lang].side.http;
  const on = gw.boards.some((x) => x.via === "http" && x.b === board);
  const http = useMemo(
    () => lines.filter((l) => l.via === "http" && (!l.b || l.b === board)),
    [lines, board],
  );
  const queued = gw.ack && gw.ack.via === "http" ? gw.ack.queued : 0;
  return (
    <div className="stack r3panel" style={{ gap: 10 }}>
      <div className="row">
        <span className={"pill " + (on ? "pill--ok" : "")}>{on ? L.on : L.off}</span>
        <span className="hint">{L.hint}</span>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <span className="hint">{L.next}</span>
        <Compose
          lang={lang}
          disabled={gw.status !== "live"}
          label={L.cmd}
          placeholder={L.cmd}
          onSend={(_n, text) => gw.send({ t: "send", b: board, via: "http", d: text })}
        />
        {queued > 0 && <span className="hint">{L.queued(queued)}</span>}
        {gw.nak && gw.nak.via === "http" && Date.now() - gw.nak.at < 6000 && (
          <span className="hint" data-tone="warn">
            {L.full}
          </span>
        )}
      </div>
      <TrafficList lines={http} lang={lang} empty={L.empty} />
    </div>
  );
}

/* ------------------------------------------------------------------- BLE */

function BlePanel({
  lang,
  ble,
  board,
}: {
  lang: Lang;
  ble: ReturnType<typeof useBle>;
  board: 1 | 2;
}) {
  const L = LC[lang].side.ble;
  const s = useStick(ble.events.length);
  return (
    <div className="stack r3panel" style={{ gap: 10 }}>
      {!ble.supported ? (
        <p className="hint" data-tone="warn">
          {L.needChrome}
        </p>
      ) : (
        <>
          <div className="row">
            <button
              type="button"
              className="btn btn--inverse"
              disabled={ble.status === "on" || ble.status === "connecting"}
              onClick={() => void ble.connect()}
            >
              {L.scan}
            </button>
            {ble.status === "on" && (
              <button type="button" className="btn btn--ghost" onClick={ble.disconnect}>
                {L.leave}
              </button>
            )}
            <span className="pill" data-on={ble.status === "on" ? "yes" : "no"}>
              {ble.status === "on" && ble.name ? ble.name : L.status[ble.status]}
            </span>
          </div>
          <p className="hint">{L.hint(board)}</p>
          <Compose
            lang={lang}
            disabled={ble.status !== "on"}
            label={L.write}
            placeholder={L.write}
            onSend={(_n, text) => void ble.write(text)}
          />
          <div className="r3lines" ref={s.ref} onScroll={s.onScroll}>
            {ble.events.length === 0 ? (
              <span className="hint">{L.empty}</span>
            ) : (
              <ul>
                {ble.events.map((e) => (
                  <li key={e.id} className="r3ln" data-dir={e.dir}>
                    <span className="r3ln__t num">{clock(e.t)}</span>
                    <span className="r3ln__via">BLE</span>
                    <span className="r3ln__dir">{e.dir === "up" ? "↑" : "↓"}</span>
                    <span className="r3ln__d">{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
