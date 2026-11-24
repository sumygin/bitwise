/*************************************************************************
 * BITWISE — DATABASE DIAGRAM MODE
 * ER / EER diagrams in the notation of P.J. McBrien's "Introduction to
 * Databases" course (entities, relationships, attributes as hollow
 * circles with underlined keys, look-here cardinalities, subsets,
 * generalisation hierarchies, weak entities, nested relationships)
 * plus relational schemas (slide-style tables, key/fk text notation)
 * and an automatic ER -> relational schema mapping.
 *
 * A database diagram is stored as a workspace tab with kind: 'db'
 * and { items: [], links: [] } next to the circuit tabs.
 *************************************************************************/
const DB = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const COLORS = {
    ink: '#000000',
    tableTitle: '#6fc0d4',
    tableHead: '#a8cfe9',
    stripe: '#d4d4d4',
    fkKey: '#7a2a10',
    select: '#2563eb'
  };
  const STROKE = 2.4;

  let diagram = null;             // active db tab
  let view = { x: 0, y: 0, scale: 1 };
  const viewByDiagram = new Map();
  let selItems = new Set();
  let selLinks = new Set();
  let undoStack = [];
  let redoStack = [];
  let inspectorUndoPushed = false;
  let clipboard = null;

  const ix = {
    mode: null, // DRAG, CONNECT, MARQUEE, PAN
    startX: 0, startY: 0, startViewX: 0, startViewY: 0,
    startPositions: new Map(),
    moved: false,
    connectFrom: null,
    spacePressed: false,
    quickAddPos: { x: 0, y: 0 }
  };

  // DOM
  let svg, vp, linksLayer, itemsLayer, tempLine, marquee, inspector, quickMenu, toolbarEl;

  /***********************************************************************
   * TEXT MEASUREMENT & RICH TEXT
   ***********************************************************************/
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(str, size, style = '') {
    measureCtx.font = `${style} ${size}px ${FONT}`.trim();
    return measureCtx.measureText(str).width;
  }

  /**
   * Parses one line of schema text into segments.
   *   *name*  -> underlined (key)
   *   #name#  -> underlined in brown (key that is also a foreign key)
   *   fk=>    -> fk over a double arrow
   *   =>      -> double arrow
   */
  function parseRich(line) {
    const segs = [];
    let i = 0;
    let buf = '';
    const flush = () => { if (buf) { segs.push({ t: 'n', s: buf }); buf = ''; } };
    while (i < line.length) {
      const ch = line[i];
      if (line.startsWith('fk=>', i) || line.startsWith('fk⇒', i)) {
        flush();
        segs.push({ t: 'fk' });
        i += line.startsWith('fk=>', i) ? 4 : 3;
        continue;
      }
      if (line.startsWith('=>', i)) {
        flush();
        segs.push({ t: 'n', s: '⇒' });
        i += 2;
        continue;
      }
      if (ch === '*' || ch === '#') {
        const end = line.indexOf(ch, i + 1);
        if (end > i + 1) {
          flush();
          segs.push({ t: ch === '*' ? 'u' : 'uf', s: line.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }
      buf += ch;
      i++;
    }
    flush();
    return segs;
  }

  function richWidth(segs, size) {
    let w = 0;
    for (const s of segs) {
      if (s.t === 'fk') w += textWidth('⇒', size) + size * 0.5;
      else w += textWidth(s.s, size);
    }
    return w;
  }

  /** Renders rich segments into an SVG group starting at (x, baseline y). */
  function drawRich(parent, segs, x, y, size, anchor = 'start', color = COLORS.ink) {
    const total = richWidth(segs, size);
    let cx = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
    for (const s of segs) {
      if (s.t === 'fk') {
        const pad = size * 0.25;
        const arrowW = textWidth('⇒', size);
        parent.appendChild(mkText('⇒', cx + pad, y, size, 'start', color));
        const fk = mkText('fk', cx + pad + arrowW / 2, y - size * 0.72, size * 0.62, 'middle', color);
        fk.setAttribute('font-style', 'italic');
        parent.appendChild(fk);
        cx += arrowW + size * 0.5;
        continue;
      }
      const w = textWidth(s.s, size);
      const col = s.t === 'uf' ? COLORS.fkKey : color;
      parent.appendChild(mkText(s.s, cx, y, size, 'start', col));
      if (s.t === 'u' || s.t === 'uf') {
        parent.appendChild(mkLine(cx, y + size * 0.18, cx + w, y + size * 0.18, col, Math.max(1, size / 14)));
      }
      cx += w;
    }
    return total;
  }

  function mkText(str, x, y, size, anchor = 'start', fill = COLORS.ink) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('font-size', size);
    t.setAttribute('font-family', FONT);
    t.setAttribute('text-anchor', anchor);
    t.setAttribute('fill', fill);
    t.setAttribute('style', 'white-space: pre');
    t.textContent = str;
    return t;
  }

  function mkLine(x1, y1, x2, y2, stroke = COLORS.ink, w = STROKE) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', stroke);
    l.setAttribute('stroke-width', w);
    return l;
  }

  function mk(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  /***********************************************************************
   * ITEM GEOMETRY
   ***********************************************************************/
  const ENTITY_FONT = 20;
  const REL_FONT = 19;
  const ATTR_FONT = 18;

  function wrapLabel(label) {
    if (label.includes('\n')) return label.split('\n');
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [label];
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > 9) { lines.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function attrDisplay(item) {
    let s = item.label || '';
    if (item.optional) s += '?';
    if (item.card) s += `[${item.card}]`;
    return s;
  }

  function parseColumns(str) {
    return (str || '').split(',').map(c => c.trim()).filter(Boolean).map(raw => {
      let name = raw;
      let key = false, fkKey = false;
      if (/^\*.+\*$/.test(name)) { key = true; name = name.slice(1, -1); }
      else if (/^#.+#$/.test(name)) { key = true; fkKey = true; name = name.slice(1, -1); }
      return { name, key, fkKey };
    });
  }

  /** Splits a comma separated row, keeping commas inside '...' or "..." quotes. */
  function splitRow(row) {
    const cells = [];
    let cur = '', quote = null;
    for (const ch of row) {
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '’' || ch === '‘') {
        quote = ch === '‘' ? '’' : ch;
        cur += ch;
      } else if (ch === ',') {
        cells.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  function tableLayout(item) {
    const size = item.fontSize || 15;
    const cols = parseColumns(item.columns);
    const rows = (item.rows || '').split('\n').filter(r => r.trim().length).map(splitRow);
    const pad = 8;
    const widths = cols.map((c, ci) => {
      let w = textWidth(c.name, size);
      for (const r of rows) w = Math.max(w, textWidth(r[ci] ?? '', size));
      return Math.ceil(w + pad * 2);
    });
    if (!widths.length) widths.push(80);
    let total = widths.reduce((a, b) => a + b, 0);
    const titleW = textWidth(item.label || '', size) + pad * 2;
    if (titleW > total) {
      const extra = (titleW - total) / widths.length;
      for (let i = 0; i < widths.length; i++) widths[i] += extra;
      total = titleW;
    }
    const rowH = Math.round(size * 1.45);
    const h = rowH * (2 + rows.length);
    return { size, cols, rows, widths, w: total, h, rowH, pad };
  }

  function textLayout(item) {
    const size = item.fontSize || 18;
    const lines = (item.text || '').split('\n');
    const lineH = Math.round(size * 1.5);
    let w = 0;
    const parsed = lines.map(l => {
      const segs = parseRich(l);
      w = Math.max(w, richWidth(segs, size));
      return segs;
    });
    return { size, parsed, lineH, w: Math.max(20, w), h: Math.max(lineH, lineH * lines.length) };
  }

  /** Shape used for link clipping, centred on item.x/item.y. */
  function shapeOf(item) {
    switch (item.type) {
      case 'entity': {
        const w = Math.max(120, textWidth(item.label || '', ENTITY_FONT) + 44);
        return { kind: 'rect', w, h: 60 };
      }
      case 'relationship': {
        const lines = wrapLabel(item.label || '');
        const maxW = Math.max(...lines.map(l => textWidth(l, REL_FONT)), 20);
        const w = Math.max(110, maxW * 1.55 + 36);
        const h = Math.max(70, lines.length * 22 + 44);
        return { kind: 'diamond', w, h, lines };
      }
      case 'attribute':
        return { kind: 'circle', r: 7, w: 14, h: 14 };
      case 'gen':
        return { kind: 'point', w: 6, h: 6 };
      case 'table': {
        const L = tableLayout(item);
        return { kind: 'rect', w: L.w, h: L.h, layout: L };
      }
      case 'text': {
        const L = textLayout(item);
        return { kind: 'rect', w: L.w + 8, h: L.h, layout: L, topLeft: true };
      }
      default:
        return { kind: 'rect', w: 40, h: 40 };
    }
  }

  /** Item centre (text items are anchored top-left, so offset them). */
  function centreOf(item) {
    const s = shapeOf(item);
    if (s.topLeft) return { x: item.x + s.w / 2, y: item.y + s.h / 2, s };
    return { x: item.x, y: item.y, s };
  }

  /** Bounding box including external labels (for selection / export). */
  function boundsOf(item) {
    const { x, y, s } = centreOf(item);
    let b = { minX: x - s.w / 2, minY: y - s.h / 2, maxX: x + s.w / 2, maxY: y + s.h / 2 };
    if (item.type === 'attribute') {
      const lb = attrLabelBox(item);
      b = { minX: Math.min(b.minX, lb.x), minY: Math.min(b.minY, lb.y), maxX: Math.max(b.maxX, lb.x + lb.w), maxY: Math.max(b.maxY, lb.y + lb.h) };
    }
    if (item.type === 'gen' && item.label) {
      const w = textWidth(item.label, 15);
      b = { minX: Math.min(b.minX, x + 10), minY: Math.min(b.minY, y - 12), maxX: Math.max(b.maxX, x + 14 + w), maxY: Math.max(b.maxY, y + 8) };
    }
    return b;
  }

  function attrLabelBox(item) {
    const text = attrDisplay(item);
    const w = textWidth(text, ATTR_FONT);
    const h = ATTR_FONT;
    const side = item.labelSide || 'right';
    const gap = 13;
    switch (side) {
      case 'left': return { x: item.x - gap - w, y: item.y - h / 2 - 2, w, h, anchor: 'end', tx: item.x - gap, ty: item.y + h * 0.35 };
      case 'top': return { x: item.x - w / 2, y: item.y - gap - h, w, h, anchor: 'middle', tx: item.x, ty: item.y - gap - 2 };
      case 'bottom': return { x: item.x - w / 2, y: item.y + gap, w, h, anchor: 'middle', tx: item.x, ty: item.y + gap + h * 0.8 };
      default: return { x: item.x + gap, y: item.y - h / 2 - 2, w, h, anchor: 'start', tx: item.x + gap, ty: item.y + h * 0.35 };
    }
  }

  /** Point on the boundary of an item's shape in direction of (tx, ty). */
  function clipToShape(item, tx, ty) {
    const { x, y, s } = centreOf(item);
    const dx = tx - x, dy = ty - y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return { x, y };
    const ux = dx / len, uy = dy / len;
    let t;
    switch (s.kind) {
      case 'rect': {
        const tx1 = Math.abs(ux) > 1e-9 ? (s.w / 2) / Math.abs(ux) : Infinity;
        const ty1 = Math.abs(uy) > 1e-9 ? (s.h / 2) / Math.abs(uy) : Infinity;
        t = Math.min(tx1, ty1);
        break;
      }
      case 'diamond':
        t = 1 / (Math.abs(ux) / (s.w / 2) + Math.abs(uy) / (s.h / 2));
        break;
      case 'circle':
        t = s.r;
        break;
      default:
        t = 0;
    }
    return { x: x + ux * t, y: y + uy * t };
  }

  /***********************************************************************
   * LINK GEOMETRY
   ***********************************************************************/
  function linkPoints(link, itemMap) {
    const a = itemMap.get(link.from), b = itemMap.get(link.to);
    if (!a || !b) return null;
    const ca = centreOf(a), cb = centreOf(b);
    const route = link.route || 'straight';
    if (route === 'straight') {
      return [clipToShape(a, cb.x, cb.y), clipToShape(b, ca.x, ca.y)];
    }
    const corner = route === 'hv' ? { x: cb.x, y: ca.y } : { x: ca.x, y: cb.y };
    const p1 = clipToShape(a, corner.x, corner.y);
    const p2 = clipToShape(b, corner.x, corner.y);
    if (Math.hypot(corner.x - ca.x, corner.y - ca.y) < 2 || Math.hypot(corner.x - cb.x, corner.y - cb.y) < 2) {
      return [clipToShape(a, cb.x, cb.y), clipToShape(b, ca.x, ca.y)];
    }
    return [p1, corner, p2];
  }

  function defaultLinkFor(a, b) {
    const t = new Set([a.type, b.type]);
    const link = { kind: 'line', route: 'straight' };
    if (t.has('attribute')) return link;
    if (a.type === 'table' && b.type === 'table') return { ...link, kind: 'fk' };
    if (t.has('relationship') && (t.has('entity') || (a.type === 'relationship' && b.type === 'relationship'))) {
      link.card = '0:N';
      link.cardEnd = a.type === 'relationship' ? 'to' : 'from';
      if (a.type === 'relationship' && b.type === 'relationship') link.cardEnd = 'to';
      return link;
    }
    if (a.type === 'entity' && b.type === 'entity') return { ...link, kind: 'isa' };
    if (a.type === 'gen' && b.type === 'entity') return { ...link, kind: 'isa' };
    return link;
  }

  /***********************************************************************
   * STATE HELPERS
   ***********************************************************************/
  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function persist() {
    if (typeof saveToStorage === 'function') saveToStorage();
  }

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function snapshot() {
    return JSON.stringify({ items: diagram.items, links: diagram.links });
  }

  function pushUndo() {
    if (!diagram) return;
    undoStack.push(snapshot());
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
  }

  function restore(state) {
    const s = JSON.parse(state);
    diagram.items = s.items;
    diagram.links = s.links;
    selItems.clear();
    selLinks.clear();
    render();
    persist();
    updateUndoButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  }

  function updateUndoButtons() {
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
  }

  function itemMap() {
    return new Map(diagram.items.map(i => [i.id, i]));
  }

  function screenToWorld(cx, cy) {
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.scale, y: (cy - r.top - view.y) / view.scale };
  }

  function viewCentreWorld() {
    const r = svg.getBoundingClientRect();
    return screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  /***********************************************************************
   * RENDERING
   ***********************************************************************/
  function buildItemGraphic(item, forExport = false) {
    const g = mk('g');
    const { x, y, s } = centreOf(item);
    switch (item.type) {
      case 'entity': {
        g.appendChild(mk('rect', { x: x - s.w / 2, y: y - s.h / 2, width: s.w, height: s.h, fill: '#ffffff', stroke: COLORS.ink, 'stroke-width': STROKE }));
        if (item.weak) {
          g.appendChild(mk('rect', { x: x - s.w / 2 + 5, y: y - s.h / 2 + 5, width: s.w - 10, height: s.h - 10, fill: 'none', stroke: COLORS.ink, 'stroke-width': STROKE * 0.75 }));
        }
        g.appendChild(mkText(item.label || '', x, y + ENTITY_FONT * 0.35, ENTITY_FONT, 'middle'));
        break;
      }
      case 'relationship': {
        const pts = (inset) => `${x},${y - s.h / 2 + inset} ${x + s.w / 2 - inset * 1.6},${y} ${x},${y + s.h / 2 - inset} ${x - s.w / 2 + inset * 1.6},${y}`;
        g.appendChild(mk('polygon', { points: pts(0), fill: '#ffffff', stroke: COLORS.ink, 'stroke-width': STROKE, 'stroke-linejoin': 'miter' }));
        if (item.identifying) {
          g.appendChild(mk('polygon', { points: pts(7), fill: 'none', stroke: COLORS.ink, 'stroke-width': STROKE * 0.75 }));
        }
        const lh = 22;
        const top = y - ((s.lines.length - 1) * lh) / 2;
        s.lines.forEach((ln, i) => {
          g.appendChild(mkText(ln, x, top + i * lh + REL_FONT * 0.35, REL_FONT, 'middle'));
        });
        break;
      }
      case 'attribute': {
        g.appendChild(mk('circle', { cx: x, cy: y, r: s.r, fill: item.filled ? COLORS.ink : '#ffffff', stroke: COLORS.ink, 'stroke-width': STROKE }));
        const lb = attrLabelBox(item);
        const text = attrDisplay(item);
        g.appendChild(mkText(text, lb.tx, lb.ty, ATTR_FONT, lb.anchor));
        if (item.key) {
          const keyW = textWidth(item.label || '', ATTR_FONT);
          let x0 = lb.x;
          if (lb.anchor === 'middle') x0 = lb.tx - lb.w / 2;
          if (lb.anchor === 'end') x0 = lb.tx - lb.w;
          g.appendChild(mkLine(x0, lb.ty + 4, x0 + keyW, lb.ty + 4, COLORS.ink, 1.6));
        }
        break;
      }
      case 'gen': {
        g.appendChild(mk('circle', { cx: x, cy: y, r: 3.2, fill: COLORS.ink }));
        if (item.label) g.appendChild(mkText(item.label, x + 10, y - 4, 15, 'start'));
        break;
      }
      case 'table': {
        const L = s.layout;
        const left = x - L.w / 2, top = y - L.h / 2;
        const slide = (item.style || 'slide') === 'slide';
        g.appendChild(mk('rect', { x: left, y: top, width: L.w, height: L.rowH, fill: slide ? COLORS.tableTitle : '#ffffff', stroke: slide ? 'none' : COLORS.ink, 'stroke-width': slide ? 0 : 1.4 }));
        g.appendChild(mk('rect', { x: left, y: top + L.rowH, width: L.w, height: L.rowH, fill: slide ? COLORS.tableHead : '#ffffff', stroke: slide ? 'none' : COLORS.ink, 'stroke-width': slide ? 0 : 1.4 }));
        L.rows.forEach((_, ri) => {
          const fill = slide ? (ri % 2 === 1 ? COLORS.stripe : '#ffffff') : '#ffffff';
          g.appendChild(mk('rect', { x: left, y: top + L.rowH * (2 + ri), width: L.w, height: L.rowH, fill, stroke: slide ? 'none' : COLORS.ink, 'stroke-width': slide ? 0 : 1.4 }));
        });
        if (!slide) {
          let cx = left;
          for (let ci = 0; ci < L.widths.length - 1; ci++) {
            cx += L.widths[ci];
            g.appendChild(mkLine(cx, top + L.rowH, cx, top + L.h, COLORS.ink, 1.4));
          }
        }
        const base = (row) => top + L.rowH * row + L.rowH * 0.7;
        g.appendChild(mkText(item.label || '', x, base(0), L.size, 'middle'));
        let cx = left;
        L.cols.forEach((c, ci) => {
          const w = L.widths[ci];
          const numeric = L.rows.length && L.rows.every(r => /^-?[\d.,]+$/.test(r[ci] ?? '') || (r[ci] ?? '') === 'NULL');
          const anchor = numeric ? 'end' : 'start';
          const tx = numeric ? cx + w - L.pad : cx + L.pad;
          const col = c.fkKey ? COLORS.fkKey : COLORS.ink;
          g.appendChild(mkText(c.name, tx, base(1), L.size, anchor, col));
          if (c.key) {
            const tw = textWidth(c.name, L.size);
            const x0 = numeric ? tx - tw : tx;
            g.appendChild(mkLine(x0, base(1) + 3, x0 + tw, base(1) + 3, col, 1.2));
          }
          L.rows.forEach((r, ri) => {
            g.appendChild(mkText(r[ci] ?? '', tx, base(2 + ri), L.size, anchor));
          });
          cx += w;
        });
        break;
      }
      case 'text': {
        const L = s.layout;
        L.parsed.forEach((segs, i) => {
          drawRich(g, segs, item.x + 4, item.y + L.lineH * i + L.size * 1.05, L.size, 'start');
        });
        if (!forExport && !(item.text || '').trim()) {
          g.appendChild(mk('rect', { x: item.x, y: item.y, width: 60, height: L.lineH, fill: 'none', stroke: '#cbd5e1', 'stroke-dasharray': '4,3' }));
        }
        break;
      }
    }
    return g;
  }

  function arrowHead(p, from, size, filled = true) {
    const ang = Math.atan2(p.y - from.y, p.x - from.x);
    const a1 = ang + Math.PI - 0.42, a2 = ang + Math.PI + 0.42;
    const pts = `${p.x},${p.y} ${p.x + Math.cos(a1) * size},${p.y + Math.sin(a1) * size} ${p.x + Math.cos(a2) * size},${p.y + Math.sin(a2) * size}`;
    return filled
      ? mk('polygon', { points: pts, fill: COLORS.ink, stroke: COLORS.ink, 'stroke-width': 1, 'stroke-linejoin': 'miter' })
      : mk('polyline', { points: `${p.x + Math.cos(a1) * size},${p.y + Math.sin(a1) * size} ${p.x},${p.y} ${p.x + Math.cos(a2) * size},${p.y + Math.sin(a2) * size}`, fill: 'none', stroke: COLORS.ink, 'stroke-width': STROKE * 0.8 });
  }

  function buildLinkGraphic(link, map, forExport = false) {
    const pts = linkPoints(link, map);
    if (!pts) return null;
    const g = mk('g');
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x},${p.y}`).join(' ');
    if (!forExport) {
      g.appendChild(mk('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }));
    }
    const kind = link.kind || 'line';
    const end = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    let visibleEnd = end;
    if (kind === 'isa') {
      // stop the line at the arrow base so the head stays crisp
      const len = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
      visibleEnd = { x: end.x - (end.x - prev.x) / len * 10, y: end.y - (end.y - prev.y) / len * 10 };
    }
    const vpts = [...pts.slice(0, -1), visibleEnd];
    const vd = vpts.map((p, i) => `${i ? 'L' : 'M'} ${p.x},${p.y}`).join(' ');
    const path = mk('path', { d: vd, fill: 'none', stroke: COLORS.ink, 'stroke-width': kind === 'isa' ? STROKE * 1.5 : STROKE, 'stroke-linejoin': 'miter', class: 'db-link-visible' });
    if (link.dashed) path.setAttribute('stroke-dasharray', '7,5');
    g.appendChild(path);
    if (kind === 'isa') g.appendChild(arrowHead(end, prev, 17, true));
    if (kind === 'arrow' || kind === 'fk') g.appendChild(arrowHead(end, prev, 13, kind === 'arrow'));

    // midpoint label (role names, fk)
    const midLabel = kind === 'fk' ? (link.role ? `${link.role}` : 'fk') : link.role;
    if (midLabel) {
      const a = pts[0], b = pts[pts.length - 1];
      const mx = pts.length === 3 ? pts[1].x : (a.x + b.x) / 2;
      const my = pts.length === 3 ? pts[1].y : (a.y + b.y) / 2;
      const t = mkText(midLabel, mx + 6, my - 7, 16, 'start');
      if (kind === 'fk' && !link.role) t.setAttribute('font-style', 'italic');
      g.appendChild(t);
    }

    // look-here cardinality next to the participating entity
    if (link.card) {
      const atTo = (link.cardEnd || 'to') === 'to';
      const p = atTo ? pts[pts.length - 1] : pts[0];
      const q = atTo ? pts[pts.length - 2] : pts[1];
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
      const side = link.cardSide === -1 ? -1 : 1;
      const nx = -uy * side, ny = ux * side;
      const size = 19;
      const w = textWidth(link.card, size);
      const along = 6 + Math.abs(ux) * (w / 2 + 2) + Math.abs(uy) * (size * 0.55);
      const off = 4 + Math.abs(nx) * (w / 2) + Math.abs(ny) * (size * 0.55);
      const cx = p.x + ux * along + nx * off;
      const cy = p.y + uy * along + ny * off;
      const t = mkText(link.card, cx, cy + size * 0.36, size, 'middle');
      t.setAttribute('class', 'db-card');
      g.appendChild(t);
    }
    return g;
  }

  function render() {
    if (!diagram) return;
    vp.setAttribute('transform', `translate(${view.x}, ${view.y}) scale(${view.scale})`);
    document.getElementById('zoom-label').textContent = `${Math.round(view.scale * 100)}%`;
    const map = itemMap();

    linksLayer.innerHTML = '';
    for (const link of diagram.links) {
      const g = buildLinkGraphic(link, map);
      if (!g) continue;
      g.setAttribute('class', `db-link ${selLinks.has(link.id) ? 'selected' : ''}`);
      g.dataset.linkId = link.id;
      linksLayer.appendChild(g);
    }

    itemsLayer.innerHTML = '';
    // draw attributes and gens last so circles sit on top of lines
    const order = [...diagram.items].sort((a, b) => (a.type === 'text') - (b.type === 'text'));
    for (const item of order) {
      const g = mk('g', { class: `db-item ${selItems.has(item.id) ? 'selected' : ''}` });
      g.dataset.itemId = item.id;
      const b = boundsOf(item);
      // generous invisible hit area
      g.appendChild(mk('rect', { x: b.minX - 4, y: b.minY - 4, width: b.maxX - b.minX + 8, height: b.maxY - b.minY + 8, fill: 'transparent', class: 'db-hit' }));
      g.appendChild(mk('rect', { x: b.minX - 6, y: b.minY - 6, width: b.maxX - b.minX + 12, height: b.maxY - b.minY + 12, fill: 'rgba(37,99,235,0.05)', stroke: COLORS.select, 'stroke-width': 1.2 / view.scale, 'stroke-dasharray': '4,3', rx: 4, class: 'selection-halo db-halo' }));
      g.appendChild(buildItemGraphic(item));
      // connect handle
      const { x, y, s } = centreOf(item);
      const hx = item.type === 'attribute' || item.type === 'gen' ? x : x + s.w / 2;
      const hy = item.type === 'attribute' || item.type === 'gen' ? y - 16 : y - s.h / 2;
      const handle = mk('g', { class: 'db-handle pin-dot' });
      handle.appendChild(mk('circle', { cx: hx, cy: hy, r: 9, fill: 'transparent' }));
      handle.appendChild(mk('circle', { cx: hx, cy: hy, r: 5.5, fill: COLORS.select, stroke: '#ffffff', 'stroke-width': 1.5 }));
      g.appendChild(handle);
      itemsLayer.appendChild(g);
    }
    updateUndoButtons();
  }

  /***********************************************************************
   * INSPECTOR
   ***********************************************************************/
  const SYMBOLS = ['⇒', 'π', 'σ', '⋈', '×', '∪', '∩', '−', 'ρ', '÷', '∧', '∨', '¬', '∃', '∀', '≠', '≤', '≥'];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function field(label, html) {
    return `<label class="db-field"><span>${label}</span>${html}</label>`;
  }

  function renderInspector() {
    if (!diagram) return;
    inspectorUndoPushed = false;
    const items = diagram.items.filter(i => selItems.has(i.id));
    const links = diagram.links.filter(l => selLinks.has(l.id));
    let html = '';

    if (items.length === 1 && links.length === 0) {
      const it = items[0];
      const title = { entity: 'entity', relationship: 'relationship', attribute: 'attribute', gen: 'generalisation', table: 'relation (table)', text: 'text / schema' }[it.type];
      html += `<div class="db-insp-title">${title}</div>`;
      if (it.type !== 'text') html += field('name', `<input data-prop="label" value="${esc(it.label)}" spellcheck="false" />`);
      if (it.type === 'entity') {
        html += `<label class="db-check"><input type="checkbox" data-prop="weak" ${it.weak ? 'checked' : ''}/> weak entity (double box)</label>`;
        html += `<div class="db-row"><button data-act="add-attr">+ attribute</button><button data-act="add-key">+ key attribute</button></div>`;
        html += `<div class="db-row"><button data-act="add-sub">+ subset</button><button data-act="add-rel">+ relationship</button></div>`;
        html += cardinalityRows(it);
      }
      if (it.type === 'relationship') {
        html += `<label class="db-check"><input type="checkbox" data-prop="identifying" ${it.identifying ? 'checked' : ''}/> identifying (double diamond)</label>`;
        html += `<div class="db-row"><button data-act="add-attr">+ attribute</button></div>`;
        html += `<div class="db-hint">tip: put a line break with "\\n" in the name, or it wraps by itself</div>`;
        const parts = participantLines(it).filter(p => p.part);
        if (parts.length === 2) {
          const [a, b] = parts.map(p => esc(p.other.label || p.other.type));
          html += `<div class="db-field"><span>constraint (${a} : ${b})</span></div>`;
          html += `<div class="db-row">${['1:1', '1:N', 'N:1', 'M:N'].map(r => `<button data-ratio="${r}" title="${a} ${r} ${b}">${r}</button>`).join('')}</div>`;
        }
        html += cardinalityRows(it);
      }
      if (it.type === 'attribute') {
        html += `<label class="db-check"><input type="checkbox" data-prop="key" ${it.key ? 'checked' : ''}/> key (underlined)</label>`;
        html += `<label class="db-check"><input type="checkbox" data-prop="optional" ${it.optional ? 'checked' : ''}/> optional (name?)</label>`;
        html += field('cardinality', `<input data-prop="card" value="${esc(it.card)}" placeholder="e.g. 0:N for multi-valued" spellcheck="false" />`);
        html += `<div class="db-row">${['', '0:1', '1:N', '0:N'].map(c => `<button data-card-attr="${c}">${c || 'none'}</button>`).join('')}</div>`;
        html += field('label side', `<select data-prop="labelSide">${['right', 'left', 'top', 'bottom'].map(s => `<option ${((it.labelSide || 'right') === s) ? 'selected' : ''}>${s}</option>`).join('')}</select>`);
        html += `<label class="db-check"><input type="checkbox" data-prop="filled" ${it.filled ? 'checked' : ''}/> filled circle</label>`;
        html += `<div class="db-row"><button data-act="add-attr">+ sub-attribute</button></div>`;
      }
      if (it.type === 'gen') {
        html += `<div class="db-hint">join each sub-class to this dot, then join the dot to the super-class (arrow). use the name for constraints such as "disjoint" or "total".</div>`;
        html += `<div class="db-row">${['', 'disjoint', 'total', 'disjoint, total'].map(c => `<button data-gen-label="${c}">${c || 'none'}</button>`).join('')}</div>`;
      }
      if (it.type === 'table') {
        html += field('columns', `<input data-prop="columns" value="${esc(it.columns)}" spellcheck="false" />`);
        html += `<div class="db-hint">comma separated. *no* = key (underlined), #no# = key that is also an fk, rate? = nullable</div>`;
        html += field('rows (one per line, comma separated)', `<textarea data-prop="rows" rows="5" spellcheck="false">${esc(it.rows)}</textarea>`);
        html += field('style', `<select data-prop="style">${['slide', 'plain'].map(s => `<option ${((it.style || 'slide') === s) ? 'selected' : ''}>${s}</option>`).join('')}</select>`);
        html += `<div class="db-row"><button data-act="copy-sql">copy CREATE TABLE</button><button data-act="table-text">as schema text</button></div>`;
      }
      if (it.type === 'text') {
        html += field('text', `<textarea data-prop="text" rows="7" spellcheck="false">${esc(it.text)}</textarea>`);
        html += `<div class="db-symbols">${SYMBOLS.map(s => `<button data-sym="${s}">${s}</button>`).join('')}</div>`;
        html += `<div class="db-hint">*key* underlines · #key# underlines in brown (key + fk) · fk=&gt; draws <i>fk</i> over ⇒ · =&gt; is ⇒</div>`;
        html += field('font size', `<input type="number" min="10" max="40" data-prop="fontSize" value="${it.fontSize || 18}" />`);
      }
      html += `<div class="db-row db-row-end"><button data-act="duplicate">duplicate</button><button data-act="delete" class="db-danger">delete</button></div>`;
    } else if (links.length === 1 && items.length === 0) {
      const l = links[0];
      const map = itemMap();
      const a = map.get(l.from), b = map.get(l.to);
      html += `<div class="db-insp-title">line: ${esc(a?.label || a?.type || '?')} → ${esc(b?.label || b?.type || '?')}</div>`;
      html += field('kind', `<select data-lprop="kind">${[['line', 'plain line'], ['isa', 'subset / is-a arrow'], ['fk', 'foreign key arrow'], ['arrow', 'arrow']].map(([v, t]) => `<option value="${v}" ${(l.kind || 'line') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`);
      html += field('cardinality (look-here)', `<input data-lprop="card" value="${esc(l.card)}" placeholder="e.g. 0:N" spellcheck="false" />`);
      html += `<div class="db-row">${['', '0:1', '1:1', '0:N', '1:N'].map(c => `<button data-card="${c}">${c || 'none'}</button>`).join('')}</div>`;
      html += `<div class="db-row"><button data-act="card-end">card at other end</button><button data-act="card-side">flip side</button></div>`;
      html += field('role / label', `<input data-lprop="role" value="${esc(l.role)}" placeholder="optional role name" spellcheck="false" />`);
      html += field('route', `<select data-lprop="route">${[['straight', 'straight'], ['hv', 'horizontal then vertical'], ['vh', 'vertical then horizontal']].map(([v, t]) => `<option value="${v}" ${(l.route || 'straight') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`);
      html += `<label class="db-check"><input type="checkbox" data-lprop="dashed" ${l.dashed ? 'checked' : ''}/> dashed</label>`;
      html += `<div class="db-row db-row-end"><button data-act="reverse">reverse</button><button data-act="delete" class="db-danger">delete</button></div>`;
    } else if (items.length + links.length > 1) {
      html += `<div class="db-insp-title">${items.length} items, ${links.length} lines selected</div>`;
      if (items.length > 1) {
        html += `<div class="db-row"><button data-act="align-h">align row</button><button data-act="align-v">align column</button></div>`;
        html += `<div class="db-row"><button data-act="dist-h">space evenly ↔</button><button data-act="dist-v">space evenly ↕</button></div>`;
      }
      html += `<div class="db-row db-row-end"><button data-act="duplicate">duplicate</button><button data-act="delete" class="db-danger">delete</button></div>`;
    } else {
      html += `<div class="db-insp-title">database diagram</div>
        <div class="db-hint">add shapes from the toolbar, or double-click the canvas.<br>
        drag the <b style="color:${COLORS.select}">●</b> handle of a shape onto another to join them. entity–relationship lines get a look-here cardinality you can edit.<br>
        double-click a shape to rename · shift-click to multi-select · space-drag / middle-drag to pan.</div>`;
    }
    inspector.innerHTML = html;
  }

  /** Lines from an entity/relationship to the things it is related to. */
  //   at:   the shape whose participation the cardinality describes
  //   part: true when `other` is a participant of relationship `it`
  function participantLines(it) {
    const map = itemMap();
    return diagram.links
      .filter(l => l.from === it.id || l.to === it.id)
      .map(l => ({ link: l, other: map.get(l.from === it.id ? l.to : l.from) }))
      .filter(p => p.other && (it.type === 'relationship'
        ? (p.other.type === 'entity' || p.other.type === 'relationship')
        : p.other.type === 'relationship'))
      .map(p => {
        let part = it.type === 'relationship' && p.other.type === 'entity';
        if (it.type === 'relationship' && p.other.type === 'relationship') {
          // nested: the cardinality sits next to the relationship that takes part
          part = p.link.card
            ? ((p.link.cardEnd || 'to') === 'to' ? p.link.to : p.link.from) === p.other.id
            : p.link.from === it.id;
        }
        return { ...p, part, at: part ? p.other : it };
      });
  }

  /** Look-here cardinality fields for every relationship line of a shape. */
  function cardinalityRows(it) {
    const parts = participantLines(it);
    if (!parts.length) return '';
    let html = `<div class="db-field"><span>cardinality (look-here)</span></div>`;
    for (const p of parts) {
      const who = p.at;
      const label = p.part ? (p.other.label || p.other.type) : `in ${p.other.label || p.other.type}`;
      html += `<div class="db-card-row"><span title="how many times each ${esc(who.label || '')} takes part">${esc(label)}</span>`
        + `<input data-link-card="${p.link.id}" data-at="${who.id}" value="${esc(p.link.card)}" list="db-card-presets" placeholder="none" spellcheck="false" /></div>`;
    }
    html += `<datalist id="db-card-presets">${['0:1', '1:1', '0:N', '1:N'].map(c => `<option value="${c}">`).join('')}</datalist>`;
    return html;
  }

  /** Sets a line's look-here cardinality at the end touching `atId`. */
  function setCardAt(link, atId, card) {
    link.card = card;
    link.cardEnd = link.to === atId ? 'to' : 'from';
  }

  function onInspectorInput(e) {
    const el = e.target;
    if (!inspectorUndoPushed) { pushUndo(); inspectorUndoPushed = true; }
    const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    if (el.dataset.prop) {
      for (const it of diagram.items) if (selItems.has(it.id)) {
        it[el.dataset.prop] = el.dataset.prop === 'label' ? val.replace(/\\n/g, '\n') : val;
      }
    }
    if (el.dataset.linkCard) {
      const link = diagram.links.find(l => l.id === el.dataset.linkCard);
      if (link) setCardAt(link, el.dataset.at, val.trim().toUpperCase().replace(/^([01]):M$/, '$1:N'));
    }
    if (el.dataset.lprop) {
      for (const l of diagram.links) if (selLinks.has(l.id)) l[el.dataset.lprop] = val;
    }
    render();
    persist();
  }

  function onInspectorClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const sel = diagram.items.filter(i => selItems.has(i.id));
    const lsel = diagram.links.filter(l => selLinks.has(l.id));
    if (btn.dataset.sym !== undefined) {
      const ta = inspector.querySelector('textarea[data-prop="text"]');
      if (ta) {
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + btn.dataset.sym + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + btn.dataset.sym.length;
        ta.focus();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (btn.dataset.card !== undefined) {
      pushUndo();
      lsel.forEach(l => { l.card = btn.dataset.card; if (!l.cardEnd) l.cardEnd = 'to'; });
      commit(true);
      return;
    }
    if (btn.dataset.cardAttr !== undefined) {
      pushUndo();
      sel.forEach(i => { i.card = btn.dataset.cardAttr; });
      commit(true);
      return;
    }
    if (btn.dataset.ratio) {
      // "A 1:N B": each A relates to many B, each B to at most one A.
      // Look-here puts the number of times an entity takes part next to it.
      const parts = participantLines(sel[0]).filter(p => p.part);
      if (parts.length !== 2) return;
      pushUndo();
      const [ra, rb] = btn.dataset.ratio.split(':');
      const maxFor = (r) => (r === '1' ? '1' : 'N');
      [[parts[0], rb], [parts[1], ra]].forEach(([p, r]) => {
        const min = p.link.card ? minOf(p.link.card) : '0';
        setCardAt(p.link, p.other.id, `${min}:${maxFor(r)}`);
      });
      commit(true);
      return;
    }
    if (btn.dataset.genLabel !== undefined) {
      pushUndo();
      sel.forEach(i => { i.label = btn.dataset.genLabel; });
      commit(true);
      return;
    }
    const act = btn.dataset.act;
    if (!act) return;
    switch (act) {
      case 'delete': deleteSelected(); break;
      case 'duplicate': duplicateSelection(); break;
      case 'add-attr':
      case 'add-key': {
        const it = sel[0];
        pushUndo();
        const existing = diagram.links.filter(l => l.from === it.id || l.to === it.id).length;
        const { s } = centreOf(it);
        const ang = -Math.PI / 2 + existing * 0.9;
        const dist = it.type === 'attribute' ? 60 : Math.max(s.w, s.h) / 2 + 55;
        const at = { id: uid('a'), type: 'attribute', label: act === 'add-key' ? 'id' : 'attribute', key: act === 'add-key', x: Math.round(it.x + Math.cos(ang) * dist), y: Math.round(it.y + Math.sin(ang) * dist) };
        at.labelSide = Math.cos(ang) < -0.3 ? 'left' : 'right';
        diagram.items.push(at);
        diagram.links.push({ id: uid('l'), from: it.id, to: at.id, kind: 'line', route: 'straight' });
        selItems = new Set([at.id]); selLinks.clear();
        commit(true);
        focusLabel();
        break;
      }
      case 'add-sub': {
        const it = sel[0];
        pushUndo();
        const sub = { id: uid('e'), type: 'entity', label: 'subset', x: it.x, y: it.y + 140 };
        diagram.items.push(sub);
        diagram.links.push({ id: uid('l'), from: sub.id, to: it.id, kind: 'isa', route: 'straight' });
        selItems = new Set([sub.id]); selLinks.clear();
        commit(true);
        focusLabel();
        break;
      }
      case 'add-rel': {
        const it = sel[0];
        pushUndo();
        const { s } = centreOf(it);
        const rel = { id: uid('r'), type: 'relationship', label: 'relates', x: it.x + s.w / 2 + 120, y: it.y };
        diagram.items.push(rel);
        diagram.links.push({ id: uid('l'), from: it.id, to: rel.id, kind: 'line', route: 'straight', card: '0:N', cardEnd: 'from' });
        selItems = new Set([rel.id]); selLinks.clear();
        commit(true);
        focusLabel();
        break;
      }
      case 'card-end':
        pushUndo();
        lsel.forEach(l => { l.cardEnd = (l.cardEnd || 'to') === 'to' ? 'from' : 'to'; });
        commit(false);
        break;
      case 'card-side':
        pushUndo();
        lsel.forEach(l => { l.cardSide = l.cardSide === -1 ? 1 : -1; });
        commit(false);
        break;
      case 'reverse':
        pushUndo();
        lsel.forEach(l => {
          [l.from, l.to] = [l.to, l.from];
          if (l.card) l.cardEnd = (l.cardEnd || 'to') === 'to' ? 'from' : 'to';
        });
        commit(false);
        break;
      case 'align-h':
      case 'align-v': {
        pushUndo();
        const key = act === 'align-h' ? 'y' : 'x';
        const cs = sel.map(i => centreOf(i));
        const avg = cs.reduce((a, c) => a + c[key], 0) / cs.length;
        sel.forEach((i, k) => { i[key] += Math.round(avg - cs[k][key]); });
        commit(false);
        break;
      }
      case 'dist-h':
      case 'dist-v': {
        if (sel.length < 3) break;
        pushUndo();
        const key = act === 'dist-h' ? 'x' : 'y';
        const sorted = [...sel].sort((a, b) => centreOf(a)[key] - centreOf(b)[key]);
        const first = centreOf(sorted[0])[key], last = centreOf(sorted[sorted.length - 1])[key];
        sorted.forEach((i, k) => { i[key] += Math.round(first + (last - first) * k / (sorted.length - 1) - centreOf(i)[key]); });
        commit(false);
        break;
      }
      case 'copy-sql': {
        const sql = tableToSQL(sel[0]);
        navigator.clipboard?.writeText(sql).then(() => toast('copied CREATE TABLE to clipboard'), () => toast('could not access clipboard'));
        break;
      }
      case 'table-text': {
        pushUndo();
        const t = sel[0];
        const L = tableLayout(t);
        const cols = L.cols.map(c => c.key ? (c.fkKey ? `#${c.name}#` : `*${c.name}*`) : c.name).join(',');
        const txt = { id: uid('t'), type: 'text', text: `${t.label}(${cols})`, x: Math.round(t.x - L.w / 2), y: Math.round(t.y + L.h / 2 + 18) };
        diagram.items.push(txt);
        selItems = new Set([txt.id]);
        commit(true);
        break;
      }
    }
  }

  function commit(rebuildInspector) {
    render();
    if (rebuildInspector) renderInspector();
    persist();
  }

  function focusLabel() {
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    setTimeout(() => {
      const inp = inspector.querySelector('input[data-prop="label"], textarea[data-prop="text"]');
      if (inp) { inp.focus(); inp.select?.(); }
    }, 0);
  }

  function tableToSQL(t) {
    const L = tableLayout(t);
    const lines = L.cols.map(c => {
      const nullable = c.name.endsWith('?');
      const name = c.name.replace(/\?$/, '');
      const sample = L.rows.map(r => r[L.cols.indexOf(c)]).find(v => v && v !== 'NULL');
      let type = 'VARCHAR(20)';
      if (sample && /^-?\d+$/.test(sample)) type = 'INTEGER';
      else if (sample && /^-?\d+\.\d+$/.test(sample)) type = 'DECIMAL(10,2)';
      else if (sample && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sample)) type = 'DATE';
      return `  ${name} ${type} ${nullable ? 'NULL' : 'NOT NULL'}`;
    });
    const keys = L.cols.filter(c => c.key).map(c => c.name.replace(/\?$/, ''));
    if (keys.length) lines.push(`  CONSTRAINT ${t.label}_pk PRIMARY KEY (${keys.join(', ')})`);
    return `CREATE TABLE ${t.label}\n(\n${lines.join(',\n')}\n);`;
  }

  /***********************************************************************
   * ADD / DELETE / DUPLICATE
   ***********************************************************************/
  const DEFAULTS = {
    entity: () => ({ label: 'entity' }),
    relationship: () => ({ label: 'relationship' }),
    attribute: () => ({ label: 'attribute' }),
    key: () => ({ type: 'attribute', label: 'id', key: true }),
    gen: () => ({ label: 'disjoint' }),
    table: () => ({ label: 'relation', columns: '*id*, name, value?', rows: '', style: 'slide' }),
    text: () => ({ text: 'relation(*key*,attribute,optional?)\nrelation(attribute) fk=> other(key)', fontSize: 18 })
  };

  function addItem(type, pos = null) {
    if (!diagram) return;
    pushUndo();
    const extra = DEFAULTS[type] ? DEFAULTS[type]() : {};
    let p = pos;
    const anchor = !pos && selItems.size === 1 ? diagram.items.find(i => selItems.has(i.id)) : null;
    if (anchor) {
      // place next to the selected shape, ready to be joined to it
      const b = boundsOf(anchor);
      p = { x: b.maxX + 150, y: centreOf(anchor).y };
    }
    p = p || viewCentreWorld();
    const item = { id: uid(type[0]), type, x: Math.round(p.x), y: Math.round(p.y), ...extra };
    if (item.type === 'text') { item.x -= 120; item.y -= 20; }
    // keep new shapes clear of existing ones
    const overlaps = () => {
      const b = boundsOf(item);
      return diagram.items.some(o => {
        const ob = boundsOf(o);
        return b.minX < ob.maxX + 20 && b.maxX > ob.minX - 20 && b.minY < ob.maxY + 20 && b.maxY > ob.minY - 20;
      });
    };
    for (let tries = 0; tries < 40 && overlaps(); tries++) {
      if (anchor) item.y += 50;
      else { item.x += (tries % 2 ? -1 : 1) * 40 * (tries + 1); item.y += 30; }
    }
    diagram.items.push(item);
    selItems = new Set([item.id]);
    selLinks.clear();
    commit(true);
    focusLabel();
  }

  function deleteSelected() {
    if (!selItems.size && !selLinks.size) return;
    pushUndo();
    diagram.items = diagram.items.filter(i => !selItems.has(i.id));
    diagram.links = diagram.links.filter(l => !selLinks.has(l.id) && !selItems.has(l.from) && !selItems.has(l.to));
    selItems.clear();
    selLinks.clear();
    commit(true);
  }

  function copySelection() {
    if (!selItems.size) return null;
    const items = diagram.items.filter(i => selItems.has(i.id));
    const links = diagram.links.filter(l => selItems.has(l.from) && selItems.has(l.to));
    return JSON.parse(JSON.stringify({ items, links }));
  }

  function pasteData(data, offset = 30) {
    if (!data || !data.items.length) return;
    pushUndo();
    const idMap = new Map();
    const newItems = data.items.map(i => {
      const id = uid(i.type[0]);
      idMap.set(i.id, id);
      return { ...JSON.parse(JSON.stringify(i)), id, x: i.x + offset, y: i.y + offset };
    });
    const newLinks = data.links.map(l => ({ ...l, id: uid('l'), from: idMap.get(l.from), to: idMap.get(l.to) }));
    diagram.items.push(...newItems);
    diagram.links.push(...newLinks);
    selItems = new Set(newItems.map(i => i.id));
    selLinks.clear();
    commit(true);
  }

  function duplicateSelection() {
    const data = copySelection();
    if (!data) { toast('select something to duplicate'); return; }
    pasteData(data, 30);
  }

  /***********************************************************************
   * ER -> RELATIONAL MAPPING
   ***********************************************************************/
  function maxOf(card) {
    if (!card) return 'N';
    const parts = String(card).split(':');
    return (parts[1] ?? parts[0]).trim().toUpperCase();
  }
  function minOf(card) {
    if (!card) return '0';
    return String(card).split(':')[0].trim();
  }
  const isMany = (card) => !/^1$/.test(maxOf(card));

  function mapToRelational() {
    const map = itemMap();
    const items = diagram.items;
    const links = diagram.links;
    const entities = items.filter(i => i.type === 'entity');
    const rels = items.filter(i => i.type === 'relationship');
    if (!entities.length) { toast('draw some entities first'); return; }

    const name = (i) => (i.label || i.type).trim().replace(/\s+/g, '_');
    const neighbours = (id) => links.filter(l => l.from === id || l.to === id).map(l => ({ link: l, other: map.get(l.from === id ? l.to : l.from), outgoing: l.from === id }));

    // attributes of an entity/relationship, flattening composite attributes
    function attrsOf(id, seen = new Set([id])) {
      const out = [];
      for (const n of neighbours(id)) {
        if (!n.other || n.other.type !== 'attribute' || seen.has(n.other.id)) continue;
        seen.add(n.other.id);
        const subs = attrsOf(n.other.id, seen);
        if (subs.length) out.push(...subs.map(s => ({ ...s, key: s.key || n.other.key })));
        else out.push({ name: n.other.label.trim().replace(/\s+/g, '_'), key: !!n.other.key, optional: !!n.other.optional, card: n.other.card });
      }
      return out;
    }

    // super-class of an entity (subset arrow or generalisation)
    function parentOf(e) {
      for (const n of neighbours(e.id)) {
        if (!n.other) continue;
        if (n.link.kind === 'isa' && n.outgoing && n.other.type === 'entity') return n.other;
        if (n.other.type === 'gen') {
          const up = neighbours(n.other.id).find(m => m.other && m.other.type === 'entity' && m.other.id !== e.id && m.link.kind === 'isa' && m.outgoing);
          if (up) return up.other;
        }
      }
      return null;
    }

    // A nested relationship participates in R when the look-here
    // cardinality sits at its end of the line (or, with no cardinality,
    // when the line was drawn from R to it).
    const participates = (r, n) => {
      if (n.other.type === 'entity') return true;
      if (n.other.type !== 'relationship') return false;
      if (n.link.card) {
        const endId = (n.link.cardEnd || 'to') === 'to' ? n.link.to : n.link.from;
        return endId === n.other.id;
      }
      return n.link.from === r.id;
    };
    const participants = (r) => neighbours(r.id)
      .filter(n => n.other && participates(r, n))
      .map(n => ({ item: n.other, card: n.link.card, role: n.link.role }));

    // identifying owners for weak entities
    function ownersOf(e) {
      const owners = [];
      if (!e.weak) return owners;
      for (const n of neighbours(e.id)) {
        if (n.other?.type !== 'relationship' || !n.other.identifying) continue;
        for (const p of participants(n.other)) if (p.item.id !== e.id) owners.push(p.item);
      }
      return owners;
    }

    const keyCache = new Map();
    function keyOf(it, stack = new Set()) {
      if (keyCache.has(it.id)) return keyCache.get(it.id);
      if (stack.has(it.id)) return [];
      stack.add(it.id);
      let key = [];
      if (it.type === 'entity') {
        const parent = parentOf(it);
        if (parent) key = keyOf(parent, stack);
        else {
          key = attrsOf(it.id).filter(a => a.key).map(a => a.name);
          for (const o of ownersOf(it)) key = [...keyOf(o, stack), ...key];
        }
      } else if (it.type === 'relationship') {
        const ps = participants(it);
        const manyPs = ps.filter(p => isMany(p.card));
        const use = manyPs.length === ps.length || manyPs.length === 0 ? ps : ps.filter(p => !isMany(p.card));
        for (const p of use) key.push(...keyOf(p.item, stack).map(k => p.role ? `${p.role}_${k}` : k));
      }
      key = [...new Set(key)];
      keyCache.set(it.id, key);
      return key;
    }

    const tables = new Map(); // name -> { cols: [{name,key,optional,fk}], order }
    const fks = [];
    function table(tname) {
      if (!tables.has(tname)) tables.set(tname, { cols: [] });
      return tables.get(tname);
    }
    function addCol(tname, col) {
      const t = table(tname);
      const ex = t.cols.find(c => c.name === col.name);
      if (ex) { ex.key = ex.key || col.key; ex.fk = ex.fk || col.fk; ex.optional = ex.optional && col.optional; return; }
      t.cols.push({ ...col });
    }

    // entities
    for (const e of entities) {
      const tn = name(e);
      const parent = parentOf(e);
      const k = keyOf(e);
      table(tn);
      if (parent) {
        k.forEach(c => addCol(tn, { name: c, key: true, fk: true }));
        fks.push(`${tn}(${k.join(',')}) fk=> ${name(parent)}(${k.join(',')})`);
      }
      for (const o of ownersOf(e)) {
        const ok = keyOf(o);
        ok.forEach(c => addCol(tn, { name: c, key: true, fk: true }));
        fks.push(`${tn}(${ok.join(',')}) fk=> ${name(o)}(${ok.join(',')})`);
      }
      for (const a of attrsOf(e.id)) {
        if (a.card && isMany(a.card)) {
          const mt = `${tn}_${a.name}`;
          k.forEach(c => addCol(mt, { name: c, key: true, fk: true }));
          addCol(mt, { name: a.name, key: true });
          fks.push(`${mt}(${k.join(',')}) fk=> ${tn}(${k.join(',')})`);
          continue;
        }
        const optional = a.optional || (a.card && minOf(a.card) === '0');
        addCol(tn, { name: a.name, key: a.key && !parent, optional });
      }
    }

    // relationships
    const relTable = new Map(); // relationship id -> table name holding it
    const ordered = [...rels].sort((a, b) => participants(a).filter(p => p.item.type === 'relationship').length - participants(b).filter(p => p.item.type === 'relationship').length);
    for (const r of ordered) {
      if (r.identifying) continue; // folded into the weak entity's key
      const ps = participants(r);
      const rAttrs = attrsOf(r.id);
      const singles = ps.filter(p => !isMany(p.card));
      if (ps.length === 2 && singles.length >= 1) {
        // absorb into the table of the participant that takes part at most once
        const host = singles.find(p => minOf(p.card) !== '0') || singles[0];
        const other = ps.find(p => p !== host);
        const hostName = host.item.type === 'relationship' ? relTable.get(host.item.id) || name(host.item) : name(host.item);
        const ok = keyOf(other.item).map(k => other.role ? `${other.role}_${k}` : k);
        const optional = minOf(host.card) === '0';
        ok.forEach(c => addCol(hostName, { name: c, optional, fk: true }));
        rAttrs.forEach(a => addCol(hostName, { name: a.name, optional: optional || a.optional }));
        const target = other.item.type === 'relationship' ? relTable.get(other.item.id) || name(other.item) : name(other.item);
        fks.push(`${hostName}(${ok.join(',')}) fk=> ${target}(${keyOf(other.item).join(',')})`);
        relTable.set(r.id, hostName);
        continue;
      }
      const tn = name(r);
      relTable.set(r.id, tn);
      const rk = new Set(keyOf(r));
      for (const p of ps) {
        const pk = keyOf(p.item);
        const cols = pk.map(k => p.role ? `${p.role}_${k}` : k);
        cols.forEach(c => addCol(tn, { name: c, key: rk.has(c), fk: true }));
        const target = p.item.type === 'relationship' ? relTable.get(p.item.id) || name(p.item) : name(p.item);
        fks.push(`${tn}(${cols.join(',')}) fk=> ${target}(${pk.join(',')})`);
      }
      rAttrs.forEach(a => addCol(tn, { name: a.name, optional: a.optional }));
    }

    const lines = [];
    for (const [tn, t] of tables) {
      const cols = [...t.cols.filter(c => c.key), ...t.cols.filter(c => !c.key)]
        .map(c => c.key ? (c.fk ? `#${c.name}#` : `*${c.name}*`) : `${c.name}${c.optional ? '?' : ''}`);
      lines.push(`${tn}(${cols.join(',')})`);
    }
    if (fks.length) lines.push('', ...[...new Set(fks)]);

    // place to the right of the ER diagram
    let maxX = -Infinity, minY = Infinity;
    for (const it of items) {
      if (it.type === 'text' || it.type === 'table') continue;
      const b = boundsOf(it);
      maxX = Math.max(maxX, b.maxX); minY = Math.min(minY, b.minY);
    }
    if (!isFinite(maxX)) { const c = viewCentreWorld(); maxX = c.x; minY = c.y; }
    pushUndo();
    const txt = { id: uid('t'), type: 'text', text: lines.join('\n'), fontSize: 18, x: Math.round(maxX + 60), y: Math.round(minY), generated: true };
    diagram.items.push(txt);
    selItems = new Set([txt.id]);
    selLinks.clear();
    commit(true);
    toast('mapped ER diagram to a relational schema — check it against the rules!');
  }

  /***********************************************************************
   * EXAMPLES FROM THE COURSE
   ***********************************************************************/
  const EXAMPLES = {
    nested: {
      name: 'nested relationships',
      build: () => {
        const it = [
          { id: 'person', type: 'entity', label: 'person', x: 160, y: 140 },
          { id: 'department', type: 'entity', label: 'department', x: 620, y: 140 },
          { id: 'project', type: 'entity', label: 'project', x: 390, y: 520 },
          { id: 'works_in', type: 'relationship', label: 'works in', x: 390, y: 140 },
          { id: 'member', type: 'relationship', label: 'member', x: 390, y: 330 },
          { id: 'a_sal', type: 'attribute', label: 'salary_number', key: true, x: 160, y: 40, labelSide: 'right' },
          { id: 'a_dname', type: 'attribute', label: 'dname', key: true, x: 620, y: 40, labelSide: 'right' },
          { id: 'a_role', type: 'attribute', label: 'role', x: 560, y: 330 },
          { id: 'a_pcode', type: 'attribute', label: 'pcode', key: true, x: 580, y: 520 }
        ];
        const ln = [
          { id: 'l1', from: 'works_in', to: 'person', kind: 'line', card: '0:N', cardEnd: 'to', cardSide: -1 },
          { id: 'l2', from: 'works_in', to: 'department', kind: 'line', card: '0:N', cardEnd: 'to' },
          { id: 'l3', from: 'member', to: 'works_in', kind: 'line', card: '0:N', cardEnd: 'to' },
          { id: 'l4', from: 'member', to: 'project', kind: 'line', card: '0:N', cardEnd: 'to' },
          { id: 'l5', from: 'member', to: 'a_role', kind: 'line' },
          { id: 'l6', from: 'project', to: 'a_pcode', kind: 'line' },
          { id: 'l7', from: 'person', to: 'a_sal', kind: 'line' },
          { id: 'l8', from: 'department', to: 'a_dname', kind: 'line' }
        ];
        return { items: it, links: ln };
      }
    },
    eer: {
      name: 'EER constructs',
      build: () => ({
        items: [
          { id: 'person', type: 'entity', label: 'person', x: 380, y: 120 },
          { id: 'p_sn', type: 'attribute', label: 'salary_number', key: true, x: 230, y: 70, labelSide: 'left' },
          { id: 'p_name', type: 'attribute', label: 'name', x: 530, y: 70 },
          { id: 'p_phone', type: 'attribute', label: 'phone', card: '0:N', x: 530, y: 170 },
          { id: 'gen', type: 'gen', label: 'disjoint', x: 380, y: 250 },
          { id: 'manager', type: 'entity', label: 'manager', x: 230, y: 360 },
          { id: 'engineer', type: 'entity', label: 'engineer', x: 530, y: 360 },
          { id: 'm_bonus', type: 'attribute', label: 'bonus', optional: true, x: 230, y: 450, labelSide: 'right' },
          { id: 'contractor', type: 'entity', label: 'contractor', x: 60, y: 120 },
          { id: 'branch', type: 'entity', label: 'branch', x: 860, y: 120 },
          { id: 'b_sc', type: 'attribute', label: 'sortcode', key: true, x: 860, y: 30 },
          { id: 'has', type: 'relationship', label: 'has', x: 860, y: 280, identifying: true },
          { id: 'office', type: 'entity', label: 'office', x: 860, y: 440, weak: true },
          { id: 'o_room', type: 'attribute', label: 'room', key: true, x: 1030, y: 440 }
        ],
        links: [
          { id: 'l1', from: 'person', to: 'p_sn', kind: 'line' },
          { id: 'l2', from: 'person', to: 'p_name', kind: 'line' },
          { id: 'l3', from: 'person', to: 'p_phone', kind: 'line' },
          { id: 'l4', from: 'manager', to: 'gen', kind: 'line', route: 'vh' },
          { id: 'l5', from: 'engineer', to: 'gen', kind: 'line', route: 'vh' },
          { id: 'l6', from: 'gen', to: 'person', kind: 'isa' },
          { id: 'l7', from: 'manager', to: 'm_bonus', kind: 'line' },
          { id: 'l8', from: 'contractor', to: 'person', kind: 'isa' },
          { id: 'l9', from: 'branch', to: 'b_sc', kind: 'line' },
          { id: 'l10', from: 'has', to: 'branch', kind: 'line', card: '0:N', cardEnd: 'to' },
          { id: 'l11', from: 'has', to: 'office', kind: 'line', card: '1:1', cardEnd: 'to' },
          { id: 'l12', from: 'office', to: 'o_room', kind: 'line' }
        ]
      })
    },
    bank: {
      name: 'bank schema (tables)',
      build: () => ({
        items: [
          { id: 'branch', type: 'table', label: 'branch', x: 170, y: 90, style: 'slide', columns: '*sortcode*, bname, cash', rows: "56, 'Wimbledon', 94340.45\n34, 'Goodge St', 8900.67\n67, 'Strand', 34005.00" },
          { id: 'account', type: 'table', label: 'account', x: 590, y: 120, style: 'slide', columns: '*no*, type, cname, rate?, sortcode', rows: "100, 'current', 'McBrien, P.', NULL, 67\n101, 'deposit', 'McBrien, P.', 5.25, 67\n103, 'current', 'Boyd, M.', NULL, 34\n107, 'current', 'Poulovassilis, A.', NULL, 56\n119, 'deposit', 'Poulovassilis, A.', 5.50, 56\n125, 'current', 'Bailey, J.', NULL, 56" },
          { id: 'movement', type: 'table', label: 'movement', x: 180, y: 360, style: 'slide', columns: '*mid*, no, amount, tdate', rows: '1000, 100, 2300.00, 5/1/1999\n1001, 101, 4000.00, 5/1/1999\n1002, 100, -223.45, 8/1/1999\n1004, 107, -100.00, 11/1/1999\n1005, 103, 145.50, 12/1/1999\n1006, 100, 10.23, 15/1/1999\n1007, 107, 345.56, 15/1/1999\n1008, 101, 1230.00, 15/1/1999\n1009, 119, 5600.00, 18/1/1999' },
          { id: 'keys', type: 'text', x: 420, y: 300, fontSize: 17, text: 'key branch(sortcode)\nkey branch(bname)\nkey movement(mid)\nkey account(no)\nmovement(no) fk=> account(no)\naccount(sortcode) fk=> branch(sortcode)' }
        ],
        links: []
      })
    }
  };

  function loadExample(key) {
    const ex = EXAMPLES[key];
    if (!ex || !diagram) return;
    pushUndo();
    const data = ex.build();
    if (diagram.items.length) {
      // place to the right of existing content
      let maxX = -Infinity, minY = Infinity;
      for (const it of diagram.items) { const b = boundsOf(it); maxX = Math.max(maxX, b.maxX); minY = Math.min(minY, b.minY); }
      let exMin = Infinity, exMinY = Infinity;
      for (const it of data.items) { const b = boundsOf(it); exMin = Math.min(exMin, b.minX); exMinY = Math.min(exMinY, b.minY); }
      const dx = maxX + 120 - exMin, dy = minY - exMinY;
      data.items.forEach(i => { i.x += dx; i.y += dy; });
    }
    const idMap = new Map();
    data.items.forEach(i => { const n = uid(i.type[0]); idMap.set(i.id, n); i.id = n; });
    data.links.forEach(l => { l.id = uid('l'); l.from = idMap.get(l.from); l.to = idMap.get(l.to); l.route = l.route || 'straight'; });
    diagram.items.push(...data.items);
    diagram.links.push(...data.links);
    selItems = new Set(data.items.map(i => i.id));
    selLinks.clear();
    commit(true);
    fitView();
    toast(`inserted example: ${ex.name}`);
  }

  /***********************************************************************
   * POINTER INTERACTION
   ***********************************************************************/
  function itemUnder(clientX, clientY) {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const g = el.closest && el.closest('.db-item');
      if (g && svg.contains(g)) return diagram.items.find(i => i.id === g.dataset.itemId);
    }
    return null;
  }

  function onPointerDown(e) {
    if (!diagram) return;
    quickMenu.classList.add('hidden');
    const w = screenToWorld(e.clientX, e.clientY);
    ix.startX = e.clientX; ix.startY = e.clientY;
    ix.moved = false;

    if (e.button === 1 || (e.button === 0 && ix.spacePressed)) {
      ix.mode = 'PAN';
      ix.startViewX = view.x; ix.startViewY = view.y;
      svg.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const handle = e.target.closest('.db-handle');
    const itemEl = e.target.closest('.db-item');
    const linkEl = e.target.closest('.db-link');

    if (handle && itemEl) {
      ix.mode = 'CONNECT';
      ix.connectFrom = itemEl.dataset.itemId;
      const it = diagram.items.find(i => i.id === ix.connectFrom);
      const c = centreOf(it);
      tempLine.setAttribute('x1', c.x); tempLine.setAttribute('y1', c.y);
      tempLine.setAttribute('x2', w.x); tempLine.setAttribute('y2', w.y);
      tempLine.classList.remove('hidden');
      e.preventDefault();
      return;
    }

    if (itemEl) {
      const id = itemEl.dataset.itemId;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (selItems.has(id)) selItems.delete(id); else selItems.add(id);
      } else if (!selItems.has(id)) {
        selItems = new Set([id]);
        selLinks.clear();
      }
      ix.mode = 'DRAG';
      ix.startPositions = new Map(diagram.items.filter(i => selItems.has(i.id)).map(i => [i.id, { x: i.x, y: i.y }]));
      render();
      renderInspector();
      e.preventDefault();
      return;
    }

    if (linkEl) {
      const id = linkEl.dataset.linkId;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (selLinks.has(id)) selLinks.delete(id); else selLinks.add(id);
      } else {
        selLinks = new Set([id]);
        selItems.clear();
      }
      ix.mode = null;
      render();
      renderInspector();
      return;
    }

    // empty canvas -> marquee
    if (!e.shiftKey) { selItems.clear(); selLinks.clear(); }
    ix.mode = 'MARQUEE';
    ix.marqueeStart = w;
    ix.marqueeBase = { items: new Set(selItems), links: new Set(selLinks) };
    marquee.setAttribute('x', w.x); marquee.setAttribute('y', w.y);
    marquee.setAttribute('width', 0); marquee.setAttribute('height', 0);
    marquee.classList.remove('hidden');
    render();
    renderInspector();
  }

  function onPointerMove(e) {
    if (!diagram || !ix.mode) return;
    const w = screenToWorld(e.clientX, e.clientY);
    if (ix.mode === 'PAN') {
      view.x = ix.startViewX + (e.clientX - ix.startX);
      view.y = ix.startViewY + (e.clientY - ix.startY);
      render();
      return;
    }
    if (ix.mode === 'DRAG') {
      const dx = (e.clientX - ix.startX) / view.scale;
      const dy = (e.clientY - ix.startY) / view.scale;
      if (!ix.moved && Math.hypot(dx, dy) < 2) return;
      if (!ix.moved) { pushUndo(); ix.moved = true; }
      const grid = workspace.showGrid ? 10 : 1;
      const single = ix.startPositions.size === 1;
      for (const [id, p] of ix.startPositions) {
        const it = diagram.items.find(i => i.id === id);
        if (!it) continue;
        let nx = Math.round((p.x + dx) / grid) * grid;
        let ny = Math.round((p.y + dy) / grid) * grid;
        if (single && !e.altKey) {
          // snap into line with connected shapes so lines come out straight
          const others = diagram.links.filter(l => l.from === id || l.to === id).map(l => diagram.items.find(i => i.id === (l.from === id ? l.to : l.from))).filter(Boolean);
          const off = centreOf({ ...it, x: nx, y: ny });
          const ox = off.x - nx, oy = off.y - ny;
          for (const o of others) {
            const oc = centreOf(o);
            if (Math.abs(oc.x - (nx + ox)) < 8) nx = oc.x - ox;
            if (Math.abs(oc.y - (ny + oy)) < 8) ny = oc.y - oy;
          }
        }
        it.x = nx; it.y = ny;
      }
      render();
      return;
    }
    if (ix.mode === 'CONNECT') {
      tempLine.setAttribute('x2', w.x); tempLine.setAttribute('y2', w.y);
      return;
    }
    if (ix.mode === 'MARQUEE') {
      const s = ix.marqueeStart;
      const x = Math.min(s.x, w.x), y = Math.min(s.y, w.y);
      const wd = Math.abs(w.x - s.x), ht = Math.abs(w.y - s.y);
      marquee.setAttribute('x', x); marquee.setAttribute('y', y);
      marquee.setAttribute('width', wd); marquee.setAttribute('height', ht);
      selItems = new Set(ix.marqueeBase.items);
      for (const it of diagram.items) {
        const b = boundsOf(it);
        if (b.minX >= x && b.maxX <= x + wd && b.minY >= y && b.maxY <= y + ht) selItems.add(it.id);
      }
      selLinks = new Set(ix.marqueeBase.links);
      for (const l of diagram.links) if (selItems.has(l.from) && selItems.has(l.to)) selLinks.add(l.id);
      render();
    }
  }

  function onPointerUp(e) {
    if (!diagram || !ix.mode) return;
    if (ix.mode === 'PAN') {
      svg.style.cursor = ix.spacePressed ? 'grab' : 'default';
      saveView();
    }
    if (ix.mode === 'DRAG' && ix.moved) persist();
    if (ix.mode === 'CONNECT') {
      tempLine.classList.add('hidden');
      const target = itemUnder(e.clientX, e.clientY);
      const from = diagram.items.find(i => i.id === ix.connectFrom);
      if (target && from && target.id !== from.id) {
        const exists = diagram.links.some(l => (l.from === from.id && l.to === target.id) || (l.from === target.id && l.to === from.id));
        if (!exists || e.altKey) {
          pushUndo();
          const link = { id: uid('l'), from: from.id, to: target.id, ...defaultLinkFor(from, target) };
          diagram.links.push(link);
          selLinks = new Set([link.id]);
          selItems.clear();
          commit(true);
        } else {
          toast('those two are already joined (alt-drag to add another line)');
        }
      }
    }
    if (ix.mode === 'MARQUEE') {
      marquee.classList.add('hidden');
      renderInspector();
    }
    ix.mode = null;
  }

  function onDblClick(e) {
    if (!diagram) return;
    const itemEl = e.target.closest('.db-item');
    if (itemEl) {
      selItems = new Set([itemEl.dataset.itemId]);
      selLinks.clear();
      render();
      renderInspector();
      focusLabel();
      return;
    }
    const linkEl = e.target.closest('.db-link');
    if (linkEl) {
      setTimeout(() => inspector.querySelector('input[data-lprop="card"]')?.focus(), 0);
      return;
    }
    const w = screenToWorld(e.clientX, e.clientY);
    ix.quickAddPos = w;
    const rect = svg.parentElement.getBoundingClientRect();
    quickMenu.style.left = `${e.clientX - rect.left}px`;
    quickMenu.style.top = `${e.clientY - rect.top}px`;
    quickMenu.classList.remove('hidden');
  }

  function onWheel(e) {
    if (!diagram) return;
    e.preventDefault();
    zoomAround(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
  }

  function zoomAround(factor, cx, cy) {
    const r = svg.getBoundingClientRect();
    const mx = cx - r.left, my = cy - r.top;
    const ns = Math.min(3, Math.max(0.25, view.scale * factor));
    const k = ns / view.scale;
    view.x = mx - (mx - view.x) * k;
    view.y = my - (my - view.y) * k;
    view.scale = ns;
    render();
    saveView();
  }

  function zoomCentre(factor) {
    const r = svg.getBoundingClientRect();
    zoomAround(factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  function saveView() {
    if (diagram) viewByDiagram.set(diagram.id, { ...view });
  }

  function diagramBounds(items = diagram.items) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      const b = boundsOf(it);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    return { minX, minY, maxX, maxY };
  }

  function fitView() {
    if (!diagram) return;
    if (!diagram.items.length) {
      view = { x: 0, y: 0, scale: 1 };
      render();
      return;
    }
    const b = diagramBounds();
    const r = svg.getBoundingClientRect();
    const pad = 80;
    const right = r.width > 900 ? 280 : 0; // keep clear of the inspector panel
    const w = Math.max(200, b.maxX - b.minX), h = Math.max(200, b.maxY - b.minY);
    view.scale = Math.min(1.4, Math.max(0.3, Math.min((r.width - right - pad * 2) / w, (r.height - pad * 2) / h)));
    view.x = Math.round((r.width - right - w * view.scale) / 2 - b.minX * view.scale);
    view.y = Math.round((r.height - h * view.scale) / 2 - b.minY * view.scale);
    render();
    saveView();
  }

  /***********************************************************************
   * KEYBOARD
   ***********************************************************************/
  function onKeyDown(e) {
    if (!diagram || !isActive()) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { ix.spacePressed = true; svg.style.cursor = 'grab'; e.preventDefault(); }
    if (e.key === 'Escape') {
      quickMenu.classList.add('hidden');
      tempLine.classList.add('hidden');
      ix.mode = null;
      if (document.body.classList.contains('screenshot-mode')) {
        toggleScreenshotMode(false);
      } else {
        selItems.clear(); selLinks.clear();
        render(); renderInspector();
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); }
    if (mod && e.key.toLowerCase() === 'c') { clipboard = copySelection(); }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteData(clipboard, 40); }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selItems = new Set(diagram.items.map(i => i.id));
      selLinks = new Set(diagram.links.map(l => l.id));
      render(); renderInspector();
    }
    if (!mod && selItems.size && e.key.startsWith('Arrow')) {
      e.preventDefault();
      pushUndo();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      diagram.items.forEach(i => { if (selItems.has(i.id)) { i.x += dx; i.y += dy; } });
      commit(false);
    }
    if (!mod && !e.altKey && selItems.size <= 1) {
      const k = e.key.toLowerCase();
      const quick = { e: 'entity', r: 'relationship', a: 'attribute', k: 'key', t: 'table' };
      if (quick[k] && !e.repeat) {
        e.preventDefault();
        if (k === 'a' || k === 'k') {
          const it = diagram.items.find(i => selItems.has(i.id));
          if (it && ['entity', 'relationship', 'attribute'].includes(it.type)) {
            inspector.querySelector(`button[data-act="${k === 'k' ? 'add-key' : 'add-attr'}"]`)?.click();
            return;
          }
        }
        addQuick(quick[k]);
      }
    }
  }

  function addQuick(type) {
    if (type === 'key') {
      addItem('attribute');
      const it = diagram.items[diagram.items.length - 1];
      it.key = true; it.label = 'id';
      commit(true);
      focusLabel();
      return;
    }
    addItem(type);
  }

  function onKeyUp(e) {
    if (e.code === 'Space') { ix.spacePressed = false; if (svg) svg.style.cursor = 'default'; }
  }

  /***********************************************************************
   * EXPORT
   ***********************************************************************/
  function exportPNG() {
    if (!diagram || !diagram.items.length) { toast('canvas is empty'); return; }
    const map = itemMap();
    const b = diagramBounds();
    // include link labels roughly
    const pad = 30;
    const minX = b.minX - pad, minY = b.minY - pad;
    const width = Math.ceil(b.maxX - b.minX + pad * 2), height = Math.ceil(b.maxY - b.minY + pad * 2);
    const out = mk('svg', { xmlns: NS, viewBox: `${minX} ${minY} ${width} ${height}`, width, height });
    out.appendChild(mk('rect', { x: minX, y: minY, width, height, fill: '#ffffff' }));
    for (const l of diagram.links) { const g = buildLinkGraphic(l, map, true); if (g) out.appendChild(g); }
    const order = [...diagram.items].sort((a, b2) => (a.type === 'text') - (b2.type === 'text'));
    for (const it of order) out.appendChild(buildItemGraphic(it, true));
    const str = new XMLSerializer().serializeToString(out);
    const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const scale = 2.5;
      const c = document.createElement('canvas');
      c.width = width * scale; c.height = height * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `${(diagram.name || 'diagram').replace(/\s+/g, '_').toLowerCase()}.png`;
      a.click();
      toast('exported high-resolution PNG');
    };
    img.src = url;
  }

  /***********************************************************************
   * MODE LIFECYCLE (called from app.js)
   ***********************************************************************/
  function isActive() {
    return !!diagram && document.body.classList.contains('db-mode');
  }

  function show(tab) {
    document.body.classList.add('db-mode');
    if (!tab.items) tab.items = [];
    if (!tab.links) tab.links = [];
    if (diagram !== tab) {
      if (diagram) saveView();
      diagram = tab;
      selItems.clear(); selLinks.clear();
      undoStack = []; redoStack = [];
      const v = viewByDiagram.get(tab.id);
      if (v) view = { ...v };
      else setTimeout(fitView, 0);
      renderInspector();
    }
    render();
  }

  function hide() {
    if (diagram) saveView();
    document.body.classList.remove('db-mode');
    diagram = null;
  }

  function clearSelection() {
    selItems.clear(); selLinks.clear();
    if (diagram) { render(); renderInspector(); }
  }

  function clearAll() {
    if (!diagram || !diagram.items.length) return;
    pushUndo();
    diagram.items = [];
    diagram.links = [];
    selItems.clear(); selLinks.clear();
    commit(true);
    toast('cleared canvas (ctrl+z to undo)');
  }

  function newDiagram(name) {
    return { id: 'db_' + Date.now(), kind: 'db', name, nodes: [], wires: [], items: [], links: [] };
  }

  function init() {
    svg = document.getElementById('db-svg');
    vp = document.getElementById('db-viewport');
    linksLayer = document.getElementById('db-links');
    itemsLayer = document.getElementById('db-items');
    tempLine = document.getElementById('db-temp-line');
    marquee = document.getElementById('db-marquee');
    inspector = document.getElementById('db-inspector');
    quickMenu = document.getElementById('db-quick-menu');
    toolbarEl = document.getElementById('db-toolbar');

    svg.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('dblclick', onDblClick);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    inspector.addEventListener('input', onInspectorInput);
    inspector.addEventListener('change', (e) => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') renderInspector(); });
    inspector.addEventListener('focusout', () => { inspectorUndoPushed = false; });
    inspector.addEventListener('click', onInspectorClick);
    inspector.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
      if (e.key === 'Escape') e.target.blur();
      e.stopPropagation();
    });

    // keep keyboard focus off the toolbar so the new shape's name field gets it
    toolbarEl.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()));
    quickMenu.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()));
    toolbarEl.querySelectorAll('[data-db-add]').forEach(btn => btn.addEventListener('click', () => addQuick(btn.dataset.dbAdd)));
    quickMenu.querySelectorAll('[data-db-quick]').forEach(btn => btn.addEventListener('click', () => {
      const t = btn.dataset.dbQuick;
      quickMenu.classList.add('hidden');
      if (t === 'key') { addItem('attribute', ix.quickAddPos); const it = diagram.items[diagram.items.length - 1]; it.key = true; it.label = 'id'; commit(true); focusLabel(); }
      else addItem(t, ix.quickAddPos);
    }));
    document.getElementById('db-btn-map').addEventListener('click', mapToRelational);
    const exSel = document.getElementById('db-examples');
    exSel.addEventListener('change', () => { if (exSel.value) loadExample(exSel.value); exSel.value = ''; });
  }

  return {
    init, show, hide, isActive, render, fitView, exportPNG, undo, redo,
    clearSelection, clearAll, zoomCentre, newDiagram, duplicateSelection,
    mapToRelational, loadExample, parseRich
  };
})();
