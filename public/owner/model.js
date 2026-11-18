// The rules of a change of owner (docs/OWNER-ERA-PLAN.md §3–§5), as pure functions: no store, no DOM, no engine. Two questions that the
// owner check used to answer with one comparison are kept apart here:
// - the lineage of the data: were the records a screen shows erased since it was read? The era answers it (§3.1), and only an erase moves it;
// - the lineage of the queue: was the engine's memory loaded for the owner the store has now? The epoch answers it, and every change moves it.
// Stage 1 of the plan: nothing in the app imports this file yet. The core (public/sync.js, a classic script) and the page take these
// functions in stage 2 and 3. Every shape this module reads or returns is described once below, so the port to TypeScript is a move of this file.

/**
 * The generation of the device's records. It changes only when records are erased.
 * @typedef {string} Era
 * The `sync:epoch` record. `era` is optional: code before the plan writes none, and the record then reads as an era of its own (its id).
 * @typedef {{k?:'epoch', id:string, era?:Era}} EpochRec
 * The `sync:owner` record, as far as the rules read it.
 * @typedef {{k?:'owner', uid:string, env:string, email?:string}} OwnerRec
 * What a transaction read of the store's owner state: both records, null where there is none.
 * @typedef {{epoch:?EpochRec, owner:?OwnerRec}} StoreOwner
 * What an engine's memory was loaded for.
 * @typedef {{epoch:?string, owner:?OwnerRec}} Memory
 * A refusal, with the code the page reads.
 * @typedef {{ok:true}|{ok:false, code:'epoch'}} EraVerdict
 * How far a deletion goes: this device only, or every device of the owner (a tombstone in the cloud).
 * @typedef {'here'|'all'} Reach
 * @typedef {{ok:true, reach:Reach}|{ok:false, code:'reach', reach:Reach}} ReachVerdict
 * The two results of §3.5, the era first: a screen of erased records is not helped by a fresh queue.
 * @typedef {'same'|'queue'|'era'} ViewVerdict
 * A fallback copy in localStorage, by what it says of its origin (§4):
 *   marked: written by code of the plan, with the era of the screen it was made from;
 *   fx: written by code before the plan on a device with an owner, with that engine's epoch;
 *   nk: written by code before the plan without an owner (a key written once), with nothing;
 *   plain: a `sheet:note:<id>` key of the mode without IndexedDB, that mode's storage itself.
 * @typedef {{kind:'marked', era:Era}|{kind:'fx', epoch:?string}|{kind:'nk'}|{kind:'plain'}} CopyOrigin
 * move: it goes into the store by itself; hold: it stays in localStorage and is offered in a restore of its own, with the export.
 * @typedef {'move'|'hold'} CopyVerdict
 * A message between tabs about records (§3.8), by what the receiver may do with it:
 *   apply: take its content (only without IndexedDB, where there is one era and no erase);
 *   read: a notice; the record is read from the store in a transaction that compares the era;
 *   check: its era is not this screen's; nothing of it is applied, and the check of §3.5 runs.
 * @typedef {'apply'|'read'|'check'} MessageVerdict
 */

/** The era of a store that has no `epoch` record: a device no owner was ever written on. */
export const ERA0 = '0';

/** The operations of the user that are not of an era (§3.3 item 1): the `device` record outlives an erase. */
export const ERA_FREE = Object.freeze(['deviceName']);

const str = (v) => typeof v === 'string' && v.length > 0;
const uidOf = (o) => (o ? o.uid : null);
const envOf = (o) => (o ? o.env : null);

/**
 * The era a store is in (§3.1 item 2).
 * @param {?EpochRec} epoch
 * @returns {Era}
 */
export function eraOf(epoch) {
  if (!epoch) return ERA0;
  return str(epoch.era) ? epoch.era : String(epoch.id);
}

/**
 * The `epoch` record a change of owner writes (§3.1 items 3 and 4). A change that keeps the records copies the era in force, explicitly;
 * an erase starts a new one, named by the new epoch's id (unique, and what code before the plan would read it as anyway).
 * @param {?EpochRec} prev the record in the store now
 * @param {{id:string, erase:boolean}} change
 * @returns {EpochRec}
 */
export function nextEpoch(prev, change) {
  if (!str(change.id)) throw new TypeError('nextEpoch: an epoch needs an id');
  if (prev && prev.id === change.id) throw new RangeError('nextEpoch: the id of the epoch in force');
  return { k: 'epoch', id: change.id, era: change.erase ? change.id : eraOf(prev) };
}

/**
 * Does a change of owner erase the records? With no owner it always does («Прибрати нотатки з пристрою»).
 * @param {?OwnerRec} owner the owner being written
 * @param {{erase?:boolean}} [o]
 */
export const erases = (owner, o = {}) => !!o.erase || !owner;

/**
 * `expectEpoch` (§3.6): the caller decided over one epoch, and any other in the store refuses, a change that kept the records included.
 * @param {?string|undefined} expect undefined: the caller expects nothing
 * @param {?EpochRec} epoch
 */
export const expected = (expect, epoch) => expect === undefined || (epoch ? epoch.id : null) === expect;

/**
 * A write of the user against the era of its screen (§3.3 item 1).
 * @param {Era} screenEra the era the screen was read over
 * @param {?EpochRec} epoch the store's record, read in the write's transaction
 * @param {string} [op] the operation; those of ERA_FREE are not of an era
 * @returns {EraVerdict}
 */
export function judgeWrite(screenEra, epoch, op) {
  if (ERA_FREE.includes(op)) return { ok: true };
  return str(screenEra) && eraOf(epoch) === screenEra ? { ok: true } : { ok: false, code: 'epoch' };
}

/** A read that feeds the screen or a file (§3.2 item 4, §3.9): the same rule, with no exception. @returns {EraVerdict} */
export const judgeRead = (screenEra, epoch) => judgeWrite(screenEra, epoch);

/**
 * Is an engine's memory of the owner the store has (§3.4 item 1; §3.3 item 4 for the cache updates of a write)?
 * @param {Memory} mem
 * @param {StoreOwner} store
 */
export function memoryCurrent(mem, store) {
  const o = store.owner || null;
  return (store.epoch ? store.epoch.id : null) === (mem.epoch ?? null) && uidOf(o) === uidOf(mem.owner) && envOf(o) === envOf(mem.owner);
}

/**
 * The two results of a check (§3.5).
 * @param {Era} screenEra
 * @param {Memory} mem
 * @param {StoreOwner} store
 * @returns {ViewVerdict}
 */
export function judgeView(screenEra, mem, store) {
  if (!judgeRead(screenEra, store.epoch).ok) return 'era';
  return memoryCurrent(mem, store) ? 'same' : 'queue';
}

/**
 * May a step send to this cloud (§3.4 item 2)? An adapter that names its user must name the owner.
 * @param {?OwnerRec} owner
 * @param {?{uid?:string}} cloud
 */
export const cloudIsOwners = (owner, cloud) => !!owner && !!cloud && (cloud.uid == null || cloud.uid === owner.uid);

/** How far a deletion goes under an owner (§3.3 items 7 and 9). @param {?OwnerRec} owner @returns {Reach} */
export const reachOf = (owner) => (owner ? 'all' : 'here');

/**
 * A confirmed deletion against the owner its transaction read (§3.3 item 9): the same reach or a narrower one goes on, a wider one is
 * refused and names the reach to ask about again.
 * @param {Reach} confirmed what the dialog said
 * @param {?OwnerRec} owner
 * @returns {ReachVerdict}
 */
export function judgeReach(confirmed, owner) {
  if (confirmed !== 'here' && confirmed !== 'all') throw new TypeError('judgeReach: a reach is «here» or «all»');
  const reach = reachOf(owner);
  return confirmed === 'here' && reach === 'all' ? { ok: false, code: 'reach', reach } : { ok: true, reach };
}

/**
 * The `lrev` a change that keeps the records writes for a note (§3.7): above every number a screen may remember, ahead of no base.
 * @param {?{lrev?:number}} meta the note's meta before the change
 * @returns {{lrev:number, baseLrev:0}}
 */
export function keptLrev(meta) {
  const l = meta && Number.isFinite(+meta.lrev) && +meta.lrev > 0 ? Math.floor(+meta.lrev) : 0;
  return { lrev: l + 1, baseLrev: 0 };
}

/**
 * A fallback copy against the store it would move into (§4).
 * - marked: its era is the store's;
 * - fx: its epoch is the store's epoch, so the owner did not change at all since the copy was made;
 * - nk, plain: the store is in the initial era, so nothing was ever erased on it.
 * @param {CopyOrigin} copy
 * @param {?EpochRec} epoch
 * @returns {CopyVerdict}
 */
export function judgeCopy(copy, epoch) {
  if (copy.kind === 'marked') return str(copy.era) && copy.era === eraOf(epoch) ? 'move' : 'hold';
  if (copy.kind === 'fx') return !!epoch && str(copy.epoch) && copy.epoch === epoch.id ? 'move' : 'hold';
  return eraOf(epoch) === ERA0 ? 'move' : 'hold';
}

/**
 * A message of another tab about records (§3.8).
 * @param {Era} screenEra
 * @param {{era?:Era}} msg
 * @param {{idb:boolean}} o
 * @returns {MessageVerdict}
 */
export function judgeMessage(screenEra, msg, o) {
  if (!o.idb) return 'apply';
  if (!str(msg.era)) return 'read';   // a tab of code before the plan: a notice at most
  return msg.era === screenEra ? 'read' : 'check';
}
