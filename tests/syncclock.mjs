// The monotonic device clock of docs/SYNC-PLAN.md §4.4: two edits in one millisecond never share a time, an edit after the clock was
// set back still gets a later time, and an import's time is a restored record, not a clock reading (checked with the engine in syncsim).
import { loadCore } from './lib/core.mjs';
const S=loadCore();
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
let last=0; const stamp=now=>{ last=S.nextUpdated(now,last); return last; };
const a=stamp(1000), b=stamp(1000), c=stamp(1000);
ok('1 three edits in one millisecond get 1000, 1001, 1002', a===1000 && b===1001 && c===1002);
const d=stamp(500);
ok('2 the clock set back by half a second: the next edit is still later ('+d+')', d===1003);
const e=stamp(5000);
ok('3 once the clock is ahead again, real time is used', e===5000);
ok('4 a fresh device (no clock record) starts from the current time', S.nextUpdated(777, undefined)===777 && S.nextUpdated(777, null)===777);
console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
