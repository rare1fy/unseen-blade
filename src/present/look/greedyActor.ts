// Each input is one bone and one material. Moving joints retain the faces between them.
// Only join flat-coloured faces, keeping every exposed bevel along the rectangle's boundary.
export function mergeActorFaces(arrays: number[][], cell: number) {
  const [p, n, c, uv, indices, edges, sizes] = arrays, count = indices.length / 6;
  const planes = new Map<string, Map<number, number>>(), keys = new Int32Array(count);
  const visited = new Uint8Array(count);
  const planeOf: Array<Map<number, number> | undefined> = [];
  for (let q = 0; q < count; q++) {
    const i = q * 12;
    let uniform = true;
    for (let k = 3; k < 12; k++) if (c[i + k] !== c[i + k % 3]) { uniform = false; break; }
    if (!uniform) continue;
    const axis = n[i] ? 0 : n[i+1] ? 1 : 2, u = (axis + 1) % 3, v = (axis + 2) % 3;
    const plane = [axis, n[i+axis], Math.round(p[i+axis]/cell), c[i], c[i+1], c[i+2]].join('/');
    let cells = planes.get(plane);
    if (!cells) planes.set(plane, cells = new Map());
    const key = Math.round(p[i+u]/cell) * 4096 + Math.round(p[i+v]/cell);
    keys[q] = key; cells.set(key, q); planeOf[q] = cells;
  }
  const out: number[][] = [[], [], [], [], [], [], []];
  const [P,N,C,U,I,E,S] = out;
  for (let q = 0; q < count; q++) {
    if (visited[q]) continue;
    const cells = planeOf[q], key = keys[q], edge = q*16;
    let w = 1, h = 1, right = q, upper = q, corner = q;
    if (cells) {
      while (!edges[right*16+1]) {
        const next = cells.get(key + w*4096);
        if (next === undefined || visited[next] || edges[next*16] ||
            edges[next*16+2] !== edges[edge+2] || edges[next*16+3] !== edges[edge+3]) break;
        w++; right = next;
      }
      corner = right;
      if (!edges[edge+3]) rows: for (;;) {
        const first = cells.get(key+h), last = cells.get(key+(w-1)*4096+h);
        if (first === undefined || last === undefined) break;
        for (let x=0; x<w; x++) {
          const next = cells.get(key+x*4096+h);
          if (next === undefined || visited[next] || edges[next*16+2] ||
              edges[next*16] !== (x === 0 ? edges[edge] : 0) ||
              edges[next*16+1] !== (x === w-1 ? edges[right*16+1] : 0) ||
              edges[next*16+3] !== edges[first*16+3]) break rows;
        }
        h++; upper = first; corner = last;
        if (edges[first*16+3]) break;
      }
      for (let x=0; x<w; x++) for (let y=0; y<h; y++) visited[cells.get(key+x*4096+y)!] = 1;
    }
    const base = P.length / 3;
    for (let k=0; k<4; k++) {
      const from = (k === 0 ? q : k === 1 ? right : k === 2 ? corner : upper)*12 + k*3;
      P.push(p[from],p[from+1],p[from+2]); N.push(n[from],n[from+1],n[from+2]); C.push(c[from],c[from+1],c[from+2]);
      U.push(uv[q*8+k*2]*w, uv[q*8+k*2+1]*h); S.push(sizes[q*8]*w,sizes[q*8+1]*h);
      E.push(edges[edge], edges[right*16+1], edges[edge+2], edges[upper*16+3]);
    }
    for (let k=0; k<6; k++) I.push(indices[q*6+k]-q*4+base);
  }
  return out;
}
