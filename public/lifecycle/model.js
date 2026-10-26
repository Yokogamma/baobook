// What a page of Baobook does on each event of its life (docs/SYNC-PLAN.md §4.10), as data: no DOM, no engine. The page wires each action to its
// own code. Chrome's Page Lifecycle guidance is the source: a hidden page may never be seen again (its saves are the page's own visibility path),
// and before it is frozen it closes its IndexedDB connections and BroadcastChannels and releases its Web Locks, since a frozen page blocks every
// other page of the origin (on Android the installed app and Chrome's tabs of the site are one profile, and Chrome freezes background tabs there
// whatever they hold).

/**
 * @typedef {'freeze'|'resume'|'pagehide'|'pageshow'|'hidden'|'visible'|'hiddenLong'} PageEvent
 *   hiddenLong: the page has stayed hidden for the wait of HIDDEN_LEAD_MS
 * @typedef {{touch:boolean, freezeEvent:boolean, persisted?:boolean, hidden?:boolean, leads?:boolean}} PageState
 *   touch: a phone or tablet (`hover: none`); freezeEvent: the browser fires `freeze`; persisted: a `pageshow` from the back/forward cache;
 *   leads: the page holds the lead or waits for it
 * @typedef {'leadOff'|'blockTx'|'abortTx'|'closeDb'|'closeChannel'|'unblockTx'|'openChannel'|'catchUp'|'leadCheck'|'tellHidden'|'armHidden'|'disarmHidden'} Action
 */

// a phone's hidden leader lets the lead go by itself after this long (a tab the browser freezes later could not answer a request for it)
export const HIDDEN_LEAD_MS=15000;

/**
 * The actions for an event, in the order they run.
 * @param {PageEvent} ev @param {PageState} st @returns {Action[]}
 */
export function actionsFor(ev, st){
  switch(ev){
    // the lead first, so nothing starts a new transaction after the abort; then the store and the channel close (a page frozen inside a transaction,
    // or one that takes a message while frozen and starts a read, would hold the store for every other page)
    case 'freeze': return ['leadOff', 'blockTx', 'abortTx', 'closeDb', 'closeChannel'];
    // thawed: the store and the channel are back, what other tabs said meanwhile is read from the store, the lead is asked for again
    case 'resume': return ['unblockTx', 'openChannel', 'catchUp', 'leadCheck'];
    // the page's last save goes through the store now and must land: only the lead goes (a page in the back/forward cache that blocks the store is
    // evicted by the browser)
    case 'pagehide': return ['leadOff'];
    case 'pageshow': return st.persisted? ['unblockTx', 'openChannel', 'catchUp', 'leadCheck'] : [];
    // without a `freeze` event the lead goes when hidden; with one, the leader says it is hidden (a visible tab asks for the lead) and, on a phone,
    // starts the wait after which it lets the lead go by itself
    case 'hidden': return !st.freezeEvent? ['leadOff'] : st.touch? ['tellHidden', 'armHidden'] : ['tellHidden'];
    case 'visible': return ['disarmHidden', 'leadCheck'];
    case 'hiddenLong': return st.touch && st.hidden && st.leads? ['leadOff'] : [];
    default: return [];
  }
}
