/**
 * The Live Coding editor page (prompt 12, mockup r3-lc, EXAM-ENGINE 9.3a to
 * 9.6): the top bar with the server's timer, a context strip (the topic opens
 * the brief, the protocol, the board's hotspot, HTTP or WebSocket for an
 * HTTP/WebSocket seat), one tab per board with its editor, Compile and Flash,
 * and from 1100 px a side card with the other end of the protocol, the serial
 * monitor and the seat's traffic. Time is the room's; the editor locks when it
 * is paused or over and the page says why.
 */
import { useCallback, useMemo, useState } from "react";
import Confirm from "../../ui/Confirm";
import Drawer from "../../ui/Drawer";
import SegmentedControl from "../../ui/SegmentedControl";
import type { Lang } from "../../../lib/kelas";
import type { LiveCodeSelf } from "../../../lib/recruitment/lc-api";
import { PROTOCOL_NAME, type MotionTier } from "../../../lib/recruitment/lc-ui";
import type { QueueChip } from "../../../lib/recruitment/lc-types";
import type { SeatPhase } from "../../../lib/recruitment/seat-state";
import HotspotCard from "../exam/HotspotCard";
import { Md } from "../exam/render/text";
import { LiveChip, SaveChip, Timer } from "../exam/parts";
import BoardPane, { type SaveUi } from "./BoardPane";
import { ProtocolIcon, TopicIcon } from "./icons";
import { LC } from "./lcStrings";
import SidePanels from "./SidePanels";
import { useBle } from "./useBle";
import { useExamSerial } from "./useExamSerial";
import type { LcApi } from "./useLc";
import { useLcGateway } from "./useLcGateway";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") =>
  (window as unknown as { Toast?: { show: (m: string, t: string) => void } }).Toast?.show(m, tone);

export default function Workbench({
  lang,
  lc,
  api,
  tier,
  phase,
  hotspot,
  onHotspot,
  antrean,
  linkDown,
}: {
  lang: Lang;
  lc: LiveCodeSelf;
  api: LcApi;
  tier: MotionTier;
  phase: Extract<SeatPhase, { k: "work" }>;
  hotspot: { ssid: string } | null;
  onHotspot: () => void;
  antrean: { chips: QueueChip[]; typical: LiveCodeSelf["typicalMs"] } | null;
  linkDown: boolean;
}) {
  const L = LC[lang].work;
  const [tab, setTab] = useState<1 | 2>(1);
  const [brief, setBrief] = useState(false);
  const [phone, setPhone] = useState(false);
  const [swap, setSwap] = useState<"http" | "ws" | null>(null);
  const [saves, setSaves] = useState<Record<number, SaveUi>>({ 1: "ok", 2: "ok" });
  const gw = useLcGateway({ enabled: true, role: "seat" });
  const serial1 = useExamSerial();
  const serial2 = useExamSerial();
  const ble1 = useBle(lc.seatId, 1, gw.send);
  const ble2 = useBle(lc.seatId, 2, gw.send);
  const board = lc.boards.find((b) => b.n === tab) ?? lc.boards[0];
  const queue = antrean?.chips ?? lc.queue;
  const typical = antrean?.typical ?? lc.typicalMs;
  const paused = phase.paused;
  const editable = lc.editable && !paused;
  const live: LiveCodeSelf = useMemo(() => ({ ...lc, editable }), [lc, editable]);

  const save1 = useCallback((s: SaveUi) => setSaves((x) => (x[1] === s ? x : { ...x, 1: s })), []);
  const save2 = useCallback((s: SaveUi) => setSaves((x) => (x[2] === s ? x : { ...x, 2: s })), []);
  const worst: SaveUi = Object.values(saves).includes("wait")
    ? "wait"
    : Object.values(saves).includes("ing")
      ? "ing"
      : "ok";

  async function choose(v: "http" | "ws", replace = false) {
    const r = await api.setVariant(v, replace);
    if (r.ok) return true;
    if (r.kode === "kode_berubah") {
      setSwap(v);
      return false;
    }
    toast(L.compileFail, "danger");
    return false;
  }

  if (!board || !lc.protocol || !lc.topic) return null;
  const hs = board.hotspot;
  const serial = tab === 1 ? serial1 : serial2;
  const ble = tab === 1 ? ble1 : ble2;
  const canRemove = lc.boards.length === 2 && tab === 2;

  return (
    <div className="r3lc r3work" data-m={tier}>
      <header className="r3work__top">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="eyebrow rec-eyebrow">{L.eyebrow}</span>
          <h1 className="r3work__title">{lc.topic.title}</h1>
        </div>
        <div className="row r3work__chips">
          <SaveChip s={saves[1] === "ok" && saves[2] === "ok" ? "ok" : worst} lang={lang} />
          {linkDown && <LiveChip lang={lang} />}
          <Timer
            left={phase.left}
            frozen={paused}
            lang={lang}
            label={paused ? L.paused : undefined}
          />
        </div>
      </header>

      <div className="r3ctx" role="group" aria-label={L.context}>
        <button type="button" className="r3ctx__chip" onClick={() => setBrief(true)}>
          <TopicIcon name={lc.topic.icon} />
          <span>{L.brief}</span>
        </button>
        <span className="r3ctx__chip" data-static="yes">
          <ProtocolIcon p={lc.protocol} />
          <span>{PROTOCOL_NAME[lc.protocol]}</span>
        </span>
        {lc.protocol !== "ble" && (
          <button type="button" className="r3ctx__chip" onClick={() => setPhone(true)}>
            <span>
              {hs.ssid ? (hs.own ? L.hotspotOwn(hs.ssid) : L.hotspotRoom(hs.ssid)) : L.hotspotNone}
            </span>
          </button>
        )}
        {lc.protocol === "httpws" && lc.variant && (
          <SegmentedControl
            value={lc.variant}
            onValueChange={(v) => {
              if (v && v !== lc.variant) void choose(v as "http" | "ws");
            }}
            options={[
              { value: "http", label: "HTTP" },
              { value: "ws", label: "WebSocket" },
            ]}
            aria-label={L.variant}
          />
        )}
      </div>

      {paused && (
        <div className="r3banner" data-tone="warn" role="status">
          <span>{L.pausedBody}</span>
        </div>
      )}

      <div className="r3work__grid">
        <section className="r3work__main panel">
          <div className="r3tabs" role="tablist" aria-label={L.boards}>
            {lc.boards.map((b) => (
              <button
                key={b.n}
                type="button"
                role="tab"
                aria-selected={tab === b.n}
                className="r3tabs__tab"
                data-on={tab === b.n ? "yes" : "no"}
                onClick={() => setTab(b.n)}
              >
                <b>{L.board(b.n)}</b>
                <small>{b.chip === "esp32s3" ? "ESP32-S3" : "ESP32"}</small>
              </button>
            ))}
            {lc.boards.length < 2 && (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!editable}
                onClick={async () => {
                  const r = await api.addBoard();
                  if (r.ok) setTab(2);
                  else toast(L.compileFail, "danger");
                }}
              >
                {L.addBoard}
              </button>
            )}
            {canRemove && (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!editable}
                onClick={async () => {
                  const r = await api.removeBoard();
                  if (r.ok) setTab(1);
                  else toast(r.kode === "sudah_dikompilasi" ? L.removeNo : L.compileFail, "warn");
                }}
              >
                {L.removeBoard}
              </button>
            )}
          </div>
          {lc.boards.map((b) => (
            <div key={b.n} hidden={b.n !== tab} className="r3work__pane">
              <BoardPane
                lang={lang}
                tier={tier}
                lc={live}
                board={b}
                job={lc.jobs.find((j) => j.board === b.n) ?? null}
                queue={queue}
                typicalMs={typical}
                api={api}
                serial={b.n === 1 ? serial1 : serial2}
                onSave={b.n === 1 ? save1 : save2}
                stale={b.stale}
              />
            </div>
          ))}
        </section>

        <SidePanels lang={lang} lc={live} board={tab} gw={gw} serial={serial} ble={ble} />
      </div>

      <Drawer
        open={brief}
        onOpenChange={setBrief}
        title={lc.topic.title}
        storeKey="rec-lc-brief"
        closeLabel={L.close}
        resizeLabel={L.resize}
      >
        <div className="stack">
          <Md src={lc.topic.brief} />
          {lc.topic.parts.length > 0 && (
            <div className="r3chips">
              {lc.topic.parts.map((p) => (
                <span key={p} className="pill">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </Drawer>
      <Drawer
        open={phone}
        onOpenChange={setPhone}
        title={L.hotspotTitle}
        storeKey="rec-lc-phone"
        closeLabel={L.close}
        resizeLabel={L.resize}
      >
        <div className="stack">
          <HotspotCard lang={lang} saved={hotspot} onChanged={onHotspot} />
          <p className="hint">{L.hotspotChanged}</p>
        </div>
      </Drawer>
      <Confirm
        open={swap !== null}
        onOpenChange={(o) => !o && setSwap(null)}
        title={L.swapTitle}
        body={L.swapBody}
        confirmLabel={L.swapConfirm}
        cancelLabel={L.cancel}
        tone="primary"
        lang={lang}
        onConfirm={async () => {
          if (!swap) return true;
          const ok = await choose(swap, true);
          setSwap(null);
          return ok || true;
        }}
      />
    </div>
  );
}
