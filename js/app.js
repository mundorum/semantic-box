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

      // Both real graphs are loaded up front (see mounted()); the top bar's
      // dataset switch just changes which one `model` points at, so "view the
      // first / second graph separately" is a plain state flip, and the other
      // one is already sitting in memory for the Alignment tab (viewB).
      datasets: {
        'luminal-a': { nodes: [], edges: [] },
        'luminal-b': { nodes: [], edges: [] },
      },
      datasetKeys: ['luminal-a', 'luminal-b'],
      activeDataset: 'luminal-a',
      loadError: null,
      decayCurve: 'standard',

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
      dir: 'down',                // 'down' | 'both'
      labels: true,

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

    model() { return this.datasets[this.activeDataset]; },
    otherDatasetKey() { return this.activeDataset === 'luminal-a' ? 'luminal-b' : 'luminal-a'; },
    modelB() { return this.datasets[this.otherDatasetKey]; },

    datasetLabel() {
      const m = this.model;
      return '◦ ' + this.activeDataset + ' · ' + m.nodes.length + ' n · ' + m.edges.length + ' e';
    },

    // Real data is one flat snapshot — collapses the mock 4-layer build-stack
    // (stage 3) down to a single real "loaded" layer. See js/data-loader.js.
    layersMeta() {
      const m = this.model;
      return [{
        name: 'L0 · ' + this.activeDataset,
        rule: 'MicroRNA regulates Messenger RNA; Messenger RNA produces proteins that are part of Pathways. Loaded from examples/' + this.activeDataset + '_{nodes,edges}.csv.',
        delta: [{ label: 'loaded', nodes: String(m.nodes.length), edges: String(m.edges.length) }],
      }];
    },

    view() {
      return computeView(this.model, {
        selected: this.selected, hop: this.hop, dir: this.dir,
        active: this.active, vis: this.vis, cls: this.cls,
      });
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
          key: row.key, id: row.id,
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
      });
    },

    cornerTagB() {
      const v = this.viewB;
      if (!v) return '';
      return 'L0 · ' + this.otherDatasetKey + ' · ' + v.nodes.length + ' n · ' + v.edges.length + ' e · focus ' + this.focus + ' · ' + this.hop + ' hop' + this.nsmSuffix;
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
        this.otherDatasetKey, this.activeDataset
      );
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
        { label: 'trace direction', value: this.dir === 'both' ? 'both' : 'downstream' },
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
        id, w: w.toFixed(2), pct: Math.round(w * 100) + '%',
        color: CLASS_MAP[v.live[id] ? v.live[id].cls : 'Messenger RNA'].color,
      }));
      const groups = [];
      groups.push({
        label: 'outgoing · hop 1', count: (v.out[sel.id] || []).length,
        rows: rowsFor((v.out[sel.id] || []).map(e => ({ id: e.t, w: e.w }))),
      });
      if (this.dir === 'both') {
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
          a: n.id, b: inB ? n.id : '—',
          deg: dA + '/' + (inB ? dB : '—'),
          delta: inB ? ((dB - dA > 0 ? '+' : '') + (dB - dA)) : 'A only',
          selected: n.id === A.sel,
        };
      });
    },

    edgesRender() { return this.computeEdgesFor(this.view); },
    nodesRender() { return this.computeNodesFor(this.view, this.nsmMarks.A); },
    edgesRenderB() { return this.viewB ? this.computeEdgesFor(this.viewB) : []; },
    nodesRenderB() { return this.viewB ? this.computeNodesFor(this.viewB, this.nsmMarks.B) : []; },
  },

  methods: {
    showLayers() { this.mode = 'layers'; if (this.panel === 'align') this.panel = 'node'; this.railOpen = null; this.inspectorOpen = null; },
    showCompare() { this.mode = 'compare'; this.panel = 'align'; this.railOpen = null; this.inspectorOpen = null; },

    toggleRail() { this.railOpen = !this.railShown; },
    toggleInspector() { this.inspectorOpen = !this.inspectorShown; },

    computeEdgesFor(v) {
      const W = this.canvasWidth, H = this.canvasHeight;
      const alpha = DECAY[this.decayCurve];
      const filtering = this.focus === 'filter' && v.sel;
      const dim = this.focus === 'none' || !v.sel ? 1 : 0.1;
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
    // colour, so the same node can be spotted on both canvases.
    computeNodesFor(v, marks) {
      const W = this.canvasWidth, H = this.canvasHeight;
      const alpha = DECAY[this.decayCurve];
      const filtering = this.focus === 'filter' && v.sel;
      const dim = this.focus === 'none' || !v.sel ? 1 : 0.1;
      const nsmActive = this.nsmMetric !== 'none';
      const out = [];
      v.nodes.forEach(n => {
        const sub = v.sel && v.dist[n.id] !== undefined;
        if (filtering && !sub) return;
        const hop = sub ? v.dist[n.id] : 0;
        const isSel = n.id === v.sel;
        const r = Math.min(9, 2.6 + (v.deg[n.id] || 0) * 0.5) + (isSel ? 2 : 0);
        const c = CLASS_MAP[n.cls];
        const px = 24 + n.x * (W - 48), py = 24 + n.y * (H - 48);
        const layerOp = (this.op[n.layer] ?? 100) / 100;
        const op = (sub ? alpha[Math.min(hop, 3)] : dim) * layerOp;

        // NSM mode replaces the usual "selected + hop<=1" label rule with
        // "only marked nodes" — otherwise a few hundred faded genes would
        // still all carry labels and bury the ones that actually matter here.
        const mark = marks[n.id];
        const showLabel = nsmActive
          ? (this.labels && !!mark)
          : (this.labels && (isSel || (sub && hop <= 1)));
        const tw = String(n.id).length * (isSel ? 6.6 : 5.4);
        const flip = px + r + 4 + tw > W - 6 && px - r - 4 - tw > 6;
        const labelX = flip ? Math.max(px - r - 4, 6 + tw) : Math.min(px + r + 4, W - 6 - tw);

        out.push({
          id: n.id, cls: n.cls, shape: c.shape,
          cx: px, cy: py, r,
          fill: c.color, fillOpacity: op,
          stroke: isSel ? CANVAS_INK.selectStroke : CANVAS_INK.nodeHalo,
          strokeWidth: isSel ? 2 : 0.8, strokeOpacity: op,
          hopRing: !!(sub && hop >= 2), ringR: r + 3.5, ringColor: c.color, ringOpacity: op * 0.9,
          nsmRing: !!mark, ringNsmR: r + (mark && mark.strong ? 5 : 7),
          ringNsmColor: mark ? mark.color : null,
          ringNsmWidth: mark && mark.strong ? 1.8 : 1,
          ringNsmOpacity: mark ? (mark.strong ? 0.95 : 0.45) : 0,
          showLabel, labelX, labelY: py + 3.5, labelAnchor: flip ? 'end' : 'start',
          labelSize: isSel ? 11 : 9, labelOpacity: Math.max(op, 0.55),
        });
      });
      return out;
    },

    setDataset(key) {
      if (this.activeDataset === key) return;
      this.activeDataset = key;
      this.selected = null;
      this.treeRoot = null;
      this.open = {};
      this.baseDepth = 2;
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
    svgClick(e) { if (e.target.tagName === 'svg') this.select(null); },

    setFocus(mode) { this.focus = mode; },
    setHop(n) { this.hop = n; },
    toggleDir() { this.dir = this.dir === 'both' ? 'down' : 'both'; },
    toggleLabels() { this.labels = !this.labels; },
    toggleTree() { this.treeWanted = !this.treeWanted; },

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
      const [a, b] = await Promise.all([loadDataset('luminal-a'), loadDataset('luminal-b')]);
      this.datasets = { 'luminal-a': a, 'luminal-b': b };
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
