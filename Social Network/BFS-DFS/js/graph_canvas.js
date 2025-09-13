// graph_canvas.js — stable final (with visited coloring, DFS, and reset/restore edges)

// ---------- Data (initial edges are canonical) ----------
const NODES = Array.from({ length: 22 }, (_, i) => i + 1);
const EDGES = [
  [1,2],[1,3],[1,4],[1,5],[1,6],[1,7],[1,8],[1,9],
  [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],
  [10,3],[10,4],[10,5],
  [6,11],[11,10],[10,11],[11,12],
  [7,13],[8,13],
  [13,14],[14,15],[15,16],[16,17],
  [17,18],[18,19],[18,21],
  [22,17],[17,20],
  [10,15],
  [19,22]
];

// keep a deep copy of initial edge list for reset
const INITIAL_EDGES = EDGES.map(e => [e[0], e[1]]);

// ---------- State ----------
let adjacency = new Map();
let reverseAdj = new Map();
let positions = new Map();
let selected = [];
let visitedGlobal = new Set(); // persistent visited nodes (for both BFS and DFS)
let currentBfsLevel = 0;
let activeLayerSet = null;
let lastTraversal = null; // 'bfs' or 'dfs' for info (optional)

// ---------- DOM ----------
const canvas = document.getElementById('graphCanvas');
const container = document.getElementById('canvasContainer');
const tooltip = document.getElementById('tooltip');
const infoEls = {
  nodesTotal: document.getElementById('nodesTotal'),
  componentsCount: document.getElementById('componentsCount'),
  visitedCount: document.getElementById('visitedCount'),
  currentLevel: document.getElementById('currentLevel'),
  selectedList: document.getElementById('selectedList')
};
const ctx = canvas.getContext('2d', { alpha: true });

// curve
const CURVATURE_SCALE = 0.45;

// ---------- Colors ----------
const css = getComputedStyle(document.documentElement);
const COLORS = {
  nodeDefault: css.getPropertyValue('--yellow')?.trim() || '#ffd358',
  nodeVisited: '#43aa8b', // visited persistent color
  nodeBfs: css.getPropertyValue('--bfs-red')?.trim() || '#e63946',
  edge: css.getPropertyValue('--edge')?.trim() || '#2b9fe9',
  arrowFill: css.getPropertyValue('--arrow-fill')?.trim() || 'rgba(255,211,88,0.92)',
  arrowStroke: css.getPropertyValue('--arrow-stroke')?.trim() || 'rgba(1,30,40,0.95)',
  blue: css.getPropertyValue('--blue')?.trim() || '#3bacf7',
  accent: css.getPropertyValue('--accent')?.trim() || '#bfefff'
};

// ---------- Canvas resize ----------
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = container.getBoundingClientRect();
  const cssW = Math.max(480, rect.width);
  const cssH = Math.max(360, rect.height);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------- View transform ----------
let view = { tx: 0, ty: 0, scale: 1 };
function worldToScreen(wx, wy) { return { x: view.tx + view.scale * wx, y: view.ty + view.scale * wy }; }
function screenToWorld(sx, sy) { return { x: (sx - view.tx) / view.scale, y: (sy - view.ty) / view.scale }; }

// ---------- Adjacency builders ----------
function initAdjMapsFromList(list) {
  adjacency = new Map();
  for (const n of NODES) adjacency.set(n, new Set());
  for (const [u, v] of list) {
    if (!adjacency.has(u)) adjacency.set(u, new Set());
    adjacency.get(u).add(v);
  }
}
function buildReverseAdj() {
  reverseAdj = new Map();
  for (const n of NODES) reverseAdj.set(n, new Set());
  for (const [u, neigh] of adjacency.entries()) {
    for (const v of neigh) {
      if (!reverseAdj.has(v)) reverseAdj.set(v, new Set());
      reverseAdj.get(v).add(u);
    }
  }
}
// initialize adjacency from initial edges
initAdjMapsFromList(INITIAL_EDGES);
buildReverseAdj();

// ---------- Descendants helper ----------
function getDescendants(roots = []) {
  const out = new Set();
  const q = [...roots];
  while (q.length) {
    const u = q.shift();
    for (const v of (adjacency.get(u) || [])) {
      if (!out.has(v)) { out.add(v); q.push(v); }
    }
  }
  return out;
}

// ---------- Layout ----------
function bfs_levels_from_root(root = 1) {
  const levels = new Map();
  if (!NODES.includes(root)) return levels;
  const visited = new Set();
  const q = [root];
  levels.set(root, 0); visited.add(root);
  while (q.length) {
    const u = q.shift();
    const lvl = levels.get(u);
    for (const v of adjacency.get(u) || []) {
      if (!visited.has(v)) { visited.add(v); levels.set(v, lvl + 1); q.push(v); }
    }
  }
  // disconnected nodes placed after
  let nextLvl = (levels.size ? Math.max(...levels.values()) + 1 : 1);
  for (const n of NODES) if (!levels.has(n)) levels.set(n, nextLvl++);
  return levels;
}

function computeLayout() {
  positions = new Map();
  const levels = bfs_levels_from_root(1);
  const buckets = new Map();
  for (const [n, l] of levels.entries()) {
    if (!buckets.has(l)) buckets.set(l, []);
    buckets.get(l).push(n);
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);

  const xGap = 280;
  const yGap = 140;
  const specialRoots = [18, 20];
  const specialDesc = getDescendants(specialRoots);
  specialRoots.forEach(r => specialDesc.add(r));

  for (const lvl of keys) {
    const nodes = buckets.get(lvl).slice().sort((a, b) => a - b);
    const centerIdx = (nodes.length - 1) / 2;
    let x = -centerIdx * xGap;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      let extraShift = 0;
      if (specialDesc.has(node)) {
        const offsetFromCenter = i - centerIdx;
        extraShift = Math.sign(offsetFromCenter || 1) * Math.abs(offsetFromCenter) * xGap * 0.28;
      }
      positions.set(node, [x + extraShift, lvl * yGap]);
      x += xGap;
    }
  }

  // fallback
  const maxLvl = keys.length ? Math.max(...keys) : 0;
  for (const n of NODES) if (!positions.has(n)) positions.set(n, [0, (maxLvl + 1) * yGap + 10]);

  fitWorldToScreen();
}

// ---------- Fit ----------
function fitWorldToScreen() {
  const coords = Array.from(positions.values());
  if (!coords.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const nodeR = 20, margin = 80;
  minX -= nodeR + margin; minY -= nodeR + margin;
  maxX += nodeR + margin; maxY += nodeR + margin;
  const worldW = Math.max(720, maxX - minX), worldH = Math.max(520, maxY - minY);
  const rect = container.getBoundingClientRect();
  const cw = Math.max(600, rect.width), ch = Math.max(420, rect.height);
  let scale = Math.min(cw / worldW, ch / worldH) * 0.98;
  scale *= 1.02;
  view.scale = scale;
  const centerWorldX = (minX + maxX) / 2, centerWorldY = (minY + maxY) / 2;
  view.tx = cw / 2 - view.scale * centerWorldX;
  view.ty = ch / 2 - view.scale * centerWorldY;
}

// ---------- Draw helpers ----------
function clamp(min, max, v) { return Math.max(min, Math.min(max, v)); }

function quadPointAndTangent(x0, y0, cx, cy, x2, y2, t) {
  const mt = 1 - t;
  const bx = mt * mt * x0 + 2 * mt * t * cx + t * t * x2;
  const by = mt * mt * y0 + 2 * mt * t * cy + t * t * y2;
  const dx = 2 * mt * (cx - x0) + 2 * t * (x2 - cx);
  const dy = 2 * mt * (cy - y0) + 2 * t * (y2 - cy);
  return { bx, by, dx, dy };
}

function drawArrowOnQuad(x0, y0, cx, cy, x2, y2, t, size, fillColor, strokeColor, flip = false) {
  const { bx, by, dx, dy } = quadPointAndTangent(x0, y0, cx, cy, x2, y2, t);
  let ux = dx, uy = dy;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  if (flip) { ux = -ux; uy = -uy; }
  const ox = -uy, oy = ux;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - ux * size + ox * (size * 0.45), by - uy * size + oy * (size * 0.45));
  ctx.lineTo(bx - ux * size - ox * (size * 0.45), by - uy * size - oy * (size * 0.45));
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = Math.max(1.6, Math.round(1.8 * view.scale));
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();
}

function drawArrowOnLine(x0, y0, x1, y1, size, fillColor, strokeColor, flip = false) {
  const dx = x1 - x0, dy = y1 - y0;
  let ux = dx, uy = dy;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  if (flip) { ux = -ux; uy = -uy; }
  const bx = x1, by = y1;
  const ox = -uy, oy = ux;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - ux * size + ox * (size * 0.45), by - uy * size + oy * (size * 0.45));
  ctx.lineTo(bx - ux * size - ox * (size * 0.45), by - uy * size - oy * (size * 0.45));
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = Math.max(1.6, Math.round(1.8 * view.scale));
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();
}

// ---------- Edge geometry ----------
function computeEdgeEndpoints(p1, p2, nodeRadius) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const verticalDominant = ady >= adx * 1.15;
  const horizontalDominant = adx >= ady * 1.15;

  if (verticalDominant) {
    const sY = p1.y + Math.sign(dy) * nodeRadius;
    const eY = p2.y - Math.sign(dy) * nodeRadius;
    return { sx: p1.x, sy: sY, ex: p2.x, ey: eY };
  }

  if (horizontalDominant) {
    const sX = p1.x + Math.sign(dx) * nodeRadius;
    const eX = p2.x - Math.sign(dx) * nodeRadius;
    return { sx: sX, sy: p1.y, ex: eX, ey: p2.y };
  }

  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  const sx = p1.x + ux * nodeRadius;
  const sy = p1.y + uy * nodeRadius;
  const ex = p2.x - ux * nodeRadius;
  const ey = p2.y - uy * nodeRadius;
  return { sx, sy, ex, ey };
}

// ---------- Edge rendering ----------
function getEdgesList() {
  const list = [];
  for (const [u, neigh] of adjacency.entries()) for (const v of neigh) list.push([u, v]);
  return list;
}

function buildEdgePairs() {
  const map = new Map();
  for (const [u, v] of getEdgesList()) {
    const a = Math.min(u, v), b = Math.max(u, v);
    const key = `${a}_${b}`;
    if (!map.has(key)) map.set(key, { a, b, hasAB: false, hasBA: false });
    const rec = map.get(key);
    if (u === a && v === b) rec.hasAB = true;
    if (u === b && v === a) rec.hasBA = true;
  }
  return Array.from(map.values()).map(r => {
    if (r.hasAB && r.hasBA) return { type: 'bi', a: r.a, b: r.b };
    if (r.hasAB) return { type: 'uni', u: r.a, v: r.b };
    return { type: 'uni', u: r.b, v: r.a };
  });
}

function drawEdges() {
  const pairs = buildEdgePairs();
  for (const p of pairs) {
    if (p.type === 'uni') drawSingleDirectedEdge(p.u, p.v);
    else drawSingleBidirectionalEdge(p.a, p.b);
  }
}

function drawSingleDirectedEdge(u, v) {
  const posU = positions.get(u), posV = positions.get(v);
  if (!posU || !posV) return;
  const p1 = worldToScreen(posU[0], posU[1]), p2 = worldToScreen(posV[0], posV[1]);
  const nodeR = Math.max(14, 22 * view.scale);

  const pts = computeEdgeEndpoints(p1, p2, nodeR);
  const sx = pts.sx, sy = pts.sy, ex = pts.ex, ey = pts.ey;

  const relatedToOne = (u === 1 || v === 1);
  if (relatedToOne) {
    // straight line
    ctx.beginPath();
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = Math.max(1.2, 2 * (view.scale * 0.25));
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    drawArrowOnLine(sx, sy, ex, ey, Math.max(10, 9 * view.scale), COLORS.arrowFill, COLORS.arrowStroke, false);
    return;
  }

  // curved
  const mx = (sx + ex) / 2, my = (sy + ey) / 2;
  const pdx = ex - sx, pdy = ey - sy;
  const pdist = Math.hypot(pdx, pdy) || 1;
  const perX = -pdy / pdist, perY = pdx / pdist;
  const base = Math.min(160, pdist * 0.08);
  const curvatureMag = Math.max(12, base + (Math.abs(p2.y - p1.y) / (Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1)) * 6);
  const sign = ((u + v) % 2 === 0) ? 1 : -1;
  const cx = mx + perX * (curvatureMag * sign);
  const cy = my + perY * (curvatureMag * sign);


  ctx.beginPath();
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = Math.max(1.0, 1.6 * (view.scale * 0.25));
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();

  drawArrowOnQuad(sx, sy, cx, cy, ex, ey, 0.88, Math.max(9, 8.5 * view.scale), COLORS.arrowFill, COLORS.arrowStroke, false);
}

function drawSingleBidirectionalEdge(a, b) {
  const posA = positions.get(a), posB = positions.get(b);
  if (!posA || !posB) return;
  const p1 = worldToScreen(posA[0], posA[1]), p2 = worldToScreen(posB[0], posB[1]);
  const nodeR = Math.max(14, 22 * view.scale);

  const pts = computeEdgeEndpoints(p1, p2, nodeR);
  const sx = pts.sx, sy = pts.sy, ex = pts.ex, ey = pts.ey;

  const relatedToOne = (a === 1 || b === 1);
  if (relatedToOne) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = Math.max(1.2, 2 * (view.scale * 0.25));
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    drawArrowOnLine(sx, sy, ex, ey, Math.max(10, 9 * view.scale), COLORS.arrowFill, COLORS.arrowStroke, false);
    drawArrowOnLine(ex, ey, sx, sy, Math.max(10, 9 * view.scale), COLORS.arrowFill, COLORS.arrowStroke, false);
    return;
  }

  const mx = (sx + ex) / 2, my = (sy + ey) / 2;
  const pdx = ex - sx, pdy = ey - sy;
  const pdist = Math.hypot(pdx, pdy) || 1;
  const perX = -pdy / pdist, perY = pdx / pdist;
  const base = Math.min(160, pdist * 0.08);
  const curvatureMag = Math.max(16, base + (Math.abs(a - b) % 5) * 3);
  const sign = (a > b) ? 1 : -1;
  const cx = mx + perX * (curvatureMag * sign);
  const cy = my + perY * (curvatureMag * sign);

  ctx.beginPath();
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = Math.max(1.0, 1.6 * (view.scale * 0.25));
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();

  drawArrowOnQuad(sx, sy, cx, cy, ex, ey, 0.78, Math.max(9, 8.5 * view.scale), COLORS.arrowFill, COLORS.arrowStroke, false);
  drawArrowOnQuad(sx, sy, cx, cy, ex, ey, 0.22, Math.max(9, 8.5 * view.scale), COLORS.arrowFill, COLORS.arrowStroke, true);
}

// ---------- Nodes rendering ----------
function drawNodes() {
  for (const n of NODES) {
    const pos = positions.get(n);
    if (!pos) continue;
    const p = worldToScreen(pos[0], pos[1]);
    const r = clamp(14, 36, 22 * view.scale);

    // priority: selected (blue) > activeLayer (bfs red) > visited (visitedColor) > default (yellow)
    let fill = COLORS.nodeDefault;
    if (selected.includes(n)) fill = COLORS.blue;
    else if (activeLayerSet && activeLayerSet.has(n)) fill = COLORS.nodeBfs;
    else if (visitedGlobal.has(n)) fill = COLORS.nodeVisited;

    ctx.save();
    ctx.beginPath();
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = fill;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#031826';
    const fontSize = Math.max(11, Math.round(12 * view.scale));
    ctx.font = `bold ${fontSize}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), p.x, p.y);
  }
}

// ---------- Interaction helpers ----------
function findNearestNodeScreen(sx, sy) {
  let best = null, bestD = Infinity;
  for (const [n, pos] of positions.entries()) {
    const p = worldToScreen(pos[0], pos[1]);
    const d = Math.hypot(sx - p.x, sy - p.y);
    if (d < bestD && d <= Math.max(20, 34 * view.scale)) { bestD = d; best = n; }
  }
  return best;
}

let hoverNode = null;
function handlePointerMove(ev) {
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const n = findNearestNodeScreen(sx, sy);
  if (n !== hoverNode) {
    hoverNode = n;
    if (hoverNode) showTooltipForNode(hoverNode, sx, sy);
    else hideTooltip();
  } else if (hoverNode) updateTooltipPosition(sx, sy);
    // cursor feedback:
  if (isDragging) {
    canvas.style.cursor = 'grabbing';
  } else if (hoverNode) {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'grab';
  }

}

function showTooltipForNode(n, sx, sy) {
  tooltip.style.display = 'block';
  tooltip.textContent = `نود ${n} — خروجی: ${adjacency.get(n).size} — ورودی: ${reverseAdj.get(n) ? reverseAdj.get(n).size : 0}`;
  updateTooltipPosition(sx, sy);
}
function updateTooltipPosition(sx, sy) {
  const containerRect = container.getBoundingClientRect();
  tooltip.style.left = (containerRect.left + sx) + 'px';
  tooltip.style.top = (containerRect.top + sy - 28) + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

function handlePointerDown(ev) {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const node = findNearestNodeScreen(sx, sy);

  if (ev.button === 1) { if (node) startBfsLayered(node); }
  else if (ev.button === 2) { if (node) { toggleSelectNode(node); renderOnce(); updateInfoPanel(); } }
  else if (ev.button === 0) { if (node) { if (ev.shiftKey) toggleSelectNode(node); else selected = [node]; renderOnce(); updateInfoPanel(); } }
}
function toggleSelectNode(n) { const idx = selected.indexOf(n); if (idx === -1) selected.push(n); else selected.splice(idx, 1); }

canvas.addEventListener('contextmenu', ev => ev.preventDefault());
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerdown', handlePointerDown);

// ---------- Pan & Zoom ----------
let isDragging = false, dragStart = null;
canvas.addEventListener('mousedown', ev => { if (ev.button === 0) { isDragging = true; dragStart = { x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty }; canvas.style.cursor = 'grabbing'; } });
window.addEventListener('mousemove', ev => { if (isDragging && dragStart) { const dx = ev.clientX - dragStart.x, dy = ev.clientY - dragStart.y; view.tx = dragStart.tx + dx; view.ty = dragStart.ty + dy; renderOnce(); } });
window.addEventListener('mouseup', () => { isDragging = false; dragStart = null; canvas.style.cursor = 'grab'; });

canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const worldBefore = screenToWorld(mx, my);
  const factor = Math.exp(-ev.deltaY * 0.0011);
  view.scale = clamp(0.25, 4, view.scale * factor);
  view.tx = mx - view.scale * worldBefore.x; view.ty = my - view.scale * worldBefore.y;
  renderOnce();
}, { passive: false });

// ---------- Touch & Long-press ----------
let ongoingTouches = [];
canvas.addEventListener('touchstart', ev => {
  if (ev.touches.length === 1) {
    const t = ev.touches[0];
    ongoingTouches = [{ id: t.identifier, x: t.clientX, y: t.clientY }];
    startLongPressDetection(t.clientX, t.clientY);
  } else if (ev.touches.length === 2) {
    stopLongPressDetection();
    ongoingTouches = Array.from(ev.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  }
}, { passive: true });

canvas.addEventListener('touchmove', ev => {
  if (ev.touches.length === 1 && ongoingTouches.length === 1) {
    const t = ev.touches[0], prev = ongoingTouches[0];
    const dx = t.clientX - prev.x, dy = t.clientY - prev.y;
    view.tx += dx; view.ty += dy;
    ongoingTouches[0].x = t.clientX; ongoingTouches[0].y = t.clientY;
    renderOnce();
  } else if (ev.touches.length === 2) {
    const t0 = ev.touches[0], t1 = ev.touches[1];
    const p0 = ongoingTouches.find(o => o.id === t0.identifier), p1 = ongoingTouches.find(o => o.id === t1.identifier);
    if (p0 && p1) {
      const prevDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const curDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || prevDist;
      const factor = curDist / prevDist || 1;
      const rect = canvas.getBoundingClientRect();
      const cx = (t0.clientX + t1.clientX) / 2 - rect.left, cy = (t0.clientY + t1.clientY) / 2 - rect.top;
      const worldCenter = screenToWorld(cx, cy);
      view.scale = clamp(0.25, 4, view.scale * factor);
      view.tx = cx - view.scale * worldCenter.x; view.ty = cy - view.scale * worldCenter.y;
      ongoingTouches = Array.from(ev.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
      renderOnce();
    } else ongoingTouches = Array.from(ev.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  }
}, { passive: true });

canvas.addEventListener('touchend', () => { stopLongPressDetection(); ongoingTouches = []; }, { passive: true });

let longPressTimer = null;
function startLongPressDetection(clientX, clientY) {
  longPressTimer = setTimeout(() => {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const n = findNearestNodeScreen(sx, sy);
    if (n) startBfsLayered(n);
  }, 700);
}
function stopLongPressDetection() { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; }

// ---------- Traversals ----------
// BFS: layer-by-layer, active layer red, then nodes become visited (persistent)
async function startBfsLayered(start) {
  lastTraversal = 'bfs';
  const visited = new Set();
  const queue = [start];
  let level = 0;
  while (queue.length) {
    const layer = Array.from(queue.filter(u => !visited.has(u)));
    if (!layer.length) break;
    queue.length = 0;
    layer.forEach(u => visited.add(u));
    currentBfsLevel = level + 1;

    // mark visitedGlobal (so visited color will be shown after layer)
    layer.forEach(u => visitedGlobal.add(u));
    activeLayerSet = new Set(layer);
    updateInfoPanel();
    renderOnce();

    await new Promise(res => setTimeout(res, 900)); // pause to show layer

    activeLayerSet = null;
    renderOnce();
    updateInfoPanel();

    for (const u of layer) {
      for (const v of adjacency.get(u) || []) {
        if (!visited.has(v)) queue.push(v);
      }
    }
    level++;
  }
  currentBfsLevel = 0;
  updateInfoPanel();
}

// DFS: depth-first, highlight current node briefly, mark visitedGlobal persistently
async function startDfs(start) {
  lastTraversal = 'dfs';
  const visited = new Set();
  const stack = [start];
  while (stack.length) {
    const u = stack.pop();
    if (visited.has(u)) continue;
    visited.add(u);
    currentBfsLevel++; // use as step counter for display (not a BFS level)
    // mark visited persistent
    visitedGlobal.add(u);
    // highlight the current node briefly
    activeLayerSet = new Set([u]);
    updateInfoPanel();
    renderOnce();
    await new Promise(res => setTimeout(res, 650));
    activeLayerSet = null;
    renderOnce();
    updateInfoPanel();
    // push neighbors in reverse order to keep natural order
    const neigh = Array.from(adjacency.get(u) || []).slice().reverse();
    for (const v of neigh) {
      if (!visited.has(v)) stack.push(v);
    }
  }
  currentBfsLevel = 0;
  updateInfoPanel();
}

// ---------- Keyboard & delete-edge (preserve state) ----------
window.addEventListener('keydown', ev => {
  const k = (ev.key || '').toLowerCase();
  if (k === 'enter' && selected.length === 2) {
    const [u, v] = selected;
    if (adjacency.get(u) && adjacency.get(u).has(v)) {
      adjacency.get(u).delete(v);
      if (reverseAdj.has(v)) reverseAdj.get(v).delete(u);
    }
    // DO NOT recompute layout or reset traversal state.
    selected = [];
    renderOnce();
    updateInfoPanel();
  } else if (k === 'c') {
    // clear visited and traversal state (but do not restore deleted edges)
    visitedGlobal.clear(); currentBfsLevel = 0; activeLayerSet = null; renderOnce(); updateInfoPanel();
  } else if (k === 'a') {
    if (selected.length > 0) startBfsLayered(selected[0]);
  }
});

// ---------- Info panel ----------
function countWeakComponents() {
  const seen = new Set(); let cnt = 0;
  function nbrs(n) { const s = new Set(); for (const v of (adjacency.get(n) || [])) s.add(v); for (const v of (reverseAdj.get(n) || [])) s.add(v); return s; }
  for (const n of NODES) {
    if (seen.has(n)) continue;
    cnt++; const stack = [n];
    while (stack.length) {
      const u = stack.pop();
      if (seen.has(u)) continue; seen.add(u);
      for (const w of nbrs(u)) if (!seen.has(w)) stack.push(w);
    }
  }
  return cnt;
}
function updateInfoPanel() {
  infoEls.nodesTotal.textContent = NODES.length;
  infoEls.componentsCount.textContent = countWeakComponents();
  infoEls.visitedCount.textContent = visitedGlobal.size;
  infoEls.currentLevel.textContent = currentBfsLevel;
  infoEls.selectedList.textContent = selected.length ? selected.join(' • ') : 'هیچ‌کدام';
}

// ---------- Modal & UI bindings (including reset/restore) ----------
function bindModalAndControls() {
  const modalBackdrop = document.getElementById('modalBackdrop');
  document.getElementById('btnHelp').addEventListener('click', () => { modalBackdrop.classList.add('open'); modalBackdrop.setAttribute('aria-hidden', 'false'); });
  document.getElementById('closeModal').addEventListener('click', () => { modalBackdrop.classList.remove('open'); modalBackdrop.setAttribute('aria-hidden', 'true'); });
  document.getElementById('modalGotIt').addEventListener('click', () => { modalBackdrop.classList.remove('open'); modalBackdrop.setAttribute('aria-hidden', 'true'); });
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) { modalBackdrop.classList.remove('open'); modalBackdrop.setAttribute('aria-hidden', 'true'); } });

  document.getElementById('btnClear').addEventListener('click', () => {
    // clear traversal state and selections, but do not restore deleted edges
    selected = []; visitedGlobal.clear(); currentBfsLevel = 0; activeLayerSet = null; renderOnce(); updateInfoPanel();
  });

  document.getElementById('btnBfsSel').addEventListener('click', () => {
    if (selected.length > 0) startBfsLayered(selected[0]);
    else alert('ابتدا یک نود انتخاب کنید.');
  });

  document.getElementById('btnDfsSel').addEventListener('click', () => {
    if (selected.length > 0) startDfs(selected[0]);
    else alert('ابتدا یک نود انتخاب کنید.');
  });

  document.getElementById('btnRedraw').addEventListener('click', () => {
    // Restore initial edges and reset state fully (per user request)
    initAdjMapsFromList(INITIAL_EDGES);
    buildReverseAdj();
    selected = [];
    visitedGlobal.clear();
    currentBfsLevel = 0;
    activeLayerSet = null;
    lastTraversal = null;
    computeLayout();
    renderOnce();
    updateInfoPanel();
  });
}

// ---------- Render pipeline ----------
function drawBackground(rect) {
  const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
  g.addColorStop(0, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(2,8,18,0.03)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, rect.width, rect.height);
}

function renderOnce() {
  const rect = container.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawBackground(rect);
  drawEdges();
  drawNodes();
}

// ---------- Init ----------
function init() {
  computeLayout();
  resizeCanvas();
  bindModalAndControls();
  updateInfoPanel();
  renderOnce();

  window.addEventListener('resize', () => { resizeCanvas(); fitWorldToScreen(); renderOnce(); });
  window.addEventListener('pointermove', handlePointerMove);
  canvas.setAttribute('tabindex', '0');
}
init();

// expose debug
window._graph = { adjacency, positions, renderOnce, startBfsLayered: (n) => startBfsLayered(n), startDfs: (n) => startDfs(n), selected, computeLayout };
