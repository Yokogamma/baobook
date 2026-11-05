// Every shape of the layout engine, described once (docs/LAYOUT-ENGINE-PLAN.md §2.1), and the one list of stored fields an engine action
// may write (§3.4). No code but that list: the other modules import the typedefs by JSDoc and PLACE_FIELDS by name, so the port to
// TypeScript is a move of this file into types.

/** The stored fields an engine action may write (LAYOUT-ENGINE-PLAN §3.4): `diff`, an action's patch, the bridge and the undo entry all use
 *  this one list. `open` is a code block's fold; sync counts it as content, not as a place (`sync.js`'s place group). */
export const PLACE_FIELDS = Object.freeze(['parent', 'row', 'fx', 'col', 'cw', 'ch', 'open', 'collapsed']);

/** The stored state of one container and its derived rows. The bridge builds the Boxes from index.html's blocks with `w` and `h`
 *  unset and no stacks; `open()` sizes them and builds the stacks (LAYOUT-RULES GAP.1).
 * @typedef {{id:string, kind:string, col:number, y:number, w?:number, h?:number, t?:number, yc?:number, cw?:number, ch?:number, open?:boolean, collapsed?:boolean,
 *            above?:Stretch[]}} Box
 *   // col: the handle cell; the card is col+1 … col+w−1, so w counts the handle cell and a set width cw is w − 1 (LAYOUT-RULES §1.1);
 *   // h: the rows the block takes in its layout's measure; t: the rows of h that are temporary (LAYOUT-RULES §2.1), 0 in a canonical
 *   // layout, so its canonical height is h − t; an area's t also holds the growth of its shown height that its children's temporary rows
 *   // make; t is set wherever h is (gap.js `resize`, from Measure's two answers); yc: its canonical row (equal to y in a canonical layout),
 *   // refreshed by every FOLLOW; RELINK reads them (LAYOUT-RULES GAP)
 *   // above: this block's stacks, by stretches of equal columns of its extent (in the columns where it stands in another block's stack, none)
 * @typedef {{c0:number, c1:number, stack:Stack}} Stretch   // the columns c0…c1, inclusive, where the block anchors with the same stack
 * @typedef {{u:?string, parts:(Run[]|Stand)[]}} Stack   // LAYOUT-RULES §1.3: u the anchor above (null: the top);
 *   // parts alternate seg, stand, seg, …, seg as the lab model has them: a seg the gap's rows between two neighbours of the chain, a
 *   // stand a block standing in the gap with its lend, the rows its body covers by its canonical height (LAYOUT-RULES §2.1); the room
 *   // above a block put lower than the gap reaches is rows it owns, in the seg above it; stacks are replaced, never mutated
 * @typedef {{id:string, lend:Run[]}} Stand
 * @typedef {{o:?string, n:number}} Run                      // n rows owned by block o, or unowned (o null); adjacent runs never share an owner
 * @typedef {{cols:number, measure:'canonical'|'displayed', boxes:Map<string,Box>, order:string[], areas:Map<string,Layout>}} Layout
 *   // its gaps are its boxes' `above`; column chains are an index built from them; order: the ids in reading order, built once per
 *   // layout, which every visitor walks (INV-5), never the Map; an area's `cols` is read from its Box's `cw`, not kept twice
 * @typedef {{col:number, y:number, frow:number, w:number}} Target   // a moved block's cell, its unrounded row and its width at the target
 *   // the state of LAYOUT-RULES §1.4 («move», «home», «outside») stays in drag.js: at «home» or «outside» no change is made (PR-1), so SETTLE never sees it
 */

/** The switches (R1, LAYOUT-RULES §1.6) and the settings: the engine's input besides the layout, the change and the memory.
 * @typedef {'SIZE.1'|'SIZE.2'|'SIZE.8'|'GAP.5.1'|'GAP.5.2'|'GAP.5.3'|'GAP.8'|'GAP.9'|'P-ASIDE'|'P-UP'|'P-REST'|'P-SINK'|'THROUGH'
 *          |'DRAG.A2'|'DRAG.A3.narrow'|'DRAG.A4'|'DRAG.A5'|'DRAG.B1'|'DRAG.B2.keep'|'DRAG.B3'|'DRAG.B5'|'DRAG.C4'|'RESIZE.1'|'RESIZE.2'|'RESIZE.3'
 *          |'AREA.3'|'AREA.6'|'AREA.7'|'AREA.7b'|'EDIT.3'|'EDIT.4'|'VIEW.1.fit'|'VIEW.1b'|'VIEW.2'|'VIEW.6'} RuleId
 *   // 35 ids, one per 0.1 row of LAYOUT-RULES §1.6 (GAP.2 is core, the owner, 2026-11-05); 0.2's (SIZE.7, P-SQUEEZE, AREA.4, AREA.8) join with their rules
 * @typedef {{id:RuleId, needs:RuleId[], fallback:string, relies:RuleId[]}} RuleDecl   // fallback: the name §1.6 gives what runs in its place, for the tests;
 *   // relies: the rules its fallback branch uses (P-ASIDE's: P-SINK for a handle), which tests/layoutrules.mjs checks no closure turns off with it;
 *   // the list's words are in uk.json and en.json (step 5)
 * @typedef {boolean} RuleValue                                   // a rule's value; 0.2's variants (O-20) widen this alias and nothing else
 * @typedef {Readonly<Record<RuleId, RuleValue>>} Rules           // every RuleId present, closed over the needs; made only by resolve(), read only through on() and variant()
 * @typedef {{TEXTW:number, MINC:number, ORDER:'push'|'never', STICK:number, NEAR:number, HOLD:number, STILL:number, MINSCALE:number, RESTPASSES:number}} Settings
 *   // LAYOUT-RULES §1.5; at their defaults in 0.1 (rules.js SETTINGS). FOLDPHONE is view.js's: it only feeds `temp` for `show` in the narrow
 *   // view (VIEW.2); PASTEFOLD and DESKW are 0.2's
 * @typedef {{rules:Rules, settings:Settings, kinds:Record<string,Kind>, measure:Measure}} Ctx   // one Measure, with the canonical and the displayed answer (§4.3)
 * @typedef {{ok:true, layout:Layout, start?:Layout, memory?:Memory, pressed?:?string, moves?:Map<string,Moved>, grew?:number, ran?:string[]}
 *           |{ok:false, why:'refused'|'failed', layout?:Layout}} Result   // what settle, settleTree and open() return; the TS port narrows on `ok`
 */

/** What a step moved, for GAP.5 rule 1: phase 1c, phase 3's pin and swap, and every primitive return the edges they moved, and SETTLE
 *  accumulates them per block id for the RELINK they are handed to. A block that follows a step with its gaps is moved by that step. A row
 *  FOLLOW changed after a height and a bottom that the block's own height changed are never in it.
 * @typedef {{step:number, by:'change'|'swap'|'aside'|'up'|'down'|'sink'|'sep'|'rest', rows:number}} Step   // step: a counter; rows: down positive
 *   // a step is rigid: every block it moved moved by the same rows; a primitive that moves blocks by different rows (P-UP closing a gap
 *   // between two of them) returns one step per common part, in order (B up 3, then A and B up 2), so one call can take several steps
 * @typedef {Step[]} Moved   // every step that moved the block, in order (a rigid step moves it whole; a height is never a move); for each step,
 *   // rule 1 groups the blocks it moved that are next to one another in a column's chain into runs and changes only the gap above each run and the gap under it
 * @typedef {{id:string, canonical?:boolean}} Carried   // RELINK's carried block (GAP.5 rule 2 and 3): it leaves as carried away and comes in at its
 *   // displayed target; canonical: an undo putting it back at an old cell, placed by its canonical row in every column (LAYOUT-ENGINE-PLAN §6.4)
 */

/** One per row of LAYOUT-RULES §5.2 «Change kinds», as data in changes.js, keyed by Change.type; settle.js reads it.
 * @typedef {{moved:'none'|'target'|'self', judge:'carry'|'wall'|'none', noRoom:'side'|'sink'|'none',
 *            contain:{width:'clamp'|'none', bottom:'grow'|'refuse'|'none'}}} ChangeKind
 *  (the fields as LAYOUT-ENGINE-PLAN §2.1 describes them; the phases a change runs are derived from them in settle.js)
 */

/** One typedef per kind; `box` is the container the change is in (null, the sheet).
 * @typedef {{type:'carry', box:?string, id:string, at:Target, away:boolean, through?:'hold'|'shift', canonical?:boolean}} CarryChange
 * @typedef {{type:'create', box:?string, id:string, kind:string, at:Target, away:true, set?:{cw?:number, ch?:number}, canonical?:boolean}} CreateChange
 * @typedef {{type:'width', box:?string, id:string, cw:number, side?:'left'|'right', col?:number, rows?:number}} WidthChange
 * @typedef {{type:'wall', box:string, side:'left'|'right', cols:number, shift?:number}} WallChange
 * @typedef {{type:'areaSide', box:?string, id:string, side:'left'|'right', col:number, cols:number}} AreaSideChange
 * @typedef {{type:'size', box:?string, id:string, set?:{cw?:null, ch?:?number, open?:boolean, collapsed?:boolean}}} SizeChange
 * @typedef {{type:'remove', box:?string, id:string}} RemoveChange
 * @typedef {{type:'enter', box:?string, id:string, to:string, at:Target}} EnterChange
 * @typedef {{type:'leave', box:string, id:string, to:?string, at:Target}} LeaveChange
 * @typedef {{type:'ungroup', box:?string, id:string}} UngroupChange
 * @typedef {{type:'drawArea', box:?string, id:string, at:{col:number, y:number, cols:number, rows:number}}} DrawAreaChange
 * @typedef {CarryChange|CreateChange|WidthChange|WallChange|SizeChange|RemoveChange|EnterChange|LeaveChange|UngroupChange|AreaSideChange|DrawAreaChange} Change
 *  (each kind as LAYOUT-ENGINE-PLAN §2.1 describes it; enter, leave, ungroup, drawArea and areaSide are composite, taken apart by settleTree)
 */

/** The bridge, the one module that knows index.html's block objects (LAYOUT-ENGINE-PLAN §2.1, step 5).
 * @typedef {{
 *   element(id:string):Element,
 *   content(id:string):{kind:string, html:string, options:object, chips:string[]},
 *   stored(id:string):Object<string, unknown>,
 *   write(box:?string, patch:Map<string,object>):void,
 *   pushUndo(entry:object):void,
 *   tap(id:string, how:'open'|'caret'|'menu'):void,
 *   settings():Settings, rules():Rules, readOnly():boolean}} Bridge
 */

/** What a block cannot pass, for P-ASIDE, `sink` and P-UP: a wall, a container's edge, a block that cannot move.
 * @typedef {{cols:[number,number], rows:[number,number], pushes:'left'|'right'|'none'}} Obstacle
 */

/** The carry memory (LAYOUT-RULES §6.D): only what SETTLE reads.
 * @typedef {{away:boolean, sides:Map<string,'left'|'right'>, through:?{id:string, row:number, side:'below'|'above'}, areaBottoms:Map<string,number>, lastTarget:?Target, dir:'up'|'down'}} Memory
 */

/** Measuring (LAYOUT-ENGINE-PLAN §4.3): by block id, `rows` the canonical rows of its content at a card width of `cells`, `shown` the displayed
 *  ones with its temporary heights (rows ≤ shown), `lines` the lines of its content, wrapped or not, by which a code block folds as today;
 *  `natural` its natural card width in cells. The browser's measure reads the content through the bridge, the Node stub
 *  (tests/lib/measure.mjs) from a map.
 * @typedef {{rows(id:string, cells:number):{rows:number, shown:number, lines:number}, natural(id:string):number}} Measure
 */

/** A passport (LAYOUT-ENGINE-PLAN §4.4), one per kind in kinds.js, reached only as ctx.kinds.
 * @typedef {{width:'text'|'set', minCells(box:Box, measure:Measure):number, rows(box:Box, cells:number, measure:Measure):{rows:number, shown:number},
 *            hides:boolean, container:null|{headerRows(box:Box, measure:Measure):number, height(box:Box, inner:number, measure:Measure):number}}} Kind
 *  width: 'text', elastic by SIZE.1–SIZE.4 unless `cw`; 'set', `cw` always. minCells: the kind's own floor in card cells. rows: a leaf's
 *  shown height at a card width, canonical and displayed; a container's `height` its frame's rows from the rows its children take (inner).
 */
