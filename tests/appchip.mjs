import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const ZW=String.fromCharCode(0x200b), nl=s=>String(s||'').replace(/\n/g,'⏎');
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const stored=async re=>(await idbAll()).flatMap(n=>n.blocks).find(b=>re.test(b.text||''))||{};
const txt=re=>pg.locator('#sheet .blk .txt').filter({hasText:re}).first();
const write=async(y,t)=>{ await pg.mouse.click(400,y); await pg.keyboard.type(t); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450); };
const reload=async()=>{ await pg.reload(); await pg.waitForTimeout(500); };
// межа символу k у тексті чипа (k=0 — перед першим символом) і середина рядка
const chipAt=(re,k)=>txt(re).evaluate((e,k)=>{ const t=e.querySelector('code').firstChild, r=document.createRange(); r.setStart(t,Math.max(0,k-1)); r.setEnd(t,Math.max(1,k)); const b=r.getBoundingClientRect(); return {x:k? b.right : b.left, y:b.top+b.height/2}; },k);
const chipBox=re=>txt(re).evaluate(e=>{ const r=e.querySelector('code').getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,y:r.top+r.height/2}; });
const sel=()=>pg.evaluate(()=>{ const s=getSelection(), el=n=>n&&(n.nodeType===1? n : n.parentElement); return {text:s.toString(), a:!!(s.anchorNode&&el(s.anchorNode).closest('code')), f:!!(s.focusNode&&el(s.focusNode).closest('code'))}; });
const textAt=(re,word)=>txt(re).evaluate((e,word)=>{ const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); let n; while((n=w.nextNode())) if(n.nodeValue.includes(word)) break; const i=n.nodeValue.indexOf(word), r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+1); const b=r.getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; },word);
await pg.goto(new URL('../public/index.html', import.meta.url).href); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await reload();

// 1 курсор усередині чипа видно: чип без position (позиціонований Chrome малює шаром поверх курсора), іконка — у потоці рядка
await write(200,'Ключ: `sk-live-77x` далі'); await reload();
{ const css=await txt(/Ключ/).evaluate(e=>{ const c=e.querySelector('code'); return getComputedStyle(c).position+' / '+getComputedStyle(c,'::after').display; });
  const e=await chipAt(/Ключ/,11), cb=await chipBox(/Ключ/), clip={x:Math.round(e.x)-3, y:Math.round(cb.t)+3, width:7, height:Math.round(cb.b-cb.t)-6};
  const shot=async()=>(await pg.screenshot({clip,caret:'initial'})).toString('base64');
  const diff=(p,q)=>pg.evaluate(async([p,q])=>{ const px=async s=>{ const im=new Image(); im.src='data:image/png;base64,'+s; await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const x=c.getContext('2d'); x.drawImage(im,0,0); return x.getImageData(0,0,c.width,c.height).data; };
    const a=await px(p), b=await px(q); let s=0; for(let i=0;i<a.length;i+=4) s+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]); return s; },[p,q]);
  await pg.mouse.move(1100,860); const base=await shot();   // кадр без фокуса — курсора немає
  await pg.mouse.click(e.x-2,e.y); await pg.mouse.move(1100,860); const s1=await sel(); let best=0;
  for(let i=0;i<10 && best<600;i++){ best=Math.max(best, await diff(base, await shot())); await pg.waitForTimeout(120); }   // курсор блимає — кілька кадрів
  ok('1 курсор у кінці чипа видно на знімку (різниця з кадром без курсора: '+best+'), чип: '+css, css==='static / inline-block' && s1.a && best>=600);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); }

// 2 чип посеред рядка (після перезавантаження): → у кінці чипа виводить курсор, набір іде зовні чипа
{ const e=await chipAt(/Ключ/,10); await pg.mouse.click(e.x,e.y); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.type('X'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);
  const st=await stored(/Ключ/); ok('2 → → з кінця чипа посеред рядка, набір — зовні чипа: «'+st.html+'»', st.html==='Ключ: <code>sk-live-77x</code>X далі'); }

// 3–4 клік одразу за чипом посеред рядка — набір зовні; Backspace за чипом стирає символ чипа, а не невидимий нульовий пробіл
await write(280,'Пароль `qwe` тут'); await reload();
{ const cb=await chipBox(/Пароль/); await pg.mouse.click(cb.r+1,cb.y); await pg.keyboard.type('Y'); await pg.waitForTimeout(100);
  const h=await txt(/Пароль/).evaluate(e=>e.innerHTML); ok('3 клік за правою рамкою чипа, набір — зовні: «'+h.split(ZW).join('')+'»', h.split(ZW).join('')==='Пароль <code>qwe</code>Y тут');
  await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);
  const st=await stored(/Пароль/); ok('4 Backspace, Backspace: стерто «Y» і останній символ чипа: «'+st.html+'»', st.html==='Пароль <code>qw</code> тут'); }

// 5 чип упритул до слова: подвійний клік виділяє лише чип; Ctrl+E знімає його без порожньої рамки
await write(360,'ключ`abc`'); await reload();
{ const e=await chipAt(/ключ/,2); await pg.mouse.dblclick(e.x-3,e.y); await pg.waitForTimeout(250); const s=await sel();
  ok('5a подвійний клік по чипу впритул до слова: виділено «'+s.text+'» усередині чипа', s.text==='abc' && s.a && s.f);
  await pg.keyboard.press('Control+e'); await pg.waitForTimeout(450); const st=await stored(/ключ/), n=await txt(/ключ/).evaluate(e=>e.querySelectorAll('code').length), s2=await sel();
  ok('5b Ctrl+E знімає чип, порожньої рамки немає: «'+(st.html||st.text)+'», чипів '+n+', виділення лишилось: «'+s2.text+'»', !st.html && st.text==='ключabc' && n===0 && s2.text==='abc');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); }

// 6 чип у кінці рядка, під ним рядок, створений Enter (<div>): подвійний клік не переходить на наступний рядок; Ctrl+E на двох рядках — чип у кожному
await pg.mouse.click(400,440); await pg.keyboard.type('пароль `abc`'); await pg.keyboard.press('Enter'); await pg.keyboard.type('next тут'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);
{ const e=await chipAt(/пароль/,2); await pg.mouse.dblclick(e.x-3,e.y); await pg.waitForTimeout(250); const s=await sel();
  ok('6a подвійний клік по чипу над рядком-<div>: виділено «'+nl(s.text)+'»', s.text==='abc');
  await txt(/пароль/).evaluate(e=>{ const c=e.querySelector('code'), w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); let t; while((t=w.nextNode())) if(t.nodeValue.includes('next')) break; const r=document.createRange(); r.setStart(c.firstChild,0); r.setEnd(t,t.nodeValue.indexOf('next')+4); const s=getSelection(); s.removeAllRanges(); s.addRange(r); });
  await pg.keyboard.press('Control+e'); await pg.waitForTimeout(450); const st=await stored(/пароль/), cross=await txt(/пароль/).evaluate(e=>[...e.querySelectorAll('code')].some(c=>c.querySelector('div,br,p')||/\n/.test(c.textContent)));
  ok('6b Ctrl+E на двох рядках: чип у кожному, жоден не переходить на інший рядок: «'+nl(st.html)+'»', st.html==='пароль <code>abc</code>\n<code>next</code> тут' && !cross);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); }

// 7 Enter у кінці чипа посеред рядка: новий рядок — звичайний текст; Backspace на початку рядка склеює рядки зовні чипа
await write(560,'ключ `xyz` хвіст'); await reload();
{ const e=await chipAt(/хвіст/,3); await pg.mouse.click(e.x-2,e.y); await pg.keyboard.press('Enter'); await pg.keyboard.type('нове'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);
  const st=await stored(/хвіст/); ok('7a Enter у кінці чипа: новий рядок не в чипі: «'+nl(st.html)+'»', st.html==='ключ <code>xyz</code>\nнове хвіст');
  const p=await textAt(/хвіст/,'нове'); await pg.mouse.click(p.x,p.y); await pg.keyboard.press('Home'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);
  const st2=await stored(/хвіст/); ok('7b Backspace на початку рядка під чипом склеює рядки зовні чипа: «'+nl(st2.html)+'»', st2.html==='ключ <code>xyz</code>нове хвіст'); }

// 8 Windows виділяє подвійним кліком слово разом із пробілом після нього: пробіл відкидається, токен не захоплює наступне слово
await write(640,'Сервер: пароль Zx9vQ2m порт 2222');
{ await txt(/Сервер/).evaluate(e=>{ const t=e.firstChild, i=t.nodeValue.indexOf('Zx9'), r=document.createRange(); r.setStart(t,i); r.setEnd(t,i+8); const s=getSelection(); s.removeAllRanges(); s.addRange(r); e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); });
  await pg.waitForTimeout(150); const s=await sel(); ok('8 виділення «слово + пробіл» (як на Windows) після розширення: «'+s.text+'»', s.text==='Zx9vQ2m'); }

// 9 Ctrl+C рядка з чипом: у буфері немає службових нульових пробілів
{ await pg.keyboard.press('Escape'); await pg.evaluate(()=>navigator.clipboard.writeText('')); const t=txt(/Ключ/); await t.click({position:{x:8,y:12}});
  await t.evaluate(e=>{ const r=document.createRange(); r.selectNodeContents(e); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }); await pg.keyboard.press('Control+c'); await pg.waitForTimeout(200);
  const clip=await pg.evaluate(()=>navigator.clipboard.readText()); ok('9 Ctrl+C рядка з чипом: у буфері «'+clip+'», нульових пробілів немає', clip==='Ключ: sk-live-77xX далі' && !clip.includes(ZW));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); }

// 10 ручка розміру блока не перекриває іконку чипа в кінці рядка
await write(720,'Токен `abc`');
{ const t=txt(/Токен/); await t.hover({position:{x:8,y:12}}); await pg.waitForTimeout(200);
  const hit=await t.evaluate(e=>{ const l=[...e.querySelector('code').getClientRects()].pop(), out=[]; for(const x of [l.right-12, l.right-7, l.right-3]) for(const y of [l.top+l.height/2, l.top+l.height/2+5]){ const el=document.elementFromPoint(x,y); out.push(el&&el.tagName); } return out; });   // центр і правий край іконки, правий відступ чипа
  ok('10 під іконкою чипа в кінці рядка — сам чип, а не ручка розміру: '+hit.join(', '), hit.every(h=>h==='CODE')); }

// 11 виділення від слова до кінця чипа + Ctrl+E: один чип без порожньої рамки поруч
await write(800,'ab `cd` ef'); await reload();
{ const t=txt(/ab cd/); await t.click({position:{x:8,y:12}});
  await t.evaluate(e=>{ const c=e.querySelector('code'), r=document.createRange(); r.setStart(e.firstChild,0); r.setEnd(c.firstChild,2); const s=getSelection(); s.removeAllRanges(); s.addRange(r); });
  await pg.keyboard.press('Control+e'); await pg.waitForTimeout(450); const st=await stored(/ef/), chips=await t.evaluate((e,ZW)=>[...e.querySelectorAll('code')].map(c=>c.textContent.split(ZW).join('')),ZW);
  ok('11 від слова до кінця чипа + Ctrl+E: «'+st.html+'», чипи: '+JSON.stringify(chips), st.html==='<code>ab cd</code> ef' && chips.length===1); }

// 12 чип на кілька рядків зі старих даних (до виправлення так бувало) показується окремими чипами по рядках
await pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('notes','readwrite'); t.objectStore('notes').put({id:'old',title:'',blocks:[{id:'o1',fx:0.2,row:2,text:'пароль abc\nnext тут',html:'пароль <code>abc\nnext</code> тут'}],created:1,updated:Date.now()+90000}); t.oncomplete=()=>{ d.close(); res(); }; }; }));
await pg.evaluate(()=>localStorage.clear()); await reload();
{ const chips=await txt(/next/).evaluate((e,ZW)=>[...e.querySelectorAll('code')].map(c=>c.textContent.split(ZW).join('')),ZW);
  ok('12 старий чип на два рядки показано двома чипами: '+JSON.stringify(chips), JSON.stringify(chips)==='["abc","next"]'); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
