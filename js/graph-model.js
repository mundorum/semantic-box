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

// Short display labels for the breast-cancer-subtype example datasets —
// the dataset key doubles as the examples/<key>_{nodes,edges}.csv prefix, so
// it can't just be shortened outright; this is copy only. Two snapshots ship
// by default (`basal-like`, `luminal-a`); more can be added via "manage graphs".
const DATASET_LABELS = {
  'basal-like': 'basal',
  'luminal-a': 'luminal-a',
};

// Turns an arbitrary display name (typed by the user when adding a graph)
// into a key-safe slug: lowercased, non-alphanumerics collapsed to single
// hyphens, leading/trailing hyphens trimmed. Falls back to 'graph' if
// nothing alphanumeric survives (e.g. a name made entirely of punctuation).
function slugify(str) {
  const s = String(str || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'graph';
}

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

// NSM classification states the comparison can mark:
//   'specific'  — this node is a high-p node for the metric in THIS dataset only.
//   'shared'    — it's also high-p in one other dataset; the CSV cell carries
//                 that dataset's display name and a Jaccard similarity of the
//                 two neighbourhoods. 'shared' is never selected directly —
//                 the UI splits it, by a user-set Jaccard cutoff, into:
//                   'conserved' — jaccard >= cutoff (wiring is similar in both)
//                   'rewired'   — jaccard <  cutoff (same node, different wiring)
// `info.other` is a dataset *display name* ('Luminal A'), so it's slugified
// before comparing against the dataset *key* ('luminal-a').
function nsmStateMatches(info, state, cutoff) {
  if (!info) return false;
  if (state === 'specific') return info.state === 'specific';
  if (info.state !== 'shared') return false;
  const j = info.jaccard == null ? 0 : info.jaccard;
  return state === 'conserved' ? j >= cutoff : j < cutoff;
}

// Builds the per-side highlight marks for one NSM metric+state: an "own"
// (strong) mark on the side whose classification actually matches, and — for
// the conserved/rewired (shared) states only — a fainter "echo" mark on the
// other side in the SAME colour, so the same node X can be spotted on both
// canvases. Nodes not present in a side (no matching id) simply get no mark there.
function computeNsmMarks(metricKey, state, cutoff, nodesA, nodesB, otherKeyA, otherKeyB) {
  const marksA = {}, marksB = {};
  const ownPass = (nodes, marks, color) => {
    nodes.forEach(n => {
      const info = n.nsm[metricKey];
      if (!nsmStateMatches(info, state, cutoff)) return;
      marks[n.id] = { state, strong: true, color };
    });
  };
  const echoPass = (nodes, otherKey, marksOther, color) => {
    if (state === 'specific') return; // nothing to echo — specific means absent elsewhere
    nodes.forEach(n => {
      const info = n.nsm[metricKey];
      if (!nsmStateMatches(info, state, cutoff)) return;
      if (!info.other || slugify(info.other) !== otherKey) return;
      if (!marksOther[n.id]) marksOther[n.id] = { state, strong: false, color };
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
  // `state.hidden` is the manual hidden-nodes map ({ [id]: true }) — nodes the
  // user removed with Del / the inspector's "hide node" pill. Absent = {}.
  // Edges to a hidden node fall away via the `live[e.s] && live[e.t]` checks.
  const hidden = state.hidden || {};

  // q-value filter: the q-value now lives on the Pathway node itself (it moved
  // off the Messenger RNA -> Pathway edges — see js/data-loader.js). A Pathway
  // survives only when its q-value is <= the slider threshold; the mRNA/miR
  // classes carry no q-value and are never touched by it. Edges to a filtered
  // Pathway fall away through the `live[e.s] && live[e.t]` checks, exactly like
  // edges to a hidden node.
  const qThreshold = state.qThreshold ?? Infinity;
  const qOK = n => !(n.cls === 'Pathway' && n.qvalue != null && !Number.isNaN(n.qvalue) && n.qvalue > qThreshold);

  const onNode = n => state.cls[n.cls] && n.layer <= state.active && state.vis[n.layer] && !hidden[n.id] && qOK(n);
  let nodes = model.nodes.filter(onNode);
  let live = {};
  nodes.forEach(n => { live[n.id] = n; });
  let edges = model.edges.filter(e => live[e.s] && live[e.t] && e.layer <= state.active);

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

  // "Terminal nodes" view toggle: drop every node with no outgoing edge in the
  // current filtered graph — the Pathway sinks, plus anything the class /
  // q-value / orphan filters left with only incoming edges. Deliberately a
  // SINGLE pass: iterating to a fixpoint would peel every path back through
  // its source (in a tripartite miR -> mRNA -> Pathway graph every path ends
  // at a sink) and collapse the graph to nothing.
  if (state.hideNoDownstream) {
    const hasOut = {};
    edges.forEach(e => { hasOut[e.s] = true; });
    nodes = nodes.filter(n => hasOut[n.id]);
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
      // 'down' follows outgoing edges only, 'up' follows incoming edges only
      // (upstream causes/regulators of the selection), 'both' follows either.
      const nb = state.dir === 'up'
        ? (inn[cur] || []).map(e => e.s)
        : state.dir === 'both'
          ? (out[cur] || []).map(e => e.t).concat((inn[cur] || []).map(e => e.s))
          : (out[cur] || []).map(e => e.t);
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
