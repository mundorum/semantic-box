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

// Neutral ink — edges never take a class hue; emphasis comes from stroke
// weight and hop-decay opacity only.
const CANVAS_INK = {
  edge: 'rgba(26,28,38,.62)',
  edgeRest: 'rgba(32,30,29,.34)',
  nodeHalo: '#ffffff',
  selectStroke: '#201e1d',
  labelInk: '#201e1d',
};

// NSM comparison: identity colour per canvas side (A = left, B = right;
// position-based, not tied to a dataset name). Reuses two hues from the
// design handoff's full seven-hue spectral set that our tripartite subset
// doesn't otherwise use, so this stays inside the sanctioned canvas palette
// rather than inventing a new ad hoc colour.
const NSM_IDENTITY = { A: '#8a4cc4', B: '#0d8794' }; // violet / teal

const NSM_METRICS = [
  { key: 'betweenness_centrality_descending', label: 'betweenness (desc)' },
  { key: 'closeness_centrality_descending', label: 'closeness (desc)' },
  { key: 'degree_centrality_descending', label: 'degree (desc)' },
  { key: 'redundancy_coefficient_descending', label: 'redundancy (desc)' },
  { key: 'redundancy_coefficient_ascending', label: 'redundancy (asc)' },
  { key: 'pathway_reach_descending', label: 'pathway reach (desc)' },
  { key: 'functional_impact_descending', label: 'functional impact (desc)' },
];

// Builds the per-side highlight marks for one NSM metric+state: an "own"
// (strong) mark on the side whose classification actually says
// specific/common/differential, and — for common/differential only — a
// fainter "echo" mark on the other side in the SAME colour, so the same
// node X can be spotted on both canvases. Nodes not present in a side (no
// matching id) simply get no mark there.
function computeNsmMarks(metricKey, state, nodesA, nodesB, otherKeyA, otherKeyB) {
  const marksA = {}, marksB = {};
  const ownPass = (nodes, marks, color) => {
    nodes.forEach(n => {
      const info = n.nsm[metricKey];
      if (!info || info.state !== state) return;
      marks[n.id] = { state: info.state, strong: true, color };
    });
  };
  const echoPass = (nodes, otherKey, marksOther, color) => {
    if (state === 'specific') return; // nothing to echo — specific means absent elsewhere
    nodes.forEach(n => {
      const info = n.nsm[metricKey];
      if (!info || info.state !== state) return;
      if (info.other !== otherKey) return;
      if (!marksOther[n.id]) marksOther[n.id] = { state: info.state, strong: false, color };
    });
  };
  ownPass(nodesA, marksA, NSM_IDENTITY.A);
  ownPass(nodesB, marksB, NSM_IDENTITY.B);
  echoPass(nodesA, otherKeyA, marksB, NSM_IDENTITY.A);
  echoPass(nodesB, otherKeyB, marksA, NSM_IDENTITY.B);
  return { A: marksA, B: marksB };
}

// Derives the filtered view (class + layer ceiling + layer visibility),
// adjacency, degree and BFS hop-distance (from the selected node) for one
// graph model under the current UI state.
function computeView(model, state) {
  const onNode = n => state.cls[n.cls] && n.layer <= state.active && state.vis[n.layer];
  let nodes = model.nodes.filter(onNode);
  let live = {};
  nodes.forEach(n => { live[n.id] = n; });
  let edges = model.edges.filter(e => live[e.s] && live[e.t] && e.layer <= state.active);

  // q-value filter: a Messenger RNA -> Pathway edge survives only when its
  // q-value is >= the slider threshold. Edges with no q-value (MicroRNA ->
  // Messenger RNA) are never affected by this filter.
  const qThreshold = state.qThreshold ?? -Infinity;
  edges = edges.filter(e => e.qvalue === null || e.qvalue === undefined || e.qvalue >= qThreshold);

  // A Pathway with no surviving edge is hidden entirely — not just dimmed.
  const pathwayHasEdge = {};
  edges.forEach(e => {
    if (live[e.s] && live[e.s].cls === 'Pathway') pathwayHasEdge[e.s] = true;
    if (live[e.t] && live[e.t].cls === 'Pathway') pathwayHasEdge[e.t] = true;
  });
  nodes = nodes.filter(n => n.cls !== 'Pathway' || pathwayHasEdge[n.id]);
  live = {};
  nodes.forEach(n => { live[n.id] = n; });
  edges = edges.filter(e => live[e.s] && live[e.t]);

  // Messenger RNAs that lost every Pathway connection to the q-value filter
  // ("orphaned") can optionally be hidden too, independent of whether they
  // still carry MicroRNA edges — see the "show/hide orphaned mRNA" toggle.
  if (state.hideOrphanMrna) {
    const mrnaHasPathwayEdge = {};
    edges.forEach(e => {
      const a = live[e.s], b = live[e.t];
      if (!a || !b) return;
      if (a.cls === 'Messenger RNA' && b.cls === 'Pathway') mrnaHasPathwayEdge[a.id] = true;
      if (b.cls === 'Messenger RNA' && a.cls === 'Pathway') mrnaHasPathwayEdge[b.id] = true;
    });
    nodes = nodes.filter(n => n.cls !== 'Messenger RNA' || mrnaHasPathwayEdge[n.id]);
    live = {};
    nodes.forEach(n => { live[n.id] = n; });
    edges = edges.filter(e => live[e.s] && live[e.t]);
  }

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
