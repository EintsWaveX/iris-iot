/**
 * Konsol Pi's screen (mockup v-console "screen"): noVNC on the relay. noVNC
 * takes a WebSocket-like channel, so Saluran hands it the relay's binary
 * frames only (the bridge's JSON notes stay with the page). It starts view
 * only; Take Control lets the mouse and keyboard through, never on phones.
 * The VNC password is the bridge's one-time one, from its ready frame.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowsOutIcon, ClipboardTextIcon, EyeIcon, KeyboardIcon } from "@phosphor-icons/react";
import type { KonsolTarget } from "../../../lib/konsol";
import Dialog from "../../ui/Dialog";
import IconButton from "../../ui/IconButton";
import Tooltip from "../../ui/Tooltip";
import { Switch } from "../../ui/Controls";
import type { Lang } from "../../../lib/kelas";
import type { KStrings } from "./strings";

/** The shape noVNC's Websock.attach() checks for. */
export class Saluran {
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: ((e: CloseEvent | { code: number; reason: string }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  protocol = "";
  private tutup = false;
  constructor(private kirimFn: (d: ArrayBufferLike | ArrayBufferView) => void) {}
  get binaryType() {
    return "arraybuffer";
  }
  set binaryType(_v: string) {
    /* always arraybuffer on the real socket */
  }
  // Open until noVNC closes it, even after the page's socket has gone, so
  // noVNC's own close() always reaches close() below.
  get readyState() {
    return this.tutup ? WebSocket.CLOSED : WebSocket.OPEN;
  }
  send(d: ArrayBufferLike | ArrayBufferView) {
    this.kirimFn(d);
  }
  close() {
    // The page owns the socket, so only this channel closes. noVNC arms its
    // disconnect timer after calling close(), so the event comes a tick later.
    if (this.tutup) return;
    this.tutup = true;
    setTimeout(() => this.onclose?.({ code: 1000, reason: "" }), 0);
  }
  terima(d: ArrayBuffer) {
    if (!this.tutup) this.onmessage?.({ data: d });
  }
}

interface RfbLike {
  viewOnly: boolean;
  scaleViewport: boolean;
  resizeSession: boolean;
  disconnect(): void;
  sendCtrlAltDel(): void;
  clipboardPasteFrom(text: string): void;
  sendCredentials(c: { password: string }): void;
  addEventListener(type: string, fn: (e: CustomEvent) => void): void;
}

export interface LayarApi {
  terima: (d: ArrayBuffer) => void;
}

export default function Layar({
  t,
  lang,
  target,
  ws,
  sandi,
  kirim,
  onGerak,
  apiRef,
  tunda,
}: {
  t: KStrings;
  lang: Lang;
  target: KonsolTarget;
  ws: WebSocket | null;
  sandi: string | undefined;
  kirim: (d: ArrayBufferLike | ArrayBufferView) => void;
  /** Any input on the screen, for the idle timer. */
  onGerak: () => void;
  apiRef: { current: LayarApi | null };
  /** Bytes that came after the ready frame, before this mounted. */
  tunda: { current: ArrayBuffer[] };
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const rfb = useRef<RfbLike | null>(null);
  const [kendali, setKendali] = useState(false);
  const [hp, setHp] = useState(false);
  const [klip, setKlip] = useState(false);
  const [teksKlip, setTeksKlip] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setHp(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // One RFB per join: the bridge opens a fresh x11vnc connection each time
  // the page joins, and says so with a ready frame carrying the password.
  useEffect(() => {
    if (!ws || !sandi || !box.current) return;
    let mati = false;
    const sal = new Saluran(kirim);
    const antre: ArrayBuffer[] = tunda.current.splice(0);
    apiRef.current = { terima: (d) => (sal.onmessage ? sal.terima(d) : antre.push(d)) };
    void import("@novnc/novnc").then(({ default: RFB }) => {
      if (mati || !box.current) return;
      const r = new RFB(box.current, sal as unknown as WebSocket, {
        credentials: { password: sandi },
        shared: true,
      }) as unknown as RfbLike;
      r.scaleViewport = true;
      r.resizeSession = false;
      r.viewOnly = true;
      r.addEventListener("credentialsrequired", () => r.sendCredentials({ password: sandi }));
      r.addEventListener("clipboard", (e) => setTeksKlip(String(e.detail?.text ?? "")));
      rfb.current = r;
      for (const d of antre.splice(0)) sal.terima(d);
    });
    return () => {
      mati = true;
      apiRef.current = null;
      try {
        rfb.current?.disconnect();
      } catch {
        /* already gone */
      }
      rfb.current = null;
    };
  }, [ws, sandi, kirim, apiRef, tunda]);

  const pegang = kendali && !hp;
  useEffect(() => {
    if (rfb.current) rfb.current.viewOnly = !pegang;
  }, [pegang]);

  const sw = (
    <label className="vnc__ctl">
      <Switch
        on={pegang}
        onChange={(v) => !hp && setKendali(v)}
        label={t.takeControl}
        disabled={hp}
      />
      <b>{t.takeControl}</b>
    </label>
  );

  return (
    <div className="vnc">
      <div className="vnc__bar">
        <span className="pill pill--violet">{target === ":0" ? t.screen0 : t.screen1}</span>
        {hp ? <Tooltip label={t.phoneView}>{sw}</Tooltip> : sw}
        <span className="vnc__tools">
          <IconButton
            sm
            kind="ghost"
            icon={KeyboardIcon}
            label={t.cad}
            disabled={!pegang}
            onClick={() => rfb.current?.sendCtrlAltDel()}
          />
          <IconButton
            sm
            kind="ghost"
            icon={ClipboardTextIcon}
            label={t.clipboard}
            onClick={() => setKlip(true)}
          />
          <IconButton
            sm
            kind="ghost"
            icon={ArrowsOutIcon}
            label={t.full}
            onClick={() => void frame.current?.requestFullscreen?.()}
          />
        </span>
      </div>
      <div
        className="vnc__frame"
        ref={frame}
        data-ctl={pegang ? "yes" : "no"}
        onPointerDown={onGerak}
        onKeyDown={onGerak}
        onWheel={onGerak}
      >
        <div className="vnc__screen" ref={box} />
        {!pegang && (
          <span className="vnc__ro">
            <EyeIcon size={16} aria-hidden="true" />
            {t.viewOnly}
          </span>
        )}
      </div>
      <span className="hint">{target === ":0" ? t.hint0 : t.hint1}</span>
      <Dialog
        open={klip}
        onOpenChange={setKlip}
        title={t.clipTitle}
        description={t.clipDesc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setKlip(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!teksKlip}
              onClick={() => {
                rfb.current?.clipboardPasteFrom(teksKlip);
                setKlip(false);
                window.Toast?.show(t.clipSent, "ok");
              }}
            >
              {t.clipSend}
            </button>
          </>
        }
      >
        <textarea
          className="field__input field__textarea vnc__clip"
          aria-label={t.clipboard}
          value={teksKlip}
          onChange={(e) => setTeksKlip(e.target.value)}
          rows={5}
        />
      </Dialog>
    </div>
  );
}
