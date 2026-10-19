/**
 * The class page's sections (Phase 16): the File and section-delete forms
 * recorded read only on 2026-10-15, and adding, naming, filling, moving,
 * showing and deleting sections against a small fake LMS that keeps a
 * course like the live ones (the campus K3 course in sections 0 to 6).
 */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

let web: typeof import("../lms-web");
let isi: typeof import("../lms-isi");

/* ------------------------------------------------------------ fake LMS */

interface Cm {
  id: number;
  name: string;
  modname: string;
  visible: number;
  externalurl?: string;
  intro?: string;
}
interface Bagian {
  id: number;
  name: string;
  visible: number;
  cms: Cm[];
}
const TOKEN = "t".repeat(32);
const dunia = {
  sesi: new Set<string>(),
  bagian: [] as Bagian[],
  idBagian: 148800,
  cmid: 850000,
  /** what the AJAX service was sent, and with which content type */
  ajax: [] as { jenis: string; metode: string; args: Record<string, unknown> }[],
  /** the sesskey the session's pages hand out (changed to test a stale one) */
  kunci: "SESSKEY0",
  /** how a refused sesskey comes back: in the list, or as one object (what
   *  service.php answers when it fails before reading the calls) */
  galatObjek: false,
};
const RESOURCE = fx("lms-modedit-resource.html");
const HAPUS = fx("lms-editsection-delete.html");

function kursusBaru() {
  const nama = [
    "KESELAMATAN, KESEHATAN, KERJA / [K3] di LABORATORIUM",
    "Tujuan",
    "IDENTIFIKASI RISIKO BAHAYA DI LABORATORIUM",
    "Langkah-langkah Pencegahan Kecelakaan Kerja di laboratorium",
    "Tindakan Darurat",
    "Evaluasi Akhir",
    "FINISH",
  ];
  dunia.bagian = nama.map((name, i) => ({
    id: 148746 + i,
    name,
    visible: 1,
    cms: [{ id: 779800 + i, name: `Evaluasi Materi ${i + 1}`, modname: "quiz", visible: 1 }],
  }));
  dunia.bagian[0].cms.push({ id: 842415, name: "TP Modul 1", modname: "assign", visible: 1 });
  dunia.ajax = [];
  dunia.kunci = "SESSKEY0";
  dunia.galatObjek = false;
}

const cariCm = (id: number) => {
  for (const b of dunia.bagian) {
    const i = b.cms.findIndex((c) => c.id === id);
    if (i >= 0) return { b, i };
  }
  return null;
};

let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const potong: Buffer[] = [];
    req.on("data", (c: Buffer) => potong.push(c));
    req.on("end", () => {
      const body = Buffer.concat(potong).toString("utf8");
      const f = new URLSearchParams(body);
      const kirim = (status: number, teks: string, h: Record<string, string | string[]> = {}) => {
        res.writeHead(status, { "content-type": "text/html", ...h });
        res.end(teks);
      };
      const json = (d: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(d));
      };
      if (u.pathname === "/webservice/rest/server.php") {
        const fn = f.get("wsfunction");
        if (fn === "tool_mobile_get_autologin_key")
          return json({
            key: "k",
            autologinurl: "https://lms.example/admin/tool/mobile/autologin.php",
          });
        if (fn === "core_course_get_contents")
          return json(
            dunia.bagian.map((b, n) => ({
              id: b.id,
              section: n,
              name: b.name,
              visible: b.visible,
              modules: b.cms.map((c) => ({ ...c })),
            })),
          );
        if (fn === "mod_url_get_urls_by_courses")
          return json({
            urls: dunia.bagian.flatMap((b) =>
              b.cms
                .filter((c) => c.modname === "url")
                .map((c) => ({
                  id: c.id,
                  coursemodule: c.id,
                  course: 9614,
                  externalurl: c.externalurl,
                })),
            ),
            warnings: [],
          });
        return json({});
      }
      if (u.pathname === "/admin/tool/mobile/autologin.php") {
        const s = Math.random().toString(36).slice(2);
        dunia.sesi.add(s);
        return kirim(303, "", {
          location: "/my/",
          "set-cookie": [`MoodleSessionlms=${s}; path=/`],
        });
      }
      const m = (req.headers.cookie ?? "").match(/MoodleSessionlms=([a-z0-9]+)/);
      if (!m || !dunia.sesi.has(m[1])) return kirim(303, "", { location: "/login/index.php" });

      if (u.pathname === "/course/view.php")
        return kirim(200, `<script>M.cfg = {"sesskey":"${dunia.kunci}"};</script>`);
      if (u.pathname === "/course/changenumsections.php") {
        if (u.searchParams.get("sesskey") !== dunia.kunci)
          return kirim(200, "<p>Your session has most likely timed out.</p>");
        dunia.bagian.push({ id: ++dunia.idBagian, name: "", visible: 1, cms: [] });
        return kirim(303, "", {
          location: `/course/view.php?id=${u.searchParams.get("courseid")}#section-${dunia.bagian.length - 1}`,
        });
      }
      const tautan = cariCm(Number(u.searchParams.get("update") ?? f.get("update")));
      if (u.pathname === "/course/modedit.php" && tautan) {
        const c = tautan.b.cms[tautan.i];
        if (req.method === "GET")
          return kirim(
            200,
            `<form action="modedit.php" method="post"><input type="hidden" name="sesskey" value="SESSKEY0"><input type="hidden" name="update" value="${c.id}"><input type="hidden" name="modulename" value="url"><input type="text" name="name" value="${c.name}"><input type="url" name="externalurl" value="${c.externalurl}"><textarea name="introeditor[text]">${c.intro}</textarea><input type="submit" name="submitbutton2" value="Save and return to course"></form>`,
          );
        if (f.get("sesskey") !== "SESSKEY0") return kirim(200, "<p>?</p>");
        Object.assign(c, {
          name: f.get("name"),
          externalurl: f.get("externalurl"),
          intro: f.get("introeditor[text]"),
        });
        return kirim(303, "", { location: "/course/view.php?id=9614" });
      }
      if (u.pathname === "/course/modedit.php" && req.method === "GET")
        return kirim(
          200,
          RESOURCE.replace(
            /name="section" type="hidden" value="\d+"/,
            `name="section" type="hidden" value="${u.searchParams.get("section")}"`,
          ),
        );
      if (u.pathname === "/course/modedit.php") {
        if (f.get("sesskey") !== "SESSKEY0" || f.get("add") !== "resource")
          return kirim(200, "<p>?</p>");
        const b = dunia.bagian[Number(f.get("section"))];
        const cm = { id: ++dunia.cmid, name: f.get("name")!, modname: "resource", visible: 1 };
        b.cms.push(cm);
        (cm as Cm & { isi?: URLSearchParams }).isi = f;
        return kirim(303, "", { location: `/mod/resource/view.php?id=${cm.id}` });
      }
      if (u.pathname === "/course/editsection.php" && req.method === "GET")
        return kirim(200, HAPUS.replace('value="148753"', `value="${u.searchParams.get("id")}"`));
      if (u.pathname === "/course/editsection.php") {
        if (f.get("confirm") !== "1" || f.get("delete") !== "1" || f.get("sesskey") !== "SESSKEY0")
          return kirim(200, "<p>?</p>");
        dunia.bagian = dunia.bagian.filter((b) => b.id !== Number(f.get("id")));
        return kirim(303, "", { location: "/course/view.php?id=9614" });
      }
      if (u.pathname === "/lib/ajax/service.php") {
        const [c] = JSON.parse(body) as { methodname: string; args: Record<string, unknown> }[];
        dunia.ajax.push({
          jenis: req.headers["content-type"] ?? "",
          metode: c.methodname,
          args: c.args,
        });
        if (u.searchParams.get("sesskey") !== dunia.kunci)
          return json(
            dunia.galatObjek
              ? { error: "Your session has most likely timed out.", errorcode: "invalidsesskey" }
              : [{ error: true, exception: { errorcode: "invalidsesskey", message: "x" } }],
          );
        const a = c.args;
        const ids = (a.ids as number[]) ?? [];
        if (c.methodname === "core_update_inplace_editable") {
          if (a.itemtype === "sectionname") {
            const b = dunia.bagian.find((x) => x.id === Number(a.itemid))!;
            b.name = String(a.value);
          } else
            cariCm(Number(a.itemid))!.b.cms[cariCm(Number(a.itemid))!.i].name = String(a.value);
          return json([{ error: false, data: {} }]);
        }
        if (c.methodname === "core_courseformat_update_course") {
          if (a.action === "cm_move") {
            const ke = dunia.bagian.find((x) => x.id === a.targetsectionid)!;
            for (const id of ids) {
              const d = cariCm(id)!;
              const [cm] = d.b.cms.splice(d.i, 1);
              const i = a.targetcmid ? ke.cms.findIndex((x) => x.id === a.targetcmid) : -1;
              ke.cms.splice(i < 0 ? ke.cms.length : i, 0, cm);
            }
          } else if (a.action === "section_move_after") {
            const i = dunia.bagian.findIndex((x) => x.id === ids[0]);
            const [b] = dunia.bagian.splice(i, 1);
            const j = dunia.bagian.findIndex((x) => x.id === a.targetsectionid);
            dunia.bagian.splice(j + 1, 0, b);
          } else if (a.action === "section_hide" || a.action === "section_show") {
            dunia.bagian.find((x) => x.id === ids[0])!.visible =
              a.action === "section_show" ? 1 : 0;
          } else
            return json([
              {
                error: true,
                exception: { errorcode: "x", message: `Invalid course state action ${a.action}` },
              },
            ]);
          return json([{ error: false, data: "[]" }]);
        }
      }
      return kirim(404, "no");
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const a = server.address();
  process.env.LMS_URL = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  web = await import("../lms-web");
  isi = await import("../lms-isi");
});

afterAll(() => server?.close());
beforeEach(kursusBaru);

const sesi = () =>
  new web.WebLms(TOKEN, "p".repeat(64), 74004, { baca: async () => null, tulis: async () => {} });
const nama = () => dunia.bagian.map((b) => b.name);

/* ---------------------------------------------------------------- tests */

describe("the recorded section forms", () => {
  it("reads the File form with its draft area and display choices", () => {
    const f = web.bacaForm(RESOURCE, /modedit\.php/)!;
    const v = (n: string) => f.find((x) => x.nama === n);
    expect(v("modulename")?.nilai).toBe("resource");
    expect(v("sesskey")?.nilai).toBe("SESSKEY0");
    expect(v("files")?.jenis).toBe("hidden");
    expect(v("display")?.pilih).toEqual(["0"]);
    expect(v("_qf__mod_resource_mod_form")?.nilai).toBe("1");
  });

  it("finds the section delete confirmation's Delete form", () => {
    const f = web.bacaForm(HAPUS, /editsection\.php/)!;
    expect(Object.fromEntries(f.map((x) => [x.nama, x.nilai]))).toEqual({
      id: "148753",
      confirm: "1",
      delete: "1",
      sesskey: "SESSKEY0",
    });
  });

  it("tells IRIS's module sections by name in either language", () => {
    expect(isi.modulBagian("Modul 1 · Bluetooth Low Energy")).toBe(1);
    expect(isi.modulBagian("Module 4 · LoRa")).toBe(4);
    expect(isi.modulBagian("modul 2")).toBe(2);
    expect(isi.modulBagian("Modul 5 · x")).toBeNull();
    expect(isi.modulBagian("Modul 12")).toBeNull();
    expect(isi.modulBagian("Tujuan")).toBeNull();
    expect(isi.namaBagianModul(3, true)).toMatch(/^Module 3 · /);
    expect(isi.namaBagianModul(3, false)).toMatch(/^Modul 3 · /);
  });
});

describe("the class page's sections against a fake LMS", () => {
  it("adds Module m's section at the end once, named in the class's language", async () => {
    const w = sesi();
    const kampus = nama();
    const b = await isi.pastikanBagianModul(w, TOKEN, 9614, 1, false);
    expect(b.section).toBe(7);
    expect(nama().at(-1)).toBe(isi.namaBagianModul(1, false));
    // the campus sections stay as they were
    expect(nama().slice(0, 7)).toEqual(kampus);
    // found again by name, also when the other language's name is there
    const lagi = await isi.pastikanBagianModul(w, TOKEN, 9614, 1, true);
    expect(lagi.id).toBe(b.id);
    expect(dunia.bagian.length).toBe(8);
    const inter = await isi.pastikanBagianModul(w, TOKEN, 9614, 2, true);
    expect(inter.name).toMatch(/^Module 2 · /);
    expect(dunia.bagian.length).toBe(9);
    // the rename went to the AJAX service as JSON
    const r = dunia.ajax.find((x) => x.metode === "core_update_inplace_editable")!;
    expect(r.jenis).toBe("application/json");
    expect(r.args).toMatchObject({ component: "format_topics", itemtype: "sectionname" });
  });

  it("reads the sesskey again when the stored one went stale", async () => {
    const w = sesi();
    await isi.pastikanBagianModul(w, TOKEN, 9614, 1, false);
    dunia.kunci = "SESSKEY9";
    await web.tampilBagian(w, 9614, dunia.bagian[7].id, false);
    expect(dunia.bagian[7].visible).toBe(0);
    await web.tambahBagian(w, 9614);
    expect(dunia.bagian.length).toBe(9);
  });

  it("reads the sesskey again when Moodle refuses it as one object", async () => {
    const w = sesi();
    await isi.pastikanBagianModul(w, TOKEN, 9614, 1, false);
    dunia.kunci = "SESSKEY9";
    dunia.galatObjek = true;
    await web.tampilBagian(w, 9614, dunia.bagian[7].id, false);
    expect(dunia.bagian[7].visible).toBe(0);
  });

  it("puts a File in a section from a draft area, opening in the browser", async () => {
    const w = sesi();
    const b = await isi.pastikanBagianModul(w, TOKEN, 9614, 4, false);
    const cmid = await web.buatBerkas(w, 9614, b.section, {
      nama: "Handbook Modul 4 (PDF)",
      draf: 7001,
      teks: "<p>Bab Modul 4.</p>",
    });
    const cm = dunia.bagian[b.section].cms.find((x) => x.id === cmid) as Cm & {
      isi: URLSearchParams;
    };
    expect(cm.name).toBe("Handbook Modul 4 (PDF)");
    expect(cm.isi.get("files")).toBe("7001");
    expect(cm.isi.get("display")).toBe("5");
    expect(cm.isi.get("section")).toBe(String(b.section));
    expect(cm.isi.has("coursecontentnotification")).toBe(false);
  });

  it("moves TP Modul 1 into Module 1's section, then moves, hides and deletes sections", async () => {
    const w = sesi();
    const b1 = await isi.pastikanBagianModul(w, TOKEN, 9614, 1, false);
    const b2 = await isi.pastikanBagianModul(w, TOKEN, 9614, 2, false);
    await web.pindahIsi(w, 9614, [842415], b1.id);
    expect(dunia.bagian[0].cms.map((c) => c.id)).not.toContain(842415);
    expect(dunia.bagian[7].cms.map((c) => c.id)).toEqual([842415]);

    await web.pindahBagian(w, 9614, b1.id, b2.id);
    expect(nama().slice(7)).toEqual([isi.namaBagianModul(2, false), isi.namaBagianModul(1, false)]);
    await web.tampilBagian(w, 9614, b2.id, false);
    expect(dunia.bagian[7].visible).toBe(0);
    await web.tampilBagian(w, 9614, b2.id, true);
    expect(dunia.bagian[7].visible).toBe(1);

    await web.namaiIsi(w, 9614, 842415, "TP Modul 1 (Reguler)");
    expect(dunia.bagian[8].cms[0].name).toBe("TP Modul 1 (Reguler)");

    await web.hapusBagian(w, b2.id);
    expect(nama()).not.toContain(isi.namaBagianModul(2, false));
    expect(dunia.bagian.length).toBe(8);
  });

  it("names an empty unnamed section left by a cut-off try instead of adding one", async () => {
    // live 2026-10-15: "Add section" went through, the reply never came
    dunia.bagian.push({ id: ++dunia.idBagian, name: "New section", visible: 1, cms: [] });
    const b = await isi.pastikanBagianModul(sesi(), TOKEN, 9614, 1, false);
    expect(dunia.bagian.length).toBe(8);
    expect(b.id).toBe(dunia.idBagian);
    expect(nama().at(-1)).toBe(isi.namaBagianModul(1, false));
    // a campus section, or one that holds something, is never taken
    expect(isi.namaBawaan("Topik 7")).toBe(true);
    expect(isi.namaBawaan("FINISH")).toBe(false);
    dunia.bagian.push({
      id: ++dunia.idBagian,
      name: "New section",
      visible: 1,
      cms: [{ id: 1, name: "x", modname: "label", visible: 1 }],
    });
    await isi.pastikanBagianModul(sesi(), TOKEN, 9614, 2, false);
    expect(dunia.bagian.length).toBe(10);
  });

  it("says what Moodle refused", async () => {
    await expect(
      sesi().ajax(9614, "core_courseformat_update_course", { action: "nope", ids: [] }),
    ).rejects.toMatchObject({ kode: "lms_ajax_ditolak" });
  });
});

describe("module links written before the site moved", () => {
  const LAMA = "https://iris-praktikum-jurnal.vercel.app/modules/2";
  const BARU = "https://irisiotlab.com/modules/2";
  const pasang = (externalurl: string) => {
    dunia.bagian.push({
      id: ++dunia.idBagian,
      name: "Modul 2 · Wi-Fi",
      visible: 1,
      cms: [
        {
          id: 850101,
          name: "Modul 2 di IRIS (handbook, slide, jurnal)",
          modname: "url",
          visible: 1,
          externalurl,
          intro: "<p>Terbuka untuk semua</p>",
        },
        { id: 850102, name: "Evaluasi Materi 1", modname: "quiz", visible: 1 },
      ],
    });
  };

  it("finds Module m's IRIS link only while it points elsewhere", async () => {
    pasang(LAMA);
    const { isiKursus, alamatTautan } = await import("../lms-menu");
    const bacaan = await isiKursus(TOKEN, 9614);
    const alamat = await alamatTautan(TOKEN, [9614]);
    expect(alamat.get(850101)).toBe(LAMA);
    expect(isi.tautanLama(bacaan, 2, alamat, BARU)?.id).toBe(850101);
    expect(isi.tautanLama(bacaan, 2, alamat, LAMA)).toBeNull();
    // Another module's section, or an address IRIS could not read, is left alone
    expect(isi.tautanLama(bacaan, 1, alamat, BARU)).toBeNull();
    expect(isi.tautanLama(bacaan, 2, new Map(), BARU)).toBeNull();
  });

  it("points the link at the new address in place, its name and text kept", async () => {
    pasang(LAMA);
    const jumlah = dunia.bagian.flatMap((b) => b.cms).length;
    await web.ubahTautan(sesi(), 850101, BARU);
    const c = cariCm(850101)!;
    expect(c.b.cms[c.i]).toMatchObject({
      externalurl: BARU,
      name: "Modul 2 di IRIS (handbook, slide, jurnal)",
      intro: "<p>Terbuka untuk semua</p>",
    });
    expect(dunia.bagian.flatMap((b) => b.cms)).toHaveLength(jumlah);
  });
});

describe("merging the classes into one page", () => {
  const kelas = [
    { id: 1, label: "REG-01", kelas: "reguler" as const },
    { id: 2, label: "REG-09", kelas: "reguler" as const },
    { id: 3, label: "REG-01-INT", kelas: "inter" as const },
  ];
  const cm = (id: number, name: string, modname: string, visible = 1) => ({
    id,
    name,
    modname,
    visible,
  });
  const k3 = (tp: boolean) => ({
    id: 10,
    section: 0,
    name: "KESELAMATAN, KESEHATAN, KERJA / [K3] di LABORATORIUM",
    modules: [
      cm(1, "Evaluasi Materi 1", "quiz"),
      cm(2, "Announcements", "forum"),
      ...(tp ? [cm(3, "TP Modul 1", "assign")] : []),
    ],
  });
  const m1 = (inter: boolean, isi: ReturnType<typeof cm>[]) => ({
    id: 20,
    section: 7,
    name: inter ? "Module 1 · Bluetooth Low Energy" : "Modul 1 · Bluetooth Low Energy",
    visible: 1,
    modules: isi,
  });

  it("marks what a class lacks, by role in both languages", () => {
    const bacaan = new Map([
      [
        1,
        [
          k3(false),
          m1(false, [
            cm(4, "Modul 1 di IRIS (handbook, slide, jurnal)", "url"),
            cm(5, "Handbook Modul 1 (PDF)", "resource"),
            cm(3, "TP Modul 1", "assign"),
          ]),
        ],
      ],
      [2, [k3(true), m1(false, [cm(4, "Modul 1 di IRIS (handbook, slide, jurnal)", "url", 0)])]],
      [
        3,
        [
          k3(false),
          m1(true, [
            cm(4, "Module 1 in IRIS (handbook, slides, journal)", "url"),
            cm(5, "Module 1 handbook (PDF)", "resource"),
            cm(3, "TP Modul 1", "assign"),
          ]),
        ],
      ],
    ]);
    const g = isi.gabungIsi(kelas, bacaan);
    expect(g.bagian.map((b) => b.kunci)).toEqual([
      "k:keselamatan, kesehatan, kerja / [k3] di laboratorium",
      "m1",
    ]);
    const [kampus, mod] = g.bagian;
    expect(kampus.asal).toBe("kampus");
    expect(kampus.isi.find((x) => x.kunci === "assign:tp modul 1")).toMatchObject({
      ada: 1,
      kurang: ["REG-01", "REG-01-INT"],
    });
    expect(mod).toMatchObject({ asal: "iris", modul: 1, ada: 3, kurang: [] });
    expect(mod.nama).toEqual({
      id: "Modul 1 · Bluetooth Low Energy",
      en: "Module 1 · Bluetooth Low Energy",
    });
    expect(mod.isi.map((x) => [x.kunci, x.ada, x.sembunyi])).toEqual([
      ["tautan", 3, 1],
      ["pdf", 2, 0],
      ["tp", 2, 0],
    ]);
    expect(mod.isi.find((x) => x.kunci === "pdf")!.kurang).toEqual(["REG-09"]);
    expect(g.modul[0]).toEqual({ modul: 1, bagian: 3, tautan: 3, pdf: 2, tp: 2, tpLuar: 1 });
    expect(g.modul[1]).toMatchObject({ bagian: 0, tp: 0, tpLuar: 0 });
  });

  it("keeps a class's own extra section in its place and counts unread classes out", () => {
    const ekstra = { id: 30, section: 1, name: "Tujuan", modules: [] };
    const bacaan = new Map([
      [1, [k3(false), m1(false, [])]],
      [2, [k3(false), ekstra, m1(false, [])]],
    ]);
    const g = isi.gabungIsi(kelas, bacaan);
    expect(g.bagian.map((b) => b.kunci)).toEqual([
      "k:keselamatan, kesehatan, kerja / [k3] di laboratorium",
      "k:tujuan",
      "m1",
    ]);
    // REG-01-INT was not read: it is in no count
    expect(g.bagian[1].kurang).toEqual(["REG-01"]);
    expect(g.bagian[2].ada).toBe(2);
  });

  it("gives a second item alike its own key and finds it again", () => {
    const b = {
      id: 1,
      section: 0,
      name: "Tujuan",
      modules: [cm(1, "Catatan", "label"), cm(2, " catatan ", "label")],
    };
    expect(isi.kunciIsiBagian(b)).toEqual(["label:catatan", "label:catatan#2"]);
    expect(isi.cariIsi(b, "label:catatan#2")?.id).toBe(2);
    expect(isi.cariTp([b], 1)).toBeNull();
  });
});
