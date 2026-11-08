// Node: GAP.5 rule 2, leave (public/layout/gap.js `relink`, `remove`): a standing block gives its lend back, whatever made it leave (C3,
// S8), or takes it along with GAP.5.2 off; an anchor's stack joins the one under it; narrowed off, its rows stay (G8, GAP.9) or go with
// GAP.9 off; the carried block leaves the columns it leaves as carried away, though it keeps others; under the last anchor the lowest
// standing block takes its place, the stack cleared with GAP.5.2 off; a block carried past a neighbour of a column it keeps counts as
// leaving its old place and coming in at its new one (the engine's own case: the lab model keeps every chain's order).
import { relink, remove, follow, resize } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { eq, done, box, placed, edit, stack, rows, canon, steps, clean } from './lib/gapcase.mjs';

const ins = (L, b, R = DEFAULT) => relink(L, edit(L, (m) => m.set(b.id, b)), {}, b.id, R);
for (const on of [true, false]) {
  const R = resolve({ 'GAP.5.2': on });
  const s = remove(ins(placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]), box('X', 1, 1, 4), R), 'X', R);
  eq(`1 GAP.5.2 ${on ? 'on' : 'off'}: a standing block deleted ${on ? 'gives its lend back' : 'takes its lend along'}`, [rows(s).L, stack(s, 'L', 1)], on ? [10, 'A | A9 |'] : [9, 'A | A8 |']);
  const a = remove(placed([box('A', 1, 1, 0), box('X', 1, 1, 4), box('L', 1, 1, 8)]), 'X', R);
  eq(`1a GAP.5.2 ${on ? 'on' : 'off'}: an anchor deleted, ${on ? 'its own rows go' : 'the rows of its stack go too'}`, [rows(a).L, stack(a, 'L', 1)], on ? [4, 'A | A3 |'] : [1, 'A | · |']);
  const p = remove(ins(ins(placed([box('L', 1, 1, 10)]), box('X', 1, 1, 5), R), box('Y', 1, 1, 7), R), 'L', R);
  eq(`1b GAP.5.2 ${on ? 'on' : 'off'}: the last anchor deleted, Y takes its place${on ? '' : ', its stack cleared'} (r10.4)`, [rows(p).X, rows(p).Y, stack(p, 'Y', 1)], on ? [5, 7, 'top | _5 [X:_1] _1 |'] : [0, 1, 'top | · [X:·] · |']);
}
for (const on of [true, false]) {
  const R = resolve({ 'GAP.9': on }), L = placed([box('A', 1, 3, 0), box('X', 1, 3, 2), box('L', 1, 3, 6)]);
  const n = relink(L, edit(L, (m, set) => set('X', { col: 1 })), {}, null, R);
  eq(`2 GAP.9 ${on ? 'on' : 'off'}: X narrowed off column 1 ${on ? 'leaves its body and rows there (G8)' : 'takes them along'}`, [stack(n, 'L', 1), stack(n, 'L', 2), rows(remove(n, 'X', R)).L], on ? ['A | A5 |', 'X | X3 |', 6] : ['A | A1 |', 'X | X3 |', 2]);
}
const S = placed([box('A', 1, 3, 0), box('X', 1, 3, 2), box('L', 1, 3, 6)]);
const c = relink(S, edit(S, (m, set) => set('X', { col: 1 })), {}, 'X', DEFAULT);
eq('3 carried one column sideways, X keeps two columns: in the one it leaves it is carried away, its rows go with it (final.1)', [rows(c).L, stack(c, 'L', 1), stack(c, 'L', 2), stack(c, 'X', 4)], [6, 'A | A1 |', 'X | X3 |', 'top | _2 |']);
eq('3a deleted then, L rises to its place (G2)', rows(remove(c, 'X', DEFAULT)).L, 2);
const P = placed([box('X', 1, 1, 2), box('B', 1, 1, 6)]);
const past = relink(P, edit(P, (m, set) => set('X', { y: 10 })), { X: steps([1, 8]) }, 'X', DEFAULT);
eq('4 X carried down past B in their column: it leaves its place, taking its rows, B rises into it (G2), and X comes in under B', [rows(past), stack(past, 'B', 1), stack(past, 'X', 1)], [{ B: 2, X: 10 }, 'top | _2 |', 'B | B7 |']);
clean('4a invariants', past);
// the code review of step 1 (#132): blocks that pass others, two departures from one column, a deletion inside RELINK, ids of any form
const Y0 = placed([box('X', 1, 1, 1), box('Y', 1, 2, 4)]);
const pw = relink(Y0, edit(Y0, (m, set) => { set('X', { y: 10, yc: 10 }); set('Y', { w: 4 }); }), { X: steps([1, 9]) }, 'X', DEFAULT);
eq('5 X carried past Y while Y widens into column 3 by itself: Y\'s reference is not pushed by X, so Y stays at 4', [rows(pw), stack(pw, 'Y', 3)], [{ X: 10, Y: 4 }, 'top | _4 |']);
const V0 = placed([box('X', 1, 1, 6), box('Y', 1, 1, 2)]);
const upw = relink(V0, edit(V0, (m, set) => set('X', { w: 3, y: 0, yc: 0 })), { X: steps([1, -6]) }, null, DEFAULT);
eq('5d X moved up past Y while it widens into column 2: its own reference is where it came in above Y, row 0, and Y stays', [rows(upw), stack(upw, 'X', 2)], [{ X: 0, Y: 2 }, 'top | · |']);
const P0 = placed([box('X', 1, 1, 1), box('Y', 1, 2, 4), box('Z', 2, 2, 7)]);
const two2 = relink(P0, edit(P0, (m, set) => { set('X', { y: 10, yc: 10 }); set('Y', { w: 4, y: 8, yc: 8 }); }), { X: steps([1, 9]), Y: steps([2, 4]) }, null, DEFAULT);
eq('5e X passes Y in column 1 and Y passes Z in column 2, Y widening into column 3: X does not push Y\'s reference', [rows(two2), stack(two2, 'Y', 3)], [{ X: 10, Y: 8, Z: 7 }, 'top | _8 |']);
clean('5f invariants', two2);
// T, two of its three rows temporary, moved past A in column 4 and A moved down a row while W widens into column 5 by itself: when T
// leaves A's column, A shows two rows higher and rule 5 gives them back; W comes into column 5 after that, so the temporary rows push W on
// the screen only and it rises to 16 when they end, as two RELINKs (the pass, then the widening) would leave it
const G0 = follow(resize(placed([box('T', 3, 4, 2), box('A', 4, 5, 4), box('W', 4, 4, 14)]), 'T', 3, 2));
const tw = relink(G0, edit(G0, (m, set) => { set('T', { y: 11 }); set('A', { y: 7 }); set('W', { w: 3 }); }), { T: steps([1, 9]), A: steps([2, 1]) }, null, DEFAULT);
eq('5g a moved block given back the temporary rows of a block that passed it pushes nothing canonically into a column that comes in by itself', [rows(tw), canon(tw), stack(tw, 'W', 5), rows(follow(resize(tw, 'T', 1, 0)))], [{ A: 7, T: 11, W: 18 }, { A: 7, T: 11, W: 16 }, 'A | A8 |', { A: 7, T: 11, W: 16 }]);
clean('5h invariants', tw);
// D moved up past B in the two columns they share while it leaves column 1, B moved down and widening into column 3: the reference copy,
// where D keeps column 1, has D above B there too, so no column holds them in both orders
const B0 = placed([box('B', 1, 2, 1), box('D', 1, 2, 4)]);
const cross = relink(B0, edit(B0, (m, set) => { set('B', { w: 4, y: 5, yc: 5 }); set('D', { col: 1, w: 2, y: 0, yc: 0 }); }), { D: steps([1, -4]), B: steps([2, 4]) }, null, DEFAULT);
eq('5i a block that passes another while it leaves one of their columns: no cycle, and the rows two RELINKs give', [rows(cross), stack(cross, 'B', 3)], [{ B: 5, D: 0 }, 'top | _5 |']);
clean('5j invariants', cross);
// B, pushed to 12 by A's growth in column 1 (its stack in column 2 still 11), moved down a row and shifted from columns 1–2 to 2–3; P passing
// Q in column 10 in the same RELINK, or not: rule 5 before the blocks that come in by themselves is for the blocks a pass concerns, so B's
// memory is the same either way, and narrowed back to column 2 it stands at 11, as the model has it
const M0 = (() => { const L = follow(resize(placed([box('A', 1, 1, 0), box('B', 1, 2, 11), box('P', 10, 10, 1), box('Q', 10, 10, 4)]), 'A', 2)); return relink(L, L, {}, null, DEFAULT); })();
const shiftB = (pass) => {
  const out = relink(M0, edit(M0, (m, set) => { set('B', { col: 1, w: 3, y: 13, yc: 13 }); if (pass) set('P', { y: 10, yc: 10 }); }), pass ? { B: steps([1, 1]), P: steps([2, 9]) } : { B: steps([1, 1]) }, null, DEFAULT);
  const back = relink(out, edit(out, (m, set) => set('B', { col: 1, w: 2 })), {}, null, DEFAULT);
  return [rows(out).B, stack(out, 'B', 2), rows(back).B];
};
eq('5k a pass in columns far away changes nothing of a block that moves and shifts its columns', [shiftB(false), shiftB(true)], [[13, 'top | _11 |', 11], [13, 'top | _11 |', 11]]);
const D0 = placed([box('U', 1, 1, 0), box('A', 1, 1, 3), box('D', 1, 1, 6)]);
const up = relink(D0, edit(D0, (m, set) => set('D', { y: 1, yc: 1 })), { D: steps([1, -5]) }, null, DEFAULT);
eq('5a no carried block: D moved up past A is the one displaced, not A, which stays; D comes in at its target, in A\'s gap', [rows(up), stack(up, 'A', 1)], [{ A: 3, D: 1, U: 0 }, 'U | · [D:U1] U1 |']);
clean('5b invariants', up);
const W0 = placed([box('X', 1, 1, 1), box('Y', 1, 1, 4)]);
const pw2 = relink(W0, edit(W0, (m, set) => set('X', { w: 3, y: 10, yc: 10 })), { X: steps([1, 9]) }, null, DEFAULT);
const nar = relink(pw2, edit(pw2, (m, set) => set('X', { col: 1, w: 2 })), {}, null, DEFAULT);
eq('5c X moved past Y while it widens into column 2: its own reference there is its own row, so it holds X at 10 when Y goes or X leaves column 1', [rows(pw2), stack(pw2, 'X', 2), rows(remove(pw2, 'Y', DEFAULT)).X, rows(nar).X], [{ X: 10, Y: 4 }, 'top | _10 |', 10, 10]);
const T0 = placed([box('X', 1, 1, 1), box('Y', 1, 2, 4), box('L', 1, 2, 8)]);
const two = relink(T0, edit(T0, (m, set) => { set('X', { y: 12, yc: 12 }); set('Y', { col: 1, w: 2 }); }), { X: steps([1, 11]) }, 'X', DEFAULT);
eq('6 two departures from column 1 in one RELINK, X carried past L and Y narrowed off: top to bottom in the chain, so Y\'s body stays (GAP.9)', [rows(two), stack(two, 'L', 1), rows(remove(two, 'Y', DEFAULT)).L], [{ L: 8, X: 12, Y: 4 }, 'top | _8 |', 8]);
for (const [del, nar] of [['Z', 'A'], ['A', 'Z']]) {
  const Z0 = placed([box(del, 1, 1, 1), box(nar, 1, 2, 4), box('L', 1, 2, 7)]);
  const inside = relink(Z0, edit(Z0, (m, set) => { m.delete(del); set(nar, { col: 1, w: 2, y: 0, yc: 0 }); }), { [nar]: steps([1, -4]) }, null, DEFAULT);
  const g = remove(Z0, del, DEFAULT), first = relink(g, edit(g, (m, set) => set(nar, { col: 1, w: 2, y: 0, yc: 0 })), { [nar]: steps([1, -4]) }, null, DEFAULT);
  eq(`7 a block deleted inside RELINK (${del}) is taken away first, as GAP.6 in phase 1b: the same stacks, whatever the ids`, [rows(inside), stack(inside, 'L', 1), rows(remove(inside, nar, DEFAULT)).L], [rows(first), stack(first, 'L', 1), rows(remove(first, nar, DEFAULT)).L]);
}
const C0 = placed([box('a', 1, 1, 2), box('a,a', 1, 1, 6)]);
const cm = relink(C0, edit(C0, (m, set) => set('a,a', { y: 0, yc: 0 })), { 'a,a': steps([1, -6]) }, 'a,a', DEFAULT);
eq('8 ids that hold a comma: «a,a» carried above «a» is seen passing it', rows(cm), { a: 2, 'a,a': 0 });
done();
