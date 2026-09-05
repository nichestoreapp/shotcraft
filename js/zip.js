// Minimal ZIP writer (store method, no compression).
// PNG data is already compressed, so storing it costs nothing and keeps this
// dependency-free.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { time, date };
}

class Writer {
  constructor() { this.chunks = []; this.length = 0; }
  push(u8) { this.chunks.push(u8); this.length += u8.length; }
  u16(v) { this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff])); }
  u32(v) { this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])); }
}

/**
 * @param {{name: string, data: Uint8Array}[]} files
 * @returns {Blob}
 */
export function makeZip(files) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const w = new Writer();
  const entries = [];

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const crc = crc32(file.data);
    const offset = w.length;

    w.u32(0x04034b50);
    w.u16(20);      // version needed
    w.u16(0x0800);  // UTF-8 filename
    w.u16(0);       // stored
    w.u16(time); w.u16(date);
    w.u32(crc);
    w.u32(file.data.length);
    w.u32(file.data.length);
    w.u16(nameBytes.length);
    w.u16(0);
    w.push(nameBytes);
    w.push(file.data);

    entries.push({ nameBytes, crc, size: file.data.length, offset });
  }

  const cdStart = w.length;
  for (const e of entries) {
    w.u32(0x02014b50);
    w.u16(20); w.u16(20);
    w.u16(0x0800);
    w.u16(0);
    w.u16(time); w.u16(date);
    w.u32(e.crc);
    w.u32(e.size); w.u32(e.size);
    w.u16(e.nameBytes.length);
    w.u16(0); w.u16(0); w.u16(0); w.u16(0);
    w.u32(0);
    w.u32(e.offset);
    w.push(e.nameBytes);
  }
  const cdSize = w.length - cdStart;

  w.u32(0x06054b50);
  w.u16(0); w.u16(0);
  w.u16(entries.length); w.u16(entries.length);
  w.u32(cdSize); w.u32(cdStart);
  w.u16(0);

  return new Blob(w.chunks, { type: 'application/zip' });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
