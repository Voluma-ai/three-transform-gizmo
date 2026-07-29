# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Voluma-ai/three-transform-gizmo/releases/tag/v0.1.0
