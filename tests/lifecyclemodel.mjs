// The rules of a page's life under Node, without a browser (docs/SYNC-PLAN.md §4.10): public/lifecycle/model.js answers each page event with the
// actions the page runs, in order. Chrome's guidance for a frozen page (close IndexedDB and BroadcastChannel, release Web Locks), the last save
// on pagehide kept, the thaw that opens again and catches up, and a phone's hidden leader that lets the lead go by itself.
import { actionsFor, HIDDEN_LEAD_MS } from '../public/lifecycle/model.js';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PHONE={touch:true, freezeEvent:true}, PC={touch:false, freezeEvent:true}, OLD={touch:false, freezeEvent:false};
const j=a=>a.join(',');

const fz=actionsFor('freeze', PHONE);
ok('1 freeze: the lead goes first, then new transactions are refused, the open ones aborted, the store and the channel closed ('+j(fz)+')', j(fz)==='leadOff,blockTx,abortTx,closeDb,closeChannel');
ok('1a the same on a computer: Chrome\'s guidance does not depend on the device', j(actionsFor('freeze', PC))===j(fz));
const rs=actionsFor('resume', PHONE);
ok('2 resume: transactions allowed again, the channel back, what other tabs said read from the store, the lead asked for ('+j(rs)+')', j(rs)==='unblockTx,openChannel,catchUp,leadCheck');
ok('2a a pageshow from the back/forward cache does the same; a fresh pageshow nothing', j(actionsFor('pageshow',{...PC, persisted:true}))===j(rs) && actionsFor('pageshow',{...PC, persisted:false}).length===0);
const ph=actionsFor('pagehide', PHONE);
ok('3 pagehide lets the lead go only: no abort, no close, the page\'s last save lands ('+j(ph)+')', j(ph)==='leadOff');
ok('4 hidden on a phone: the leader says so and starts the wait', j(actionsFor('hidden', PHONE))==='tellHidden,armHidden');
ok('4a hidden on a computer: it only says so (it keeps syncing in the background)', j(actionsFor('hidden', PC))==='tellHidden');
ok('4b a browser with no freeze event lets the lead go when hidden', j(actionsFor('hidden', OLD))==='leadOff');
ok('5 shown again: the wait is cancelled and the lead asked for', j(actionsFor('visible', PHONE))==='disarmHidden,leadCheck');
ok('6 the wait ran out on a phone while hidden and leading: the lead goes', j(actionsFor('hiddenLong',{...PHONE, hidden:true, leads:true}))==='leadOff');
ok('6a not when shown meanwhile, not when not leading, not on a computer', !actionsFor('hiddenLong',{...PHONE, hidden:false, leads:true}).length && !actionsFor('hiddenLong',{...PHONE, hidden:true, leads:false}).length && !actionsFor('hiddenLong',{...PC, hidden:true, leads:true}).length);
ok('7 the wait is 15 s, and an unknown event does nothing', HIDDEN_LEAD_MS===15000 && actionsFor('nope', PHONE).length===0);

console.log(fails? '\n'+fails+' FAILED' : '\nall passed'); process.exit(fails? 1 : 0);
