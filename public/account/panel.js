// The account panel «Обліковий запис» (docs/SYNC-PLAN.md §4.11, §4.18, PR 4c), the entry of public/account/. The page mounts it once with
// what it knows and what it can do (the host below); the panel draws the status button, the menu row and itself from model.js through view.js,
// and runs the status timer of the leader while an attempt is unresolved. No globals: everything comes in through `host`.
import { statusOf, panelOf, historyNote, cleanName, TEXT } from './model.js';
import { renderStatus, renderPanel, CSS } from './view.js';
import { bindPanel } from './input.js';

/**
 * @typedef {{doc:Document, t:(key:string, params?:object)=>string, when:(ms:number)=>{day:string, time:string},
 *   button:HTMLElement, line:HTMLElement, opener:?HTMLElement (the focus after closing when the element that opened the panel is gone or hidden),
 *   account:()=>import('./model.js').AccountState, core:()=>?import('./model.js').CoreStatus,
 *   counts:()=>Promise<?import('./model.js').Counts>, used:()=>Promise<?import('./model.js').Budget>, limit:()=>?import('./model.js').Budget,
 *   devName:()=>string, title:(id:string)=>string, attempts:()=>number, leader:()=>boolean, tick:()=>void,
 *   nav:{open:(tag:string, back:()=>void)=>void, close:(tag:string)=>void},
 *   actions:import('./input.js').Actions, report:(ui:{code:string, text:string}|null)=>void}} Host
 * @param {Host} host
 */
export function mount(host){ const {doc, t}=host;
  const style=doc.createElement('style'); style.textContent=CSS; doc.head.append(style);
  const dlg=doc.createElement('dialog'); dlg.className='accp'; dlg.id='accPanel'; dlg.setAttribute('aria-labelledby','accPanelT');
  const head=doc.createElement('div'); head.className='accp-h'; const title=doc.createElement('span'); title.id='accPanelT'; title.textContent=t('account.panel');
  const x=doc.createElement('button'); x.type='button'; x.className='accp-x'; x.textContent='×'; x.setAttribute('aria-label', t('common.close')); head.append(title, x);
  const body=doc.createElement('div'); body.className='accp-body'; dlg.append(head, body); doc.body.append(dlg);
  let counts=null, used=null, drawn='', opener=null, auxT=0, auxN=0;
  const close=()=>{ host.nav.close('account'); if(dlg.open) dlg.close(); };   // the history entry goes at once: the dialog's own `close` event comes later, after an action may have opened its own layer
  dlg.addEventListener('close',()=>{ host.nav.close('account'); drawn=''; const o=opener && !opener.hidden && opener.isConnected? opener : host.opener; if(o) o.focus({preventScroll:true}); });
  x.addEventListener('click', close);
  // Esc is the panel's own: the page's listeners below it («Історія», the selection) must not close what lies under it
  dlg.addEventListener('keydown', e=>{ if(e.key!=='Escape') return; e.preventDefault(); e.stopPropagation(); close(); });
  dlg.addEventListener('click', e=>{ if(e.target!==dlg) return; const r=dlg.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) close(); });   // a click on the backdrop
  // every action asks the state of the moment, not the one drawn: a tab locked while the panel was open keeps only what a view-only panel offers
  const now=()=>panelOf({acc:host.account(), core:host.core(), counts, used, limit:host.limit(), devName:host.devName(), title:host.title});
  const allowed=a=>{ const p=now(); return a==='openNote' || (a==='rename'? p.nameField : p.actions.includes(a)); };
  const acts={}; for(const [a,fn] of Object.entries(host.actions)) acts[a]=(...args)=>{ if(allowed(a)) fn(...args); else draw(); };
  bindPanel(body, {...acts, rename:name=>acts.rename(cleanName(name))}, close);
  // drawn again only when what it shows changed: a redraw replaces the buttons (a press in progress) and the name field
  const draw=()=>{ if(!dlg.open) return; const p=now(), key=JSON.stringify(p);
    if(key===drawn) return; drawn=key; renderPanel(body, p, t, host.when); };
  // the counts and today's use come from the store: read when the panel opens, shortly after each status change (the queue's length is part of
  // it) and on the timer below while it is open
  async function aux(){ const n=++auxN; let c=null, u=null; try{ c=await host.counts(); }catch(_){} try{ u=await host.used(); }catch(_){} if(n!==auxN) return; counts=c; used=u; draw(); }
  const auxSoon=()=>{ clearTimeout(auxT); auxT=setTimeout(()=>{ if(dlg.open) aux(); }, 250); };
  // and every 2 s: today's use moves with each read and write, and in a tab that does not lead nothing tells it so
  setInterval(()=>{ if(dlg.open) aux(); }, 2000);
  // the button and the menu row; the panel follows when open
  function render(){ const st=statusOf(host.account(), host.core()), text=renderStatus(host.button, host.line, st, st? TEXT[st.code] : null, t);
    host.report(st? {code:st.code, text} : null); draw(); if(dlg.open) auxSoon(); }
  async function open(from){ if(dlg.open) return; counts=null; used=null; drawn=''; opener=from || null; render(); dlg.showModal(); host.nav.open('account', close); draw(); await aux(); }
  // the status timer (§4.18): a held request ends no step, so while an attempt is unresolved (or a write waits on a slow store) the leader asks the
  // core once a second
  const timer=setInterval(()=>{ if(host.leader() && host.attempts()) host.tick(); }, 1000);
  return {open, close, render, isOpen:()=>dlg.open, historyNote:online=>historyNote(host.account(), host.core(), online), stop:()=>clearInterval(timer)};
}
