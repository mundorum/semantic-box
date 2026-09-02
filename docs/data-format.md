# Semantic Box — data format reference

Every dataset is a pair of CSV files: **`<name>_nodes.csv`** and
**`<name>_edges.csv`**. The bundled examples live in `examples/`; you can load
your own through **manage graphs** (see the
[user guide](user-guide.md#13-managing-graphs)).

This page is the schema. It matters if you are preparing data to upload, or
changing the loader (`js/data-loader.js`, `js/csv.js`).

---

## Contents

- [1. General rules](#1-general-rules)
- [2. Nodes CSV](#2-nodes-csv)
- [3. Edges CSV](#3-edges-csv)
- [4. The NSM columns](#4-the-nsm-columns)
- [5. Validation](#5-validation)
- [6. Worked example](#6-worked-example)
- [7. What the loader ignores](#7-what-the-loader-ignores)

---

## 1. General rules

- **Encoding**: UTF-8, comma-separated, one header row.
- **Quoting**: RFC4180-style. Fields containing a comma, quote or newline must
  be `"`-quoted; embedded quotes are doubled (`""`). The parser
  (`parseCSV`, `js/csv.js`) handles this — a naive split would not.
- **Column order does not matter**; columns are matched by header name.
- **Extra columns are ignored** — keep whatever your analysis pipeline emits.
- **Missing optional values**: leave the cell empty. Do not write `NA`,
  `null`, `None` — those are treated as text.
- **All nodes and edges load into a single layer** (`layer: 0`). Semantic Box's
  layer machinery is retained from an earlier layered-graph design but the
  current data model is one flat snapshot.

---

## 2. Nodes CSV

`<name>_nodes.csv`

### Required columns

| Column | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable unique key — gene symbol, miRNA accession, `KEGG:04510`, … Used internally for selection, edges, BFS. **Never shown to the user.** |
| `type` | string | The node class. Must be exactly one of `MicroRNA`, `Messenger RNA`, `Pathway`. Rows with any other `type` are **dropped**. |

### Recommended columns

| Column | Type | Applies to | Notes |
| --- | --- | --- | --- |
| `label` | string | all | Human-readable display name — **this is what the UI shows everywhere**. For miR/mRNA it is usually identical to `id`; for `Pathway` give the readable name (e.g. `Focal adhesion`), not the KEGG id. Falls back to `id` if empty. |
| `qvalue` | float | `Pathway` only | Enrichment significance. Drives the rail's q-value slider. Leave blank for miR/mRNA. |
| `connected_component_id` | int-ish | miR / mRNA | Shown in the Node inspector. |
| `is_in_largest_component` | `0` / `1` (or `0.0` / `1.0`) | miR / mRNA | `1` ⟺ the node is in the graph's largest connected component (the loader tests `parseFloat(cell) === 1`). Drives the **minor-component nodes** view filter. If no node has `1`, the filter row is hidden and the filter is inert. Blank for `Pathway`. |

### Analysis-metric columns (miR / mRNA, shown in the Node inspector)

| Column | Type |
| --- | --- |
| `betweenness_centrality` | float |
| `closeness_centrality` | float |
| `degree_centrality` | float |
| `redundancy_coefficient` | float |
| `pathway_reach` | float (blank → `—`) |
| `functional_impact` | float (blank → `—`) |

### NSM columns (MicroRNA only — see [§4](#4-the-nsm-columns))

`betweenness_centrality_descending`, `closeness_centrality_descending`,
`degree_centrality_descending`, `redundancy_coefficient_descending`,
`redundancy_coefficient_ascending`, `pathway_reach_descending`,
`functional_impact_descending`.

For mRNA / Pathway rows write `[]` (or leave blank).

---

## 3. Edges CSV

`<name>_edges.csv`

### Required columns

| Column | Type | Notes |
| --- | --- | --- |
| `source` | string | An `id` from the nodes CSV. Rows whose `source` or `target` is not a known node id are silently dropped. |
| `target` | string | An `id` from the nodes CSV. |

### The `correlation` column decides the edge kind

There is no explicit "edge type" column. The loader infers it:

| `correlation` cell | Interpreted as | Relation label | Weight |
| --- | --- | --- | --- |
| **present** (a number) | `MicroRNA → Messenger RNA` regulation | `regulates` | `clamp(abs(correlation), 0.05, 1)` |
| **empty** | `Messenger RNA → Pathway` participation | `in_pathway` | `1` |

So a `miR → mRNA` row **must** carry a `correlation`; an `mRNA → Pathway` row
**must** leave it blank. The weight feeds edge stroke thickness and the
inspector's neighbour weight bars.

Edge direction should follow the biology: `source` = miR, `target` = mRNA for
regulation; `source` = mRNA, `target` = Pathway for participation. The trace
tree and the `→ down` / `← up` direction control depend on it.

---

## 4. The NSM columns

**NSM** = node-specificity by metric. Each `*_descending` / `*_ascending`
column holds, per MicroRNA, whether that miR is a high-priority node for that
metric ranking, and whether that is dataset-specific or shared. The cell is a
**Python-repr list literal** (single quotes):

| Cell value | Meaning |
| --- | --- |
| `[]` (or empty) | not a high-priority node for this metric |
| `[['specific']]` | high-priority for this metric **in this dataset only** |
| `[['shared', '<Other dataset display name>', <jaccard>]]` | also high-priority in that other dataset, with the Jaccard similarity of the two neighbourhoods |

Examples from the bundled data:

```
[['specific']]
[['shared', 'Basal-like', 0.045]]
[['shared', 'Luminal A', 0.25]]
```

Parsing (`parseNsmCell`, `js/data-loader.js`): single quotes are swapped to
double and `JSON.parse`d (safe here — the values never contain quotes or
commas). The `<Other dataset display name>` is matched against loaded datasets
by `slugify`-ing it (`'Luminal A'` → `luminal-a`), so it must correspond to a
dataset you actually load for the cross-dataset echo marks to appear.

`shared` is **never used directly** — [compare mode](user-guide.md#12-compare-mode)
splits it into **conserved** (`jaccard ≥` the user's cutoff) and **rewired**
(`jaccard <` cutoff).

Only MicroRNA rows are expected to carry meaningful NSM cells; the loader
parses the columns for every row but mRNA/Pathway values are always `[]`.

---

## 5. Validation

`loadDatasetFromFiles` (`js/data-loader.js`) checks uploads in this order and
throws a specific, user-facing message on the first failure:

1. The nodes file has at least one data row.
2. The nodes CSV header includes **`id`** and **`type`**.
3. The edges file has at least one data row.
4. The edges CSV header includes **`source`** and **`target`**.
5. At least one node row's `type` matches a known class
   (`MicroRNA` / `Messenger RNA` / `Pathway`) — the canvas cannot render a
   class it has no colour/shape for.

Beyond that the loader is lenient: unknown-class rows drop, edges to unknown
nodes drop, malformed numbers become `NaN` / `null` and render as `—`.

Bundled datasets loaded from `examples/` are **not** re-validated — they are
assumed well-formed.

---

## 6. Worked example

**`demo_nodes.csv`**

```csv
id,label,type,qvalue,connected_component_id,is_in_largest_component,betweenness_centrality,closeness_centrality,degree_centrality,redundancy_coefficient,pathway_reach,functional_impact,betweenness_centrality_descending,closeness_centrality_descending,degree_centrality_descending,redundancy_coefficient_descending,redundancy_coefficient_ascending,pathway_reach_descending,functional_impact_descending
hsa-miR-200a-3p,hsa-miR-200a-3p,MicroRNA,,0,1,0.146,0.246,0.079,0.143,0.43,0.36,[],[['specific']],[['specific']],[['specific']],[],[],[['specific']]
ZEB2,ZEB2,Messenger RNA,,0,1,0.041,0.31,0.06,0.12,,,[],[],[],[],[],[],[]
KEGG:04310,Wnt signaling pathway,Pathway,0.0031,,,,,,,,,[],[],[],[],[],[],[]
```

**`demo_edges.csv`**

```csv
source,target,mirtarbase,correlation,qvalue
hsa-miR-200a-3p,ZEB2,,-0.477,
ZEB2,KEGG:04310,,,
```

This produces: one miR (diamond, red) regulating one mRNA (circle, blue) with
weight `0.477`, that mRNA participating in one pathway (box, orange). The miR is
marked `specific` on four metrics; selecting it in compare mode against a
dataset whose NSM cells reference this one would show conserved/rewired marks.

---

## 7. What the loader ignores

| Column | Where | Why |
| --- | --- | --- |
| `mirtarbase` | edges | Not used by the app. |
| `qvalue` | edges | The pathway q-value moved onto the **Pathway node**; the edge column is legacy. |
| any unlisted column | nodes & edges | Kept in the parsed row object but never read. |

If you are trimming files for size, you can drop `mirtarbase` and the edge
`qvalue` column entirely.
