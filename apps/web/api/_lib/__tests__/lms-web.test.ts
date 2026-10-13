/**
 * IRIS's LMS web session (lms-web.ts): the Moodle form read from the real
 * pages recorded on 2026-10-13, and the whole flow (autologin, a lapsed
 * session, make, change, attach the PDF, delete) against a small fake LMS.
 */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

let web: typeof import("../lms-web");
let lms: typeof import("../lms");

/* ------------------------------------------------------------ fake LMS */

interface Tugas {
  cmid: number;
  course: number;
  isi: URLSearchParams;
}
const dunia = {
  sesi: new Set<string>(),
  kunci: new Map<string, number>(),
  kunciDiminta: 0,
  tugas: new Map<number, Tugas>(),
  cmid: 900,
  /** the recorded forms name cmid 842415: the one last opened stands in */
  dibuka: 0,
  /** draft item id -> the uploaded file's name and size */
  draf: new Map<number, { nama: string; ukuran: number; jenis: string }>(),
};
const ADD = fx("lms-modedit-add.html");
const UPDATE = fx("lms-modedit-update.html");
const HAPUS = fx("lms-mod-delete.html");

let server: Server;

function sesiDari(cookie: string | undefined): string | null {
  const m = (cookie ?? "").match(/MoodleSessionlms=([a-z0-9]+)/);
  return m && dunia.sesi.has(m[1]) ? m[1] : null;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const potong: Buffer[] = [];
    req.on("data", (c: Buffer) => potong.push(c));
    req.on("end", async () => {
      const mentah = Buffer.concat(potong);
      const body = mentah.toString("utf8");
      const f = new URLSearchParams(body);
      if (u.pathname === "/webservice/upload.php") {
        res.setHeader("content-type", "application/json");
        const fd = await new Response(mentah, {
          headers: { "content-type": req.headers["content-type"] ?? "" },
        }).formData();
        if (fd.get("token") !== "t".repeat(32))
          return res.end(JSON.stringify({ error: "Invalid token", errorcode: "invalidtoken" }));
        const file = fd.get("file_1") as File;
        const itemid = 7000 + dunia.draf.size;
        dunia.draf.set(itemid, { nama: file.name, ukuran: file.size, jenis: file.type });
        return res.end(
          JSON.stringify([{ filearea: fd.get("filearea"), filename: file.name, itemid }]),
        );
      }
      const kirim = (status: number, isi: string, h: Record<string, string | string[]> = {}) => {
        res.writeHead(status, { "content-type": "text/html", ...h });
        res.end(isi);
      };
      if (u.pathname === "/webservice/rest/server.php") {
        res.setHeader("content-type", "application/json");
        if (f.get("wsfunction") === "tool_mobile_get_autologin_key") {
          if (!/MoodleMobile/.test(req.headers["user-agent"] ?? ""))
            return res.end(
              JSON.stringify({ exception: "x", errorcode: "apprequired", message: "app only" }),
            );
          if (f.get("privatetoken") !== "p".repeat(64))
            return res.end(
              JSON.stringify({ exception: "x", errorcode: "invalidprivatetoken", message: "bad" }),
            );
          dunia.kunciDiminta++;
          const key = `k${dunia.kunciDiminta}`;
          dunia.kunci.set(key, 74004);
          return res.end(
            JSON.stringify({
              key,
              autologinurl: "https://lms.example/admin/tool/mobile/autologin.php",
            }),
          );
        }
        return res.end("{}");
      }
      if (u.pathname === "/admin/tool/mobile/autologin.php") {
        const key = u.searchParams.get("key") ?? "";
        if (dunia.kunci.get(key) !== Number(u.searchParams.get("userid")))
          return kirim(303, "", { location: "/login/index.php" });
        dunia.kunci.delete(key);
        const s = Math.random().toString(36).slice(2);
        dunia.sesi.add(s);
        return kirim(303, "", {
          location: u.searchParams.get("urltogo") ?? "/",
          "set-cookie": [`MoodleSessionlms=${s}; path=/; secure; HttpOnly`],
        });
      }
      if (!sesiDari(req.headers.cookie)) return kirim(303, "", { location: "/login/index.php" });
      if (u.pathname === "/course/modedit.php" && req.method === "GET") {
        if (u.searchParams.get("add")) return kirim(200, ADD);
        const t = dunia.tugas.get(Number(u.searchParams.get("update")));
        if (t) dunia.dibuka = t.cmid;
        return t ? kirim(200, UPDATE) : kirim(404, "no");
      }
      if (u.pathname === "/course/modedit.php") {
        if (f.get("sesskey") !== "SESSKEY0") return kirim(200, "<p>sesskey</p>");
        if (!f.get("name"))
          return kirim(200, '<div class="form-control-feedback invalid-feedback">Required</div>');
        if (f.get("add") === "assign") {
          const cmid = ++dunia.cmid;
          dunia.tugas.set(cmid, { cmid, course: Number(f.get("course")), isi: f });
          const ke = f.has("submitbutton")
            ? `/mod/assign/view.php?id=${cmid}`
            : `/course/view.php?id=${f.get("course")}`;
          return kirim(303, "", { location: ke });
        }
        const t = dunia.tugas.get(f.get("update") === "842415" ? dunia.dibuka : 0);
        if (!t) return kirim(404, "no");
        t.isi = f;
        return kirim(303, "", { location: `/course/view.php?id=${t.course}` });
      }
      if (u.pathname === "/course/mod.php" && req.method === "GET") {
        dunia.dibuka = Number(u.searchParams.get("delete"));
        return kirim(200, HAPUS);
      }
      if (u.pathname === "/course/mod.php") {
        if (f.get("confirm") !== "1" || f.get("sesskey") !== "SESSKEY0")
          return kirim(200, "<p>?</p>");
        if (f.get("delete") === "842415") dunia.tugas.delete(dunia.dibuka);
        return kirim(303, "", { location: "/course/view.php?id=9614" });
      }
      return kirim(404, "no");
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const a = server.address();
  process.env.LMS_URL = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  web = await import("../lms-web");
  lms = await import("../lms");
});

afterAll(() => server?.close());

function penyimpan(awal: string | null = null) {
  const s = { kue: awal, tulis: 0 };
  return {
    s,
    simpan: {
      baca: async () => s.kue,
      tulis: async (k: string | null) => {
        s.kue = k;
        s.tulis++;
      },
    },
  };
}

const RENCANA = {
  nama: "TP Modul 1",
  buka: "2026-10-14T11:00:00.000Z",
  tutup: "2026-10-17T11:00:00.000Z",
  deskripsi: "<p>Tugas Pendahuluan Modul 1 &amp; kawan.</p>",
  tampil: true,
};

/* ---------------------------------------------------------------- tests */

describe("the recorded assignment form", () => {
  it("reads the add form as a browser would", () => {
    const f = web.bacaForm(ADD, /modedit\.php/)!;
    expect(f).not.toBeNull();
    const nilai = (n: string) => f.filter((x) => x.nama === n);
    expect(nilai("course")[0].nilai).toBe("4930");
    expect(nilai("modulename")[0].nilai).toBe("assign");
    expect(nilai("sesskey")[0].nilai).toBe("SESSKEY0");
    // a multi-line select and its selected option
    expect(nilai("grade[modgrade_type]")[0].pilih).toEqual(["point"]);
    // the checkbox and its hidden "0" twin
    expect(nilai("showdescription").map((x) => x.jenis)).toEqual(["hidden", "checkbox"]);
    // the textarea in a script after the form is not a field
    expect(f.filter((x) => x.jenis === "textarea").map((x) => x.nama)).toEqual([
      "introeditor[text]",
      "activityeditor[text]",
      "availabilityconditionsjson",
    ]);
  });

  it("changes only IRIS's fields and sends the rest unchanged", () => {
    const f = web.bacaForm(ADD, /modedit\.php/)!;
    const body = new URLSearchParams(
      web.bentukForm(
        web.ubahForm(f, {
          name: "TP Modul 1",
          "duedate[enabled]": true,
          "duedate[day]": "17",
          "cutoffdate[enabled]": false,
          showdescription: true,
          visible: "0",
        }),
        "submitbutton",
      ),
    );
    expect(body.get("name")).toBe("TP Modul 1");
    expect(body.get("duedate[enabled]")).toBe("1");
    expect(body.get("duedate[day]")).toBe("17");
    expect(body.has("cutoffdate[enabled]")).toBe(false);
    // the hidden 0 then the ticked 1: PHP keeps the last
    expect(body.getAll("showdescription")).toEqual(["0", "1"]);
    expect(body.get("visible")).toBe("0");
    expect(body.get("submitbutton")).toBeTruthy();
    expect(body.has("submitbutton2")).toBe(false);
    expect(body.has("cancel")).toBe(false);
    expect(body.get("_qf__mod_assign_mod_form")).toBe("1");
  });

  it("reads the update form's saved values", () => {
    const f = web.bacaForm(UPDATE, /modedit\.php/)!;
    const v = (n: string) => f.find((x) => x.nama === n && x.jenis !== "hidden")?.nilai;
    expect(f.find((x) => x.nama === "update")?.nilai).toBe("842415");
    expect(v("name")).toBe("TP Modul 1");
    expect(f.find((x) => x.nama === "introeditor[text]")?.nilai).toMatch(
      /^<p>Tugas Pendahuluan Modul 1\./,
    );
    expect(f.find((x) => x.nama === "allowsubmissionsfromdate[day]")?.pilih).toEqual(["13"]);
    expect(f.find((x) => x.nama === "allowsubmissionsfromdate[enabled]")?.centang).toBe(true);
    expect(f.find((x) => x.nama === "cutoffdate[enabled]")?.centang).toBe(false);
  });

  it("finds the delete confirmation's Yes form, not the edit switch or No", () => {
    const f = web.bacaForm(HAPUS, /\/course\/mod\.php/)!;
    expect(Object.fromEntries(f.map((x) => [x.nama, x.nilai]))).toEqual({
      confirm: "1",
      delete: "842415",
      sesskey: "SESSKEY0",
      sr: "0",
    });
  });

  it("writes dates in WIB", () => {
    expect(web.tanggalWib("2026-10-14T11:00:00.000Z")).toEqual({
      day: "14",
      month: "10",
      year: "2026",
      hour: "18",
      minute: "0",
    });
    expect(web.tanggalWib("2026-10-31T17:30:00.000Z").day).toBe("1");
  });

  it("reads Moodle's refusals under fields", () => {
    expect(
      web.galatForm(
        '<div class="form-control-feedback invalid-feedback" id="x"> Wajib &amp; diisi </div><div class="invalid-feedback"></div>',
      ),
    ).toEqual(["Wajib & diisi"]);
  });
});

describe("the web session against a fake LMS", () => {
  it("signs in through the app's autologin, makes, changes and deletes", async () => {
    const { s, simpan } = penyimpan();
    const w = new web.WebLms("t".repeat(32), "p".repeat(64), 74004, simpan);
    const cmid = await web.buatTugas(w, 4931, RENCANA);
    expect(cmid).toBe(dunia.cmid);
    expect(dunia.kunciDiminta).toBe(1);
    expect(s.kue).toMatch(/^MoodleSessionlms=/);
    const t = dunia.tugas.get(cmid!)!;
    expect(t.course).toBe(4930); // the recorded form's own course
    expect(t.isi.get("name")).toBe("TP Modul 1");
    expect(t.isi.get("introeditor[text]")).toBe(RENCANA.deskripsi);
    expect(t.isi.get("allowsubmissionsfromdate[hour]")).toBe("18");
    expect(t.isi.get("duedate[day]")).toBe("17");
    expect(t.isi.has("cutoffdate[enabled]")).toBe(false);
    expect(t.isi.get("assignsubmission_file_enabled")).toBe("1");

    await web.ubahTugas(w, cmid!, { ...RENCANA, tutup: "2026-10-18T11:00:00.000Z", tampil: false });
    expect(dunia.tugas.get(cmid!)!.isi.get("duedate[day]")).toBe("18");
    expect(dunia.tugas.get(cmid!)!.isi.get("visible")).toBe("0");
    expect(dunia.kunciDiminta).toBe(1); // the same session

    await web.hapusTugas(w, cmid!);
    expect(dunia.tugas.has(cmid!)).toBe(false);
  });

  it("reuses a stored session, and starts a new one when it lapsed", async () => {
    const { s, simpan } = penyimpan();
    await web.buatTugas(new web.WebLms("t".repeat(32), "p".repeat(64), 74004, simpan), 1, RENCANA);
    const sebelum = dunia.kunciDiminta;
    await web.buatTugas(new web.WebLms("t".repeat(32), "p".repeat(64), 74004, simpan), 1, RENCANA);
    expect(dunia.kunciDiminta).toBe(sebelum);
    dunia.sesi.clear();
    await web.buatTugas(new web.WebLms("t".repeat(32), "p".repeat(64), 74004, simpan), 1, RENCANA);
    expect(dunia.kunciDiminta).toBe(sebelum + 1);
    expect(s.kue).toMatch(/^MoodleSessionlms=/);
  });

  it("says why when the private key is refused, or Moodle refuses the form", async () => {
    const w = new web.WebLms("t".repeat(32), "q".repeat(64), 74004, penyimpan().simpan);
    await expect(web.buatTugas(w, 1, RENCANA)).rejects.toMatchObject({
      kode: "lms_invalidprivatetoken",
    });
    const ok = new web.WebLms("t".repeat(32), "p".repeat(64), 74004, penyimpan().simpan);
    await expect(web.buatTugas(ok, 1, { ...RENCANA, nama: "" })).rejects.toMatchObject({
      kode: "lms_form_ditolak",
      message: "Required",
    });
  });

  it("uploads the PDF to a draft area and names it in the form", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 tp");
    const itemid = await lms.unggahDraf("t".repeat(32), "TP_Modul-1_Reguler.pdf", pdf);
    expect(dunia.draf.get(itemid)).toEqual({
      nama: "TP_Modul-1_Reguler.pdf",
      ukuran: pdf.length,
      jenis: "application/pdf",
    });
    await expect(lms.unggahDraf("x".repeat(32), "a.pdf", pdf)).rejects.toMatchObject({
      kode: "token_ditolak",
    });

    const w = new web.WebLms("t".repeat(32), "p".repeat(64), 74004, penyimpan().simpan);
    const cmid = (await web.buatTugas(w, 1, { ...RENCANA, lampiran: itemid }))!;
    expect(dunia.tugas.get(cmid)!.isi.get("introattachments")).toBe(String(itemid));
    // left out, the form's own draft stays (the recorded add form's)
    const tanpa = (await web.buatTugas(w, 1, RENCANA))!;
    expect(dunia.tugas.get(tanpa)!.isi.get("introattachments")).not.toBe(String(itemid));

    // lampir changes only the attachments and sends no notification; the
    // rest is the recorded update form's own
    await web.lampirTugas(w, cmid, itemid + 1);
    const isi = dunia.tugas.get(cmid)!.isi;
    expect(isi.get("introattachments")).toBe(String(itemid + 1));
    expect(isi.has("coursecontentnotification")).toBe(false);
    expect(isi.get("name")).toBe("TP Modul 1");
    expect(isi.get("introeditor[text]")).toMatch(/^<p>Tugas Pendahuluan Modul 1\./);
  });

  it("a deleted assignment's form answers lms_tidak_ada", async () => {
    const w = new web.WebLms("t".repeat(32), "p".repeat(64), 74004, penyimpan().simpan);
    await expect(web.ubahTugas(w, 12345, RENCANA)).rejects.toMatchObject({ kode: "lms_tidak_ada" });
  });
});
