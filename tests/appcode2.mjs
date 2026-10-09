import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const paste=(text)=>pg.evaluate((text)=>{ const dt=new DataTransfer(); dt.setData('text/plain',text); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); },text);
const PHP=`class CompleteLoginController extends Controller
{
    public function __invoke(string $token): RedirectResponse
    {
        $userId = Cache::pull("oauth_login:{$token}");
        if (! $userId) {
            return redirect()->route('login')->withErrors([
                'email' => __('Посилання недійсне або вже використано.'),
            ]);
        }
        Auth::login(User::findOrFail($userId));
        return redirect()->intended('/');
    }
}`;
const BLADE=`@extends('layouts.app')
@section('content')
  <h1>{{ $title }}</h1>
  @foreach ($items as $item)
    <li>{{ $item->name }}</li>
  @endforeach
@endsection`;
const TS=`interface Note { id: string; title: string }
export function titleOf(n: Note): string {
  return n.title || 'Без назви';
}`;
const GO=`package main
import "fmt"
func main() {
    x := 42
    fmt.Println(x)
}`;
const YAML=`name: sheet
on:
  push:
    branches:
      - main
jobs:
  - build
  - deploy`;
const guess=async(t)=>pg.evaluate(t=>{ const dt=new DataTransfer(); dt.setData('text/plain',t); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); const b=[...document.querySelectorAll('.blk.is-code')].pop(); return b? b.querySelector('.lang').textContent : '(text)'; },t);
await pg.goto(SITE); await pg.waitForTimeout(300); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
// 1 автовизначення: кожен зразок у новій нотатці, щоб не заважали одне одному
const langs={}; for(const [name,src] of [['PHP',PHP],['Blade',BLADE],['TypeScript',TS],['Go',GO],['YAML',YAML]]){ await pg.locator('#newBtn').click(); await pg.waitForTimeout(100); await pg.mouse.click(400,300); await pg.waitForTimeout(50); langs[name]=await guess(src); await pg.waitForTimeout(100); }
ok('1 автовизначення мов: '+JSON.stringify(langs), Object.entries(langs).every(([k,v])=>v===k));
// 2 меню мови на PHP-нотатці
await pg.locator('.item').filter({hasText:'class CompleteLoginController'}).first().click(); await pg.waitForTimeout(200);
const cb=pg.locator('.blk.is-code').first();
ok('2a підпис «PHP» позначений як авто', await cb.locator('.lang').evaluate(e=>e.classList.contains('auto')));
await cb.locator('.lang').click(); await pg.waitForTimeout(150);
ok('2b меню відкрилось, поле пошуку у фокусі, перший рядок — Авто', (await cb.locator('.lmenu').count())===1 && await pg.evaluate(()=>document.activeElement.matches('.lmenu input')) && /Авто · визначено: PHP/.test(await cb.locator('.opt').first().textContent()));
await pg.keyboard.type('bla'); await pg.waitForTimeout(80);
ok('2c пошук «bla» лишає Blade', (await cb.locator('.opt[data-k]').count())===1 && (await cb.locator('.opt').first().textContent())==='Blade');
await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
ok('2d Enter обирає Blade, підпис без «авто», меню закрите', (await cb.locator('.lang').textContent())==='Blade' && !(await cb.locator('.lang').evaluate(e=>e.classList.contains('auto'))) && (await cb.locator('.lmenu').count())===0);
await pg.waitForTimeout(400); await pg.reload(); await pg.waitForTimeout(400);
const cb2=pg.locator('.blk.is-code').first();
ok('2e вибір мови пережив перезавантаження', (await cb2.locator('.lang').textContent())==='Blade');
await cb2.locator('.lang').click(); await pg.waitForTimeout(100); await pg.keyboard.type('авто'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
ok('2f повернення до «Авто» → знову PHP · авто', (await cb2.locator('.lang').textContent())==='PHP' && await cb2.locator('.lang').evaluate(e=>e.classList.contains('auto')));
await cb2.locator('.lang').click(); await pg.waitForTimeout(100); await pg.keyboard.press('Escape'); await pg.waitForTimeout(50); const closedEsc=(await cb2.locator('.lmenu').count())===0;
await cb2.locator('.lang').click(); await pg.waitForTimeout(100); await pg.mouse.click(1100,800); await pg.waitForTimeout(80); const closedOut=(await cb2.locator('.lmenu').count())===0;
ok('2g Esc і клік поза меню закривають його', closedEsc && closedOut);
// 3 підсвітка PHP: змінні
ok('3 PHP: змінні $userId підсвічені окремо, ключові слова теж', (await cb2.locator('.code .v').count())>=4 && (await cb2.locator('.code .k').count())>=5);
// 4 розмір: тягнемо ручку ліворуч і вгору
const card0=await cb2.locator('.cblk').boundingBox(); const rz=await cb2.locator('.rz').boundingBox();
await pg.mouse.move(rz.x+rz.width/2, rz.y+rz.height/2); await pg.mouse.down(); await pg.mouse.move(rz.x+rz.width/2-320, rz.y+rz.height/2-150,{steps:10}); await pg.mouse.up(); await pg.waitForTimeout(150);
const st=await cb2.evaluate(e=>{ const c=e.querySelector('.cblk'), p=e.querySelector('.code'); return {w:c.getBoundingClientRect().width, h:c.getBoundingClientRect().height, preH:p.style.height, cut:c.classList.contains('cut'), vscroll:p.scrollHeight>p.clientHeight+1, sized:c.classList.contains('sized'), more:e.querySelector('.more').textContent}; });
ok('4a блок став вужчим і згорнувся без внутрішньої прокрутки: '+JSON.stringify(st), st.w<card0.width-200 && st.h<card0.height-100 && st.preH!=='' && st.cut && st.sized && /Розгорнути · ще \d+/.test(st.more));
ok('4b ширина картки кратна клітинці сітки', Math.abs(st.w-Math.round(st.w/24)*24)<=1.5);
await pg.waitForTimeout(400); const savedB=(await idbAll()).flatMap(n=>n.blocks).find(b=>b.kind==='code'&&/CompleteLogin/.test(b.text)); const saved=savedB? {cw:savedB.cw,ch:savedB.ch,lang:savedB.lang} : null;
await pg.waitForTimeout(400);
ok('4c розміри збережено: '+JSON.stringify(saved), saved && saved.cw>0 && saved.ch>0 && saved.lang===undefined);
// 5 сусід праворуч від звуженого блока
const cbBox=await cb2.locator('.cblk').boundingBox(); await pg.mouse.click(cbBox.x+cbBox.width+80, cbBox.y+40); await pg.keyboard.type('Праворуч від коду'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
const right=await pg.evaluate(()=>{ const t=[...document.querySelectorAll('.blk:not(.is-code)')].find(b=>/Праворуч/.test(b.textContent)); const c=document.querySelector('.blk.is-code'); return t? {tl:t.offsetLeft, tt:t.offsetTop, cl:c.offsetLeft+c.offsetWidth, ct:c.offsetTop} : null; });
ok('5 праворуч від звуженого блока можна писати в тих самих рядах: '+JSON.stringify(right), right && right.tl>=right.cl && right.tt>=right.ct && right.tt<right.ct+240);
await pg.mouse.move(cbBox.x+40, cbBox.y+40); await pg.waitForTimeout(150); await pg.screenshot({path:OUT+'/app-resize.png'});
await pg.reload(); await pg.waitForTimeout(400);
const st2=await pg.locator('.blk.is-code').first().evaluate(e=>{ const c=e.querySelector('.cblk'); return {w:c.getBoundingClientRect().width, preH:e.querySelector('.code').style.height, cut:c.classList.contains('cut')}; });
ok('6 після перезавантаження ширина і згорнута висота ті самі', Math.abs(st2.w-st.w)<=1 && st2.preH===st.preH && st2.cut);
await pg.locator('.blk.is-code').first().locator('.more').click(); await pg.waitForTimeout(400); await pg.reload(); await pg.waitForTimeout(400);
ok('6b «Розгорнути» запамʼятовується після перезавантаження', !(await pg.locator('.blk.is-code').first().evaluate(e=>e.querySelector('.cblk').classList.contains('cut'))) && (await pg.locator('.blk.is-code').first().locator('.more').textContent())==='Згорнути');
await pg.locator('.blk.is-code').first().locator('.more').click(); await pg.waitForTimeout(100);
// 7 подвійний клік по ручці → авто
const cb3=pg.locator('.blk.is-code').first(); const rz2=await cb3.locator('.rz').boundingBox(); await pg.mouse.dblclick(rz2.x+rz2.width/2, rz2.y+rz2.height/2); await pg.waitForTimeout(150);
const st3=await cb3.evaluate(e=>({w:e.querySelector('.cblk').getBoundingClientRect().width, preH:e.querySelector('.code').style.height, sized:e.querySelector('.cblk').classList.contains('sized')}));
ok('7 подвійний клік по ручці повертає авто (ширина авто, згортання типове)', st3.w>=st.w && st3.preH==='' && !st3.sized);
// 8 висота, більша за вміст → авто (без обмеження)
{ const rz3=await cb3.locator('.rz').boundingBox(); await pg.mouse.move(rz3.x+rz3.width/2, rz3.y+rz3.height/2); await pg.mouse.down(); await pg.mouse.move(rz3.x+rz3.width/2-100, rz3.y+rz3.height/2+200,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(150);
  const st4=await cb3.evaluate(e=>({preH:e.querySelector('.code').style.height, cut:e.querySelector('.cblk').classList.contains('cut'), sized:e.querySelector('.cblk').classList.contains('sized'), more:e.querySelector('.more').textContent})); ok('8 потягнули нижче за вміст → показано все, ширина задана', st4.preH==='' && !st4.cut && st4.sized); }
// меню-скриншот
await cb3.locator('.lang').click(); await pg.waitForTimeout(150); await pg.screenshot({path:OUT+'/app-langmenu.png',clip:{x:300,y:180,width:700,height:420}}); await pg.keyboard.press('Escape');
console.log(errs.length? errs.join('\n') : '✓ без помилок'); await br.close(); process.exit(fails||errs.length?1:0);
