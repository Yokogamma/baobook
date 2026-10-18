// The Firestore security rules of docs/SYNC-PLAN.md §4.16 (firestore.rules at the repository root) on the Firestore emulator.
// Run from this folder through the emulator, never against the real project (`npm test` does the same):
//   npx firebase emulators:exec --only firestore --project demo-baobook "node firestore.mjs"
// The rules' access list still holds the 'OWNER_UID' placeholder (PR 3 puts the owner's uid there); the test puts its own uid into
// that list when it loads the rules. Every scenario starts on an empty emulator. Documents are written the way §4.5 step 4 writes
// them: the whole document with `set`, `rev` one above the stored one, `srv` the server time, the writing device's receipt.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit, runTransaction, serverTimestamp,
  Timestamp, getAggregateFromServer, count, sum, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');   // refused requests are expected here; the SDK would log each one
const OWNER = 'owner-test', OTHER = 'someone-else', DAY = 86_400_000, T0 = Date.UTC(2026, 9, 1);

let fails = 0, n = 0;
const line = (c, name, why) => { n++; if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + ' ' + name + (c || !why ? '' : ' — ' + why)); };
const allow = async (name, fn) => { try { await assertSucceeds(fn()); line(true, name); } catch (e) { line(false, name, e.code || e.message); } };
const deny = async (name, fn) => { try { await assertFails(fn()); line(true, name); } catch (e) { line(false, name, e.message); } };
const scenario = async title => { console.log('— ' + title); await env.clearFirestore(); };

// the rules with a test uid in the access list of allowed(): the placeholder now, the owner's uid after PR 3
const src = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const ACCESS = /(request\.auth\.uid in \[)[^\]]*(\])/g;
line((src.match(ACCESS) || []).length === 1, 'firestore.rules has one access list, and the test puts its uid there');
const rules = src.replace(ACCESS, `$1'${OWNER}'$2`);

let env;
try { env = await initializeTestEnvironment({ projectId: 'demo-baobook', firestore: { rules } }); }
catch (e) {
  console.log('✗ the rules load on the emulator — ' + e.message);
  console.log(process.env.FIRESTORE_EMULATOR_HOST ? '' : 'FIRESTORE_EMULATOR_HOST is not set: run this file through firebase emulators:exec (see tests/README.md)');
  process.exit(1);
}
line(true, 'the rules compile and load on the emulator');

const owner = env.authenticatedContext(OWNER).firestore(), other = env.authenticatedContext(OTHER).firestore(), anon = env.unauthenticatedContext().firestore();
const path = (col, id, uid = OWNER, e = 'dev') => `env/${e}/users/${uid}/${col}/${id}`;
const N = id => path('notes', id), V = id => path('versions', id);
const put = (p, data, db = owner) => setDoc(doc(db, p), clean(data));
const seed = (p, data) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), data));
const read = async p => { let d = null; await env.withSecurityRulesDisabled(async c => { const s = await getDoc(doc(c.firestore(), p)); d = s.exists() ? s.data() : null; }); return d; };
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// the service fields of the next write by device `dev` over the stored document `prev` (null: a new document)
let seq = 0;
const stamp = (prev, dev = 'devA') => { const op = 'o' + T0.toString(36) + (++seq).toString(36).padStart(4, '0');
  return { v: 1, rev: prev ? prev.rev + 1 : 1, op, srv: serverTimestamp(), dev, rcpt: { ...(prev ? prev.rcpt : {}), [dev]: op } }; };
// a whole document over `prev`: its fields, the new stamp, then the changes (a change to undefined drops the key)
const next = (prev, changes = {}, dev) => clean({ ...prev, ...stamp(prev, dev), ...changes });
const body = (o = {}) => ({ title: 'A note', blocks: [{ id: 'b1', row: 0, fx: 0, text: 'text' }], created: T0, updated: T0, ...o });
const vbody = (note, o = {}) => ({ note, t: T0, name: 'Named', title: 'A note', blocks: [{ id: 'b1', row: 0, fx: 0, text: 'text' }], ...o });
const old = ms => Timestamp.fromMillis(Date.now() - ms);
// documents as they would be stored after earlier writes (seeded past the rules)
const svc = { v: 1, rev: 3, op: 'o-old', srv: old(DAY), dev: 'devA', rcpt: { devA: 'o-old' } };
const stored = (o = {}) => ({ ...svc, ...body(), ...o }), storedV = (note, o = {}) => ({ ...svc, ...vbody(note), ...o });
const totals = async (db, col, uid = OWNER) => (await getAggregateFromServer(collection(db, `env/dev/users/${uid}/${col}`), { n: count(), s: sum('rev') })).data();
const expect = (c, what) => { if (!c) throw new Error(what); };

await scenario('the owner: create, read, update, list and the totals check (§4.5, §4.6)');
await allow('the owner creates a note (rev 1, own receipt, srv = server time)', () => put(N('n1'), { ...stamp(null), ...body() }));
await allow('the owner reads it', () => getDoc(doc(owner, N('n1'))));
await allow('the owner updates it in a transaction that reads it first (§4.5 step 4)', () => runTransaction(owner, async tx => {
  const r = doc(owner, N('n1')), D = (await tx.get(r)).data(); tx.set(r, next(D, { title: 'Edited', updated: T0 + 1 })); }));
await allow('another device of the owner writes its own receipt next to the first one', async () => put(N('n1'), next(await read(N('n1')), { title: 'From B', updated: T0 + 2 }, 'devB')));
let d = await read(N('n1'));
line(d.rev === 3 && Object.keys(d.rcpt).sort().join() === 'devA,devB' && d.srv instanceof Timestamp, 'the stored note has rev 3, both receipts and a server srv');
await allow('the owner creates two more notes, one with a device name (dn)', async () => { await put(N('n2'), { ...stamp(null), ...body() }); await put(N('n3'), { ...stamp(null, 'devB'), dn: 'Chrome · Windows', ...body() }); });
await allow('the owner lists the notes the way the catch-up pages them (srv ≥ cursor, ordered by srv)', async () => {
  const s = await getDocs(query(collection(owner, `env/dev/users/${OWNER}/notes`), where('srv', '>=', old(DAY)), orderBy('srv'), limit(200)));
  expect(s.size === 3, 'got ' + s.size + ' documents'); });
await allow('the owner runs count() and sum(rev) over the notes in one aggregation: 3 notes, sum 5', async () => { const t = await totals(owner, 'notes'); expect(t.n === 3 && t.s === 5, JSON.stringify(t)); });
await allow('the owner writes and reads in the app space (env app) too', async () => { await put(path('notes', 'a1', OWNER, 'app'), { ...stamp(null), ...body() }); await getDoc(doc(owner, path('notes', 'a1', OWNER, 'app'))); });

await scenario('other accounts, signed out, other places');
await seed(N('n1'), stored()); await seed(V('v1'), storedV('n1'));
await deny('another account reads the owner\'s note', () => getDoc(doc(other, N('n1'))));
await deny('another account lists the owner\'s notes', () => getDocs(collection(other, `env/dev/users/${OWNER}/notes`)));
await deny('another account runs count() and sum(rev) over the owner\'s notes', () => totals(other, 'notes'));
await deny('another account runs count() and sum(rev) over the owner\'s versions', () => totals(other, 'versions'));
await deny('another account reads the owner\'s version', () => getDoc(doc(other, V('v1'))));
await deny('another account creates a note in the owner\'s space', () => put(N('x1'), { ...stamp(null), ...body() }, other));
await deny('another account updates the owner\'s note', async () => put(N('n1'), next(await read(N('n1')), { title: 'Mine' }), other));
await deny('another account creates a note in its own space (it is not on the list)', () => put(path('notes', 'x1', OTHER), { ...stamp(null), ...body() }, other));
await deny('another account lists its own space', () => getDocs(collection(other, `env/dev/users/${OTHER}/notes`)));
await deny('another account counts its own space', () => totals(other, 'notes', OTHER));
await deny('signed out: reading the owner\'s note', () => getDoc(doc(anon, N('n1'))));
await deny('signed out: listing the owner\'s notes', () => getDocs(collection(anon, `env/dev/users/${OWNER}/notes`)));
await deny('signed out: writing a note', () => put(N('x1'), { ...stamp(null), ...body() }, anon));
await deny('the owner reads another uid\'s space', () => getDoc(doc(owner, path('notes', 'n1', OTHER))));
await deny('the owner writes into another uid\'s space', () => put(path('notes', 'x1', OTHER), { ...stamp(null), ...body() }));
await deny('the owner writes under a wrong env (prod)', () => put(path('notes', 'x1', OWNER, 'prod'), { ...stamp(null), ...body() }));
await deny('the owner reads under a wrong env (test)', () => getDoc(doc(owner, path('notes', 'n1', OWNER, 'test'))));
await deny('the owner lists under a wrong env (prod)', () => getDocs(collection(owner, `env/prod/users/${OWNER}/notes`)));
await deny('a document outside env/{env}/users/{uid}/(notes|versions)', () => put(`env/dev/users/${OWNER}/settings/s1`, { ...stamp(null), ...body() }));

await scenario('nothing is ever deleted (allow delete: if false)');
await seed(N('n1'), stored()); await seed(N('t1'), { v: 1, rev: 2, op: 'o-t', srv: old(DAY), dev: 'devA', rcpt: { devA: 'o-t' }, purged: T0 });
await seed(V('v1'), storedV('n1')); await seed(V('v2'), { v: 1, rev: 2, op: 'o-t', srv: old(DAY), dev: 'devA', rcpt: { devA: 'o-t' }, note: 'n1', deleted: true });
await deny('the owner deletes a live note', () => deleteDoc(doc(owner, N('n1'))));
await deny('the owner deletes a note\'s tombstone', () => deleteDoc(doc(owner, N('t1'))));
await deny('the owner deletes a version', () => deleteDoc(doc(owner, V('v1'))));
await deny('the owner deletes a deleted version', () => deleteDoc(doc(owner, V('v2'))));

await scenario('the stamp: v, rev, srv, op, dev, dn');
await seed(N('n1'), stored());
d = await read(N('n1'));
await deny('rev not old + 1: the same rev', () => put(N('n1'), next(d, { rev: 3, title: 'x' })));
await deny('rev not old + 1: two ahead', () => put(N('n1'), next(d, { rev: 5, title: 'x' })));
await deny('rev not old + 1: back', () => put(N('n1'), next(d, { rev: 2, title: 'x' })));
await deny('rev not old + 1: a new document with rev 2', () => put(N('n2'), { ...stamp(null), rev: 2, ...body() }));
await deny('rev as a string', () => put(N('n1'), next(d, { rev: '4', title: 'x' })));
await deny('srv from the device clock instead of the server time', () => put(N('n1'), next(d, { srv: Timestamp.now(), title: 'x' })));
await deny('srv missing', () => put(N('n1'), next(d, { srv: undefined, title: 'x' })));
await deny('a new document with srv from the device clock', () => put(N('n2'), { ...stamp(null), srv: Timestamp.now(), ...body() }));
await deny('v other than 1', () => put(N('n1'), next(d, { v: 2, title: 'x' })));
await deny('an empty op', () => { const s = next(d, { title: 'x' }); return put(N('n1'), { ...s, op: '', rcpt: { ...s.rcpt, devA: '' } }); });
await deny('an op over 40 characters', () => { const s = next(d, { title: 'x' }), op = 'o'.repeat(41); return put(N('n1'), { ...s, op, rcpt: { ...s.rcpt, devA: op } }); });
await deny('a dev over 40 characters', () => put(N('n1'), next(d, { title: 'x' }, 'd'.repeat(41))));
await deny('an empty dn', () => put(N('n1'), next(d, { title: 'x', dn: '' })));
await deny('a dn over 80 characters', () => put(N('n1'), next(d, { title: 'x', dn: 'n'.repeat(81) })));
await allow('a dn of 80 characters', () => put(N('n1'), next(d, { title: 'x', dn: 'n'.repeat(80) })));

await scenario('receipts (§4.5 step 4, §4.16)');
await seed(N('n1'), stored({ rev: 2, dev: 'devB', op: 'oB', rcpt: { devA: 'oA', devB: 'oB' } }));
d = await read(N('n1'));
await deny('the own receipt differs from op', () => { const s = next(d, { title: 'x' }); return put(N('n1'), { ...s, rcpt: { ...s.rcpt, devA: 'something-else' } }); });
await deny('the own receipt missing', () => { const s = next(d, { title: 'x' }); const { devA, ...rest } = s.rcpt; return put(N('n1'), { ...s, rcpt: rest }); });
await deny('changing another device\'s receipt', () => { const s = next(d, { title: 'x' }); return put(N('n1'), { ...s, rcpt: { ...s.rcpt, devB: 'oB2' } }); });
await deny('removing another device\'s receipt', () => { const s = next(d, { title: 'x' }); const { devB, ...rest } = s.rcpt; return put(N('n1'), { ...s, rcpt: rest }); });
await deny('adding a receipt for a third device', () => { const s = next(d, { title: 'x' }); return put(N('n1'), { ...s, rcpt: { ...s.rcpt, devC: 'oC' } }); });
await deny('rcpt that is not a map', () => put(N('n1'), next(d, { title: 'x', rcpt: ['devA'] })));
await deny('a new document with another device\'s receipt', () => { const s = stamp(null); return put(N('n2'), { ...s, rcpt: { ...s.rcpt, devB: 'oB' }, ...body() }); });
await allow('a new device adds its own receipt and keeps the others', () => put(N('n1'), next(d, { title: 'x' }, 'devC')));
const many = {}; for (let i = 0; i < 200; i++) many['dev' + i] = 'o' + i;
await seed(N('n2'), stored({ dev: 'dev0', op: 'o0', rcpt: many }));
d = await read(N('n2'));
await allow('200 receipts: one of those devices writes again (still 200)', () => put(N('n2'), next(d, { title: 'x' }, 'dev7')));
d = await read(N('n2'));
await deny('200 receipts: device 201 is refused', () => put(N('n2'), next(d, { title: 'y' }, 'devNew')));

await scenario('the shape of a note');
await seed(N('n1'), stored());
d = await read(N('n1'));
await deny('an unknown key', () => put(N('n1'), next(d, { title: 'x', foo: 1 })));
await deny('the record key `id` as a field', () => put(N('n2'), { ...stamp(null), id: 'n2', ...body() }));
await deny('the local field `lrev`', () => put(N('n1'), next(d, { title: 'x', lrev: 4 })));
await deny('a note without blocks', () => put(N('n1'), next(d, { title: 'x', blocks: undefined })));
await deny('a note without updated', () => put(N('n2'), { ...stamp(null), ...body({ updated: undefined }) }));
await deny('a title that is not a string', () => put(N('n1'), next(d, { title: 5 })));
await deny('created that is not a number', () => put(N('n1'), next(d, { title: 'x', created: '2026-10-01' })));
await deny('a title over 2000 characters', () => put(N('n1'), next(d, { title: 't'.repeat(2001) })));
await deny('blocks that are not a list', () => put(N('n1'), next(d, { title: 'x', blocks: { b1: {} } })));
await deny('more than 5000 blocks', () => put(N('n1'), next(d, { title: 'x', blocks: Array.from({ length: 5001 }, (_, i) => ({ id: 'b' + i })) })));
await deny('deleted that is not a number', () => put(N('n1'), next(d, { title: 'x', deleted: true, tsrv: serverTimestamp() })));
await deny('archived that is not a number', () => put(N('n1'), next(d, { title: 'x', archived: 'yes' })));
await deny('revived that is not a map', () => put(N('n1'), next(d, { title: 'x', revived: 'n0' })));
await allow('archived and revived of the right types', () => put(N('n1'), next(d, { title: 'x', archived: T0, revived: { from: 'n0', dev: 'devB', at: T0 } })));
d = await read(N('n1'));
await deny('a live note with tsrv but no deleted (update)', () => put(N('n1'), next(d, { title: 'y', tsrv: serverTimestamp() })));
await deny('a live note with tsrv but no deleted (create)', () => put(N('n3'), { ...stamp(null), ...body(), tsrv: serverTimestamp() }));

await scenario('the trash is dated by the server (tsrv, §4.8)');
await seed(N('n1'), stored());
d = await read(N('n1'));
await deny('entering the trash without tsrv', () => put(N('n1'), next(d, { deleted: T0 + 10 })));
await deny('entering the trash with tsrv from the device clock', () => put(N('n1'), next(d, { deleted: T0 + 10, tsrv: Timestamp.now() })));
await allow('entering the trash with tsrv = server time', () => put(N('n1'), next(d, { deleted: T0 + 10, tsrv: serverTimestamp() })));
d = await read(N('n1'));
line(d.tsrv instanceof Timestamp && d.tsrv.isEqual(d.srv), 'the stored tsrv is the server time of that write (equal to srv)');
await allow('an edit in the trash that keeps deleted and tsrv', () => put(N('n1'), next(d, { title: 'Edited in the trash' })));
d = await read(N('n1'));
await deny('keeping deleted but moving tsrv back 31 days (an early purge would pass)', () => put(N('n1'), next(d, { title: 'x', tsrv: old(31 * DAY) })));
await deny('extending the trash (a new deleted) but keeping the old tsrv', () => put(N('n1'), next(d, { deleted: T0 + 20 })));
await deny('extending the trash without tsrv', () => put(N('n1'), next(d, { deleted: T0 + 20, tsrv: undefined })));
await allow('extending the trash with a new server tsrv', () => put(N('n1'), next(d, { deleted: T0 + 20, tsrv: serverTimestamp() })));
d = await read(N('n1'));
await deny('restoring from the trash but keeping tsrv', () => put(N('n1'), next(d, { deleted: undefined })));
await allow('restoring from the trash, dropping deleted and tsrv', () => put(N('n1'), next(d, { deleted: undefined, tsrv: undefined })));
await allow('a new document straight into the trash with a server tsrv', () => put(N('n2'), { ...stamp(null), ...body({ deleted: T0 }), tsrv: serverTimestamp() }));
await deny('a new document in the trash without tsrv', () => put(N('n3'), { ...stamp(null), ...body({ deleted: T0 }) }));
await deny('a new document in the trash with tsrv from the device clock', () => put(N('n3'), { ...stamp(null), ...body({ deleted: T0 }), tsrv: Timestamp.now() }));

await scenario('tombstones and the automatic purge (§4.7, §4.8)');
const tomb = (prev, o = {}, dev) => clean({ ...stamp(prev, dev), purged: T0 + 99, ...o });
await seed(N('n1'), stored());
await allow('a manual tombstone over a live note («Видалити назавжди»)', async () => put(N('n1'), tomb(await read(N('n1')))));
d = await read(N('n1'));
await deny('a tombstone is final: back to a live note', () => put(N('n1'), clean({ ...stamp(d), ...body() })));
await deny('a tombstone is final: another tombstone over it', () => put(N('n1'), tomb(d, { purged: T0 + 100 })));
await deny('a tombstone is final: the same tombstone written again', () => put(N('n1'), tomb(d, { purged: d.purged })));
await allow('a tombstone as a new document', () => put(N('n2'), tomb(null)));
await deny('an automatic tombstone as a new document', () => put(N('n3'), tomb(null, { auto: true })));
await deny('a tombstone that keeps the note\'s title', () => put(N('n3'), tomb(null, { title: 'A note' })));
await deny('a tombstone without purged', () => put(N('n3'), tomb(null, { purged: undefined })));
await deny('purged that is not a number', () => put(N('n3'), tomb(null, { purged: 'now' })));
await seed(N('j1'), stored());   // a live note, not in the trash
d = await read(N('j1'));
await deny('the automatic purge of a note that is not in the trash', () => put(N('j1'), tomb(d, { auto: true })));
await allow('the owner trashes it', () => put(N('j1'), next(d, { deleted: T0 + 10, tsrv: serverTimestamp() })));
d = await read(N('j1'));
await deny('the automatic purge of a note trashed a moment ago (early, refused by the server clock)', () => put(N('j1'), tomb(d, { auto: true })));
await seed(N('j2'), stored({ deleted: T0, tsrv: old(29 * DAY) }));
await deny('the automatic purge 29 days after tsrv', async () => put(N('j2'), tomb(await read(N('j2')), { auto: true })));
await seed(N('j3'), stored({ deleted: T0, tsrv: old(31 * DAY) }));
d = await read(N('j3'));
await deny('auto other than true', () => put(N('j3'), tomb(d, { auto: false })));
await allow('the automatic purge 31 days after tsrv, in a transaction (§4.8)', () => runTransaction(owner, async tx => {
  const r = doc(owner, N('j3')), D = (await tx.get(r)).data(); tx.set(r, tomb(D, { auto: true })); }));
d = await read(N('j3'));
line(d.auto === true && d.purged === T0 + 99 && d.rev === 4 && !('title' in d) && !('tsrv' in d), 'the stored automatic tombstone has only tombstone fields');
await seed(N('j4'), stored({ deleted: T0 }));   // in the trash without tsrv: written past the rules
await deny('the automatic purge of a trashed note without tsrv', async () => put(N('j4'), tomb(await read(N('j4')), { auto: true })));
await seed(N('j5'), stored({ tsrv: old(31 * DAY) }));   // an old tsrv but not in the trash: written past the rules
await deny('the automatic purge of a note with an old tsrv but no deleted', async () => put(N('j5'), tomb(await read(N('j5')), { auto: true })));
await seed(N('j6'), stored({ deleted: T0, tsrv: old(31 * DAY) }));
d = await read(N('j6'));   // the purging device read the note in the trash…
await allow('…another device restores it from the trash', () => put(N('j6'), next(d, { deleted: undefined, tsrv: undefined }, 'devB')));
await deny('…and the automatic purge prepared over the trashed state is refused (§4.8: a restore racing the purge)', () => put(N('j6'), tomb(d, { auto: true })));

await scenario('named versions (§4.9)');
await seed(N('n1'), stored()); await seed(N('n2'), stored({ deleted: T0, tsrv: old(DAY) }));
await seed(N('p1'), { v: 1, rev: 5, op: 'o-t', srv: old(DAY), dev: 'devA', rcpt: { devA: 'o-t' }, purged: T0 });
await allow('the owner creates a version of a live note', () => put(V('v1'), { ...stamp(null), ...vbody('n1') }));
await allow('the owner creates a version of a note in the trash (only a purge stops it)', () => put(V('v2'), { ...stamp(null), ...vbody('n2') }));
await allow('the owner reads a version', () => getDoc(doc(owner, V('v1'))));
await allow('the owner lists the versions by srv', async () => { const s = await getDocs(query(collection(owner, `env/dev/users/${OWNER}/versions`), where('srv', '>=', old(DAY)), orderBy('srv'))); expect(s.size === 2, 'got ' + s.size); });
await allow('the owner runs count() and sum(rev) over the versions: 2 versions, sum 2', async () => { const t = await totals(owner, 'versions'); expect(t.n === 2 && t.s === 2, JSON.stringify(t)); });
d = await read(V('v1'));
await allow('renaming: name and the stamp change', () => put(V('v1'), next(d, { name: 'Renamed' })));
d = await read(V('v1'));
await deny('a rename that changes the title', () => put(V('v1'), next(d, { name: 'R2', title: 'Other' })));
await deny('a rename that changes the blocks', () => put(V('v1'), next(d, { name: 'R2', blocks: [] })));
await deny('a rename that changes t', () => put(V('v1'), next(d, { name: 'R2', t: T0 + 1 })));
await deny('a rename that moves the version to another note', () => put(V('v1'), next(d, { name: 'R2', note: 'n2' })));
await deny('a rename to an empty name', () => put(V('v1'), next(d, { name: '' })));
await deny('a version with the local fields keep and inline', () => put(V('v3'), { ...stamp(null), ...vbody('n1'), keep: 1, inline: 1 }));
await deny('a version without a name', () => put(V('v3'), { ...stamp(null), ...vbody('n1', { name: undefined }) }));
await deny('a version whose t is not a number', () => put(V('v3'), { ...stamp(null), ...vbody('n1', { t: 'today' }) }));
await deny('a version whose title is not a string', () => put(V('v3'), { ...stamp(null), ...vbody('n1', { title: null }) }));
await deny('a version whose blocks are not a list', () => put(V('v3'), { ...stamp(null), ...vbody('n1', { blocks: 'text' }) }));
await deny('a version of a note that does not exist', () => put(V('v3'), { ...stamp(null), ...vbody('nope') }));
await deny('a version of a purged note (create)', () => put(V('v3'), { ...stamp(null), ...vbody('p1') }));
await seed(V('w1'), storedV('p1'));   // a version whose note was purged after it was sent
d = await read(V('w1'));
await deny('renaming a version whose note is purged', () => put(V('w1'), next(d, { name: 'Renamed' })));
const vtomb = (prev, o = {}) => clean({ ...stamp(prev), note: prev.note, deleted: true, ...o });
await deny('a version tombstone that changes note', () => put(V('w1'), vtomb(d, { note: 'n1' })));
await deny('a version tombstone that keeps the blocks', () => put(V('w1'), vtomb(d, { blocks: [] })));
await deny('a version tombstone with deleted other than true', () => put(V('w1'), vtomb(d, { deleted: 1 })));
await allow('deleting a version whose note is purged (deleting is always allowed)', () => put(V('w1'), vtomb(d)));
d = await read(V('w1'));
await deny('a deleted version stays deleted: renamed back to life', () => put(V('w1'), clean({ ...stamp(d), ...vbody('p1') })));
await deny('a deleted version stays deleted: another tombstone over it', () => put(V('w1'), vtomb(d)));
d = await read(V('v1'));
await allow('deleting a version of a live note', () => put(V('v1'), vtomb(d)));
await allow('count() and sum(rev) still see every version, tombstones included: 3 versions, sum 3 + 1 + 4', async () => { const t = await totals(owner, 'versions'); expect(t.n === 3 && t.s === 8, JSON.stringify(t)); });

await scenario('the note id of a version: up to 64 characters, the id limit of the core (finding against §4.16, which had 40)');
const id64 = 'n'.repeat(64), id65 = 'n'.repeat(65);
await allow('notes whose ids have 64 and 65 characters sync (the rules do not limit document ids)', async () => { await put(N(id64), { ...stamp(null), ...body() }); await put(N(id65), { ...stamp(null), ...body() }); });
await allow('a version of the note whose id has 64 characters', () => put(V('v1'), { ...stamp(null), ...vbody(id64) }));
await deny('a version of the note whose id has 65 characters', () => put(V('v2'), { ...stamp(null), ...vbody(id65) }));

await env.cleanup();
console.log(fails ? fails + ' failed' : 'all passed'); process.exit(fails ? 1 : 0);
