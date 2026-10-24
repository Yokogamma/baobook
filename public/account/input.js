// What the account panel's controls do (docs/SYNC-PLAN.md §4.11): its buttons («Увійти через Google», «Вийти», «Експортувати з історією»,
// «Прибрати нотатки з пристрою»), the links of the stuck notes and the device name field. Only events: the actions themselves are the page's.

/**
 * @typedef {{signIn:()=>void, signOut:()=>void, export:()=>void, remove:()=>void, openNote:(id:string)=>void, rename:(name:string)=>void}} Actions
 * @param {HTMLElement} body the panel's body, drawn again by view.js; the listeners sit on it once, so a redraw keeps them
 * @param {Actions} actions @param {()=>void} close the panel closes before an action that opens a dialog or leaves it
 */
export function bindPanel(body, actions, close){
  body.addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b || !body.contains(b)) return;
    if(b.dataset.note){ close(); actions.openNote(b.dataset.note); return; }
    const a=b.dataset.act; if(!a || !actions[a]) return; close(); actions[a](); });
  // the name goes when the field is left or Enter is pressed
  body.addEventListener('change', e=>{ const inp=e.target.closest('.accp-name input'); if(inp) actions.rename(inp.value); });
  body.addEventListener('keydown', e=>{ const inp=e.target.closest('.accp-name input'); if(!inp) return; if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } });
}
