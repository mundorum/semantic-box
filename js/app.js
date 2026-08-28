const { createApp } = Vue;

createApp({
  delimiters: ['[[', ']]'],

  data() {
    return {
      mode: 'layers',           // 'layers' | 'compare'
      query: '',                 // search box — not yet wired (design intent only)

      // Measured column box. The graph width is DERIVED from colW, never measured
      // directly — see README "Critical layout constraint".
      colW: undefined,
      paneH: undefined,
      treeWanted: true,

      // Tri-state, same idiom as the reference prototype's `tree` field:
      // null = follow the mode's default (open in Layers, collapsed in
      // Compare, where the split canvas needs the width); true/false = an
      // explicit override for as long as this mode is active. Reset to null
      // on every mode switch — see showLayers()/showCompare().
      railOpen: null,
      inspectorOpen: null,

      // The five built-in subtype snapshots seed `datasetMeta` (label +
      // whether it's a built-in vs. a user-uploaded graph); `datasetKeys`
      // (computed) is just its key order, so adding/removing a graph is
      // adding/removing one datasetMeta entry — see "manage graphs" in
      // openAddForm/submitAddGraph/removeDataset. `datasets` mirrors it 1:1
      // by key, holding the actual loaded {nodes,edges}. `compareDataset`
      // picks the second dataset for Compare mode's canvas B / the
      // Alignment tab — see setDataset()/setCompareDataset() for how the
      // two are kept distinct.
      datasetMeta: Object.fromEntries(
        Object.keys(DATASET_LABELS).map(k => [k, { label: DATASET_LABELS[k], builtin: true }])
      ),
      datasets: {
        'normal': { nodes: [], edges: [] },
        'basal-like': { nodes: [], edges: [] },
        'her2-enriched': { nodes: [], edges: [] },
        'luminal-a': { nodes: [], edges: [] },
        'luminal-b': { nodes: [], edges: [] },
      },
      activeDataset: 'luminal-a',
      compareDataset: 'luminal-b',
      loadError: null,
      decayCurve: 'standard',

      // "Manage graphs" modal — lists loaded graphs with a remove button
      // each, plus an "add a graph" form (name + nodes/edges CSV upload or
      // drag-and-drop). See js/data-loader.js loadDatasetFromFiles.
      manageOpen: false,
      addFormOpen: false,
      addForm: { label: '', nodesFile: null, edgesFile: null, error: null, busy: false },

      panel: 'node', // 'node' | 'layer' | 'align'

      // The real data is a flat tripartite snapshot, not a build-stack, so
      // there's exactly one real "layer" (see layersMeta) — active/vis/op
      // stay single-element arrays/indices to match.
      active: 0,
      vis: [true],
      op: [100],
      cls: { MicroRNA: true, 'Messenger RNA': true, Pathway: true },

      selected: null,
      focus: 'highlight',       // 'none' | 'highlight' | 'filter'
      hop: 2,                    // 1 | 2 | 3
      dir: 'down',                // 'down' | 'up' | 'both'
      labels: true,

      // Canvas overlays: the corner info band and the minimap can both cover
      // graph content on a dense layout — independently hideable.
      cornerTagShown: true,
      minimapShown: true,

      // Messenger RNA -> Pathway q-value filter. null = follow the current
      // dataset's minimum (i.e. no filtering) — same null-follows-default
      // idiom as railOpen/inspectorOpen. Reset to null on dataset switch so
      // the slider re-defaults to the new dataset's own q-value range.
      qThreshold: null,
      // When true, Messenger RNAs left with zero surviving Pathway edges by
      // the q-value filter are hidden entirely rather than just losing their
      // dangling edges.
      hideOrphanMrna: false,

      // Canvas pan/zoom. Shared by both canvases in compare mode — matches
      // the "synced pan · zoom" claim already made by the compare-mode badge.
      viewTransform: { x: 0, y: 0, k: 1 },

      // Hover emphasis — a transient "which node is the mouse nearest to"
      // pick, independent per canvas side (unlike pan/zoom, hover is never
      // synced across compare-mode's two canvases: the mouse is only ever
      // over one of them). See updateHover.
      hoverA: null,
      hoverB: null,

      // Trace tree — a DFS path tree pinned to the selected node unless the
      // user has pinned it elsewhere (see select() for the pinning rule).
      treeRoot: null,
      open: {},          // per-path-key expand/collapse overrides
      baseDepth: 2,

      // Node Specificity by Metric (NSM) cross-graph comparison — 'none' turns
      // it off entirely. Works in either mode (both datasets are always
      // loaded), but the echo half of it only has somewhere to render once
      // compare mode's second canvas exists.
      nsmMetric: 'none',
      nsmState: 'specific', // 'specific' | 'differential' | 'common'
    };
  },

  computed: {
    isLayers() { return this.mode === 'layers'; },
    isCompare() { return this.mode === 'compare'; },

    // Tree pane hides purely on column width — it must never depend on a
    // measured graph width, or hiding the tree could feed back into a resize loop.
    treeShown() {
      return this.treeWanted && (this.colW === undefined || this.colW >= 640);
    },

    // Total space available for the graph area (both canvases combined in
    // compare mode) — derived from colW alone, same rule as treeShown.
    graphWidth() {
      const colW = this.colW || 0;
      return Math.max(60, Math.round(colW - (this.treeShown ? 280 : 0) - 4));
    },
    // Per-canvas width: halved in compare mode, where two canvases sit
    // side by side split by a divider (see README "Compare mode").
    canvasWidth() {
      return Math.max(240, Math.round(this.graphWidth / (this.isCompare ? 2 : 1)));
    },
    canvasHeight() {
      return Math.max(200, this.paneH || 480);
    },

    // Same null-follows-default / explicit-override idiom as treeShown, but
    // gated on mode rather than measured width — collapsing the side chrome
    // is a deliberate space trade for compare mode, not a responsive reflow.
    railShown() {
      return this.railOpen === null ? !this.isCompare : this.railOpen;
    },
    inspectorShown() {
      return this.inspectorOpen === null ? !this.isCompare : this.inspectorOpen;
    },
    gridTemplateColumns() {
      const rail = this.railShown ? 'minmax(190px,250px) ' : '';
      const inspector = this.inspectorShown ? ' minmax(220px,300px)' : '';
      return rail + 'minmax(0,1fr)' + inspector;
    },

    // Insertion order of datasetMeta's keys — stable because JS objects with
    // string keys preserve insertion order, so removing/adding an entry
    // (see removeDataset/submitAddGraph) is the only thing that reorders this.
    datasetKeys() { return Object.keys(this.datasetMeta); },

    model() { return this.datasets[this.activeDataset]; },
    modelB() { return this.datasets[this.compareDataset]; },

    datasetLabel() {
      const m = this.model;
      return '◦ ' + this.dsLabel(this.activeDataset) + ' · ' + m.nodes.length + ' n · ' + m.edges.length + ' e';
    },

    // Real data is one flat snapshot — collapses the mock 4-layer build-stack
    // (stage 3) down to a single real "loaded" layer. See js/data-loader.js.
    layersMeta() {
      const m = this.model;
      const meta = this.datasetMeta[this.activeDataset] || {};
      const rule = meta.builtin
        ? 'MicroRNA regulates Messenger RNA; Messenger RNA produces proteins that are part of Pathways. Loaded from examples/' + this.activeDataset + '_{nodes,edges}.csv.'
        : 'MicroRNA regulates Messenger RNA; Messenger RNA produces proteins that are part of Pathways. Loaded from an uploaded nodes/edges CSV pair via "manage graphs".';
      return [{
        name: 'L0 · ' + this.dsLabel(this.activeDataset),
        rule,
        delta: [{ label: 'loaded', nodes: String(m.nodes.length), edges: String(m.edges.length) }],
      }];
    },

    // Actual min/max q-value across this dataset's Messenger RNA -> Pathway
    // edges — the slider's own range, recomputed whenever the dataset changes.
    qRange() {
      let min = Infinity, max = -Infinity;
      this.model.edges.forEach(e => {
        if (e.qvalue === null || e.qvalue === undefined || Number.isNaN(e.qvalue)) return;
        if (e.qvalue < min) min = e.qvalue;
        if (e.qvalue > max) max = e.qvalue;
      });
      if (!Number.isFinite(min)) { min = 0; max = 1; }
      return { min, max };
    },
    qStep() {
      const r = this.qRange;
      return Math.max(1e-6, (r.max - r.min) / 200);
    },
    effectiveQThreshold() {
      return this.qThreshold === null ? this.qRange.min : this.qThreshold;
    },
    qRangeRender() {
      const r = this.qRange;
      return {
        minLabel: r.min.toFixed(3),
        maxLabel: r.max.toFixed(3),
        currentLabel: this.effectiveQThreshold.toFixed(3),
        pathwayCount: this.view.nodes.filter(n => n.cls === 'Pathway').length,
      };
    },

    view() {
      return computeView(this.model, {
        selected: this.selected, hop: this.hop, dir: this.dir,
        active: this.active, vis: this.vis, cls: this.cls,
        qThreshold: this.effectiveQThreshold, hideOrphanMrna: this.hideOrphanMrna,
      });
    },

    dirOptions() {
      return [
        { key: 'down', label: '→ down', title: 'downstream only — follow outgoing edges' },
        { key: 'up', label: '← up', title: 'upstream only — follow incoming edges' },
        { key: 'both', label: '⇄ both', title: 'both directions' },
      ];
    },

    nsmSuffix() {
      if (this.nsmMetric === 'none') return '';
      const m = NSM_METRICS.find(m => m.key === this.nsmMetric);
      return ' · nsm ' + (m ? m.label : this.nsmMetric) + ' ' + this.nsmState;
    },

    cornerTag() {
      const v = this.view;
      return this.layersMeta[this.active].name + ' · ' + v.nodes.length + ' n · ' + v.edges.length + ' e · focus ' + this.focus + ' · ' + this.hop + ' hop' + this.nsmSuffix;
    },

    layersRender() {
      return this.layersMeta.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => ({
        i, name: l.name,
        counts: this.vis[i] ? this.model.nodes.filter(n => n.layer === i).length + ' n' : 'hidden',
        opacity: this.op[i],
        isActive: i === this.active,
        isOn: this.vis[i],
        actLabel: i === this.active ? 'active layer' : 'make active',
      }));
    },

    classesRender() {
      const v = this.view;
      const counts = {};
      v.nodes.forEach(n => { counts[n.cls] = (counts[n.cls] || 0) + 1; });
      return CLASSES.map(c => ({
        key: c.key, label: c.label, shape: c.shape,
        count: counts[c.key] || 0,
        on: this.cls[c.key],
        swatch: this.cls[c.key] ? c.color : '#dcd3c4',
      }));
    },

    hopLegendRender() {
      const alpha = DECAY[this.decayCurve];
      return [0, 1, 2, 3].map(h => ({
        alpha: alpha[h],
        label: h === 0 ? 'selected node' : 'hop ' + h + ' · ' + Math.round(alpha[h] * 100) + '%',
      }));
    },

    // Falls back to the current selection when the pinned root has scrolled
    // out of view (filtered out) or nothing has been pinned yet.
    effectiveTreeRoot() {
      return this.treeRoot && this.view.live[this.treeRoot] ? this.treeRoot : this.selected;
    },

    treeData() {
      return computeTree(this.view, this.effectiveTreeRoot, { open: this.open, baseDepth: this.baseDepth });
    },

    treeRowsRender() {
      const v = this.view;
      return this.treeData.rows.map(row => {
        const n = v.live[row.id];
        const c = CLASS_MAP[n ? n.cls : 'Messenger RNA'];
        return {
          key: row.key, id: row.id, label: n ? (n.label || row.id) : row.id,
          rel: row.rel || 'root',
          indent: (row.depth * 13) + 'px',
          caret: row.canExpand ? (row.isOpen ? '▾' : '▸') : '·',
          color: c.color, shape: c.shape,
          isMatch: row.id === v.sel,
          canExpand: row.canExpand, isOpen: row.isOpen,
        };
      });
    },

    // The other loaded dataset — feeds both the Alignment tab and canvas B in
    // compare mode. Selection is shared: the same id is looked up in both
    // graphs independently, so a shared gene highlights in both when present
    // and simply doesn't match in the one where it's missing.
    viewB() {
      if (!this.isCompare) return null;
      return computeView(this.modelB, {
        selected: this.selected, hop: this.hop, dir: this.dir,
        active: this.active, vis: this.vis, cls: this.cls,
        qThreshold: this.effectiveQThreshold, hideOrphanMrna: this.hideOrphanMrna,
      });
    },

    cornerTagB() {
      const v = this.viewB;
      if (!v) return '';
      return 'L0 · ' + this.dsLabel(this.compareDataset) + ' · ' + v.nodes.length + ' n · ' + v.edges.length + ' e · focus ' + this.focus + ' · ' + this.hop + ' hop' + this.nsmSuffix;
    },

    nsmMetricOptions() {
      return [{ key: 'none', label: 'compare: off' }].concat(NSM_METRICS);
    },

    // { A: {nodeId: {state,strong,color}}, B: {...} } — see computeNsmMarks.
    nsmMarks() {
      if (this.nsmMetric === 'none') return { A: {}, B: {} };
      return computeNsmMarks(
        this.nsmMetric, this.nsmState,
        this.model.nodes, this.modelB.nodes,
        this.compareDataset, this.activeDataset
      );
    },

    // Which node classes the active metric can ever mark, across both
    // datasets — today only MicroRNA carries NSM analysis (see
    // js/data-loader.js), so Messenger RNA and Pathway are never in this set
    // for any metric. Used in computeNodesFor to decide, per node, whether
    // NSM mode's "only marked nodes get a label" rule applies to it at all:
    // a class that can never be marked must fall back to the normal
    // hop-based label rule, or it goes permanently unlabelled the instant
    // any metric is picked — that was the bug, not a class-specific quirk.
    nsmMarkableClasses() {
      const set = new Set();
      if (this.nsmMetric === 'none') return set;
      const scan = nodes => nodes.forEach(n => { if (n.nsm[this.nsmMetric]) set.add(n.cls); });
      scan(this.model.nodes);
      if (this.modelB) scan(this.modelB.nodes);
      return set;
    },

    panelTabs() {
      const order = this.isCompare
        ? [['align', 'Alignment'], ['node', 'Node'], ['layer', 'Layer']]
        : [['node', 'Node'], ['layer', 'Layer'], ['align', 'Alignment']];
      return order.map(([key, label]) => ({ key, label }));
    },

    selNode() {
      const v = this.view;
      return v.sel ? v.live[v.sel] : null;
    },
    selClass() {
      return this.selNode ? CLASS_MAP[this.selNode.cls] : CLASSES[0];
    },

    nodeMetrics() {
      const v = this.view, sel = this.selNode;
      if (!sel) return [{ label: 'hint', value: 'click a node on the canvas' }];
      const c = CLASS_MAP[sel.cls];
      return [
        { label: 'class · shape', value: sel.cls + ' · ' + c.shape },
        { label: 'out / in degree', value: (v.out[sel.id] || []).length + ' / ' + (v.inn[sel.id] || []).length },
        { label: 'reached · ' + this.hop + ' hop', value: (Object.keys(v.dist).length - 1) + ' nodes' },
        { label: 'trace direction', value: this.dir === 'both' ? 'both' : (this.dir === 'up' ? 'upstream' : 'downstream') },
        { label: 'tree rows', value: this.treeData.rows.length + (this.treeData.capped ? ' (capped)' : '') },
      ];
    },

    nodeTraceChips() {
      const sel = this.selNode;
      return this.layersMeta.map((l, i) => ({
        label: 'L' + i,
        present: sel ? sel.layer <= i : false,
        absent: sel ? sel.layer > i : true,
      }));
    },

    // Raw per-node analysis metrics from the CSVs (module/component + the
    // centrality/redundancy/pathway metrics NSM ranks are derived from).
    nodeRawMetrics() {
      const sel = this.selNode;
      if (!sel || !sel.metrics) return [];
      const m = sel.metrics;
      const fmt = v => (v === null || v === undefined || Number.isNaN(v)) ? '—' : v.toFixed(3);
      return [
        { label: 'module · component', value: m.moduleId + ' · ' + m.componentId + (m.inLargestComponent ? ' (largest)' : '') },
        { label: 'betweenness centrality', value: fmt(m.betweenness) },
        { label: 'closeness centrality', value: fmt(m.closeness) },
        { label: 'degree centrality', value: fmt(m.degree) },
        { label: 'redundancy coefficient', value: fmt(m.redundancy) },
        { label: 'pathway reach', value: fmt(m.pathwayReach) },
        { label: 'functional impact', value: fmt(m.functionalImpact) },
      ];
    },

    nodeGroups() {
      const v = this.view, sel = this.selNode;
      if (!sel) return [];
      const alpha = DECAY[this.decayCurve];
      const rowsFor = list => list.slice(0, 6).map(({ id, w }) => ({
        id, label: v.live[id] ? (v.live[id].label || id) : id,
        w: w.toFixed(2), pct: Math.round(w * 100) + '%',
        color: CLASS_MAP[v.live[id] ? v.live[id].cls : 'Messenger RNA'].color,
      }));
      // Which raw neighbour lists to show mirrors the BFS traversal direction:
      // downstream-only hides incoming, upstream-only hides outgoing, both
      // shows both — see computeView's BFS in graph-model.js.
      const groups = [];
      if (this.dir !== 'up') {
        groups.push({
          label: 'outgoing · hop 1', count: (v.out[sel.id] || []).length,
          rows: rowsFor((v.out[sel.id] || []).map(e => ({ id: e.t, w: e.w }))),
        });
      }
      if (this.dir !== 'down') {
        groups.push({
          label: 'incoming · hop 1', count: (v.inn[sel.id] || []).length,
          rows: rowsFor((v.inn[sel.id] || []).map(e => ({ id: e.s, w: e.w }))),
        });
      }
      for (let h = 2; h <= this.hop; h++) {
        const ids = Object.keys(v.dist).filter(id => v.dist[id] === h);
        if (ids.length) groups.push({ label: 'reachable · hop ' + h, count: ids.length, rows: rowsFor(ids.map(id => ({ id, w: alpha[Math.min(h, 3)] }))) });
      }
      return groups;
    },

    activeLayer() { return this.layersMeta[this.active]; },

    matchLabel() {
      const A = this.view, B = this.viewB;
      return A.nodes.length + ' / ' + (B ? B.nodes.length : A.nodes.length) + ' matched';
    },

    // Picks a spread across classes (rather than array order, which would be
    // all-MicroRNA-first) so the demo table actually shows variety.
    alignmentRows() {
      const A = this.view, B = this.viewB;
      const byClass = {};
      A.nodes.forEach(n => { (byClass[n.cls] = byClass[n.cls] || []).push(n); });
      const picks = [];
      CLASSES.forEach(c => { (byClass[c.key] || []).slice(0, 2).forEach(n => picks.push(n)); });
      return picks.slice(0, 6).map(n => {
        const inB = B && B.live[n.id];
        const dA = A.deg[n.id] || 0, dB = inB ? (B.deg[n.id] || 0) : null;
        return {
          id: n.id, a: n.label || n.id, b: inB ? (inB.label || n.id) : '—',
          deg: dA + '/' + (inB ? dB : '—'),
          delta: inB ? ((dB - dA > 0 ? '+' : '') + (dB - dA)) : 'A only',
          selected: n.id === A.sel,
        };
      });
    },

    // Minimap viewport rect, in percentages of the full canvas — derived from
    // the shared pan/zoom transform (see resetView/onWheel/onPointerMove).
    minimapViewportStyle() {
      const w = this.canvasWidth || 1, h = this.canvasHeight || 1;
      const k = this.viewTransform.k || 1;
      const leftPct = (-this.viewTransform.x / k) / w * 100;
      const topPct = (-this.viewTransform.y / k) / h * 100;
      return {
        left: leftPct + '%', top: topPct + '%',
        width: (100 / k) + '%', height: (100 / k) + '%',
      };
    },

    edgesRender() { return this.computeEdgesFor(this.view); },
    nodesRender() { return this.computeNodesFor(this.view, this.nsmMarks.A, this.hoverA); },
    edgesRenderB() { return this.viewB ? this.computeEdgesFor(this.viewB) : []; },
    nodesRenderB() { return this.viewB ? this.computeNodesFor(this.viewB, this.nsmMarks.B, this.hoverB) : []; },
  },

  methods: {
    showLayers() { this.mode = 'layers'; if (this.panel === 'align') this.panel = 'node'; this.railOpen = null; this.inspectorOpen = null; },
    showCompare() { this.mode = 'compare'; this.panel = 'align'; this.railOpen = null; this.inspectorOpen = null; },

    toggleRail() { this.railOpen = !this.railShown; },
    toggleInspector() { this.inspectorOpen = !this.inspectorShown; },

    computeEdgesFor(v) {
      const W = this.canvasWidth, H = this.canvasHeight;
      const alpha = DECAY[this.decayCurve];
      // Dim/filter decisions key off the GLOBAL selection (this.selected),
      // not this view's resolved v.sel: in compare mode, a selection that
      // exists in the current dataset but has no counterpart in the other
      // one must still dim/hide that side's nodes (nothing here is "in the
      // subgraph"), rather than reading as focus:none and lighting up every
      // node at full opacity just because v.sel came back null.
      const filtering = this.focus === 'filter' && this.selected;
      const dim = this.focus === 'none' || !this.selected ? 1 : 0.1;
      const X = n => 24 + n.x * (W - 48);
      const Y = n => 24 + n.y * (H - 48);
      const out = [];
      v.edges.forEach(e => {
        const a = v.live[e.s], b = v.live[e.t];
        if (!a || !b) return;
        const both = v.sel && v.dist[e.s] !== undefined && v.dist[e.t] !== undefined;
        if (filtering && !both) return;
        const hop = both ? Math.max(v.dist[e.s], v.dist[e.t]) : 0;
        const layerOp = (this.op[Math.max(a.layer, b.layer)] ?? 100) / 100;
        out.push({
          key: e.s + '>' + e.t,
          x1: X(a), y1: Y(a), x2: X(b), y2: Y(b),
          stroke: both ? CANVAS_INK.edge : CANVAS_INK.edgeRest,
          strokeWidth: both ? (0.7 + e.w * 2.6) * (hop >= 2 ? 0.6 : 1) : 0.8,
          strokeOpacity: (both ? alpha[Math.min(hop, 3)] : dim) * layerOp,
        });
      });
      return out;
    },

    // marks: this side's {nodeId: {state,strong,color}} from nsmMarks —
    // strong = this side's own specific/differential/common classification;
    // non-strong = an echo of the OTHER side's classification, in the same
    // colour, so the same node can be spotted on both canvases. hoverId:
    // this side's currently-hovered node (see updateHover) — a transient
    // emphasis independent of selection, for picking one node out of a
    // cluster of overlapping ones before committing to a click.
    computeNodesFor(v, marks, hoverId) {
      const W = this.canvasWidth, H = this.canvasHeight;
      const alpha = DECAY[this.decayCurve];
      // See the matching comment in computeEdgesFor: key off the global
      // selection, not this view's own (possibly null) resolved v.sel.
      const filtering = this.focus === 'filter' && this.selected;
      const dim = this.focus === 'none' || !this.selected ? 1 : 0.1;
      const nsmActive = this.nsmMetric !== 'none';
      const markableClasses = this.nsmMarkableClasses;
      const out = [];
      v.nodes.forEach(n => {
        const sub = v.sel && v.dist[n.id] !== undefined;
        if (filtering && !sub) return;
        const hop = sub ? v.dist[n.id] : 0;
        const isSel = n.id === v.sel;
        // Selection already reads as "emphasized"; hover only adds its own
        // (smaller, distinct) treatment on top of a node that isn't already
        // selected, so the two states never visually compete.
        const isHovered = !isSel && n.id === hoverId;
        const emph = isSel || isHovered;
        const r = Math.min(9, 2.6 + (v.deg[n.id] || 0) * 0.5) + (isSel ? 2 : (isHovered ? 1.2 : 0));
        const c = CLASS_MAP[n.cls];
        const px = 24 + n.x * (W - 48), py = 24 + n.y * (H - 48);
        const layerOp = (this.op[n.layer] ?? 100) / 100;
        // Hover forces full opacity regardless of hop-decay/dim — the whole
        // point is to pop one node out of a faded or overlapping cluster so
        // it can be told apart before clicking.
        const op = isHovered ? 1 : (sub ? alpha[Math.min(hop, 3)] : dim) * layerOp;

        // NSM mode replaces the usual "selected + hop<=2" label rule with
        // "only marked nodes" — otherwise a few hundred faded genes would
        // still all carry labels and bury the ones that actually matter
        // here. But that restriction only makes sense for a class the
        // active metric can actually mark (see nsmMarkableClasses) — e.g.
        // NSM analysis today is MicroRNA-only, so Messenger RNA and Pathway
        // nodes can never be marked and must keep the normal label rule, or
        // those two classes would go permanently unlabelled the instant any
        // metric is picked. A hovered node always gets its label, on top of
        // whichever of those two rules is in force — that's the point of hovering.
        const mark = marks[n.id];
        const showLabel = isHovered || (nsmActive && markableClasses.has(n.cls)
          ? (this.labels && !!mark)
          : (this.labels && (isSel || (sub && hop <= 2))));
        const labelText = n.label || n.id;
        const tw = String(labelText).length * (emph ? 6.6 : 5.4);
        const flip = px + r + 4 + tw > W - 6 && px - r - 4 - tw > 6;
        const labelX = flip ? Math.max(px - r - 4, 6 + tw) : Math.min(px + r + 4, W - 6 - tw);

        out.push({
          id: n.id, label: labelText, cls: n.cls, shape: c.shape,
          cx: px, cy: py, r,
          fill: c.color, fillOpacity: op,
          stroke: isSel ? CANVAS_INK.selectStroke : CANVAS_INK.nodeHalo,
          strokeWidth: isSel ? 2 : 0.8, strokeOpacity: op,
          hopRing: !!(sub && hop >= 2), ringR: r + 3.5, ringColor: c.color, ringOpacity: op * 0.9,
          nsmRing: !!mark, ringNsmR: r + (mark && mark.strong ? 5 : 7),
          ringNsmColor: mark ? mark.color : null,
          ringNsmWidth: mark && mark.strong ? 1.8 : 1,
          ringNsmOpacity: mark ? (mark.strong ? 0.95 : 0.45) : 0,
          // Dashed neutral-ink ring — distinct from the selection stroke, the
          // class-coloured hop ring, and the NSM ring, so hover never reads
          // as any of those other states.
          hoverRing: isHovered, ringHoverR: r + 2.4,
          showLabel, labelX, labelY: py + 3.5, labelAnchor: flip ? 'end' : 'start',
          labelSize: emph ? 11 : 9, labelOpacity: isHovered ? 1 : Math.max(op, 0.55),
        });
      });
      return out;
    },

    dsLabel(key) { return (this.datasetMeta[key] && this.datasetMeta[key].label) || key; },

    resetViewState() {
      this.selected = null;
      this.treeRoot = null;
      this.open = {};
      this.baseDepth = 2;
      this.qThreshold = null;
    },

    // Picking the dataset that's already B swaps A/B instead of colliding —
    // there's no meaningful "other" default among a growing, user-editable
    // dataset list, so A and B just stay distinct by construction.
    setDataset(key) {
      if (this.activeDataset === key) return;
      if (this.compareDataset === key) this.compareDataset = this.activeDataset;
      this.activeDataset = key;
      this.resetViewState();
    },
    setCompareDataset(key) {
      if (this.compareDataset === key) return;
      if (this.activeDataset === key) this.activeDataset = this.compareDataset;
      this.compareDataset = key;
    },

    // --- Manage graphs: add/remove which datasets are loaded ---

    openManage() { this.manageOpen = true; },
    closeManage() { this.manageOpen = false; this.cancelAddForm(); },

    openAddForm() {
      this.addForm = { label: '', nodesFile: null, edgesFile: null, error: null, busy: false };
      this.addFormOpen = true;
    },
    cancelAddForm() {
      this.addFormOpen = false;
      this.addForm = { label: '', nodesFile: null, edgesFile: null, error: null, busy: false };
    },

    browseFile(kind) { this.$refs[kind + 'FileInput'].click(); },
    onPickFile(e, kind) {
      const file = e.target.files && e.target.files[0];
      if (file) this.setAddFormFile(kind, file);
      e.target.value = ''; // allow re-picking the same filename later
    },
    onDropFile(e, kind) {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) this.setAddFormFile(kind, file);
    },
    setAddFormFile(kind, file) {
      this.addForm = Object.assign({}, this.addForm, { [kind + 'File']: file, error: null });
    },

    deriveDatasetLabel(filename) {
      return String(filename || 'graph').replace(/\.[^./]+$/, '').replace(/[_-]?nodes$/i, '').trim() || 'graph';
    },
    uniqueDatasetKey(label) {
      const base = slugify(label);
      let key = base, i = 2;
      while (this.datasetMeta[key]) { key = base + '-' + i; i++; }
      return key;
    },

    async submitAddGraph() {
      const f = this.addForm;
      if (!f.nodesFile || !f.edgesFile) {
        this.addForm = Object.assign({}, f, { error: 'choose both a nodes CSV and an edges CSV' });
        return;
      }
      this.addForm = Object.assign({}, f, { busy: true, error: null });
      try {
        const dataset = await loadDatasetFromFiles(f.nodesFile, f.edgesFile);
        const label = f.label.trim() || this.deriveDatasetLabel(f.nodesFile.name);
        const key = this.uniqueDatasetKey(label);
        this.datasetMeta = Object.assign({}, this.datasetMeta, { [key]: { label, builtin: false } });
        this.datasets = Object.assign({}, this.datasets, { [key]: dataset });
        this.setDataset(key);
        this.closeManage();
      } catch (err) {
        this.addForm = Object.assign({}, this.addForm, { busy: false, error: String(err && err.message || err) });
      }
    },

    // Keeps activeDataset/compareDataset always pointing at a dataset that
    // still exists; refuses to drop the last one (there must always be
    // something to show). Falls back out of Compare mode if fewer than two
    // datasets remain, since a side-by-side comparison needs two.
    removeDataset(key) {
      if (this.datasetKeys.length <= 1) return;

      const meta = Object.assign({}, this.datasetMeta);
      delete meta[key];
      const datasets = Object.assign({}, this.datasets);
      delete datasets[key];
      this.datasetMeta = meta;
      this.datasets = datasets;

      const remaining = Object.keys(meta);
      if (this.activeDataset === key) {
        this.activeDataset = remaining[0];
        this.resetViewState();
      }
      if (this.compareDataset === key || this.compareDataset === this.activeDataset) {
        this.compareDataset = remaining.find(k => k !== this.activeDataset) || remaining[0];
      }
      if (remaining.length < 2 && this.isCompare) this.showLayers();
    },

    // One-shot: mirrors the reference prototype's componentDidMount auto-
    // select, run from a lifecycle hook once data exists — never during render.
    autoSelect() {
      if (this._autoSelected || this.selected) return;
      const nodes = this.model.nodes;
      if (!nodes.length) return;
      this._autoSelected = true;
      this.select(nodes[0].id);
    },

    // Identity-guarded ref callbacks: re-renders must not thrash the observer.
    setCenterCol(el) {
      if (this._centerCol === el) return;
      if (this._ro && this._centerCol) this._ro.unobserve(this._centerCol);
      this._centerCol = el;
      if (this._ro && el) this._ro.observe(el);
      this.measure();
    },
    setCanvasWrap(el) {
      if (this._canvasWrap === el) return;
      if (this._ro && this._canvasWrap) this._ro.unobserve(this._canvasWrap);
      this._canvasWrap = el;
      if (this._ro && el) this._ro.observe(el);
      this.measure();
    },

    measure() {
      const col = this._centerCol, wrap = this._canvasWrap;
      if (col) {
        const cw = col.clientWidth;
        if (cw !== this.colW) this.colW = cw;
      }
      if (wrap) {
        const h = wrap.clientHeight;
        if (h !== this.paneH) this.paneH = h;
      }
    },

    // If the tree root was unset or was tracking the previous selection, it
    // follows the new selection; otherwise a manually-pinned root stays put.
    // Clearing the selection (id === null) never touches the root.
    select(id) {
      const root = id && (this.treeRoot === null || this.treeRoot === this.selected) ? id : this.treeRoot;
      this.selected = id;
      if (id) {
        this.treeRoot = root;
        if (this.panel !== 'align') this.panel = 'node';
      }
    },
    // A node click that lands right after a pan drag is a drag artifact, not
    // an intentional selection — see onPointerDown/onPointerMove.
    nodeClick(id) { if (!this._dragMoved) this.select(id); },
    svgClick(e) {
      if (this._dragMoved) return;
      if (e.target.tagName === 'svg') this.select(null);
    },

    setQThreshold(val) { this.qThreshold = parseFloat(val); },
    toggleHideOrphanMrna() { this.hideOrphanMrna = !this.hideOrphanMrna; },

    resetView() { this.viewTransform = { x: 0, y: 0, k: 1 }; },

    // Converts a client-space (viewport pixel) point to this canvas's SVG
    // viewBox coordinate space — i.e. before the pan/zoom <g> transform.
    clientToViewBox(svg, clientX, clientY) {
      const rect = svg.getBoundingClientRect();
      const scaleX = this.canvasWidth / rect.width;
      const scaleY = this.canvasHeight / rect.height;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    },
    // Further maps a viewBox-space point through the inverse of the current
    // pan/zoom transform, landing in the same "world" space node cx/cy/r are
    // computed in (computeNodesFor) — used by onWheel (to keep the point
    // under the cursor fixed while zooming) and by updateHover (to compare
    // the cursor against node positions regardless of current pan/zoom).
    viewBoxToWorld(p) {
      const t = this.viewTransform;
      return { x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k };
    },

    // Pan/zoom: wheel zooms anchored on the pointer, drag pans. Both live on
    // the wrapping `.canvas` div (not the svg) so native node/background
    // clicks keep working undisturbed — see nodeClick/svgClick for the
    // drag-vs-click disambiguation.
    onWheel(e) {
      const svg = e.currentTarget.querySelector('svg');
      if (!svg) return;
      const p = this.clientToViewBox(svg, e.clientX, e.clientY);
      const t = this.viewTransform;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const k1 = Math.min(8, Math.max(0.5, t.k * factor));
      const w = this.viewBoxToWorld(p);
      this.viewTransform = { k: k1, x: p.x - w.x * k1, y: p.y - w.y * k1 };
    },
    // Deliberately NOT using setPointerCapture: per the Pointer Events spec,
    // capturing an element retargets the subsequent compatibility mouse
    // events — including `click` — to the capturing element too. Since nodes
    // rely on their own per-shape @click to select, capturing on the
    // wrapping .canvas div would silently swallow every node click. Window
    // listeners give the same "keep tracking outside the div" behaviour
    // without touching event targeting.
    onPointerDown(e) {
      const svg = e.currentTarget.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      this._panStart = {
        clientX: e.clientX, clientY: e.clientY,
        tx: this.viewTransform.x, ty: this.viewTransform.y,
        scaleX: this.canvasWidth / rect.width, scaleY: this.canvasHeight / rect.height,
      };
      this._dragMoved = false;
      // A stale hover ring sitting on screen while the user pans past it
      // would read as pointing at something — clear both sides up front.
      this.hoverA = null;
      this.hoverB = null;
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      window.removeEventListener('pointerup', this.onWindowPointerUp);
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
    },
    onWindowPointerMove(e) {
      const start = this._panStart;
      if (!start) return;
      const dx = (e.clientX - start.clientX) * start.scaleX;
      const dy = (e.clientY - start.clientY) * start.scaleY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;
      this.viewTransform = { k: this.viewTransform.k, x: start.tx + dx, y: start.ty + dy };
    },
    onWindowPointerUp() {
      this._panStart = null;
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      window.removeEventListener('pointerup', this.onWindowPointerUp);
    },

    // Hover emphasis: picking one node out of a cluster of overlapping ones
    // before committing to a click. Rather than relying on native per-shape
    // mouseenter (which would just hit whichever node happens to be drawn on
    // top), this does its own geometry test on every rendered node and picks
    // the one whose centre the cursor is nearest to, among those the cursor
    // is actually inside — see updateHover. RAF-throttled since mousemove
    // fires far more often than a frame renders, and this is O(nodes) work.
    onCanvasMouseMove(e, side) {
      if (this._panStart) return; // don't fight an active drag with hover flicker
      const div = e.currentTarget;
      const clientX = e.clientX, clientY = e.clientY;
      if (this._hoverRAF) return;
      this._hoverRAF = requestAnimationFrame(() => {
        this._hoverRAF = null;
        this.updateHover(div, clientX, clientY, side);
      });
    },
    onCanvasMouseLeave(side) {
      if (side === 'B') this.hoverB = null; else this.hoverA = null;
    },
    updateHover(div, clientX, clientY, side) {
      const svg = div.querySelector('svg');
      if (!svg) return;
      const p = this.viewBoxToWorld(this.clientToViewBox(svg, clientX, clientY));
      const nodes = side === 'B' ? this.nodesRenderB : this.nodesRender;
      let best = null, bestDist = Infinity;
      for (const n of nodes) {
        const dist = Math.hypot(n.cx - p.x, n.cy - p.y);
        if (dist <= n.r && dist < bestDist) { best = n.id; bestDist = dist; }
      }
      if (side === 'B') { if (this.hoverB !== best) this.hoverB = best; }
      else if (this.hoverA !== best) { this.hoverA = best; }
    },

    setFocus(mode) { this.focus = mode; },
    setHop(n) { this.hop = n; },
    setDir(mode) { this.dir = mode; },
    toggleLabels() { this.labels = !this.labels; },
    toggleTree() { this.treeWanted = !this.treeWanted; },
    toggleCornerTag() { this.cornerTagShown = !this.cornerTagShown; },
    toggleMinimap() { this.minimapShown = !this.minimapShown; },

    setNsmMetric(key) { this.nsmMetric = key; },
    setNsmState(state) { this.nsmState = state; },

    toggleLayerVis(i) { const v = this.vis.slice(); v[i] = !v[i]; this.vis = v; },
    setLayerOpacity(i, val) { const o = this.op.slice(); o[i] = +val; this.op = o; },
    activateLayer(i) { this.active = i; },
    toggleClass(key) { this.cls = Object.assign({}, this.cls, { [key]: !this.cls[key] }); },

    toggleTreeRow(row) {
      if (!row.canExpand) return;
      this.open = Object.assign({}, this.open, { [row.key]: !row.isOpen });
    },
    expandAllRows() { this.open = {}; this.baseDepth = MAX_TREE_DEPTH; },
    collapseAllRows() { this.open = {}; this.baseDepth = 1; },

    focusNeighbourhood() { this.focus = 'highlight'; },
    openInTree() {
      this.treeRoot = this.selected;
      this.treeWanted = true;
      this.open = {};
      this.baseDepth = 2;
    },

    diamondPoints(n) {
      return [
        n.cx + ',' + (n.cy - n.r * 1.25),
        (n.cx + n.r * 1.25) + ',' + n.cy,
        n.cx + ',' + (n.cy + n.r * 1.25),
        (n.cx - n.r * 1.25) + ',' + n.cy,
      ].join(' ');
    },
  },

  async mounted() {
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.measure());
      if (this._centerCol) this._ro.observe(this._centerCol);
      if (this._canvasWrap) this._ro.observe(this._canvasWrap);
    }
    this._onResize = () => this.measure();
    window.addEventListener('resize', this._onResize);
    this.measure();

    try {
      const keys = this.datasetKeys;
      const loaded = await Promise.all(keys.map(k => loadDataset(k)));
      const datasets = {};
      keys.forEach((k, i) => { datasets[k] = loaded[i]; });
      this.datasets = datasets;
      this.autoSelect();
    } catch (err) {
      this.loadError = String(err && err.message || err);
    }
  },

  beforeUnmount() {
    if (this._ro) this._ro.disconnect();
    window.removeEventListener('resize', this._onResize);
  },
}).mount('#app');
