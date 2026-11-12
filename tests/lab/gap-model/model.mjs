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
// An area ({area: true}) takes part in every rule by its extent (LAYOUT-RULES §1.1): its frame with one free cell on every side. The
// model keeps every block by its extent inside, so its rows, lends, slack and bodies are counted in extent rows, and converts at its
// surface: an area's frame row y, height h and columns c0…c1 come in and go out as such; its frame never stands at row 0 (proposed).
//
// The operations are the events the engine's RELINK sees, column by column: a block comes into a column (it stands in the gap it
// lands in, or anchors a new stack when nothing is below it; dropped there, at its displayed row; widened there, at its canonical
// one), leaves a column (a standing block gives its lend back; an anchor's stack is joined into the stack under it; under the last
// anchor, the lowest block standing in its stack takes its place), changes its real height (G7 cuts a standing block's lend at its
// height, at once, whatever wrote it), gets or loses a temporary height (no stack changes), or moves, alone or with others in one step
// (the rows change only at the edges of each run of blocks that moved together); and every column shifts at once (GAP.10), through
// columns left of 0 for an area's left side handle, whose wall then presses the children back.

const len = (seg) => seg.length;

export function createModel(opts = {}) {
  // the switches, on by default: GAP.5.1 (rule 1's owners), GAP.5.2 (leave gives back), GAP.5.3 (stand), GAP.8 (G6), GAP.9 (G8);
  // GAP.2, the owners of rows, is core (the owner, 2026-11-05)
  const O = { gap8: true, gap9: true, gap51: true, gap52: true, gap53: true, ...opts };
  if (!O.gap51) O.gap8 = false;   // GAP.8 needs GAP.5.1
  if (!O.gap52) O.gap9 = false;   // GAP.9 needs GAP.5.2: with nothing given back there is nothing to keep
  const padOf = (b) => (b.area ? 1 : 0);
  const inside = (b) => { const p = padOf(b); return { ...b, y: b.y - p, h: b.h + 2 * p, c0: b.c0 - p, c1: b.c1 + p }; };   // frame → extent
  const frameRow = (b, y) => y + padOf(b);
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
  function rowsIn(measure, floor = null) {
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
      if (floor) for (const [id, f] of floor) if (want.has(id)) want.set(id, Math.max(want.get(id), f));
      let changed = false;
      for (const id of B.keys()) if (y.get(id) !== want.get(id)) { y.set(id, want.get(id)); changed = true; }
      if (!changed) return y;
    }
    throw new Error('FOLLOW did not settle');
  }
  function follow(floor = null) { const y = rowsIn('shown', floor); for (const b of B.values()) b.y = y.get(b.id); }

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

  // the blocks in the order given, but each after every one of its uppers that the list holds (O-25): a stable order of dependencies
  function followOrder(list, uppersOf) {
    const out = [], left = list.slice();
    while (left.length) { const k = left.findIndex((id) => ![...(uppersOf.get(id) || [])].some((u) => u !== id && left.includes(u))); out.push(...left.splice(k < 0 ? 0 : k, 1)); }
    return out;
  }
  // ---- a block comes into column c (rules 3 and 4): dropped there, at its displayed row (the user aims at what is shown); come in by
  // itself (widened, pressed aside), at its canonical row `ys`, so that nothing a temporary height pushed is written (§2.1)
  // where a block put at its displayed row comes into column c: the start of the seg it stands in (rule 3), or of the rows over it as a
  // fresh anchor, as a canonical row, and its offset from there on the screen; its canonical row in that column is their sum
  function slot(x, c, yc) {   // yc: the canonical rows of the layout the arrivals come into, rule 5 made (the moved blocks at their targets)
    const inChain = new Set(seq(c).map((el) => el.id));
    const others = [...B.values()].filter((b) => b.id !== x.id && inChain.has(b.id)).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
    const below = others.find((b) => b.y >= x.y + shownH(x));
    if (!below) { const above = others.filter((b) => b.y + shownH(b) <= x.y).pop(); return above ? yc.get(above.id) + above.h + x.y - (above.y + shownH(above)) : x.y; }
    let st = S.get(key(below.id, c)), i;
    if (st) i = st.parts.length - 1; else { const f = seq(c).find((el) => el.id === below.id); st = f.st; i = f.i - 1; }
    return spans(st, 'canonical', yc)[i][0] + Math.max(0, x.y - spans(st, 'shown')[i][0]);
  }
  // canon: a block put at its displayed row, its canonical row, the largest its columns give (its other columns may hold it lower than the
  // screen does here, under another block's temporary rows): the rows under it are then those that keep the block under it at its
  // canonical row, so that no temporary push is written (§2.1), and the rest of the seg goes
  // resident: a block of a swap that was an anchor in this column comes back as one (the owner, 2026-11-10): it cuts the stack, the rows
  // above it and under it keeping their owners, so that taking it away later closes its place as in a document (G2) and every block keeps
  // its own gaps (G4)
  // uppers: for a block that comes in by itself out of every column it had, the blocks that stood over it in base (O-25, the owner's G16):
  // it comes in under every one of them in the column's chain, with the gap its reference gives, wherever the screen has it
  function enter(x, c, ys = null, byCanon = false, canon = null, yc = null, resident = false, targetOf = null, uppers = null) {   // byCanon: the block's place is its canonical row only (an undo, §6.4 of the plan)
    const Y = (b) => (ys ? ys.get(b.id) : b.y), H = (b) => b.h + (ys ? 0 : b.e);
    const order = seq(c).map((el) => el.id), inChain = new Set(order);   // the neighbours are those already in the column's chain (rule 3), not every block over it
    // a block put at its displayed row reads its neighbours in the chain's order, which is the screen's but where a block that came in by
    // itself followed its old upper neighbour (O-25, G16): it stands under that block in the chain whatever its target row
    const at = new Map(order.map((id, k) => [id, k]));
    const others = [...B.values()].filter((b) => b.id !== x.id && inChain.has(b.id)).sort((a, b) => (byCanon ? Y(a) - Y(b) || (a.id < b.id ? -1 : 1) : at.get(a.id) - at.get(b.id)));
    if (byCanon && others.some((b) => Y(b) < Y(x) + x.h && Y(x) < Y(b) + b.h)) throw new Error('restore overlaps');
    const lastUp = uppers ? others.reduce((m, b, k) => (uppers.has(b.id) ? k : m), -1) : -1;
    const below = byCanon ? others.find((b) => Y(b) >= Y(x) + x.h) : others.find((b, k) => k > lastUp && b.y >= x.y + shownH(x));
    if (!below) {   // fresh: x anchors a stack of its own, rows of the anchor above (unowned under the top)
      const above = byCanon ? others.filter((b) => Y(b) + b.h <= Y(x)).pop() : others.filter((b, k) => k <= lastUp || b.y + shownH(b) <= x.y).pop(), u = above ? above.id : null;
      S.set(key(x.id, c), { u, parts: [Array(Math.max(0, Y(x) - (above ? Y(above) + H(above) : 0))).fill(u == null ? '' : u)] });
      return;
    }
    // stand: in the stack that holds `below` (its own, or the one it stands in), in the seg just above it
    let st = S.get(key(below.id, c)), i;
    if (st) i = st.parts.length - 1; else { const f = seq(c).find((el) => el.id === below.id); st = f.st; i = f.i - 1; }
    const bC = canon != null ? yc.get(below.id) : null;
    let [before, entry, after] = place(st.parts[i], Math.max(0, Y(x) - spans(st, ys ? 'canonical' : 'shown', ys)[i][0]), x);
    if (canon != null) {
      // and no more than keep it at its target on the screen when SETTLE moved it: the put block's own temporary rows push it there, and
      // the rows that would keep its canonical row in this column too would push it past it (its canonical row is then another column's)
      let keep = Math.max(0, bC - (canon + x.h)); const t = targetOf ? targetOf(below.id) : null;
      if (t != null) keep = Math.min(keep, Math.max(0, t - (x.y + shownH(x))));
      after = after.slice(len(after) - Math.min(len(after), keep));
    }
    if (resident) { S.set(key(x.id, c), { u: st.u, parts: [...st.parts.slice(0, i), before] }); st.u = x.id; st.parts = [after, ...st.parts.slice(i + 1)]; return; }
    if (!O.gap53) {   // GAP.5.3 off: it cuts the stack, an anchor over the rows above it, the rows under it its own, no lend (lesson 17)
      S.set(key(x.id, c), { u: st.u, parts: [...st.parts.slice(0, i), before.map((o) => (o === x.id ? heirOf(st) : o))] });
      st.u = x.id; st.parts = [after.map(() => x.id), ...st.parts.slice(i + 1)];
      return;
    }
    st.parts.splice(i, 1, before, entry, after);
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
  function release(x, c, keep, heir, all = false) {   // all: a pass, which keeps its rows above it too
    let past = false;
    for (const l of chain(c)) {
      const st = S.get(key(l, c)), to = st.u === x.id ? heir : heirOf(st);
      const f = (seg) => seg.flatMap((o) => (o !== x.id ? [o] : (past && keep) || all ? [to] : []));
      st.parts = st.parts.map((p, j) => {
        if (j % 2 === 0) return f(p);
        const q = { id: p.id, lend: f(p.lend) }; if (p.id === x.id) past = true; return q;
      });
      if (l === x.id) past = true;
    }
  }

  // ---- a block leaves column c (deleted, carried away, narrowed or pressed off it): rule 2
  // ys: the canonical rows before the change
  function leave(x, c, why, ys, shown = 0, ycPass = null) {   // ycPass: the canonical rows a pass is measured on, the same for every pass
    const f = seq(c).find((el) => el.id === x.id); if (!f) return;
    // a pass (a block of a swap changing its place in the chain of a column it keeps) frees nothing, whatever the switches: its rows
    // above it and under it stay, and its place stays as rows, its canonical body and the slack above it (the rows by which its stack
    // did not hold it, in both measures: the smaller of its canonical and its displayed slack, on the canonical rows taken once after
    // every other departure of the RELINK); so the blocks under its place go down in neither measure (where the two slacks differ they may
    // rise in one, and rule 5 brings a block the steps moved to its target). The carried block of a swap keeps there its temporary rows too (`shown`), as the screen has
    // them, so that the blocks under its place do not move on the screen either until it comes back (O-21)
    const pass = why === 'pass', g52 = pass || O.gap52, tmpRows = pass ? Array(shown).fill(heirOf(f.st)) : [];
    const keep = pass || ((why === 'narrow' || why === 'press') && O.gap9);   // G8: narrowing or pressing aside is not deleting (GAP.9)
    const yc = pass ? ycPass || rowsIn('canonical') : null;
    release(x, c, keep, heirOf(f.st), pass);
    if (f.i >= 0) {   // standing: its lend comes back between the segs round it, whatever made it leave (S8); with GAP.5.2 off it goes with it
      const { st, i } = f;
      if (pass) {
        const sl = Math.max(0, Math.min(yc.get(x.id) - spans(st, 'canonical', yc)[i - 1][1], x.y - spans(st)[i - 1][1]));
        st.parts.splice(i - 1, 3, [...st.parts[i - 1], ...Array(x.h + sl).fill(heirOf(st)), ...tmpRows, ...st.parts[i + 1]]);
      } else st.parts.splice(i - 1, 3, [...st.parts[i - 1], ...(g52 ? st.parts[i].lend : []), ...st.parts[i + 1]]);
      return;
    }
    const mine = f.st; S.delete(key(x.id, c));
    const L = lowerOf(x.id, c);
    // GAP.5.2 off: the stack of the block that went loses its rows, the blocks standing in it stand on with no lends, whether it joins
    // the stack under it or, under the last anchor, its lowest standing block takes its place
    const gone = (p, j) => (g52 ? p : j % 2 === 0 ? [] : { id: p.id, lend: [] });
    if (L) {          // join: the stack above x and the stack under it become one
      const up = mine.parts.slice(), last = up.pop();
      // narrowed off: what its body stood on and its slack there (the rows by which its stack did not hold it) stay, measured
      // canonically, so that no temporary height is written; on the screen a temporary height that no longer reaches the block
      // under it through this one stops pushing it
      const slack = !keep ? 0 : pass ? Math.max(0, Math.min(yc.get(x.id) - spans(mine, 'canonical', yc)[mine.parts.length - 1][1], x.y - spans(mine)[mine.parts.length - 1][1]))
        : ys.get(x.id) - spans(mine, 'canonical', ys)[mine.parts.length - 1][1];
      const body = keep ? [...Array(x.h + slack).fill(heirOf(mine)), ...tmpRows] : [];
      L.u = mine.u; L.parts = [...up.map(gone), [...gone(last, 0), ...body, ...L.parts[0]], ...L.parts.slice(1)];
    } else if (mine.parts.length > 1) {   // the last anchor: the lowest block standing in its stack becomes the stack's anchor, the
      // others stand on in it; its lend and the rows under it go (GAP.3), and the room above it that was its own becomes the gap's
      const k = mine.parts.length - 2, s = mine.parts[k], to = heirOf(mine), f = (seg) => seg.map((o) => (o === s.id ? to : o));
      S.set(key(s.id, c), { u: mine.u, parts: mine.parts.slice(0, k).map((p, j) => (j % 2 === 0 ? f(p) : { id: p.id, lend: f(p.lend) })).map(gone) });
    }
  }

  // ---- G7 (`cap`): a real shrink; what a standing block covers is never more than its height. RELINK judges it against the heights it
  // ends with, after the blocks that left a column have given back what they had there, and every operation of the model is one
  // RELINK: `height`, and `width` when the re-measure at the new width gives another height (a text widened and got shorter, SIZE.8).
  // FOLLOW changes no stack and never reads a lend, so a height that falls and rises again between two RELINKs leaves no trace (H1)
  function capLends(x) {
    for (const st of S.values()) st.parts.forEach((p, j) => { if (j % 2 === 1 && p.id === x.id && len(p.lend) > x.h) p.lend = p.lend.slice(0, x.h); });
  }

  // ---- blocks moved by d rows in one step (a carry by hand, or a primitive moving several blocks with their gaps): rule 1.
  // Per column, each run of chain blocks that moved together keeps everything inside it; only the gap above the run and the gap
  // under it change. A gap holds the run's top when it has no slack there on the screen: the move is made on the displayed layout,
  // as if the temporary heights were real, and the canonical layout is that result with them taken out (H1), so where a temporary
  // height held the block the move is relative to it, and when it ends the block may stop where another column holds it. Moving down, the gap under the run loses rows, the run's own first, then from the top. The gap above it grows: where it holds
  // the run's top, by rows of its stack's u (unowned under the top); when the run stands in that stack and so does the gap under
  // it, by as many rows as the gap under it lost, whatever the slack, so that the stack keeps every row it had, and, where it holds
  // the run's top, by the rest as room of the run's top, its own rows. Moving up, the slack goes first, then rows from the
  // bottom of the gap above; under the run come first the slack used, as the run's top's own rows, then the rows it left, with
  // their owners (G5). In a column where the run's top is the first block, the free room it leaves and the slack it used become
  // its own (G6, GAP.8; with GAP.8 off they stay free room); with nothing under the run they go (G5).
  // A swap's neighbour (§5.1b) moves by the carried block's height on the screen, its temporary rows included; that displacement is
  // structural and writes none of them (O-21): `tmp`, the carried block's temporary rows. Going up, in a column the carried block comes into
  // over it, what the gap above the neighbour gains (the step where it holds it, or the rows its stack keeps where it stands in one stack
  // with the gap under it) is less by them, so that the carried block coming in there pushes it by them on the screen only; in a column of
  // its own, both gaps change by the step less them, as any move but for the carried block's temporary rows; going down, in
  // a column the carried block comes into under it (`under`), the rows that come under the neighbour are that many fewer, the carried
  // block's temporary rows its pass kept at its old place (rule 2) coming out as it comes back under the neighbour.
  // the rows the steps of this RELINK put round a run, so that a move cut into steps gives what one step gives, owners included: under a
  // run moved up, the slack used by all its steps comes first, then the rows they left, in order (`own`); over a run moved down in one
  // stack with the gap under it, the rows of u come first, then its room (`room`). Reset by each rule 1 (ruleOne)
  const added = { own: new Map(), room: new Map() };
  function moveIn(c, ids, d, sw = null) {
    const q = seq(c), moved = q.map((el) => ids.has(el.id)), runs = [];
    for (let a = 0; a < q.length; a++) {   // every run, with its two gaps and its slack, read before anything changes
      if (!moved[a] || (a > 0 && moved[a - 1])) continue;
      let z = a; while (z + 1 < q.length && moved[z + 1]) z++;
      const top = q[a], bot = q[z], ust = top.st, ui = top.i >= 0 ? top.i - 1 : ust.parts.length - 1;
      const [lst, li] = bot.i >= 0 ? [bot.st, bot.i + 1] : [lowerOf(bot.id, c), 0];
      const slack = B.get(top.id).y - spans(ust)[ui][1];
      // a gap that reaches past the row the step starts from (a departure of rule 2 made a temporary height above push the block through the
      // rows it kept) has no slack: the step moves the block by its rows from where the gap holds it, the push staying on the screen (O-23)
      runs.push({ r: top.id, head: a === 0, run: new Set(q.slice(a, z + 1).map((el) => el.id)), ust, ui, lst, li, sameStack: top.i >= 0 && lst === ust, holds: slack <= 0, slack: Math.max(0, slack) });
      a = z;
    }
    for (const { r, head, run, ust, ui, lst, li, sameStack, holds, slack } of runs) {
      if (d > 0) {
        // the swap's neighbour moving down, the swap going up (O-21): in a column the carried block comes into over it, the gap under it loses
        // the step (the carried block's temporary rows its pass kept are among those rows) and the gap above gains it less those rows; in a
        // column of its own, both gaps change by the step less them, the carried block's canonical height: the step is as any move there,
        // the carried block's temporary rows apart
        const cut = sw && sw.under.has(c), dd = sw && !cut ? Math.max(0, d - sw.tmp) : d;
        let k = dd, got = 0;
        if (lst) {
          const seg = lst.parts[li].slice();
          for (let j = 0; j < seg.length && k > 0; j++) if (run.has(seg[j])) { seg.splice(j, 1); j--; k--; got++; }
          const t = Math.min(k, seg.length); lst.parts[li] = seg.slice(t); got += t;
        }
        const grow = sameStack ? [...Array(got).fill(heirOf(ust)), ...Array(holds ? dd - got : 0).fill(r)] : Array(holds ? dd : 0).fill(heirOf(ust));
        if (cut) grow.splice(Math.max(0, grow.length - sw.tmp));
        // the room this RELINK's earlier steps gave the run's top stays after the rows of u this step adds
        const kr = key(r, c), seg = ust.parts[ui];
        let prevRoom = added.room.get(kr) || 0; while (prevRoom > 0 && seg[len(seg) - prevRoom] !== r) prevRoom--;
        const newU = grow.filter((o) => o !== r), newRoom = grow.filter((o) => o === r);
        ust.parts[ui] = [...seg.slice(0, len(seg) - prevRoom), ...newU, ...seg.slice(len(seg) - prevRoom), ...newRoom];
        added.room.set(kr, prevRoom + newRoom.length);
      } else {
        const k = -d, used = Math.min(k, slack), n = Math.min(len(ust.parts[ui]), k - used);
        const left = ust.parts[ui].slice(len(ust.parts[ui]) - n); ust.parts[ui] = ust.parts[ui].slice(0, len(ust.parts[ui]) - n);
        if (lst) {
          // the owners of what comes under the run: its top's own, the rows it left with theirs (G5, S7, G6/GAP.8); with GAP.5.1 off,
          // rows of the stack they come into, its u's, free room staying free; the lengths are the same either way
          const into = heirOf(lst), mine = !O.gap51 ? (head ? '' : into) : head && !O.gap8 ? '' : r;
          const owner = (o) => (!O.gap51 ? (o === '' ? '' : into) : o === '' && head ? mine : o);
          let cut = sw && sw.under.has(c) ? sw.tmp : 0;
          const own = used - Math.min(used, cut); cut -= used - own;
          // the slack this RELINK's earlier steps put under the run stays first, before the rows this step leaves
          const ko = key(r, c), seg = lst.parts[li];
          let prevOwn = added.own.get(ko) || 0; while (prevOwn > 0 && !seg.slice(0, prevOwn).every((o) => o === mine)) prevOwn--;
          lst.parts[li] = [...Array(own).fill(mine), ...seg.slice(0, prevOwn), ...left.slice(cut).map(owner), ...seg.slice(prevOwn)];
          added.own.set(ko, prevOwn + own);
        }
      }
    }
  }

  // every operation is all or nothing: a refused one leaves the state as it was
  const copy = () => ({ B: new Map([...B].map(([k, b]) => [k, { ...b }])), S: new Map([...S].map(([k, st]) => [k, { u: st.u, parts: st.parts.map((p, i) => (i % 2 ? { id: p.id, lend: p.lend.slice() } : p.slice())) }])) });
  const put = (s) => { B.clear(); for (const [k, b] of s.B) B.set(k, { ...b }); S.clear(); for (const [k, st] of s.S) S.set(k, st); };
  const atomic = (fn) => (...a) => { const s0 = copy(); try { return fn(...a); } catch (e) { put(s0); throw e; } };
  // GAP.6 a block taken away (deleted, or carried away in phase 1b): rule 2 in every column it covered, then FOLLOW
  function gap6(id) { const x = B.get(id), ys = rowsIn('canonical'); for (const c of cols(x)) leave(x, c, 'delete', ys); B.delete(id); follow(); }
  // every block as the operations take it, in frame coordinates: the `after` of a RELINK that changes nothing
  const framesNow = () => Object.fromEntries([...B.values()].map((b) => { const p = padOf(b); return [b.id, { c0: b.c0 + p, c1: b.c1 - p, y: b.y + p, h: b.h - 2 * p, e: b.e, ...(b.area ? { area: true } : {}) }]; }));
  // the declaration of steps and changes of columns: the carried block leaves as carried away and comes in at its displayed target, every
  // other block leaves as narrowed off and comes in by itself; heights: a new height for some blocks (a width with a re-measure)
  function widthsT(moves, widths, carried, heights = {}) {
    const a = framesNow(), leave = [], enter = [];
    for (const [list, d] of moves) for (const id of list) a[id] = { ...a[id], y: a[id].y + d };
    for (const [id, [f0, f1]] of Object.entries(widths)) {
      const x = B.get(id), p = padOf(x), was = cols(x), will = cols({ c0: f0 - p, c1: f1 + p });
      // a block that keeps some of its columns leaves the others as narrowed off, the carried one too (the owner, 2026-11-10, G8)
      for (const c of was) if (!will.includes(c)) leave.push([id, c, 'narrow']);
      for (const c of will) if (!was.includes(c)) enter.push([id, c, id === carried ? 'put' : 'self']);
      a[id] = { ...a[id], c0: f0, c1: f1 };
    }
    for (const [id, h] of Object.entries(heights)) a[id] = { ...a[id], h };
    return { after: a, steps: moves, leave, enter, carried };
  }
  const api = {
    B, S,
    open(blocks) {   // from places only (GAP.1): every gap fresh, owned by the block above, free room unowned; no temporary height
      B.clear(); S.clear();
      for (const b of blocks) { if (b.area && b.y < 1) throw new Error('an area at row 0'); B.set(b.id, { ...inside(b), e: 0 }); }
      const cs = new Set(); for (const b of B.values()) for (const c of cols(b)) cs.add(c);
      for (const c of [...cs].sort((a, b) => a - b)) {
        const col = [...B.values()].filter((b) => covers(b, c)).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
        let u = null;
        for (const b of col) { const n = b.y - (u == null ? 0 : B.get(u).y + B.get(u).h); if (n < 0) throw new Error('overlap at open'); S.set(key(b.id, c), { u, parts: [Array(n).fill(u == null ? '' : u)] }); u = b.id; }
      }
      follow(); return api;
    },
    // the operations that are one RELINK go through relink(T), with the declaration they make (frame coordinates, as they take them)
    _insert(b) {   // a block created where it is put: base does not hold it, it comes in at its displayed target
      const x = { e: 0, ...inside(b) }; if (B.has(x.id) || overlaps(x) || x.y < 0) throw new Error('insert overlaps');
      const a = framesNow(); a[b.id] = { e: 0, ...b };
      return raw.relink({ after: a, enter: cols(x).map((c) => [b.id, c, 'put']) });
    },
    _restore(b) {   // an undo puts a block back at its old cell, a canonical place: in every column by its canonical row (plan §6.4)
      const x = { e: 0, ...inside(b) }; if (B.has(x.id) || x.y < 0) throw new Error('restore overlaps');
      const a = framesNow(); a[b.id] = { e: 0, ...b, yc: b.y };
      raw.relink({ after: a, enter: cols(x).map((c) => [b.id, c, 'back']), carried: b.id, canonical: true });
      if (overlaps(B.get(b.id))) throw new Error('restore overlaps');
      return api;
    },
    _remove(id) { const a = framesNow(); delete a[id]; return raw.relink({ after: a }); },   // GAP.6
    _height(id, h) { if (!(h >= 1)) throw new Error('height'); const a = framesNow(); a[id] = { ...a[id], h }; return raw.relink({ after: a }); },   // a real change
    _show(id, e) { const x = B.get(id); if (!(e >= 0)) throw new Error('temporary'); x.e = e; follow(); return api; },             // a temporary one
    _width(id, f0, f1, h = null) {   // h: the height the re-measure gives it at its new width, if another (SIZE.8), a real change
      const x = B.get(id), c0 = f0 - padOf(x), c1 = f1 + padOf(x), H = h == null ? x.h : h + 2 * padOf(x);
      if (!(c0 <= c1)) throw new Error('no columns');
      if (h != null && !(h >= 1)) throw new Error('height');
      // in the columns it keeps, its new height is FOLLOW's (a taller block pushes what is under it); in the columns it comes into, it
      // must not hit at its new height
      if (cols({ c0, c1 }).some((c) => !covers(x, c) && overlaps({ ...x, c0: c, c1: c, h: H }, id))) throw new Error('width overlaps');
      return raw.relink(widthsT([], { [id]: [f0, f1] }, null, h == null ? {} : { [id]: h }));
    },
    _move(list, d) {   // one step: every block of `list` moved by d rows, within its columns
      const ids = new Set(list); if (!ids.size || !d) return api;
      for (const id of ids) if (overlaps({ ...B.get(id), y: B.get(id).y + d }, id, ids)) throw new Error('move overlaps');
      const want = new Map([...B.values()].map((b) => [b.id, b.y + d])), yc = rowsIn('canonical');
      const cs = new Set(); for (const id of ids) for (const c of cols(B.get(id))) cs.add(c);
      added.own.clear(); added.room.clear();
      for (const c of [...cs].sort((a, b) => a - b)) moveIn(c, ids, d);
      follow(); const yc2 = rowsIn('canonical');
      for (const id of ids) {
        if (B.get(id).y !== want.get(id)) throw new Error('move: the stacks do not put ' + id + ' at its row');
        const dc = yc2.get(id) - yc.get(id);   // canonically it moves the same way, at most as far
        if (d > 0 ? dc < 0 || dc > d : dc > 0 || dc < d) throw new Error('move: ' + id + ' moved ' + dc + ' canonically for ' + d);
      }
      return api;
    },
    carry(id, d) { return api.move([id], d); },
    _shift(k) {   // a uniform shift of every block's columns by k, promising a settled result: refused if a card would pass column 0
      shiftCols(k); if ([...B.values()].some((b) => b.c0 + padOf(b) < 0)) throw new Error('shift past the edge');
      return api;
    },
    _side(k, W) {   // an area's left side handle carried by k columns (inwards when k > 0), the area now W columns wide (LAYOUT-RULES §5.6,
      // AREA.3), as one change: every child keeps its cell on the sheet, `shift` re-keying the stacks through columns left of 0 (GAP.10);
      // then the wall presses every child left of column 0 to it, keeping its width, in one RELINK, as pressed aside: rule 2 as narrowed
      // off, rule 3 at its canonical row; containment is checked once, after the wall (phase 10), and a child that cannot fit even alone
      // refuses the handle. The model has no P-ASIDE chain and no P-SINK: a press that would hit another child is refused here, where
      // the engine presses that child aside or sinks the pressed one
      shiftCols(-k);
      const widths = {};
      for (const b of B.values()) { const f0 = b.c0 + padOf(b), f1 = b.c1 - padOf(b); if (f0 < 0) widths[b.id] = [0, f1 - f0]; }
      if (Object.keys(widths).length) raw.step([], widths);
      for (const b of B.values()) if (b.c0 + padOf(b) < 0 || b.c1 - padOf(b) > W - 1) throw new Error('the handle stops: ' + b.id + ' cannot fit');
      return api;
    },
    _step(moves = [], widths = {}, carried = null) {   // one RELINK: the steps of `moves` (rule 1) and blocks changing their columns
      // (rules 2, 3, 4); the `carried` block leaves its columns as carried away and comes in at its displayed target, every other one
      // leaves them as narrowed off and comes in at its reference. Every width not carried is checked at its target, top to bottom,
      // against the columns the ones before it took
      const target = new Map([...B.values()].map((b) => [b.id, b.y])); for (const [list, d] of moves) for (const id of list) target.set(id, target.get(id) + d);
      const seen = new Map([...B.values()].map((b) => [b.id, { ...b }]));
      const ord = Object.keys(widths).sort((a, b) => target.get(a) - target.get(b) || B.get(a).c0 - B.get(b).c0 || (a < b ? -1 : 1));
      for (const id of ord) {
        const x = seen.get(id), c0 = widths[id][0] - padOf(x), c1 = widths[id][1] + padOf(x), at = { ...x, c0, c1, y: target.get(id) };
        if (id !== carried) for (const b of seen.values()) if (b.id !== id && b.c0 <= at.c1 && at.c0 <= b.c1 && b.y < at.y + shownH(at) && at.y < b.y + shownH(b)) throw new Error('width overlaps');
        seen.set(id, { ...x, c0, c1 });
      }
      // a step that puts a block on another on the screen is no transition SETTLE declares (its push would be a step): refused, as RELINK's
      // check refuses it (INV-1 in after)
      const T = widthsT(moves, widths, carried), ex = Object.entries(T.after).map(([id, f]) => [id, inside(f)]);
      for (let i = 0; i < ex.length; i++) for (let j = i + 1; j < ex.length; j++) { const [, a] = ex[i], [, b] = ex[j];
        if (a.c0 <= b.c1 && b.c0 <= a.c1 && a.y < b.y + b.h + (b.e || 0) && b.y < a.y + a.h + (a.e || 0)) throw new Error('step overlaps'); }
      return raw.relink(T);
    },
    _fit(targets) {   // rule 5: a block SETTLE put lower than FOLLOW over the stacks puts it (targets: id → displayed row) gets, in its
      // binding stack, the rows it lacks, owned by that stack's u; a block FOLLOW puts lower than its target stays there: no stack is cut
      const order = Object.keys(targets).sort((a, b) => B.get(a).y - B.get(b).y || B.get(a).c0 - B.get(b).c0 || (a < b ? -1 : 1));   // reading order (INV-5)
      for (const id of order) {
        const x = B.get(id), t = targets[id] - padOf(x); if (t <= x.y) continue;
        for (const c of cols(x)) {
          const f = seq(c).find((el) => el.id === id); if (!f) continue;   // a column it is yet to come into (RELINK's measuring copy)
          const st = f.st, i = f.i >= 0 ? f.i - 1 : st.parts.length - 1;
          if (x.y === spans(st)[i][1]) { st.parts[i] = [...st.parts[i], ...Array(t - x.y).fill(heirOf(st))]; break; }
        }
        follow();
      }
      return api;
    },
    _carryTo(id, f0, f1, fy, canonical = false) {   // carried away to other columns (DRAG.B1, GAP.7): rule 2 where it was, rule 3 or 4 where it lands;
      // canonical: an undo carrying it back to its old cell, placed by its canonical row in every column (plan §6.4)
      const x = B.get(id), c0 = f0 - padOf(x), c1 = f1 + padOf(x), y = fy - padOf(x); if (!(c0 <= c1)) throw new Error('no columns');
      if (!canonical && cols(x).some((c) => c0 <= c && c <= c1)) return raw.step(y === x.y ? [] : [[[id], y - x.y]], { [id]: [f0, f1] }, id);   // it keeps some columns: one RELINK
      const was = cols(x), will = cols({ c0, c1 }), fr = framesNow()[id];
      if (canonical) {
        const a = framesNow(); a[id] = { ...fr, c0: f0, c1: f1, y: fy, yc: fy };
        raw.relink({ after: a, leave: was.map((c) => [id, c, 'away']), enter: will.map((c) => [id, c, 'back']), carried: id, canonical: true });
        if (overlaps(B.get(id), id)) throw new Error('carry overlaps'); return api;
      }
      // carried away: phase 1b takes it away first (GAP.6), so RELINK's base has its place closed, and it comes in where it is put as a
      // block base does not hold
      if (overlaps({ ...x, c0, c1, y }, id)) throw new Error('carry overlaps');
      const order = [...B.keys()];
      { const g = framesNow(); delete g[id]; raw.relink({ after: g }); }   // GAP.6
      if (overlaps({ ...x, c0, c1, y }, id)) throw new Error('carry overlaps');   // the blocks under it rose into its place (G2)
      const a = framesNow(); a[id] = { ...fr, c0: f0, c1: f1, y: fy };
      raw.relink({ after: a, enter: will.map((c) => [id, c, 'put']), carried: id });
      { const all = new Map(B); B.clear(); for (const k of order.filter((k) => all.has(k))) B.set(k, all.get(k)); }   // the blocks in the order they were made
      if (B.get(id).y !== y) throw new Error('carryTo: the stacks do not put ' + id + ' at its row'); return api;
    },
    // One RELINK on an explicit transition (step 1b): what SETTLE declares it did, checked against the geometry by the caller.
    // T, in the model's frame coordinates: after {id: {c0, c1, y, h, e, yc, area}} (y the displayed target, yc the canonical one of an
    // undo's carry back), steps [[ids, d]] (rule 1, rigid, in order), carried, canonical (the carried block is an undo's carry back),
    // leave [[id, c, why]] (why: away, narrow, press), enter [[id, c, how]] (how: put, at its displayed target, the carried or a created
    // block; self, at its reference, widened or pressed in; back, an undo's, at its canonical target) and pass [[id, c]] (in column c,
    // which it keeps, id, a block of a swap, changes its place in the chain: it leaves its old place freeing nothing, whatever the
    // switches, and comes back at its displayed target). Columns are GAP's, an area's extent ones.
    _relink(T) {
      const tg = new Map(Object.entries(T.after).map(([id, b]) => { const { yc, ...rest } = b; return [id, { id, e: 0, ...inside({ e: 0, ...rest }) }]; }));
      const steps = T.steps || [], carried = T.carried ?? null, canonical = !!T.canonical;
      const kv = (list) => { const m = new Map(); for (const [id, c, w] of list || []) m.set(key(id, c), w); return m; };
      const LV = kv(T.leave), EN = kv(T.enter), PS = new Map((T.pass || []).map(([id, c]) => [key(id, c), 'pass']));
      const passWhy = new Map((T.pass || []).map(([id]) => [id, 'pass']));
      const byTarget = (a, b) => tg.get(a).y - tg.get(b).y || tg.get(a).c0 - tg.get(b).c0 || (a < b ? -1 : 1);
      // GAP.6 first, top to bottom, for every block after does not hold
      for (const id of [...B.keys()].filter((id) => !tg.has(id)).sort((a, b) => B.get(a).y - B.get(b).y || (a < b ? -1 : 1))) gap6(id);
      // O-25 (the owner, 2026-11-11, G16): a block that comes into a column by itself and keeps none of its columns of base follows the
      // blocks that stood over it in base, in any of its chains: it comes in under them, with the gap its reference gives
      const uppersOf = new Map();
      for (const [id, t] of tg) {
        const x = B.get(id); if (!x || (t.c0 <= x.c1 && x.c0 <= t.c1)) continue;   // it keeps a column of base: nothing to follow
        if (!cols(t).some((c) => EN.get(key(id, c)) === 'self')) continue;
        const up = new Set(); for (const c of cols(x)) { const ch = seq(c).map((el) => el.id); for (const u of ch.slice(0, ch.indexOf(id))) up.add(u); }
        if (up.size) uppersOf.set(id, up);
      }
      const ys = rowsIn('canonical');   // the canonical rows of base, by which rule 2 measures
      const anchoredIn = new Set(S.keys());   // the (block, column) where a block is an anchor in base: a passer comes back there as one
      // the rows the first step starts from: FOLLOW over base's stacks with after's heights, a height a phase changed being no move
      const startOf = () => { const s = copy(); for (const [id, t] of tg) if (B.has(id)) { B.get(id).h = t.h; B.get(id).e = t.e; } follow(); const y = new Map([...B.values()].map((b) => [b.id, b.y])); put(s); return y; };
      const start = startOf();
      // the rows the first step starts from, when the transition gives them, are FOLLOW's over base's stacks with after's heights
      if (T.start) for (const [id, y] of Object.entries(T.start)) if (B.has(id) && frameRow(B.get(id), start.get(id)) !== y) throw new Error(`relink: ${id} starts at ${y}, FOLLOW gives ${frameRow(B.get(id), start.get(id))}`);
      const fits = {}; for (const [list] of steps) for (const id of list) if (tg.has(id)) fits[id] = T.after[id].y;
      // the blocks the transition names as moved, beyond its steps' (the owner, 2026-11-11, G15): held at their targets too, one whose
      // steps add up to nothing included, so that a path cut again with the same ends holds the same blocks
      for (const id of T.moved || []) if (tg.has(id)) fits[id] = T.after[id].y;
      if (carried != null && !canonical && tg.has(carried)) fits[carried] = T.after[carried].y;
      const departAll = (out) => {   // rule 2, column by column, top to bottom in each chain: out(id, c) → why or null
        const cs = new Set(); for (const b of B.values()) for (const c of cols(b)) cs.add(c);
        // the passes come after every other departure, in every column: a pass frees nothing, so what the others give back is measured with
        // the passer still in its place; and every pass is measured on the same canonical rows, taken once then, so that a block passing in
        // several columns keeps the same place whichever column is taken first
        const order = [...cs].sort((a, b) => a - b), ws = order.map((c) => [c, seq(c).map((el) => [el.id, out(el.id, c)]).filter(([, w]) => w)]);
        for (const [c, list] of ws) for (const [id, w] of list) if (w !== 'pass') leave(B.get(id), c, w, ys);
        if (ws.some(([, list]) => list.some(([, w]) => w === 'pass'))) {
          const ycPass = rowsIn('canonical');
          for (const [c, list] of ws) for (const [id, w] of list) if (w === 'pass') leave(B.get(id), c, w, ys, T.swap && id === T.swap[0] ? B.get(id).e : 0, ycPass);
        }
      };
      // the neighbour's swap step, its last (§5.1b), with the carried block's temporary rows and the columns it comes into (O-21)
      const swapStep = T.swap ? steps.map(([list]) => list.includes(T.swap[1])).lastIndexOf(true) : -1;
      const swapOf = swapStep >= 0 && tg.has(T.swap[0]) ? { tmp: tg.get(T.swap[0]).e, under: new Set(cols(tg.get(T.swap[0]))) } : null;
      const ruleOne = () => {   // the model's step: each step's slacks at the rows it starts from, FOLLOW after each
        const row = new Map(start); for (const b of B.values()) if (row.has(b.id)) b.y = row.get(b.id);
        added.own.clear(); added.room.clear();
        steps.forEach(([list, d], si) => {
          const ids = new Set(list.filter((id) => B.has(id))), cs = new Set(); for (const id of ids) for (const c of cols(B.get(id))) cs.add(c);
          const sw = si === swapStep ? swapOf : null;
          for (const c of [...cs].sort((a, b) => a - b)) moveIn(c, ids, d, sw);
          for (const id of ids) row.set(id, row.get(id) + d);
          // every step's slacks are measured at the rows the declaration gives: each block at the row it starts from plus the steps that moved
          // it so far, the gaps those rule 2 left and the steps before made. So a move cut into steps gives what one step gives, a block that
          // left a column in the same RELINK or passed out of one included (a block created here, out of every chain, follows FOLLOW)
          follow(); for (const b of B.values()) if (row.has(b.id)) b.y = row.get(b.id);
        });
      };
      const capAll = () => { for (const x of B.values()) capLends(x); };
      // a block put at its displayed row into the columns cs (rule 3). Moved by hand (the carried block, a block of a swap coming back): its
      // canonical row the largest its columns give, those it keeps and those it comes into, measured on the canonical rows of this layout
      // with rule 5 made (the moved blocks at their targets), so that no temporary push of another block is written under it. Created: the
      // rest of the seg under it, as on the screen, so that taking it away gives every row back (INV-7 b)
      const putIn = (id, cs, passes = () => false) => {
        const res = (c) => passes(c) && anchoredIn.has(key(id, c));
        if (!ys.has(id)) { for (const c of cs) enter(B.get(id), c, null, false, null, null, res(c)); return; }
        const s0 = copy(); follow(); raw.fit(Object.fromEntries(Object.entries(fits).filter(([k]) => k !== id && B.has(k)))); const yc = rowsIn('canonical'); put(s0); atTargets();
        const x = B.get(id), inChain = (c) => seq(c).some((el) => el.id === id);
        let canon = cols(x).some(inChain) ? yc.get(id) : 0;
        for (const c of cs) canon = Math.max(canon, slot(x, c, yc));
        const targetOf = (k) => (k in fits && B.has(k) ? fits[k] - padOf(B.get(k)) : null);
        for (const c of cs) enter(x, c, null, false, canon, yc, res(c), targetOf);
      };
      const atTargets = () => { for (const b of B.values()) if (tg.has(b.id)) b.y = tg.get(b.id).y; };
      // R, the reference: every block keeps the columns of base, an undo's carry back out of all of them; a declared passer leaves every
      // column of base where its order changes and comes back there at its displayed target; the heights of after, cap, rule 1, rule 5.
      // A change of order no passer explains is a wrong declaration
      const W0 = copy();
      // the carried block leaves in R the columns it leaves, as carried away (all of them for an undo's carry back, which is then out)
      if (carried != null && B.has(carried)) {
        const x = B.get(carried), t = tg.get(carried); for (const c of cols(x)) if (canonical || !covers(t, c)) leave(x, c, canonical ? 'away' : 'narrow', ys);
        const k0 = Math.max(x.c0, t.c0), k1 = Math.min(x.c1, t.c1);   // the columns it keeps
        if (canonical || k0 > k1) B.delete(carried); else { x.c0 = k0; x.c1 = k1; }
      }
      const rOut = new Map();
      { const cs = new Set(); for (const b of B.values()) for (const c of cols(b)) cs.add(c);
        for (const c of cs) {
          const m = seq(c).map((el) => el.id).filter((id) => tg.has(id));
          for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
            if (tg.get(m[i]).y < tg.get(m[j]).y) continue;   // still above
            // in a column the two blocks of a swap share, the carried block is the one that passes (the neighbour stayed and moved)
            const pair = T.swap && T.swap.includes(m[i]) && T.swap.includes(m[j]);
            const ps = pair ? [T.swap[0]] : [m[i], m[j]].filter((id) => passWhy.has(id));
            const kept = covers(tg.get(m[i]), c) && covers(tg.get(m[j]), c);
            if (!ps.length && kept) throw new Error(`relink: ${m[i]} and ${m[j]} change their order in column ${c} and neither is declared to pass`);
            for (const id of ps) { if (!rOut.has(id)) rOut.set(id, new Set()); rOut.get(id).add(c); }
          }
        } }
      departAll((id, c) => (rOut.has(id) && rOut.get(id).has(c) ? passWhy.get(id) : null));
      for (const [id, t] of tg) if (B.has(id)) { B.get(id).h = t.h; B.get(id).e = t.e; }
      capAll(); ruleOne(); atTargets();
      for (const id of [...rOut.keys()].sort(byTarget)) putIn(id, [...rOut.get(id)].sort((a, b) => a - b), () => true);
      follow(); raw.fit(Object.fromEntries(Object.entries(fits).filter(([id]) => B.has(id))));
      const ref = rowsIn('canonical');
      put(W0);
      // W: rule 2 as declared and the passers out of the columns they pass in; the blocks after creates; the heights and columns of after;
      // cap; rule 1; then the arrivals in two passes, top to bottom: the blocks put at a place, then those that come in by themselves
      departAll((id, c) => LV.get(key(id, c)) || PS.get(key(id, c)) || null);
      for (const [id, t] of tg) if (!B.has(id)) B.set(id, { ...t });
      for (const [id, t] of tg) { const b = B.get(id); b.h = t.h; b.e = t.e; b.c0 = t.c0; b.c1 = t.c1; }
      capAll(); ruleOne(); atTargets();
      const ids = [...tg.keys()].sort(byTarget), own = (id, c) => !seq(c).some((el) => el.id === id);
      for (const id of ids) {
        // put at its displayed row: its canonical row is the largest its columns give, those it keeps and those it comes into
        const putCs = cols(B.get(id)).filter((c) => own(id, c) && (EN.get(key(id, c)) === 'put' || PS.has(key(id, c))));
        if (putCs.length) putIn(id, putCs, (c) => PS.has(key(id, c)));
        const x = B.get(id);
        for (const c of cols(x)) if (own(id, c) && EN.get(key(id, c)) === 'back') {
          const yb = rowsIn('canonical'); yb.set(id, T.after[id].yc != null ? T.after[id].yc - padOf(x) : x.y); enter(x, c, yb, true);
        }
      }
      follow();
      // M, where the blocks that come in by themselves are measured: W with rule 5 made, so that a block rule 5 is to lower is measured
      // where it will stand, and nothing of it written; each such block comes in at its reference
      const W1 = copy(); raw.fit(fits); const M = rowsIn('canonical'); put(W1); atTargets();
      // top to bottom, but a block that follows an old upper neighbour (O-25) after that neighbour, when it comes in by itself too (the
      // independent review of 0eda0ba)
      for (const id of followOrder(ids.filter((id) => cols(B.get(id)).some((c) => EN.get(key(id, c)) === 'self')), uppersOf)) {
        const x = B.get(id), self = cols(x).filter((c) => EN.get(key(id, c)) === 'self' && own(id, c));
        if (!self.length) continue;
        M.set(id, ref.has(id) ? ref.get(id) : M.get(id));
        for (const c of self) enter(x, c, M, false, null, null, false, null, uppersOf.get(id) || null);
      }
      follow(); raw.fit(fits);
      const errs = invariants(); if (errs.length) throw new Error('relink: ' + errs[0]);
      return api;
    },
    rowsWith(heights) {   // the displayed frame rows FOLLOW gives over the stacks with these heights ({id: {h, e}}, frame), nothing written
      const s0 = copy();
      for (const [id, v] of Object.entries(heights)) { const b = B.get(id); if (!b) continue; b.h = v.h + 2 * padOf(b); b.e = v.e || 0; }
      follow(); const r = Object.fromEntries([...B.values()].map((b) => [b.id, frameRow(b, b.y)])); put(s0); follow(); return r;
    },
    // every block in frame coordinates, as SETTLE reads a layout: its columns, its displayed and canonical rows, its height and temporary rows
    frames() { const yc = rowsIn('canonical'); return Object.fromEntries([...B.values()].map((b) => { const p = padOf(b); return [b.id, { c0: b.c0 + p, c1: b.c1 - p, y: b.y + p, yc: yc.get(b.id) + p, h: b.h - 2 * p, e: b.e, ...(b.area ? { area: true } : {}) }]; })); },
    rows(measure = 'shown') { const y = measure === 'shown' ? new Map([...B.values()].map((b) => [b.id, b.y])) : rowsIn('canonical'); return Object.fromEntries([...B.keys()].sort().map((id) => [id, frameRow(B.get(id), y.get(id))])); },
    stack(l, c) { const st = S.get(key(l, c)); return st ? show(st) : null; },
    save() { return copy(); },                                   // the whole state, temporaries included
    load(s) {   // a copy of the state, so that what runs after it never changes the state saved
      put({ B: new Map([...s.B].map(([k, b]) => [k, { ...b }])), S: new Map([...s.S].map(([k, st]) => [k, { u: st.u, parts: st.parts.map((p, i) => (i % 2 ? { id: p.id, lend: p.lend.slice() } : p.slice())) }])) });
      follow(); return api;
    },
    stored() { const s = copy(); for (const b of s.B.values()) b.e = 0; return s; },   // what 0.2 stores: places, sizes and stacks, no temporary
    places() { const y = rowsIn('canonical'); return [...B.values()].map((b) => { const p = padOf(b); return { id: b.id, c0: b.c0 + p, c1: b.c1 - p, y: y.get(b.id) + p, h: b.h - 2 * p, ...(b.area ? { area: true } : {}) }; }); },   // what 0.1 stores
    snapshot() {
      const yc = rowsIn('canonical');
      const bs = [...B.values()].map((b) => [b.id, b.c0, b.c1, b.y, yc.get(b.id), b.h, b.e]).sort();
      const ss = [...S.entries()].map(([k, st]) => [k, show(st)]).sort();
      return JSON.stringify([bs, ss]);
    },
    check() { return invariants(); },
  };
  const raw = {};
  for (const name of ['insert', 'restore', 'remove', 'height', 'show', 'width', 'move', 'carryTo', 'fit', 'step', 'shift', 'side', 'relink']) { raw[name] = api['_' + name]; api[name] = atomic(raw[name]); delete api['_' + name]; }

  // GAP.10: every block's columns and every stack move by k; nothing is left or entered, so owners and lends stay. The columns may pass
  // the container's edge on the way (an area's left side handle, before its wall presses the children back): no containment here
  function shiftCols(k) {
    for (const b of B.values()) { b.c0 += k; b.c1 += k; }
    const moved = [...S.entries()].map(([kk, st]) => { const [l, c] = kk.split('|'); return [key(l, +c + k), st]; });
    S.clear(); for (const [kk, st] of moved) S.set(kk, st);
    follow();
  }
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
