# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Voluma-ai/three-transform-gizmo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Voluma-ai/three-transform-gizmo/releases/tag/v0.1.0
