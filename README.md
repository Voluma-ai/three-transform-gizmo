# three-transform-gizmo

[![CI](https://github.com/Voluma-ai/three-transform-gizmo/actions/workflows/ci.yml/badge.svg)](https://github.com/Voluma-ai/three-transform-gizmo/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/three-transform-gizmo.svg)](https://www.npmjs.com/package/three-transform-gizmo)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A custom transform gizmo for [three.js](https://threejs.org) — a near drop-in
replacement for `TransformControls` with **extrude-style scaling**, **rotation
angle feedback**, and **themeable styling**.

- **Extrude scaling.** Handles sit on _both_ ends of every axis and on both
  corners of every plane. Dragging a handle anchors the opposite face/corner in
  world space, so the object grows in one direction — like face-dragging in
  Blender — instead of scaling around its center. Hold <kbd>Alt</kbd> to scale
  from the center instead. A center cube scales uniformly.
- **Per-plane scaling.** `+XY`, `-XZ`, … handles scale two axes at once,
  anchored on the opposite corner.
- **Rotation with angle feedback.** Three axis rings plus a screen-space ring,
  with a translucent "pie slice" showing the swept angle while dragging. Hold
  <kbd>Shift</kbd> for 15° snapping (configurable), or set a permanent
  `rotationSnap`.
- **Themeable.** Colors, opacities and geometry sizes come from a theme object
  that can be swapped at runtime.

Anchored scaling is correct for objects inside rotated and non-uniformly scaled
parents, for meshes with off-center geometry, and for mirrored (negative-scale)
objects — the anchor is derived from the object's local bounding box.

## Installation

```bash
npm install three-transform-gizmo three
```

`three` is a peer dependency (`>=0.156.0`). TypeScript users should also install
types, since three does not ship its own:

```bash
npm install -D @types/three
```

## Quick start

```ts
import * as THREE from 'three'
import { TransformGizmo } from 'three-transform-gizmo'

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
gizmo.setMode('scale') // 'translate' | 'rotate' | 'scale'
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
| Drag an axis end-cube (scale)          | extrude along that axis — the opposite face stays put                    |
| Drag a plane quad (scale)              | extrude two axes — the opposite corner stays put                         |
| Drag the center cube (scale)           | uniform scale from the center                                            |
| <kbd>Alt</kbd> + scale drag            | scale from the center instead of anchoring                               |
| <kbd>Shift</kbd> + rotate drag         | snap to `theme.snapping.shiftRotationSnapDeg` (default 15°)              |

Modifier keys are read from the pointer event, so they take effect on the next
pointer move rather than the instant the key is pressed. Because every move
recomputes the transform from the state captured at pointer-down, toggling a
modifier mid-drag never causes a jump.

## API

### `new TransformGizmo(camera, domElement, options?)`

| Parameter       | Type           | Description                                           |
| --------------- | -------------- | ----------------------------------------------------- |
| `camera`        | `Camera`       | perspective or orthographic; may be parented to a rig |
| `domElement`    | `HTMLElement`  | usually `renderer.domElement`                         |
| `options.theme` | `PartialTheme` | deep-merged over the defaults                         |

### Methods

| Method                          | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `attach(object)`                | control `object`; makes the gizmo visible                        |
| `detach()`                      | stop controlling; ends an active drag and hides the gizmo        |
| `setMode(mode)`                 | `'translate' \| 'rotate' \| 'scale'` (also settable via `.mode`) |
| `setSpace(space)`               | `'world' \| 'local'` (also settable via `.space`)                |
| `setTranslationSnap(n \| null)` | grid snap for translation, in world units                        |
| `setRotationSnap(rad \| null)`  | permanent rotation snap, in radians                              |
| `setScaleSnap(n \| null)`       | snap for the resulting scale value                               |
| `setSize(n)`                    | overall gizmo size multiplier                                    |
| `setTheme(partial)`             | merge a partial theme and rebuild the handles                    |
| `getTheme()`                    | the resolved theme currently in use                              |
| `getRaycaster()`                | the instance's `Raycaster`, e.g. to set `.layers`                |
| `reset()`                       | cancel the active drag and restore the transform from drag start |
| `dispose()`                     | remove DOM listeners and free geometries/materials               |

Changing mode, space, `enabled`, or the theme during a drag safely ends that
drag first (emitting `mouseUp` and `dragging-changed: false`).

### Properties

| Property                                         | Type               | Default       | Description                          |
| ------------------------------------------------ | ------------------ | ------------- | ------------------------------------ |
| `object`                                         | `Object3D \| null` | `null`        | the attached object                  |
| `enabled`                                        | `boolean`          | `true`        | when false, pointer input is ignored |
| `size`                                           | `number`           | `1`           | size multiplier                      |
| `mode`                                           | `GizmoMode`        | `'translate'` |                                      |
| `space`                                          | `GizmoSpace`       | `'world'`     | scale always uses local axes         |
| `translationSnap` / `rotationSnap` / `scaleSnap` | `number \| null`   | `null`        |                                      |
| `showX` / `showY` / `showZ`                      | `boolean`          | `true`        | hides _and_ un-picks that axis       |
| `axis` _(readonly)_                              | `AxisId \| null`   |               | hovered/dragged handle               |
| `dragging` _(readonly)_                          | `boolean`          |               |                                      |

### Events

| Event                   | Payload              | When                                         |
| ----------------------- | -------------------- | -------------------------------------------- |
| `change`                | —                    | anything that affects rendering              |
| `objectChange`          | —                    | the attached object's transform was modified |
| `dragging-changed`      | `{ value: boolean }` | a drag started or ended                      |
| `mouseDown` / `mouseUp` | `{ mode }`           | drag start / end                             |
| `hoveron`               | `{ axis }`           | a handle became hovered                      |
| `hoveroff`              | —                    | no handle is hovered                         |

`AxisId` is `'X' \| 'Y' \| 'Z' \| 'XY' \| 'XZ' \| 'YZ' \| 'XYZ' \| 'E'` for
translate/rotate, and signed for scale: `'+X'`, `'-X'`, `'+XY'`, …, `'XYZ'`.
The sign is the grabbed side; the opposite side is the anchor.

## Theming

```ts
import { TransformGizmo, defaultTheme } from 'three-transform-gizmo'

const gizmo = new TransformGizmo(camera, renderer.domElement, {
  theme: {
    colors: { x: 0xff6b9d, y: 0xa8e063, z: 0x56ccf2, hover: 0xffffff },
    sizes: { scaleCubeSize: 0.13, ringTube: 0.025 },
    snapping: { shiftRotationSnapDeg: 5 },
  },
})

gizmo.setTheme({ colors: { sector: 0x56ccf2 } }) // partial update at runtime
```

`setTheme()` rebuilds the handle meshes, so prefer setting it on state changes
rather than every frame.

### Theme reference

| `colors`           | Default                              |                                               |
| ------------------ | ------------------------------------ | --------------------------------------------- |
| `x` / `y` / `z`    | `0xe5484d` / `0x30a46c` / `0x0091ff` | per-axis handle colors                        |
| `screen`           | `0xe0e0e0`                           | screen-space ring and center translate handle |
| `uniform`          | `0xffffff`                           | uniform-scale center cube                     |
| `hover` / `active` | `0xffd60a`                           | hovered / dragged handle tint                 |
| `sector`           | `0xffd60a`                           | rotation angle sector fill                    |

| `opacity`                   | Default |                                      |
| --------------------------- | ------- | ------------------------------------ |
| `idle` / `hover` / `active` | `1`     | handle opacity per state             |
| `inactiveWhileDragging`     | `0.15`  | other handles fade out during a drag |
| `sector`                    | `0.25`  | angle sector fill                    |

| `sizes`                                               | Default                |                                        |
| ----------------------------------------------------- | ---------------------- | -------------------------------------- |
| `gizmoSize`                                           | `1`                    | base multiplier (combined with `size`) |
| `arrowLength` / `arrowHeadLength` / `arrowHeadRadius` | `0.8` / `0.2` / `0.06` | translate arrows                       |
| `axisLineRadius`                                      | `0.0125`               | axis shaft thickness                   |
| `planeOffset` / `planeSize`                           | `0.45` / `0.22`        | plane handle placement and size        |
| `ringRadius` / `ringTube`                             | `0.75` / `0.015`       | rotate rings                           |
| `screenRingRadius`                                    | `0.95`                 | outer screen-space ring                |
| `scaleCubeSize` / `scaleHandleDistance`               | `0.1` / `0.8`          | scale handles                          |
| `pickerScale`                                         | `2.5`                  | invisible hit-area multiplier          |

| Other                           | Default |                                            |
| ------------------------------- | ------- | ------------------------------------------ |
| `snapping.shiftRotationSnapDeg` | `15`    | <kbd>Shift</kbd> rotation snap             |
| `renderOrder`                   | `999`   | handles render on top (`depthTest: false`) |

## Migrating from `TransformControls`

| `TransformControls` API                                                     | Supported | Notes                                                             |
| --------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `attach(object)` / `detach()` / `dispose()`                                 | ✅        |                                                                   |
| `mode` / `setMode()`                                                        | ✅        |                                                                   |
| `space` / `setSpace()`                                                      | ✅        | scale mode always uses local axes (as upstream)                   |
| `setTranslationSnap` / `setRotationSnap` / `setScaleSnap`                   | ✅        | same "snap the resulting transform" semantics                     |
| `size`, `enabled`, `showX/Y/Z`                                              | ✅        |                                                                   |
| `dragging`, `axis` (readonly)                                               | ✅        | scale axes are signed: `'+X'`, `'-XY'`, …                         |
| `getRaycaster()`, `reset()`                                                 | ✅        |                                                                   |
| events `change`, `objectChange`, `dragging-changed`, `mouseDown`, `mouseUp` | ✅        | same names and payloads                                           |
| `getHelper()`                                                               | n/a       | not needed — this gizmo _is_ an `Object3D`, so `scene.add(gizmo)` |
| `setTheme()` / `getTheme()`, `hoveron` / `hoveroff`                         | ➕        | extensions                                                        |

A typical migration is two lines: construct `TransformGizmo` instead of
`TransformControls`, and `scene.add(gizmo)` instead of
`scene.add(controls.getHelper())`.

## Limitations

- **Scale is always local.** Per-axis world-space scaling of a rotated object
  cannot be represented by `Object3D.scale`, so scale handles follow the
  object's local axes — the same choice `TransformControls` makes.
- **World-space translation snapping with a rotated or scaled parent** snaps in
  the parent's frame offset by its world translation, matching upstream
  `TransformControls`. It is exact for unrotated parents.
- **The extrude anchor needs bounds.** It uses the object's local bounding box;
  objects with no renderable geometry fall back to a unit box.
- **Add the gizmo to the scene root.** It writes its own world position and
  orientation each frame, so parenting it to a transformed group will misalign it.
- **Call `dispose()`** when you are done — it owns DOM listeners on `domElement`.

## Compatibility

- three.js `>=0.156.0` (CI covers 0.156, 0.166, and `latest`).
- Node `>=18` for the toolchain; the library itself is browser code with no
  runtime dependencies beyond three.
- Ships ESM and CJS builds with TypeScript declarations for both.

## Development

```bash
npm install
npm run dev     # demo at http://localhost:5173
npm run check   # typecheck + lint + tests
npm run build   # dist/
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © Voluma
