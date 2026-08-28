// Loads one graph from examples/<prefix>_nodes.csv + examples/<prefix>_edges.csv.
// Nodes: id, label, type (type is MicroRNA / Messenger RNA / Pathway — matches
// CLASSES keys exactly, no relabeling needed). Edges: source, target, plus
// either `correlation` (MicroRNA -> Messenger RNA) or `qvalue` (Messenger RNA
// -> Pathway); whichever is present distinguishes the edge kind.
//
// Every node/edge gets layer: 0 — the real data is a flat tripartite snapshot,
// not a build-stack, so the mock 4-layer rail (stage 3) collapses to a single
// real "loaded" layer once this is wired in (see js/app.js layersMeta).
async function fetchCSV(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('failed to fetch ' + path + ': ' + res.status);
  return parseCSV(await res.text());
}

// The *_descending / *_ascending columns hold Node-Specificity-by-Metric
// (NSM) results as Python-repr'd list literals: `[]` (this node isn't a
// high-p node for this metric — the tripartite metrics are exclusively
// miR-centric, so Messenger RNA/Pathway rows are always `[]`), `[['specific']]`,
// or `[['common'|'differential', otherDatasetKey, jaccard]]`. Single quotes
// make it Python, not JSON, but the values themselves never contain quotes
// or commas, so a blind '->" swap is safe here.
const NSM_COLUMNS = [
  'betweenness_centrality_descending',
  'closeness_centrality_descending',
  'degree_centrality_descending',
  'redundancy_coefficient_descending',
  'redundancy_coefficient_ascending',
  'pathway_reach_descending',
  'functional_impact_descending',
];

function parseNsmCell(raw) {
  const s = (raw || '').trim();
  if (!s || s === '[]') return null;
  let parsed;
  try {
    parsed = JSON.parse(s.replace(/'/g, '"'));
  } catch (e) {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.length) return null;
  const inner = parsed[0];
  return { state: inner[0], other: inner[1] || null, jaccard: inner[2] !== undefined ? inner[2] : null };
}

// Shared by both the built-in fetch-based loader and the user-upload path
// (loadDatasetFromFiles below) — same row shape (parseCSV output) either way.
function buildDataset(nodeRows, edgeRows) {
  const nodes = nodeRows
    .filter(r => CLASS_MAP[r.type])
    .map(r => {
      const nsm = {};
      NSM_COLUMNS.forEach(col => { nsm[col] = parseNsmCell(r[col]); });
      return {
        id: r.id, label: r.label || r.id, cls: r.type, layer: 0, nsm,
        metrics: {
          moduleId: r.module_id, componentId: r.connected_component_id,
          inLargestComponent: r.is_in_largest_component === '1',
          betweenness: parseFloat(r.betweenness_centrality),
          closeness: parseFloat(r.closeness_centrality),
          degree: parseFloat(r.degree_centrality),
          redundancy: parseFloat(r.redundancy_coefficient),
          pathwayReach: r.pathway_reach === '' ? null : parseFloat(r.pathway_reach),
          functionalImpact: r.functional_impact === '' ? null : parseFloat(r.functional_impact),
        },
      };
    });
  const nodeIds = new Set(nodes.map(n => n.id));

  const edges = [];
  edgeRows.forEach(r => {
    if (!nodeIds.has(r.source) || !nodeIds.has(r.target)) return; // guards against malformed rows
    const hasCorr = r.correlation !== undefined && r.correlation !== '';
    const w = hasCorr
      ? Math.max(0.05, Math.min(1, Math.abs(parseFloat(r.correlation))))
      : Math.max(0.05, Math.min(1, 1 - (parseFloat(r.qvalue) || 0)));
    // Raw q-value is kept (not just folded into `w`) so the UI can offer a
    // direct q-value threshold filter on Messenger RNA -> Pathway edges.
    // null for MicroRNA -> Messenger RNA edges, which carry no q-value.
    const qvalue = hasCorr ? null : (r.qvalue === '' || r.qvalue === undefined ? null : parseFloat(r.qvalue));
    edges.push({ s: r.source, t: r.target, rel: hasCorr ? 'regulates' : 'in_pathway', w, qvalue, layer: 0 });
  });

  computeLayeredLayout(nodes, edges);
  return { nodes, edges };
}

async function loadDataset(prefix) {
  const [nodeRows, edgeRows] = await Promise.all([
    fetchCSV('examples/' + prefix + '_nodes.csv'),
    fetchCSV('examples/' + prefix + '_edges.csv'),
  ]);
  return buildDataset(nodeRows, edgeRows);
}

// User-uploaded (or drag-and-dropped) nodes/edges CSV pair — see the "manage
// graphs" modal in js/app.js. Validated up front with actionable messages,
// since a mistyped column name here would otherwise surface only as a
// silently-empty graph.
async function loadDatasetFromFiles(nodesFile, edgesFile) {
  const [nodesText, edgesText] = await Promise.all([nodesFile.text(), edgesFile.text()]);
  const nodeRows = parseCSV(nodesText);
  const edgeRows = parseCSV(edgesText);

  if (!nodeRows.length) throw new Error('the nodes file has no data rows');
  const nodeCols = Object.keys(nodeRows[0]);
  if (!nodeCols.includes('id') || !nodeCols.includes('type')) {
    throw new Error('the nodes CSV needs at least "id" and "type" columns');
  }
  if (!edgeRows.length) throw new Error('the edges file has no data rows');
  const edgeCols = Object.keys(edgeRows[0]);
  if (!edgeCols.includes('source') || !edgeCols.includes('target')) {
    throw new Error('the edges CSV needs at least "source" and "target" columns');
  }
  if (!nodeRows.some(r => CLASS_MAP[r.type])) {
    const known = CLASSES.map(c => c.key).join(', ');
    throw new Error('no node "type" value matches a known class (' + known + ')');
  }

  return buildDataset(nodeRows, edgeRows);
}
