// The numbered edges of the «Клітинка» theme (docs/GRID-THEME-PLAN.md §5): where each number stands. Pure: no DOM, no globals.
// The theme draws its cell lines through the sheet's dots: line c across at x = G/2 + c·G (c ≥ 1, the first column a block can stand on),
// line r down at y = G/2 + r·G (r ≥ 2, the first sheet row), so a block's text starts on a line crossing. The numbers name cells, as in the
// owner's reference: cell 0 is column 1 and row 2; columns are numbered every COL_STEP cells, rows every ROW_STEP.

/** @typedef {{n:number, x:number}} ColNumber  x: the left line of the column's cell, px from the sheet's left edge */
/** @typedef {{n:number, y:number}} RowNumber  y: the middle of the row's cell, px from the sheet's top edge */
/** @typedef {{cols:ColNumber[], rows:RowNumber[], left:number, top:number}} Rulers  left, top: the frame's first lines */

export const COL_STEP=5, ROW_STEP=1;
export const lineX=(c,g)=>g/2+c*g;
export const lineY=(r,g)=>g/2+r*g;

/**
 * @param {{cols:number, rows:number, g:number, colStep?:number, rowStep?:number}} f  cols and rows: the dots across and down that the sheet's
 *   field() counts (its frame), so the frame has cols − 1 cells across and rows − 1 down; g: the cell, px
 * @returns {Rulers}
 */
export function rulers({cols, rows, g, colStep=COL_STEP, rowStep=ROW_STEP}){
  const nc=Math.max(0, cols-1), nr=Math.max(0, rows-1), c=[], r=[];
  for(let n=0; n<nc; n+=colStep) c.push({n, x:lineX(1+n, g)});
  for(let n=0; n<nr; n+=rowStep) r.push({n, y:lineY(2+n, g)+g/2});
  return {cols:c, rows:r, left:lineX(1, g), top:lineY(2, g)};
}
