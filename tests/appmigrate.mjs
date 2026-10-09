// Moving between sites over real origins: the new site cannot see the old storage, so notes go export → import.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { serve, CTX } from './lib/server.mjs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const idbNotes=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const filled=list=>list.filter(n=>n.blocks.length).sort((a,b)=>a.id<b.id?-1:1);
const toast=async pg=>(await pg.locator('#toast').innerText()).trim();

// two servers on two ports: two origins, like yokogamma.github.io and baobook.matamata.dev
const oldSite=await serve(), newSite=await serve();
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900},acceptDownloads:true}); const errs=[];

const a=await ctx.newPage(); a.on('pageerror',e=>errs.push('PAGEERROR old '+e.message));
await a.goto(oldSite.url); await a.waitForTimeout(500);
await a.mouse.click(500,300); await a.keyboard.type('перша нотатка на старому сайті'); await a.keyboard.press('Escape'); await a.waitForTimeout(300);
await a.mouse.click(500,420); await a.keyboard.type('другий блок'); await a.keyboard.press('Escape'); await a.waitForTimeout(300);
await a.locator('#newBtn').click(); await a.waitForTimeout(300);
await a.mouse.click(600,300); await a.keyboard.type('друга нотатка'); await a.keyboard.press('Escape'); await a.waitForTimeout(600);
await a.evaluate(()=>document.getElementById('themeBtn')?.click()); await a.waitForTimeout(200);
const before=filled(await idbNotes(a)); const theme=await a.evaluate(()=>document.documentElement.dataset.theme);
ok('1 old site: two notes with three blocks saved', before.length===2 && before.reduce((s,n)=>s+n.blocks.length,0)===3);

const b=await ctx.newPage(); b.on('pageerror',e=>errs.push('PAGEERROR new '+e.message));
await b.goto(newSite.url); await b.waitForTimeout(500);
ok('2 new site, same browser: none of the old notes are visible (separate origin)', filled(await idbNotes(b)).length===0 && (await b.locator('#list .item').filter({hasText:'перша нотатка'}).count())===0);

await a.locator('#setBtn').click(); const [dl]=await Promise.all([a.waitForEvent('download'), a.locator('#exportBtn').click()]); const file=await dl.path();
await b.locator('#importFile').setInputFiles(file); await b.waitForTimeout(800);
const t1=await toast(b);
await b.reload(); await b.waitForTimeout(600);
const after=filled(await idbNotes(b));
ok('3 export on the old site → import on the new one: same notes after reload ('+t1+')', isDeepStrictEqual(after,before) && /Імпортовано: 2 нові/.test(t1) && !/не збережено/.test(t1));
ok('3b settings moved too (theme '+theme+')', await b.evaluate(()=>document.documentElement.dataset.theme)===theme);
ok('3c the notes are in the list on the new site', (await b.locator('#list .item').filter({hasText:'друга нотатка'}).count())===1);

await b.locator('#importFile').setInputFiles(file); await b.waitForTimeout(800);
const t2=await toast(b);
ok('4 importing the same backup again adds nothing ('+t2+')', /Імпортовано: 0 нових, 0 оновлено, 2 без змін/.test(t2) && filled(await idbNotes(b)).length===2);

await a.reload(); await a.waitForTimeout(500);
ok('5 the old site keeps its notes: moving does not delete anything', isDeepStrictEqual(filled(await idbNotes(a)),before));

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await oldSite.close(); await newSite.close(); await br.close(); process.exit(fails?1:0);
