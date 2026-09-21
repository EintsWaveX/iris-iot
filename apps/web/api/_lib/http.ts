/**
 * Minimal request/response typing for Vercel's Node.js function runtime.
 *
 * Deliberately not importing @vercel/node for this: its only purpose here
 * would be these two type shapes, and pulling in the package brought
 * three high-severity transitive advisories (path-to-regexp ReDoS, two
 * undici issues) for a dev-time-only type import. Vercel's Node runtime
 * hands every function a plain http.IncomingMessage/ServerResponse pair
 * with a few conveniences merged on; this interface names exactly the
 * conveniences the routes in this folder actually use.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiRequest extends IncomingMessage {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  headers: IncomingMessage["headers"];
}

export interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string | string[]): this;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

/**
 * The client's IP, for rate limiting. Vercel terminates TLS in front of
 * the function and forwards the real client address in x-forwarded-for
 * (first entry in the list, since proxies append rather than replace).
 * Falls back to the socket address for local `vercel dev`, and to a
 * literal placeholder if even that is unavailable — a missing IP should
 * degrade the rate limiter to "treat every request as the same caller",
 * never crash the route.
 */
export function clientIp(req: ApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/** Rejects anything but the expected method, in the shape every route
 *  here needs identically: set Allow, 405, done. */
export function requireMethod(req: ApiRequest, res: ApiResponse, method: string): boolean {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  res.status(405).json({ ok: false, kode: "metode_tidak_diizinkan" });
  return false;
}

/**
 * Vercel parses a JSON body for you when Content-Type is application/json,
 * but a malformed body or an unexpected content type can leave req.body
 * as undefined, a string, or (rarely) something that throws on property
 * access. This normalises all of those into a plain object a route can
 * destructure from without an extra try/catch at every call site.
 */
export function jsonBody(req: ApiRequest): Record<string, unknown> {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function noStore(res: ApiResponse): void {
  res.setHeader("Cache-Control", "no-store");
}

function directErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Narrows an unknown catch value to "has a Postgres error code", without
 *  reaching for `any` at every call site that needs to branch on one
 *  (e.g. '23505' unique_violation from a race on a unique constraint).
 *
 *  drizzle-orm's neon-serverless driver wraps the underlying pg error in
 *  its own DrizzleQueryError and puts the original on `.cause` (verified
 *  against a live 23505 from the `sesi_slot_unik` constraint -- the top-
 *  level error has no `code` of its own, only `.cause.code`). Checked
 *  second, after the direct shape, so a plain pg error (e.g. from a
 *  driver that doesn't wrap) still matches without going through `.cause`. */
export function pgErrorCode(err: unknown): string | undefined {
  return (
    directErrorCode(err) ??
    (err && typeof err === "object" && "cause" in err
      ? directErrorCode((err as { cause: unknown }).cause)
      : undefined)
  );
}

/**
 * Parses the raw Cookie header into a plain map. Written by hand rather
 * than pulled in from a cookie-parsing package for the same reason as the
 * request/response types above: one three-line function doesn't justify a
 * dependency and its own advisories.
 */
export function parseCookies(req: ApiRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
