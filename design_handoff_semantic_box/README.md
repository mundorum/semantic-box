# Handoff: Semantic Box — layered graph workspace

## Overview

Semantic Box is a knowledge-graph explorer for researchers working with layered
graph data. A graph is built in **stacked layers** (source relations →
co-occurrence → inference → clustering), and the user needs to see what each
layer added, trace how a selected node reaches its neighbourhood, and compare two
runs side by side.

Three interlocking mechanisms carry the design:

1. **Hop-decay focus** — selecting a node computes BFS distance from it and fades
   everything by hop distance, so relevance is legible without hiding structure.
2. **Class encoding** — every node carries a class, encoded redundantly in colour
   *and* shape (circle / box / diamond) so the graph survives colour-blindness
   and greyscale printing.
3. **Trace tree** — a collapsible DFS path tree rooted at the selected node,
   pinned to the right of the canvas.

## About the design files

The files in `reference/` are **design references written in HTML** — a working
prototype that shows intended look and behaviour. They are **not production code
to copy**. Your task is to **recreate this design in the target codebase's own
environment** (React, Vue, Svelte, SwiftUI, native — whatever the repo already
uses), using its established component library, state management, and styling
conventions. If the repo has no frontend yet, choose the framework that best fits
the project and implement there.

Two specifics about the prototype that are **prototype artifacts, not design
intent**, and should NOT be carried over:

- The graph data is **synthetically generated** by a seeded PRNG (`model(seed)`).
  Real implementation reads from the actual graph backend.
- Layout is a **static seeded scatter** (`x`,`y` random in 0..1, projected into
  the viewport). A real implementation should use a proper force-directed or
  layered layout (d3-force, cytoscape.js, graphology + forceatlas2, etc.).
  Everything else — encoding, decay, interaction, chrome — is design intent.

## Fidelity

**High-fidelity.** Colours, typography, spacing, radii, and interaction states
are final and exact. Recreate the UI pixel-accurately using the codebase's
existing primitives. Values below are authoritative; where a value is given as
`var(--token, #fallback)`, prefer the token if the codebase has an equivalent.

---

## The two-palette rule (the most important decision in this design)

This is the design's central and most easily-broken rule. **The application
chrome and the data canvas use different palettes, with a hard boundary at the
canvas edge.**

**Chrome** (top bar, left rail, focus toolbar, trace tree, right inspector) uses
the Organic design system exclusively — cream ground `#f5ead8`, sand surface
`#ebddc5`, terracotta accent `#c67139`, sage second accent `#7a8a5e`. All
interactive affordances, selection rings, active states and progress bars use the
terracotta accent. No spectral hue ever appears in the chrome except as a node
class swatch (legend dot, tree row dot, inspector dot) — those swatches are data,
not decoration.

**Canvas** uses a **full-spectrum categorical palette on a white ground.** The
reason: a restricted brand ramp cannot separate seven categories — consecutive
ramp steps differ mainly in *lightness*, which reads as "more/less important"
rather than "different kind", and collides with the hop-decay opacity channel
that already encodes importance. So the canvas gets its own palette built for
categorical separation:

| Class | Hue | Hex | Shape | Note |
| --- | --- | --- | --- | --- |
| `case` | blue | `#3767cf` | box (rx 2) | source document |
| `cluster` | violet | `#8a4cc4` | diamond | promoted community |
| `gene` | crimson | `#c33a63` | circle | |
| `protein` | terracotta | `#c67139` | circle | **is** the Organic accent |
| `pathway` | green | `#3f8c4a` | circle | Organic sage at full chroma |
| `test` | teal | `#0d8794` | circle | lab test |
| `inferred` | warm grey | `#8a8177` | circle | deliberately desaturated |

Seven hues walked around the wheel at **one perceptual lightness (~L\* 56) and
one chroma**, so no class outranks another by visual weight — only by hue.
Two seats are held by the Organic accents themselves (protein = the terracotta
verbatim, pathway = the sage pushed to full chroma), which ties the plate back to
the brand without constraining the other five. `inferred` is intentionally the
only desaturated entry — inferred nodes should recede.

**The white canvas ground is what makes this legal.** The spectral hues are tuned
against white; on the cream ground the cool hues (blue, violet, teal) turn muddy
and lose separation. The canvas must therefore read as a **deliberate instrument
plate set into the warm room**, not as a missing background. That framing is
carried by three details — reproduce all three or the white looks like a bug:

1. `background: #ffffff`
2. Inset hairline: `box-shadow: inset 0 0 0 1px rgba(32,30,29,.10)`
3. Faint dot grid: `radial-gradient(rgba(32,30,29,.10) 1px, transparent 1px)`,
   `background-size: 18px 18px`

**Edges never take a class hue.** All seven hues are reserved for node classes.
Edges are neutral dark ink `rgba(26,28,38,.62)`; emphasis comes from stroke
weight (`0.7 + weight × 2.6`) and hop-decay opacity. Non-subgraph edges drop to
`rgba(32,30,29,.34)` at 0.8px.

Node strokes are a **white halo** (`#ffffff`, 0.8px) so dense overlapping nodes
stay countable. The selected node instead takes a 2px `#201e1d` stroke.

An `organic` palette mode exists as a fallback (see Tweaks) which swaps to
ramp-based colours and reverts the ground to cream. Ship spectral-on-white as the
default; the organic mode is for print or brand-strict contexts.

---

## Screens / Views

There is one screen with three modes of the centre column and three inspector
tabs. No routing between screens.

### Shell layout

```
┌──────────────────────────────────────────────────────────────┐
│ top bar · 52px fixed                                         │
├────────────┬────────────────────────────────┬────────────────┤
│ left rail  │ centre column                  │ inspector      │
│ minmax(    │ minmax(0, 1fr)                 │ minmax(        │
│ 190,250)   │  ┌ toolbar (wraps) ─────────┐  │ 220, 300)      │
│            │  ├ canvas ──┬ trace tree ───┤  │                │
│  layers    │  │          │ 280px fixed   │  │                │
│  ─────     │  │          │               │  │                │
│  classes   │  │          │               │  │                │
│  hop decay │  └──────────┴───────────────┘  │                │
└────────────┴────────────────────────────────┴────────────────┘
```

Outer: `height:100vh; display:flex; flex-direction:column; overflow:hidden`.
Grid row: `flex:1; min-height:0; display:grid; grid-template-columns: minmax(190px,250px) minmax(0,1fr) minmax(220px,300px); grid-template-rows:100%`.
Column dividers: `1px solid var(--color-divider, rgba(32,30,29,.16))`.

**Critical layout constraint — do not measure the graph width.** The trace pane's
visibility depends on available width, and the graph width depends on the pane's
visibility. Measuring both creates a render loop (this bug bit the prototype
repeatedly). The fix, which you must preserve: **measure only the grid column
width** (`colW`, via `ResizeObserver` on the column element) and **derive** the
graph width as `colW − (treeShown ? 280 : 0) − 4`. The tree pane hides when
`colW < 640`, and that decision reads `colW` only — never a measured graph width.

Also preserve: ref callbacks are **identity-guarded** (`if (this.col === el) return;`
then unobserve old / observe new) so re-renders don't thrash the observer, and
initial node selection happens in a **lifecycle hook** (`componentDidMount` +
`componentDidUpdate` with a one-shot `autoSelected` flag), never during render.

### 1. Top bar — 52px

`background: var(--color-surface,#ebddc5)`, bottom divider, `padding: 0 16px`,
`display:flex; align-items:center; gap:10px`.

- Wordmark `semantic box` — JetBrains Mono 500 12px, `letter-spacing:.08em`, uppercase.
- Dataset label — JetBrains Mono 400 11px, `--color-neutral-600` (#82796a). Copy: `◦ clinical KG · run 12`.
- Spacer, then right-aligned:
- Search input — 170px wide, `padding:7px 11px`, `border:1px solid #c0b6a5`,
  `border-radius:999px`, `background:#f9f4ed`, JetBrains Mono 400 11px.
  Placeholder: `search & jump`. **Not yet wired** — state exists, filtering isn't implemented. Implement as jump-to-node.
- `Layers` / `Compare` buttons — pill, `padding:8px 15px`, `border:1px solid #c0b6a5`,
  transparent bg, Figtree 600 12px. Hover: `border-color:#c67139`.
  Active state is an **overlay span** at `inset:-1px` with `1.5px solid #c67139` +
  `background:#fff2eb`, label above it at `position:relative`.

> The overlay-span pattern for active/selected states recurs throughout. It exists
> so the border thickening doesn't shift layout. In your framework a simple
> `box-shadow: inset 0 0 0 1.5px` or an `::after` is equivalent and cleaner — use
> whatever your codebase prefers, as long as **the active state never reflows**.

### 2. Left rail

Header row: `Layers` + count, JetBrains Mono 500 10px, `.08em`, uppercase, `--color-neutral-600`, 12px/14px padding, bottom divider.

**Layer list** — `padding:12px; gap:9px`, scrolls. Rendered **newest layer first**
(reverse order) so the top of the list is the top of the stack.

- "Build a layer" button — `1px dashed #c0b6a5`, `border-radius:8px`, JetBrains Mono 400 10px, `--color-neutral-600`. Hover: border and text → `#c67139`. **Not wired.**
- Layer card — `padding:10px 11px`, `border-radius:8px`, `1px solid #c0b6a5`, `background:#f9f4ed`. Active layer gets the overlay-span treatment (`1.5px #c67139` + `#fff2eb`).
  - Visibility toggle — 15px circle button, `1px solid #a19786`; when on, filled `#c67139`.
  - Layer name — JetBrains Mono 500 11px, ellipsis.
  - Count — JetBrains Mono 400 9px, `--color-neutral-600`; reads `N n` or `hidden`.
  - Opacity slider — native `input[type=range]` 0–100, `accent-color:#c67139`, `height:14px`. Controls that layer's node/edge opacity on canvas.
  - Activate button — pill, `padding:5px 9px`, JetBrains Mono 400 9px. Label: `active layer` / `make active`.

Layer data (four layers, defaults `visible: all`, `opacity: [30,55,80,100]`, `active: 3`):

| Layer | Rule text | Delta (nodes / edges) |
| --- | --- | --- |
| L0 · source | Imported source relations — the ground truth this stack is built over. | imported 1 204 / 4 880 |
| L1 · co-occurrence | Built over L0: pairs co-occurring at least 3 times become an undirected relation. | kept 1 204/4 880 · added 436/3 560 · dropped 0/14 |
| L2 · inferred | Built over L1: inference rules add directed relations where a path of length 2 is supported. | kept 1 640/8 440 · added 262/3 462 · dropped 0/0 |
| L3 · clustered | Built over L2: community detection groups nodes and promotes each cluster to a node. | kept 1 902/11 902 · added 282/1 118 · dropped 0/212 |

**Class legend** — bottom section, `max-height:44%`, scrolls, top divider.
Header: `Classes` … `colour · shape`. Each row is a full-width pill button,
`padding:5px 7px`, `gap:9px`, transparent border → `#c0b6a5` on hover. Contains
the class glyph (13px; circle `999px` / box `radius 3px` / diamond 11px
`rotate(45deg) radius 2px`), the label (JetBrains Mono 400 11px), and the live
node count (9px, `--color-neutral-600`). Clicking toggles the class off: swatch
→ `#dcd3c4`, label ink → `#a19786`.

**Hop decay legend** — top divider, 12px above. Four rows: a 26×3px `999px` bar
in `#c67139` at the decay alpha for that hop, plus JetBrains Mono 400 10px label
`selected node` / `hop N · NN%`.

### 3. Centre — focus toolbar

`padding:8px 12px`, `display:flex; flex-wrap:wrap; gap:8px`, bottom divider.
Section labels are JetBrains Mono 500 9px, `.06em`, uppercase, `--color-neutral-600`.

- `Focus` segmented control — `none` / `highlight` / `filter`. Track: `padding:2px`, `1px solid #c0b6a5`, `999px`, `background:#f9f4ed`. Option: `padding:5px 11px`, JetBrains Mono 500 10px. Selected: `999px` fill `#c67139`, ink `#f9f4ed`; unselected ink `--color-neutral-700`. Default `highlight`.
- `Hops` segmented control — `1` / `2` / `3`, each option 26px wide. Default `2`.
- Direction toggle — pill. Labels: `→ downstream only` / `⇄ both directions`. Default downstream.
- Labels toggle — pill. Labels: `labels on` / `labels off`. Default on.
- Spacer.
- Compare-mode badge (compare only) — `1px solid #c67139`, `background:#fff2eb`, ink `--color-accent-700`. Copy: `⛓ synced pan · zoom · layer · selection`.
- `trace tree` toggle — pill with overlay active state.
- Squashed notice (when the pane is wanted but the window is too narrow) — `1px dashed #c0b6a5`, JetBrains Mono 400 9px, `--color-neutral-600`. Copy: `pane needs a wider window`.

### 4. Centre — canvas

See the two-palette section for ground, grid, hairline, node and edge colour.

- **Node radius**: `min(9, 2.6 + degree × 0.5)`, `+2` when selected. Degree-scaled.
- **Node shape**: from class; all become circles when shape encoding is off.
- **Hop ring**: nodes at hop ≥ 2 get a second circle at `r + 3.5`, `fill:none`, stroke = class colour, 0.7px, `strokeOpacity: op × 0.9`. This keeps distant-but-reachable nodes findable once their fill has faded.
- **Node opacity**: `decayAlpha[min(hop,3)] × (layerOpacity/100)`. Nodes outside the subgraph go to `0.1` (or are removed entirely in `filter` mode).
- **Labels** (when labels are on): shown for the selected node, any node at hop ≤ 1, and **always** for `case` nodes. JetBrains Mono, 11px selected / 9px otherwise, `fill: #201e1d`, `fillOpacity: max(op, 0.55)`, `pointer-events:none`.
  Placement measures the string (mono advance ≈ 0.6em → `len × 6.6` selected, `× 5.4` otherwise) and draws right of the node by default; **flips to the left only if the flipped position also fits**, and both branches clamp inside the box (6px inset) so labels never run off either edge.
- Clicking a node selects it; clicking bare SVG background clears the selection.
- **Corner tag** — top-left pill, `1px solid divider`, `background:#f9f4ed`, JetBrains Mono 400 10px, `--color-neutral-700`, ellipsised. Reads `L3 · clustered · 118 n · 190 e · focus highlight · 2 hop`; in compare mode prefixed `A · ` / `B · `.
- **Minimap** — bottom-right, 104×68, `radius 6px`, `1px solid #c0b6a5`, `background:#f9f4ed`, containing a viewport rect at `left:22% top:20% width:44% height:52%`, `1px solid #c67139`, `radius 3px`. **Decorative in the prototype** — wire it to real viewport state.

Decay curves (opacity by hop 0..3), selectable via tweak:

| Curve | hop 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| gentle | 1 | 1 | 0.75 | 0.5 |
| standard (default) | 1 | 1 | 0.55 | 0.28 |
| steep | 1 | 0.85 | 0.35 | 0.12 |

**Compare mode** renders two canvases side by side from two different seeds,
split by a 1px divider, each at half width. Selection, active layer, class
filters and focus settings are shared across both.

### 5. Centre — trace tree pane

280px fixed, left divider, `background:#f9f4ed`. Hidden when `colW < 640`.

Header: `trace · <rootId>` (JetBrains Mono 500 10px, `.06em`, uppercase, ellipsis)
plus `expand` / `collapse` pills (`padding:4px 8px`, 9px). Expand sets base depth
to 4 and clears manual toggles; collapse sets base depth to 1.

Cap notice (when the row cap is hit) — `1px dashed #b2622d`, `radius 8px`,
`background:#fff2eb`, ink `--color-accent-800`, JetBrains Mono 400 9px/1.4. Copy:
`row cap reached — paths replicate shared nodes, deeper branches shown as "+n more"`.

Rows: `margin-left: depth × 13px`, `padding:4px 7px`, `border-radius:999px`,
hover `background:#efe8de`. The row for the currently-selected node gets the
overlay treatment (`1px solid #c67139` + `#fff2eb`). Each row holds: a caret
button (13px, JetBrains Mono 9px, `▾` open / `▸` closed / `·` leaf — click must
`stopPropagation` so it doesn't also select), a 9px class glyph, the node id
(JetBrains Mono 400 10px, ellipsis), and the relation label (9px,
`--color-neutral-600`, `max-width:78px`, ellipsis; root shows `root`).

Tree semantics: DFS from the root over **outgoing** edges, cycle-guarded by the
path set (so a node can appear on several distinct paths — it's a path tree, not
a node tree). `MAX_TREE_DEPTH = 4`, `MAX_TREE_ROWS = 160`. Nodes are open by
default while `depth < baseDepth` (default 2); explicit user toggles override.

### 6. Right inspector

Tab bar: `padding:11px 12px; gap:6px`, bottom divider. Tabs `Node` / `Layer` /
`Alignment` — `padding:7px 11px`, `radius 6px`, JetBrains Mono 500 10px; active
gets overlay `1px solid #c0b6a5` + `background:#ebddc5`. **In compare mode the
order becomes `Alignment` / `Node` / `Layer` and Alignment is auto-selected.**

Body: `padding:14px`, `gap:12px`, scrolls.

**Node tab** — title row: 18px class glyph, node id (Figtree 700 17px, ellipsis),
class pill (`1px solid #c67139`, `background:#fff2eb`, ink `--color-accent-700`,
JetBrains Mono 500 9px). Then a metrics list — rows `padding:5px 0`, bottom
divider, JetBrains Mono 400 11px, label in `--color-neutral-600`: class · shape,
out/in degree, reached · N hop, trace direction, tree rows. Then **Present in
layers** — four chips L0–L3; present = `1.5px solid #b2622d`, `background:#ffe1d0`,
ink `--color-accent-800`, 600 weight; absent = `1.5px dashed #c0b6a5`,
transparent, `--color-neutral-600`, `line-through`. Then neighbour groups
(`outgoing · hop 1`, `incoming · hop 1` when direction is both, then
`reachable · hop N` for each hop ≥ 2), max 6 rows each: 9px class dot, node id
(JetBrains Mono 400 10px), a 52×4px weight bar (`background:#dcd3c4`, fill
`#c67139`, width = weight %), and the numeric weight (9px, right-aligned, 30px).
Rows are clickable → select that node. Finally two pills: `focus neighbourhood`
(sets focus to highlight) and `root the trace tree here`.

Empty state: id reads `nothing selected`, single metric row `hint` /
`click a node on the canvas`.

**Layer tab** — layer name (Figtree 700 17px), rule prose (Figtree 400 12px/1.55,
`--color-neutral-700`, `text-wrap:pretty`), then `Delta over previous layer` and a
three-column table (label / nodes / edges, 56px right-aligned numeric columns,
JetBrains Mono 400 11px, row dividers).

**Alignment tab** — header `Alignment` … `N / M matched`. Table with a 6px
selection-marker column (3×16px `999px` `#c67139` bar on the selected row), then
`A`, `B`, `reach A/B`, `Δ`. JetBrains Mono 400 10px, `th` 500 weight in
`--color-neutral-600` with a `#c0b6a5` bottom rule, `td` with divider rules. Rows
clickable → select. Unmatched B shows `—` and Δ shows `A only`.

---

## Interactions & behaviour

- **Select node** — click canvas node, tree row, neighbour row, or alignment row. Recomputes BFS distances. If the tree root was unset or was tracking the previous selection, the root follows; otherwise it stays pinned. Switches the inspector to `Node` unless the user is on `Alignment`.
- **Clear selection** — click bare canvas. Tree root is retained.
- **Focus modes** — `none`: no decay, everything at full opacity. `highlight`: subgraph at decay alpha, everything else at 0.1. `filter`: non-subgraph nodes and edges are removed from the DOM entirely.
- **Hops** — 1/2/3, sets BFS depth.
- **Direction** — `downstream` follows outgoing edges only; `both` follows in and out. Affects BFS, the inspector's incoming group, and nothing else (the tree is always outgoing).
- **Class toggle** — removes that class from the view; layer counts, node counts and edges recompute.
- **Layer visibility / opacity / active** — active layer sets the ceiling: nodes and edges with `layer > active` are excluded. Per-layer opacity multiplies into node and edge alpha.
- **Tree expand/collapse** — per-row toggles stored by path key; expand/collapse-all resets toggles and moves the base depth.
- **Responsive** — tree pane auto-hides below 640px column width, showing the squashed notice. Toolbar wraps. Grid columns clamp via `minmax`.
- No transitions or animations anywhere. Interaction feedback is immediate state change. Hover is a border-colour or background change only.
- **Focus-visible** must be `2px solid var(--color-accent)` with `2px` offset per the Organic system — the prototype relies on the design system's stylesheet for this; ensure your implementation keeps it.

**Not implemented in the prototype** (design intent exists, behaviour doesn't):
search/jump, "build a layer over top", canvas pan/zoom, and the minimap viewport.

## State management

```
mode: 'layers' | 'compare'            // top-bar mode
panel: 'node' | 'layer' | 'align'     // inspector tab
active: 0..3                          // active (ceiling) layer index
vis: boolean[4]                       // per-layer visibility
op: number[4]                         // per-layer opacity 0..100
cls: Record<classKey, boolean>        // class filter
selected: nodeId | null
treeRoot: nodeId | null
focus: 'none' | 'highlight' | 'filter'
hop: 1 | 2 | 3
dir: 'down' | 'both'
labels: boolean
tree: boolean | null                  // null = follow the treePane default
open: Record<pathKey, boolean>        // tree row overrides
baseDepth: number                     // default-open depth
query: string                         // search box (unwired)
colW, paneH: number                   // measured column box — see layout constraint
```

Derived per render, not stored: the filtered view (nodes, edges, adjacency,
degrees, BFS distances), the tree rows, and the graph width. Data fetching:
the real implementation needs the layer stack with per-layer node/edge deltas,
and a node-neighbourhood query (id → outgoing/incoming edges with weights and
relation labels) fast enough to run on every selection, ideally to depth 4 for
the trace tree.

## Design tokens

**Organic tokens** (from `reference/organic-styles.css`, authoritative):

- Ground `#f5ead8` · surface `#ebddc5` · text `#201e1d` · divider `rgba(32,30,29,.16)`
- Accent (terracotta) `#c67139`; ramp 100→900: `#fff2eb #ffe1d0 #ffc6a5 #f6a06b #d67f48 #b2622d #8c491a #643312 #402310`
- Accent 2 (sage) `#7a8a5e`; ramp: `#f0fae1 #e1eecc #ccdbb2 #aebf92 #8fa073 #728157 #56633f #3d472b #272e1b`
- Neutral ramp: `#f9f4ed #eee7db #dcd3c4 #c0b6a5 #a19786 #82796a #645c50 #474238 #2e2b25`
- Radii: sm 8px · md 16px · lg 28px · pills 999px
- Spacing: 4.4 / 8.8 / 13.2 / 17.6 / 26.4 / 35.2px
- Shadows: sm `0 1px 2px rgba(46,43,37,.14)` · md `0 3px 10px .16` · lg `0 12px 32px .22`

**Canvas data palette** — see the two-palette section table.

**Type.** The Organic system pairs Caprasimo (display) with Figtree (body). This
workspace **deliberately uses no Caprasimo** — a dense analytical tool has no
display-type moment, and the rounded display face fights the data. Instead:

- **Figtree** for prose and titles: 700 17px/1.15 panel titles, 400 12px/1.55 body prose, 600 12px buttons.
- **JetBrains Mono** for every identifier, count, metric, label and control — the tool's working voice. 9px (micro-counts, relation labels), 10px (controls, tree rows, canvas tag), 11px (metrics, class labels, node labels), 12px (wordmark). Section headers: 500 10px, `letter-spacing:.08em`, uppercase, `--color-neutral-600`.
- Load: `Figtree:wght@400;600;700` and `JetBrains Mono:wght@400;500`.

Note the local departures from the Organic guide, all deliberate and worth
keeping: no Caprasimo, mono as the interface voice, 8px/6px radii on dense
controls rather than 16px, and hairline 1px geometry throughout — the guide's
"don't draw hairline-only geometry" advice is written for marketing surfaces, not
for a data workspace where 16px radii and airy spacing would halve the visible
graph. Brand character is carried by the palette, the pill controls and the warm
ground instead.

## Assets

None. No images, no icon files — every glyph is a styled `div`/`span` or an SVG
primitive, and the few symbols used (`▾ ▸ · → ⇄ ⛓ ◦ +`) are text characters. The
Organic system specifies **Lucide** icons at stroke-width 2.75 if your
implementation wants real icons for the toolbar toggles.

## Files

- `reference/Semantic Box v2.dc.html` — the design. Markup is the shell and panels; the `<script>` at the bottom holds the model, the palette constants, the canvas renderer and all derived state.
- `reference/organic-styles.css` — the Organic design system stylesheet (tokens + component layer).
- `reference/support.js`, `reference/ds-base.js` — prototype runtime and design-system loader. **Environment scaffolding only — nothing to port.**

To view the prototype, open `reference/Semantic Box v2.dc.html` in a browser
(serve the folder over HTTP rather than `file://`).
