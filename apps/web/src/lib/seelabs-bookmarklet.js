/*
 * IRIS · Isi SeeLabs, the bookmarklet (Phase 9 Stage 3g). Plain JavaScript,
 * shipped as written: seelabs-helper.ts imports this file as text (?raw)
 * and turns it into the javascript: href. See seelabs-helper.ts for what
 * it does and does not do. It must stay self-contained.
 */
(function () {
  var d = document;
  var ID = "iris-isi-seelabs";
  var lama = d.getElementById(ID);
  if (lama) lama.remove();
  var KOLOM = ["tp", "ta", "d1", "d2", "d3", "d4", "l1", "l2"];
  var T = {
    id: {
      judul: "IRIS · Isi SeeLabs",
      tutup: "Tutup",
      bukan: "Buka form Input Nilai kelompok itu di SeeLabs, lalu klik lagi.",
      tempel: "Tempel isian dari IRIS (Salin untuk Bookmarklet) di sini.",
      isi: "Isi Form",
      salah: "Ini bukan isian dari IRIS. Salin lagi dari IRIS.",
      kelas: "Form ini {0}, isiannya untuk {1}. Tidak ada yang diisi.",
      klp: "Form ini KLP {0}, isiannya untuk KLP {1}. Tidak ada yang diisi.",
      klpLagi: "Buka KLP {0}, lalu klik lagi.",
      hasil: "{0} dari {1} baris cocok lewat NIM. Modul {2} dipilih.",
      kosong: "{0} sel tanpa nilai di IRIS dibiarkan.",
      takAda: "Tidak ada di isian: {0}",
      takDiForm: "Tidak ada di form ini: {0}",
      cek: "Periksa angkanya, lalu tekan Simpan Penilaian sendiri.",
      daftar: "{0} kelompok tersalin. Tempel di Persiapan › Cocokkan KLP.",
      daftarManual: "Salin teks ini, lalu tempel di Persiapan › Cocokkan KLP.",
    },
    en: {
      judul: "IRIS · Isi SeeLabs",
      tutup: "Close",
      bukan: "Open that group's Input Nilai form in SeeLabs, then click again.",
      tempel: "Paste the data from IRIS (Copy for the Bookmarklet) here.",
      isi: "Fill the Form",
      salah: "This isn't data from IRIS. Copy it again in IRIS.",
      kelas: "This form is {0}, the data is for {1}. Nothing was filled.",
      klp: "This form is KLP {0}, the data is for KLP {1}. Nothing was filled.",
      klpLagi: "Open KLP {0}, then click again.",
      hasil: "{0} of {1} rows matched by NIM. Modul {2} picked.",
      kosong: "{0} cells with no score in IRIS were left alone.",
      takAda: "Not in the data: {0}",
      takDiForm: "Not on this form: {0}",
      cek: "Check the numbers, then press Simpan Penilaian yourself.",
      daftar: "{0} groups copied. Paste them in Preparation › Match KLP.",
      daftarManual: "Copy this text, then paste it in Preparation › Match KLP.",
    },
    zh: {
      judul: "IRIS · Isi SeeLabs",
      tutup: "关闭",
      bukan: "在 SeeLabs 打开那个组的 Input Nilai 表单，然后再点一次。",
      tempel: "把 IRIS 里复制的内容（为书签小工具复制）贴在这里。",
      isi: "填写表单",
      salah: "这不是 IRIS 的内容。请在 IRIS 里重新复制。",
      kelas: "这个表单是 {0}，内容是给 {1} 的。什么都没填。",
      klp: "这个表单是 KLP {0}，内容是给 KLP {1} 的。什么都没填。",
      klpLagi: "打开 KLP {0}，然后再点一次。",
      hasil: "{1} 行中有 {0} 行按 NIM 匹配。已选 Modul {2}。",
      kosong: "IRIS 里没有分数的 {0} 个格子保持不变。",
      takAda: "内容里没有：{0}",
      takDiForm: "这个表单里没有：{0}",
      cek: "检查数字，然后自己按 Simpan Penilaian。",
      daftar: "已复制 {0} 个组。贴到课前准备 › 匹配 KLP。",
      daftarManual: "复制这段文字，然后贴到课前准备 › 匹配 KLP。",
    },
  };
  // SeeLabs itself is Indonesian; the payload's own language takes over.
  var bahasa = "id";
  function t(k, a) {
    var s = (T[bahasa] || T.id)[k];
    (a || []).forEach(function (x, i) {
      s = s.split("{" + i + "}").join(String(x));
    });
    return s;
  }
  function el(tag, gaya, teks) {
    var e = d.createElement(tag);
    // Never a submit button, whatever it lands next to.
    if (tag === "button") e.type = "button";
    e.setAttribute("style", gaya);
    if (teks != null) e.textContent = teks;
    return e;
  }
  function panel(nada, baris) {
    var warna = nada === "ok" ? "#15803d" : nada === "buruk" ? "#b91c1c" : "#334155";
    var p = el(
      "div",
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(420px,calc(100vw - 32px));" +
        "background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-top:4px solid " +
        warna +
        ";border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.25);padding:14px 16px;" +
        "font:14px/1.45 system-ui,sans-serif;display:grid;gap:8px",
    );
    p.id = ID;
    p.setAttribute("role", "status");
    p.appendChild(el("b", "font-size:15px", t("judul")));
    baris.forEach(function (x, i) {
      p.appendChild(el("div", i === baris.length - 1 && nada === "ok" ? "color:#475569" : "", x));
    });
    var tutup = el(
      "button",
      "justify-self:end;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit",
      t("tutup"),
    );
    tutup.onclick = function () {
      p.remove();
    };
    p.appendChild(tutup);
    d.body.appendChild(p);
    return p;
  }
  function tandai(e, ok) {
    e.style.outline = "2px solid " + (ok ? "#16a34a" : "#dc2626");
    e.style.outlineOffset = "1px";
  }
  function setNilai(e, v) {
    var proto = e.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var set = Object.getOwnPropertyDescriptor(proto, "value");
    if (set && set.set) set.set.call(e, v);
    else e.value = v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // A NIM is 10 to 15 digits with no digit either side. Read per element,
  // since the text of neighbouring cells or spans can run together.
  function nimSemua(e) {
    var hasil = [];
    var semua = Array.prototype.slice.call(e.querySelectorAll("*"));
    semua.push(e);
    semua.forEach(function (x) {
      if (x.children.length) return;
      ((x.textContent || "").match(/(^|\D)\d{10,15}(?!\d)/g) || []).forEach(function (n) {
        n = n.replace(/\D/g, "");
        if (hasil.indexOf(n) < 0) hasil.push(n);
      });
    });
    return hasil;
  }
  function nimDi(tr) {
    var sel = tr.querySelectorAll("td");
    for (var i = 1; i < sel.length; i++) {
      var n = nimSemua(sel[i]);
      if (n.length) return n[0];
    }
    return null;
  }
  var modulSel = d.querySelector('select[wire\\:model="modul"]');
  /* ---- the group list: copy KLP and NIM pairs */
  if (!modulSel) {
    var grup = [];
    // A group's first row has the "KLP 47" cell (a rowspan over its
    // members); the members follow, one per row.
    d.querySelectorAll("table tbody td").forEach(function (td) {
      var k = (td.textContent || "").match(/^\s*KLP\s*(\d{1,4})\s*$/);
      if (k) {
        grup.push({ klp: k[1], nim: [] });
        return;
      }
      var akhir = grup[grup.length - 1];
      if (!akhir) return;
      nimSemua(td).forEach(function (n) {
        if (akhir.nim.indexOf(n) < 0) akhir.nim.push(n);
      });
    });
    if (!grup.length) {
      panel("info", [t("bukan")]);
      return;
    }
    var pk = d.querySelector('select[wire\\:model\\.live="s_praktikum"]');
    var namaPk = pk && pk.selectedIndex >= 0 ? pk.options[pk.selectedIndex].text : "";
    var salinan =
      "IRIS-KLP/1 " +
      JSON.stringify({
        kelas: /\bINT\s*$/.test(namaPk.trim()) ? "internasional" : "reguler",
        kelompok: grup,
      });
    var manual = function () {
      var p = panel("info", [t("daftarManual")]);
      var ta = el("textarea", "width:100%;min-height:80px;font:12px monospace");
      ta.value = salinan;
      p.insertBefore(ta, p.lastChild);
      ta.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(salinan).then(function () {
        panel("ok", [t("daftar", [grup.length])]);
      }, manual);
    else manual();
    return;
  }
  /* ---- the score form */
  var formulir = modulSel;
  function isi(teks) {
    teks = (teks || "").trim();
    if (teks.indexOf("IRIS-SEELABS/1") !== 0) return false;
    var p;
    try {
      p = JSON.parse(teks.slice("IRIS-SEELABS/1".length));
    } catch (e) {
      return false;
    }
    if (!p || !p.baris) return false;
    bahasa = p.bahasa || bahasa;
    var lama2 = d.getElementById(ID);
    if (lama2) lama2.remove();
    var kepala = (d.body.innerText || "").match(/([^\n|]*)\|\s*Kelompok\s+(\d+)/) || [];
    var namaForm = (kepala[1] || "").trim();
    var klpForm = kepala[2] || "";
    var snap = d.querySelector("[wire\\:snapshot]");
    try {
      var data = JSON.parse((snap && snap.getAttribute("wire:snapshot")) || "{}").data;
      if (data && data.kel != null) klpForm = String(data.kel);
    } catch (e) {
      /* the header is enough */
    }
    var intForm = /\bINT\s*$/.test(namaForm);
    if (namaForm && intForm !== (p.kelas === "internasional")) {
      var nama = function (k) {
        return k ? "Internasional" : "Reguler";
      };
      panel("buruk", [t("kelas", [nama(intForm), nama(!intForm)])]);
      return true;
    }
    if (klpForm && p.klp && p.klp.length && p.klp.indexOf(klpForm) < 0) {
      panel("buruk", [t("klp", [klpForm, p.klp.join(", ")]), t("klpLagi", [p.klp[0]])]);
      return true;
    }
    setNilai(formulir, String(p.modul));
    tandai(formulir, true);
    var data2 = {};
    p.baris.forEach(function (b) {
      data2[b.nim] = b.n;
    });
    var cocok = 0;
    var total = 0;
    var kosong = 0;
    var takAda = [];
    var dipakai = {};
    d.querySelectorAll('input[wire\\:model^="tp."]').forEach(function (tp) {
      var i = (tp.getAttribute("wire:model") || "").split(".")[1];
      var tr = tp.closest("tr");
      if (!tr) return;
      total++;
      var nim = nimDi(tr);
      var n = nim ? data2[nim] : null;
      if (!nim || !n) {
        takAda.push(nim || "?");
        tandai(tr, false);
        return;
      }
      dipakai[nim] = true;
      cocok++;
      KOLOM.forEach(function (k, c) {
        var f = tr.querySelector('input[wire\\:model="' + k + "." + i + '"]');
        if (!f) return;
        if (n[c] == null) {
          kosong++;
          return;
        }
        setNilai(f, String(n[c]));
        tandai(f, true);
      });
    });
    var takDiForm = p.baris
      .map(function (b) {
        return b.nim;
      })
      .filter(function (x) {
        return !dipakai[x];
      });
    var pesan = [t("hasil", [cocok, total, p.modul])];
    if (kosong) pesan.push(t("kosong", [kosong]));
    if (takAda.length) pesan.push(t("takAda", [takAda.join(", ")]));
    if (takDiForm.length) pesan.push(t("takDiForm", [takDiForm.join(", ")]));
    pesan.push(t("cek"));
    panel(cocok && !takAda.length ? "ok" : "buruk", pesan);
    return true;
  }
  function kotakTempel() {
    var p = panel("info", [t("tempel")]);
    var ta = el(
      "textarea",
      "width:100%;min-height:72px;font:12px monospace;border:1px solid #cbd5e1;border-radius:6px;padding:6px",
    );
    var tombol = el(
      "button",
      "border:0;background:#4338ca;color:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit;font-weight:600",
      t("isi"),
    );
    var salah = el("div", "color:#b91c1c;display:none", t("salah"));
    tombol.onclick = function () {
      if (!isi(ta.value)) salah.style.display = "";
    };
    p.insertBefore(ta, p.lastChild);
    p.insertBefore(salah, p.lastChild);
    p.insertBefore(tombol, p.lastChild);
    ta.focus();
  }
  // The paste box shows at once; Chrome may hold the clipboard read behind
  // a permission prompt, and a read that does bring IRIS data replaces it.
  kotakTempel();
  if (navigator.clipboard && navigator.clipboard.readText)
    navigator.clipboard.readText().then(isi, function () {});
})();
