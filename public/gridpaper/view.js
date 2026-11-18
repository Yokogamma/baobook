// The numbered edges of the «Клітинка» theme (docs/GRID-THEME-PLAN.md §5): one layer of numbers inside the sheet, so it scrolls and zooms with it.
// The page calls update() from field(), the function that sizes the cell frame, with the frame and whether the theme is on; the CSS of the
// theme places and hides the layer (also under «Сітка аркуша» off). Hidden from screen readers and from selection: the numbers are decoration.
import { rulers } from './model.js';

/**
 * @param {HTMLElement} sheet
 * @returns {{update:(f:{cols:number, rows:number, g:number, on:boolean})=>void, el:HTMLElement}}
 */
export function mount(sheet){
  const doc=sheet.ownerDocument, el=doc.createElement('div');
  el.className='gp-rulers'; el.setAttribute('aria-hidden','true'); sheet.append(el);
  let key='';
  function update({cols, rows, g, on}){
    const k=on? cols+'/'+rows+'/'+g : ''; if(k===key) return; key=k;
    el.replaceChildren(); if(!on) return;
    const R=rulers({cols, rows, g}), f=doc.createDocumentFragment();
    const num=(cls, n, x, y)=>{ const s=doc.createElement('span'); s.className=cls; s.textContent=String(n); s.style.left=x+'px'; s.style.top=y+'px'; f.append(s); };
    for(const c of R.cols) num('gp-c', c.n, c.x, R.top);
    for(const r of R.rows) num('gp-r', r.n, R.left, r.y);
    el.append(f);
  }
  return {update, el};
}
