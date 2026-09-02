# Semantic Box — user guide

A field guide to every panel and control. If you just want to get a figure out
of it, skip to [Exporting figures](#exporting-figures).

---

## Contents

- [1. What Semantic Box shows you](#1-what-semantic-box-shows-you)
- [2. Opening the app](#2-opening-the-app)
- [3. The workspace at a glance](#3-the-workspace-at-a-glance)
- [4. Reading the graph](#4-reading-the-graph)
- [5. Moving around the canvas](#5-moving-around-the-canvas)
- [6. The Focus toolbar](#6-the-focus-toolbar)
- [7. The left rail](#7-the-left-rail)
- [8. The View menu](#8-the-view-menu)
- [9. The trace tree](#9-the-trace-tree)
- [10. The inspector](#10-the-inspector)
- [11. Hiding nodes](#11-hiding-nodes)
- [12. Compare mode](#12-compare-mode)
- [13. Managing graphs](#13-managing-graphs)
- [14. Exporting figures](#14-exporting-figures)
- [15. Keyboard shortcuts](#15-keyboard-shortcuts)
- [16. Tips and FAQ](#16-tips-and-faq)

---

## 1. What Semantic Box shows you

The data is a **tripartite graph** in three stacked classes:

```
   MicroRNA   ──regulates──▶   Messenger RNA   ──in_pathway──▶   Pathway
   (miR)                       (mRNA)                            (biological pathway)
```

- A **miR → mRNA** edge means the microRNA regulates that messenger RNA; it
  carries a **correlation** value (its strength).
- An **mRNA → Pathway** edge means the mRNA's protein participates in that
  pathway.
- Each **Pathway** node carries a **q-value** — the statistical significance
  of its enrichment.
- Each miR/mRNA node carries analysis metrics (centrality, redundancy, pathway
  reach, …) and a connected-component id. miRs additionally carry
  **node-specificity** results per metric, used in [compare mode](#12-compare-mode).

Everything on screen is derived from these nodes and edges plus your current
filter and focus settings. Nothing is precomputed on a server — switch a
control and the whole view recomputes.

The layout is deterministic: **miR in a left column, mRNA in the middle
(wrapped into sub-columns because there are hundreds), Pathway on the right**,
with a crossing-reduction pass so related nodes line up.

---

## 2. Opening the app

Serve the repository folder with any static web server and open
`index.html` — see [Quick start](README.md#quick-start). The `file://`
protocol will not work because the app fetches its example data.

Two datasets load automatically: `basal-like` (shown as **basal**) and
`luminal-a`. You can add your own — see [Managing graphs](#13-managing-graphs).

---

## 3. The workspace at a glance

```
┌───────────────────────────────────────────────────────────────────────┐
│ TOP BAR   identity · dataset picker · manage graphs · search · mode    │
├──────────────┬─────────────────────────────────────────┬──────────────┤
│ LEFT RAIL    │ FOCUS TOOLBAR                            │ INSPECTOR    │
│              │  focus · hops · direction  … export ▾ view▾            │
│  Layers      ├──────────────────────────────┬──────────┤  Node        │
│  Classes     │                              │  TRACE   │  Layer       │
│  Hop decay   │   CANVAS                      │  TREE    │  Alignment   │
│  Pathway     │   (or two canvases,          │          │  (NSM — in   │
│  q-value     │    side by side, in          │          │   compare)   │
│              │    compare mode)             │          │              │
└──────────────┴──────────────────────────────┴──────────┴──────────────┘
```

- The **left rail** and **inspector** can be toggled from the View menu. In
  compare mode both are closed by default to give the two canvases room.
- The **trace tree** hides automatically when the centre column gets narrower
  than 640px (a "trace pane needs a wider window" note appears instead).
- The two **chrome palettes are deliberately different**: the panels use a warm
  "organic" palette (cream, terracotta); the canvas is a white instrument
  plate. The only spectral colour allowed in the panels is a node-class swatch.

---

## 4. Reading the graph

### Node classes — colour *and* shape

Every node is encoded twice so the graph survives greyscale printing and
colour-blindness:

| Class | Colour | Shape |
| --- | --- | --- |
| **MicroRNA** (miR) | red `#EF3B2C` | diamond |
| **Messenger RNA** (mRNA) | blue `#6BAED6` | circle |
| **Pathway** | orange `#FF8000` | box |

The same swatches appear in the rail's **Classes** legend, in trace-tree rows,
and in the inspector.

Node **size** scales with degree (how many edges touch it), clamped to a
maximum. The selected node is drawn 2px larger with a dark outline.

Node identity in every label, row and title is the node's **display name**
(`label`). For miR/mRNA that is the same as the internal id; Pathway nodes have
a readable name (e.g. *Focal adhesion*) rather than a KEGG id.

### Edges

Edges are neutral dark ink — they never take a class colour. Emphasis comes
from **thickness** (heavier = stronger correlation) and **opacity** (fades with
hop distance from the selected node). Edges outside the current focus subgraph
drop to a thin, pale line.

### Hop-decay focus

When you select a node, Semantic Box runs a breadth-first search from it and
**fades every other node by how many hops away it is**:

| Distance from selection | Opacity (standard curve) |
| --- | --- |
| the node itself | 100% |
| 1 hop | 100% |
| 2 hops | 55% |
| 3 hops | 28% |
| outside the subgraph | 10% (or removed — see Focus modes) |

Nodes 2+ hops away also get a thin **ring** in their class colour, so they stay
findable after their fill has faded. This is the core idea of the tool:
relevance is legible without structure being hidden.

The rail's **Hop decay** legend shows the current curve.

---

## 5. Moving around the canvas

| Action | How |
| --- | --- |
| **Pan** | click-drag on empty canvas |
| **Zoom** | mouse wheel — zoom is anchored on the pointer, clamped 0.5×–8× |
| **Reset pan & zoom** | View menu → *reset pan & zoom* |
| **Select a node** | click it |
| **Clear the selection** | click empty canvas |
| **Hover emphasis** | move the pointer over a cluster — the node your cursor is *nearest the centre of* pops to full opacity with a dashed ring and its label, so you can tell overlapping nodes apart before you commit to a click |

In compare mode, **pan and zoom are shared** across both canvases; **hover is
not** (your cursor is only over one canvas at a time).

**Minimap** (bottom-right of each canvas): a small overview with a rectangle
showing the current viewport. Hide it from the View menu if it covers nodes you
need.

**Labels**: shown for the selected node, anything within 2 hops, and always for
special anchor classes. Toggle all labels off from the View menu. A hovered
node always shows its label regardless.

---

## 6. The Focus toolbar

Above the canvas. Controls that shape the highlighted neighbourhood.

### Focus — `none` / `highlight` / `filter`

- **none** — no decay. Every node at full opacity. Use this to see raw
  structure.
- **highlight** (default) — the subgraph around the selection is drawn at its
  decay opacity; everything else drops to 10%.
- **filter** — everything outside the subgraph is *removed* from the canvas,
  not just faded. The cleanest view for a figure of one node's neighbourhood.

### Hops — `1` / `2` / `3`

How far the breadth-first search reaches from the selected node. Default `2` —
with the tripartite data, a 2-hop search from a miR reaches its pathways.

### Direction — `→ down` / `← up` / `⇄ both`

Which edges the search follows:

- **→ down** (default) — outgoing only (a miR's mRNAs, then their pathways).
- **← up** — incoming only (what regulates the selection).
- **⇄ both** — either direction.

Direction also decides which neighbour groups the [Node inspector](#node-tab)
shows. The **trace tree is always downstream**, regardless of this control.

---

## 7. The left rail

Toggle it from the View menu (`rail`). Hidden by default in compare mode.

### Layers

The shipping data is a single flat snapshot, so there is **one layer card**
(`L0 · <dataset>`). It still carries the full layer machinery from the
layered-graph design:

- **Visibility dot** — hide/show the layer's nodes and edges.
- **Opacity slider** — dims the layer's nodes and edges on the canvas.
- **make active / active layer** — the active layer is the ceiling; nothing
  above it renders. With one layer this is always active.

### Classes

One row per node class: the glyph, the label, and the **live count** of nodes
of that class currently in the view. **Click a row to toggle that class off** —
its nodes leave the view and every count recomputes. Click again to bring it
back. A class that is off shows a grey swatch and struck-through label.

### Hop decay

A read-only legend of the current decay curve (see [§4](#hop-decay-focus)).

### Pathway q-value

A slider spanning the **actual** min→max q-value of this dataset's pathways
(not a fixed 0–1 range). A pathway is shown only when its q-value is **≤** the
threshold — i.e. drag left to keep only the most significant pathways. Hidden
pathways are removed entirely, and their mRNA edges fall away with them. The
readout beneath shows `q ≤ <value> · N pathways shown`.

- **show / hide orphaned mRNA** — a messenger RNA that lost *all* its pathway
  edges to the q-value filter is an "orphan". By default orphans stay
  (only their dangling edges disappear). Toggle this pill to hide them
  entirely.

The slider resets to the dataset's own maximum (unfiltered) whenever you switch
the active dataset.

---

## 8. The View menu

The `view ▾` button in the toolbar opens a popover gathering every show/hide
and filter toggle. A tick means **shown**. Dismiss by clicking outside it or
resizing the window.

**Panels**

| Row | Effect |
| --- | --- |
| `rail` | show/hide the left rail |
| `inspector` | show/hide the right inspector |
| `trace tree` | show/hide the trace pane (still needs a ≥640px column to appear) |

**Canvas overlays**

| Row | Effect |
| --- | --- |
| `labels` | all node labels on/off |
| `info band` | the corner tag (`L0 · luminal-a · 258 n · 326 e · focus highlight · 2 hop`) |
| `minimap` | the viewport overview, bottom-right |

**Canvas filters**

| Row | Effect |
| --- | --- |
| `dead-end nodes` | when unticked, hides every non-Pathway node with **no downstream edge** — a miR or mRNA that doesn't lead to a pathway. Applied repeatedly, so removing a dead-end mRNA also drops any miR left pointing only at dead ends. What remains is exactly the nodes still on a `miR → mRNA → Pathway` chain. Pathways are never removed. |
| `minor-component nodes` | when unticked, hides every miR/mRNA **outside the graph's largest connected component** (`is_in_largest_component = 0`). Pathways are always kept. This row only appears if the dataset carries the component column. |

**`reset pan & zoom`** — return the shared transform to its default.

---

## 9. The trace tree

A collapsible tree of paths **from the selected node, following outgoing edges
only**, pinned to the right of the canvas.

- The header reads `trace · <node>` (in compare mode, `trace · A · <node>` or
  `trace · B · <node>` — see below).
- **The tree always follows your current selection.** Click any node — on the
  canvas, in a tree row, in the inspector — and the tree re-roots there. When
  you clear the selection the tree keeps showing the last node until your next
  click.
- **In compare mode the tree follows the canvas you last clicked on.** Click a
  node on the left (A) canvas and the tree traces through dataset A; click the
  right (B) canvas and it traces through dataset B. Clicking a row in the
  inspector always points it back at A.
- Each row: a caret (`▾` open / `▸` closed / `·` leaf — click just the caret to
  expand/collapse without selecting), the class glyph, the node name, and the
  relation label (`regulates`, `in_pathway`, or `root`).
- **expand** opens the tree to depth 4; **collapse** closes it to depth 1. Both
  clear any manual per-row toggles.
- It is a **path tree, not a node tree**: a node reachable by several distinct
  paths appears once per path. A row-cap notice appears if the tree gets very
  large.
- The **Node** inspector's *root the trace tree here* button reveals the pane
  and resets its depth at the selected node.

---

## 10. The inspector

Toggle it from the View menu (`inspector`). Tabs: **Node**, **Layer**,
**Alignment**, and — in compare mode only — **NSM**. In compare mode the order
becomes `Alignment / Node / Layer / NSM` and Alignment is selected first.

### Node tab

Everything about the selected node.

- **Title** — the class glyph, the node name, and a class pill.
- **Metrics list** — class · shape, out/in degree, how many nodes the current
  hop search reached, the trace direction, and the trace-tree row count.
- **Metrics** (raw analysis values from the CSV) — connected-component id (with
  `(largest)` when applicable), betweenness / closeness / degree centrality,
  redundancy coefficient, pathway reach, functional impact, and — for a
  Pathway — its q-value.
- **Present in layers** — chips L0…; present chips are filled, absent chips are
  dashed and struck through.
- **Neighbour groups** — `outgoing · hop 1`, `incoming · hop 1` (each shown
  only when the current Direction includes it), then `reachable · hop N` for
  each further hop. Up to 6 rows each, with a weight bar. **Click a row to
  select that node.**
- **Actions** — *focus neighbourhood* (sets Focus to highlight), *root the
  trace tree here*, *hide node*.

Empty state (nothing selected): the id reads *nothing selected* and a single
hint row tells you to click a node.

### Layer tab

The active layer's name, its rule text, and a delta table (nodes / edges).
With the single-snapshot data this is a summary of what loaded.

### Alignment tab

Only meaningful in compare mode. A table of representative nodes spread across
classes, showing each node's presence and degree in dataset **A** vs **B**, the
reach in each, and the degree delta. Unmatched nodes show `—` and `A only`.
**Click a row to select that node** (on side A).

### NSM tab (compare mode only)

See [§12](#the-nsm-tab).

---

## 11. Hiding nodes

A per-node "get this out of my way", independent of the class and q-value
filters.

- Select a node and press **Delete** or **Backspace**, or use the Node tab's
  *hide node* button. The node and every edge touching it leave **every**
  canvas.
- Hidden nodes persist across dataset and mode switches (node ids are shared
  between datasets — that is the point in compare mode).
- A **`hidden (N) ▾`** button appears in the toolbar when anything is hidden.
  It opens a list — click a row to restore that node, or *show all* to clear
  the list.
- The keyboard shortcut is ignored while you are typing in a text field.

---

## 12. Compare mode

Switch the **mode** control in the top bar from `layers` to `compare`. The
centre splits into **two canvases**, one per dataset.

### What is shared, what is not

- **Shared**: the selected node (looked up by id in each dataset
  independently), pan/zoom, active layer, class filters, focus/hops/direction,
  the q-value threshold.
- **Independent**: hover emphasis, and which side the trace tree follows.
- If the selected id exists in one dataset but not the other, the side that
  lacks it dims (or empties, under Focus `filter`) rather than lighting up.

### The `vs` selector

Side **A** is the top-bar dataset; side **B** is chosen from the `vs`
dropdown in the toolbar's Compare cluster. Picking a dataset that is already on
the other side **swaps** A and B rather than colliding. Changing B alone does
not reset your selection or trace tree.

### Compare by (NSM) — `specific` / `conserved` / `rewired`

**NSM** = node-specificity by metric. For each of seven ranking metrics
(betweenness, closeness, degree, redundancy ↑/↓, pathway reach, functional
impact), the source analysis flags whether a miR is a "high-priority" node,
and whether that is true in **this dataset only** or **shared** with another.

Pick a metric in the toolbar's `by` dropdown and a classification:

| Label | Meaning |
| --- | --- |
| **specific** | high-priority for this metric in **this dataset only** |
| **conserved** | also high-priority in the other dataset, and the neighbourhood around the node is **similar** (Jaccard ≥ the split cutoff) |
| **rewired** | also high-priority in the other dataset, but the neighbourhood is **meaningfully different** (Jaccard < the split cutoff) |

Marked nodes get a coloured ring — a strong ring on the side that owns the
classification, a faint echo ring in the same colour on the other side (for
conserved/rewired) so you can spot the same node on both canvases. `specific`
gets no echo (by definition it is absent on the other side).

- **split** slider (conserved/rewired only) — the Jaccard cutoff that divides
  "shared" into conserved vs rewired. There is no canonical value; it defaults
  to 0.5. In the bundled data every shared value is ≤ 0.25, so at the default
  everything shared reads as *rewired* — lower the slider to see conserved.
- When a metric is active, labels are restricted to marked nodes (plus the
  selection) for the classes that metric can mark — otherwise a few hundred
  faded genes would bury the handful that matter.

### Reach — `off` / `intersection` / `difference`

A set operation over the two canvases' BFS-reachable sets from the selection:

- **intersection** — both canvases keep only nodes the selection reaches on
  *both* sides.
- **difference** — each canvas keeps only what *it* reaches and the other does
  not.

It narrows the existing highlight (excluded nodes dim, or vanish under Focus
`filter`); the selected node itself is always kept.

### The NSM tab

Open the inspector (View menu) and pick the **NSM** tab for a table of the
comparison labels — useful for reading off *which* miRs carry a label and on
*how many* metrics.

- Its own `specific / conserved / rewired` toggle and split slider — you do not
  need a canvas `by` metric selected.
- **Two stacked tables**, one per dataset (`<dataset> (A)`, `<dataset> (B)`).
- **Rows** = that dataset's miRs that carry the chosen label on at least one
  metric, **sorted by how many metrics** (the `n` column), descending.
- **Columns** = the seven metrics (abbreviated; hover a header for the full
  name), then `n`. A cell shows `✓` for *specific*, or the Jaccard value for
  *conserved* / *rewired*, or nothing.
- The table is wider than the inspector — it scrolls sideways, with the miR
  name column pinned.
- Click a row to select that miR.

---

## 13. Managing graphs

The **manage graphs** button (top bar) opens a dialog to add or remove
datasets.

- **Loaded graphs** — one row per dataset with live node/edge counts, a
  `custom` tag for uploads, and a **remove** button (disabled when only one
  dataset remains).
- **+ add a graph** — expands a form:
  - an optional name (defaults to the nodes filename);
  - a drop target for the **nodes** CSV;
  - a drop target for the **edges** CSV.
  Each accepts a click-to-browse or a real drag-and-drop.
- On **add**, the files are validated (see the [data format
  reference](data-format.md#validation)); on success the new dataset becomes
  active immediately.
- Removing a dataset keeps A/B pointing at something valid and drops back to
  Layers mode if fewer than two datasets remain.

The example folders `examples/v01`, `examples/v02`, `examples/v01-v02-mixed`
contain additional subtype snapshots (`luminal-b`, `her2-enriched`, `normal`)
you can load this way.

---

## 14. Exporting figures

The **`export ▾`** button in the toolbar (next to `view ▾`) downloads the
current canvas as a figure.

| Format | Use it for |
| --- | --- |
| **SVG (vector)** | journal submissions, posters, anything you will scale or edit in Illustrator/Inkscape. True vector — infinitely sharp. |
| **PNG (3× raster)** | slides, quick sharing, venues that do not accept SVG. Rendered at 3× the on-screen size. |

Both capture **exactly what is on the canvas right now**, including your pan/zoom,
focus mode, filters and selection — so set the view up first. The export adds a
white background and drops the faint dot grid. **In compare mode you get one
image containing both canvases**, split by a divider.

The file is named
`semantic-box_<datasetA>[_vs_<datasetB>]_<date-time>.svg` (or `.png`).

**Font note:** the SVG references *JetBrains Mono* / *Figtree* by name — text
renders correctly anywhere those fonts are installed (or embed them in your
document). The PNG tries to bake the fonts in; if that fails it falls back to a
generic monospace, which is still clean.

**Preparing a clean figure:**

1. Select the node your figure is about.
2. Set **Focus** to `filter` (or `highlight`) and pick the **Hops** you want.
3. Turn off overlays you do not want in the image (View menu → `info band`,
   `minimap`; sometimes `labels`).
4. Pan/zoom to frame it.
5. `export ▾` → `SVG (vector)`.

---

## 15. Keyboard shortcuts

| Key | Action |
| --- | --- |
| **Delete** / **Backspace** | hide the selected node (ignored while typing in a field) |
| mouse wheel | zoom |
| click-drag | pan |

That is the entire keyboard surface — Semantic Box is a pointer-driven tool.

---

## 16. Tips and FAQ

**The trace tree disappeared.** The centre column is narrower than 640px. Widen
the window, or close the rail/inspector from the View menu.

**A pathway vanished when I moved the q-value slider.** That is the filter
working — it removed pathways less significant than the threshold. Drag the
slider back toward its maximum to bring them back.

**Everything is faded / most nodes vanished.** You probably have Focus on
`highlight` or `filter` with a selection. Set Focus to `none`, or select a
different node, or raise the Hops.

**Compare mode has no NSM tab.** Open the inspector — it is closed by default in
compare mode (View menu → `inspector`). The NSM tab is the fourth one.

**The search box does nothing.** Search-and-jump is not wired up in this build.
Select nodes by clicking them or via the inspector's neighbour/alignment rows.

**"build a layer over top" does nothing.** Same — the layer-building UI is a
placeholder. The data is a single snapshot.

**Which colour is which class again?** Red diamond = miR, blue circle = mRNA,
orange box = pathway. The rail's Classes legend always shows it.

**Can I change the decay curve?** Not from the UI in this build (it is fixed to
"standard"). A developer can change the default — see the
[developer guide](developer-guide.md).
