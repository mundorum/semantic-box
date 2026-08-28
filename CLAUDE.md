# Semantic Box — working agreement

## Design authority

Every UI change in this repo — new control, new state, new interaction, or a
tweak to an existing one — must follow the design guidelines in
[`design_handoff_semantic_box/README.md`](design_handoff_semantic_box/README.md)
(and its authoritative token/reference files under
`design_handoff_semantic_box/reference/`). That document, not ad hoc taste, is
what "on-brand" means for this app. Read it before touching `index.html`,
`css/*.css`, or any rendering code in `js/app.js`.

Non-negotiable rules from that document, repeated here because they're the
easiest to break by accident:

- **The two-palette rule.** Chrome (top bar, rail, toolbar, tree, inspector)
  uses the Organic system only — never a spectral hue except as a node-class
  swatch. The canvas is the one place spectral hues on white are correct.
  Don't let a canvas colour leak into chrome or vice versa.
- **Reuse existing component idioms, don't invent new ones.** A new toggle is
  a `toolbar-pill` + `.pill__active-overlay`, exactly like `rail`/`inspector`/
  `trace tree`. A new slider is a native `input[type=range]` with
  `accent-color: var(--color-accent)`, exactly like the layer-opacity slider.
  A new legend section in the rail follows the `hop-legend` pattern (title +
  control, `.rail-bottom`, top divider). If what you need doesn't map to an
  existing pattern, that's worth a second look before adding a new one.
- **JetBrains Mono is the interface voice.** Every identifier, count, metric,
  label, and control is mono; Figtree is reserved for panel titles and prose.
  No Caprasimo, ever, in this workspace.
- **No transitions/animations.** Interaction feedback is immediate state
  change; hover is a border/background swap only.
- **The trace pane / graph-width layout constraint is load-bearing.** Never
  measure the graph's own width — derive it from the measured column width
  (`colW`) only, per the README's "Critical layout constraint". Re-measuring
  the graph to decide whether the tree pane shows is exactly the render loop
  that bit the prototype.
- Node identity in the UI is always `label`, never raw `id` — see README §7.

## Keeping the design doc honest

The design handoff is a living spec, not a historical record. When you add or
change UI behaviour, update `design_handoff_semantic_box/README.md` in the
same change — new interaction patterns, new state fields, corrected "not yet
implemented" notes. A design doc that describes a stale version of the app is
worse than no doc, because the next person (human or agent) will trust it.
If a task requires deviating from an existing guideline, say so explicitly,
explain why, and fold the resolution back into the doc — don't silently drift.

## Verifying UI work

This is a Vue 3 app loaded straight from CDN with no build step — open
`index.html` via a local static server (not `file://`) to test. Before calling
a UI change done, actually drive it in a browser (a headless one is fine) and
look at what rendered; don't rely on "the code looks right." Click the new
control, check the graph/state updates as expected, and check the console for
errors or Vue warnings.
