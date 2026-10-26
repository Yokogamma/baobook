// The app itself on the emulators: a browser «device» is a context of its own (own storage) with the `emulator` flag in the settings, so
// the app on 127.0.0.1 takes the demo project (public/index.html, FB_EMU), the SDK from the local cache in place of gstatic, every other
// Google host aborted. Sign-in goes through the app's test hook (signInWithCredential with a fake Google credential the Auth emulator
// accepts); everything after it is the app's own code: the access check, the owner, the engine, the status
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from '../../lib/server.mjs';
import { ready } from '../../lib/wait.mjs';
import { routeSdk } from './emu.mjs';

// the pace of the engine under the emulator: no send delays, short retries (the app reads it from the settings under the emulator only)
export const TUNE={pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:300, retryMax:1500}, budgets:{reads:1e6, writes:1e6}};
export async function launch(){ const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
  const srv=await serve(); return {br, srv, SITE:srv.url, close:async()=>{ await br.close(); await srv.close(); }}; }
// a device: the flag and the pace go into the settings before the app's first start (and stay: the app's own settings are not overwritten)
export async function device(env, name, o={}){ const ctx=await env.br.newContext({...CTX, serviceWorkers:'block', viewport:{width:1280,height:900}, ...(o.ctx||{})}); const blocked=await routeSdk(ctx);
  await ctx.addInitScript(tune=>{ try{ const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); if(!s.emulator){ s.emulator=true; s.tune=tune; localStorage.setItem('sheet:settings', JSON.stringify(s)); } }catch(_){} }, o.tune||TUNE);
  const d={ctx, errs:[], blocked, name, close:()=>ctx.close()}; d.pg=await tab(d, env); return d; }
export async function tab(d, env){ const pg=await d.ctx.newPage(); pg.on('pageerror',e=>d.errs.push(d.name+': '+e.message)); await pg.goto(env.SITE); await ready(pg); return pg; }
export const acc=pg=>pg.evaluate(()=>sheetDebug.sync.account());
export const signIn=(pg, cred)=>pg.evaluate(c=>sheetDebug.sync.signIn(c), cred);
export const signOut=pg=>pg.evaluate(()=>sheetDebug.sync.signOut());
export const press=pg=>pg.evaluate(()=>sheetDebug.sync.press());
export const choose=(pg, id)=>pg.evaluate(id=>sheetDebug.sync.choose(id), id);
export const loc=(pg, key, p)=>pg.evaluate(([k,p])=>loc(k,p), [key,p]);
export const settings=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:settings')||'{}'));
// the account menu and the status button as the user sees them
export const menu=pg=>pg.evaluate(()=>{ const $=id=>document.getElementById(id), st=$('syncBtn'); return {signIn:!$('signInBtn').hidden, lbl:$('signInLbl').textContent, signOut:!$('signOutBtn').hidden, remove:!$('removeBtn').hidden, row:!$('accRow').hidden, email:$('accEmail').textContent, state:$('accState').textContent, hr:!$('accHr').hidden,
  sync:!st.hidden, st:st.dataset.st, title:st.title, choice:sheetDebug.sync.choice(), choiceTitle:$('choiceTitle').textContent, choiceText:$('choiceText').textContent, rc:!$('rcStrip').hidden}; });
// waits: the status code of the account, a condition in the page (an async function is awaited)
export const untilUI=(pg, code, timeout=20000)=>pg.waitForFunction(c=>{ const a=sheetDebug.sync.account(); return !!a.ui && a.ui.code===c; }, code, {timeout});
export const until=(pg, fn, arg, timeout=20000)=>pg.waitForFunction(fn, arg, {timeout});
export const noteText=(pg, id)=>pg.evaluate(async id=>{ const st=await sheetDebug.sync.state(id); return st.note? st.note.blocks.map(b=>b.text).join('\n') : null; }, id);
export const untilNote=(pg, id, re, timeout=20000)=>pg.waitForFunction(async([id, re])=>{ const st=await sheetDebug.sync.state(id); return !!st.note && new RegExp(re).test(st.note.blocks.map(b=>b.text).join('\n')); }, [id, re.source], {timeout});
export const listed=(pg, id)=>pg.evaluate(id=>!!document.querySelector('#list .item[data-id="'+id+'"]'), id);
