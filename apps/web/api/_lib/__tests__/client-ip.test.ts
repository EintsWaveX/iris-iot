import { describe, expect, it } from "vitest";
import { clientIp, type ApiRequest } from "../http.js";

const req = (headers: Record<string, string>) =>
  ({ headers, socket: { remoteAddress: "10.0.0.9" } }) as unknown as ApiRequest;

describe("clientIp", () => {
  it("takes the address Vercel sets, not one the caller put in x-forwarded-for", () => {
    expect(
      clientIp(req({ "x-vercel-forwarded-for": "203.0.113.5", "x-forwarded-for": "1.2.3.4" })),
    ).toBe("203.0.113.5");
  });

  it("falls back to x-forwarded-for, then the socket", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientIp(req({}))).toBe("10.0.0.9");
  });
});
