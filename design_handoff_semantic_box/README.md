# Handoff: Semantic Box — layered graph workspace

> This is the **design/interaction spec**. For usage and code documentation of
> the built app see [`../docs/`](../docs/) (user guide, developer guide, data
> format reference).

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

**Deviation — the tripartite (miR / mRNA / pathway) build ships caller-supplied
hues.** The production canvas palette is now driven by `js/graph-model.js`
`CLASSES` and is set for figure consistency with the rest of the paper, not by
the walk-the-wheel construction above: `MicroRNA` `#EF3B2C` (diamond),
`Messenger RNA` `#6BAED6` (circle), `Pathway` `#FF8000` (box) — a ColorBrewer
RdBu-style red/blue pair plus a saturated orange. Shape encoding is unchanged,
so greyscale / colour-blind legibility still holds. `NSM_IDENTITY` (violet
`#8a4cc4` / teal `#0d8794`) is untouched — still distinct from all three.
Editing `CLASSES` is the supported way to re-skin the canvas.

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

The top bar carries **identity, dataset, and mode only**. Panel and
canvas-overlay toggles live in the toolbar's `view` menu (§3, §12); compare's
sub-controls live in the toolbar's Compare cluster (§3). Left to right:

- Identity mark — 22×22 inline SVG (`.topbar__mark`), the flat cardboard-box
  illustration (see §Assets). Sits first, before the wordmark, in the bar's
  standard `gap:10px`.
- Wordmark `semantic box` — JetBrains Mono 500 12px, `letter-spacing:.08em`, uppercase.
- Dataset **segmented control** — one option per loaded dataset, `dsLabel(key)`
  copy (§9). Selecting one is `setDataset` (resets selection / tree / q-threshold).
- `manage graphs` — `toolbar-pill`, opens the modal (§10).
- Load-error text, when a dataset fails to load — JetBrains Mono 400 11px, `--color-accent-800`.
- Spacer.
- Search input — 170px wide, `padding:7px 11px`, `border:1px solid #c0b6a5`,
  `border-radius:999px`, `background:#f9f4ed`, JetBrains Mono 400 11px.
  Placeholder: `search & jump`. **Not yet wired** — state exists, filtering isn't implemented. Implement as jump-to-node.
- Hairline rule (`.bar-rule` — 1px × 20px, `--color-divider`, `align-self:center`).
- `mode` label + **segmented control** `layers` / `compare`. This was two
  Figtree-600 pills; it is now a mono `seg`, the same idiom as Focus / Direction,
  so every mode switch in the app looks the same. `showLayers` / `showCompare`;
  leaving compare also clears `nsmMetric` (§3). There is no standalone
  dataset-label readout any more — the segmented control is the single source of
  that truth.

> The overlay-span pattern for active/selected states recurs throughout (rail,
> toolbar, tree, inspector, the `view` pill). It exists so the border thickening
> doesn't shift layout. In your framework a simple
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
Clusters are separated by a hairline `.bar-rule` (1px × 20px, `--color-divider`) so
they stay legible when the row wraps.

**Subgraph cluster** — the query that defines the highlighted neighbourhood:

- `Focus` segmented control — `none` / `highlight` / `filter`. Track: `padding:2px`, `1px solid #c0b6a5`, `999px`, `background:#f9f4ed`. Option: `padding:5px 11px`, JetBrains Mono 500 10px. Selected: `999px` fill `#c67139`, ink `#f9f4ed`; unselected ink `--color-neutral-700`. Default `highlight`.
- `Hops` segmented control — `1` / `2` / `3`, each option 26px wide. Default `2`.
- `Direction` segmented control — three options, not a toggle: `→ down` (downstream only — follow outgoing edges), `← up` (upstream only — follow incoming edges), `⇄ both`. Default `→ down`. Affects BFS (see below), the inspector's outgoing/incoming neighbour groups (each group shows only when the current direction includes it — outgoing hidden in `up`, incoming hidden in `down`, both shown in `both`), and the `nodeMetrics` "trace direction" readout. The trace tree is unaffected — it is always outgoing, regardless of this control.

**Compare cluster** — rendered **only in compare mode** (`v-if="isCompare"`), after a hairline rule:

- `Compare` section label, then `vs` + a dataset `<select>` (`.nsm-select`) choosing side B / the Alignment tab's B (`compareDataset` — §9).
- `by` + a metric `<select>` (`.nsm-select`) — the NSM (node-specificity-by-metric) picker; first option is `off`. When a metric is chosen, a `specific` / `conserved` / `rewired` segmented control follows, and — for `conserved` / `rewired` only — a `split` Jaccard-cutoff slider (`.nsm-jaccard`, native `input[type=range]` 0–1, `accent-color: var(--color-accent)`, with a `J ≥ N.NN` readout). See §4 for what `conserved` / `rewired` mean and why the cutoff is user-set.
- `Reach` — an `off` / `intersection` / `difference` segmented control (`reachOp`), the reach set comparison (§13). The two set-op labels are spelled out in full (rather than `shared` / `unique`) so they don't read as another spelling of the NSM `shared` classification beside them. Compare-only; reset to `off` by `showLayers` alongside `nsmMetric`.
- Compare-mode badge — now a bare `⛓` glyph (`.compare-badge.compare-badge--icon`), same `1px solid #c67139` / `background:#fff2eb` pill, with the former copy (`pan, zoom, active layer and selection stay in sync across both canvases`) moved to its `title` tooltip. It was a full-width label; the sync it announces is real (§4) but the text was crowding the cluster, so it shrank to its icon.
- NSM is a cross-dataset feature, so it lives here and nowhere else. `showLayers` sets `nsmMetric = 'none'` on the way out, or nodes keep the NSM label/ring treatment with no visible control to clear it.

**Spacer**, then — when `hiddenCount > 0` — the **`hidden (N) ▾` menu** (§14), then the **`view` menu** (right-aligned) — a `toolbar-pill` `view ▾` with the overlay-active idiom, opening a popover (§12) that gathers every show/hide + filter + reset:

- Panels: `rail`, `inspector`, `trace tree` — checkbox rows (`toggleRail` / `toggleInspector` / `toggleTree`). The tick reflects the *shown* state, so `trace tree` reads unchecked at `colW < 640` even when wanted.
- Canvas overlays: `labels`, `info band`, `minimap` (`toggleLabels` / `toggleCornerTag` / `toggleMinimap`). Default all on. They exist because on a dense layout an overlay can sit on top of graph content the user needs.
- Canvas filters: `dead-end nodes` (`toggleNoDownstream`) — a checkbox row whose tick means *shown* (checked when `!hideNoDownstream`), like the overlay rows. Unchecking it hides every **non-Pathway** node with no downstream (outgoing) edge — a MicroRNA or Messenger RNA that doesn't lead anywhere (e.g. an mRNA with no surviving Pathway link). It is **iterated to a fixpoint** in `computeView`, so removing a dead-end mRNA also drops any MicroRNA left pointing only at dead ends; what remains is exactly the nodes still on a miR → mRNA → Pathway chain. Pathways are deliberately exempt — they are the sink class by design, not dead ends, and removing them would cascade the whole graph away. Default shown.
- Canvas filters: `minor-component nodes` (`toggleLargestComponentOnly`) — a checkbox row whose tick means *shown* (checked when `!largestComponentOnly`), same idiom as `dead-end nodes`. Unchecking it hides every **non-Pathway** node whose `is_in_largest_component` flag is 0 (`n.metrics.inLargestComponent` false), keeping the graph to its dominant connected component; the existing pathway-orphan / dangling-edge cleanup in `computeView` runs afterward. Pathways carry no component flag and are always kept. The row is hidden entirely (computed `hasComponentData`) for datasets whose nodes CSV lacks the column, and the filter is inert in `computeView` when no surviving node carries the flag. Default shown.
- `reset pan & zoom` — action row, no checkbox (`resetView`).

Squashed notice (when the trace pane is wanted but the window is too narrow), right after the `view` menu — `1px dashed #c0b6a5`, JetBrains Mono 400 9px, `--color-neutral-600`. Copy: `trace pane needs a wider window`.

### 4. Centre — canvas

See the two-palette section for ground, grid, hairline, node and edge colour.

- **Node radius**: `min(9, 2.6 + degree × 0.5)`, `+2` when selected. Degree-scaled.
- **Node shape**: from class; all become circles when shape encoding is off.
- **Hop ring**: nodes at hop ≥ 2 get a second circle at `r + 3.5`, `fill:none`, stroke = class colour, 0.7px, `strokeOpacity: op × 0.9`. This keeps distant-but-reachable nodes findable once their fill has faded.
- **Node opacity**: `decayAlpha[min(hop,3)] × (layerOpacity/100)`. Nodes outside the subgraph go to `0.1` (or are removed entirely in `filter` mode).
- **Labels** (when labels are on): shown for the selected node, any node at hop ≤ 2, and **always** for `case` nodes. JetBrains Mono, 11px selected / 9px otherwise, `fill: #201e1d`, `fillOpacity: max(op, 0.55)`, `pointer-events:none`. (Raised from hop ≤ 1 to hop ≤ 2 — with the tripartite dataset, a 2-hop BFS from a MicroRNA node reaches its Pathways only at hop 2, and those were going unlabelled even though the hop-ring and edges already made them visually part of the subgraph.)
  Placement measures the string (mono advance ≈ 0.6em → `len × 6.6` selected, `× 5.4` otherwise) and draws right of the node by default; **flips to the left only if the flipped position also fits**, and both branches clamp inside the box (6px inset) so labels never run off either edge.
  **NSM mode** (`by` metric ≠ `off` in the compare-mode Compare cluster — §3) normally replaces this rule with "only NSM-marked nodes (**or** the selected node) get a label," so a few hundred faded genes don't bury the handful that matter for the metric — while a node the user has actually clicked still shows its label on *both* canvases (selection is shared by id), even when it carries no NSM mark on one side. But that restriction must be scoped **per node class**, not applied globally: check it against `nsmMarkableClasses` — the set of classes that have *any* non-null `n.nsm[metricKey]` entry anywhere in either loaded dataset — and only suppress the normal label rule for a node whose own class is in that set. NSM analysis today is computed exclusively for MicroRNA (see `js/data-loader.js` — Messenger RNA and Pathway rows always parse to `[]`/`null`), so `nsmMarkableClasses` never contains those two classes; a node of either class keeps the ordinary "selected + hop ≤ 2" label rule regardless of whether Compare By is on. Getting this wrong — checking "does *any* mark exist anywhere" instead of "can *this node's class* ever be marked" — reads as: turn on any metric, and every Messenger RNA and Pathway label vanishes instantly, permanently, for as long as Compare By stays on, even though they're still visibly part of the highlighted subgraph (hop rings, edges, opacity all still show it). Both shipped datasets (`examples/basal-like_nodes.csv`, `examples/luminal-a_nodes.csv`) carry the full NSM column set, so Compare By against either exercises this path directly. The "no NSM data at all" fallback (`nsmMarkableClasses` empty → every class keeps the ordinary label rule) is not exercised by shipped data any more; the case to test it against is an uploaded nodes CSV with only `id,label,type`.

  **NSM classification states.** Each `*_descending` / `*_ascending` cell parses (`parseNsmCell`) to one of: nothing (`[]` — not a high-p node for this metric); `specific` (`[['specific']]` — high-p in *this* dataset only); or `shared` (`[['shared', otherDatasetDisplayName, jaccard]]` — also high-p in one other dataset, with the Jaccard similarity of the two neighbourhoods). The comparison never marks `shared` directly — it splits it, by the user's `split` Jaccard cutoff (§3), into **`conserved`** (`jaccard ≥ cutoff` — the wiring around the node is similar in both datasets) and **`rewired`** (`jaccard < cutoff` — same node, meaningfully different wiring). There is no canonical cutoff, hence the slider; it defaults to `0.5`. `computeNsmMarks(metricKey, state, cutoff, …)` folds this through `nsmStateMatches`; `specific` still gets an own-side-only strong mark with no echo, `conserved` / `rewired` get the strong mark plus the faint same-colour echo on the other canvas (`info.other` is a dataset *display name*, so it's `slugify`'d before matching the dataset *key*). The same classification is also tabulated per miRNA per metric in the compare-only `NSM` inspector tab — see §15.
- Clicking a node selects it; clicking bare SVG background clears the selection.
- **Corner tag** — top-left pill, `1px solid divider`, `background:#f9f4ed`, JetBrains Mono 400 10px, `--color-neutral-700`, ellipsised. Reads `L3 · clustered · 118 n · 190 e · focus highlight · 2 hop`; in compare mode prefixed `A · ` / `B · `. Hideable via the `view` menu's `info band` row — it can sit on top of nodes near the top-left corner on a dense layout.
- **Minimap** — bottom-right, 104×68, `radius 6px`, `1px solid #c0b6a5`, `background:#f9f4ed`, containing a viewport rect, `1px solid #c67139`, `radius 3px`. Wired to the real pan/zoom transform: rect `left/top/width/height` are `-panX/k`, `-panY/k`, `100/k`, `100/k` percent of the canvas box. `overflow:hidden` on the minimap crops the rect when panned/zoomed past the edge rather than letting it escape the box. Hideable via the `view` menu's `minimap` row, independently of the corner tag — same rationale.

- **Pan & zoom** — implemented. Mouse wheel zooms anchored on the pointer (clamped `0.5×`–`8×`); click-drag pans. Both live as a single `{x, y, k}` transform applied via an SVG `<g transform="translate(x,y) scale(k)">` wrapping the edges/nodes/labels, so labels and stroke widths scale with content (standard SVG behaviour — no `vector-effect` correction applied). The `reset pan & zoom` row in the `view` menu resets the transform to identity. In compare mode the transform is a single shared value driving both canvases — this is what makes the existing "synced pan · zoom" compare-badge copy true rather than aspirational.

  **Do not use `setPointerCapture` on the pan-handling element.** Per the Pointer Events spec, capturing a pointer retargets its subsequent *compatibility mouse events* — including `click` — to the capturing element too. Since node selection relies on a `@click` bound directly to each node's own SVG shape, capturing on the wrapping `.canvas` div silently swallows every node click once a drag has been armed (pointerdown always arms it, even for a plain click). Track the drag via `window`-level `pointermove`/`pointerup` listeners added on `pointerdown` and removed on `pointerup` instead — this keeps tracking the pointer outside the element's bounds without touching event targeting. Disambiguate a pan from a click with a small movement threshold (~3px in canvas units) recorded on a `_dragMoved` flag, checked by both the node click handler and the background-click handler (`svgClick`) — a background click also must not fire immediately after a pan that happens to release over empty canvas.

  **`:viewBox` needs the `.camel` modifier — this is an in-DOM-template app.** This app has no build step: `index.html`'s markup *is* the Vue template, parsed once by the browser's native HTML tokenizer before Vue ever sees it. That tokenizer lowercases attribute names it doesn't recognize verbatim, and `:viewBox` (with the leading colon) isn't in its fixed list of case-preserved SVG attribute names — only the literal name `viewBox` is. The result: `:viewBox="expr"` silently becomes the attribute `viewbox` in the parsed DOM, Vue's runtime compiler reads that already-lowercased name, and it ends up calling `setAttribute('viewbox', ...)` — which the SVG spec does not recognize, so the element's actual `viewBox` is simply never set. The failure mode is quiet rather than loud: the canvas still renders, because `canvasWidth`/`canvasHeight` are derived from the *measured* size of the container the `<svg>` fills at `100%/100%`, so the "no scaling at all" fallback (1 SVG user-unit = 1 rendered px) lands within a pixel or so of what a working viewBox would have produced anyway. It only becomes consequential for code that does its own screen-to-SVG coordinate math (pan/zoom, and the hover hit-test in §11) — that math assumes a real `scaleX = canvasWidth / rect.width` correction is meaningful, which is only true once the viewBox is actually influencing rendering. The fix is Vue's own documented workaround for exactly this class of bug: bind the **kebab-case** attribute name with the `camel` modifier — `:view-box.camel="expr"` — never `:viewBox`, in any template that reaches the browser as raw HTML rather than through a build-time compiler. `view-box` has no uppercase letters, so the native tokenizer passes it through untouched; Vue then camelizes it back to `viewBox` itself before setting the attribute.

Decay curves (opacity by hop 0..3), selectable via tweak:

| Curve | hop 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| gentle | 1 | 1 | 0.75 | 0.5 |
| standard (default) | 1 | 1 | 0.55 | 0.28 |
| steep | 1 | 0.85 | 0.35 | 0.12 |

**Compare mode** renders two canvases side by side, one per dataset, split by
a 1px divider, each at half width. Selection, active layer, class filters and
focus settings are shared across both. Side A is `activeDataset` (the top-bar
dataset seg); side B is `compareDataset`, chosen from a `vs` select in the
toolbar's Compare cluster (§3, visible only in Compare mode) — see §9 for why a
separate B picker exists rather than B just being "the other dataset".

**Unmatched selection.** The shared `selected` id is looked up independently
in each dataset — see §9's `matchLabel`/Alignment-tab description. When that
id exists in one dataset but not the other, the side where it's absent must
render as "nothing in the subgraph," not as "nothing selected." Concretely:
the per-side dim/filter decision (`focus:none` → full opacity, `filter` →
remove non-subgraph nodes, otherwise → dim to `0.1`) must key off the
**global** `this.selected`, not that side's own resolved `v.sel` — `v.sel` is
`null` in both "nothing is selected anywhere" and "something is selected but
not on this side," and those two cases need opposite treatment. Getting this
wrong reads as: select a node on side A that has no counterpart on side B, and
side B lights up at full brightness as if focus were off, instead of dimming
(or, under `filter`, emptying) like every other "not part of the current
subgraph" case in the app already does.

### 5. Centre — trace tree pane

280px fixed, left divider, `background:#f9f4ed`. Hidden when `colW < 640`.

Header: `trace · <root label>` (JetBrains Mono 500 10px, `.06em`, uppercase,
ellipsis; the node's `label`, never its raw `id` — §7 — via the `traceHeader`
computed) plus `expand` / `collapse` pills (`padding:4px 8px`, 9px). Expand sets
base depth to 4 and clears manual toggles; collapse sets base depth to 1. **In
compare mode the header is prefixed `A · ` / `B · `** — see "side-aware in
compare mode" below.

**The tree always tracks the current selection.** There is no manual "pin the
root" mode. `select(id)` sets `treeRoot = id` whenever `id` is non-null;
clearing the selection (bare-canvas click) leaves `treeRoot` on the last node
so the pane keeps showing something rather than blanking, and
`effectiveTreeRoot` falls back to it (then to `null`) when that node is
filtered out of the current trace-side view. `openInTree()` ("root the trace
tree here" in the Node tab) now just reveals the pane and resets the base
depth at the selected node. *(A previous "pinned root" heuristic — root stays
put while you select elsewhere unless it was "tracking" the selection — was
removed: after a null selection it wedged `treeRoot !== selected` permanently
and the tree silently stopped following new clicks.)*

**Side-aware in compare mode.** The trace tree reads from `traceView` — the
canvas side of the **last node click** (`traceSide`, `'A'` | `'B'`, set by
`nodeClick(id, side)`; inspector rows force `'A'` via `selectA`). Click a node
on the right (B) canvas and the tree re-roots there against dataset B's graph;
click left and it's back to A. `traceSide` resets to `'A'` on every mode /
dataset switch. In Layers mode it is always `'A'`. `effectiveTreeRoot`,
`treeData` and `treeRowsRender` all read `traceView`, not the side-A `view`.

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
order becomes `Alignment` / `Node` / `Layer` / `NSM` (a fourth, compare-only
tab — §15) and Alignment is auto-selected.** `showLayers()` moves `panel` off
`NSM` as well as `Alignment`.

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

- **Select node** — click canvas node, tree row, neighbour row, or alignment row. Recomputes BFS distances. The trace-tree root always follows the new selection (§5 — no pinning). In compare mode a canvas-node click also points the tree at that side (`traceSide`). Switches the inspector to `Node` unless the user is on `Alignment` or `NSM`.
- **Clear selection** — click bare canvas. `treeRoot` is retained (last node) so the pane doesn't blank; the next selection re-roots it.
- **Hide node** — `Del` / `Backspace` while a node is selected (the app's only keyboard shortcut; ignored while an `input`/`select`/`textarea` has focus), or the Node tab's `hide node` pill. See §14.
- **Focus modes** — `none`: no decay, everything at full opacity. `highlight`: subgraph at decay alpha, everything else at 0.1. `filter`: non-subgraph nodes and edges are removed from the DOM entirely.
- **Hops** — 1/2/3, sets BFS depth.
- **Direction** — `down` follows outgoing edges only; `up` follows incoming edges only; `both` follows both. Affects BFS, which of the inspector's outgoing/incoming groups render, and nothing else (the tree is always outgoing).
- **Mode** — `layers` / `compare` segmented control in the top bar. `showLayers` also clears `nsmMetric` and moves the inspector off `Alignment`; `showCompare` selects the `Alignment` tab. Both reset `railOpen` / `inspectorOpen` to their mode defaults.
- **View menu** — a toolbar popover (§12) toggling the three side panels (rail, inspector, trace tree), the three canvas overlays (labels, info band, minimap), and the `dead-end nodes` / `minor-component nodes` canvas filters, plus a reset-pan/zoom action. Dismiss: click the scrim, or resize the window.
- **Export menu** — an `export ▾` `toolbar-pill` + popover (the §12 shell again) in the right-aligned toolbar cluster, before `view ▾`. Two rows: `SVG (vector)` and `PNG (3× raster)`. Both serialise the live canvas `<svg>`(s) straight from the DOM — node/edge styling is already inline SVG presentation attributes — add a white background, an explicit size/viewBox, and (compare mode) combine the two canvases into one image split by a 1px divider. The on-screen dot grid is left out deliberately. PNG additionally inlines the JetBrains Mono / Figtree woff2 as base64 `@font-face` before rasterising (best-effort; falls back to `monospace`). SVG references the families by name — font-accurate wherever they're installed. Filename `semantic-box_<A>[_vs_<B>]_<yyyymmdd-hhmm>.{svg,png}`. Implementation: `js/svg-export.js` (`serializeCanvasSVG` / `rasterize` / `triggerDownload`), driven by `exportSVG()` / `exportPNG()` in `js/app.js`.
- **Class toggle** — removes that class from the view; layer counts, node counts and edges recompute.
- **Layer visibility / opacity / active** — active layer sets the ceiling: nodes and edges with `layer > active` are excluded. Per-layer opacity multiplies into node and edge alpha.
- **Tree expand/collapse** — per-row toggles stored by path key; expand/collapse-all resets toggles and moves the base depth.
- **Responsive** — tree pane auto-hides below 640px column width, showing the squashed notice. Toolbar wraps. Grid columns clamp via `minmax`.
- No transitions or animations anywhere. Interaction feedback is immediate state change. Hover is a border-colour or background change only.
- **Focus-visible** must be `2px solid var(--color-accent)` with `2px` offset per the Organic system — the prototype relies on the design system's stylesheet for this; ensure your implementation keeps it.

**Not implemented in the prototype** (design intent exists, behaviour doesn't):
search/jump and "build a layer over top". (Canvas pan/zoom and the minimap
viewport *are* implemented in the production build — see "Pan & zoom" above.)

### 7. Node identity: id vs. label

Every node carries both an `id` (a stable key — gene symbol, KEGG id like
`KEGG:04510`, miRNA accession) and a `label` (a human-readable name — for most
classes these are identical, but Pathway nodes have a real display name, e.g.
`Focal adhesion`). **Every place a node's identity is shown to the user must
render `label`, never `id`** — canvas text, tree rows, neighbour rows, the
node inspector title, the alignment table. `id` stays the internal key for
selection, BFS, edge endpoints, Vue `:key`, and the trace-tree path set — it
never appears in copy. Because `label === id` for MicroRNA and Messenger RNA
in the current dataset, this rule is invisible for those two classes and only
changes what Pathway nodes look like; keep it generic (render `label` with an
`id` fallback) rather than special-casing the Pathway class, so it holds for
any future class whose id and display name diverge.

### 8. Pathway q-value filter (real-data addition, not in the original prototype)

The reference prototype's synthetic model has no concept of statistical
significance. The real tripartite dataset does: every **Pathway node** carries
a q-value (its enrichment significance). *(Schema note: this q-value used to
sit on the Messenger RNA → Pathway edge; it moved onto the Pathway node, and
those edges now carry nothing — the presence of a `correlation` value is what
distinguishes a MicroRNA → Messenger RNA edge from a Messenger RNA → Pathway
one. MicroRNA / Messenger RNA nodes leave `qvalue` blank.)* The production
build adds a **q-value threshold filter**, styled as a new rail section
following the existing `hop-legend` pattern (title + control, in
`.rail-bottom`, top divider):

- A native `input[type=range]` spanning the dataset's actual observed
  min→max Pathway q-value (not a fixed 0–1 range), `accent-color: var(--color-accent)`
  matching every other slider in the app (see the layer-card opacity slider).
  Reads "q ≤ &lt;value&gt; · N pathways shown" beneath it.
- **Semantics**: a Pathway node survives when `pathway.qvalue <= threshold` —
  the slider keeps pathways at or *below* the chosen significance value and
  hides the less-significant ones above it. A hidden Pathway is removed from
  the view entirely — not dimmed — and its mRNA → Pathway edges fall away with
  it (same `live[e.s] && live[e.t]` cleanup that hidden nodes use); this is the
  same "hide, don't fade" treatment `filter` focus mode gives non-subgraph
  nodes. (A Pathway that survives the q-filter but then loses every edge to
  the class filter is still dropped, as before.)
- **Orphaned Messenger RNA toggle** — a Messenger RNA that loses every Pathway
  edge to the q-value filter (regardless of whether it still carries a
  MicroRNA edge) is an "orphan." A `toolbar-pill` immediately below the
  slider, using the same overlay-active idiom as every other toggle pill in
  this app, switches between showing and hiding orphans. Default is **show**
  (`hideOrphanMrna: false`) — the q-value filter should not silently prune
  more of the graph than the user explicitly asked for until they opt in.
- Resets to the dataset's own maximum (i.e. unfiltered — every Pathway is at
  or below the max) on dataset switch, same `null`-follows-default idiom used
  elsewhere in the state (see `railOpen`/`treeShown`).

### 9. Example datasets, and a second selector for Compare mode's B side

The repo ships two real breast-cancer-subtype snapshots under `examples/`:
`basal-like` and `luminal-a` — both loaded up front in `mounted()`. The
top-bar dataset `seg` shows both, labelled with the short display names above
(`basal` for `basal-like`, `luminal-a` unchanged). `DATASET_LABELS`
(`js/graph-model.js`) is the source of that roster; it seeds both
`datasetMeta` (see §10) and the empty `datasets` map. The dataset **key**
stays the full prefix, because it doubles as the
`examples/<key>_{nodes,edges}.csv` filename; only the button copy
(`datasetMeta[key].label`, via the `dsLabel()` helper) is shortened. More
snapshots can be added at runtime via "manage graphs" (§10); the default two
are just a starting roster, not a fixed one.

Compare mode's second canvas can't simply be "the other one" — a user can load
three or more graphs, and the default roster could itself grow — so Compare
mode has its own second selector: a `compareDataset` state field (defaulting
to `basal-like`, with `activeDataset` defaulting to `luminal-a`), exposed as a
`vs` select
(styled as `.nsm-select`, same control used for the NSM metric picker beside
it) in the toolbar's Compare cluster (§3), shown only when `isCompare`. The
invariant `activeDataset !== compareDataset` is maintained by swapping rather
than blocking: picking a dataset that's already the other side swaps A and B
instead of colliding or silently no-op'ing. Only changing `activeDataset`
resets selection/tree/q-threshold state (see `setDataset`) — changing
`compareDataset` alone leaves those alone, since the shared `selected` id is
still meaningfully looked up against the (unchanged) side-A dataset.

### 10. Manage graphs — add/remove which datasets are loaded

The built-in datasets are a starting set, not a fixed roster: a `manage graphs`
toolbar pill in the top bar (next to the dataset seg) opens a modal to add a
user-supplied nodes/edges CSV pair as a new dataset, or remove any dataset —
built-in or user-added — from the list. This is the one place in the app that
needed a genuinely new chrome pattern (a modal), since nothing in the
one-screen shell previously needed to interrupt the main view; it still
follows the Organic chrome palette and control idioms throughout (cream
ground, JetBrains Mono, pill/dashed-border/`.rail-bottom`-style rows) rather
than inventing a separate visual language for it.

- **Trigger & shell** — `.modal-scrim` is a fixed, full-viewport flex-centred
  overlay (`rgba(32,30,29,.38)`) with `z-index:50`; clicking it (not its
  children — `@click.self`) closes the modal, same "click bare background to
  dismiss" idiom as `svgClick` clearing canvas selection. `.modal` itself uses
  `--radius-md` (16px) rather than the app's usual dense 8px — it's a
  dialog surface, not a control, so the Organic system's default radius
  applies here even though the README's "local departures" section says the
  dense chrome elsewhere deliberately doesn't use it.
- **Graph list** — one `.manage-row` per loaded dataset (label, live node/edge
  counts read straight from `datasets[key]`, a `custom` tag for anything with
  `datasetMeta[key].builtin === false`, and a `remove` pill). The remove pill
  is `disabled` whenever exactly one dataset remains — the app must always
  have something to show — with the disabled state's title explaining why
  rather than the button silently doing nothing.
- **Add-a-graph form** — a dashed `+ add a graph` button (same visual idiom as
  the rail's already-present, still-unwired "build a layer over top" button)
  expands an inline form: an optional name field (defaults to the nodes
  filename, minus extension and a trailing `_nodes`/`-nodes`, if left blank),
  then two `.dropzone` targets — one for the nodes CSV, one for the edges CSV —
  each accepting either a click-to-browse (a hidden `input[type=file]` per
  zone, triggered via a ref) or a real drag-and-drop (`@dragover.prevent` +
  `@drop.prevent`, reading `event.dataTransfer.files[0]`). Both paths feed the
  same `setAddFormFile(kind, file)`, so there is exactly one code path from
  "a File object exists" onward — don't let the two input methods diverge.
- **Validation** — `loadDatasetFromFiles` (`js/data-loader.js`) parses both
  files and checks, in order: the nodes CSV has `id` and `type` columns, the
  edges CSV has `source` and `target` columns, and at least one node's `type`
  matches a known class (`MicroRNA` / `Messenger RNA` / `Pathway` — the
  canvas literally cannot render a class it doesn't have a colour/shape for,
  so this must be checked before the dataset is accepted, not discovered
  later as an empty graph). Each failure throws a specific, actionable
  message that surfaces directly in `.add-graph-error` — a dashed accent box,
  same visual idiom as the trace-tree's row-cap notice.
- **On success** — the new dataset gets a unique key via `slugify(label)`
  (lowercase, non-alphanumerics collapsed to hyphens; a numeric suffix is
  appended on collision), is merged into `datasetMeta`/`datasets`, and is
  immediately made the active dataset (`setDataset(key)`) with the modal
  closed — the user gets to see their upload rendered right away as
  confirmation it worked, rather than having to go find it in the seg control.
- **Removing a dataset** keeps two invariants intact: `activeDataset` and
  `compareDataset` always point at something that still exists (falling back
  to another remaining key, swapping if a collision would result), and
  Compare mode drops back to Layers mode if removal leaves fewer than two
  datasets to compare — see `removeDataset`.

### 11. Hover emphasis — picking one node out of an overlapping cluster

Dense regions of the canvas (see the Messenger RNA columns at real dataset
scale — hundreds of same-size, same-colour circles a few px apart) make it
hard to land a click on one specific node. Hovering now emphasizes whichever
node the cursor is over, as a transient state distinct from selection, before
the user commits to a click.

- **Why not native per-shape `mouseenter`.** The obvious implementation —
  a `@mouseenter`/`@mouseleave` pair on each node's own SVG shape — only ever
  tells you which element the browser's hit-test put on top at that pixel,
  i.e. whichever node happens to be drawn last among the overlapping set. That
  does not track distance to any node's actual centre, so it can't answer "of
  the several circles under the cursor, which one is the cursor closest to
  the middle of" — exactly the case that makes overlap hard to work with.
- **What it does instead**: a single `mousemove` listener on the wrapping
  `.canvas` div (not the SVG, not per-node) converts the cursor position
  through the pan/zoom transform into the same "world" coordinate space
  `computeNodesFor` computes `cx`/`cy`/`r` in (`clientToViewBox` +
  `viewBoxToWorld`, shared with the wheel-zoom math — see §4's viewBox note),
  then does its own O(nodes) geometry pass: among every rendered node whose
  radius contains that point, pick the one nearest to its own centre. That is
  a direct, general answer to "which node is the mouse nearest to," rather
  than a workaround tied to any specific case — see `updateHover`.
- **RAF-throttled**: `mousemove` fires far more often than a frame renders,
  and this is O(nodes) work re-triggering a `nodesRender`/`nodesRenderB`
  recompute each time it changes. `onCanvasMouseMove` schedules at most one
  `updateHover` per animation frame via `requestAnimationFrame`, capturing
  `clientX`/`clientY`/`currentTarget` synchronously first — `currentTarget` is
  only valid for the duration of the event dispatch, so it cannot be read
  later from inside the deferred callback.
- **Suppressed during an active pan** (`this._panStart` set) — otherwise a
  fast drag would flicker the hover ring across everything it passes over,
  and there is nothing productive to emphasize mid-drag. Both hover fields are
  cleared on `pointerdown` so a stale ring doesn't linger through a pan.
- **Independent per canvas side** (`hoverA`/`hoverB`) — unlike pan/zoom, hover
  is never synced across Compare mode's two canvases; the cursor is only ever
  over one of them at a time.
- **Visual treatment**, applied in `computeNodesFor` (`isHovered` — never true
  for the already-selected node, so the two states don't visually compete):
  full opacity regardless of hop-decay/dim (the point is to pop one node out
  of a faded or overlapping cluster), a forced label at the selected node's
  larger 11px size regardless of the usual label rules (including NSM mode's —
  see §4), and a dashed neutral-ink ring (`stroke:#201e1d`, `stroke-dasharray:
  2,2`, `r + 2.4`) — deliberately a *fourth*, distinct ring pattern from the
  solid 2px selection stroke, the class-coloured solid hop ring, and the
  coloured NSM ring, so hovering is never mistaken for any of those states.
- Hovering never selects — clicking still does, exactly as before; hover is
  purely an additional, non-committal layer on top of the existing click path.

### 12. The `view` menu — a second deliberate new pattern

§10's modal was the first departure from "reuse an existing idiom." The `view`
menu is the second: a lightweight **popover** hung off a `toolbar-pill`. It
exists because the show/hide toggles (rail, inspector, trace tree), the
canvas-overlay toggles (labels, info band, minimap) and `reset view` had spread
across the top bar and the toolbar with no grouping — the "too many peer
controls" problem this pass set out to fix. Gathering them behind one `view ▾`
pill trades a click for a much quieter toolbar; they're all infrequent, so
that's the right trade. Later low-frequency canvas controls land here too (the
`dead-end nodes` and `minor-component nodes` filters — §3). Which
consolidation to use here was an explicit product decision — an always-visible
inline cluster was the alternative; the popover won on "reduces the crowded
perception."

The popover shell (`.view-menu__pop` / `__scrim` / `__row` / `__group` /
`__row--action`) is now reused by **four** controls: the `view` menu itself,
the `hidden (N)` list (§14), and the `export ▾` menu (the "Export" subsection
under §Interactions). All dismiss on scrim-click or `window` resize
(`_onResize` clears `viewMenuOpen` / `hiddenMenuOpen` / `exportMenuOpen`).

It still reads as Organic chrome: it borrows the modal's surface tokens (cream
`--color-bg` ground, `--radius-sm`, `--shadow-lg`) and the layer card's
visibility-toggle idiom (12px square, `--color-accent` fill when on) for the
checkbox rows. Section headers (`Panels` / `Canvas overlays` / `Canvas filters`)
use the standard `.08em` uppercase mono. `reset pan & zoom` is an action row
(top divider, no checkbox).

- **Anatomy**: `.view-menu` (relative anchor) › `toolbar-pill` trigger, taking
  the overlay-active span while open › `.view-menu__scrim`
  (`position:fixed; inset:0; z-index:40`) › `.view-menu__pop`
  (`position:absolute; right:0; z-index:41`, 196px). The pop is a **sibling** of
  the scrim, not a child, so row clicks don't bubble to the scrim's close handler.
- **Dismiss**: click the scrim (same "click bare background to dismiss" idiom as
  `svgClick` and the modal's `@click.self`), or any `window` resize — the
  `_onResize` handler clears `viewMenuOpen` so the absolutely-positioned pop can't
  be left stranded. No Escape handler, matching the modal.
- **Below the modal**: the modal scrim is `z-index:50`, above this menu's 40/41.
- **Checkbox truth**: each tick binds to the *effective shown* state (`railShown`
  / `inspectorShown` / `treeShown` / `labels` / `cornerTagShown` /
  `minimapShown`, and `!hideNoDownstream` for `dead-end nodes`), not a raw
  wanted-flag — so `trace tree` reads unchecked at `colW < 640` even when
  `treeWanted`.

### 13. Reach set comparison (compare mode)

Selecting a node already gives each canvas its own BFS-reachable set from that
node — `view.dist` / `viewB.dist`, respecting the current `Hops` (1/2/3) and
`Direction`. The **`Reach`** segmented control in the Compare cluster (§3)
narrows both subgraphs to a set operation over those two reachable sets:

- `off` (default) — no change.
- `intersection` — on **both** canvases, only nodes the selection reaches on
  **both** sides stay in the highlighted subgraph.
- `difference` — **symmetric per canvas**: the left canvas keeps
  `reach(A) \ reach(B)`, the right keeps `reach(B) \ reach(A)`. Each side shows
  what only *it* reaches.

(These were labelled `shared` / `unique` in an earlier pass; renamed to the
literal set operations so they don't collide with the NSM `shared`
classification sitting in the same cluster.)

The **selected node itself is always kept** (it is `dist 0` on every side; the
op never excludes it), and on a side where the selection has no counterpart the
op is inert for that side (nothing there is "reached" to begin with).

**It narrows the existing highlight — it does not add a ring.** A node the op
excludes is treated exactly like a node outside the subgraph: `sub` becomes
`false` for it, so it dims to `0.1` under Focus `highlight`, disappears under
Focus `filter`, and stays flat under Focus `none` (which does no dimming at
all, so `Reach` has no visible effect there — expected). This was a deliberate
choice over a distinct marker ring: the canvas already carries four ring
patterns (selection stroke, hop ring, NSM ring, hover ring — §11) and a fifth
would be ring soup. Implementation: `computeNodesFor` / `computeEdgesFor` take
the other side's `dist` as a 4th/2nd argument and fold a `reachExcluder(v,
otherDist)` predicate into the `sub` / `both` test — the whole downstream
render (opacity, hop ring, label rule, `filter`-mode skip) already keys off
those. The corner tag gains ` · reach intersection` / ` · reach difference` when active.

`reachOp` is compare-only and reset to `'off'` by `showLayers` (like
`nsmMetric`), so a stale narrowing can't outlive the mode that has a control
for it.

### 14. Manual hidden nodes

A per-node "get this out of my way" removal, independent of the class filter
and the q-value filter. Select a node and press `Del` (or `Backspace`), or hit
the `hide node` pill in the Node tab's action row: the node — and, implicitly,
every edge touching it — leaves **every** canvas. It is `Del`-to-remove, the
one keyboard shortcut in the app; the `keydown` handler is on `window` and
bails out while an `input`/`select`/`textarea` has focus (so `Backspace` still
edits the search box).

- **State**: `hidden` — a `{ [nodeId]: true }` map, same shape as `cls`. Folded
  into `computeView`'s `onNode` filter (`&& !hidden[n.id]`); dangling edges
  fall away via the existing `live[e.s] && live[e.t]` checks. Passed to both
  `view()` and `viewB()`.
- **Persistence**: survives dataset switches and mode switches — node ids are
  shared across datasets, which is the whole point in compare mode. Cleared
  only by `show all`. (Same rationale as the class filter persisting.)
- **Hiding the current selection** clears the selection (`select(null)`) — the
  node it pointed at is gone. A pinned tree root that gets hidden falls back
  through `effectiveTreeRoot` as usual.
- **The list**: a `hidden (N) ▾` `toolbar-pill` in the right-aligned cluster
  (before `view ▾`), rendered only when `hiddenCount > 0`, opening a popover
  that **reuses the `view` menu's shell verbatim** (`.view-menu__pop` /
  `__scrim` / `__row` / `__group` / `__row--action`) — one of four uses of
  that popover idiom (§12), not a new pattern. Each row is
  `label` + a right-aligned `×`, click anywhere on it to restore that node;
  a `show all` action row clears the map. `_onResize` also clears
  `hiddenMenuOpen`.
- **Both modes** — unlike the Compare cluster's controls, this sits in the
  always-visible right cluster. `Del`-to-hide is not compare-specific, and a
  compare-only list would strand hidden nodes when you leave compare mode.
- Node identity in the list is `label`, never raw `id` (§7) — resolved against
  whichever loaded dataset has the node, id as the last-resort fallback.

### 15. NSM label table — a fourth inspector tab (compare only)

The NSM classification the canvas already draws as rings (§4) is also
surfaced as a table, for reading off *which* miRNAs carry a `specific` /
`conserved` / `rewired` label and on *how many* metrics. It's a fourth
inspector tab, `NSM`, rendered only in compare mode (`panelTabs` appends it
when `isCompare`), same tab idiom as Node / Layer / Alignment.

- **Self-contained** — it does not need a canvas `by` metric picked. Its own
  `specific / conserved / rewired` `seg` writes the shared `nsmState` field,
  and for `conserved` / `rewired` a `split` Jaccard slider writes
  `nsmJaccardCutoff` (both reuse the toolbar's control classes: `.seg`,
  `.nsm-jaccard`).
- **Two stacked sub-tables**, one per dataset — heading `<dsLabel> (A)` then
  `<dsLabel> (B)` (`.nsm-table__caption`, the `.section-label` idiom).
- **Rows** = that dataset's `MicroRNA` nodes with ≥1 matching metric, sorted
  by the trailing count column descending (ties: label ascending). Row click
  selects the node on side A (`selectA`).
- **Columns** = the 7 `NSM_METRICS`, abbreviated (`NSM_ABBR`: `betw ↓` …
  `impact ↓`) with the full label in the `th`'s `title`, then a count
  column `n`. Cell: `✓` for `specific`; the Jaccard value (`toFixed(3)`) for
  `conserved` / `rewired`; blank when the metric doesn't match. Match test is
  the existing `nsmStateMatches(info, nsmState, nsmJaccardCutoff)`.
- The table is wider than the 220–300px inspector, so it lives in a
  `.nsm-table__scroll` (`overflow-x:auto`) with a sticky first column — the
  README's sanctioned treatment for wide content. Built by the `nsmLabelTable`
  computed (`null` outside compare mode; empty per-side → a
  `no <state> miRNA in this dataset` line).

## State management

```
mode: 'layers' | 'compare'            // top-bar segmented control
viewMenuOpen: boolean                 // toolbar "view" popover — see §3 / §12
exportMenuOpen: boolean               // toolbar "export ▾" popover — figure download, see Export subsection
panel: 'node' | 'layer' | 'align' | 'nsm'  // inspector tab ('nsm' compare-only — §15)
active: 0..3                          // active (ceiling) layer index
vis: boolean[4]                       // per-layer visibility
op: number[4]                         // per-layer opacity 0..100
cls: Record<classKey, boolean>        // class filter
selected: nodeId | null
treeRoot: nodeId | null                // last selected node; trace tree always tracks it, no pin — §5
traceSide: 'A' | 'B'                   // compare-mode canvas the trace tree follows; set by nodeClick, reset on mode/dataset switch — §5
largestComponentOnly: boolean         // view-menu "minor-component nodes" filter; default false (shown) — §3
focus: 'none' | 'highlight' | 'filter'
hop: 1 | 2 | 3
dir: 'down' | 'up' | 'both'
labels: boolean
treeWanted: boolean                   // trace-pane toggle; actual visibility also needs colW >= 640
nsmMetric: string                     // 'none' + NSM_METRICS keys; compare-only, reset to 'none' by showLayers — §3/§4
nsmState: 'specific' | 'conserved' | 'rewired'  // 'shared' split by nsmJaccardCutoff — §4
nsmJaccardCutoff: number             // 0..1, default 0.5 — conserved (>=) vs rewired (<) split — §3/§4
reachOp: 'off' | 'intersection' | 'difference'  // reach set comparison; compare-only, reset to 'off' by showLayers — §13
hidden: Record<nodeId, true>          // manually hidden nodes; persists across dataset/mode switches — §14
hiddenMenuOpen: boolean               // toolbar "hidden (N)" popover — see §14
open: Record<pathKey, boolean>        // tree row overrides
baseDepth: number                     // default-open depth
query: string                         // search box (unwired)
colW, paneH: number                   // measured column box — see layout constraint
qThreshold: number | null             // null = follow the dataset's max (unfiltered) — see §8
hideOrphanMrna: boolean               // default false — see §8
hideNoDownstream: boolean             // view-menu "dead-end nodes" filter; default false (shown) — see §3/§12
viewTransform: { x, y, k }            // pan/zoom, shared across compare-mode canvases — see §4
hoverA, hoverB: nodeId | null          // per-side hover emphasis, never synced — see §11
activeDataset, compareDataset: string // dataset keys, kept distinct — see §9
cornerTagShown, minimapShown: boolean // default true — independent overlay toggles, see §4
datasetMeta: Record<key, { label, builtin: boolean }>  // dataset registry — see §10
datasets: Record<key, { nodes, edges }>                // loaded graph data, keyed like datasetMeta
manageOpen, addFormOpen: boolean      // "manage graphs" modal — see §10
addForm: { label, nodesFile, edgesFile, error, busy }  // pending add-a-graph upload — see §10
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

One: the **identity mark**. `favicon.svg` at the repo root, referenced from
`index.html` both as `<link rel="icon" type="image/svg+xml">` and, verbatim, as
the inline `.topbar__mark` SVG in the top bar. It is a **flat illustration** — an
isometric cardboard box (three warm cardboard fills `#e8bd8a` / `#d9a469` /
`#a56d40`, packing tape `#f6e6c6` + `#e7d3ac`) with the class-encoding trio wired
into a small graph on the front face: circle `#8a4a22`, box on sage `#7a8a5e`,
diamond `#3f2c17`, edges `#3f2c17`, each node haloed `#f6ecda`. Drawn on a 24-unit
grid with ~12% padding. It stays inside the Organic chrome palette (warm
cardboard + the terracotta accent family + the sage accent-2 as a node-class
swatch; no spectral hue). It is **deliberately not a Lucide stroke icon** — a
brand mark is a different category from the toolbar toggles. Keep the two copies
(`favicon.svg` and the inline block) in sync. Full design rationale and the
version history live in `icon-concepts/` and the published design canvas.

Otherwise: no images. Every other glyph is a styled `div`/`span` or an SVG
primitive, and the few symbols used (`▾ ▸ · → ⇄ ⛓ ◦ +`) are text characters. The
Organic system specifies **Lucide** icons at stroke-width 2.75 if your
implementation wants real icons for the toolbar toggles.

## Files

- `reference/Semantic Box v2.dc.html` — the design. Markup is the shell and panels; the `<script>` at the bottom holds the model, the palette constants, the canvas renderer and all derived state.
- `reference/organic-styles.css` — the Organic design system stylesheet (tokens + component layer).
- `reference/support.js`, `reference/ds-base.js` — prototype runtime and design-system loader. **Environment scaffolding only — nothing to port.**

To view the prototype, open `reference/Semantic Box v2.dc.html` in a browser
(serve the folder over HTTP rather than `file://`).
