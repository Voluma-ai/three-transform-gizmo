# @voluma/three-transform-gizmo

<!-- Image shields. Do not flatten to [CI](url) text links. -->
[![CI](https://github.com/Voluma-ai/three-transform-gizmo/actions/workflows/ci.yml/badge.svg)](https://github.com/Voluma-ai/three-transform-gizmo/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@voluma/three-transform-gizmo.svg)](https://www.npmjs.com/package/@voluma/three-transform-gizmo)
[![demo](https://img.shields.io/badge/demo-live-4c1.svg)](https://voluma-ai.github.io/three-transform-gizmo/)
[![license](https://img.shields.io/github/license/Voluma-ai/three-transform-gizmo.svg)](./LICENSE)

A near drop-in replacement for `TransformControls` with **extrude-style scaling**,  
**rotation angle feedback**, and **themeable styling**.

- **Extrude scaling.** Axis cubes pin the opposite face; plane quads and the center
  cube scale from the origin. Shift = proportional + origin fixed; Alt/Option flips
  the configured anchor.
- **Space-aware snapping.** Ctrl (Windows/Linux) or Command (macOS) temporarily
  enables snap. World translation/rotation snap to global grids; local snaps relative
  to the drag-start transform. Configured `*Snap` values take precedence over theme
  temporary defaults.
- **Themeable.** Colors, opacities and geometry sizes come from a theme object.
- **Combined mode.** Translate, rotate and scale in one view.

## Installation

```bash
npm install @voluma/three-transform-gizmo three
```

`three` is a peer dependency (`>=0.156.0`). TypeScript users should also install
types, since three does not ship its own:

```bash
npm install -D @types/three
```

## Quick start

```ts
import * as THREE from 'three'
import { TransformGizmo } from '@voluma/three-transform-gizmo'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100)
camera.position.set(4, 3, 6)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)

const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial())
scene.add(mesh)

// the gizmo is itself an Object3D — add it to the scene directly
const gizmo = new TransformGizmo(camera, renderer.domElement)
gizmo.attach(mesh)
scene.add(gizmo)

// keep your orbit/camera controls from fighting the drag
gizmo.addEventListener('dragging-changed', (e) => {
  orbitControls.enabled = !e.value
})
gizmo.addEventListener('objectChange', () => {
  // the object's position/rotation/scale changed
})

renderer.setAnimationLoop(() => renderer.render(scene, camera))
```

Switching modes and snapping:

```ts
gizmo.setMode('scale') // 'translate' | 'rotate' | 'scale' | 'combined'
gizmo.setSpace('local') // 'world' | 'local'
gizmo.setTranslationSnap(1) // world units, null to disable
gizmo.setRotationSnap(Math.PI / 12)
gizmo.setScaleSnap(0.25)
```

## Interaction

| Gesture                                | Effect                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Drag an axis arrow (translate)         | move along that axis                                                     |
| Drag a plane quad (translate)          | move in that plane                                                       |
| Drag the center octahedron (translate) | move in the screen plane                                                 |
| Drag a ring (rotate)                   | rotate about that axis; the outer white ring rotates about the view axis |
| Drag the center sphere (rotate)        | trackball free-rotate (`XYZE`; hidden in combined mode)                  |
| Drag an axis end-cube (scale)          | extrude along that axis — the opposite face stays put                    |
| Drag a plane quad (scale)              | scale two axes from the center (origin stays fixed)                      |
| Drag the center cube (scale)           | uniform scale from the center                                            |
| Ctrl/Cmd + translate / rotate / scale  | temporary snap (theme defaults, or configured `*Snap` if set)            |
| Shift + scale drag                     | constrain proportions and keep origin fixed (center-anchored)            |
| Alt/Option + scale drag                | use the anchor `scaleAnchor` is not set to (default: scale from center)  |

Snapping is space-aware: world translation and constrained world rotation snap
resulting transforms to global grids; local translation and rotation snap
increments relative to the drag-start transform. Screen and trackball rotation
always snap relatively (absolute orientation is undefined for those handles).
This intentionally diverges from three.js `TransformControls`, whose
`rotationSnap` is always incremental.

## API

### `new TransformGizmo(camera, domElement, options?)`

| Parameter             | Type           | Description                                           |
| --------------------- | -------------- | ----------------------------------------------------- |
| `camera`              | `Camera`       | perspective or orthographic; may be parented to a rig |
| `domElement`          | `HTMLElement`  | usually `renderer.domElement`                         |
| `options.theme`       | `PartialTheme` | deep-merged over the defaults                         |
| `options.scaleAnchor` | `ScaleAnchor`  | `'opposite'` (default, extrude) or `'center'`         |

### Methods

| Method                        | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `attach(object)`              | control `object`; makes the gizmo visible                        |
| `detach()`                    | stop controlling; ends an active drag and hides the gizmo        |
| `setMode(mode)` / `getMode()` | `'translate'                                                     | 'rotate'                                   | 'scale' | 'combined'`(also settable via`.mode`) |
| `setSpace(space)`             | `'world'                                                         | 'local'`(also settable via`.space`)        |
| `setScaleAnchor(anchor)`      | `'opposite'                                                      | 'center'`(also settable via`.scaleAnchor`) |
| `setTranslationSnap(n         | null)`                                                           | grid snap for translation, in world units  |
| `setRotationSnap(rad          | null)`                                                           | permanent rotation snap, in radians        |
| `setScaleSnap(n               | null)`                                                           | snap for the resulting scale value         |
| `setSize(n)`                  | overall gizmo size multiplier                                    |
| `setColors(x, y, z, active)`  | set axis + active/hover colors (also via `setTheme`)             |
| `setTheme(partial)`           | merge a partial theme and rebuild the handles                    |
| `getTheme()`                  | snapshot of the resolved theme (`setTheme` to change it)         |
| `getHelper()`                 | returns `this` (for `scene.add(gizmo.getHelper())` migrations)   |
| `getRaycaster()`              | the instance's `Raycaster`, e.g. to set `.layers`                |
| `connect()` / `disconnect()`  | attach/remove DOM listeners (constructor connects)               |
| `finishDrag()`                | commit the active drag, keeping the current transform            |
| `reset()`                     | cancel the active drag and restore the transform from drag start |
| `dispose()`                   | disconnect listeners and free geometries/materials               |

`finishDrag()` is a no-op when no drag is active. `pointerup` and unexpected
`lostpointercapture` commit via `finishDrag()`; `pointercancel` calls `reset()`.
Changing mode, space, `scaleAnchor`, `enabled`, the attached `object`, or the
theme during a drag also commits (emitting `mouseUp` while `dragging` is still
true, then `dragging-changed: false`).

Modifier keys are sampled from the latest pointer _and_ from `keydown` /
`keyup`. Toggling Shift, Alt/Option, or Ctrl/Command mid-drag recomputes the
transform from the pointer-down state at the last pointer position.

A configured `*Snap` of `0` (or any non-positive number) means “no snap”,
including while Ctrl/Command is held. `null` is unset: Ctrl/Command then uses
the theme temporary default.

### Properties

| Property                                         | Type          | Default       | Description                                |
| ------------------------------------------------ | ------------- | ------------- | ------------------------------------------ |
| `object`                                         | `Object3D     | null`         | `null`                                     | attached object; assign shows/hides like attach/detach |
| `enabled`                                        | `boolean`     | `true`        | when false, pointer input is ignored       |
| `size`                                           | `number`      | `1`           | size multiplier                            |
| `mode`                                           | `GizmoMode`   | `'translate'` |                                            |
| `space`                                          | `GizmoSpace`  | `'world'`     | scale always uses local axes               |
| `scaleAnchor`                                    | `ScaleAnchor` | `'opposite'`  | `'opposite'` (extrude) or `'center'`       |
| `translationSnap` / `rotationSnap` / `scaleSnap` | `number       | null`         | `null`                                     | `null` unset; `0` disables snap (incl. Ctrl)           |
| `showX` / `showY` / `showZ`                      | `boolean`     | `true`        | hides _and_ un-picks that axis             |
| `showXY` / `showXZ` / `showYZ`                   | `boolean`     | `true`        | plane handle visibility                    |
| `showE`                                          | `boolean`     | `true`        | screen-space rotate ring                   |
| `showXYZE`                                       | `boolean`     | `true`        | trackball free-rotate (hidden in combined) |
| `minX`/`maxX`/`minY`/`maxY`/`minZ`/`maxZ`        | `number`      | `±Infinity`   | translation clamps                         |
| `viewport`                                       | `Vector4      | null`         | `null`                                     | sub-canvas pointer region                              |
| `axis` _(readonly)_                              | `AxisId       | null`         |                                            | hovered/dragged handle                                 |
| `dragging` _(readonly)_                          | `boolean`     |               |                                            |

### Events

| Event                   | Payload              | When                                         |
| ----------------------- | -------------------- | -------------------------------------------- |
| `change`                | —                    | anything that affects rendering              |
| `objectChange`          | —                    | the attached object's transform was modified |
| `dragging-changed`      | `{ value: boolean }` | a drag started or ended                      |
| `mouseDown` / `mouseUp` | `{ mode }`           | drag start / end                             |
| `hoveron`               | `{ axis }`           | a handle became hovered                      |
| `hoveroff`              | —                    | no handle is hovered                         |
| `*-changed`             | `{ value }`          | property assign (e.g. `size-changed`)        |

`AxisId` is `'X' \| 'Y' \| 'Z' \| 'XY' \| 'XZ' \| 'YZ' \| 'XYZ' \| 'E' \| 'XYZE'`
for translate/rotate (`E` = view-axis ring, `XYZE` = trackball), and signed for
scale axes: `'+X'`, `'-X'`, …, plus plane quads `'+XY'`/`'+XZ'`/`'+YZ'` and
uniform `'XYZ'`. Axis sign is the grabbed side (opposite face anchors); plane
quads are positive-corner only and center-anchored.

## Theming

```ts
import { TransformGizmo, defaultTheme } from '@voluma/three-transform-gizmo'

const gizmo = new TransformGizmo(camera, renderer.domElement, {
  theme: {
    colors: { x: 0xff6b9d, y: 0xa8e063, z: 0x56ccf2, hover: 0xffffff },
    sizes: { gripSize: 0.0585, ringTube: 0.004875, labelSize: 0.14 },
    snapping: {
      temporaryTranslationSnap: 1,
      temporaryRotationSnapDeg: 5,
      temporaryScaleSnap: 0.25,
    },
    showSectorLabel: true, // opt in to degrees readout while rotating
    showScaleLabel: true, // opt in to relative % while scaling
    showScaleModifiers: true, // opt in to Shift/Alt hints on scale axes
    showOriginDistanceLabel: true, // opt in to distance while translating
  },
})

gizmo.setTheme({ colors: { sector: 0x56ccf2 } }) // partial update at runtime
gizmo.setSize(1.4) // overall gizmo size (TransformControls-compatible)
```

Overall size uses `setSize()` / `.size` (default `1`), matching
`TransformControls`. Theme `sizes` keys (`arrowLength`, `ringTube`,
`gripSize`, `labelSize`, …) tune individual handle geometry on top of that.

`setTheme()` rebuilds the handle meshes, so prefer setting it on state changes
rather than every frame. The [hosted demo](https://voluma-ai.github.io/three-transform-gizmo/)
has a `size` slider (`npm run dev` locally).

## Migrating from `TransformControls`

| `TransformControls` API                                                     | Supported | Notes                                                                |
| --------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| `attach(object)` / `detach()` / `dispose()`                                 | ✅        |                                                                      |
| `mode` / `setMode()` / `getMode()`                                          | ✅        | also `'combined'`                                                    |
| `space` / `setSpace()`                                                      | ✅        | scale mode always uses local axes (as upstream)                      |
| `setTranslationSnap` / `setRotationSnap` / `setScaleSnap`                   | ✅        | compatible setters; snap reference follows `space` (see Interaction) |
| `size` / `setSize()`, `enabled`, `showX/Y/Z`                                | ✅        | property assign emits `*-changed` + `change`                         |
| `showXY` / `showXZ` / `showYZ` / `showE`                                    | ✅        |                                                                      |
| `showXYZE`                                                                  | ✅        | trackball free-rotate; hidden in `combined` mode                     |
| `minX`/`maxX`/…/`maxZ`                                                      | ✅        | translation clamps                                                   |
| `viewport`                                                                  | ✅        | sub-canvas pointer mapping                                           |
| `setColors(x, y, z, active)`                                                | ✅        | maps into theme colors                                               |
| `connect()` / `disconnect()`                                                | ✅        |                                                                      |
| `dragging`, `axis` (readonly)                                               | ✅        | scale: `'+X'`/`'-X'`/…, planes `'+XY'`/…, uniform `'XYZ'`            |
| `getRaycaster()`, `reset()`                                                 | ✅        | `reset()` cancels (restores drag-start transform)                    |
| `finishDrag()`                                                              | ➕        | commit without restoring; use this instead of `reset()` on release   |
| events `change`, `objectChange`, `dragging-changed`, `mouseDown`, `mouseUp` | ✅        | `mouseUp` while `dragging` is still true; plus `*-changed` events    |
| `getHelper()`                                                               | ✅        | returns `this` — also fine to `scene.add(gizmo)` directly            |
| `setTheme()` / `getTheme()`, `hoveron` / `hoveroff`                         | ➕        | extensions                                                           |

A typical migration is two lines: construct `TransformGizmo` instead of
`TransformControls`, and `scene.add(gizmo)` or `scene.add(gizmo.getHelper())`.
Detached `object` is `null` here (upstream uses `undefined`). Scale axis ids
stay signed for extrude.

## Limitations

- **Scale is always local.** Per-axis world-space scaling of a rotated object
  cannot be represented by `Object3D.scale`, so scale handles follow the
  object's local axes — the same choice `TransformControls` makes.
- **The extrude anchor needs bounds.** It uses the object's local bounding box.
  Objects with no renderable geometry (splats, empty containers) scale about
  their origin instead — no guessed unit-box shift.
- **Add the gizmo to the scene root.** It writes its own world position and
  orientation each frame, so parenting it to a transformed group will misalign it.
- **Call** `dispose()` when you are done — it owns DOM listeners on `domElement`.

## Stability

1.0 treats the **public API** as:

- `TransformGizmo` and `TransformGizmoOptions`
- theme types and helpers (`GizmoTheme`, `PartialTheme`, `defaultTheme`, `mergeTheme`)
- exported events, modes, and axis types (`GizmoEventMap`, `GizmoMode`, `GizmoOperation`, `GizmoSpace`, `ScaleAnchor`, `AxisId`, `GizmoShowFlags`)

Internals under `src/core/*` and `src/gizmos/*` are **not** semver-guaranteed. Import the package root, not those paths.

`GizmoTheme` keys are frozen. New fields may appear in a minor; renaming or
removing existing keys is 2.0.

Breaking changes to the public API are 2.0. These divergences from `TransformControls` are frozen on the same schedule:

- Space-aware snap (world grids vs local drag-start increments; screen/trackball stay relative)
- World translation snap in true world coordinates, including rotated/scaled parents
- Detached `object` is `null` (upstream uses `undefined`)
- Signed scale axis ids (`+X` / `-X` / …) for extrude
- `finishDrag()` commits; `reset()` cancels and restores drag-start
- `getHelper()` returns `this`

## Compatibility

- three.js `>=0.156.0` (CI covers 0.156, 0.185, and `latest`).
- Node `>=18` for the toolchain; the library itself is browser code with no
  runtime dependencies beyond three.
- Ships ESM and CJS builds with TypeScript declarations for both.

## Development

```bash
npm install
npm run dev          # demo at http://localhost:5173
npm run build:demo   # static site in demo-dist/ (GitHub Pages)
npm run check        # typecheck + lint + tests
npm run test:visual  # Playwright screenshots (needs Chromium)
npm run build        # dist/
```

Live demo: https://voluma-ai.github.io/three-transform-gizmo/

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © [VOLUMA B.V.](https://voluma.ai)
