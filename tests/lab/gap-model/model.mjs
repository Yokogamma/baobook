// An executable model of the gaps of Baobook's layout engine, «stacks» (docs/LAYOUT-RULES.md GAP, decisions G1–G8, S8 in
// docs/LAYOUT-MODEL.md §2). It is a lab model, not the engine: one container, blocks as card columns and rows, no handles, no
// SETTLE. Its job is to show, by running, that the representation keeps every gap whole through insertions, removals, growth,
// widening, carries, moves of several blocks at once and temporary heights, so that the specification can be written from it.
//
// The state. A block: {id, c0, c1, y, h, e}: its card columns c0…c1 (inclusive), its row y in the displayed layout, its height h
// (the canonical one, stored) and e, the rows a temporary height adds to it while it lasts (§2.1 of the rules: «Розгорнути», the
// unfolding with the caret, EDIT.3's provisional line, P18's row; a temporary height in a view where blocks are placed only adds
// rows). For every block l and every column c of its card where l is an «anchor», a stack: {u, parts}. u is the anchor above l in
// that column, or null for the top of the container. parts = [seg0, s1, seg1, s2, …, segk]: a seg is the gap's rows in order, one
// owner id per row ('' for an unowned row of free room); an s is a block standing in the gap, {id, lend}: the rows of the gap its
// body covers, by its canonical height, never more than it (G7). Rows a block owns may lie above it: the room above a block put
// lower than the gap reaches (the block under it held lower by another column) is its own rows, so it goes with it. In a column,
// the blocks from top to bottom are a chain of anchors, each with the blocks standing between it and the anchor above. Every row
// is derived: FOLLOW walks each column's chain with a cursor, in either measure: the displayed one (with the temporary heights),
// which the operations aim in, and the canonical one, which is stored. The stacks are the same in both; a temporary height pushes
// what is under its block on the screen, as a growth would (§2.1), and writes nothing.
//
// The operations are the events the engine's RELINK sees, column by column: a block comes into a column (it stands in the gap it
// lands in, or anchors a new stack when nothing is below it; dropped there, at its displayed row; widened there, at its canonical
// one), leaves a column (a standing block gives its lend back; an anchor's stack is joined into the stack under it; under the last
// anchor, the lowest block standing in its stack takes its place), changes its real height (G7 cuts a standing block's lend at its
// height), gets or loses a temporary height (no stack changes), or moves, alone or with others in one step (the rows change only at
// the edges of each run of blocks that moved together, so that the move holds in both measures).

const len = (seg) => seg.length;

export function createModel(opts = {}) {
  const O = { gap8: true, gap9: true, ...opts };   // the switches GAP.8 (G6) and GAP.9 (G8), on by default
  const B = new Map();   // id → block
  const S = new Map();   // `${l}|${c}` → stack
  const key = (l, c) => l + '|' + c;
  const cols = (b) => { const r = []; for (let c = b.c0; c <= b.c1; c++) r.push(c); return r; };
  const covers = (b, c) => b.c0 <= c && c <= b.c1;
  const shownH = (b) => b.h + b.e;
  const stackCol = (k) => +k.split('|')[1];
  const heirOf = (st) => (st.u == null ? '' : st.u);

  // ---- the chain of one column: anchors from the top; and every element of it, anchors and standing blocks, in order
  function chain(c) {
    const out = []; let u = null;
    for (let guard = 0; guard < 100000; guard++) {
      let next = null;
      for (const [k, st] of S) if (stackCol(k) === c && st.u === u) { next = k.split('|')[0]; break; }
      if (next == null) break;
      out.push(next); u = next;
    }
    return out;
  }
  function seq(c) {   // [{id, st, i}] : i the index in st.parts for a standing block, -1 for the anchor of st
    const out = [];
    for (const l of chain(c)) { const st = S.get(key(l, c)); st.parts.forEach((p, i) => { if (i % 2) out.push({ id: p.id, st, i }); }); out.push({ id: l, st, i: -1 }); }
    return out;
  }
  const lowerOf = (x, c) => { for (const [k, st] of S) if (stackCol(k) === c && st.u === x) return st; return null; };

  // ---- FOLLOW: every block's row is the highest the stacks of all its columns allow (the least fixed point), in a measure
  function rowsIn(measure) {
    const shown = measure === 'shown', y = new Map([...B.keys()].map((id) => [id, 0]));
    const cs = new Set(); for (const b of B.values()) for (const c of cols(b)) cs.add(c);
    const order = [...cs].sort((a, b) => a - b);
    for (let it = 0; it <= B.size + 2; it++) {
      const want = new Map([...B.keys()].map((id) => [id, 0]));
      for (const c of order) {
        let cur = 0;
        for (const l of chain(c)) {
          S.get(key(l, c)).parts.forEach((p, i) => {
            if (i % 2 === 0) { cur += len(p); return; }
            const s = B.get(p.id); want.set(s.id, Math.max(want.get(s.id), cur));
            cur = Math.max(cur, y.get(s.id)) + s.h + (shown ? s.e : 0);
          });
          const lb = B.get(l); want.set(l, Math.max(want.get(l), cur)); cur = Math.max(cur, y.get(l)) + lb.h + (shown ? lb.e : 0);
        }
      }
      let changed = false;
      for (const id of B.keys()) if (y.get(id) !== want.get(id)) { y.set(id, want.get(id)); changed = true; }
      if (!changed) return y;
    }
    throw new Error('FOLLOW did not settle');
  }
  function follow() { const y = rowsIn('shown'); for (const b of B.values()) b.y = y.get(b.id); }

  // where each part of a stack lies, in a measure: its first and its last row plus one
  function spans(st, measure = 'shown', ys = null) {
    const Y = (id) => (ys ? ys.get(id) : B.get(id).y), H = (b) => b.h + (measure === 'shown' ? b.e : 0);
    let cur = st.u == null ? 0 : Y(st.u) + H(B.get(st.u)); const out = [];
    st.parts.forEach((p, i) => {
      if (i % 2 === 0) { out.push([cur, cur + len(p)]); cur += len(p); return; }
      const s = B.get(p.id), top = Math.max(cur, Y(s.id)); out.push([top, top + H(s)]); cur = top + H(s);
    });
    return out;
  }

  // ---- a block comes into column c (rules 3 and 4): dropped there, at its displayed row (the user aims at what is shown); come in by
  // itself (widened, pressed aside), at its canonical row `ys`, so that nothing a temporary height pushed is written (§2.1)
  function enter(x, c, ys = null) {
    const others = [...B.values()].filter((b) => b.id !== x.id && covers(b, c)).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
    const below = others.find((b) => b.y >= x.y + shownH(x));
    const Y = (b) => (ys ? ys.get(b.id) : b.y), H = (b) => b.h + (ys ? 0 : b.e);
    if (!below) {   // fresh: x anchors a stack of its own, rows of the anchor above (unowned under the top)
      const above = others.filter((b) => b.y + shownH(b) <= x.y).pop(), u = above ? above.id : null;
      S.set(key(x.id, c), { u, parts: [Array(Math.max(0, Y(x) - (above ? Y(above) + H(above) : 0))).fill(u == null ? '' : u)] });
      return;
    }
    // stand: in the stack that holds `below` (its own, or the one it stands in), in the seg just above it
    let st = S.get(key(below.id, c)), i;
    if (st) i = st.parts.length - 1; else { const f = seq(c).find((el) => el.id === below.id); st = f.st; i = f.i - 1; }
    st.parts.splice(i, 1, ...place(st.parts[i], Math.max(0, Y(x) - spans(st, ys ? 'canonical' : 'shown', ys)[i][0]), x));
  }
  // a standing block put at offset off from the start of the rows `rows`: the rows before it, its entry, the rows after it
  function place(rows, off, x) {
    if (off < 0) throw new Error('collision above ' + x.id);
    if (off >= len(rows)) return [[...rows, ...Array(off - len(rows)).fill(x.id)], { id: x.id, lend: [] }, []];   // the room above it is its own
    return [rows.slice(0, off), { id: x.id, lend: rows.slice(off, off + x.h) }, rows.slice(off + x.h)];
  }

  // ---- x's rows in column c, wherever they lie (G2): those above it (the room it was put with) go; those under it go too, or,
  // narrowed off with GAP.9 on (G8), become rows of the stack they lie in, that stack's u's (unowned under the top); in the stack
  // whose u x is, the u that stack is about to get, x's own
  function release(x, c, keep, heir) {
    let past = false;
    for (const l of chain(c)) {
      const st = S.get(key(l, c)), to = st.u === x.id ? heir : heirOf(st);
      const f = (seg) => seg.flatMap((o) => (o !== x.id ? [o] : past && keep ? [to] : []));
      st.parts = st.parts.map((p, j) => {
        if (j % 2 === 0) return f(p);
        const q = { id: p.id, lend: f(p.lend) }; if (p.id === x.id) past = true; return q;
      });
      if (l === x.id) past = true;
    }
  }

  // ---- a block leaves column c (deleted, carried away, narrowed or pressed off it): rule 2
  function leave(x, c, why, ys) {   // ys: the canonical rows before the change
    const f = seq(c).find((el) => el.id === x.id); if (!f) return;
    const keep = why === 'narrow' && O.gap9;   // G8: narrowing is not deleting
    release(x, c, keep, heirOf(f.st));
    if (f.i >= 0) {   // standing: its lend comes back between the segs round it, whatever made it leave (S8)
      const { st, i } = f;
      st.parts.splice(i - 1, 3, [...st.parts[i - 1], ...st.parts[i].lend, ...st.parts[i + 1]]);
      return;
    }
    const mine = f.st; S.delete(key(x.id, c));
    const L = lowerOf(x.id, c);
    if (L) {          // join: the stack above x and the stack under it become one
      const up = mine.parts.slice(), last = up.pop();
      // narrowed off: what its body stood on and its slack there (the rows by which its stack did not hold it) stay, measured
      // canonically, so that no temporary height is written; on the screen a temporary height that no longer reaches the block
      // under it through this one stops pushing it
      const slack = keep ? ys.get(x.id) - spans(mine, 'canonical', ys)[mine.parts.length - 1][1] : 0;
      const body = keep ? Array(x.h + slack).fill(heirOf(mine)) : [];
      L.u = mine.u; L.parts = [...up, [...last, ...body, ...L.parts[0]], ...L.parts.slice(1)];
    } else if (mine.parts.length > 1) {   // the last anchor: the lowest block standing in its stack becomes the stack's anchor, the
      // others stand on in it; its lend and the rows under it go (GAP.3), and the room above it that was its own becomes the gap's
      const k = mine.parts.length - 2, s = mine.parts[k], to = heirOf(mine), f = (seg) => seg.map((o) => (o === s.id ? to : o));
      S.set(key(s.id, c), { u: mine.u, parts: mine.parts.slice(0, k).map((p, j) => (j % 2 === 0 ? f(p) : { id: p.id, lend: f(p.lend) })) });
    }
  }

  // ---- G7: a real shrink; what a standing block covers is never more than its height
  function capLends(x) {
    for (const st of S.values()) st.parts.forEach((p, j) => { if (j % 2 === 1 && p.id === x.id && len(p.lend) > x.h) p.lend = p.lend.slice(0, x.h); });
  }

  // ---- blocks moved by d rows in one step (a carry by hand, or a primitive moving several blocks with their gaps): rule 1.
  // Per column, each run of chain blocks that moved together keeps everything inside it; only the gap above the run and the gap
  // under it change. A gap holds the run's top when it has no slack there in either measure, so that the move holds in both.
  // Moving down, the gap under the run loses rows, the run's own first, then from the top. The gap above it grows: where it holds
  // the run's top, by rows of its stack's u (unowned under the top); when the run stands in that stack and so does the gap under
  // it, by as many rows as the gap under it lost, whatever the slack, so that the stack keeps every row it had, and, where it holds
  // the run's top, by the rest as room of the run's top, its own rows. Moving up, the smaller slack goes first, then rows from the
  // bottom of the gap above; under the run come first the slack used, as the run's top's own rows, then the rows it left, with
  // their owners (G5). In a column where the run's top is the first block, the free room it leaves and the slack it used become
  // its own (G6, GAP.8; with GAP.8 off they stay free room); with nothing under the run they go (G5).
  function moveIn(c, ids, d, yc) {
    const q = seq(c), moved = q.map((el) => ids.has(el.id)), runs = [];
    for (let a = 0; a < q.length; a++) {   // every run, with its two gaps and its slack, read before anything changes
      if (!moved[a] || (a > 0 && moved[a - 1])) continue;
      let z = a; while (z + 1 < q.length && moved[z + 1]) z++;
      const top = q[a], bot = q[z], ust = top.st, ui = top.i >= 0 ? top.i - 1 : ust.parts.length - 1;
      const [lst, li] = bot.i >= 0 ? [bot.st, bot.i + 1] : [lowerOf(bot.id, c), 0];
      const slackShown = B.get(top.id).y - spans(ust)[ui][1], slackCanon = yc.get(top.id) - spans(ust, 'canonical', yc)[ui][1];
      runs.push({ r: top.id, head: a === 0, run: new Set(q.slice(a, z + 1).map((el) => el.id)), ust, ui, lst, li, sameStack: top.i >= 0 && lst === ust,
        holds: slackShown === 0 || slackCanon === 0, slack: Math.min(slackShown, slackCanon) });
      a = z;
    }
    for (const { r, head, run, ust, ui, lst, li, sameStack, holds, slack } of runs) {
      if (d > 0) {
        let k = d, got = 0;
        if (lst) {
          const seg = lst.parts[li].slice();
          for (let j = 0; j < seg.length && k > 0; j++) if (run.has(seg[j])) { seg.splice(j, 1); j--; k--; got++; }
          const t = Math.min(k, seg.length); lst.parts[li] = seg.slice(t); got += t;
        }
        const grow = sameStack ? [...Array(got).fill(heirOf(ust)), ...Array(holds ? d - got : 0).fill(r)] : Array(holds ? d : 0).fill(heirOf(ust));
        ust.parts[ui] = [...ust.parts[ui], ...grow];
      } else {
        const k = -d, used = Math.min(k, slack), n = Math.min(len(ust.parts[ui]), k - used), mine = head && !O.gap8 ? '' : r;
        const left = ust.parts[ui].slice(len(ust.parts[ui]) - n); ust.parts[ui] = ust.parts[ui].slice(0, len(ust.parts[ui]) - n);
        if (lst) lst.parts[li] = [...Array(used).fill(mine), ...left.map((o) => (o === '' && head ? mine : o)), ...lst.parts[li]];
      }
    }
  }

  // every operation is all or nothing: a refused one leaves the state as it was
  const copy = () => ({ B: new Map([...B].map(([k, b]) => [k, { ...b }])), S: new Map([...S].map(([k, st]) => [k, { u: st.u, parts: st.parts.map((p, i) => (i % 2 ? { id: p.id, lend: p.lend.slice() } : p.slice())) }])) });
  const put = (s) => { B.clear(); for (const [k, b] of s.B) B.set(k, { ...b }); S.clear(); for (const [k, st] of s.S) S.set(k, st); };
  const atomic = (fn) => (...a) => { const s0 = copy(); try { return fn(...a); } catch (e) { put(s0); throw e; } };
  const api = {
    B, S,
    open(blocks) {   // from places only (GAP.1): every gap fresh, owned by the block above, free room unowned; no temporary height
      B.clear(); S.clear();
      for (const b of blocks) B.set(b.id, { ...b, e: 0 });
      const cs = new Set(); for (const b of B.values()) for (const c of cols(b)) cs.add(c);
      for (const c of [...cs].sort((a, b) => a - b)) {
        const col = [...B.values()].filter((b) => covers(b, c)).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
        let u = null;
        for (const b of col) { const n = b.y - (u == null ? 0 : B.get(u).y + B.get(u).h); if (n < 0) throw new Error('overlap at open'); S.set(key(b.id, c), { u, parts: [Array(n).fill(u == null ? '' : u)] }); u = b.id; }
      }
      follow(); return api;
    },
    _insert(b) { const x = { e: 0, ...b }; if (B.has(x.id) || overlaps(x)) throw new Error('insert overlaps'); B.set(x.id, x); for (const c of cols(x)) enter(x, c); follow(); return api; },
    _remove(id) { const x = B.get(id), ys = rowsIn('canonical'); for (const c of cols(x)) leave(x, c, 'delete', ys); B.delete(id); follow(); return api; },
    _height(id, h) { const x = B.get(id); if (!(h >= 1)) throw new Error('height'); x.h = h; capLends(x); follow(); return api; },   // a real change
    _show(id, e) { const x = B.get(id); if (!(e >= 0)) throw new Error('temporary'); x.e = e; follow(); return api; },             // a temporary one
    _width(id, c0, c1) {
      const x = B.get(id), was = cols(x), ys = rowsIn('canonical');
      if (!(c0 <= c1)) throw new Error('no columns');
      if (overlaps({ ...x, c0, c1 }, id)) throw new Error('width overlaps');
      for (const c of was) if (c < c0 || c > c1) leave(x, c, 'narrow', ys);
      x.c0 = c0; x.c1 = c1;
      for (const c of cols(x)) if (!was.includes(c)) enter(x, c, ys);   // it came in by itself: at its canonical row
      follow(); return api;
    },
    _move(list, d) {   // one step: every block of `list` moved by d rows, within its columns
      const ids = new Set(list); if (!ids.size || !d) return api;
      for (const id of ids) if (overlaps({ ...B.get(id), y: B.get(id).y + d }, id, ids)) throw new Error('move overlaps');
      const want = new Map([...B.values()].map((b) => [b.id, b.y + d])), yc = rowsIn('canonical');
      const cs = new Set(); for (const id of ids) for (const c of cols(B.get(id))) cs.add(c);
      for (const c of [...cs].sort((a, b) => a - b)) moveIn(c, ids, d, yc);
      follow(); const yc2 = rowsIn('canonical');
      for (const id of ids) if (B.get(id).y !== want.get(id) || yc2.get(id) !== yc.get(id) + d) throw new Error('move: the stacks do not put ' + id + ' at its row in both measures');
      return api;
    },
    carry(id, d) { return api.move([id], d); },
    _carryTo(id, c0, c1, y) {   // carried away to other columns (DRAG.B1, GAP.7): rule 2 where it was, rule 3 or 4 where it lands
      const x = B.get(id); if (!(c0 <= c1)) throw new Error('no columns');
      if (overlaps({ ...x, c0, c1, y }, id)) throw new Error('carry overlaps');
      const ys = rowsIn('canonical'); for (const c of cols(x)) leave(x, c, 'away', ys);
      x.c0 = c0; x.c1 = c1; follow();   // the blocks under it rise into its place (G2); it is in no chain yet
      x.y = y; if (overlaps(x, id)) throw new Error('carry overlaps');
      for (const c of cols(x)) enter(x, c);
      follow(); if (x.y !== y) throw new Error('carryTo: the stacks do not put ' + id + ' at its row'); return api;
    },
    rows(measure = 'shown') { const y = measure === 'shown' ? new Map([...B.values()].map((b) => [b.id, b.y])) : rowsIn('canonical'); return Object.fromEntries([...B.keys()].sort().map((id) => [id, y.get(id)])); },
    stack(l, c) { const st = S.get(key(l, c)); return st ? show(st) : null; },
    save() { return copy(); },                                   // the whole state, temporaries included
    load(s) { put(s); follow(); return api; },
    stored() { const s = copy(); for (const b of s.B.values()) b.e = 0; return s; },   // what 0.2 stores: places, sizes and stacks, no temporary
    places() { const y = rowsIn('canonical'); return [...B.values()].map((b) => ({ id: b.id, c0: b.c0, c1: b.c1, y: y.get(b.id), h: b.h })); },   // what 0.1 stores
    snapshot() {
      const yc = rowsIn('canonical');
      const bs = [...B.values()].map((b) => [b.id, b.c0, b.c1, b.y, yc.get(b.id), b.h, b.e]).sort();
      const ss = [...S.entries()].map(([k, st]) => [k, show(st)]).sort();
      return JSON.stringify([bs, ss]);
    },
    check() { return invariants(); },
  };
  for (const name of ['insert', 'remove', 'height', 'show', 'width', 'move', 'carryTo']) { api[name] = atomic(api['_' + name]); delete api['_' + name]; }

  function overlaps(x, except, moving) {   // in the displayed layout; blocks moving in the same step keep their places to one another
    for (const b of B.values()) {
      if (b.id === x.id || b.id === except || (moving && moving.has(b.id))) continue;
      if (b.c0 <= x.c1 && x.c0 <= b.c1 && b.y < x.y + shownH(x) && x.y < b.y + shownH(b)) return true;
    }
    return false;
  }
  function show(st) {
    const runs = (seg) => { const o = []; for (const r of seg) { const p = o[o.length - 1]; if (p && p[0] === r) p[1]++; else o.push([r, 1]); } return o.map(([r, n]) => (r || '_') + n).join('+') || '·'; };
    return (st.u || 'top') + ' | ' + st.parts.map((p, i) => (i % 2 === 0 ? runs(p) : `[${p.id}:${runs(p.lend)}]`)).join(' ') + ' |';
  }
  function invariants() {
    const errs = [], bs = [...B.values()], yc = rowsIn('canonical');
    // INV-1 in both measures: no two blocks share a column and a row
    for (const [name, y, hh] of [['shown', (b) => b.y, shownH], ['canonical', (b) => yc.get(b.id), (b) => b.h]])
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j];
        if (a.c0 <= b.c1 && b.c0 <= a.c1 && y(a) < y(b) + hh(b) && y(b) < y(a) + hh(a)) errs.push(`overlap ${a.id} ${b.id} (${name})`); }
    // taking the temporary heights out moves blocks only up (§2.1)
    for (const b of bs) if (yc.get(b.id) > b.y) errs.push(`canonical row of ${b.id} below its displayed row`);
    const cs = new Set(); for (const b of bs) for (const c of cols(b)) cs.add(c);
    for (const c of cs) {
      // INV-3: the chain covers exactly the blocks of that column, in row order
      const got = seq(c).map((el) => el.id), want = bs.filter((b) => covers(b, c)).sort((a, b) => a.y - b.y).map((b) => b.id);
      if (got.join() !== want.join()) errs.push(`column ${c}: chain ${got.join()} ≠ blocks ${want.join()}`);
    }
    for (const [k, st] of S) {
      const c = stackCol(k);
      // every owned row's owner is a block that covers the column (a deleted or departed owner leaves no rows behind)
      const rows = st.parts.flatMap((p, i) => (i % 2 === 0 ? p : p.lend));
      for (const o of new Set(rows)) if (o !== '' && !(B.has(o) && covers(B.get(o), c))) errs.push(`stack ${k}: rows of ${o}, which is not in column ${c}`);
      st.parts.forEach((p, i) => { if (i % 2 === 1 && len(p.lend) > B.get(p.id).h) errs.push('lend over height ' + p.id); });   // G7
    }
    return errs;
  }
  return api;
}
