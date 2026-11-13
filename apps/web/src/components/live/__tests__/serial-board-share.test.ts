// @vitest-environment jsdom
/**
 * One board is one role at a time. A browser returns the SAME port object for the same device, so
 * a Pico that was just the Publisher is still open in the Publisher's row; picking it for the
 * Subscriber used to fail as "port busy" with nothing else running. Now the row that wants a port
 * has the row that holds it let go first, and a port that is no longer on the cable is not reused.
 */
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSerialBoard, type SerialPortLike } from "../useSerialBoard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A port that refuses to open twice, like the real one */
function fakePort(): SerialPortLike & { isOpen: boolean; opens: number } {
  const p = {
    isOpen: false,
    opens: 0,
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,
    async open() {
      if (p.isOpen) throw new DOMException("The port is already open.", "InvalidStateError");
      p.isOpen = true;
      p.opens++;
      p.readable = new ReadableStream<Uint8Array>({ start() {} });
      p.writable = new WritableStream<Uint8Array>({ write() {} });
    },
    async close() {
      p.isOpen = false;
      p.readable = null;
      p.writable = null;
    },
    async setSignals() {},
  };
  return p;
}

type Board = ReturnType<typeof useSerialBoard>;
const rows: Record<string, Board> = {};
let root: Root | null = null;
let box: HTMLElement | null = null;
let granted: SerialPortLike[] = [];
let next: SerialPortLike | null = null;

function Row({ name }: { name: string }) {
  rows[name] = useSerialBoard(3);
  return null;
}

beforeEach(() => {
  granted = [];
  next = null;
  Object.defineProperty(navigator, "serial", {
    configurable: true,
    value: {
      requestPort: async () => {
        if (!next) throw new DOMException("dismissed", "NotFoundError");
        if (!granted.includes(next)) granted.push(next);
        return next;
      },
      getPorts: async () => granted,
    },
  });
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(h("div", null, h(Row, { name: "pub" }), h(Row, { name: "sub" }))));
});

afterEach(async () => {
  await act(async () => {
    await rows.pub?.close();
    await rows.sub?.close();
  });
  act(() => root?.unmount());
  box?.remove();
});

describe("one board in two rows", () => {
  it("Hubungkan on the second row takes the board from the first, which goes back to not connected", async () => {
    const pico = fakePort();
    next = pico;
    await act(async () => {
      void rows.pub.connect();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(rows.pub.status).toBe("open");
    await act(async () => {
      void rows.sub.connect();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(rows.sub.status).toBe("open");
    expect(rows.pub.status).toBe("idle");
    expect(pico.opens).toBe(2);
  });

  it("picking the board changes nothing; claiming it, once an image is in hand, frees it", async () => {
    const pico = fakePort();
    next = pico;
    await act(async () => {
      void rows.pub.connect();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(pico.isOpen).toBe(true);
    let picked: SerialPortLike | null = null;
    await act(async () => {
      picked = await rows.sub.pickPort();
    });
    expect(picked).toBe(pico);
    // Only choosing: a build that fails next leaves the Publisher's connection as it was
    expect(pico.isOpen).toBe(true);
    expect(rows.pub.status).toBe("open");
    await act(async () => {
      await rows.sub.claim(pico);
    });
    expect(pico.isOpen).toBe(false); // the Publisher's row let go, so esptool or the REPL writer can open it
    expect(rows.pub.status).toBe("idle");
  });

  it("an upload on the same row reuses its own port without asking again", async () => {
    const pico = fakePort();
    next = pico;
    await act(async () => {
      void rows.pub.connect();
      await new Promise((r) => setTimeout(r, 20));
    });
    next = null; // a second chooser would throw: it must not be asked
    let again: SerialPortLike | null = null;
    await act(async () => {
      again = await rows.pub.pickPort();
    });
    expect(again).toBe(pico);
  });

  it("a board that was unplugged and plugged into another port is asked for again, not reused", async () => {
    const old = fakePort();
    next = old;
    await act(async () => {
      void rows.sub.connect();
      await new Promise((r) => setTimeout(r, 20));
      await rows.sub.close();
    });
    granted = []; // the browser no longer lists the old one
    const fresh = fakePort();
    next = fresh;
    let picked: SerialPortLike | null = null;
    await act(async () => {
      picked = await rows.sub.pickPort();
    });
    expect(picked).toBe(fresh);
  });

  it("dismissing the chooser gives no port and changes nothing", async () => {
    next = null;
    let picked: SerialPortLike | null | undefined;
    await act(async () => {
      picked = await rows.sub.pickPort();
    });
    expect(picked).toBeNull();
    expect(rows.sub.status).toBe("idle");
  });
});
