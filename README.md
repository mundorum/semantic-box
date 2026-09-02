# semantic-box

Layered semantic environment — a browser-based explorer for tripartite
regulatory graphs (microRNA → messenger RNA → biological pathway). Load graph
snapshots, trace a node's neighbourhood, filter the view, compare two snapshots
side by side, and export publication figures. Single HTML page, Vue 3 from a
CDN, no build step.

## Run it

```sh
python3 -m http.server 8000
# open http://localhost:8000/index.html   (not file:// — it fetches example CSVs)
```

## Documentation

- [`docs/`](docs/) — full documentation
  - [User guide](docs/user-guide.md) — every panel and control
  - [Developer guide](docs/developer-guide.md) — architecture, render pipeline, invariants, extension recipes
  - [Data format reference](docs/data-format.md) — the nodes/edges CSV schema
- [`design_handoff_semantic_box/`](design_handoff_semantic_box/) — the authoritative visual/interaction spec
- [`CLAUDE.md`](CLAUDE.md) — working agreement

## Licence

GPL-3.0 — see [LICENSE](LICENSE).
