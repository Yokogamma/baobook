// Node: the rules of a change of owner (public/owner/model.js, docs/OWNER-ERA-PLAN.md §3–§5, stage 1). No store and no browser: the era
// of a store and what moves it, a write and a read against the era of a screen, the two results of a check, the reach of a confirmed
// deletion, `lrev` across a change that keeps the records, the fallback copies of every kind, the messages between tabs, and the
// compatibility table of §5 with the records code before the plan writes (an `epoch` without `era`).
import { ERA0, ERA_FREE, eraOf, nextEpoch, erases, expected, judgeWrite, judgeRead, memoryCurrent, judgeView, cloudIsOwners, reachOf, judgeReach,
  keptLrev, judgeCopy, judgeMessage } from '../public/owner/model.js';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const throws = (f) => { try { f(); return false; } catch (_) { return true; } };
const A = { uid: 'a', env: 'prod' }, B = { uid: 'b', env: 'prod' };
const old = (id) => ({ k: 'epoch', id });   // what code before the plan writes: no `era`
let seq = 0; const id = () => 'e' + (++seq);
const keep = (prev) => nextEpoch(prev, { id: id(), erase: false }), wipe = (prev) => nextEpoch(prev, { id: id(), erase: true });

/* ── 1. the era of a store (§3.1) ── */
ok('1 no epoch record is the initial era', eraOf(null) === ERA0 && eraOf(undefined) === ERA0);
ok('1a a record without era reads as its own id', eraOf(old('e9')) === 'e9');
ok('1b an empty or non-string era counts as none', eraOf({ id: 'e9', era: '' }) === 'e9' && eraOf({ id: 'e9', era: 0 }) === 'e9');
{ const first = keep(null);
  ok('1c a first sign-in keeps the initial era, written explicitly', first.era === ERA0 && eraOf(first) === ERA0 && first.id !== ERA0);
  const second = keep(first), third = keep(second);
  ok('1d changes that keep the records never move it', eraOf(second) === ERA0 && eraOf(third) === ERA0 && third.id !== second.id);
  const erased = wipe(third);
  ok('1e an erase starts a new era, named by its epoch', eraOf(erased) !== ERA0 && eraOf(erased) === erased.id);
  const after = keep(erased), again = wipe(after);
  ok('1f the new era is kept in turn, and the next erase moves it again', eraOf(after) === eraOf(erased) && eraOf(again) !== eraOf(after)); }
{ const o = old('x1'), k = keep(o);
  ok('1g over a record of old code a change that keeps the records keeps the era it read as', eraOf(k) === 'x1' && k.era === 'x1'); }
ok('1h an epoch needs an id, and not the one in force', throws(() => nextEpoch(null, { id: '', erase: false })) && throws(() => nextEpoch(old('e1'), { id: 'e1', erase: true })));
ok('1i no owner always erases; an owner erases only when asked', erases(null) && erases(null, { erase: false }) && erases(B, { erase: true }) && !erases(B) && !erases(B, {}));

/* ── 2. expectEpoch stays strict (§3.6) ── */
{ const e1 = keep(null), e2 = keep(e1);
  ok('2 nothing expected passes; the epoch decided over passes', expected(undefined, e2) && expected(e2.id, e2) && expected(null, null));
  ok('2a a change that kept the records refuses it too', !expected(e1.id, e2) && eraOf(e1) === eraOf(e2));
  ok('2b an expected epoch against no record, and no epoch against a record', !expected(e1.id, null) && !expected(null, e1)); }

/* ── 3. a write and a read against the era of a screen (§3.3 item 1, §3.2 item 4, §3.9) ── */
{ const e0 = null, e1 = keep(e0), e2 = keep(e1), e3 = wipe(e2), e4 = keep(e3);
  const screen0 = eraOf(e0), screen3 = eraOf(e3);
  ok('3 a screen read before a first sign-in writes after it, and after another change that kept the records',
    judgeWrite(screen0, e1).ok && judgeWrite(screen0, e2).ok);
  const r = judgeWrite(screen0, e3);
  ok('3a after an erase it is refused with «epoch»', !r.ok && r.code === 'epoch');
  ok('3b and stays refused whatever comes after the erase', !judgeWrite(screen0, e4).ok);
  ok('3c a screen read after the erase writes', judgeWrite(screen3, e3).ok && judgeWrite(screen3, e4).ok);
  ok('3d a screen with no era writes nothing', !judgeWrite(undefined, e1).ok && !judgeWrite('', null).ok);
  ok('3e the device name is the one operation not of an era', ERA_FREE.join() === 'deviceName' && judgeWrite(screen0, e3, 'deviceName').ok && !judgeWrite(screen0, e3, 'writeLocal').ok);
  ok('3f a read has no exception', judgeRead(screen0, e2).ok && !judgeRead(screen0, e3).ok && judgeRead.length === 2); }

/* ── 4. the two results of a check (§3.5) and the engine's memory (§3.3 item 4, §3.4) ── */
{ const e1 = keep(null), e2 = keep(e1), e3 = wipe(e2);
  const mem = { epoch: e1.id, owner: A };
  ok('4 the store as the memory knows it: same', judgeView(ERA0, mem, { epoch: e1, owner: A }) === 'same');
  ok('4a the owner changed and the records were kept: the queue is stale, the era is not', judgeView(ERA0, mem, { epoch: e2, owner: B }) === 'queue');
  ok('4b the records were erased: the era, whatever the memory', judgeView(ERA0, mem, { epoch: e3, owner: B }) === 'era' && judgeView(ERA0, { epoch: e3.id, owner: B }, { epoch: e3, owner: B }) === 'era');
  ok('4c a fresh memory over an old screen is still the era', judgeView(ERA0, { epoch: e3.id, owner: B }, { epoch: e3, owner: B }) !== 'same');
  ok('4d a first sign-in seen by a memory without an owner: the queue', judgeView(ERA0, { epoch: null, owner: null }, { epoch: e1, owner: A }) === 'queue');
  ok('4e the memory is current by epoch, uid and env', memoryCurrent(mem, { epoch: e1, owner: { ...A, email: 'x' } }) && !memoryCurrent(mem, { epoch: e1, owner: B }) && !memoryCurrent(mem, { epoch: e1, owner: { uid: 'a', env: 'dev' } }) && !memoryCurrent(mem, { epoch: e2, owner: A }) && memoryCurrent({ epoch: null, owner: null }, { epoch: null, owner: null }));
  ok('4f a step sends only to the owner\'s cloud', cloudIsOwners(A, { uid: 'a' }) && !cloudIsOwners(A, { uid: 'b' }) && !cloudIsOwners(null, { uid: 'a' }) && !cloudIsOwners(A, null) && cloudIsOwners(A, {})); }

/* ── 5. a confirmed deletion keeps its reach (§3.3 items 7 and 9) ── */
ok('5 without an owner a deletion is of this device, with one of every device', reachOf(null) === 'here' && reachOf(A) === 'all');
{ const wider = judgeReach('here', A);
  ok('5a confirmed for this device, an owner in the store: refused with «reach», naming the reach to ask about', !wider.ok && wider.code === 'reach' && wider.reach === 'all');
  ok('5b the same reach goes on', judgeReach('here', null).ok && judgeReach('all', A).ok && judgeReach('all', B).reach === 'all');
  ok('5c a narrower one goes on', judgeReach('all', null).ok && judgeReach('all', null).reach === 'here');
  ok('5d a reach is «here» or «all»', throws(() => judgeReach(undefined, A)) && throws(() => judgeReach('everywhere', null))); }

/* ── 6. lrev across a change that keeps the records (§3.7) ── */
{ const k = keptLrev({ lrev: 2, baseLrev: 2 });
  ok('6 above the number the screen remembers, ahead of no base', k.lrev === 3 && k.baseLrev === 0);
  ok('6a a note with no meta starts at 1, as today', keptLrev(null).lrev === 1 && keptLrev({}).lrev === 1 && keptLrev({ lrev: 'x' }).lrev === 1 && keptLrev({ lrev: -4 }).lrev === 1);
  // the collision of the plan: the screen remembers 2, the change, one write of another tab
  const afterChange = keptLrev({ lrev: 2 }).lrev, otherTab = afterChange + 1;
  ok('6b the collision: no later number equals the remembered one', afterChange !== 2 && otherTab !== 2);
  let l = 5; const seen = new Set([l]); let mono = true; for (let i = 0; i < 20; i++) { l = i % 3 ? l + 1 : keptLrev({ lrev: l }).lrev; if (seen.has(l)) mono = false; seen.add(l); }
  ok('6c writes and changes in any order never repeat a number', mono); }

/* ── 7. fallback copies (§4) ── */
{ const e1 = keep(null), e2 = keep(e1), e3 = wipe(e2), e4 = keep(e3);
  const marked = (era) => ({ kind: 'marked', era });
  ok('7 a marked copy moves into the era it was made in, across changes that kept the records', judgeCopy(marked(ERA0), null) === 'move' && judgeCopy(marked(ERA0), e1) === 'move' && judgeCopy(marked(ERA0), e2) === 'move');
  ok('7a and is held after an erase, whatever comes after', judgeCopy(marked(ERA0), e3) === 'hold' && judgeCopy(marked(ERA0), e4) === 'hold');
  ok('7b a copy of the new era moves; one with no era is held', judgeCopy(marked(eraOf(e3)), e4) === 'move' && judgeCopy(marked(''), null) === 'hold' && judgeCopy({ kind: 'marked' }, null) === 'hold');
  // an old FX copy: {epoch} of the engine that wrote it
  const o1 = old('x1'), o2 = old('x2');
  ok('7c an old FX copy moves only under the very epoch it was written in', judgeCopy({ kind: 'fx', epoch: 'x1' }, o1) === 'move' && judgeCopy({ kind: 'fx', epoch: 'x1' }, o2) === 'hold');
  ok('7d not after a change by new code, kept or erased, and not into a store without an epoch', judgeCopy({ kind: 'fx', epoch: 'x1' }, keep(o1)) === 'hold' && judgeCopy({ kind: 'fx', epoch: 'x1' }, wipe(o1)) === 'hold' && judgeCopy({ kind: 'fx', epoch: 'x1' }, null) === 'hold' && judgeCopy({ kind: 'fx', epoch: null }, null) === 'hold');
  // an old NK copy and a plain key: nothing says where they come from
  for (const kind of ['nk', 'plain']) {
    ok(`7e an old ${kind} key moves while the store is in the initial era`, judgeCopy({ kind }, null) === 'move' && judgeCopy({ kind }, e1) === 'move' && judgeCopy({ kind }, e2) === 'move');
    ok(`7f an old ${kind} key is held after an erase, and over any epoch of old code (a sign-in and an erase read alike)`, judgeCopy({ kind }, e3) === 'hold' && judgeCopy({ kind }, e4) === 'hold' && judgeCopy({ kind }, o1) === 'hold');
  } }

/* ── 8. messages between tabs (§3.8) ── */
{ const e3 = wipe(keep(null)), mine = eraOf(e3);
  ok('8 with IndexedDB a message of this era is a notice: the record is read from the store', judgeMessage(mine, { era: mine }, { idb: true }) === 'read');
  ok('8a a message of another era applies nothing and starts the check', judgeMessage(mine, { era: ERA0 }, { idb: true }) === 'check' && judgeMessage(ERA0, { era: mine }, { idb: true }) === 'check');
  ok('8b a message without an era (a tab of old code) is a notice, never content', judgeMessage(mine, {}, { idb: true }) === 'read' && judgeMessage(mine, { era: '' }, { idb: true }) === 'read');
  ok('8c without IndexedDB the content is taken as today', judgeMessage(ERA0, { era: 'anything' }, { idb: false }) === 'apply' && judgeMessage(ERA0, {}, { idb: false }) === 'apply');
  // the queue of a start: a put of the old era waits, an erase, the start reads the new era, the queue is emptied
  const queued = { t: 'put', era: ERA0 }, screenAfterStart = eraOf(e3);
  ok('8d a put queued across an erase and a start is not applied', judgeMessage(screenAfterStart, queued, { idb: true }) === 'check'); }

/* ── 9. the compatibility table (§5): who changed the owner, against a new tab whose screen was read before ── */
{ const base = old('p1'), screen = eraOf(base);   // a device signed in by old code: its era reads as its epoch
  ok('9 old code, records kept: a new tab is refused (the era reads as the new id)', !judgeWrite(screen, old('p2')).ok);
  ok('9a old code, erase: refused', !judgeWrite(screen, old('p3')).ok);
  ok('9b new code, records kept: accepted', judgeWrite(screen, keep(base)).ok);
  ok('9c new code, erase: refused', !judgeWrite(screen, wipe(base)).ok);
  const fresh = eraOf(null);
  ok('9d a device never signed in: a first sign-in by old code is refused to a screen read before it, by new code accepted', !judgeWrite(fresh, old('p4')).ok && judgeWrite(fresh, keep(null)).ok);
  // a rollback: old code changes the owner over a record of new code, and new code comes back
  const n1 = keep(null), rolled = old('p5');
  ok('9e an old-code change over a new-code record reads as a new era to the tabs of new code', eraOf(rolled) !== eraOf(n1) && !judgeWrite(eraOf(n1), rolled).ok); }

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
