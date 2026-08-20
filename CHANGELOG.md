# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `scaleAnchor-changed` on `setScaleAnchor()` / `.scaleAnchor`, matching other
  property setters.

### Changed

- `getTheme()` returns a snapshot. Mutating it no longer touches the live theme;
  call `setTheme()` to apply changes.
- Assigning `.object` shows or hides the gizmo the same way as `attach()` /
  `detach()`. `null` ends an active drag.
- Toggling Shift, Alt/Option, or Ctrl/Command mid-drag recomputes the transform
  at the last pointer position (previously only the next `pointermove` applied
  the new modifiers).
- A configured `translationSnap` / `rotationSnap` / `scaleSnap` of `0` disables
  snap, including Ctrl/Command temporary defaults (`null` remains “unset”).

## [0.9.1] - 2026-08-20

### Added

- `finishDrag()` commits an active drag and keeps the current transform.
  Idempotent when idle. `reset()` remains cancel-only (restore drag-start
  transform, then finish). `pointerup` and matching `lostpointercapture`
  commit; `pointercancel` cancels.

### Changed

- Drag-end event order matches `TransformControls`: `mouseUp` while
  `dragging === true` and drag state is still available, then
  `dragging-changed: false`, then the axis is cleared. Re-entrant
  `finishDrag()` from those listeners emits the sequence once.

## [0.9.0] - 2026-08-03

### Changed

- Space-aware transform snapping: Ctrl (Windows/Linux) / Command (macOS)
  temporarily enables snap across translate, rotate, and scale. World
  translation and constrained world rotation snap resulting transforms to
  global grids; local translation and rotation snap increments relative to the
  drag-start transform. Screen and trackball rotation stay relative.
- Theme snap fields renamed: `temporaryTranslationSnap` (default `1`),
  `temporaryRotationSnapDeg` (default `15`), `temporaryScaleSnap` (default
  `0.25`). Removed `shiftRotationSnapDeg` and `altTranslationSnap`.
- Shift and Alt no longer control translate/rotate snapping. Shift still does
  proportional + center-anchored scale; Alt/Option still flips `scaleAnchor`.
- Configured `translationSnap` / `rotationSnap` / `scaleSnap` take precedence
  over temporary Ctrl/Command defaults; without either, transforms stay
  continuous.
- World translation snap uses true world coordinates (via `worldToLocal`),
  including rotated/scaled parents — intentionally beyond TransformControls'
  parent-translation approximation. Local translation snap is offset-based
  (`start + n × interval`).

## [0.8.0] - 2026-08-03

### Added

- TransformControls API parity: `getMode()`, `getHelper()`, `setColors()`,
  `connect()` / `disconnect()`, `showXY`/`showXZ`/`showYZ`/`showE`/`showXYZE`,
  `minX`…`maxZ` translation clamps, `viewport` pointer mapping, and
  `*-changed` events on property assign.
- Rotate `XYZE` trackball free-rotate (center sphere picker; TransformControls
  formula). Toggled with `showXYZE`; hidden in `combined` mode.

### Changed

- Overall size is `setSize()` / `.size` only (default `1`). Theme geometry
  defaults are ~0.65× the previous values so the radial layout still fits after
  dropping the separate `gizmoSize` multiplier (e.g. `arrowLength` `0.55` →
  `0.3575`, `scaleHandleDistance` `1.0` → `0.65`).
- `sizes.scaleHandleDistanceNonUniform` default `0.65` → `0.4225`; dedicated
  translate arrows match that radius.
- Rotation degrees use the same size as the scale % (`labelSize × 1.15`).
- Renamed `sizes.modifierLabelSize` → `sizes.labelSize`; removed
  `sizes.sectorLabelSize`.
- Renamed `sizes.scaleCubeSize` → `sizes.gripSize` (scale cubes + translate
  center octa).
- Scale shows one plane quad per plane (`+XY`/`+XZ`/`+YZ`), matching
  `TransformControls` (no opposite-diagonal quads).

### Removed

- `sizes.gizmoSize` — use `setSize()` / `.size` instead (same as
  `TransformControls`).

## [0.7.0] - 2026-08-03

### Added

- Origin trail while translating or scaling: gray disc at drag-start plus a
  dashed line to the current origin (axis-colored; dual-dash on planes).
- Optional theme labels (all off by default): `showScaleLabel` (`150%`),
  `showScaleModifiers` (Shift/Alt hints), `showOriginDistanceLabel` (trail
  distance while translating).
- Translate modifiers: Alt snaps the drag offset by `snapping.altTranslationSnap`
  (default `1`); Shift snaps dragged axes to integer world coordinates.
- `sizes.scaleHandleDistanceNonUniform` (default `0.65`) for shorter non-uniform
  scale axes; dedicated translate arrows match that radius.

### Changed

- Plane scale handles always keep the origin fixed (center-anchored).
- Shift + scale also forces center-anchored (in addition to proportional).
- Translate / scale plane colors match `TransformControls` (perp-axis tint);
  plane quads are smaller and closer (`planeSize` / `planeOffset`).
- While scale-dragging, yellow (highlighted) axis cubes/guides stretch with the
  object's scale intensity (`1 + 0.8*(r-1)`).
- Near-zero scale starts use a sensitivity floor (0.1) so a later drag can grow
  the object again without needing absurd multiplicative ratios (extrude still
  pins the opposite face).

## [0.6.1] - 2026-08-03

### Changed

- Sticky rotate hover yields when the pointer is over a translate arrow or scale
  cube _core_ (the drawn shape); the larger picker overhang still keeps rotate.

## [0.6.0] - 2026-08-03

### Added

- Combined mode (`setMode('combined')`): translate, rotate and scale handles
  in one view. Per-handle events still report the concrete operation
  (`GizmoOperation`), not `'combined'`.

### Changed

- Translate arrows are shorter by default (`arrowLength` `0.55`, was `0.8`) and
  scale handles sit farther out (`scaleHandleDistance` `1.0`, was `0.8`) so the
  combined radial layout reads arrow → gap → rotate ring → gap → scale cube.
  Rotate rings are thicker (`ringTube` `0.012`, was `0.0075`).
- Combined mode drops translate/scale plane quads, idle scale shafts, and the
  outer screen-space rotate ring. While translate or scale is hovered or
  dragged, the other tools' visuals hide (rotate keeps the full multi-tool
  view). Overlapping picks resolve as translate → scale → rotate, except
  while a rotate ring is already the active hover: then rotate stays sticky
  as long as the ray still hits a rotate picker.
- While a scale cube is hovered or dragged, dashed axis guides appear:
  half-axis to the cube by default, full current axis with Alt, all axes with
  Shift. Same guides in dedicated scale mode (solid shafts hide while guiding).
- Translate / scale axis pick radii only overhang the visual by half as much
  as before (arrow head radius and cube half-extent as the shape baseline).

## [0.5.0] - 2026-07-29

### Added

- Translate arrows now appear on both ends of each axis, so an object can be
  dragged from either side. Matching three.js `TransformControls`, only the
  positive side draws a shaft — the negative side is the arrow head alone. Both
  heads report the same axis, so dragging either behaves identically.

### Fixed

- The degrees readout no longer renders upside down when the host page also
  runs a renderer that touches `gl.pixelStorei(UNPACK_FLIP_Y_WEBGL)` directly
  on the shared context (e.g. Spark's splat sorter). Such calls desync
  three.js's cached pixel-store state, silently skipping the flip on the
  label's canvas upload. The label now uploads flip-free (`flipY = false`) and
  draws its text pre-flipped instead, which is correct regardless of that
  external state — on WebGL, WebGPU and the WebGL2 fallback alike.

## [0.4.0] - 2026-07-29

### Changed

- Rotate rings are half as thick by default: `theme.sizes.ringTube` is now
  `0.0075` (was `0.015`). Pick radius is unchanged — the invisible picker torus
  multiplier was doubled to compensate. Override `sizes.ringTube` to restore the
  previous look.
- Translate and scale axis shafts are half as thick by default to match:
  `theme.sizes.axisLineRadius` is now `0.00625` (was `0.0125`). Pick radii for
  those handles derive from `arrowHeadRadius` / `scaleCubeSize`, so grabbing is
  unaffected. Override `sizes.axisLineRadius` to restore the previous look.

## [0.3.0] - 2026-07-29

### Added

- Optional live degrees readout inside the rotation angle sector: enable with
  `theme.showSectorLabel` (off by default). While dragging a rotate ring, the
  swept angle is shown in full-circle degrees (e.g. `45°`, `-120°`) on the
  sector's bisector, billboarded toward the camera. Themeable via
  `colors.sectorLabel` and relative size via `sizes.sectorLabelSize`.

## [0.2.0] - 2026-07-29

### Added

- <kbd>Shift</kbd> during a scale drag constrains proportions: every axis takes
  the ratio derived from the dragged axes (their mean, for plane handles)
  instead of only the dragged axes changing. The anchor still belongs to the
  dragged axes, so the grabbed face stays pinned while the axes that come along
  grow about the origin. Composes with <kbd>Alt</kbd>, and is a no-op on the
  centre cube, which already scales uniformly.
- `scaleAnchor` option (`'opposite' | 'center'`, constructor + `setScaleAnchor()`
  - property) selecting whether a scale drag pins the face opposite the grabbed
    handle or the object's origin. <kbd>Alt</kbd> now selects whichever anchor the
    gizmo is _not_ configured for, so `'center'` gives scaling that never moves the
    object, with extrude on demand. Defaults to `'opposite'`, so existing
    behaviour is unchanged.

### Fixed

- Scaling an object with no measurable geometry (a splat, an empty container)
  no longer shifts its position. The anchor previously fell back to a guessed
  unit-cube extent and slid the object by an arbitrary amount; such objects now
  scale about their origin.

## [0.1.0] - 2026-07-29

Initial release, published to npm as `@voluma/three-transform-gizmo`.

### Added

- `TransformGizmo`: a near drop-in replacement for three.js `TransformControls`
  (`attach`/`detach`/`dispose`, `setMode`/`setSpace`, translation/rotation/scale
  snapping, `showX/Y/Z`, `getRaycaster()`, `reset()`, and the same event names:
  `change`, `objectChange`, `dragging-changed`, `mouseDown`, `mouseUp`).
- Extrude-style scaling: handles on both ends of every axis and on both corners
  of every plane. Dragging anchors the opposite face/corner in world space; hold
  <kbd>Alt</kbd> to scale from the center. Works for objects inside rotated and
  non-uniformly scaled parents, and for meshes with off-center geometry.
- Rotation with a translucent angle sector showing the swept angle, a
  screen-space ring, and <kbd>Shift</kbd> angle snapping (default 15°).
- Themeable styling via `GizmoTheme` (colors, opacities, sizes, snapping,
  render order), hot-swappable with `setTheme()`.
- Extra `hoveron` / `hoveroff` events beyond the `TransformControls` set.

### Compatibility

- Requires `three >= 0.156.0` as a peer dependency. CI covers 0.156, 0.185 and
  `latest`.
- Ships ESM and CJS builds with TypeScript declarations for both.

[Unreleased]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.9.1...HEAD
[0.9.1]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Voluma-ai/three-transform-gizmo/releases/tag/v0.1.0
