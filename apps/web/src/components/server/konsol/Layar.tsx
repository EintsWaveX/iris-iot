/**
 * Konsol Pi's screen (mockup v-console "screen"): noVNC on the relay. noVNC
 * takes a WebSocket-like channel, so Saluran hands it the relay's binary
 * frames only (the bridge's JSON notes stay with the page). Only the one
 * in control of the room uses the mouse and keyboard (never on a phone);
 * the bridge gives everyone else a view-only password, so that holds on the
 * Pi too. The VNC password comes in the bridge's ready frame, and a new one
 * comes whenever control moves, which logs noVNC in again.
 *
 * Under KDE on Wayland (protokol "guac", 2026-10-15) the frames are guacd's
 * Guacamole protocol instead, drawn by guacamole-common-js. There is no
 * password here at all; guacd itself keeps everyone but the controller read
 * only, and each ready frame is a new connection, drawn by a new client.
 */
import { useEffect, useRef, useState } from "react";
import { buatSaluranGuac, type GuacLib } from "../../../lib/guac-saluran";
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  CircleNotchIcon,
  ClipboardTextIcon,
  EyeIcon,
  HandIcon,
  KeyboardIcon,
} from "@phosphor-icons/react";
import type { KonsolTarget } from "../../../lib/konsol";
import Dialog from "../../ui/Dialog";
import IconButton from "../../ui/IconButton";
import Popover from "../../ui/Popover";
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
  sendKey(keysym: number, code: string | null, down?: boolean): void;
  clipboardPasteFrom(text: string): void;
  sendCredentials(c: { password: string }): void;
  addEventListener(type: string, fn: (e: CustomEvent) => void): void;
}

/** X keysyms for the Send Keys menu (2026-10-06): combinations Windows or
 *  the browser would keep for themselves, so they can't be typed. */
const XK = {
  ctrl: [0xffe3, "ControlLeft"],
  alt: [0xffe9, "AltLeft"],
  del: [0xffff, "Delete"],
  tab: [0xff09, "Tab"],
  f4: [0xffc1, "F4"],
  t: [0x0074, "KeyT"],
  superL: [0xffeb, "MetaLeft"],
  esc: [0xff1b, "Escape"],
} as const;
type Kunci = keyof typeof XK;
const PINTAS: { id: "cad" | "altTab" | "altF4" | "term" | "super" | "esc"; keys: Kunci[] }[] = [
  { id: "cad", keys: ["ctrl", "alt", "del"] },
  { id: "altTab", keys: ["alt", "tab"] },
  { id: "altF4", keys: ["alt", "f4"] },
  { id: "term", keys: ["ctrl", "alt", "t"] },
  { id: "super", keys: ["superL"] },
  { id: "esc", keys: ["esc"] },
];

export interface LayarApi {
  terima: (d: ArrayBuffer) => void;
}

/** What the toolbar does to the screen, whichever protocol draws it. */
interface Kemudi {
  tekan: (keysym: number, code: string, turun: boolean) => void;
  tempel: (teks: string) => void;
}

export default function Layar({
  t,
  lang,
  target,
  ws,
  protokol,
  sesi,
  sandi,
  kendali,
  kirim,
  onGerak,
  onFull,
  full,
  onKabar,
  apiRef,
  tunda,
}: {
  t: KStrings;
  lang: Lang;
  target: KonsolTarget;
  ws: WebSocket | null;
  /** "rfb" (x11vnc) or "guac" (KRDP through guacd), from the ready frame. */
  protokol: "rfb" | "guac";
  /** Counts ready frames: a guac screen gets a new client for each. */
  sesi: number;
  sandi: string | undefined;
  /** I control the room (my ready frame carried the full password). */
  kendali: boolean;
  kirim: (d: ArrayBufferLike | ArrayBufferView) => void;
  /** Any input on the screen, for the idle timer. */
  onGerak: () => void;
  /** Full screen on the whole pane, so the room's prompts show there too. */
  onFull: () => void;
  /** The pane is full screen now: the button leaves it. */
  full: boolean;
  /** A short note shown inside the pane (seen in full screen too). */
  onKabar: (teks: string) => void;
  apiRef: { current: LayarApi | null };
  /** Bytes that came after the ready frame, before this mounted. */
  tunda: { current: ArrayBuffer[] };
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const rfb = useRef<RfbLike | null>(null);
  const kemudi = useRef<Kemudi | null>(null);
  const [hp, setHp] = useState(false);
  const [klip, setKlip] = useState(false);
  const [teksKlip, setTeksKlip] = useState("");
  const [menu, setMenu] = useState(false);
  // No picture yet on this connection: a waking monitor (KDE) or a slow
  // first frame shows a quiet wait instead of a black box.
  const [gambar, setGambar] = useState(false);
  const guac = protokol === "guac";

  /** Presses the keys in order, then lets them go in reverse. */
  function kirimPintas(p: (typeof PINTAS)[number]) {
    const k = kemudi.current;
    setMenu(false);
    if (!k) return;
    for (const x of p.keys) k.tekan(XK[x][0], XK[x][1], true);
    for (const x of [...p.keys].reverse()) k.tekan(XK[x][0], XK[x][1], false);
    onGerak();
    onKabar(t.keySent(t.keyNames[p.id].split(" · ")[0]));
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setHp(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // One RFB per ready frame: the bridge opens a fresh x11vnc connection
  // each time the page joins or control moves, with the password to use.
  useEffect(() => {
    if (guac || !ws || !sandi || !box.current) return;
    let mati = false;
    setGambar(false);
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
      r.viewOnly = !pegangRef.current;
      r.addEventListener("credentialsrequired", () => r.sendCredentials({ password: sandi }));
      r.addEventListener("clipboard", (e) => setTeksKlip(String(e.detail?.text ?? "")));
      r.addEventListener("connect", () => !mati && setGambar(true));
      rfb.current = r;
      kemudi.current = {
        tekan: (keysym, code, turun) => r.sendKey(keysym, code, turun),
        tempel: (teks) => r.clipboardPasteFrom(teks),
      };
      for (const d of antre.splice(0)) sal.terima(d);
    });
    return () => {
      mati = true;
      apiRef.current = null;
      kemudi.current = null;
      try {
        rfb.current?.disconnect();
      } catch {
        /* already gone */
      }
      rfb.current = null;
    };
  }, [guac, ws, sandi, kirim, apiRef, tunda]);

  // KDE on Wayland: one Guacamole client per ready frame. The mouse and the
  // keyboard only go out while I control; guacd would drop them anyway.
  useEffect(() => {
    const el = box.current;
    if (!guac || !ws || !el) return;
    let mati = false;
    setGambar(false);
    let terima: ((d: ArrayBuffer) => void) | null = null;
    const antre: ArrayBuffer[] = tunda.current.splice(0);
    apiRef.current = { terima: (d) => (terima ? terima(d) : antre.push(d)) };
    let tutup = () => {};

    void import("guacamole-common-js").then(({ default: mod }) => {
      if (mati) return;
      const G = mod as unknown as GuacLib;
      const sal = buatSaluranGuac(G, kirim);
      const client = new G.Client(sal.tunnel);
      const display = client.getDisplay();
      const layar = display.getElement();
      el.replaceChildren(layar);

      const pas = () => {
        const w = display.getWidth();
        const h = display.getHeight();
        if (w > 0 && h > 0 && !mati) setGambar(true);
        if (w > 0 && h > 0 && el.clientWidth > 0 && el.clientHeight > 0)
          display.scale(Math.min(el.clientWidth / w, el.clientHeight / h));
      };
      display.onresize = pas;
      const ro = new ResizeObserver(pas);
      ro.observe(el);

      const mouse = new G.Mouse(layar);
      mouse.onEach(["mousedown", "mousemove", "mouseup"], (e) => {
        if (!pegangRef.current) return;
        client.sendMouseState(
          (e as unknown as { state: Parameters<typeof client.sendMouseState>[0] }).state,
          true,
        );
      });
      const keyboard = new G.Keyboard(el);
      keyboard.onkeydown = (keysym) => {
        if (!pegangRef.current) return true;
        client.sendKeyEvent(1, keysym);
        return false;
      };
      keyboard.onkeyup = (keysym) => {
        if (pegangRef.current) client.sendKeyEvent(0, keysym);
      };

      client.onclipboard = (stream, mimetype) => {
        if (!String(mimetype).startsWith("text/")) return;
        const reader = new G.StringReader(stream);
        let teks = "";
        reader.ontext = (s) => (teks += s);
        reader.onend = () => setTeksKlip(teks);
      };
      client.onerror = (status) => onKabar(status.message || t.galatLain);

      kemudi.current = {
        tekan: (keysym, _code, turun) => client.sendKeyEvent(turun ? 1 : 0, keysym),
        tempel: (teks) => {
          const writer = new G.StringWriter(client.createClipboardStream("text/plain"));
          writer.sendText(teks);
          writer.sendEnd();
        },
      };

      client.connect("");
      terima = sal.terima;
      for (const d of antre.splice(0)) sal.terima(d);

      tutup = () => {
        ro.disconnect();
        keyboard.onkeydown = null;
        keyboard.onkeyup = null;
        keyboard.reset();
        // Closed first: the old client's "disconnect" must not reach the
        // connection the bridge opened in its place
        sal.tutup();
        client.disconnect();
        layar.remove();
      };
    });

    return () => {
      mati = true;
      apiRef.current = null;
      kemudi.current = null;
      tutup();
    };
  }, [guac, sesi, ws, kirim, apiRef, tunda]);

  const pegang = kendali && !hp;
  const pegangRef = useRef(pegang);
  pegangRef.current = pegang;
  useEffect(() => {
    if (rfb.current) rfb.current.viewOnly = !pegang;
  }, [pegang]);

  return (
    <div className="vnc">
      <div className="vnc__bar">
        <span className="pill pill--violet">{target === ":0" ? t.screen0 : t.screen1}</span>
        <span className={`pill${pegang ? " pill--ok" : ""}`}>
          {pegang ? (
            <HandIcon size={14} aria-hidden="true" />
          ) : (
            <EyeIcon size={14} aria-hidden="true" />
          )}
          {pegang ? t.controls : kendali && hp ? t.phoneView : t.watching}
        </span>
        <span className="vnc__tools">
          <Popover
            open={menu && pegang}
            onOpenChange={setMenu}
            align="end"
            trigger={
              <IconButton sm kind="ghost" icon={KeyboardIcon} label={t.keys} disabled={!pegang} />
            }
          >
            <div className="vnc__keys" role="menu" aria-label={t.keysTitle}>
              <b className="vnc__keys-h">{t.keysTitle}</b>
              <span className="hint">{t.keysHint}</span>
              {PINTAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  className="vnc__key"
                  onClick={() => kirimPintas(p)}
                >
                  {t.keyNames[p.id]}
                </button>
              ))}
            </div>
          </Popover>
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
            icon={full ? ArrowsInIcon : ArrowsOutIcon}
            label={full ? t.exitFull : t.full}
            onClick={onFull}
          />
        </span>
      </div>
      <div
        className="vnc__frame"
        data-ctl={pegang ? "yes" : "no"}
        onPointerDown={onGerak}
        onKeyDown={onGerak}
        onWheel={onGerak}
      >
        <div
          className={`vnc__screen${guac ? " vnc__screen--guac" : ""}`}
          ref={box}
          tabIndex={guac && pegang ? 0 : undefined}
          onPointerDown={guac && pegang ? (e) => e.currentTarget.focus() : undefined}
        />
        {!gambar && (
          <span className="vnc__wait" role="status">
            <CircleNotchIcon size={22} weight="bold" aria-hidden="true" />
            <b>{t.waitPicture}</b>
            <span>{guac ? t.waitPictureKde : t.waitPictureHint}</span>
          </span>
        )}
        {!pegang && gambar && (
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
              disabled={!teksKlip || !pegang}
              onClick={() => {
                kemudi.current?.tempel(teksKlip);
                setKlip(false);
                onKabar(t.clipSent);
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
