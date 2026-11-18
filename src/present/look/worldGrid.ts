// Each tile stores 8 × 8 rows of 32 voxels. The row masks double as an
// occupancy index for the mesher. Cells stay mutable for in-place painters.
type Cell = { c: number; g: number };
type Tile = { x: number; y: number; z: number; rows: Uint32Array; data: Cell[] };
const tileKey = (x: number, y: number, z: number) => x * 65536 + y * 128 + z;
export class WorldGrid {
  private tiles = new Map<number, Tile>();
  size = 0;
  private tile(x: number, y: number, z: number, create: boolean) {
    const k = tileKey(x, y, z);
    let t = this.tiles.get(k);
    if (!t && create) {
      t = { x, y, z, rows: new Uint32Array(64), data: new Array<Cell>(2048) };
      this.tiles.set(k, t);
    }
    return t;
  }
  get(k: number) {
    const x = Math.floor(k / 1048576) - 512,
      y = (Math.floor(k / 1024) & 1023) - 512,
      z = (k & 1023) - 512;
    return this.tile(x >> 3, y >> 3, z >> 5, false)?.data[((x & 7) * 8 + (y & 7)) * 32 + (z & 31)];
  }
  has(k: number) {
    return this.get(k) !== undefined;
  }
  set(k: number, value: Cell) {
    const x = Math.floor(k / 1048576) - 512,
      y = (Math.floor(k / 1024) & 1023) - 512,
      z = (k & 1023) - 512;
    const t = this.tile(x >> 3, y >> 3, z >> 5, true)!;
    const row = (x & 7) * 8 + (y & 7),
      offset = row * 32 + (z & 31);
    if (!t.data[offset]) {
      this.size++;
      t.rows[row] |= 1 << (z & 31);
    }
    t.data[offset] = value;
    return this;
  }
  delete(k: number) {
    const x = Math.floor(k / 1048576) - 512,
      y = (Math.floor(k / 1024) & 1023) - 512,
      z = (k & 1023) - 512;
    const t = this.tile(x >> 3, y >> 3, z >> 5, false);
    const row = (x & 7) * 8 + (y & 7),
      offset = row * 32 + (z & 31);
    if (!t?.data[offset]) return false;
    delete t.data[offset];
    t.rows[row] &= ~(1 << (z & 31));
    this.size--;
    return true;
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g: number) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const row = (x & 7) * 8 + (y & 7);
        for (let z = z0; z <= z1;) {
          const last = Math.min(z1, z | 31),
            t = this.tile(x >> 3, y >> 3, z >> 5, c !== null);
          if (t) {
            const mask = (-1 << (z & 31)) & (0xffffffff >>> (31 - (last & 31))),
              prev = t.rows[row];
            t.rows[row] = c === null ? prev & ~mask : prev | mask;
            let changed = prev ^ t.rows[row];
            while (changed) {
              this.size += c === null ? -1 : 1;
              changed &= changed - 1;
            }
            for (let i = row * 32 + (z & 31), end = row * 32 + (last & 31); i <= end; i++) {
              if (c === null) delete t.data[i];
              else t.data[i] = { c, g };
            }
          }
          z = last + 1;
        }
      }
  }
  clear() {
    this.tiles.clear();
    this.size = 0;
  }
  occupancy() {
    if (!this.size) return null;
    let x0 = Infinity,
      y0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      z1 = -Infinity;
    for (const t of this.tiles.values()) {
      x0 = Math.min(x0, t.x * 8 - 1);
      y0 = Math.min(y0, t.y * 8 - 1);
      z0 = Math.min(z0, (t.z - 1) * 32);
      x1 = Math.max(x1, t.x * 8 + 8);
      y1 = Math.max(y1, t.y * 8 + 8);
      z1 = Math.max(z1, (t.z + 2) * 32 - 1);
    }
    const nx = x1 - x0 + 1,
      ny = y1 - y0 + 1,
      nz = z1 - z0 + 1;
    if (nx * ny * nz > 400e6) return null;
    const b = new Uint32Array(nx * ny * (nz / 32));
    const at = (x: number, y: number, z: number) => ((x - x0) * ny + y - y0) * nz + z - z0;
    for (const t of this.tiles.values())
      for (let row = 0; row < 64; row++) {
        b[at(t.x * 8 + (row >> 3), t.y * 8 + (row & 7), t.z * 32) >>> 5] = t.rows[row];
      }
    const occ = (x: number, y: number, z: number) => {
      if (x < x0 || y < y0 || z < z0 || x > x1 || y > y1 || z > z1) return false;
      const i = at(x, y, z);
      return ((b[i >>> 5] >>> (i & 31)) & 1) !== 0;
    };
    return { b, at, occ, ny, nz };
  }
  *entries(bits?: NonNullable<ReturnType<WorldGrid['occupancy']>>): Generator<[number, Cell]> {
    for (const t of this.tiles.values())
      for (let row = 0; row < 64; row++) {
        let mask = t.rows[row];
        if (!mask) continue;
        const x = t.x * 8 + (row >> 3),
          y = t.y * 8 + (row & 7),
          z = t.z * 32;
        if (bits) {
          const i = bits.at(x, y, z) >>> 5,
            b = bits.b,
            dy = bits.nz >>> 5,
            dx = bits.ny * dy;
          const left = (mask << 1) | (b[i - 1] >>> 31),
            right = (mask >>> 1) | (b[i + 1] << 31);
          mask &= ~(left & right & b[i - dx] & b[i + dx] & b[i - dy] & b[i + dy]);
        }
        const first = ((x + 512) * 1024 + y + 512) * 1024 + z + 512;
        while (mask) {
          const bit = 31 - Math.clz32(mask & -mask);
          const cell = t.data[row * 32 + bit];
          if (cell) yield [first + bit, cell];
          mask &= mask - 1;
        }
      }
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  *keys() {
    for (const [k] of this) yield k;
  }
  *values() {
    for (const [, v] of this) yield v;
  }
}
