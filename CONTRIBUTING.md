# Contributing

Thanks for taking the time to contribute.

## Development setup

```bash
npm install
npm run dev     # interactive demo at http://localhost:5173
```

The demo scene deliberately includes the awkward cases: a plain cube, a cube
inside a rotated + non-uniformly scaled parent, and a mesh with off-center
geometry. **Verify visually in the demo** — the extrude anchor and the angle
sector are geometry problems that a passing unit test does not fully cover.

## Checks

```bash
npm run check   # typecheck + lint + tests
npm run build   # ESM + CJS + d.ts into dist/
```

CI runs the same checks plus a matrix over the lowest supported three version,
the pinned version, and `latest`. Please make sure `npm run check` passes and
run `npm run format` before opening a pull request.

## Tests

- `tests/*.test.ts` — pure math (`ExtrudeMath`, `Snapping`, `DragPlane`,
  `ScreenScale`). Assert _invariants_ (e.g. "the anchored face does not move in
  world space"), not literal output values.
- `tests/transformGizmo.test.ts` — the full interaction pipeline, driven through
  synthetic pointer events against a fake DOM element
  (`tests/helpers/fakeDom.ts`). No browser or jsdom needed.

New interaction behavior should come with a test in the latter file.

## Conventions

- The gizmo must never mutate the attached object outside a drag.
- Every pointer-move recomputes the transform from the state captured at
  pointer-down, so modifier keys can be toggled mid-drag without jumps. Do not
  accumulate deltas frame to frame.
- Module-level scratch vectors (`_v1`, `_q1`, …) are shared. If you add a call
  in an existing chain, check the lifetimes or add a dedicated temp.

## Releasing

1. Update `CHANGELOG.md` under a new version heading.
2. `npm version <major|minor|patch>`
3. `npm publish` (runs `prepublishOnly`: check + build)
4. `git push --follow-tags`
