// The rules of the account module under Node, without a browser (docs/SYNC-PLAN.md §4.11, §4.18, PR 4c): public/account/model.js is an ES
// module the page imports, and this file imports it the same way. The order of the status codes (the account's own states first, then the
// core's), signed out with what waits, a view-only tab with no status, the panel's rows (counts only when not zero, the errors with their
// reasons and titles, at most 20, the actions of each state), the line of «Історія» while versions still come, and the device name's limit.
import { statusOf, panelOf, historyNote, cleanName, CODES, TEXT, EXPLAIN } from '../public/account/model.js';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const me={uid:'u1', email:'u@test'};
const acc=(o={})=>({on:true, viewOnly:false, user:me, owner:me, cloud:true, signingOut:false, loading:false, signingIn:false, checking:false, dialog:false, probe:null, otherTab:false, ...o});
const core=(code, o={})=>({code, n:o.n??0, jobs:o.jobs??o.n??0, errorN:o.errors? o.errors.length : 0, errors:o.errors||[], checked:o.checked||0, vdone:o.vdone??true});

/* ── 1. the order: the account's own states, then the core's ── */
ok('1 every code has a text, an explanation and a kind', Object.keys(CODES).every(c=>TEXT[c]==='sync.st.'+c && EXPLAIN[c]==='account.why.'+c && ['synced','sending','busy','off','bad'].includes(CODES[c])));
ok('1a signing out comes before everything, the core says nothing then', statusOf(acc({signingOut:true, loading:true}), core('error',{n:3})).code==='signingOut');
ok('1b loading, signing in, checking (the dialog too) in that order', statusOf(acc({loading:true, signingIn:true}), null).code==='loading' && statusOf(acc({signingIn:true, checking:true}), null).code==='signingIn' && statusOf(acc({dialog:true}), core('synced')).code==='checking');
ok('1c the probe\'s results take their rows; «ok» is no row', statusOf(acc({probe:'open'}), core('synced')).code==='open' && statusOf(acc({probe:'denied'}), null).code==='denied' && statusOf(acc({probe:'ok'}), core('synced')).code==='synced');
ok('1d the owner dialog in another tab', statusOf(acc({otherTab:true}), core('synced')).code==='other');
ok('1e no owner and not signed in: no status; a view-only tab: none either; no account here: none', statusOf(acc({owner:null, user:null}), null)===null && statusOf(acc({viewOnly:true}), core('synced'))===null && statusOf(acc({on:false}), core('synced'))===null);
const so=statusOf(acc({user:null}), core('none',{jobs:4}));
ok('1f an owner, signed out: «signedOut» with what waits ('+JSON.stringify(so)+')', so.code==='signedOut' && so.n===4 && so.kind==='off');
ok('1g signed in without a cloud yet is signed out too', statusOf(acc({cloud:false}), core('pending',{jobs:1})).code==='signedOut');
const e=statusOf(acc(), core('error',{n:2, errors:[{col:'notes', id:'n1', reason:'size'},{col:'versions', id:'v1', reason:'invalid'}]}));
ok('1h the core\'s own codes pass through with their N and kind', e.code==='error' && e.n===2 && e.kind==='bad' && statusOf(acc(), core('waiting',{n:1})).kind==='sending' && statusOf(acc(), core('scan',{n:57})).n===57);
ok('1i a code the core does not have, or one of the account\'s, from the core is «pending»', statusOf(acc(), core('none')).code==='pending' && statusOf(acc(), core('signingIn')).code==='pending' && statusOf(acc(), null).code==='pending');

/* ── 2. the panel ── */
const p=panelOf({acc:acc(), core:core('synced',{checked:1700000000000}), counts:{notes:0, versions:2, local:1, copies:0}, used:{reads:12, writes:3}, limit:{reads:20000, writes:5000}, devName:'Ноутбук'});
ok('2 the email, the status, «synced», its text and explanation', p.email==='u@test' && p.status.code==='synced' && p.text==='sync.st.synced' && p.why==='account.why.synced' && p.signedIn);
ok('2a the counts shown only when not zero, in their order ('+p.counts.map(c=>c.k).join(',')+')', p.counts.map(c=>c.k).join(',')==='versions,local' && p.counts[0].key==='account.unsyncedVersions' && p.counts[0].n===2);
ok('2b «Перевірено» and today\'s budget', p.checked===1700000000000 && p.budget.reads===12 && p.budget.readsMax===20000 && p.budget.writes===3 && p.budget.writesMax===5000);
ok('2c signed in: «Вийти» and «Прибрати»; the device name', p.actions.join()==='signOut,remove' && p.devName==='Ноутбук');
const many=Array.from({length:25},(_,i)=>({col:i%2? 'versions' : 'notes', id:'x'+i, reason:i===0? 'receipts' : 'mystery'}));
const pe=panelOf({acc:acc(), core:core('error',{n:25, errors:many}), title:id=>'Нотатка '+id});
ok('2d «Не синхронізовано»: at most 20 rows, each with its reason key, a note with its title, an unknown reason as «refused»', pe.errors.length===20 && pe.errors[0].reason==='account.reason.receipts' && pe.errors[1].reason==='account.reason.invalid' && pe.errors[0].title==='Нотатка x0' && pe.errors[1].title==='');
ok('2e no list for any other code', panelOf({acc:acc(), core:core('sending',{n:1, errors:many})}).errors.length===0);
const po=panelOf({acc:acc({user:null}), core:core('none',{jobs:2})});
ok('2f signed out: the owner\'s email, «Увійти» and «Прибрати»', po.email==='u@test' && !po.signedIn && po.actions.join()==='signIn,remove' && po.status.code==='signedOut');
const pv=panelOf({acc:acc({viewOnly:true}), core:core('synced')});
ok('2g a view-only tab reads the panel with no status and no actions', pv.status===null && pv.actions.length===0 && pv.readOnly && pv.email==='u@test');
ok('2h no owner and not signed in: only «Увійти»', panelOf({acc:acc({user:null, owner:null}), core:null}).actions.join()==='signIn');

/* ── 3. «Історія» while versions still come; the device name ── */
ok('3 online and signed in, the first versions catch-up not done: «версії ще завантажуються»', historyNote(acc(), core('versions',{vdone:false}), true)==='hist.vLoading');
ok('3a offline or signed out: «версії ще не завантажено»', historyNote(acc(), core('offline',{vdone:false}), false)==='hist.vNotLoaded' && historyNote(acc({user:null}), core('none',{vdone:false}), true)==='hist.vNotLoaded');
ok('3b done, or no owner: nothing', historyNote(acc(), core('synced',{vdone:true}), true)===null && historyNote(acc({owner:null}), core('none',{vdone:false}), true)===null);
ok('3c the device name: trimmed, at most 80 UTF-16 units, cut between code points', cleanName('  Ноутбук  ')==='Ноутбук' && cleanName('😀'.repeat(45)).length===80 && cleanName('')==='');

console.log(fails? '\n'+fails+' FAILED' : '\nall passed'); process.exit(fails? 1 : 0);
