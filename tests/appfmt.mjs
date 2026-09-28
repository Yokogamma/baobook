import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const stored=async()=>(await idbAll()).flatMap(n=>n.blocks).find(b=>/Один/.test(b.text||''));
const html=()=>pg.locator('.blk .txt').filter({hasText:'Один'}).first().evaluate(e=>e.innerHTML);
await pg.goto(new URL('../index.html', import.meta.url).href); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
await pg.mouse.click(500,300); await pg.keyboard.type('Один два три чотири'); await pg.waitForTimeout(100);
// виділяємо слово клавіатурою: Home, → n разів, Shift+→ m разів
const select=async(skip,len)=>{ await pg.keyboard.press('Home'); for(let i=0;i<skip;i++) await pg.keyboard.press('ArrowRight'); for(let i=0;i<len;i++) await pg.keyboard.press('Shift+ArrowRight'); };
await select(5,3); await pg.keyboard.press('Control+b'); await pg.waitForTimeout(450);
{ const st=await stored(); ok('1 Ctrl+B: «два» жирним у DOM і в сховищі; чистий текст без тегів ('+(st&&st.html)+')', /<b>два<\/b>/.test(await html()) && st && st.html==='Один <b>два</b> три чотири' && st.text==='Один два три чотири'); }
await select(9,3); await pg.keyboard.press('Control+i'); await pg.waitForTimeout(100);
await select(13,6); await pg.keyboard.press('Control+u'); await pg.waitForTimeout(100);
await select(0,4); await pg.keyboard.press('Control+Shift+s'); await pg.waitForTimeout(450);
{ const st=await stored(); ok('2 курсив, підкреслення, перекреслення: '+(st&&st.html), st && st.html==='<s>Один</s> <b>два</b> <i>три</i> <u>чотири</u>'); }
await pg.keyboard.press('Escape'); await pg.waitForTimeout(400); await pg.reload(); await pg.waitForTimeout(500);
ok('3 після перезавантаження форматування на місці', (await html())==='<s>Один</s> <b>два</b> <i>три</i> <u>чотири</u>');
// зняти жирний
await pg.locator('.blk .txt').first().click(); await select(5,3); await pg.keyboard.press('Control+b'); await pg.waitForTimeout(450);
{ const st=await stored(); ok('4 повторний Ctrl+B знімає жирний: '+(st&&st.html), st && st.html==='<s>Один</s> два <i>три</i> <u>чотири</u>'); }
// панель при виділенні мишею
await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const t=pg.locator('.blk .txt').first(); const b=await t.locator('i').boundingBox(); await pg.mouse.dblclick(b.x+b.width/2, b.y+b.height/2); await pg.waitForTimeout(250);
  const vis=await pg.locator('#bubble').isVisible(); const pressed=await pg.locator('#bubble button[data-cmd="italic"]').getAttribute('aria-pressed'); const bb=await pg.locator('#bubble').boundingBox();
  ok('5a подвійний клік по слову: панель над виділенням, «I» підсвічена', vis && pressed==='true' && bb.y<b.y && (await pg.locator('#bubble button').count())===4);
  await pg.locator('#bubble button[data-cmd="underline"]').click(); await pg.waitForTimeout(450);
  const st=await stored(); ok('5b кнопка U додає підкреслення до «три», виділення й панель лишаються: '+(st&&st.html), st && /<i><u>три<\/u><\/i>|<u><i>три<\/i><\/u>/.test(st.html) && await pg.locator('#bubble').isVisible());
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); ok('5c після зняття виділення панель зникає', !(await pg.locator('#bubble').isVisible())); }
// список нотаток і пошук — по чистому тексту
ok('6 у списку нотаток текст без тегів', !/[<>]/.test(await pg.locator('#list .item').first().innerText()) && /Один два три/.test(await pg.locator('#list .item').first().innerText()));
await pg.locator('#spellBtn').click(); await pg.waitForTimeout(100); await pg.locator('#spellBtn').click(); await pg.waitForTimeout(100);
ok('7 перемикання правопису не губить форматування', /<s>Один<\/s>/.test(await html()));
// переноси рядків разом із форматуванням
await pg.mouse.click(500,500); await pg.keyboard.type('перший рядок'); await pg.keyboard.press('Enter'); await pg.keyboard.type('другий'); await select(0,6); await pg.keyboard.press('Control+b'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450);
{ const st=(await idbAll()).flatMap(n=>n.blocks).find(b=>/другий/.test(b.text||'')); ok('8 переноси рядків: html «'+(st&&st.html.replace(/\n/g,'⏎'))+'», текст «'+(st&&st.text.replace(/\n/g,'⏎'))+'»', st && st.html==='перший рядок\n<b>другий</b>' && st.text==='перший рядок\nдругий'); }
// чужий html зі сховища вичищається
await pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readwrite'); t.objectStore('notes').put({id:'dirty',title:'',blocks:[{id:'d1',fx:0.2,row:2,text:'x',html:'<script>alert(1)</script><b>ok</b><span style="color:red;font-style:italic">x</span><img src=x onerror="alert(2)"> <a href="#">link</a>'}],created:1,updated:Date.now()+90000}); t.oncomplete=()=>{ d.close(); res(); }; }; }));
await pg.evaluate(()=>localStorage.clear()); await pg.reload(); await pg.waitForTimeout(500);
{ const h=await pg.locator('.blk .txt').first().evaluate(e=>e.innerHTML); const st=(await idbAll()).find(n=>n.id==='dirty');
  ok('9 сторонній html вичищено до b/i/u/s: «'+h+'»', h==='<b>ok</b><i>x</i> link' && !/script|img|span|href/.test(h)); }
await pg.screenshot({path:OUT+'/appfmt-final.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
