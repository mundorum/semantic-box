// Class encoding: colour + shape are redundant so the graph survives
// colour-blindness and greyscale printing. See design_handoff_semantic_box/README.md
// "The two-palette rule". These are the canvas palette's single source of truth.
const CLASSES = [
  { key: 'MicroRNA', label: 'MicroRNA', shape: 'diamond', color: '#3767cf' },
  { key: 'Messenger RNA', label: 'Messenger RNA', shape: 'circle', color: '#c33a63' },
  { key: 'Pathway', label: 'Pathway', shape: 'box', color: '#3f8c4a' },
];
const CLASS_MAP = {};
CLASSES.forEach(c => { CLASS_MAP[c.key] = c; });

const DECAY = {
  gentle: [1, 1, 0.75, 0.5],
  standard: [1, 1, 0.55, 0.28],
  steep: [1, 0.85, 0.35, 0.12],
};

// Stage-3 placeholder build-stack, ported at full fidelity from the reference
// prototype's LAYERS. Our real CSVs are flat tripartite snapshots with no such
// construction layers — this stands in until the real-data step decides
// whether layers become meaningful here (e.g. a confidence tier) or drop away.
const LAYERS = [
  { name: 'L0 · source', rule: 'Imported source relations — the ground truth this stack is built over.', delta: [{ label: 'imported', nodes: '1 204', edges: '4 880' }] },
  { name: 'L1 · co-occurrence', rule: 'Built over L0: pairs co-occurring at least 3 times become an undirected relation.', delta: [{ label: 'kept', nodes: '1 204', edges: '4 880' }, { label: 'added', nodes: '436', edges: '3 560' }, { label: 'dropped', nodes: '0', edges: '14' }] },
  { name: 'L2 · inferred', rule: 'Built over L1: inference rules add directed relations where a path of length 2 is supported.', delta: [{ label: 'kept', nodes: '1 640', edges: '8 440' }, { label: 'added', nodes: '262', edges: '3 462' }, { label: 'dropped', nodes: '0', edges: '0' }] },
  { name: 'L3 · clustered', rule: 'Built over L2: community detection groups nodes and promotes each cluster to a node.', delta: [{ label: 'kept', nodes: '1 902', edges: '11 902' }, { label: 'added', nodes: '282', edges: '1 118' }, { label: 'dropped', nodes: '0', edges: '212' }] },
];

// Neutral ink — edges never take a class hue; emphasis comes from stroke
// weight and hop-decay opacity only.
const CANVAS_INK = {
  edge: 'rgba(26,28,38,.62)',
  edgeRest: 'rgba(32,30,29,.34)',
  nodeHalo: '#ffffff',
  selectStroke: '#201e1d',
  labelInk: '#201e1d',
};

function seededRng(seed) {
  let s = seed * 7919 + 13;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Stage-2 placeholder: seeded synthetic tripartite graph on a random scatter,
// standing in for real CSV data + a proper layered layout (final step of
// this build). Edges only ever run MicroRNA -> Messenger RNA -> Pathway,
// matching the shape of the real data.
function generateMockGraph(seed) {
  const r = seededRng(seed);
  const counts = { MicroRNA: 16, 'Messenger RNA': 40, Pathway: 12 };
  // Weighted so L0 carries the bulk, echoing the reference build-stack's
  // shape (each layer adds progressively fewer nodes than it inherits).
  const pickLayer = () => {
    const p = r();
    return p < 0.55 ? 0 : p < 0.80 ? 1 : p < 0.92 ? 2 : 3;
  };
  const nodes = [];
  const byClass = { MicroRNA: [], 'Messenger RNA': [], Pathway: [] };
  Object.keys(counts).forEach(cls => {
    for (let i = 0; i < counts[cls]; i++) {
      const n = { id: cls.replace(/\s+/g, '').slice(0, 2).toLowerCase() + '-' + i, cls, x: r(), y: r(), layer: pickLayer() };
      nodes.push(n);
      byClass[cls].push(n);
    }
  });

  const edges = [];
  const seen = new Set();
  const addEdge = (a, b, rel) => {
    const k = a.id + '>' + b.id;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ s: a.id, t: b.id, rel, w: Math.round(r() * 95) / 100, layer: Math.max(a.layer, b.layer) });
  };
  byClass.MicroRNA.forEach(mi => {
    const k = 1 + Math.floor(r() * 4);
    for (let j = 0; j < k; j++) addEdge(mi, byClass['Messenger RNA'][Math.floor(r() * counts['Messenger RNA'])], 'regulates');
  });
  byClass['Messenger RNA'].forEach(mr => {
    const k = 1 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) addEdge(mr, byClass.Pathway[Math.floor(r() * counts.Pathway)], 'in_pathway');
  });
  return { nodes, edges };
}

// Derives the filtered view (class + layer ceiling + layer visibility),
// adjacency, degree and BFS hop-distance (from the selected node) for one
// graph model under the current UI state.
function computeView(model, state) {
  const onNode = n => state.cls[n.cls] && n.layer <= state.active && state.vis[n.layer];
  const nodes = model.nodes.filter(onNode);
  const live = {};
  nodes.forEach(n => { live[n.id] = n; });
  const edges = model.edges.filter(e => live[e.s] && live[e.t] && e.layer <= state.active);
  const out = {}, inn = {}, deg = {};
  edges.forEach(e => {
    (out[e.s] = out[e.s] || []).push(e);
    (inn[e.t] = inn[e.t] || []).push(e);
    deg[e.s] = (deg[e.s] || 0) + 1;
    deg[e.t] = (deg[e.t] || 0) + 1;
  });
  Object.keys(out).forEach(k => out[k].sort((a, b) => b.w - a.w));

  const sel = state.selected && live[state.selected] ? state.selected : null;
  const dist = {};
  if (sel) {
    dist[sel] = 0;
    let q = [sel];
    while (q.length) {
      const cur = q.shift();
      const d = dist[cur];
      if (d >= state.hop) continue;
      const nb = (out[cur] || []).map(e => e.t)
        .concat(state.dir === 'both' ? (inn[cur] || []).map(e => e.s) : []);
      nb.forEach(id => {
        if (dist[id] === undefined) { dist[id] = d + 1; q.push(id); }
      });
    }
  }

  return { model, nodes, live, edges, out, inn, deg, sel, dist };
}

const MAX_TREE_DEPTH = 4, MAX_TREE_ROWS = 160;

// DFS path tree rooted at rootId over outgoing edges only, cycle-guarded by
// the path set so a node can appear on several distinct paths (it's a path
// tree, not a node tree). treeState = { open: {pathKey: bool}, baseDepth }.
function computeTree(v, rootId, treeState) {
  const rows = [];
  let capped = false;
  const walk = (id, depth, path, key, rel) => {
    if (rows.length >= MAX_TREE_ROWS) { capped = true; return; }
    const kids = (v.out[id] || []).filter(e => !path[e.t]);
    const canExpand = depth < MAX_TREE_DEPTH && kids.length > 0;
    const openState = treeState.open[key];
    const isOpen = canExpand && (openState === undefined ? depth < treeState.baseDepth : openState);
    rows.push({ key, depth, id, rel, canExpand, isOpen, more: kids.length });
    if (!isOpen) return;
    kids.forEach(e => {
      const p = Object.assign({}, path);
      p[e.t] = 1;
      walk(e.t, depth + 1, p, key + '/' + e.t, e.rel);
    });
  };
  if (rootId && v.live[rootId]) walk(rootId, 0, { [rootId]: 1 }, rootId, null);
  return { rows, capped };
}
