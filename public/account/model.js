// The account's status and panel as data (docs/SYNC-PLAN.md §4.11, §4.18, PR 4c): no DOM, no strings, no engine. The page passes in what it
// knows (the account's own states, the core's status, the counts and the budget); the functions answer with codes and string keys, which the
// view turns into text. Every shape this module reads or returns is described once below, so the port to TypeScript is a move of this file.

/**
 * The core's status, as `SYNC.status()` returns it in the leader and the `st` message carries it to the other tabs.
 * @typedef {{code:string, n:number, jobs?:number, errorN?:number, errors?:SyncError[], checked?:number, vdone?:boolean}} CoreStatus
 * @typedef {{col:'notes'|'versions', id:string, reason:'size'|'loop'|'invalid'|'damaged'|'receipts'}} SyncError
 * The account as the page knows it: the signed-in user, the device's owner, and the account's own work in flight.
 * @typedef {{on:boolean, viewOnly:boolean, user:?Person, owner:?Person, cloud:boolean, signingOut:boolean, loading:boolean,
 *   signingIn:boolean, checking:boolean, dialog:boolean, probe:?string, otherTab:boolean}} AccountState
 * @typedef {{uid:string, email?:string}} Person
 * What is not in the cloud (`SYNC.unsynced()`), and the device budget of today.
 * @typedef {{notes:number, versions:number, local:number, copies:number}} Counts
 * @typedef {{reads:number, writes:number}} Budget
 * The status of the button and the menu row: a code of the table, its number and the kind of its icon.
 * @typedef {{code:string, n:number, kind:Kind}} Status
 * @typedef {'synced'|'sending'|'busy'|'off'|'bad'} Kind
 */

// the codes of §4.18 in the order the first one that holds wins, with the kind of icon each takes (the shapes differ, not only the colour)
export const CODES=Object.freeze({
  signingOut:'busy', loading:'busy', signingIn:'busy', checking:'busy', open:'bad', other:'bad', signedOut:'off',
  denied:'bad', reauth:'bad', nospace:'bad', limit:'off', offline:'off', unverified:'bad', error:'bad', scan:'busy',
  waiting:'sending', sending:'sending', versions:'busy', synced:'synced', pending:'busy' });
const PROBE=['denied','reauth','unverified','open'];

/**
 * The status the button and the menu row show, or null when there is none to show (no account here, no owner and not signed in, a
 * view-only tab: its strip says what it is).
 * @param {AccountState} acc @param {?CoreStatus} core @returns {?Status}
 */
export function statusOf(acc, core){
  if(!acc.on || acc.viewOnly) return null;
  const own=code=>({code, n:0, kind:CODES[code]});
  if(acc.signingOut) return own('signingOut'); if(acc.loading) return own('loading'); if(acc.signingIn) return own('signingIn');
  if(acc.checking || acc.dialog) return own('checking');
  if(acc.probe && PROBE.includes(acc.probe)) return own(acc.probe);
  if(acc.otherTab) return own('other');
  if(!acc.owner) return null;
  const waiting=core? (core.jobs ?? core.n ?? 0) : 0;
  if(!acc.user || !acc.cloud) return {code:'signedOut', n:waiting, kind:CODES.signedOut};
  const code=core && CODES[core.code] && !['signingOut','loading','signingIn','checking','open','other','signedOut'].includes(core.code)? core.code : 'pending';
  return {code, n:core? core.n||0 : 0, kind:CODES[code]};
}

// the text of each code (a key of the language files, written out so tests/appi18n.mjs finds it; the view passes `n`)
export const TEXT=Object.freeze({
  signingOut:'sync.st.signingOut',
  loading:'sync.st.loading',
  signingIn:'sync.st.signingIn',
  checking:'sync.st.checking',
  open:'sync.st.open',
  other:'sync.st.other',
  signedOut:'sync.st.signedOut',
  denied:'sync.st.denied',
  reauth:'sync.st.reauth',
  nospace:'sync.st.nospace',
  limit:'sync.st.limit',
  offline:'sync.st.offline',
  unverified:'sync.st.unverified',
  error:'sync.st.error',
  scan:'sync.st.scan',
  waiting:'sync.st.waiting',
  sending:'sync.st.sending',
  versions:'sync.st.versions',
  synced:'sync.st.synced',
  pending:'sync.st.pending' });
// one sentence of explanation for the panel, per code
export const EXPLAIN=Object.freeze({
  signingOut:'account.why.signingOut',
  loading:'account.why.loading',
  signingIn:'account.why.signingIn',
  checking:'account.why.checking',
  open:'account.why.open',
  other:'account.why.other',
  signedOut:'account.why.signedOut',
  denied:'account.why.denied',
  reauth:'account.why.reauth',
  nospace:'account.why.nospace',
  limit:'account.why.limit',
  offline:'account.why.offline',
  unverified:'account.why.unverified',
  error:'account.why.error',
  scan:'account.why.scan',
  waiting:'account.why.waiting',
  sending:'account.why.sending',
  versions:'account.why.versions',
  synced:'account.why.synced',
  pending:'account.why.pending' });
// the reason of a stuck note or version, as the panel's list names it
export const REASON=Object.freeze({size:'account.reason.size', loop:'account.reason.loop', invalid:'account.reason.invalid', damaged:'account.reason.damaged', receipts:'account.reason.receipts'});

/**
 * The account panel, from the top (§4.11): the email, the status with its explanation and, for «Не синхронізовано», the list of what is stuck;
 * the counts shown only when not zero; «Перевірено» with the time of the last matching totals check of both collections; today's budget; the
 * device name; the actions this state offers. A view-only tab reads it with the leader's status, the counts and the export, without the name
 * field and the buttons that change the account (§4.11).
 * @param {{acc:AccountState, core:?CoreStatus, counts:?Counts, used:?Budget, limit:?Budget, devName:string, title?:(id:string)=>string}} o
 */
export function panelOf(o){ const {acc, core, counts, used, limit}=o, st=statusOf(acc, core), person=acc.user || acc.owner;
  const c=counts||{notes:0, versions:0, local:0, copies:0};
  const shown=st || (acc.viewOnly? statusOf({...acc, viewOnly:false}, core) : null);
  return {
    email: person? (person.email || person.uid) : '',
    signedIn: !!acc.user,
    status: shown,
    text: shown? TEXT[shown.code] : null,
    why: shown? EXPLAIN[shown.code] : null,
    errors: shown && shown.code==='error' && core && core.errors? core.errors.slice(0,20).map(e=>({...e, reason:REASON[e.reason]||REASON.invalid, title:e.col==='notes' && o.title? o.title(e.id) : ''})) : [],
    counts: [['notes','account.unsyncedNotes'], ['versions','account.unsyncedVersions'], ['local','account.onlyHere'], ['copies','account.copies']]
      .filter(([k])=>c[k]>0).map(([k,key])=>({k, key, n:c[k]})),
    checked: core && core.checked? core.checked : 0,
    budget: used && limit? {reads:used.reads, writes:used.writes, readsMax:limit.reads, writesMax:limit.writes} : null,
    devName: o.devName||'',
    nameField: !acc.viewOnly,
    actions: acc.viewOnly? ((acc.user || acc.owner)? ['export'] : []) : [...(acc.user? ['signOut'] : ['signIn']), ...((acc.user || acc.owner)? ['export', 'remove'] : [])],
    readOnly: !!acc.viewOnly };
}

/**
 * The line under the list of «Історія» while the first catch-up of versions has not ended (§4.18): «версії ще завантажуються» while it can
 * run (online and signed in), «версії ще не завантажено» while it cannot; nothing without an owner or once it is done.
 * @param {AccountState} acc @param {?CoreStatus} core @param {boolean} online @returns {?string}
 */
export function historyNote(acc, core, online){
  if(!acc.on || !acc.owner || !core || core.vdone) return null;
  return online && acc.user && acc.cloud? 'hist.vLoading' : 'hist.vNotLoaded';
}

// a device name as every check accepts it: trimmed, at most 80 UTF-16 units, cut between code points; empty means the default
export function cleanName(s){ let out=''; for(const ch of String(s||'').trim()){ if(out.length+ch.length>80) break; out+=ch; } return out; }
