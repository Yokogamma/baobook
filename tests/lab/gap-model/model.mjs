// An executable model of the gaps of Baobook's layout engine, «stacks» (docs/LAYOUT-RULES.md GAP, decisions G1–G7, S8 in
// docs/LAYOUT-MODEL.md §2). It is a lab model, not the engine: one container, blocks as card columns and rows, no handles, no
// SETTLE. Its job is to show, by running, that the representation keeps every gap whole through insertions, removals, growth,
// widening and carries, so that the specification can be written from it.
//
// The state. A block: {id, c0, c1, y, h}: its card columns c0…c1 (inclusive), its top row y and its height h.
// For every block l and every column c of its card where l is an «anchor», a stack: {u, parts}. u is the anchor above l in that
// column, or null for the top of the container. parts = [seg0, s1, seg1, s2, …, segk]: a seg is the gap's rows in order, one owner
// id per row ('' for an unowned row of free room); an s is a block standing in the gap, {id, pad, lend}: lend the rows of the gap its
// body covers, pad the empty rows above it that are not the gap's (it was put lower than the gap reaches, where the block under
// it is held lower by another column), which go with it. In a column, the blocks from top to bottom are a chain of anchors, each with the blocks standing between it and the
// anchor above. Every row is derived: FOLLOW walks each column's chain with a cursor.
//
// The operations are the events the engine's RELINK sees, column by column: a block comes into a column (it stands in the gap it
// lands in, or anchors a new stack when nothing is below it), leaves a column (a standing block gives its lend back; an anchor's
// stack is joined into the stack under it), changes height (G7 caps a standing block's lend at its height), or is carried by hand
// within its columns (rule 1 for an anchor's edges, the lend found again for a standing block).

const own = (b) => b.id;
const len = (seg) => seg.length;

export function createModel(opts = {}) {
  const O = { ownRowsGoOnNarrow: false, ...opts };   // opts: ownRowsGoOnNarrow, true is the switch GAP.9 off (G8)
  const B = new Map();   // id → block
  const S = new Map();   // `${l}|${c}` → stack
  const key = (l, c) => l + '|' + c;
  const cols = (b) => { const r = []; for (let c = b.c0; c <= b.c1; c++) r.push(c); return r; };
  const covers = (b, c) => b.c0 <= c && c <= b.c1;
  const bottom = (id) => (id == null ? 0 : B.get(id).y + B.get(id).h);

  // ---- the chain of one column: anchors from the top, each with the blocks standing in its stack
  function chain(c) {
    const out = []; let u = null;
    for (let guard = 0; guard < 100000; guard++) {
      let next = null;
      for (const [k, st] of S) { const [l, cc] = k.split('|'); if (+cc === c && st.u === u) { next = l; break; } }
      if (next == null) break;
      out.push(next); u = next;
    }
    return out;
  }
  function standingAt(c, id) {   // the stack of column c in which id stands, and its index in parts
    for (const [k, st] of S) { if (+k.split('|')[1] !== c) continue; const i = st.parts.findIndex((p, j) => j % 2 === 1 && p.id === id); if (i >= 0) return { l: k.split('|')[0], st, i }; }
    return null;
  }

  // ---- FOLLOW: every block's row is the highest the stacks of all its columns allow (the least fixed point)
  function follow() {
    const n = B.size;
    for (const b of B.values()) b.y = 0;
    for (let it = 0; it <= n + 2; it++) {
      const want = new Map([...B.keys()].map((id) => [id, 0]));
      const cs = new Set(); for (const b of B.values()) for (const c of cols(b)) cs.add(c);
      for (const c of [...cs].sort((a, b) => a - b)) {
        let cur = 0;
        for (const l of chain(c)) {
          const st = S.get(key(l, c));
          st.parts.forEach((p, i) => {
            if (i % 2 === 0) { cur += len(p); return; }
            cur += p.pad; want.set(p.id, Math.max(want.get(p.id), cur)); const s = B.get(p.id); cur = Math.max(cur, s.y) + s.h;
          });
          want.set(l, Math.max(want.get(l), cur)); const lb = B.get(l); cur = Math.max(cur, lb.y) + lb.h;
        }
      }
      let changed = false;
      for (const b of B.values()) if (b.y !== want.get(b.id)) { b.y = want.get(b.id); changed = true; }
      if (!changed) return;
    }
    throw new Error('FOLLOW did not settle');
  }

  // the actual start row of each part of a stack (segs start where the part above ends, standing blocks where they stand)
  function spans(st) {
    let cur = bottom(st.u); const out = [];
    st.parts.forEach((p, i) => {
      if (i % 2 === 0) { out.push([cur, cur + len(p)]); cur += len(p); return; }
      const s = B.get(p.id), top = Math.max(cur + p.pad, s.y); out.push([top, top + s.h]); cur = top + s.h;
    });
    return out;
  }

  // ---- a block comes into column c, at its present row
  function enter(x, c) {
    const others = [...B.values()].filter((b) => b.id !== x.id && covers(b, c)).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
    const below = others.find((b) => b.y >= x.y + x.h);
    if (!below) return anchorNew(x, c, others);
    // the stack that holds `below`: its own (below is an anchor) or the one it stands in; x lands in the seg just above `below`
    let st = S.get(key(below.id, c)), i;
    if (st) i = st.parts.length - 1; else { const f = standingAt(c, below.id); st = f.st; i = f.i - 1; }
    const sp = spans(st);
    st.parts.splice(i, 1, ...place(st.parts[i], x.y - sp[i][0], x));
  }
  // a standing block put at offset off from the start of the rows `rows`: the rows before it, its entry, the rows after it
  function place(rows, off, x) {
    if (off < 0) throw new Error('collision above ' + x.id);
    if (off >= len(rows)) return [rows.slice(), { id: x.id, pad: off - len(rows), lend: [] }, []];
    return [rows.slice(0, off), { id: x.id, pad: 0, lend: rows.slice(off, off + x.h) }, rows.slice(off + x.h)];
  }
  function anchorNew(x, c, others) {   // nothing below x in c: x anchors a stack of its own, fresh rows of the block above (rule 4)
    const above = [...others].filter((b) => b.y + b.h <= x.y).pop();
    const u = above ? above.id : null, n = Math.max(0, x.y - bottom(u));
    S.set(key(x.id, c), { u, parts: [Array(n).fill(u == null ? '' : u)] });
  }

  // ---- a block leaves column c (deleted, carried away, narrowed off it)
  function leave(x, c, why) {
    // its own rows go (G2) when it is deleted or carried away; narrowed off a column, by the switch: they go too (the rules as
    // written), or they stay as free room of the gap that takes them (ownRowsGoOnNarrow false)
    const dropOwn = why !== 'narrow' || O.ownRowsGoOnNarrow;
    let heir = '';
    const strip = (seg) => (dropOwn ? seg.filter((o) => o !== x.id) : seg.map((o) => (o === x.id ? heir : o)));
    const f = standingAt(c, x.id);
    if (f) {   // standing: its lend goes back between the segs round it
      const { st, i } = f;
      const merged = [...st.parts[i - 1], ...st.parts[i].lend, ...st.parts[i + 1]];   // its pad goes with it
      st.parts.splice(i - 1, 3, strip(merged));
      return;
    }
    const mine = S.get(key(x.id, c)); if (!mine) return;
    S.delete(key(x.id, c));
    let lowerKey = null; for (const [k, st] of S) if (+k.split('|')[1] === c && st.u === x.id) { lowerKey = k; break; }
    if (lowerKey) {   // join: the stack above x and the stack under it become one; x's own rows go wherever they lie (G2)
      const L = S.get(lowerKey), up = mine.parts.slice(), last = up.pop(); heir = mine.u == null ? '' : mine.u;
      const body = dropOwn ? [] : Array(x.h).fill(heir);   // narrowed off and its rows stay: the rows its body stood on stay too
      const joined = [...up, [...last, ...body, ...L.parts[0]], ...L.parts.slice(1)];
      L.u = mine.u;
      L.parts = joined.map((p, j) => (j % 2 === 0 ? strip(p) : { id: p.id, pad: p.pad, lend: strip(p.lend) }));
    } else {          // x was the last anchor: the blocks standing in its stack become anchors, each over the seg above it
      let u = mine.u;
      for (let j = 1; j < mine.parts.length; j += 2) {
        const s = mine.parts[j]; S.set(key(s.id, c), { u, parts: [strip(mine.parts[j - 1])] }); u = s.id;
      }
    }
  }

  // ---- G7: what a standing block covers is never more than its height
  function capLends(x) {
    for (const st of S.values()) st.parts.forEach((p, j) => { if (j % 2 === 1 && p.id === x.id && len(p.lend) > x.h) p.lend = p.lend.slice(0, x.h); });   // the rows it no longer covers leave the gap
  }

  // ---- a block carried by hand by d rows within column c (rule 1 for an anchor, the lend found again for a standing block)
  function carryIn(x, c, d) {
    const f = standingAt(c, x.id);
    if (f) {
      const { st, i } = f, sp = spans(st);
      const rows = [...st.parts[i - 1], ...st.parts[i].lend, ...st.parts[i + 1]];   // the rows round it keep their owners
      st.parts.splice(i - 1, 3, ...place(rows, x.y + d - sp[i - 1][0], x));         // past the end: empty rows above it, its pad
      return;
    }
    const mine = S.get(key(x.id, c));
    let lower = null; for (const [k, st] of S) if (st.u === x.id && +k.split('|')[1] === c) { lower = st; break; }
    const last = mine.parts.length - 1, u = mine.u == null ? '' : mine.u;
    const sp = spans(mine), slack = x.y - sp[last][1];   // how much lower x stands than this gap holds it (another column binds it)
    let left = [];
    // the carried lower block went down: a gap that holds it grows by rows of its owner (G1); one with slack keeps its rows
    if (d > 0 && slack === 0) mine.parts[last] = [...mine.parts[last], ...Array(d).fill(u)];
    // it went up: the slack goes first, then rows from the bottom; those rows are the ones it leaves
    if (d < 0) { const k = Math.min(len(mine.parts[last]), Math.max(0, -d - slack));
      left = mine.parts[last].slice(len(mine.parts[last]) - k); mine.parts[last] = mine.parts[last].slice(0, len(mine.parts[last]) - k); }
    if (!lower) return;
    if (d > 0) {   // its bottom went down into the gap under it: rows go from the top, its own first
      const seg = lower.parts[0].slice(); let k = d;
      for (let j = 0; j < seg.length && k > 0; j++) if (seg[j] === x.id) { seg.splice(j, 1); j--; k--; }
      lower.parts[0] = seg.slice(Math.min(k, seg.length));
    } else if (d < 0) {   // its bottom went up: the rows it left come under it with their owners; free room becomes its own (G5, G6)
      const pad = Array(Math.max(0, -d - left.length)).fill(x.id);   // what the slack gave: rows under it, its own
      lower.parts[0] = [...pad, ...left.map((o) => (o === '' ? x.id : o)), ...lower.parts[0]];
    }
  }

  // every operation is all or nothing: a refused one leaves the state as it was
  const atomic = (fn) => (...a) => {
    const b0 = new Map([...B].map(([k, b]) => [k, { ...b }])), s0 = new Map([...S].map(([k, st]) => [k, { u: st.u, parts: st.parts.map((p, i) => (i % 2 ? { ...p, lend: p.lend.slice() } : p.slice())) }]));
    try { return fn(...a); } catch (e) { B.clear(); for (const [k, b] of b0) B.set(k, b); S.clear(); for (const [k, s] of s0) S.set(k, s); throw e; }
  };
  const api = {
    B, S,
    open(blocks) {   // from places only: every gap fresh, owned by the block above, free room unowned
      B.clear(); S.clear();
      for (const b of blocks) B.set(b.id, { ...b });
      const cs = new Set(); for (const b of B.values()) for (const c of cols(b)) cs.add(c);
      for (const c of [...cs].sort((a, b) => a - b)) {
        const col = [...B.values()].filter((b) => covers(b, c)).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
        let u = null;
        for (const b of col) { const n = b.y - bottom(u); if (n < 0) throw new Error('overlap at open'); S.set(key(b.id, c), { u, parts: [Array(n).fill(u == null ? '' : u)] }); u = b.id; }
      }
      follow(); return api;
    },
    _insert(b) { const x = { ...b }; if (overlaps(x)) throw new Error('insert overlaps'); B.set(x.id, x); for (const c of cols(x)) enter(x, c); follow(); return api; },
    _remove(id, why = 'delete') { const x = B.get(id); for (const c of cols(x)) leave(x, c, why); B.delete(id); follow(); return api; },
    _height(id, h) { const x = B.get(id); x.h = h; capLends(x); follow(); return api; },
    _width(id, c0, c1) {
      const x = B.get(id), was = cols(x);
      if (!(c0 <= c1)) throw new Error('no columns');
      const probe = { ...x, c0, c1 }; if (overlaps(probe, id)) throw new Error('width overlaps');
      for (const c of was) if (c < c0 || c > c1) leave(x, c, 'narrow');
      x.c0 = c0; x.c1 = c1;
      for (const c of cols(x)) if (!was.includes(c)) enter(x, c);
      follow(); return api;
    },
    _carry(id, d) {   // by hand, within its columns
      const x = B.get(id), probe = { ...x, y: x.y + d }; if (overlaps(probe, id)) throw new Error('carry overlaps');
      for (const c of cols(x)) carryIn(x, c, d);
      x.y += d; follow();
      if (B.get(id).y !== probe.y) throw new Error('carry: the stacks do not put ' + id + ' at its row');
      return api;
    },
    rows() { return Object.fromEntries([...B.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((b) => [b.id, b.y])); },
    stack(l, c) { const st = S.get(key(l, c)); return st ? show(st) : null; },
    snapshot() {
      const bs = [...B.values()].map((b) => [b.id, b.c0, b.c1, b.y, b.h]).sort();
      const ss = [...S.entries()].map(([k, st]) => [k, show(st)]).sort();
      return JSON.stringify([bs, ss]);
    },
    check() { return invariants(); },
  };

  for (const name of ['insert', 'remove', 'height', 'width', 'carry']) { api[name] = atomic(api['_' + name]); delete api['_' + name]; }

  function overlaps(x, except) {
    for (const b of B.values()) if (b.id !== x.id && b.id !== except && b.c0 <= x.c1 && x.c0 <= b.c1 && b.y < x.y + x.h && x.y < b.y + b.h) return true;
    return false;
  }
  function show(st) {
    const runs = (seg) => { const o = []; for (const r of seg) { const p = o[o.length - 1]; if (p && p[0] === r) p[1]++; else o.push([r, 1]); } return o.map(([r, n]) => (r || '_') + n).join('+') || '·'; };
    return (st.u || 'top') + ' | ' + st.parts.map((p, i) => (i % 2 === 0 ? runs(p) : `[${p.pad ? '+' + p.pad + ' ' : ''}${p.id}:${runs(p.lend)}]`)).join(' ') + ' |';
  }
  function invariants() {
    const errs = [];
    // INV-1: no two blocks share a column and a row
    const bs = [...B.values()];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j];
      if (a.c0 <= b.c1 && b.c0 <= a.c1 && a.y < b.y + b.h && b.y < a.y + a.h) errs.push('overlap ' + a.id + ' ' + b.id); }
    // every column: the chain covers exactly the blocks of that column, in row order
    const cs = new Set(); for (const b of bs) for (const c of cols(b)) cs.add(c);
    for (const c of cs) {
      const seq = []; for (const l of chain(c)) { const st = S.get(key(l, c)); st.parts.forEach((p, i) => { if (i % 2 === 1) seq.push(p.id); }); seq.push(l); }
      const want = bs.filter((b) => covers(b, c)).sort((a, b) => a.y - b.y).map(own);
      if (seq.join() !== want.join()) errs.push(`column ${c}: chain ${seq.join()} ≠ blocks ${want.join()}`);
      for (const st of S.values()) st.parts.forEach((p, i) => { if (i % 2 === 1 && len(p.lend) > B.get(p.id).h) errs.push('lend over height ' + p.id); });
    }
    return errs;
  }
  return api;
}
