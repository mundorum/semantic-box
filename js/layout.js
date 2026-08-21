// Deterministic 3-column layered layout: MicroRNA | Messenger RNA | Pathway,
// left to right. Replaces the mock generator's seeded scatter. Node order
// within each column is refined by a barycenter heuristic (same idea as
// quadri-partite/plot_multipartite_network_static.py's _order_layers) to cut
// edge crossings, run for a few forward/backward sweeps. The Messenger RNA
// column is by far the largest class in the real data (hundreds of nodes),
// so it wraps into a grid of sub-columns rather than one unusably tall column
// — same fix quadri-partite/graph_viewer.html applies to its large layer.
// Mutates x/y (both 0..1) onto the given node objects; does not reorder them.
function computeLayeredLayout(nodes, edges) {
  const byClass = { MicroRNA: [], 'Messenger RNA': [], Pathway: [] };
  nodes.forEach(n => { (byClass[n.cls] || []).push(n); });

  const idClass = {};
  nodes.forEach(n => { idClass[n.id] = n.cls; });

  const miToMr = {}, mrToMi = {}, mrToPw = {}, pwToMr = {};
  edges.forEach(e => {
    const sc = idClass[e.s], tc = idClass[e.t];
    if (sc === 'MicroRNA' && tc === 'Messenger RNA') {
      (miToMr[e.s] = miToMr[e.s] || []).push(e.t);
      (mrToMi[e.t] = mrToMi[e.t] || []).push(e.s);
    } else if (sc === 'Messenger RNA' && tc === 'Pathway') {
      (mrToPw[e.s] = mrToPw[e.s] || []).push(e.t);
      (pwToMr[e.t] = pwToMr[e.t] || []).push(e.s);
    }
  });

  const rankOf = arr => {
    const m = {};
    arr.forEach((n, i) => { m[n.id] = arr.length > 1 ? i / (arr.length - 1) : 0.5; });
    return m;
  };
  const barycenterSort = (arr, neighborsOf, refRank) => {
    return arr
      .map((n, i) => {
        const nbrs = neighborsOf[n.id];
        const key = nbrs && nbrs.length
          ? nbrs.reduce((s, id) => s + (refRank[id] ?? 0.5), 0) / nbrs.length
          : (refRank[n.id] ?? (arr.length > 1 ? i / (arr.length - 1) : 0.5));
        return { n, key, i };
      })
      .sort((a, b) => a.key - b.key || a.i - b.i)
      .map(w => w.n);
  };

  let microOrder = byClass.MicroRNA.slice();
  let messengerOrder = byClass['Messenger RNA'].slice();
  let pathwayOrder = byClass.Pathway.slice();

  const N_SWEEPS = 4;
  for (let sweep = 0; sweep < N_SWEEPS; sweep++) {
    // forward: order messenger by its MicroRNA predecessors, pathway by its messenger predecessors
    const microRank = rankOf(microOrder);
    messengerOrder = barycenterSort(messengerOrder, mrToMi, microRank);
    const messengerRankFwd = rankOf(messengerOrder);
    pathwayOrder = barycenterSort(pathwayOrder, pwToMr, messengerRankFwd);

    // backward: order messenger by its Pathway successors, micro by its messenger successors
    const pathwayRank = rankOf(pathwayOrder);
    messengerOrder = barycenterSort(messengerOrder, mrToPw, pathwayRank);
    const messengerRankBwd = rankOf(messengerOrder);
    microOrder = barycenterSort(microOrder, miToMr, messengerRankBwd);
  }

  placeColumn(microOrder, 0.10);
  placeWrappedColumn(messengerOrder, 0.34, 0.66, 42);
  placeColumn(pathwayOrder, 0.90);
}

function placeColumn(arr, x) {
  arr.forEach((n, i) => {
    n.x = x;
    n.y = arr.length > 1 ? i / (arr.length - 1) : 0.5;
  });
}

// Wraps a long ordered list into a grid of sub-columns, ~targetRowsPerCol
// rows tall each, keeping barycenter-adjacent nodes near each other (same
// sub-column, adjacent rows) so crossing reduction stays visible post-wrap.
function placeWrappedColumn(arr, xStart, xEnd, targetRowsPerCol) {
  const count = arr.length;
  if (!count) return;
  const cols = Math.max(1, Math.ceil(count / targetRowsPerCol));
  const rowsPerCol = Math.ceil(count / cols);
  arr.forEach((n, i) => {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const rowsInThisCol = Math.min(rowsPerCol, count - col * rowsPerCol);
    n.x = cols > 1 ? xStart + (col / (cols - 1)) * (xEnd - xStart) : (xStart + xEnd) / 2;
    n.y = rowsInThisCol > 1 ? row / (rowsInThisCol - 1) : 0.5;
  });
}
