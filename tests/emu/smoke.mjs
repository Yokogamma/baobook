// The emulator scenarios' machinery, end to end: the Auth and Firestore emulators driven by REST, the rules loaded with a user's uid, the
// browser loading the Firebase SDK from the local cache in place of gstatic, signing in with a fake Google credential, and the adapter
// (public/cloud.js) writing and reading through the rules. No request leaves for a real Google host (every such request is aborted and
// counted). Run from tests/rules through the emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/smoke.mjs"
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from '../lib/server.mjs';
import { PROJECT, SDK_BASE, clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, seed, readDoc, routeSdk, Ts } from './lib/emu.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), u2=await googleUser('sub-two','two@example.com');
ok('1 two Google users of the emulator, with uids of its own ('+u1.uid+', '+u2.uid+')', !!u1.uid && !!u2.uid && u1.uid!==u2.uid && u1.email==='one@example.com');
ok('1b the same sub gives the same user again', (await googleUser('sub-one','one@example.com')).uid===u1.uid);
await loadRules(rulesFor(u1.uid));
const ROOT1='env/dev/users/'+u1.uid;
await seed(ROOT1+'/notes/seeded', {v:1, rev:2, op:'o-seed', srv:new Ts(1_800_000_000, 123456000), dev:'devS', rcpt:{devS:'o-seed'}, title:'Seeded', blocks:[{id:'b', row:0, fx:0, text:'from REST'}], created:1, updated:2, deleted:5, tsrv:new Ts(1_800_000_000, 123456000)});
const back=await readDoc(ROOT1+'/notes/seeded');
ok('2 a document seeded past the rules reads back with its timestamp (ns '+back.tsrv.ns+') and its map and list', back.rev===2 && back.srv.s===1_800_000_000 && back.srv.ns===123456000 && back.rcpt.devS==='o-seed' && back.blocks[0].text==='from REST' && (await readDoc(ROOT1+'/notes/none'))===null);

const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, serviceWorkers:'block', viewport:{width:1280,height:900}}); const blocked=await routeSdk(ctx);
const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(SITE); await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000});
await pg.addScriptTag({url:SITE+'cloud.js'});
const res=await pg.evaluate(async([base, project, cred1, cred2, uid1])=>{ const out={};
  try{ const [app, auth, fsm]=await Promise.all([import(base+'firebase-app.js'), import(base+'firebase-auth.js'), import(base+'firebase-firestore.js')]); out.loaded=true;
    const a=app.initializeApp({apiKey:'demo-api-key', projectId:project, appId:'1:1:web:demo', authDomain:location.hostname});
    const au=auth.getAuth(a); auth.connectAuthEmulator(au, 'http://127.0.0.1:9099', {disableWarnings:true});
    const db=fsm.getFirestore(a); fsm.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const u=await auth.signInWithCredential(au, auth.GoogleAuthProvider.credential(cred1)); out.uid=u.user.uid; out.email=u.user.email; out.sameUid=u.user.uid===uid1;
    const cloud=BaobookCloud.make({fs:fsm, db, root:'env/dev/users/'+u.user.uid, uid:u.user.uid});
    const r=await cloud.txn('notes','n1', D=>({v:1, rev:(D? D.rev : 0)+1, op:'o1', dev:'devA', rcpt:{...(D? D.rcpt : {}), devA:'o1'}, title:'From the browser', blocks:[{id:'b', row:0, fx:0, text:'через адаптер'}], created:1, updated:1}));
    out.wrote=r.wrote; const d=await cloud.get('notes','n1'); out.doc={rev:d.rev, srv:d.srv, title:d.title}; const s=await cloud.get('notes','seeded'); out.seeded={rev:s.rev, srv:s.srv, tsrv:s.tsrv, text:s.blocks[0].text};
    out.totals=await cloud.totals('notes'); out.page=(await cloud.page('notes',{from:null},10)).map(x=>x.id);
    await auth.signOut(au); const u2=await auth.signInWithCredential(au, auth.GoogleAuthProvider.credential(cred2)); out.uid2=u2.user.uid;
    const other=BaobookCloud.make({fs:fsm, db, root:'env/dev/users/'+u2.user.uid, uid:u2.user.uid}); try{ await other.get('notes','x'); out.otherCode='none'; }catch(e){ out.otherCode=e.code; }
    const spy=BaobookCloud.make({fs:fsm, db, root:'env/dev/users/'+uid1}); try{ await spy.get('notes','n1'); out.spyCode='none'; }catch(e){ out.spyCode=e.code; }
  }catch(e){ out.error=String(e && e.stack || e); } return out; }, [SDK_BASE, PROJECT, credential('sub-one','one@example.com'), credential('sub-two','two@example.com'), u1.uid]);
if(res.error) console.log(res.error);
ok('3 the SDK loaded from the cache in place of gstatic and the browser signed in through the Auth emulator as the same user REST made ('+res.uid+')', res.loaded && res.sameUid && res.email==='one@example.com');
ok('4 the adapter wrote through the rules and read it back from the server (rev '+(res.doc||{}).rev+', srv '+JSON.stringify((res.doc||{}).srv)+')', res.wrote===true && res.doc && res.doc.rev===1 && Number.isInteger(res.doc.srv.s) && res.doc.title==='From the browser');
ok('5 the seeded document reads with its timestamps as {s, ns} ('+JSON.stringify((res.seeded||{}).tsrv)+')', res.seeded && res.seeded.srv.s===1_800_000_000 && res.seeded.srv.ns===123456000 && res.seeded.tsrv.ns===123456000 && res.seeded.text==='from REST');
ok('6 totals and a page over both documents, in srv order (the seeded one is dated in the future)', res.totals && res.totals.count===2 && res.totals.sum===3 && res.page && res.page.join()==='n1,seeded');
ok('7 another account, not in the rules, is refused in its own space and in the owner\'s ('+res.otherCode+', '+res.spyCode+')', res.uid2===u2.uid && res.otherCode==='permission-denied' && res.spyCode==='permission-denied');
const stored=await readDoc(ROOT1+'/notes/n1');
ok('8 the browser\'s write is in the emulator with a server srv and the receipt', !!stored && stored.rev===1 && stored.srv instanceof Ts && stored.rcpt.devA==='o1');
ok('9 no request went to a real Google host ('+blocked.length+' blocked)', blocked.length===0); if(blocked.length) console.log(blocked);
ok('10 no page errors', !errs.length); if(errs.length) console.log(errs);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
