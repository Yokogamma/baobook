// The numbered edges of the «Клітинка» theme without a browser: public/gridpaper/model.js (docs/GRID-THEME-PLAN.md §5)
import { rulers, lineX, lineY, COL_STEP, ROW_STEP } from '../public/gridpaper/model.js';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

ok('1 the lines go through the sheet\'s dots: xOf(c) = G/2 + c·G, yOf(r) = G/2 + r·G', lineX(1,24)===36 && lineX(5,24)===132 && lineY(2,24)===60 && lineY(3,30)===105);
const R=rulers({cols:40, rows:30, g:24});
ok('2 the frame starts on column 1 and row 2', R.left===36 && R.top===60);
ok('3 columns are numbered every 5 cells from cell 0 at column 1, over the 39 cells of 40 dots', COL_STEP===5 && R.cols.map(c=>c.n).join()==='0,5,10,15,20,25,30,35' && R.cols[0].x===36 && R.cols[1].x===36+5*24);
ok('4 every row is numbered, the number in the middle of its cell', ROW_STEP===1 && R.rows.length===29 && R.rows[0].n===0 && R.rows[0].y===60+12 && R.rows[28].n===28 && R.rows[28].y===60+28*24+12);
const R2=rulers({cols:14, rows:10, g:30, rowStep:5});
ok('5 a larger text size moves every number with G; a row step of 5 numbers 0 and 5', R2.left===45 && R2.cols.map(c=>c.x).join()==='45,195,345' && R2.rows.map(r=>r.n+':'+r.y).join()==='0:90,5:240');
const E=rulers({cols:0, rows:1, g:24});
ok('6 an empty frame has no numbers', E.cols.length===0 && E.rows.length===0);
process.exit(fails?1:0);
