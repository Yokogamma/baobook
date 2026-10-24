// The account's status and panel on the screen (docs/SYNC-PLAN.md §4.11, §4.18): the button in the header, the line under the account in the
// menu and the panel. Only DOM: what to show comes from model.js, the strings from the page's `t` (loc). The panel's styles live here with it.

/** @typedef {(key:string, params?:object)=>string} T */

/**
 * The button and the menu row: the text of the status, its icon kind, the label for screen readers; hidden when there is no status.
 * @param {HTMLElement} btn @param {HTMLElement} line @param {?import('./model.js').Status} st @param {?string} key @param {T} t
 */
export function renderStatus(btn, line, st, key, t){
  if(!st){ btn.hidden=true; line.textContent=''; return ''; }
  const text=t(key, {n:st.n}); btn.hidden=false; btn.dataset.st=st.kind; btn.title=text; btn.setAttribute('aria-label', text); line.textContent=text; return text;
}

const el=(doc, tag, cls, text)=>{ const e=doc.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; };

/**
 * The panel's contents, drawn again from the model each time (it holds no state of its own besides the name field while it has the focus).
 * @param {HTMLElement} body @param {ReturnType<typeof import('./model.js').panelOf>} p @param {T} t @param {(ms:number)=>{day:string, time:string}} when
 *   the day is empty for today
 */
export function renderPanel(body, p, t, when){ const doc=body.ownerDocument, keep=body.querySelector('.accp-name input');
  const typing=keep && doc.activeElement===keep? keep.value : null; body.textContent='';
  if(p.email) body.append(el(doc,'div','accp-e',p.email));
  if(p.status){ const s=el(doc,'div','accp-s'); s.dataset.st=p.status.kind; s.append(el(doc,'span','accp-dot'), el(doc,'span','accp-st',t(p.text,{n:p.status.n}))); body.append(s, el(doc,'p','accp-why',t(p.why,{n:p.status.n}))); }
  if(p.errors.length){ const ul=el(doc,'ul','accp-err'); for(const e of p.errors){ const li=el(doc,'li');
      if(e.col==='notes'){ const b=el(doc,'button','accp-link',e.title||t('account.errNoteUntitled')); b.type='button'; b.dataset.note=e.id; li.append(b); } else li.append(el(doc,'span','',t('account.errVersion')));
      li.append(el(doc,'span','accp-why',t(e.reason))); ul.append(li); } body.append(ul); }
  if(p.counts.length){ const ul=el(doc,'ul','accp-n'); for(const c of p.counts) ul.append(el(doc,'li','',t(c.key,{n:c.n}))); body.append(ul); }
  if(p.checked){ const w=when(p.checked); body.append(el(doc,'div','accp-sub', w.day? t('account.checkedDay',{day:w.day, time:w.time}) : t('account.checked',{time:w.time}))); }
  if(p.budget) body.append(el(doc,'div','accp-sub',t('account.reads',{n:p.budget.reads, max:p.budget.readsMax})), el(doc,'div','accp-sub',t('account.writes',{n:p.budget.writes, max:p.budget.writesMax})));
  const lab=el(doc,'label','accp-name'), inp=doc.createElement('input'); lab.append(el(doc,'span','',t('account.devName'))); inp.maxLength=80; inp.autocomplete='off'; inp.value=typing ?? p.devName; inp.disabled=p.readOnly; lab.append(inp); body.append(lab);
  if(typing!=null) inp.focus();
  if(p.actions.length){ const row=el(doc,'div','accp-b'); for(const a of p.actions){ const b=el(doc,'button','fbtn'+(a==='remove'? ' danger' : ''), t(ACT[a])); b.type='button'; b.dataset.act=a; row.append(b); } body.append(row); }
}
const ACT={signIn:'account.signIn', signOut:'account.signOut', remove:'account.remove'};

// the styles of the panel: a dialog on a computer, a bottom sheet on a phone (with its own history entry, closed by Back: panel.js)
export const CSS=`
.accp{border:0;border-radius:12px;padding:0;width:min(420px,calc(100vw - 32px));max-height:min(80vh,640px);background:var(--paper);color:var(--ink);box-shadow:var(--shadow)}
.accp::backdrop{background:rgba(0,0,0,.25)}
.accp-h{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 4px;font-weight:600}
.accp-x{border:0;background:transparent;color:var(--ink-2);font-size:20px;line-height:1;width:32px;height:32px;border-radius:6px;cursor:pointer}
.accp-body{padding:4px 14px 14px;overflow:auto;max-height:calc(min(80vh,640px) - 48px)}
.accp-e{color:var(--ink-2);margin:2px 0 8px;overflow-wrap:anywhere}
.accp-s{display:flex;align-items:center;gap:8px;font-weight:500}
.accp-dot{width:10px;height:10px;flex:0 0 auto;background:var(--ink-3);border-radius:50%}
.accp-s[data-st="synced"] .accp-dot{background:#2e7d32;border-radius:2px} .accp-s[data-st="bad"] .accp-dot{background:#c33;border-radius:0;transform:rotate(45deg)}
.accp-s[data-st="off"] .accp-dot{background:transparent;border:2px solid var(--ink-3)} .accp-s[data-st="sending"] .accp-dot{background:var(--accent)}
.accp-why{color:var(--ink-2);font-size:var(--t-sm);margin:4px 0 10px}
.accp-err,.accp-n{list-style:none;margin:0 0 10px;padding:0} .accp-err li{display:flex;flex-direction:column;padding:4px 0;border-top:.5px solid var(--line)}
.accp-err .accp-why{margin:0} .accp-link{border:0;background:transparent;color:var(--accent);padding:0;text-align:left;cursor:pointer;text-decoration:underline;font:inherit}
.accp-n li{padding:2px 0} .accp-sub{color:var(--ink-2);font-size:var(--t-sm);padding:2px 0}
.accp-name{display:flex;flex-direction:column;gap:4px;margin:12px 0 4px;font-size:var(--t-sm);color:var(--ink-2)}
.accp-name input{font:inherit;color:var(--ink);background:var(--page);border:.5px solid var(--line-2);border-radius:6px;padding:6px 8px}
.accp-b{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px} .accp-b .fbtn{flex:1 1 auto}
@media (max-width:640px){ .accp{width:100vw;max-width:100vw;margin:auto 0 0;border-radius:12px 12px 0 0;max-height:85vh} .accp-body{max-height:calc(85vh - 48px);padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))} .accp-b .fbtn{min-height:44px} }
`;
