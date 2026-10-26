/**
 * Where a reference snapshot may fetch from (EXAM-ENGINE 8.1 step 2): no
 * loopback, private, link local, CGNAT, multicast or IPv6 ULA address, and
 * the same rule for every redirect.
 */
import { describe, expect, it } from "vitest";
import { blockedAddress, checkUrl } from "../recruitment/snapshot-net";

describe("blockedAddress", () => {
  it("refuses the private and special IPv4 ranges", () => {
    for (const ip of [
      "0.0.0.0",
      "0.1.2.3",
      "10.0.0.1",
      "10.255.255.255",
      "100.64.0.1",
      "100.127.255.255",
      "127.0.0.1",
      "127.8.8.8",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.0.2.5",
      "192.168.1.1",
      "198.18.0.1",
      "198.19.255.255",
      "198.51.100.7",
      "203.0.113.9",
      "224.0.0.1",
      "239.255.255.250",
      "240.0.0.1",
      "255.255.255.255",
    ])
      expect(blockedAddress(ip), ip).toBe(true);
  });

  it("lets public IPv4 through, including the edges of the private ranges", () => {
    for (const ip of [
      "1.1.1.1",
      "8.8.8.8",
      "140.82.112.4",
      "100.63.255.255",
      "100.128.0.1",
      "172.15.255.255",
      "172.32.0.1",
      "169.253.0.1",
      "198.17.0.1",
      "198.20.0.1",
      "223.255.255.255",
    ])
      expect(blockedAddress(ip), ip).toBe(false);
  });

  it("refuses loopback, ULA, link local, multicast and unspecified IPv6", () => {
    for (const ip of [
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "febf::1",
      "fec0::1",
      "ff02::1",
      "2001:db8::1",
      "2001::1",
      "100::1",
    ])
      expect(blockedAddress(ip), ip).toBe(true);
  });

  it("looks inside IPv4 mapped, NAT64, 6to4 and compatible addresses", () => {
    for (const ip of [
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.1",
      "::ffff:a9fe:a9fe",
      "64:ff9b::7f00:1",
      "64:ff9b::10.1.2.3",
      "2002:7f00:1::",
      "2002:c0a8:101::1",
      "::127.0.0.1",
    ])
      expect(blockedAddress(ip), ip).toBe(true);
    for (const ip of ["::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"])
      expect(blockedAddress(ip), ip).toBe(false);
  });

  it("lets public IPv6 through", () => {
    for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "2620:0:861:ed1a::1"])
      expect(blockedAddress(ip), ip).toBe(false);
  });

  it("refuses anything that is not an address", () => {
    for (const ip of [
      "",
      "localhost",
      "1.2.3",
      "999.1.1.1",
      "1.2.3.4.5",
      "::g",
      "1:2:3:4:5:6:7:8:9",
    ])
      expect(blockedAddress(ip), ip).toBe(true);
  });
});

describe("checkUrl", () => {
  it("takes plain http and https pages", () => {
    for (const u of [
      "https://github.com/links2004/arduinoWebSockets",
      "http://docs.python.org/3/library/socket.html",
      "https://docs.arduino.cc:443/language-reference/",
      "https://example.org:80/x",
    ])
      expect(checkUrl(u).ok, u).toBe(true);
  });

  it("refuses other schemes, credentials, odd ports and bare hosts", () => {
    const bad: [string, string][] = [
      ["ftp://example.org/x", "url_salah"],
      ["file:///etc/passwd", "url_salah"],
      ["javascript:alert(1)", "url_salah"],
      [`https://${"name"}@example.org/`, "url_salah"],
      ["https://example.org:8443/", "url_salah"],
      ["https://example.org:22/", "url_salah"],
      ["https://localhost/", "alamat_terlarang"],
      ["https://intranet/", "alamat_terlarang"],
      ["https://127.0.0.1/", "alamat_terlarang"],
      ["http://[::1]/", "alamat_terlarang"],
      ["http://169.254.169.254/latest/meta-data", "alamat_terlarang"],
      ["http://10.0.0.5/", "alamat_terlarang"],
      ["http://2130706433/", "alamat_terlarang"],
      ["http://0x7f.1/", "alamat_terlarang"],
      ["http://metadata.google.internal./", "alamat_terlarang"],
      ["not a url", "url_salah"],
      ["", "url_salah"],
    ];
    for (const [u, kode] of bad) {
      const r = checkUrl(u);
      expect(r.ok, u).toBe(false);
      if (!r.ok) expect(r.kode, u).toBe(kode);
    }
  });

  it("a public IP literal is allowed only when it is not blocked", () => {
    expect(checkUrl("http://8.8.8.8/").ok).toBe(true);
    expect(checkUrl("https://[2606:4700:4700::1111]/").ok).toBe(true);
  });

  it("the page address loses its fragment", () => {
    const r = checkUrl("https://example.org/a#b");
    expect(r.ok && r.url.hash).toBe("");
  });
});
