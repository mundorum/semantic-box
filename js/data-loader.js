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

async function loadDataset(prefix) {
  const [nodeRows, edgeRows] = await Promise.all([
    fetchCSV('examples/' + prefix + '_nodes.csv'),
    fetchCSV('examples/' + prefix + '_edges.csv'),
  ]);

  const nodes = nodeRows
    .filter(r => CLASS_MAP[r.type])
    .map(r => ({ id: r.id, label: r.label || r.id, cls: r.type, layer: 0 }));
  const nodeIds = new Set(nodes.map(n => n.id));

  const edges = [];
  edgeRows.forEach(r => {
    if (!nodeIds.has(r.source) || !nodeIds.has(r.target)) return; // guards against malformed rows
    const hasCorr = r.correlation !== undefined && r.correlation !== '';
    const w = hasCorr
      ? Math.max(0.05, Math.min(1, Math.abs(parseFloat(r.correlation))))
      : Math.max(0.05, Math.min(1, 1 - (parseFloat(r.qvalue) || 0)));
    edges.push({ s: r.source, t: r.target, rel: hasCorr ? 'regulates' : 'in_pathway', w, layer: 0 });
  });

  computeLayeredLayout(nodes, edges);
  return { nodes, edges };
}
