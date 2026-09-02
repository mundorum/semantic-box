# Semantic Box — documentation

**Semantic Box** is a browser-based explorer for layered knowledge graphs. The
shipping build is tuned for **tripartite regulatory graphs**: microRNAs
(**miR**) regulate messenger RNAs (**mRNA**), whose proteins participate in
biological **pathways**. You load one or more graph snapshots, trace how a
selected node reaches its neighbourhood, filter the view down to what matters,
compare two snapshots side by side, and export the result as a figure.

It is a single HTML page driven by Vue 3 loaded from a CDN — **no build step,
no server-side code**. Open `index.html` through any static web server and it
runs.

## Documentation map

| Document | Audience | Contents |
| --- | --- | --- |
| [**User guide**](user-guide.md) | Researchers, analysts | Every control and panel, how focus/decay works, compare mode, exporting figures, keyboard shortcuts, tips. |
| [**Developer guide**](developer-guide.md) | Contributors | Architecture, the render pipeline, state model, interaction subsystems, invariants you must not break, extension recipes. |
| [**Data format reference**](data-format.md) | Both | The nodes/edges CSV schema, how edge kinds and metrics are parsed, validation rules, worked examples. |

## Design authority

The visual design and interaction spec live in
[`../design_handoff_semantic_box/README.md`](../design_handoff_semantic_box/README.md).
That document is the authority on "on-brand"; the developer guide points at the
specific sections you need before touching UI code. The working agreement in
[`../CLAUDE.md`](../CLAUDE.md) summarises the non-negotiable rules.

## Quick start

```sh
# from the repository root
python3 -m http.server 8000
#  → open http://localhost:8000/index.html
```

Any static file server works (`npx serve`, `php -S`, a VS Code Live Server,
…). Do **not** open the file over `file://` — the app fetches its example
CSVs with `fetch()`, which the `file://` origin blocks.

On load, both bundled breast-cancer-subtype snapshots (`basal-like`,
`luminal-a`) are fetched from `examples/`, and the first node of the active
dataset is auto-selected so the trace tree and inspector have something to
show.
