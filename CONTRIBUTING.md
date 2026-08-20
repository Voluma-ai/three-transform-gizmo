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
- Every pointer-move **and** modifier key change recomputes the transform from
  the state captured at pointer-down, so Shift / Alt / Ctrl can be toggled
  mid-drag without jumps. Do not accumulate deltas frame to frame.
- Module-level scratch vectors (`_v1`, `_q1`, …) are shared. If you add a call
  in an existing chain, check the lifetimes or add a dedicated temp.

## Releasing

The package is published to npm as `@voluma/three-transform-gizmo` by the
`Release` workflow (`.github/workflows/release.yml`), which runs when a GitHub
Release is published. It publishes with provenance, so npm attests that the
tarball was built from that commit in CI.

1. Update `CHANGELOG.md`: move the entries under a new version heading and add
   the compare links at the bottom.
2. `npm version <major|minor|patch>` — bumps `package.json` and creates the tag.
3. `git push --follow-tags`
4. Create a GitHub Release for that tag (Releases → Draft a new release). The
   workflow verifies the tag matches `package.json`, runs `npm run check` and
   `npm run build`, then publishes.

### One-time setup

Authentication uses **npm Trusted Publishing** (OIDC): npm verifies that the
publish comes from this workflow in this repository, so there is **no
`NPM_TOKEN` secret to store, rotate or leak**.

On npmjs.com → `@voluma/three-transform-gizmo` → Settings → Trusted Publisher,
add a GitHub Actions publisher with:

| Field        | Value                   |
| ------------ | ----------------------- |
| Organization | `Voluma-ai`             |
| Repository   | `three-transform-gizmo` |
| Workflow     | `release.yml`           |

Trusted publishing can only be configured on a package that already exists, so
the very first version had to be published manually. Every release after that
goes through the workflow.

Publishing manually (`npm publish`) still works and runs the same checks through
`prepublishOnly`, but it publishes from your working directory rather than a
clean checkout — uncommitted changes end up in the tarball — and it skips
provenance. Prefer the workflow.
