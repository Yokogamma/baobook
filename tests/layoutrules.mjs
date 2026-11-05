// Node: the switchable rules of the layout engine (public/layout/rules.js) against the table they come from, docs/LAYOUT-RULES.md §1.6,
// and the typedef that lists them (public/layout/shapes.js, LAYOUT-ENGINE-PLAN §2.1): every 0.1 switch declared with the needs the table
// gives, and nothing else; every rule on by default; resolve closing a choice over the needs, transitively, and turning nothing else off;
// no fallback relying on a rule that its own closure turns off; unknown ids refused.
import { readFileSync } from 'node:fs';
import { DECLS, DEFAULT, SETTINGS, resolve, on, variant, dependents } from '../public/layout/rules.js';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const doc = readFileSync(new URL('../docs/LAYOUT-RULES.md', import.meta.url), 'utf8');

/* ── 1. the table of §1.6 ── */
const sec = doc.slice(doc.indexOf('### 1.6 Switchable rules'), doc.indexOf('Settings whose value turns their rule off'));
const rows = sec.split('\n').filter((l) => /^\| `[^`]+`/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
const table = rows.map((c) => ({ id: c[1].match(/^`([^`]+)`/)[1], needs: c[3] === '—' ? [] : [...c[3].matchAll(/`([^`]+)`/g)].map((m) => m[1]) }));
ok(`1 the table of §1.6 has the 35 switches of 0.1 (${table.length})`, table.length === 35);
const sorted = (a) => [...a].sort().join();
ok('1a rules.js declares exactly them', sorted(DECLS.map((d) => d.id)) === sorted(table.map((t) => t.id)));
const needsDiff = table.filter((t) => { const d = DECLS.find((x) => x.id === t.id); return !d || [...d.needs].sort().join() !== [...t.needs].sort().join(); });
ok('1b each with the needs the table gives' + (needsDiff.length ? ': ' + needsDiff.map((t) => t.id).join(', ') : ''), needsDiff.length === 0);
ok('1c every declaration names its fallback', DECLS.every((d) => typeof d.fallback === 'string' && d.fallback.length > 8));
const typedef = (src) => { const m = src.match(/@typedef \{('SIZE\.1'[\s\S]*?)\} RuleId/); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []; };
const shapes = typedef(readFileSync(new URL('../public/layout/shapes.js', import.meta.url), 'utf8'));
const plan = typedef(readFileSync(new URL('../docs/LAYOUT-ENGINE-PLAN.md', import.meta.url), 'utf8'));
ok('1d the RuleId typedef of shapes.js and of the plan list the same ids', sorted(shapes) === sorted(DECLS.map((d) => d.id)) && plan.join() === shapes.join());

/* ── 2. on by default, and resolve ── */
ok('2 DEFAULT: every rule on, frozen', DECLS.every((d) => DEFAULT[d.id] === true) && Object.isFrozen(DEFAULT) && Object.keys(DEFAULT).length === DECLS.length);
const closure = (id) => {   // what turning `id` off must turn off, from the table alone
  const off = new Set([id]);
  for (let grew = true; grew;) { grew = false; for (const t of table) if (!off.has(t.id) && t.needs.some((n) => off.has(n))) { off.add(t.id); grew = true; } }
  return off;
};
const wrong = DECLS.filter((d) => { const r = resolve({ [d.id]: false }), want = closure(d.id); return DECLS.some((x) => r[x.id] !== !want.has(x.id)); });
ok('2a resolve turns off exactly the rules that need the one turned off, transitively' + (wrong.length ? ': ' + wrong.map((d) => d.id).join(', ') : ''), wrong.length === 0);
const p = resolve({ 'SIZE.1': false });
ok('2b SIZE.1 off takes SIZE.2, SIZE.8, P-REST (through SIZE.2), DRAG.A3.narrow, DRAG.A5 and RESIZE.2 with it (' + dependents('SIZE.1').join(',') + ')',
  ['SIZE.2', 'SIZE.8', 'P-REST', 'DRAG.A3.narrow', 'DRAG.A5', 'RESIZE.2'].every((id) => !p[id]) && p['P-ASIDE'] && p['GAP.5.1']);
const q = resolve({ 'GAP.5.1': false, 'GAP.5.2': false });
ok('2c GAP.5.1 off takes GAP.8, GAP.5.2 off takes GAP.9, as the model\'s switches do', !q['GAP.8'] && !q['GAP.9'] && q['GAP.5.3']);
const t = resolve({ 'GAP.8': true, 'GAP.5.1': false });
ok('2d a rule asked on whose needs are off is off', t['GAP.8'] === false);
let threw = false; try { resolve({ 'GAP.2': false }); } catch { threw = true; }
let threw2 = false; try { on(DEFAULT, 'SIZE.9'); } catch { threw2 = true; }
ok('2e a core rule or a typo is no switch: refused, never read as on', threw && threw2);
ok('2f on() and variant() read a rule\'s value', on(p, 'SIZE.1') === false && on(p, 'GAP.5.1') === true && variant(p, 'SIZE.1') === false);

/* ── 3. what each fallback relies on ── */
const broken = DECLS.flatMap((d) => d.relies.filter((r) => !resolve({ [d.id]: false })[r]).map((r) => d.id + '→' + r));
ok('3 no fallback relies on a rule its own closure turns off' + (broken.length ? ': ' + broken.join(', ') : ''), broken.length === 0);
ok('3a P-ASIDE\'s fallback relies on P-SINK (a handle\'s «no room aside»)', DECLS.find((d) => d.id === 'P-ASIDE').relies.includes('P-SINK'));
ok('3b every relied-on id is a switch', DECLS.every((d) => d.relies.every((r) => DECLS.some((x) => x.id === r))));

/* ── 4. the settings of §1.5 at their 0.1 defaults ── */
ok('4 TEXTW 26, MINC 6, ORDER push, STICK ¾, NEAR ½, RESTPASSES 2, frozen', SETTINGS.TEXTW === 26 && SETTINGS.MINC === 6 && SETTINGS.ORDER === 'push' && SETTINGS.STICK === 0.75 && SETTINGS.NEAR === 0.5 && SETTINGS.RESTPASSES === 2 && Object.isFrozen(SETTINGS));
process.exit(fails ? 1 : 0);
