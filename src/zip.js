// A small ZIP writer, so transcripts can be downloaded in one file without a dependency (PKWARE APPNOTE 6.3):
// a local header and the data for each file, then the central directory and its end record. Files are deflated
// (zlib), or stored when that wouldn't make them smaller; names are UTF-8 (flag bit 11), so accents open right on
// Windows, macOS and Linux. Built in memory, up to a size limit: no ZIP64, so never past 4 GB or 65,535 files.
import zlib from 'node:zlib';

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

/** CRC-32 (the one ZIP and gzip use) of a buffer, as an unsigned number. */
export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** The archive would be bigger than its limit (or hold more files than a ZIP can). */
export class ZipTooLarge extends Error {}

const UTF8 = 0x0800; // general purpose flag bit 11: file names are UTF-8
const MAX_FILES = 0xffff;

/** MS-DOS date and time (local time, 2-second steps; ZIP can't go before 1980). */
function dosTime(d) {
  const y = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A file or folder name that opens on Windows, macOS and Linux: no / \ : * ? " < > | or control characters, no
 * leading dot (hidden, or "..") or trailing dot or space, not a reserved Windows name, at most `max` characters. */
export function safeName(s, fallback = '_', max = 80) {
  const clean = (x) => x.replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
  let n = clean(String(s ?? '').normalize('NFC').replace(/[\p{Cc}<>:"/\\|?*]/gu, ' '));
  n = clean([...n].slice(0, max).join(''));
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = `_${n}`;
  return n || fallback;
}

export class Zip {
  /** @param {{ maxBytes?: number }} [o] the largest archive to build; past it, add() throws ZipTooLarge */
  constructor({ maxBytes = 0xffffffff } = {}) {
    this.maxBytes = Math.min(maxBytes, 0xffffffff);
    this.parts = []; // local headers and file data, in order
    this.central = []; // central directory entries
    this.offset = 0; // bytes in parts
    this.centralSize = 0;
    this.count = 0;
  }

  /** Add a file. `name` uses / between folders; `data` is a string (written as UTF-8) or a Buffer. */
  add(name, data, mtime = new Date()) {
    if (this.count >= MAX_FILES) throw new ZipTooLarge(`more than ${MAX_FILES} files`);
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const deflated = zlib.deflateRawSync(raw);
    const method = deflated.length < raw.length ? 8 : 0; // 8 = deflate, 0 = stored
    const body = method ? deflated : raw;
    const crc = crc32(raw);
    const { time, date } = dosTime(mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract: 2.0 (deflate, folders)
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // no extra field
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); // central directory header signature
    entry.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0 (so the permissions below are read)
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(UTF8, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    // extra field, comment, disk number and internal attributes: 0
    entry.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes: a regular file, rw-r--r--
    entry.writeUInt32LE(this.offset, 42); // where its local header starts
    const fileBytes = local.length + nameBuf.length + body.length, entryBytes = entry.length + nameBuf.length;
    if (this.offset + fileBytes + this.centralSize + entryBytes + 22 > this.maxBytes) throw new ZipTooLarge(`over ${this.maxBytes} bytes`);
    this.parts.push(local, nameBuf, body);
    this.central.push(entry, nameBuf);
    this.offset += fileBytes;
    this.centralSize += entryBytes;
    this.count++;
  }

  /** The finished archive. */
  toBuffer() {
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
    // this disk and the central directory's disk: 0
    end.writeUInt16LE(this.count, 8); // entries on this disk
    end.writeUInt16LE(this.count, 10); // entries in all
    end.writeUInt32LE(this.centralSize, 12);
    end.writeUInt32LE(this.offset, 16); // where the central directory starts
    // no comment
    return Buffer.concat([...this.parts, ...this.central, end]);
  }
}
