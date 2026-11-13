import { describe, expect, it } from "vitest";
import { kodeBawaan } from "../kode-aktif";
import { LayananBangun, Pembatas, isiWifi, rakitSketch } from "../live-build";
import {
  literalC,
  uploadFile,
  type UploadFile,
  type UploadValues,
} from "../../../src/lib/live-build";

const nilai = (o: Partial<Required<UploadValues>> = {}): Required<UploadValues> => ({
  ssid: "LabWifi",
  password: "Secret#123",
  group: 3,
  key: "HD9LAUK9",
  ...o,
});

const ROLES: [number, string][] = [
  [1, "central"],
  [1, "peripheral"],
  [2, "esp32"],
  [3, "publisher"],
  [3, "subscriber"],
  [4, "hunter"],
  [4, "beacon"],
];
const file = (m: number, r: string) => uploadFile(m, r) as UploadFile;

describe("rakitSketch", () => {
  it.each(ROLES)(
    "Module %i %s: the complete file, no blank left, the person's values in",
    (m, r) => {
      const f = file(m, r);
      const text = rakitSketch(kodeBawaan(m), f, "en", nilai(), "internet");
      expect(text).not.toContain("________");
      if (f.wifi) {
        expect(text).toContain(literalC("LabWifi"));
        expect(text).toContain(literalC("Secret#123"));
        // The raw values never appear in the source, only their escapes
        expect(text).not.toContain("LabWifi");
        expect(text).not.toContain("Secret#123");
      }
    },
  );

  it("Module 4 takes the group's identity and board key (group 3: sync word F3)", () => {
    const text = rakitSketch(kodeBawaan(4), file(4, "hunter"), "en", nilai(), "internet");
    expect(text).toMatch(/#define GROUP_ID 3\b/);
    expect(text).toMatch(/LORA_SYNC_WORD\s+0xF3/);
    expect(text).toContain('HUNT_KEY       = "HD9LAUK9"');
  });

  it("Module 4 with no key keeps the sketch's own placeholder", () => {
    const withKey = rakitSketch(
      kodeBawaan(4),
      file(4, "beacon"),
      "en",
      nilai({ key: "ZZZZ2222" }),
      "internet",
    );
    const without = rakitSketch(
      kodeBawaan(4),
      file(4, "beacon"),
      "en",
      nilai({ key: "" }),
      "internet",
    );
    expect(withKey).toContain("ZZZZ2222");
    expect(without).not.toContain("ZZZZ2222");
    expect(without).toMatch(/const char\* HUNT_KEY/);
  });

  it("Module 4 on the IRIS_IOT network keeps that network's host but the person's Wi-Fi", () => {
    const text = rakitSketch(kodeBawaan(4), file(4, "hunter"), "en", nilai(), "iris_iot");
    expect(text).toContain("192.168.4.1");
    expect(text).toContain(literalC("LabWifi"));
  });

  it("the id and en tracks build the same code (only comments and messages differ)", () => {
    const id = rakitSketch(kodeBawaan(4), file(4, "hunter"), "id", nilai(), "internet");
    const en = rakitSketch(kodeBawaan(4), file(4, "hunter"), "en", nilai(), "internet");
    expect(id.split("\n").length).toBe(en.split("\n").length);
  });

  it("Module 2's group lands in its path blank (per group answer)", () => {
    const g2 = rakitSketch(kodeBawaan(2), file(2, "esp32"), "en", nilai({ group: 2 }), "internet");
    const g5 = rakitSketch(kodeBawaan(2), file(2, "esp32"), "en", nilai({ group: 5 }), "internet");
    expect(g2).not.toBe(g5);
  });

  it("a hostile Wi-Fi name or password changes nothing but its own two lines", () => {
    const calm = rakitSketch(kodeBawaan(4), file(4, "hunter"), "en", nilai(), "internet").split(
      "\n",
    );
    const hostile = rakitSketch(
      kodeBawaan(4),
      file(4, "hunter"),
      "en",
      nilai({ ssid: 'x"; system("x"); //', password: "#include <a> ??/ \\\\ %: asm" }),
      "internet",
    ).split("\n");
    expect(hostile.length).toBe(calm.length);
    const differing = calm.map((l, i) => (l === hostile[i] ? -1 : i)).filter((i) => i >= 0);
    expect(differing).toHaveLength(2);
    for (const i of differing)
      expect(hostile[i]).toMatch(/^const char\* WIFI_(SSID|PASSWORD) {1,6}= "(\\[0-7]{3})*";/);
  });
});

describe("isiWifi", () => {
  it("refuses a file whose Wi-Fi line is missing or doubled", () => {
    const f = file(4, "hunter");
    expect(() => isiWifi(f, "int x;", { ssid: "a", password: "" })).toThrow(/matched 0 times/);
    const twice =
      'const char* WIFI_SSID = "a";\nconst char* WIFI_SSID = "b";\nconst char* WIFI_PASSWORD = "c";';
    expect(() => isiWifi(f, twice, { ssid: "a", password: "" })).toThrow(/matched 2 times/);
  });

  it("writes a MicroPython file's two lines", () => {
    const f = file(3, "publisher");
    const out = isiWifi(
      f,
      'wifi_ssid     = "<YOUR SSID WIFI>"\nwifi_password = "<YOUR WIFI PASSWORD>"\n',
      {
        ssid: "AB",
        password: "",
      },
    );
    expect(out).toBe(`wifi_ssid     = ${literalC("AB")}\nwifi_password = ${literalC("")}\n`);
  });

  it("leaves a file without Wi-Fi alone", () => {
    expect(isiWifi(file(1, "central"), "keep", { ssid: "x", password: "" })).toBe("keep");
  });
});

describe("Pembatas", () => {
  it("lets a person start 20 builds in 10 minutes and then waits, per person", () => {
    let t = 0;
    const p = new Pembatas(20, 600_000, () => t);
    for (let i = 0; i < 20; i++) expect(p.boleh("a")).toBe(true);
    expect(p.boleh("a")).toBe(false);
    expect(p.boleh("b")).toBe(true);
    t = 600_001;
    expect(p.boleh("a")).toBe(true);
  });
});

describe("LayananBangun", () => {
  const jawab = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("starts a build with the token and the one fixed board", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({
          id: "a".repeat(16),
          state: "queued",
          pos: 2,
          size: 0,
          kode: null,
          log: "",
        }),
        { status: 202 },
      );
    }) as unknown as typeof fetch;
    const l = new LayananBangun(f, "http://x:1", () => "tok");
    const r = await l.mulai("void setup(){}");
    expect(r).toMatchObject({ ok: true, id: "a".repeat(16), tampil: { state: "queued", pos: 2 } });
    expect(seen!.url).toBe("http://x:1/build");
    expect((seen!.init.headers as Record<string, string>)["X-Build-Token"]).toBe("tok");
    expect(JSON.parse(seen!.init.body as string)).toEqual({
      fqbn: "esp32:esp32:esp32",
      files: { "s.ino": "void setup(){}" },
    });
  });

  it("maps a loaded PC, a dead service and a refusal to their own codes", async () => {
    expect(
      await new LayananBangun(jawab(503, { kode: "sibuk" }), "http://x", () => "t").mulai("a"),
    ).toEqual({
      ok: false,
      kode: "sibuk",
    });
    expect(await new LayananBangun(jawab(400, {}), "http://x", () => "t").mulai("a")).toEqual({
      ok: false,
      kode: "layanan_galat",
    });
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await new LayananBangun(down, "http://x", () => "t").mulai("a")).toEqual({
      ok: false,
      kode: "layanan_mati",
    });
    // No token file on this machine is the same as no service
    expect(
      await new LayananBangun(jawab(202, {}), "http://x", () => {
        throw new Error("ENOENT");
      })
        .mulai("a")
        .catch(() => ({ ok: false, kode: "layanan_mati" })),
    ).toEqual({ ok: false, kode: "layanan_mati" });
  });

  it("shows a compile log only for a failed build, cut to 4000 characters", async () => {
    const big = "e".repeat(9000);
    const failed = await new LayananBangun(
      jawab(200, { state: "failed", pos: 0, size: 0, kode: "galat_kompilasi", log: big }),
      "http://x",
      () => "t",
    ).status("a".repeat(16));
    expect(failed?.log).toHaveLength(4000);
    const done = await new LayananBangun(
      jawab(200, { state: "done", pos: 0, size: 10, kode: null, log: big }),
      "http://x",
      () => "t",
    ).status("a".repeat(16));
    expect(done?.log).toBe("");
  });
});
