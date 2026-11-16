// MediaRecorder writes webm without a Duration, so players cannot show length or seek well. This adds Segment/Info/Duration
// (computed from the last block's timestamp + one frame). Usage: node tools/webmdur.mjs <file.webm> [...more]   (rewrites in place)
import { readFileSync, writeFileSync } from 'node:fs';

const ID = { EBML: 0x1A45DFA3, Segment: 0x18538067, Info: 0x1549A966, Duration: 0x4489, TimecodeScale: 0x2AD7B1, Cluster: 0x1F43B675, Timecode: 0xE7, SimpleBlock: 0xA3, BlockGroup: 0xA0, Block: 0xA1 };
const TOP = new Set([0x1F43B675, 0x1C53BB6B, 0x1254C367, 0x1549A966, 0x1654AE6B, 0x114D9B74, 0x1941A469, 0x1043A770]);   // Segment children

function readId(b, p) { const x = b[p]; const len = x >= 0x80 ? 1 : x >= 0x40 ? 2 : x >= 0x20 ? 3 : 4; let v = 0; for (let i = 0; i < len; i++) v = v * 256 + b[p + i]; return { v, len }; }
function readSize(b, p) { const x = b[p]; let len = 1, m = 0x80; while (len <= 8 && !(x & m)) { len++; m >>= 1; } let v = x & (m - 1), unknown = v === m - 1;
  for (let i = 1; i < len; i++) { v = v * 256 + b[p + i]; if (b[p + i] !== 0xff) unknown = false; } return { v, len, unknown }; }
function sizeVint(n) { for (let len = 1; len <= 8; len++) { if (n < 2 ** (7 * len) - 1) { const out = Buffer.alloc(len); let v = n; for (let i = len - 1; i >= 0; i--) { out[i] = v & 0xff; v = Math.floor(v / 256); } out[0] |= 1 << (8 - len); return out; } } throw new Error('size'); }

export function fixDuration(buf) {
  const b = buf; let p = 0;
  const e0 = readId(b, p); if (e0.v !== ID.EBML) throw new Error('not webm'); const s0 = readSize(b, p + e0.len); p += e0.len + s0.len + s0.v;
  const seg = readId(b, p); if (seg.v !== ID.Segment) throw new Error('no segment'); const ss = readSize(b, p + seg.len); const segData = p + seg.len + ss.len, segEnd = ss.unknown ? b.length : segData + ss.v;
  let info = null, scale = 1e6, lastMs = 0, frameMs = 0, prevMs = -1;
  // walk the segment's children; clusters may have unknown size (live recording): they end at the next top-level id
  p = segData;
  while (p < segEnd) {
    const id = readId(b, p), sz = readSize(b, p + id.len), data = p + id.len + sz.len;
    if (id.v === ID.Info) { info = { start: p, idLen: id.len, sizeLen: sz.len, data, size: sz.v };
      let q = data; while (q < data + sz.v) { const c = readId(b, q), cs = readSize(b, q + c.len), cd = q + c.len + cs.len; if (c.v === ID.TimecodeScale) { let v = 0; for (let i = 0; i < cs.v; i++) v = v * 256 + b[cd + i]; scale = v; } if (c.v === ID.Duration) return { buf, already: true }; q = cd + cs.v; } }
    if (id.v === ID.Cluster) {
      let q = data, ctc = 0; const end = sz.unknown ? segEnd : data + sz.v;
      while (q < end) { const c = readId(b, q); if (sz.unknown && TOP.has(c.v)) break; const cs = readSize(b, q + c.len), cd = q + c.len + cs.len;
        if (c.v === ID.Timecode) { let v = 0; for (let i = 0; i < cs.v; i++) v = v * 256 + b[cd + i]; ctc = v; }
        const block = bd => { const tn = readSize(b, bd); const rel = b.readInt16BE(bd + tn.len); const ms = (ctc + rel) * scale / 1e6; if (prevMs >= 0 && ms > prevMs) frameMs = ms - prevMs; prevMs = ms; lastMs = Math.max(lastMs, ms); };
        if (c.v === ID.SimpleBlock) block(cd);
        if (c.v === ID.BlockGroup) { let r = cd; while (r < cd + cs.v) { const g = readId(b, r), gs = readSize(b, r + g.len); if (g.v === ID.Block) block(r + g.len + gs.len); r += g.len + gs.len + gs.v; } }
        q = cd + cs.v; }
      p = q; continue;
    }
    p = data + sz.v;
  }
  if (!info) throw new Error('no info');
  const durUnits = (lastMs + (frameMs || 33)) * 1e6 / scale;
  const durEl = Buffer.alloc(2 + 1 + 8); durEl.writeUInt16BE(ID.Duration, 0); durEl[2] = 0x88; durEl.writeDoubleBE(durUnits, 3);
  const newInfoSize = info.size + durEl.length, newSizeV = sizeVint(newInfoSize);
  const head = b.subarray(0, info.start + info.idLen), infoData = b.subarray(info.data, info.data + info.size), rest = b.subarray(info.data + info.size);
  return { buf: Buffer.concat([head, newSizeV, infoData, durEl, rest]), ms: lastMs + (frameMs || 33) };
}

if (process.argv[1] && process.argv[1].endsWith('webmdur.mjs')) {
  for (const f of process.argv.slice(2)) { const r = fixDuration(readFileSync(f)); if (r.already) { console.log(f, 'already has duration'); continue; } writeFileSync(f, r.buf); console.log(f, 'duration', (r.ms / 1000).toFixed(2) + 's'); }
}
