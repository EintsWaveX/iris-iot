/**
 * A store-only ZIP writer for the browser (Phase 13: Unduh Semua for a
 * group's TP files). PDFs are already compressed, so the files go in as
 * they are; no dependency needed for that.
 */

let tabel: Uint32Array | null = null;

function crc32(b: Uint8Array<ArrayBuffer>): number {
  if (!tabel) {
    tabel = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabel[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = tabel[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Each file once, under a unique name, in one .zip Blob. */
export function buatZip(berkas: { nama: string; isi: Uint8Array<ArrayBuffer> }[]): Blob {
  const enc = new TextEncoder();
  const bagian: BlobPart[] = [];
  const pusat: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  const dipakai = new Set<string>();
  for (const f of berkas) {
    let nama = f.nama;
    for (let k = 2; dipakai.has(nama); k++) nama = f.nama.replace(/(\.[^.]*)?$/, ` (${k})$1`);
    dipakai.add(nama);
    const n = enc.encode(nama);
    const crc = crc32(f.isi);
    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034b50, true);
    lokal.setUint16(4, 20, true);
    lokal.setUint16(6, 0x0800, true); // UTF-8 names
    lokal.setUint32(14, crc, true);
    lokal.setUint32(18, f.isi.length, true);
    lokal.setUint32(22, f.isi.length, true);
    lokal.setUint16(26, n.length, true);
    bagian.push(lokal.buffer, n, f.isi);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.isi.length, true);
    c.setUint32(24, f.isi.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    const baris = new Uint8Array(46 + n.length);
    baris.set(new Uint8Array(c.buffer), 0);
    baris.set(n, 46);
    pusat.push(baris);
    offset += 30 + n.length + f.isi.length;
  }
  const besar = pusat.reduce((a, b) => a + b.length, 0);
  const akhir = new DataView(new ArrayBuffer(22));
  akhir.setUint32(0, 0x06054b50, true);
  akhir.setUint16(8, berkas.length, true);
  akhir.setUint16(10, berkas.length, true);
  akhir.setUint32(12, besar, true);
  akhir.setUint32(16, offset, true);
  return new Blob([...bagian, ...pusat, akhir.buffer], { type: "application/zip" });
}

export function simpanBlob(blob: Blob, nama: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
