# three-transform-gizmo

Custom transform gizmo for [three.js](https://threejs.org) — a near drop-in replacement for
`TransformControls` with:

- **Extrude-style scaling**: handles on *both* ends of every axis and on both corners of every
  plane. Dragging a handle anchors the opposite face/corner in world space, so the object grows
  in one direction (like face-dragging in Blender). Hold **Alt** to scale from the center instead.
  A center cube scales uniformly.
- **Per-plane scaling**: `+XY`, `-XZ`, … handles scale two axes at once, anchored on the
  opposite corner.
- **Rotation with angle feedback**: three axis rings plus a screen-space ring, with a translucent
  "pie slice" showing the swept angle while dragging. Hold **Shift** for 15° snapping
  (configurable), or set a permanent `rotationSnap`.
- **Themeable styling**: colors, opacities and geometry sizes via a theme object, hot-swappable
  with `setTheme()`.

Anchored scaling works correctly for objects inside rotated and non-uniformly scaled parents and
for meshes with off-center geometry (the anchor uses the object's local bounding box).

## Install / build

```bash
npm install        # deps (three is a peerDependency)
npm run dev        # interactive demo at http://localhost:5173
npm test           # vitest unit tests for the math core
npm run build      # ESM + CJS + d.ts into dist/
```

## Usage

```ts
import { TransformGizmo } from 'three-transform-gizmo'

const gizmo = new TransformGizmo(camera, renderer.domElement)
gizmo.attach(mesh)
scene.add(gizmo)

gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value })
gizmo.addEventListener('objectChange', () => { /* object moved/rotated/scaled */ })

gizmo.setMode('scale')       // 'translate' | 'rotate' | 'scale'
gizmo.setSpace('local')      // 'world' | 'local' (scale always operates in local axes)
gizmo.setTranslationSnap(1)
gizmo.setRotationSnap(Math.PI / 12)
gizmo.setScaleSnap(0.25)
```

### Custom styling

```ts
const gizmo = new TransformGizmo(camera, renderer.domElement, {
  theme: {
    colors: { x: 0xff6b9d, y: 0xa8e063, z: 0x56ccf2, hover: 0xffffff },
    sizes: { scaleCubeSize: 0.13, ringTube: 0.025 },
    snapping: { shiftRotationSnapDeg: 5 },
  },
})
gizmo.setTheme({ colors: { sector: 0x56ccf2 } }) // partial update at runtime
```

## TransformControls compatibility

| TransformControls API | Supported | Notes |
| --- | --- | --- |
| `attach(object)` / `detach()` / `dispose()` | ✅ | |
| `mode` / `setMode()` | ✅ | |
| `space` / `setSpace()` | ✅ | scale mode always uses local axes (as in TransformControls) |
| `setTranslationSnap/RotationSnap/ScaleSnap()` | ✅ | |
| `size`, `enabled`, `showX/Y/Z` | ✅ | |
| `dragging`, `axis` (readonly) | ✅ | scale axes are signed: `'+X'`, `'-XY'`, … |
| `getRaycaster()`, `reset()` | ✅ | `reset()` cancels the active drag and restores the start transform |
| events `change`, `objectChange`, `dragging-changed`, `mouseDown`, `mouseUp` | ✅ | same names/payloads; extra `hoveron`/`hoveroff` |
| `getHelper()` | — | the gizmo *is* an `Object3D`; add it to the scene directly |
| `setTheme(partial)`, `getTheme()` | ➕ | extension |

Swapping in an editor is typically: construct `TransformGizmo` instead of `TransformControls`
and `scene.add(gizmo)` instead of `scene.add(controls.getHelper())`.

## Interaction summary

| Gesture | Effect |
| --- | --- |
| Drag axis end-cube (scale) | extrude along that axis; opposite face stays put |
| Drag plane quad (scale) | extrude two axes; opposite corner stays put |
| **Alt** + scale drag | scale from center |
| Drag center cube (scale) | uniform scale from center |
| **Shift** + rotate drag | snap to `shiftRotationSnapDeg` (default 15°) |
