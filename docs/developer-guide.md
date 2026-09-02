# Semantic Box — developer guide

For anyone modifying the code. Read the
[data format reference](data-format.md) alongside this, and — before touching
anything visual — the
[design handoff](../design_handoff_semantic_box/README.md) and
[`../CLAUDE.md`](../CLAUDE.md).

---

## Contents

- [1. Architecture in one page](#1-architecture-in-one-page)
- [2. Running and verifying](#2-running-and-verifying)
- [3. Repository layout](#3-repository-layout)
- [4. Boot sequence](#4-boot-sequence)
- [5. The data pipeline](#5-the-data-pipeline)
- [6. State model](#6-state-model)
- [7. The render pipeline](#7-the-render-pipeline)
- [8. Interaction subsystems](#8-interaction-subsystems)
- [9. Compare mode and NSM](#9-compare-mode-and-nsm)
- [10. Figure export](#10-figure-export)
- [11. CSS and the two-palette rule](#11-css-and-the-two-palette-rule)
- [12. Invariants you must not break](#12-invariants-you-must-not-break)
- [13. Extension recipes](#13-extension-recipes)
- [14. Known gaps and unwired features](#14-known-gaps-and-unwired-features)

---

## 1. Architecture in one page

- **One HTML page.** [`index.html`](../index.html) *is* the Vue template. The
  browser's native HTML parser tokenises it once, then Vue's runtime compiler
  (the full CDN build, not the runtime-only one) compiles it. **There is no
  build step and no bundler.**
- **Vue 3 from a CDN.** `<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js">`.
  A single root component created with `createApp({...}).mount('#app')`.
  Delimiters are changed to `[[ ]]` (`delimiters: ['[[', ']]']`) so `{{ }}`
  can't collide with anything.
- **Plain global scripts.** `js/csv.js`, `js/layout.js`, `js/graph-model.js`,
  `js/data-loader.js`, `js/svg-export.js` each define top-level `function`s and
  `const`s that become globals, loaded in order before `js/app.js`. No modules,
  no imports.
- **All application logic is in the one component.** `js/app.js` is the whole
  app: `data()`, ~40 `computed`, ~60 `methods`, `mounted()`, `beforeUnmount()`.
  The other JS files are pure helpers with no Vue awareness.
- **Everything derives from state on every render.** The filtered graph, BFS
  distances, adjacency, the trace tree, the SVG node/edge lists, the NSM marks
  — none of it is stored. Change a control, a chain of `computed`s recomputes,
  Vue re-renders the SVG.
- **Data is CSV fetched at runtime.** Two bundled datasets from `examples/`;
  more can be uploaded in-browser.

```
 CSV text ──parseCSV──▶ row objects ──buildDataset──▶ { nodes, edges }
                                          │ computeLayeredLayout (x,y ∈ 0..1)
                                          ▼
   this.datasets[key] ──computeView(model, state)──▶ { nodes, live, edges, out, inn, deg, sel, dist }
                                          │
                    ┌─────────────────────┼───────────────────────┐
                    ▼                     ▼                       ▼
             computeNodesFor      computeEdgesFor           computeTree
                    │                     │                       │
                    ▼                     ▼                       ▼
              <circle/rect/polygon>  <line>              trace-tree rows
                     rendered in the SVG templates in index.html
```

---

## 2. Running and verifying

```sh
python3 -m http.server 8000     # or npx serve, php -S, Live Server …
# open http://localhost:8000/index.html
```

`file://` fails — the app `fetch()`es `examples/*.csv`.

**Before calling any UI change done**, drive it in a real browser (headless is
fine) and check the console for Vue warnings/errors. There is no automated test
suite. A headless check with `puppeteer-core` against a system Chrome is the
established pattern — launch a static server, load the page, click the control,
read back the DOM / a `computed`, screenshot. Verify:

- the graph/state updates as expected,
- no console errors or Vue warnings,
- the design guidelines still hold (two palettes, mono type, no transitions).

---

## 3. Repository layout

```
index.html                     the app shell + Vue template (SVG canvas markup lives here)
css/
  tokens.css                   design tokens: organic chrome palette + canvas palette vars
  app.css                      every component style; ~950 lines, one section per region
js/
  csv.js                       parseCSV — quote-aware CSV → array of row objects
  layout.js                    computeLayeredLayout — deterministic tripartite column layout
  graph-model.js               CLASSES, DECAY, NSM_* constants; computeView; computeTree;
                               slugify; nsmStateMatches; computeNsmMarks
  data-loader.js               parseNsmCell; buildDataset; loadDataset (fetch);
                               loadDatasetFromFiles (upload) + validation
  svg-export.js                serializeCanvasSVG; rasterize; buildFontFaceCSS; triggerDownload
  app.js                       the Vue component — all state, computeds, methods, lifecycle
examples/
  <subtype>_nodes.csv          bundled datasets (basal-like, luminal-a at repo root of examples/)
  <subtype>_edges.csv
  v01/ v02/ v01-v02-mixed/     extra snapshots to load via "manage graphs"
favicon.svg                    the identity mark (also inlined in the top bar)
design_handoff_semantic_box/   the authoritative visual/interaction spec
docs/                          this documentation
```

---

## 4. Boot sequence

`js/app.js` → `mounted()`:

1. Create a `ResizeObserver` that calls `measure()` — see the
   [layout constraint](#the-graph-width-constraint).
2. Register `window` listeners: `resize` (`_onResize` — closes popovers,
   re-measures), `keydown` (`_onKeyDown` — the Delete/Backspace hide shortcut,
   bailing out while an `INPUT`/`TEXTAREA`/`SELECT` has focus).
3. `measure()` once.
4. `await Promise.all(datasetKeys.map(loadDataset))` — fetch and build every
   registered dataset, assign `this.datasets`.
5. `autoSelect()` — a one-shot (`_autoSelected` flag) that selects
   `this.model.nodes[0]` so the tree/inspector aren't empty. **Runs from the
   lifecycle hook, never during render.**

`beforeUnmount()` disconnects the observer and removes the listeners.

Ref callbacks (`setCenterCol`, `setCanvasWrap`) are **identity-guarded**
(`if (this._centerCol === el) return;` then unobserve old / observe new) so
re-renders don't thrash the `ResizeObserver`.

---

## 5. The data pipeline

### `parseCSV(text)` — `js/csv.js`

A minimal RFC4180-ish parser: quote-aware (`""` escaping, embedded commas and
newlines inside quotes), `\r` tolerant. Returns an array of objects keyed by
the header row. A naive `split(',')` would corrupt quoted columns.

### `buildDataset(nodeRows, edgeRows)` — `js/data-loader.js`

Shared by the fetch loader and the upload loader — one code path from row
objects onward.

- **Nodes**: keep rows whose `type` is a known class (`CLASS_MAP[r.type]`).
  Each becomes
  `{ id, label, cls, layer: 0, nsm, qvalue, metrics }`:
  - `nsm` — `{ <metric key>: parseNsmCell(cell) }` for each of the seven
    `NSM_COLUMNS`. `parseNsmCell` turns a Python-repr list literal
    (`[]`, `[['specific']]`, `[['shared', 'Luminal A', 0.25]]`) into
    `null` / `{ state, other, jaccard }`.
  - `qvalue` — parsed float, Pathway-only (miR/mRNA leave it blank → `null`).
  - `metrics` — `componentId`, `inLargestComponent`
    (`parseFloat(is_in_largest_component) === 1`), and the six centrality /
    redundancy / reach / impact floats.
- **Edges**: keep rows whose `source` and `target` both resolve to a kept
  node. Edge kind is inferred from the **presence of a `correlation` value**:
  present → a `miR → mRNA` edge, `rel: 'regulates'`, weight
  `clamp(|correlation|, 0.05, 1)`; absent → an `mRNA → Pathway` edge,
  `rel: 'in_pathway'`, weight `1`. Each edge is `{ s, t, rel, w, layer: 0 }`.
- Calls `computeLayeredLayout(nodes, edges)` to assign `x`/`y`.
- Returns `{ nodes, edges }`.

Everything gets `layer: 0` — the real data is a flat snapshot; the 4-layer
build-stack from the design prototype collapsed to one layer.

### `loadDataset(prefix)` vs `loadDatasetFromFiles(nodesFile, edgesFile)`

- `loadDataset` fetches `examples/<prefix>_{nodes,edges}.csv`.
- `loadDatasetFromFiles` reads two `File` objects and **validates** first
  (nodes CSV has `id` + `type`; edges CSV has `source` + `target`; at least one
  node `type` matches a known class). Each failure throws a specific message
  that surfaces in the manage-graphs dialog. See
  [data format § validation](data-format.md#validation).

### `computeLayeredLayout(nodes, edges)` — `js/layout.js`

Deterministic — no force simulation, no randomness.

1. Bucket nodes by class.
2. Build the four directed adjacency maps (miR↔mRNA, mRNA↔Pathway).
3. Run **4 barycenter sweeps** (forward: order mRNA by its miR predecessors,
   Pathway by its mRNA predecessors; backward: the reverse) to reduce edge
   crossings — the same heuristic as multipartite network plotters.
4. Place columns: miR at `x = 0.10`; mRNA **wrapped** into a grid of
   sub-columns spanning `x ∈ [0.34, 0.66]` (~42 rows per sub-column — one
   column would be unusably tall with hundreds of mRNAs); Pathway at `x = 0.90`.
   `y ∈ [0, 1]` by position within the column.

`x`/`y` are normalised `0..1`; `computeNodesFor` projects them into pixels with
a 24px inset: `px = 24 + x * (W - 48)`.

---

## 6. State model

Everything is on the one component's `data()`. Annotated groups:

```js
// mode & chrome
mode: 'layers' | 'compare'
viewMenuOpen, hiddenMenuOpen, exportMenuOpen: boolean   // the three toolbar popovers
railOpen, inspectorOpen: null | boolean   // null = follow mode default (open in layers, closed in compare)
panel: 'node' | 'layer' | 'align' | 'nsm'  // inspector tab; 'nsm' is compare-only
treeWanted: boolean                        // trace-pane toggle; actual visibility also needs colW >= 640
colW, paneH: number | undefined            // MEASURED centre column box — see the layout constraint

// datasets
datasetMeta: { [key]: { label, builtin } } // the registry; key order = display order
datasets:    { [key]: { nodes, edges } }   // loaded graph data, mirrors datasetMeta by key
activeDataset, compareDataset: string      // A and B; kept distinct by swapping
loadError: string | null
decayCurve: 'gentle' | 'standard' | 'steep'   // fixed to 'standard'; no UI

// manage-graphs modal
manageOpen, addFormOpen: boolean
addForm: { label, nodesFile, edgesFile, error, busy }

// layers (single-element arrays — the data is one flat layer)
active: 0
vis: [boolean]
op: [number]                               // 0..100
cls: { MicroRNA, 'Messenger RNA', Pathway: boolean }   // class filter

// selection & focus
selected: nodeId | null
focus: 'none' | 'highlight' | 'filter'
hop: 1 | 2 | 3
dir: 'down' | 'up' | 'both'
labels, cornerTagShown, minimapShown: boolean

// canvas filters
qThreshold: number | null                  // null = follow the dataset's max (unfiltered)
hideOrphanMrna: boolean
hideNoDownstream: boolean                   // "dead-end nodes"
largestComponentOnly: boolean               // "minor-component nodes"

// pan/zoom & hover
viewTransform: { x, y, k }                  // shared across both compare canvases
hoverA, hoverB: nodeId | null               // per-side, never synced

// trace tree
treeRoot: nodeId | null                     // last selected node; the tree ALWAYS tracks it (no pin)
traceSide: 'A' | 'B'                        // compare-mode canvas the tree follows; set by nodeClick
open: { [pathKey]: boolean }                // per-row expand overrides
baseDepth: number                          // default-open depth

// NSM (compare-mode cross-dataset comparison)
nsmMetric: string                          // 'none' + NSM_METRICS keys
nsmState: 'specific' | 'conserved' | 'rewired'
nsmJaccardCutoff: number                    // 0..1, splits 'shared' into conserved (>=) / rewired (<)
reachOp: 'off' | 'intersection' | 'difference'

// manual hidden nodes
hidden: { [nodeId]: true }                  // persists across dataset/mode switches
```

**Null-follows-default idiom.** `railOpen`, `inspectorOpen`, `qThreshold`,
`treeRoot` use `null` to mean "use the contextual default"; a concrete value is
an explicit override. Resets (`showLayers`, `showCompare`, `setDataset` →
`resetViewState`) set them back to `null`.

**Mode/dataset transitions** (`showLayers`, `showCompare`, `setDataset`):

| | `showLayers()` | `showCompare()` | `setDataset(key)` |
| --- | --- | --- | --- |
| `mode` | `'layers'` | `'compare'` | — |
| `panel` | off `align`/`nsm` → `node` | `'align'` | — |
| `railOpen`/`inspectorOpen` | `null` | `null` | — |
| `nsmMetric`/`reachOp` | reset | — | — |
| `traceSide` | `'A'` | `'A'` | `'A'` (via `resetViewState`) |
| selection/tree/q-threshold | — | — | reset (`resetViewState`) |

---

## 7. The render pipeline

### `computeView(model, state)` — `js/graph-model.js`

The heart of the app. Given a graph model and a plain state bag, returns
`{ model, nodes, live, edges, out, inn, deg, sel, dist }`. **The filter order
matters** — each step feeds the next:

1. **Node filter** (`onNode`): class enabled **and** `layer <= active` **and**
   layer visible **and** not manually hidden **and** passes the q-value filter
   (`qOK` — Pathway with `qvalue > threshold` is out) **and** passes the
   largest-component filter (`lcOK` — non-Pathway with
   `inLargestComponent === false`, *only* when `largestComponentOnly` and the
   dataset actually has the flag on some node).
2. **Edge filter**: both endpoints live and `layer <= active`.
3. **Drop edgeless Pathways** — a Pathway with no surviving edge is removed
   entirely (not dimmed), and its edges fall away.
4. **Orphan-mRNA drop** (`hideOrphanMrna`) — mRNA with no surviving Pathway
   edge is removed.
5. **Dead-end drop** (`hideNoDownstream`) — non-Pathway nodes with no outgoing
   edge, **iterated to a fixpoint** (removing a dead-end mRNA can orphan a
   miR).
6. Build `out` / `inn` adjacency and `deg`; sort `out` lists by weight desc.
7. **BFS** from `sel` (if the selection survives the filters) respecting
   `hop` and `dir` — fills `dist` (`{ nodeId: hopDistance }`).

`live` is `{ id: node }` for O(1) lookup. `sel` is the selection id **only if
it survived** — `null` otherwise.

The component wraps this in two `computed`s: `view()` (dataset A) and `viewB()`
(dataset B, `null` outside compare mode). `traceView()` picks A or B by
`traceSide`.

### `computeTree(v, rootId, { open, baseDepth })` — `js/graph-model.js`

DFS over **outgoing edges only**, cycle-guarded by the path set — a node
reachable by N distinct paths yields N rows (**path tree, not node tree**).
`MAX_TREE_DEPTH = 4`, `MAX_TREE_ROWS = 160` (`capped` flag when hit). A row is
open when `depth < baseDepth` unless the user toggled it (`open[pathKey]`).
Reads `traceView`, so in compare mode the tree traces through whichever
dataset's graph the last canvas click targeted.

### `computeNodesFor(v, marks, hoverId, otherDist)` — `js/app.js` method

Turns view nodes into SVG-ready objects. Per node it computes:

- `cx`/`cy` (projected `x`/`y`), `r` (`min(9, 2.6 + deg*0.5)`, `+2` selected,
  `+1.2` hovered).
- `fill` = class colour; `fillOpacity` = `decayAlpha[hop] * layerOpacity`, or
  `0.1` when outside the subgraph, or `1` when hovered.
- `sub` = "in the current subgraph" = `v.sel && dist defined && !reachExcluder`.
  The **reach set comparison** folds in here — an excluded node reads exactly
  like a non-reached one.
- `hopRing` (class-coloured, hop ≥ 2), `nsmRing` (from `marks`), `hoverRing`
  (dashed neutral ink) — **four distinct ring patterns**; keep them distinct.
- `showLabel` — normal rule is "selected or within 2 hops"; NSM mode replaces
  it with "only marked nodes (+ selection)" **but only for classes the active
  metric can mark** (`nsmMarkableClasses`) — getting this wrong makes mRNA/
  Pathway labels vanish permanently the moment any metric is picked.
- `labelX` / `labelAnchor` — measured-width placement that flips left only if
  the flipped position also fits, clamped inside the box.

Dim/filter decisions **key off the global `this.selected`, not `v.sel`** — in
compare mode a selection that exists on A but not B must still dim B, not read
as "focus off".

`edgesRender` / `nodesRender` (side A) and `edgesRenderB` / `nodesRenderB`
(side B) are the `computed`s the templates iterate.

### The SVG templates — `index.html`

Three near-identical blocks: the single canvas (`v-if="!isCompare"`), compare-A
(`.canvas--divided`), compare-B. Each has a `<g transform="translate(x,y)
scale(k)">` wrapping `<line>` edges and a `<template v-for>` of nodes
(`<rect>` box / `<polygon>` diamond / `<circle>` else, plus up to four rings
and a `<text>` label). Compare-B's node clicks pass `'B'`; the others default
to `'A'`.

`:view-box.camel` — **not** `:viewBox`. The native HTML tokeniser lowercases
unknown attribute names; `viewbox` is not a real SVG attribute, so the viewBox
would silently never be set, breaking the screen-to-SVG coordinate maths in
pan/zoom and hover. Vue's `.camel` modifier is the documented fix for in-DOM
templates.

---

## 8. Interaction subsystems

### The graph-width constraint

**Never measure the graph's own width.** The trace pane's visibility depends on
available width; the graph width depends on the pane's visibility. Measuring
both is a render loop (it bit the prototype repeatedly).

The rule, preserved:

- `ResizeObserver` measures **only the centre grid column** → `colW`
  (`measure()`), and the canvas wrapper's height → `paneH`.
- `treeShown` reads `colW` only: `treeWanted && (colW === undefined || colW >= 640)`.
- `graphWidth` is **derived**: `colW - (treeShown ? 280 : 0) - 4`.
- `canvasWidth` = `graphWidth / (isCompare ? 2 : 1)`.

### Pan / zoom

Lives on the wrapping `.canvas` div, not the `<svg>`, so native node/background
clicks keep working.

- `onWheel` — `factor = exp(-deltaY * 0.0015)`, clamp `k` to `[0.5, 8]`, adjust
  `x`/`y` so the world point under the cursor stays fixed.
- `onPointerDown` records `_panStart` and adds **`window`-level**
  `pointermove`/`pointerup` listeners (removed on up).
  **Do not use `setPointerCapture`** — per the Pointer Events spec it retargets
  compatibility mouse events (including `click`) to the capturing element,
  which would swallow every node click after a drag is armed.
- A ~3px movement threshold sets `_dragMoved`; `nodeClick` and `svgClick` bail
  when it is set, so a pan that releases over a node (or empty canvas) is not a
  click.
- `viewTransform` is a single shared `{x, y, k}` — this is what makes
  compare-mode's "synced pan · zoom" real.
- `clientToViewBox` + `viewBoxToWorld` convert screen pixels to the world
  coordinate space nodes are laid out in; shared by wheel-zoom and hover.

### Hover emphasis

A single `mousemove` listener on the `.canvas` div (not per-node — native
`mouseenter` only tells you which element the browser painted on top, not which
centre the cursor is nearest). `onCanvasMouseMove` captures
`clientX`/`clientY`/`currentTarget` synchronously then RAF-throttles
`updateHover`, which does an O(nodes) pass: among nodes whose radius contains
the cursor, pick the nearest centre. Suppressed during an active pan; cleared
on `pointerdown`. `hoverA`/`hoverB` are independent — never synced.

### Selection and trace side

```js
select(id) {                    // the tree ALWAYS follows the selection
  this.selected = id;
  if (id) {
    this.treeRoot = id;
    if (this.panel !== 'align' && this.panel !== 'nsm') this.panel = 'node';
  }
}
nodeClick(id, side) {           // canvas node click
  if (this._dragMoved) return;
  this.traceSide = side || 'A'; // compare: the tree follows the clicked canvas
  this.select(id);
}
selectA(id) { this.traceSide = 'A'; this.select(id); }   // inspector rows (side-A data)
```

There is **no "pinned root"**. An earlier heuristic ("root stays put unless it
was tracking the selection") wedged `treeRoot !== selected` permanently after
any bare-canvas click and the tree silently stopped following. `treeRoot` is
now just the last selected node, retained on clear so the pane doesn't blank;
`effectiveTreeRoot` falls back to it (then `null`) when it's filtered out of
`traceView`. `openInTree()` just reveals the pane and resets `baseDepth`.

### Manual hidden nodes

`hidden` is `{ [id]: true }`, folded into `computeView`'s `onNode`. Dangling
edges fall away via the `live[e.s] && live[e.t]` checks. Persists across
dataset/mode switches (ids are shared); cleared only by *show all*. Hiding the
current selection calls `select(null)`.

---

## 9. Compare mode and NSM

### NSM data

The `*_descending` / `*_ascending` node columns hold node-specificity-by-metric
results as Python-repr list literals. `parseNsmCell` (`js/data-loader.js`)
yields:

| Cell | Parsed |
| --- | --- |
| `[]` or empty | `null` — not a high-priority node for this metric |
| `[['specific']]` | `{ state: 'specific', other: null, jaccard: null }` |
| `[['shared', 'Luminal A', 0.25]]` | `{ state: 'shared', other: 'Luminal A', jaccard: 0.25 }` |

Single quotes make it Python not JSON, but the values never contain quotes or
commas so a blind `'`→`"` swap is safe.

Only **MicroRNA** rows carry non-trivial NSM cells in the current data —
mRNA/Pathway rows always parse to `null`.

### `nsmStateMatches(info, state, cutoff)` — `js/graph-model.js`

The single classifier, reused everywhere:

- `specific` → `info.state === 'specific'`
- `conserved` → `info.state === 'shared' && jaccard >= cutoff`
- `rewired` → `info.state === 'shared' && jaccard < cutoff`

### `computeNsmMarks(metricKey, state, cutoff, nodesA, nodesB, otherKeyA, otherKeyB)`

Returns `{ A: { [id]: { state, strong, color } }, B: {...} }`.

- **own pass** — a strong mark on the side whose node matches, coloured by
  `NSM_IDENTITY` (`A` violet `#8a4cc4`, `B` teal `#0d8794` — position-based,
  not dataset-based).
- **echo pass** — for conserved/rewired only, a faint mark in the *same* colour
  on the other side, so the same node is spottable on both canvases.
  `info.other` is a **display name**, so it's `slugify`'d before matching the
  dataset **key**.

Consumed by `computeNodesFor` via the `marks` argument → `nsmRing`.

### `nsmLabelTable()` — `js/app.js` computed → the NSM inspector tab

`null` outside compare mode. Otherwise `{ cols, state, a, b }` where `a`/`b`
are `{ label, rows }` per dataset. `rows` = that dataset's MicroRNA nodes with
≥1 metric matching `nsmState` (via `nsmStateMatches` with `nsmJaccardCutoff`),
each `{ id, label, cells[], count }`, **sorted by `count` desc, then label
asc**. `cols` is the seven `NSM_METRICS` with `NSM_ABBR` short headers. Cell
text: `✓` for specific, `jaccard.toFixed(3)` for conserved/rewired, `''`
otherwise. The template stacks the two sub-tables; the table scrolls sideways
in `.nsm-table__scroll` with a sticky first column.

### Reach set comparison

`reachExcluder(v, otherDist)` returns a predicate folded into `sub`/`both` in
`computeNodesFor`/`computeEdgesFor`. `intersection` keeps nodes reached on both
sides; `difference` is symmetric per canvas (`reach(A)\reach(B)` on the left,
the reverse on the right). The selected node is always kept. Compare-only,
reset to `'off'` by `showLayers`.

### Unmatched selection

The shared `selected` id is looked up independently in each dataset. Where it's
absent, that side must render as "nothing in the subgraph" — so the per-side
dim/filter decision keys off the **global** `this.selected`, not that side's
`v.sel` (which is `null` in both "nothing selected anywhere" and "selected but
not here").

---

## 10. Figure export

`js/svg-export.js` — four plain functions, no Vue awareness. Driven by
`exportSVG()` / `exportPNG()` in `js/app.js`, triggered from the `export ▾`
popover.

- **`serializeCanvasSVG(svgEls, width, height, opts)`** → XML string. Clones
  the live `<svg>`(s) straight from the DOM (all node/edge styling is already
  inline SVG presentation attributes — nothing to inline), wraps each in its
  own nested `<svg>` viewport (clips pan/zoom overflow to the panel), prepends
  a white background rect, sets `xmlns` / explicit `width` / `height` /
  `viewBox`. Compare mode → one outer SVG, side B at `x = width + 1`, a 1px
  divider between. The on-screen dot grid is deliberately omitted.
- **`rasterize(svgString, width, height, scale)`** → `Promise<Blob>`. Draws the
  SVG data-URL onto an offscreen `<canvas>` at `scale` (3×) and `toBlob('image/png')`.
- **`buildFontFaceCSS()`** (PNG only, `opts.embedFonts`) — fetches the Google
  Fonts stylesheet the page already links, extracts the woff2 URLs, base64s
  them into `@font-face` rules embedded in the exported SVG so rasterised text
  uses the real fonts. Best-effort inside `try/catch`; cached; falls back to
  `monospace`. The **SVG export** does not embed fonts — it references the
  families by name (portable and font-accurate wherever they're installed).
- **`triggerDownload(blob, filename)`** — Blob URL + a synthetic `<a download>`
  click. Works because this is the real app on a static server, not a sandboxed
  artifact.

`this._canvasWrap` (the `.center-body` ref) → `querySelectorAll('.canvas svg')`
gets the element(s) in document order (A then B).

---

## 11. CSS and the two-palette rule

Two stylesheets, no preprocessor:

- **`css/tokens.css`** — CSS custom properties. The **organic chrome palette**
  (`--color-bg` cream, `--color-surface` sand, `--color-accent` terracotta,
  the neutral / accent / accent-2 ramps, radii, spacing, shadows) and the
  **canvas palette** vars (`--canvas-ground` white, grid ink, halo, edge ink,
  select stroke).
- **`css/app.css`** — one commented section per region (top bar, rail,
  toolbar, view menu, canvas, trace tree, modal, inspector, NSM table).

**The two-palette rule (do not break it):** chrome — top bar, rail, toolbar,
tree, inspector — uses the organic palette *only*. The **only** spectral colour
allowed in chrome is a node-class swatch (legend dot, tree-row dot, inspector
dot). The canvas is the one place spectral hues on white are correct. Don't let
a canvas colour leak into chrome or vice versa.

**Node class colours live in JS**, not CSS — `CLASSES` in `js/graph-model.js`
is the single source of truth (the canvas needs JS values for computed SVG
attributes). They're currently caller-supplied (red `#EF3B2C` / blue `#6BAED6`
/ orange `#FF8000`) for figure consistency — a documented deviation from the
design handoff's spectral construction; shape encoding is unchanged so
greyscale/colour-blind legibility holds.

Other rules from the design handoff, easy to break by accident:

- **JetBrains Mono is the interface voice** — every identifier, count, metric,
  label and control is mono. Figtree is only for panel titles and prose. No
  Caprasimo.
- **No transitions or animations.** Interaction feedback is immediate state
  change; hover is a border/background swap only.
- **Reuse component idioms** — a new toggle is a `toolbar-pill` +
  `.pill__active-overlay`; a new slider is `input[type=range]` with
  `accent-color: var(--color-accent)`; a new popover reuses the
  `.view-menu__pop` / `__scrim` / `__row` shell (now used by the view, hidden,
  and export menus — four times total). Active states use an overlay span /
  `box-shadow: inset` so border thickening never reflows.

---

## 12. Invariants you must not break

1. **Never measure the graph width** — derive it from `colW` only
   ([§8](#the-graph-width-constraint)).
2. **`:view-box.camel`, never `:viewBox`** in the SVG templates.
3. **No `setPointerCapture`** on the pan element.
4. **Node identity shown to the user is always `label`, never `id`** — canvas
   text, tree rows, neighbour rows, inspector titles, the alignment/NSM tables.
   `id` stays the internal key (selection, BFS, edge endpoints, `:key`).
5. **Dim/filter decisions key off `this.selected`, not `v.sel`** — matters for
   unmatched selections in compare mode.
6. **`computeView` filter order** — node filter → edge filter → edgeless
   Pathway drop → orphan drop → dead-end fixpoint → adjacency → BFS. Changing
   the order changes what survives.
7. **NSM label suppression is per-class** — check `nsmMarkableClasses.has(n.cls)`,
   not "does any mark exist anywhere", or mRNA/Pathway labels vanish
   permanently under any active metric.
8. **The two-palette rule** ([§11](#11-css-and-the-two-palette-rule)).
9. **Auto-select and ref observation happen in lifecycle hooks, not render.**
10. **Update the design handoff in the same change** as any UI behaviour
    change (per `CLAUDE.md`).

---

## 13. Extension recipes

### Add a node class

1. `CLASSES` in `js/graph-model.js` — `{ key, label, shape, color }`. `shape`
   is `circle` / `box` / `diamond` (add a new SVG branch in all three canvas
   template blocks if you need a new shape).
2. `cls` in `data()` — add `'<key>': true`.
3. Anywhere a class is special-cased — `computeView` (Pathway is the
   never-dropped sink class; the largest-component and dead-end filters exempt
   Pathway), `layout.js` (the column layout is hard-coded tripartite — a fourth
   class needs a column), the q-value filter (Pathway-only).
4. `data-loader.js` validation message lists known classes.
5. Update the design handoff class table + `docs/`.

### Add an NSM metric

1. `NSM_COLUMNS` in `js/data-loader.js` — the CSV column name (must have both a
   `_descending` and/or `_ascending` variant present in the data).
2. `NSM_METRICS` in `js/graph-model.js` — `{ key, label }` (key === column).
3. `NSM_ABBR` in `js/graph-model.js` — a short header for the NSM table.
4. That's it — `parseNsmCell`, `nsmStateMatches`, `computeNsmMarks`,
   `nsmLabelTable` are all metric-generic.

### Add a canvas view filter

1. State flag in `data()` (default `false`).
2. A `toggle…` method.
3. Thread it into **both** `computeView` calls (`view()` and `viewB()`) via the
   state bag, and implement in `computeView` — usually a predicate folded into
   `onNode`, or a post-pass like `hideNoDownstream`. Consider a `hasXData`
   guard computed if it depends on optional CSV columns.
4. A `.view-menu__row` in `index.html` under "Canvas filters" — tick =
   `!flag` (tick means *shown*), with a `title`.
5. Corner-tag suffix if it warrants surfacing; design handoff §3/§12; `docs/`.

### Add an inspector tab

1. `panelTabs()` — add `['<key>', '<Label>']` (conditionally for compare-only).
2. `showLayers()` — move `panel` off `<key>` if it's compare-only.
3. `select()` — add `<key>` to the "sticky tab" guard if a node click
   shouldn't yank the user to Node.
4. A `<div class="…-tab" v-if="panel === '<key>'">` block in `index.html`.
5. A `computed` for its data; CSS section in `app.css`.

### Change the decay curve

`decayCurve` in `data()` — `'gentle'` / `'standard'` / `'steep'`. The curves
are in `DECAY` (`js/graph-model.js`). There is no UI; wire a `seg` in the rail
if you want one (follow the hop-legend pattern).

---

## 14. Known gaps and unwired features

- **Search & jump** — the top-bar search input has `v-model="query"` but no
  filtering/jump logic. Design intent only.
- **"build a layer over top"** — the rail button is a placeholder; the data is
  a single flat layer.
- **Decay-curve picker** — no UI (see above).
- **Layer machinery** — `active`/`vis`/`op` are single-element arrays because
  the real data collapsed the design's 4-layer build-stack to one layer. The
  card, visibility toggle, opacity slider and "make active" all still work,
  they just operate on the one layer.
- **No automated tests** — verification is manual / headless-browser
  ([§2](#2-running-and-verifying)).
- **PNG font embedding** is best-effort and depends on `fetch` reaching Google
  Fonts; it silently falls back to `monospace`.
- **Alignment tab rows** are a representative spread across classes, not a full
  join — it's a demo of the alignment concept, not an exhaustive table.
