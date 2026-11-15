import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { HEADER_DALAM, dariSaudara, kepalaUlang, teruskanUpgrade } from "../klaster/teruskan.js";
import { buatPengarah } from "../upgrade.js";

const RAHASIA = "s".repeat(48);
let tutup: Array<() => void> = [];
afterEach(() => {
  tutup.forEach((f) => f());
  tutup = [];
});

async function dengarkan(server: http.Server) {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  tutup.push(() => {
    server.closeAllConnections();
    server.close();
  });
  return (server.address() as AddressInfo).port;
}

/** The leader's own door: accepts only a sibling's request and echoes what it saw in the request head. */
async function pemimpin() {
  const dilihat: Array<http.IncomingHttpHeaders & { url?: string }> = [];
  const server = http.createServer((_q, s) => s.end());
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (!dariSaudara(req, RAHASIA)) {
      socket.destroy();
      return;
    }
    dilihat.push({ ...req.headers, url: req.url });
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send("halo dari pemimpin");
      ws.on("message", (d) => ws.send(`gema:${d.toString()}`));
    });
  });
  tutup.push(() => wss.close());
  const port = await dengarkan(server);
  return { port, dilihat };
}

/** A follower: its public door passes every upgrade on to `port`. */
async function pengikut(port: number) {
  const server = http.createServer((_q, s) => s.end());
  const pengarah = buatPengarah(server);
  pengarah.daftar(
    () => true,
    (req, socket, head) => teruskanUpgrade(port, RAHASIA, req, socket, head, 500),
  );
  return dengarkan(server);
}

function sambung(
  port: number,
  jalur: string,
  opsi: ConstructorParameters<typeof WebSocket>[2] = {},
) {
  return new Promise<{ ws: WebSocket; pesan: string[] }>((selesai, tolak) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${jalur}`, opsi);
    const pesan: string[] = [];
    ws.on("message", (d) => pesan.push(d.toString()));
    ws.on("open", () => {
      tutup.push(() => ws.terminate());
      selesai({ ws, pesan });
    });
    ws.on("unexpected-response", (_q, res) => tolak(new Error(`HTTP ${res.statusCode}`)));
    ws.on("error", tolak);
  });
}

describe("passing a socket to the leader", () => {
  it("joins both ends, in both directions", async () => {
    const lead = await pemimpin();
    const port = await pengikut(lead.port);
    const { ws, pesan } = await sambung(port, "/kuis/ws?b=id");
    await new Promise((r) => setTimeout(r, 50));
    expect(pesan).toEqual(["halo dari pemimpin"]);
    ws.send("satu");
    await new Promise((r) => setTimeout(r, 80));
    expect(pesan).toContain("gema:satu");
  });

  it("keeps the request as the browser sent it: path, cookie, Origin, Host", async () => {
    const lead = await pemimpin();
    const port = await pengikut(lead.port);
    await sambung(port, "/kuis/ws?b=en", {
      headers: { Cookie: "iris_session=abc", Origin: "https://games.example", "X-Lain": "1" },
    });
    const h = lead.dilihat[0];
    expect(h.url).toBe("/kuis/ws?b=en");
    expect(h.cookie).toBe("iris_session=abc");
    expect(h.origin).toBe("https://games.example");
    expect(h["x-lain"]).toBe("1");
    expect(h.host).toBe(`127.0.0.1:${port}`);
  });

  it("does not believe a sibling header that came from outside", async () => {
    const lead = await pemimpin();
    const port = await pengikut(lead.port);
    // A visitor who guesses the header name but not the secret is still let through only with the real secret
    // the follower adds, and the visitor's own value is dropped.
    await sambung(port, "/kuis/ws", { headers: { [HEADER_DALAM]: "tebakan" } });
    expect(lead.dilihat[0][HEADER_DALAM]).toBe(RAHASIA);
  });

  it("answers 503 when the leader's door is shut", async () => {
    const mati = http.createServer();
    const portMati = await dengarkan(mati);
    mati.close();
    const port = await pengikut(portMati);
    await expect(sambung(port, "/kuis/ws")).rejects.toThrow(/503/);
  });

  it("turns away a request without the secret at the leader's door", async () => {
    const lead = await pemimpin();
    await expect(sambung(lead.port, "/kuis/ws")).rejects.toThrow();
    expect(lead.dilihat).toHaveLength(0);
  });
});

describe("request head and secret", () => {
  it("rebuilds the head from the raw headers and adds the secret last", () => {
    const req = {
      method: "GET",
      url: "/kuis/ws?b=id",
      httpVersion: "1.1",
      rawHeaders: [
        "Host",
        "games.irisiotlab.com",
        "Cookie",
        "a=b",
        "X-Iris-Dalam",
        "palsu",
        "Upgrade",
        "websocket",
      ],
    } as unknown as http.IncomingMessage;
    const kepala = kepalaUlang(req, "RAHASIA");
    expect(kepala).toBe(
      "GET /kuis/ws?b=id HTTP/1.1\r\nHost: games.irisiotlab.com\r\nCookie: a=b\r\nUpgrade: websocket\r\nx-iris-dalam: RAHASIA\r\n\r\n",
    );
  });

  it("compares the secret exactly", () => {
    const dengan = (v: string | undefined) =>
      ({
        headers: v === undefined ? {} : { [HEADER_DALAM]: v },
      }) as unknown as http.IncomingMessage;
    expect(dariSaudara(dengan("abc"), "abc")).toBe(true);
    expect(dariSaudara(dengan("abd"), "abc")).toBe(false);
    expect(dariSaudara(dengan("abcd"), "abc")).toBe(false);
    expect(dariSaudara(dengan(undefined), "abc")).toBe(false);
    expect(dariSaudara(dengan("abc"), "")).toBe(false);
  });
});
