/**
 * Hands a WebSocket upgrade this worker received to another worker's own door (127.0.0.1, its own port), for the
 * sockets that live on the leader only: the quiz game keeps a room's state in memory, so every phone and host
 * of a game must end up in the same process, whichever worker the tunnel's connection happened to reach.
 *
 * The request head the HTTP parser already consumed is written out again as it came (same headers, same
 * order, so the cookie, Origin and Host the game checks are untouched), with a header that proves it comes
 * from a sibling (the supervisor's per-run secret), and then both sockets are joined byte for byte. The other
 * worker's door accepts upgrades with that header only.
 */
import net from "node:net";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { tolakUpgrade } from "../upgrade.js";

export const HEADER_DALAM = "x-iris-dalam";

/** The request line and headers as the browser sent them, plus the sibling header. */
export function kepalaUlang(req: IncomingMessage, rahasia: string): string {
  let kepala = `${req.method ?? "GET"} ${req.url ?? "/"} HTTP/${req.httpVersion}\r\n`;
  const mentah = req.rawHeaders;
  for (let i = 0; i + 1 < mentah.length; i += 2) {
    // A header of ours that came from outside is not believed.
    if (mentah[i].toLowerCase() === HEADER_DALAM) continue;
    kepala += `${mentah[i]}: ${mentah[i + 1]}\r\n`;
  }
  return `${kepala}${HEADER_DALAM}: ${rahasia}\r\n\r\n`;
}

/** Does this request carry the sibling secret? Compared in constant time. */
export function dariSaudara(req: IncomingMessage, rahasia: string): boolean {
  const h = req.headers[HEADER_DALAM];
  const v = Array.isArray(h) ? h[0] : h;
  if (!v || !rahasia || v.length !== rahasia.length) return false;
  let beda = 0;
  for (let i = 0; i < v.length; i++) beda |= v.charCodeAt(i) ^ rahasia.charCodeAt(i);
  return beda === 0;
}

export function teruskanUpgrade(
  port: number,
  rahasia: string,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  waktuMs = 3000,
): void {
  const hulu = net.connect({ port, host: "127.0.0.1" });
  const batas = setTimeout(() => {
    hulu.destroy();
    tolakUpgrade(socket, 503, "Service Unavailable");
  }, waktuMs);
  batas.unref();
  let tersambung = false;
  hulu.once("connect", () => {
    tersambung = true;
    clearTimeout(batas);
    hulu.write(kepalaUlang(req, rahasia));
    if (head.length) hulu.write(head);
    socket.pipe(hulu);
    hulu.pipe(socket);
  });
  hulu.on("error", () => {
    clearTimeout(batas);
    if (!tersambung) tolakUpgrade(socket, 503, "Service Unavailable");
    else socket.destroy();
    hulu.destroy();
  });
  hulu.on("close", () => socket.destroy());
  socket.on("close", () => hulu.destroy());
  socket.on("error", () => hulu.destroy());
}
