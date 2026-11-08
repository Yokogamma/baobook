// The Node measuring stub of the layout engine (docs/LAYOUT-ENGINE-PLAN.md §4.3), so tests state their expectations in cells: a text of n
// characters on a line takes ceil(n / (cells × 3)) rows at a card width of `cells`, at least one row per line, and is ceil(longest line / 3)
// cells wide by nature; code is one row per line and never wraps unless its `wrap` is set; an area's header is one row unless a test says
// otherwise (`header`). `temp` adds temporary rows to the displayed answer (LAYOUT-RULES §2.1); `lines` counts the content's lines.

/** @param {Record<string, {kind?:string, text?:string, wrap?:boolean, temp?:number, header?:number}>} map
 *  @returns {import('../../public/layout/shapes.js').Measure} */
export function stubMeasure(map) {
  const get = (id) => { const m = map[id]; if (!m) throw new Error('measure: nothing for ' + id); return m; };
  const lines = (m) => String(m.text ?? '').split('\n');
  function rows(id, cells) {
    const m = get(id), w = Math.max(1, cells) * 3;
    let n;
    if (m.kind === 'area') n = m.header ?? 1;
    else if (m.kind === 'code' && !m.wrap) n = lines(m).length;
    else n = lines(m).reduce((s, l) => s + Math.max(1, Math.ceil(l.length / w)), 0);
    return { rows: n, shown: n + (m.temp || 0), lines: m.kind === 'area' ? n : lines(m).length };
  }
  const natural = (id) => Math.max(1, ...lines(get(id)).map((l) => Math.ceil(l.length / 3)));
  return { rows, natural };
}
