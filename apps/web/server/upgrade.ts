/**
 * One place that takes every WebSocket upgrade the server receives and hands it to whoever owns that path
 * (the quiz at /kuis/ws, the live-update hub at /siaran, later the session and exam rooms). Before this each
 * socket feature listened for `upgrade` itself and destroyed what was not its own, so a second feature could
 * not exist beside the first. Here a request nobody claims gets a plain 404, and a handler that throws gets a
 * 500, so no feature can leave a half-open socket behind.
 */
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

export type Penangan = (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>;

export interface Pengarah {
  /** `cocok` is told the request's path and host; the first one that says yes gets the socket. */
  daftar(cocok: (jalur: string, host: string | undefined) => boolean, tangani: Penangan): void;
}

/** Ends a socket with a short plain HTTP answer. */
export function tolakUpgrade(socket: Duplex, status: number, teks: string): void {
  if (socket.destroyed) return;
  socket.write(
    `HTTP/1.1 ${status} ${teks}\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n`,
  );
  socket.destroy();
}

export function buatPengarah(server: Server): Pengarah {
  const daftar: Array<{ cocok: (j: string, h: string | undefined) => boolean; tangani: Penangan }> =
    [];

  server.on("upgrade", (req, socket, head) => {
    let jalur = "";
    try {
      jalur = new URL(req.url ?? "/", "http://iris.local").pathname;
    } catch {
      return tolakUpgrade(socket, 400, "Bad Request");
    }
    const pemilik = daftar.find((d) => d.cocok(jalur, req.headers.host));
    if (!pemilik) return tolakUpgrade(socket, 404, "Not Found");
    // A socket that errors before the handler answers must not crash the process.
    socket.on("error", () => socket.destroy());
    Promise.resolve()
      .then(() => pemilik.tangani(req, socket, head))
      .catch((err) => {
        console.error(`[upgrade] ${jalur} failed:`, err);
        tolakUpgrade(socket, 500, "Internal Server Error");
      });
  });

  return { daftar: (cocok, tangani) => void daftar.push({ cocok, tangani }) };
}
