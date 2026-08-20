import { beforeEach, describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  Vector4,
  type Camera,
} from 'three'
import { ModeGizmo } from '../src/gizmos/ModeGizmo'
import { twistAngleAroundAxis } from '../src/core/Snapping'
import { TransformGizmo } from '../src/TransformGizmo'
import type { AxisId } from '../src/types'
import { createFakeElement, HEIGHT, keyEvent, pointerEvent, WIDTH, type FakeElement } from './helpers/fakeDom'

/**
 * End-to-end tests of the interaction pipeline, driven through the same
 * pointer events a browser would deliver. No DOM required.
 */

let scene: Scene
let camera: PerspectiveCamera
let el: FakeElement
let gizmo: TransformGizmo
let cube: Mesh

function makeCube(): Mesh {
  return new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
}

beforeEach(() => {
  scene = new Scene()
  camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 100)
  // an off-axis editor-style view: an axis-aligned camera would sit exactly in
  // the plane of the plane-handles, making picking there degenerate
  camera.position.set(4, 3.5, 6)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  el = createFakeElement()
  cube = makeCube()
  scene.add(cube)
  gizmo = new TransformGizmo(camera, el as unknown as HTMLElement)
  scene.add(gizmo)
  gizmo.attach(cube)
  scene.updateMatrixWorld(true)
})

/** project a world point to fake-canvas pixel coordinates */
function toScreen(p: Vector3, cam: Camera = camera): { x: number; y: number } {
  const v = p.clone().project(cam)
  return { x: ((v.x + 1) / 2) * WIDTH, y: ((1 - v.y) / 2) * HEIGHT }
}

/** screen position of a point at `dist` along a local axis, in gizmo units */
function handlePoint(dir: Vector3, dist: number, cam: Camera = camera): { x: number; y: number } {
  gizmo.updateMatrixWorld(true)
  const world = cube.getWorldPosition(new Vector3()).add(
    dir
      .clone()
      .normalize()
      .multiplyScalar(gizmo.scale.x * dist),
  )
  return toScreen(world, cam)
}

function down(pt: { x: number; y: number }, opts = {}) {
  el.dispatch('pointerdown', pointerEvent(pt.x, pt.y, opts))
}
function move(pt: { x: number; y: number }, opts = {}) {
  el.dispatch('pointermove', pointerEvent(pt.x, pt.y, opts))
}
function up(pt: { x: number; y: number }, opts = {}) {
  el.dispatch('pointerup', pointerEvent(pt.x, pt.y, opts))
}
function cancel(pt: { x: number; y: number }, opts = {}) {
  el.dispatch('pointercancel', pointerEvent(pt.x, pt.y, opts))
}
function key(opts: { altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) {
  el.dispatch('keydown', keyEvent(opts))
}

/** drag from a handle by a pixel delta, in a few steps */
function drag(from: { x: number; y: number }, dx: number, dy: number, opts = {}) {
  down(from, opts)
  for (let i = 1; i <= 4; i++) {
    move({ x: from.x + (dx * i) / 4, y: from.y + (dy * i) / 4 }, opts)
  }
  up({ x: from.x + dx, y: from.y + dy }, opts)
}

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

const ALL_SHOW = { x: true, y: true, z: true, xy: true, xz: true, yz: true, e: true, xyze: true }

/** Tip / along-shaft distances in current theme gizmo units. */
function arrowTip(): number {
  return gizmo.getTheme().sizes.arrowLength
}
function arrowAlong(frac: number): number {
  return gizmo.getTheme().sizes.arrowLength * frac
}

describe('attach / detach / visibility', () => {
  it('is hidden until attached and hidden again after detach', () => {
    const g = new TransformGizmo(camera, el as unknown as HTMLElement)
    expect(g.visible).toBe(false)
    g.attach(cube)
    expect(g.visible).toBe(true)
    expect(g.object).toBe(cube)
    g.detach()
    expect(g.visible).toBe(false)
    expect(g.object).toBeNull()
    g.dispose()
  })

  it('ignores pointer input when disabled', () => {
    gizmo.enabled = false
    const before = cube.position.clone()
    drag(handlePoint(X, arrowTip()), 60, 0)
    expect(cube.position.equals(before)).toBe(true)
    expect(gizmo.dragging).toBe(false)
  })

  it('shows the gizmo when object is assigned, hides when cleared', () => {
    const g = new TransformGizmo(camera, el as unknown as HTMLElement)
    expect(g.visible).toBe(false)
    g.object = cube
    expect(g.visible).toBe(true)
    expect(g.object).toBe(cube)
    g.object = null
    expect(g.visible).toBe(false)
    expect(g.object).toBeNull()
    g.dispose()
  })
})

describe('hover picking', () => {
  it('picks the axis under the pointer and fires hoveron/hoveroff', () => {
    const events: string[] = []
    gizmo.addEventListener('hoveron', (e) => events.push(`on:${e.axis}`))
    gizmo.addEventListener('hoveroff', () => events.push('off'))

    move(handlePoint(X, arrowTip()))
    expect(gizmo.axis).toBe('X')
    move({ x: 5, y: 5 }) // far from the gizmo
    expect(gizmo.axis).toBeNull()
    expect(events).toEqual(['on:X', 'off'])
  })

  it('picks the same axis from the negative side of the arrow', () => {
    move(handlePoint(X.clone().negate(), arrowTip()))
    expect(gizmo.axis).toBe('X')
  })

  it('drags along the negative arrow the same way as the positive one', () => {
    drag(handlePoint(X.clone().negate(), arrowTip()), 60, 0)
    expect(cube.position.x).toBeGreaterThan(0)
  })

  it('picks correctly before the first render after attach', () => {
    // fresh gizmo + object that was never rendered: matrices are stale
    const g = new TransformGizmo(camera, el as unknown as HTMLElement)
    const far = makeCube()
    far.position.set(2, 0, 0)
    scene.add(far)
    scene.add(g)
    g.attach(far)
    g.updateMatrixWorld(true)
    const tip = g.getTheme().sizes.arrowLength
    const pt = toScreen(far.getWorldPosition(new Vector3()).add(X.clone().multiplyScalar(g.scale.x * tip)))
    // deliberately do NOT render/update again
    el.dispatch('pointermove', pointerEvent(pt.x, pt.y))
    expect(g.axis).toBe('X')
    g.dispose()
  })

  it('does not pick axes hidden via showX/showY/showZ', () => {
    gizmo.showX = false
    move(handlePoint(X, arrowTip()))
    expect(gizmo.axis).not.toBe('X')
  })

  it('picks with touch pointerType the same as mouse', () => {
    move(handlePoint(X, arrowTip()), { pointerType: 'touch' })
    expect(gizmo.axis).toBe('X')
  })
})

describe('translate', () => {
  it('moves the object along the dragged axis only', () => {
    drag(handlePoint(X, arrowTip()), 60, 0)
    expect(cube.position.x).toBeGreaterThan(0.1)
    expect(cube.position.y).toBeCloseTo(0)
    expect(cube.position.z).toBeCloseTo(0)
  })

  it('translates from a touch pointer', () => {
    drag(handlePoint(X, arrowTip()), 60, 0, { pointerType: 'touch' })
    expect(cube.position.x).toBeGreaterThan(0.1)
    expect(cube.position.y).toBeCloseTo(0)
  })

  it('snaps world translation to the global grid when translationSnap is set', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    gizmo.setTranslationSnap(1)
    drag(handlePoint(X, arrowTip()), 80, 0)
    expect(cube.position.x % 1).toBeCloseTo(0)
  })

  it('snaps world translation with Ctrl using the temporary theme default', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    drag(handlePoint(X, arrowTip()), 80, 0, { ctrlKey: true })
    const world = cube.getWorldPosition(new Vector3())
    expect(world.x % 1).toBeCloseTo(0)
  })

  it('treats Command (metaKey) like Ctrl for temporary translation snap', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    drag(handlePoint(X, arrowTip()), 80, 0, { metaKey: true })
    expect(cube.getWorldPosition(new Vector3()).x % 1).toBeCloseTo(0)
  })

  it('snaps local translation as start + n × interval', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    gizmo.setSpace('local')
    gizmo.setTranslationSnap(1)
    drag(handlePoint(X, arrowTip()), 80, 0)
    expect((cube.position.x - 0.37) % 1).toBeCloseTo(0)
    expect(cube.position.x % 1).toBeCloseTo(0.37)
  })

  it('prefers configured translationSnap over the temporary Ctrl default', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    gizmo.setTranslationSnap(0.5)
    drag(handlePoint(X, arrowTip()), 80, 0, { ctrlKey: true })
    expect(cube.position.x % 0.5).toBeCloseTo(0)
  })

  it('stays continuous without a configured snap or Ctrl', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    drag(handlePoint(X, arrowTip()), 80, 0)
    expect(cube.position.x).not.toBeCloseTo(Math.round(cube.position.x))
    expect(cube.position.x).toBeGreaterThan(0.37)
  })

  it('treats a configured snap of 0 as off, even with Ctrl', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    gizmo.setTranslationSnap(0)
    drag(handlePoint(X, arrowTip()), 80, 0, { ctrlKey: true })
    expect(cube.position.x).not.toBeCloseTo(Math.round(cube.position.x))
    expect(cube.position.x).toBeGreaterThan(0.37)
  })

  it('snaps when Ctrl is pressed mid-drag', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    const pt = handlePoint(X, arrowTip())
    down(pt)
    move({ x: pt.x + 80, y: pt.y })
    expect(cube.position.x).not.toBeCloseTo(Math.round(cube.position.x))
    key({ ctrlKey: true })
    expect(cube.getWorldPosition(new Vector3()).x % 1).toBeCloseTo(0)
    up({ x: pt.x + 80, y: pt.y }, { ctrlKey: true })
  })

  it('respects a translated parent when snapping in world space', () => {
    const parent = new Group()
    parent.position.set(0.5, 0, 0)
    scene.add(parent)
    scene.remove(cube)
    parent.add(cube)
    scene.updateMatrixWorld(true)
    gizmo.setTranslationSnap(1)
    drag(handlePoint(X, arrowTip()), 80, 0)
    const world = cube.getWorldPosition(new Vector3())
    expect(world.x % 1).toBeCloseTo(0)
  })

  it('snaps local translation through a rotated parent', () => {
    const parent = new Group()
    parent.rotation.z = Math.PI / 2
    scene.add(parent)
    scene.remove(cube)
    parent.add(cube)
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    gizmo.setSpace('local')
    gizmo.setTranslationSnap(1)
    drag(handlePoint(X, arrowTip()), 80, 0)
    // Offset along the object's local X, quantized, then mapped through parent.
    expect((cube.position.x - 0.37) % 1).toBeCloseTo(0)
  })
})

describe('rotate', () => {
  function ringPoint(): { x: number; y: number } {
    return handlePoint(Y, gizmo.getTheme().sizes.ringRadius)
  }

  it('snaps world-axis rotation to absolute twist with Ctrl', () => {
    gizmo.setMode('rotate')
    // ringPoint() sits on the X ring (YZ plane). Start 2.241° about world X —
    // nearest 15° grid point is 0°.
    cube.quaternion.setFromAxisAngle(X, (2.241 * Math.PI) / 180)
    scene.updateMatrixWorld(true)
    drag(ringPoint(), 2, 0, { ctrlKey: true })
    const twist = twistAngleAroundAxis(cube.getWorldQuaternion(new Quaternion()), X)!
    expect((twist * 180) / Math.PI).toBeCloseTo(0, 4)
  })

  it('preserves non-dragged swing when snapping world-axis rotation', () => {
    gizmo.setMode('rotate')
    // Swing about Y, then a small X twist — snapping X should keep the Y swing.
    const swing = new Quaternion().setFromAxisAngle(Y, Math.PI / 5)
    const twist = new Quaternion().setFromAxisAngle(X, (2.241 * Math.PI) / 180)
    cube.quaternion.copy(twist).multiply(swing)
    scene.updateMatrixWorld(true)
    drag(ringPoint(), 2, 0, { ctrlKey: true })
    const worldQ = cube.getWorldQuaternion(new Quaternion())
    expect((twistAngleAroundAxis(worldQ, X)! * 180) / Math.PI).toBeCloseTo(0, 4)
    // After removing the (now-zero) X twist, remaining rotation should still be about Y.
    const yTwist = twistAngleAroundAxis(worldQ, Y)!
    expect(Math.abs(yTwist)).toBeGreaterThan(0.3)
  })

  it('snaps local rotation as an angular delta from drag start', () => {
    gizmo.setMode('rotate')
    gizmo.setSpace('local')
    const startDeg = 2.241
    cube.quaternion.setFromAxisAngle(X, (startDeg * Math.PI) / 180)
    scene.updateMatrixWorld(true)
    gizmo.setRotationSnap((15 * Math.PI) / 180)
    drag(ringPoint(), 60, 25)
    const twist = twistAngleAroundAxis(cube.quaternion, X)!
    const deg = (twist * 180) / Math.PI
    // Relative: start + n×15, so residual vs start is a multiple of 15.
    const delta = deg - startDeg
    expect(delta).toBeCloseTo(Math.round(delta / 15) * 15, 4)
  })

  it('keeps screen-space rotation relative in world mode', () => {
    gizmo.setMode('rotate')
    gizmo.setRotationSnap((15 * Math.PI) / 180)
    const ePoint = handlePoint(new Vector3(1, 0, 0), gizmo.getTheme().sizes.screenRingRadius)
    // Start with a small world twist so absolute snap would pull to 0 if misapplied.
    cube.quaternion.setFromAxisAngle(Y, (2.241 * Math.PI) / 180)
    const start = cube.quaternion.clone()
    scene.updateMatrixWorld(true)
    drag(ePoint, 40, 10)
    // Relative snap: without enough drag to reach 15°, orientation stays near start
    // (not snapped to world 0° the way constrained world rings would).
    const angle = start.angleTo(cube.quaternion)
    const deg = (angle * 180) / Math.PI
    expect(deg).toBeCloseTo(Math.round(deg / 15) * 15, 4)
  })

  it('hides the angle sector when the drag ends', () => {
    gizmo.setMode('rotate')
    const pt = ringPoint()
    down(pt)
    move({ x: pt.x + 40, y: pt.y + 15 })
    const sector = gizmo.children.find((c) => c.type === 'Mesh')
    expect(sector?.visible).toBe(true)
    up({ x: pt.x + 40, y: pt.y + 15 })
    expect(sector?.visible).toBe(false)
  })

  it('keeps the degrees label hidden unless showSectorLabel is enabled', () => {
    gizmo.setMode('rotate')
    const pt = ringPoint()
    down(pt)
    move({ x: pt.x + 40, y: pt.y + 15 })
    const sector = gizmo.children.find((c) => c.type === 'Mesh')!
    const label = sector.children[0]!
    expect(gizmo.getTheme().showSectorLabel).toBe(false)
    expect(label.visible).toBe(false)
    up({ x: pt.x + 40, y: pt.y + 15 })

    gizmo.setTheme({ showSectorLabel: true, sizes: { labelSize: 0.2 } })
    expect(gizmo.getTheme().showSectorLabel).toBe(true)
    expect(gizmo.getTheme().sizes.labelSize).toBe(0.2)
    down(pt)
    move({ x: pt.x + 40, y: pt.y + 15 })
    const sectorOn = gizmo.children.find((c) => c.type === 'Mesh')!
    expect(sectorOn.children[0]!.visible).toBe(true)
    up({ x: pt.x + 40, y: pt.y + 15 })
  })

  it('sizes the sector label from labelSize', () => {
    const labelH = 0.2 * 1.15
    gizmo.setTheme({ showSectorLabel: true, sizes: { labelSize: 0.2 } })
    const label = gizmo.children.find((c) => c.type === 'Mesh')!.children[0]!
    expect(label.scale.y).toBeCloseTo(labelH)
  })
})

describe('scale (extrude)', () => {
  function scaleDist(): number {
    return gizmo.getTheme().sizes.scaleHandleDistanceNonUniform
  }

  it('anchors the opposite face when dragging a +X handle', () => {
    gizmo.setMode('scale')
    const anchorBefore = new Vector3(-0.5, 0, 0).applyMatrix4(cube.matrixWorld)
    drag(handlePoint(X, scaleDist()), 60, 0)
    cube.updateWorldMatrix(true, false)
    const anchorAfter = new Vector3(-0.5, 0, 0).applyMatrix4(cube.matrixWorld)
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(anchorAfter.distanceTo(anchorBefore)).toBeLessThan(1e-6)
  })

  it('scales from the center when Alt is held', () => {
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0, { altKey: true })
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(cube.position.length()).toBeCloseTo(0)
  })

  it('keeps the origin fixed when dragging a plane scale handle', () => {
    gizmo.setMode('scale')
    gizmo.updateMatrixWorld(true)
    const scale = gizmo.children.find((c): c is ModeGizmo => c instanceof ModeGizmo && c.mode === 'scale')!
    const picker = scale.getPickers().find((p) => p.userData.handle.axis === '+XY')!
    const pt = toScreen(picker.getWorldPosition(new Vector3()))
    drag(pt, 80, -50)
    // Plane scale is always center-anchored — position must not drift even as X/Y change.
    expect(cube.scale.x !== 1 || cube.scale.y !== 1).toBe(true)
    expect(cube.position.length()).toBeCloseTo(0)
  })

  it('anchors correctly for a group whose children were never rendered', () => {
    const group = new Group()
    const child = makeCube()
    child.position.set(2, 0, 0) // bbox centered at +2 in group space
    group.add(child)
    scene.add(group)
    // deliberately no updateMatrixWorld: child.matrixWorld is stale
    gizmo.attach(group)
    gizmo.setMode('scale')
    gizmo.updateMatrixWorld(true)
    const pt = toScreen(
      group.getWorldPosition(new Vector3()).add(X.clone().multiplyScalar(gizmo.scale.x * scaleDist())),
    )
    // bbox min in group-local space is x = 1.5 (child at +2, half extent 0.5)
    const anchorLocal = new Vector3(1.5, 0, 0)
    const anchorBefore = anchorLocal.clone().applyMatrix4(group.matrixWorld)
    drag(pt, 60, 0)
    group.updateWorldMatrix(true, false)
    const anchorAfter = anchorLocal.clone().applyMatrix4(group.matrixWorld)
    expect(group.scale.x).toBeGreaterThan(1.05)
    expect(anchorAfter.distanceTo(anchorBefore)).toBeLessThan(1e-6)
  })

  it('leaves the position untouched when the anchor is the center', () => {
    gizmo.setScaleAnchor('center')
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0)
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(cube.position.length()).toBeCloseTo(0)
  })

  it('extrudes when Alt is held and the anchor is the center', () => {
    gizmo.setScaleAnchor('center')
    gizmo.setMode('scale')
    const anchorBefore = new Vector3(-0.5, 0, 0).applyMatrix4(cube.matrixWorld)
    drag(handlePoint(X, scaleDist()), 60, 0, { altKey: true })
    cube.updateWorldMatrix(true, false)
    const anchorAfter = new Vector3(-0.5, 0, 0).applyMatrix4(cube.matrixWorld)
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(anchorAfter.distanceTo(anchorBefore)).toBeLessThan(1e-6)
  })

  it('accepts the anchor through the constructor', () => {
    const g = new TransformGizmo(camera, el as unknown as HTMLElement, { scaleAnchor: 'center' })
    expect(g.scaleAnchor).toBe('center')
    g.dispose()
  })

  it('emits scaleAnchor-changed with change', () => {
    const anchors: string[] = []
    let changes = 0
    gizmo.addEventListener('scaleAnchor-changed', (e) => {
      anchors.push(e.value)
    })
    gizmo.addEventListener('change', () => {
      changes++
    })
    gizmo.setScaleAnchor('center')
    expect(gizmo.scaleAnchor).toBe('center')
    expect(anchors).toEqual(['center'])
    expect(changes).toBeGreaterThanOrEqual(1)
    gizmo.scaleAnchor = 'center'
    expect(anchors).toEqual(['center'])
  })

  it('recomputes the scale drag when Alt is toggled without moving', () => {
    gizmo.setMode('scale')
    const pt = handlePoint(X, scaleDist())
    down(pt)
    move({ x: pt.x + 60, y: pt.y })
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(cube.position.length()).not.toBeCloseTo(0)
    key({ altKey: true })
    expect(cube.position.length()).toBeCloseTo(0)
    el.dispatch('keyup', keyEvent({}))
    expect(cube.position.length()).not.toBeCloseTo(0)
    up({ x: pt.x + 60, y: pt.y })
  })

  it('recomputes proportional scale when Shift is pressed mid-drag', () => {
    gizmo.setMode('scale')
    const pt = handlePoint(X, scaleDist())
    down(pt)
    move({ x: pt.x + 60, y: pt.y })
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(cube.scale.y).toBeCloseTo(1)
    key({ shiftKey: true })
    expect(cube.scale.y).toBeCloseTo(cube.scale.x)
    expect(cube.position.length()).toBeCloseTo(0)
    up({ x: pt.x + 60, y: pt.y }, { shiftKey: true })
  })

  it('falls back to center anchoring when the object has no measurable geometry', () => {
    // a splat container: nothing to bound, so there is no opposite face to pin
    const empty = new Group()
    scene.add(empty)
    gizmo.attach(empty)
    gizmo.setMode('scale')
    gizmo.updateMatrixWorld(true)
    const pt = toScreen(
      empty.getWorldPosition(new Vector3()).add(X.clone().multiplyScalar(gizmo.scale.x * scaleDist())),
    )
    drag(pt, 60, 0)
    expect(empty.scale.x).toBeGreaterThan(1.05)
    expect(empty.position.length()).toBeCloseTo(0)
  })

  it('scales every axis by one ratio when Shift is held', () => {
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0, { shiftKey: true })
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(cube.scale.y).toBeCloseTo(cube.scale.x)
    expect(cube.scale.z).toBeCloseTo(cube.scale.x)
  })

  it('keeps the origin fixed when Shift is held', () => {
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0, { shiftKey: true })
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(cube.position.length()).toBeCloseTo(0)
  })

  it('combines Shift and Alt: proportional growth about the origin', () => {
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0, { shiftKey: true, altKey: true })
    expect(cube.scale.x).toBeGreaterThan(1.05)
    expect(cube.scale.z).toBeCloseTo(cube.scale.x)
    expect(cube.position.length()).toBeCloseTo(0)
  })

  it('snaps resulting scale with Ctrl using the temporary theme default', () => {
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0, { ctrlKey: true })
    const snap = gizmo.getTheme().snapping.temporaryScaleSnap
    expect(cube.scale.x % snap).toBeCloseTo(0)
  })

  it('composes Ctrl scale snap with Shift proportional + center anchor', () => {
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0, { ctrlKey: true, shiftKey: true })
    const snap = gizmo.getTheme().snapping.temporaryScaleSnap
    expect(cube.scale.x % snap).toBeCloseTo(0)
    expect(cube.scale.y).toBeCloseTo(cube.scale.x)
    expect(cube.position.length()).toBeCloseTo(0)
  })

  it('composes Ctrl scale snap with Alt center anchor', () => {
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0, { ctrlKey: true, altKey: true })
    const snap = gizmo.getTheme().snapping.temporaryScaleSnap
    expect(cube.scale.x % snap).toBeCloseTo(0)
    expect(cube.position.length()).toBeCloseTo(0)
  })

  it('prefers configured scaleSnap over the temporary Ctrl default', () => {
    gizmo.setMode('scale')
    gizmo.setScaleSnap(0.5)
    drag(handlePoint(X, scaleDist()), 60, 0, { ctrlKey: true })
    expect(cube.scale.x % 0.5).toBeCloseTo(0)
  })

  it('keeps mirrored objects mirrored', () => {
    cube.scale.set(-1, 1, 1)
    scene.updateMatrixWorld(true)
    gizmo.setMode('scale')
    drag(handlePoint(X, scaleDist()), 60, 0)
    expect(cube.scale.x).toBeLessThan(0)
    expect(Math.abs(cube.scale.x)).toBeGreaterThan(0.5) // did not collapse
  })
})

describe('events', () => {
  it('emits TransformControls-compatible events in order', () => {
    const seen: string[] = []
    for (const t of ['mouseDown', 'mouseUp', 'dragging-changed', 'objectChange'] as const) {
      gizmo.addEventListener(t, (e) => {
        seen.push(t === 'dragging-changed' ? `dragging:${(e as { value: boolean }).value}` : t)
      })
    }
    drag(handlePoint(X, arrowTip()), 40, 0)
    expect(seen[0]).toBe('mouseDown')
    expect(seen[1]).toBe('dragging:true')
    expect(seen).toContain('objectChange')
    expect(seen[seen.length - 2]).toBe('mouseUp')
    expect(seen[seen.length - 1]).toBe('dragging:false')
  })
})

describe('drag lifecycle safety', () => {
  function startDrag(): void {
    const pt = handlePoint(X, arrowTip())
    down(pt)
    move({ x: pt.x + 20, y: pt.y })
  }

  it.each([
    ['detach', (g: TransformGizmo) => g.detach()],
    ['enabled=false', (g: TransformGizmo) => void (g.enabled = false)],
    ['setMode', (g: TransformGizmo) => g.setMode('rotate')],
    ['setSpace', (g: TransformGizmo) => g.setSpace('local')],
    ['setScaleAnchor', (g: TransformGizmo) => g.setScaleAnchor('center')],
    ['object=null', (g: TransformGizmo) => void (g.object = null)],
    ['setTheme', (g: TransformGizmo) => g.setTheme({ colors: { x: 0x123456 } })],
    ['dispose', (g: TransformGizmo) => g.dispose()],
  ])('%s during a drag commits it and reports dragging-changed:false', (_name, action) => {
    let lastDragging: boolean | null = null
    gizmo.addEventListener('dragging-changed', (e) => {
      lastDragging = e.value
    })
    startDrag()
    const pos = cube.position.clone()
    const quat = cube.quaternion.clone()
    const scl = cube.scale.clone()
    expect(gizmo.dragging).toBe(true)
    action(gizmo)
    expect(gizmo.dragging).toBe(false)
    expect(lastDragging).toBe(false)
    expect(el.captured.size).toBe(0)
    expect(cube.position.distanceTo(pos)).toBeCloseTo(0)
    expect(cube.quaternion.angleTo(quat)).toBeCloseTo(0)
    expect(cube.scale.distanceTo(scl)).toBeCloseTo(0)
  })

  it('finishDrag() keeps the transform from the last move', () => {
    gizmo.setMode('scale')
    const startPos = cube.position.clone()
    const startQuat = cube.quaternion.clone()
    const startScl = cube.scale.clone()
    const pt = handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform)
    down(pt)
    move({ x: pt.x + 50, y: pt.y })
    const pos = cube.position.clone()
    const quat = cube.quaternion.clone()
    const scl = cube.scale.clone()
    expect(cube.scale.distanceTo(startScl)).not.toBeCloseTo(0)
    expect(cube.position.distanceTo(startPos)).not.toBeCloseTo(0)
    gizmo.finishDrag()
    expect(cube.position.distanceTo(pos)).toBeCloseTo(0)
    expect(cube.quaternion.angleTo(quat)).toBeCloseTo(0)
    expect(cube.scale.distanceTo(scl)).toBeCloseTo(0)
    expect(gizmo.dragging).toBe(false)
    expect(el.captured.size).toBe(0)
    expect(startQuat.angleTo(cube.quaternion)).toBeCloseTo(0)
  })

  it('reset() restores the transform captured at drag start', () => {
    gizmo.setMode('scale')
    const pos = cube.position.clone()
    const quat = cube.quaternion.clone()
    const scl = cube.scale.clone()
    const pt = handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform)
    down(pt)
    move({ x: pt.x + 50, y: pt.y })
    expect(cube.scale.x).not.toBeCloseTo(scl.x)
    gizmo.reset()
    expect(cube.scale.distanceTo(scl)).toBeCloseTo(0)
    expect(cube.position.distanceTo(pos)).toBeCloseTo(0)
    expect(cube.quaternion.angleTo(quat)).toBeCloseTo(0)
    expect(gizmo.dragging).toBe(false)
    expect(el.captured.size).toBe(0)
  })

  it('emits mouseUp while dragging, then dragging-changed:false', () => {
    const seen: string[] = []
    gizmo.addEventListener('mouseUp', () => {
      seen.push(`mouseUp:dragging=${gizmo.dragging}`)
    })
    gizmo.addEventListener('dragging-changed', (e) => {
      if (!e.value) seen.push(`dragging-changed:dragging=${gizmo.dragging}`)
    })
    startDrag()
    gizmo.finishDrag()
    expect(seen).toEqual(['mouseUp:dragging=true', 'dragging-changed:dragging=false'])
  })

  it('reentrant and repeated finishDrag() emit one drag-end sequence', () => {
    const seen: string[] = []
    gizmo.addEventListener('mouseUp', () => {
      seen.push('mouseUp')
      gizmo.finishDrag()
      gizmo.reset()
    })
    gizmo.addEventListener('dragging-changed', (e) => {
      if (!e.value) {
        seen.push('dragging:false')
        gizmo.finishDrag()
      }
    })
    startDrag()
    gizmo.finishDrag()
    gizmo.finishDrag()
    expect(seen.filter((s) => s === 'mouseUp')).toEqual(['mouseUp'])
    expect(seen.filter((s) => s === 'dragging:false')).toEqual(['dragging:false'])
    expect(gizmo.dragging).toBe(false)
  })

  it('finishDrag() is a no-op when idle', () => {
    const seen: string[] = []
    gizmo.addEventListener('mouseUp', () => seen.push('mouseUp'))
    gizmo.addEventListener('dragging-changed', () => seen.push('dragging'))
    gizmo.finishDrag()
    expect(seen).toEqual([])
    expect(gizmo.dragging).toBe(false)
  })

  it('pointerup commits the drag and releases capture', () => {
    const start = cube.position.clone()
    const pt = handlePoint(X, arrowTip())
    down(pt)
    expect(el.captured.has(1)).toBe(true)
    move({ x: pt.x + 40, y: pt.y })
    const dragged = cube.position.clone()
    expect(dragged.distanceTo(start)).not.toBeCloseTo(0)
    up({ x: pt.x + 40, y: pt.y })
    expect(gizmo.dragging).toBe(false)
    expect(el.captured.has(1)).toBe(false)
    expect(cube.position.distanceTo(dragged)).toBeCloseTo(0)
  })

  it('pointercancel restores the drag-start transform and releases capture', () => {
    const pos = cube.position.clone()
    const quat = cube.quaternion.clone()
    const scl = cube.scale.clone()
    const pt = handlePoint(X, arrowTip())
    down(pt)
    move({ x: pt.x + 40, y: pt.y })
    expect(cube.position.distanceTo(pos)).not.toBeCloseTo(0)
    cancel({ x: pt.x + 40, y: pt.y })
    expect(gizmo.dragging).toBe(false)
    expect(el.captured.has(1)).toBe(false)
    expect(cube.position.distanceTo(pos)).toBeCloseTo(0)
    expect(cube.quaternion.angleTo(quat)).toBeCloseTo(0)
    expect(cube.scale.distanceTo(scl)).toBeCloseTo(0)
  })

  it('lostpointercapture for the drag pointer commits the current transform', () => {
    const pt = handlePoint(X, arrowTip())
    down(pt)
    move({ x: pt.x + 40, y: pt.y })
    const dragged = cube.position.clone()
    el.dispatch('lostpointercapture', pointerEvent(pt.x + 40, pt.y, { pointerId: 1 }))
    expect(gizmo.dragging).toBe(false)
    expect(el.captured.has(1)).toBe(false)
    expect(cube.position.distanceTo(dragged)).toBeCloseTo(0)
  })

  it('lostpointercapture for an unrelated pointer is ignored', () => {
    const pt = handlePoint(X, arrowTip())
    down(pt, { pointerId: 1 })
    move({ x: pt.x + 30, y: pt.y }, { pointerId: 1 })
    el.dispatch('lostpointercapture', pointerEvent(10, 400, { pointerId: 2 }))
    expect(gizmo.dragging).toBe(true)
    expect(el.captured.has(1)).toBe(true)
    up({ x: pt.x + 30, y: pt.y }, { pointerId: 1 })
    expect(gizmo.dragging).toBe(false)
  })

  it('ignores events from a second pointer during a drag', () => {
    const pt = handlePoint(X, arrowTip())
    down(pt, { pointerId: 1 })
    move({ x: pt.x + 30, y: pt.y }, { pointerId: 1 })
    const afterFirst = cube.position.x

    // a second finger moves and lifts elsewhere
    move({ x: 10, y: 400 }, { pointerId: 2, isPrimary: false })
    expect(cube.position.x).toBeCloseTo(afterFirst)
    up({ x: 10, y: 400 }, { pointerId: 2 })
    expect(gizmo.dragging).toBe(true)

    up({ x: pt.x + 30, y: pt.y }, { pointerId: 1 })
    expect(gizmo.dragging).toBe(false)
  })

  it('releases pointer capture on pointerup', () => {
    const pt = handlePoint(X, arrowTip())
    down(pt)
    expect(el.captured.has(1)).toBe(true)
    up(pt)
    expect(el.captured.has(1)).toBe(false)
  })
})

describe('dispose', () => {
  it('removes every DOM listener it added', () => {
    const before = el.listenerCount()
    expect(before).toBeGreaterThan(0)
    gizmo.dispose()
    expect(el.listenerCount()).toBe(0)
  })

  it('does not react to pointer events after dispose', () => {
    gizmo.dispose()
    const before = cube.position.clone()
    drag(handlePoint(X, arrowTip()), 60, 0)
    expect(cube.position.equals(before)).toBe(true)
  })
})

describe('theming', () => {
  it('merges partial themes and keeps the rest of the defaults', () => {
    gizmo.setTheme({ colors: { x: 0x112233 }, sizes: { ringTube: 0.05 } })
    const t = gizmo.getTheme()
    expect(t.colors.x).toBe(0x112233)
    expect(t.sizes.ringTube).toBeCloseTo(0.05)
    expect(t.colors.y).toBe(0x30a46c) // untouched default
    expect(t.opacity.idle).toBeCloseTo(1)
  })

  it('still picks handles after a theme rebuild', () => {
    gizmo.setTheme({ sizes: { arrowLength: 0.5, scaleHandleDistanceNonUniform: 0.5 } })
    // dedicated translate mode tips sit at scaleHandleDistanceNonUniform
    move(handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform))
    expect(gizmo.axis).toBe('X' as AxisId)
  })

  it('returns a snapshot that does not mutate the live theme', () => {
    const snap = gizmo.getTheme()
    const originalX = snap.colors.x
    const originalLen = snap.sizes.arrowLength
    snap.colors.x = 0x000001
    snap.sizes.arrowLength = 99
    expect(gizmo.getTheme().colors.x).toBe(originalX)
    expect(gizmo.getTheme().sizes.arrowLength).toBeCloseTo(originalLen)
  })
})

describe('screen-constant sizing', () => {
  it('scales the gizmo with camera distance', () => {
    camera.position.set(0, 0, 6)
    camera.updateMatrixWorld(true)
    gizmo.updateMatrixWorld(true)
    const near = gizmo.scale.x
    camera.position.set(0, 0, 12)
    camera.updateMatrixWorld(true)
    gizmo.updateMatrixWorld(true)
    expect(gizmo.scale.x).toBeCloseTo(near * 2, 5)
  })

  it('accounts for a parented (rigged) camera', () => {
    const rig = new Group()
    scene.add(rig)
    rig.add(camera)
    camera.position.set(0, 0, 0)
    rig.position.set(0, 0, 6)
    scene.updateMatrixWorld(true)
    gizmo.updateMatrixWorld(true)
    const rigged = gizmo.scale.x

    // the same world distance without a rig must give the same size
    rig.remove(camera)
    scene.add(camera)
    camera.position.set(0, 0, 6)
    scene.updateMatrixWorld(true)
    gizmo.updateMatrixWorld(true)
    expect(gizmo.scale.x).toBeCloseTo(rigged, 6)
  })
})

describe('orthographic picking', () => {
  function makeOrtho(): OrthographicCamera {
    const aspect = WIDTH / HEIGHT
    const halfH = 4
    const cam = new OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, 0.1, 100)
    cam.position.set(4, 3.5, 6)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld(true)
    return cam
  }

  it('picks and drags an axis through an orthographic camera', () => {
    const ortho = makeOrtho()
    gizmo.camera = ortho
    gizmo.updateMatrixWorld(true)
    const tip = handlePoint(X, arrowTip(), ortho)
    move(tip)
    expect(gizmo.axis).toBe('X')
    drag(tip, 80, 0)
    expect(cube.position.x).toBeGreaterThan(0.1)
    expect(cube.position.y).toBeCloseTo(0)
  })

  it('does not pick using the previous camera after camera is swapped', () => {
    const tipPerspective = handlePoint(X, arrowTip())
    move(tipPerspective)
    expect(gizmo.axis).toBe('X')

    const ortho = makeOrtho()
    ortho.position.set(-4, 3.5, 6)
    ortho.lookAt(0, 0, 0)
    ortho.updateMatrixWorld(true)
    gizmo.camera = ortho
    gizmo.updateMatrixWorld(true)
    move(tipPerspective)
    expect(gizmo.axis).not.toBe('X')
  })
})

describe('combined mode', () => {
  function modeChildren(): ModeGizmo[] {
    return gizmo.children.filter((c): c is ModeGizmo => c instanceof ModeGizmo)
  }

  /** screen point of a specific mode's picker for the given axis */
  function pickerScreen(mode: string, axis: AxisId): { x: number; y: number } {
    gizmo.updateMatrixWorld(true)
    const group = modeChildren().find((c) => c.mode === mode)!
    const picker = group.getPickers().find((p) => p.userData.handle.axis === axis)
    expect(picker).toBeTruthy()
    return toScreen(picker!.getWorldPosition(new Vector3()))
  }

  it('shows translate, rotate, and scale gizmos together', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const modes = modeChildren()
      .map((c) => c.mode)
      .sort()
    expect(modes).toEqual(['rotate', 'scale', 'translate'])
    expect(modeChildren().every((c) => c.visible)).toBe(true)
  })

  it('hides the other gizmos again when leaving combined', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    gizmo.setMode('translate')
    gizmo.updateMatrixWorld(true)
    for (const c of modeChildren()) {
      expect(c.visible).toBe(c.mode === 'translate')
    }
  })

  it('translates when a translate handle is dragged', () => {
    gizmo.setMode('combined')
    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    // mid-shaft: away from the scale end-cube
    drag(handlePoint(X, arrowAlong(0.65)), 60, 0)
    expect(op).toBe('translate')
    expect(cube.position.x).toBeGreaterThan(0.1)
    expect(cube.scale.x).toBeCloseTo(1)
  })

  it('scales when a scale handle is dragged', () => {
    gizmo.setMode('combined')
    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    drag(pickerScreen('scale', '+X'), 60, 0)
    expect(op).toBe('scale')
    expect(cube.scale.x).toBeGreaterThan(1.05)
  })

  it('rotates when a rotate handle is dragged', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    // point on the Y ring (XZ plane), off the cardinal axis handles
    const r = gizmo.getTheme().sizes.ringRadius * gizmo.scale.x
    const pt = toScreen(cube.getWorldPosition(new Vector3()).add(new Vector3(r * Math.cos(0.6), 0, r * Math.sin(0.6))))
    drag(pt, 40, 30)
    expect(op).toBe('rotate')
    const angle = 2 * Math.acos(Math.min(1, Math.abs(cube.quaternion.w)))
    expect(angle).toBeGreaterThan(0)
  })

  it('reports the handle operation on mouseDown/mouseUp, not combined', () => {
    gizmo.setMode('combined')
    const modes: string[] = []
    gizmo.addEventListener('mouseDown', (e) => modes.push(`down:${e.mode}`))
    gizmo.addEventListener('mouseUp', (e) => modes.push(`up:${e.mode}`))
    drag(handlePoint(X, arrowAlong(0.65)), 40, 0)
    expect(modes).toEqual(['down:translate', 'up:translate'])
  })

  it('hides the other tools while a handle is active', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const translate = modeChildren().find((c) => c.mode === 'translate')!
    const rotate = modeChildren().find((c) => c.mode === 'rotate')!
    const scale = modeChildren().find((c) => c.mode === 'scale')!

    move(pickerScreen('scale', '+X'))
    gizmo.updateMatrixWorld(true)
    expect(translate.visual.visible).toBe(false)
    expect(rotate.visual.visible).toBe(false)
    expect(scale.visual.visible).toBe(true)

    move(handlePoint(X, arrowAlong(0.65)))
    gizmo.updateMatrixWorld(true)
    expect(translate.visual.visible).toBe(true)
    expect(rotate.visual.visible).toBe(false)
    expect(scale.visual.visible).toBe(false)

    move({ x: 10, y: 10 })
    gizmo.updateMatrixWorld(true)
    expect(translate.visual.visible).toBe(true)
    expect(rotate.visual.visible).toBe(true)
    expect(scale.visual.visible).toBe(true)

    // rotate keeps the other tools visible
    const r = gizmo.getTheme().sizes.ringRadius * gizmo.scale.x
    move(toScreen(cube.getWorldPosition(new Vector3()).add(new Vector3(r * Math.cos(1.3), 0, r * Math.sin(1.3)))))
    gizmo.updateMatrixWorld(true)
    expect(translate.visual.visible).toBe(true)
    expect(rotate.visual.visible).toBe(true)
    expect(scale.visual.visible).toBe(true)
  })

  it('dims translate and scale handles while rotating', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const theme = gizmo.getTheme()
    const translate = modeChildren().find((c) => c.mode === 'translate')!
    const rotate = modeChildren().find((c) => c.mode === 'rotate')!
    const scale = modeChildren().find((c) => c.mode === 'scale')!

    const r = theme.sizes.ringRadius * gizmo.scale.x
    const from = toScreen(
      cube.getWorldPosition(new Vector3()).add(new Vector3(r * Math.cos(0.6), 0, r * Math.sin(0.6))),
    )
    down(from)
    move({ x: from.x + 20, y: from.y + 15 })
    gizmo.updateMatrixWorld(true)

    expect(gizmo.dragging).toBe(true)
    const dim = theme.opacity.inactiveWhileDragging
    const tHandle = translate.getVisualHandles().find((h) => h.userData.handle.axis === 'X' && h.visible)!
    const sHandle = scale.getVisualHandles().find((h) => h.userData.handle.axis === '+X' && h.visible)!
    expect(tHandle.material.opacity).toBeCloseTo(dim)
    expect(sHandle.material.opacity).toBeCloseTo(dim)

    const activeRing = rotate.getVisualHandles().find((h) => h.userData.handle.axis === 'Y' && h.visible)!
    const idleRing = rotate.getVisualHandles().find((h) => h.userData.handle.axis === 'X' && h.visible)!
    expect(activeRing.material.opacity).toBeCloseTo(theme.opacity.active)
    expect(idleRing.material.opacity).toBeCloseTo(dim)

    up({ x: from.x + 20, y: from.y + 15 })
  })

  it('hides plane quads, scale shafts, and the outer screen rotate ring', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const translate = modeChildren().find((c) => c.mode === 'translate')!
    const scale = modeChildren().find((c) => c.mode === 'scale')!
    const rotate = modeChildren().find((c) => c.mode === 'rotate')!
    expect(translate.getPickers().some((p) => p.userData.handle.axis === 'XY')).toBe(false)
    expect(scale.getPickers().some((p) => p.userData.handle.axis === '+XY')).toBe(false)
    expect(rotate.getPickers().some((p) => p.userData.handle.axis === 'E')).toBe(false)

    const show = ALL_SHOW
    const tPlane = translate.getVisualHandles().find((h) => h.userData.handle.axis === 'XY')!
    const sPlane = scale.getVisualHandles().find((h) => h.userData.handle.axis === '+XY')!
    const eVisual = rotate.getVisualHandles().find((h) => h.userData.handle.axis === 'E')!
    translate.updateVisuals(null, null, gizmo.getTheme(), show)
    scale.updateVisuals(null, null, gizmo.getTheme(), show)
    rotate.updateVisuals(null, null, gizmo.getTheme(), show)
    expect(tPlane.visible).toBe(false)
    expect(sPlane.visible).toBe(false)
    expect(eVisual.visible).toBe(false)

    const scaleShafts = scale
      .getVisualHandles()
      .filter((h) => h.userData.handle.axis === '+X' && h.geometry.type === 'CylinderGeometry')
    expect(scaleShafts.length).toBeGreaterThan(0)
    expect(scaleShafts.every((h) => !h.visible)).toBe(true)
    const scaleCube = scale
      .getVisualHandles()
      .find((h) => h.userData.handle.axis === '+X' && h.geometry.type === 'BoxGeometry')!
    expect(scaleCube.visible).toBe(true)
  })

  it('shows a dashed scale axis guide while a scale cube is active', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const scale = modeChildren().find((c) => c.mode === 'scale')!
    const show = ALL_SHOW
    const theme = gizmo.getTheme()
    const lines = scale.visual.children.filter((o): o is Line => o.type === 'Line')
    expect(lines.length).toBe(6)

    scale.updateVisuals(null, null, theme, show)
    expect(lines.every((l) => !l.visible)).toBe(true)

    // no modifier: only the half toward +X
    scale.updateVisuals('+X', null, theme, show, { alt: false, shift: false })
    const visible = lines.filter((l) => l.visible)
    expect(visible.length).toBe(1)
    const pos = visible[0]!.geometry.getAttribute('position').array
    expect(Number(pos[3])).toBeGreaterThan(0) // end.x > 0
    expect(Number(pos[4])).toBeCloseTo(0)
    expect(Number(pos[5])).toBeCloseTo(0)

    // alt: full X axis (both halves)
    scale.updateVisuals('+X', null, theme, show, { alt: true, shift: false })
    expect(lines.filter((l) => l.visible).length).toBe(2)

    // shift: all axes
    scale.updateVisuals('+X', null, theme, show, { alt: false, shift: true })
    expect(lines.filter((l) => l.visible).length).toBe(6)

    scale.updateVisuals(null, '+X', theme, show, { alt: false, shift: false })
    const dragging = lines.filter((l) => l.visible)
    expect(dragging.length).toBe(1)
    expect((dragging[0]!.material as LineDashedMaterial).color.getHex()).toBe(theme.colors.active)
  })

  it('uses the same dashed scale guides in dedicated scale mode', () => {
    gizmo.setMode('scale')
    gizmo.updateMatrixWorld(true)
    const scale = modeChildren().find((c) => c.mode === 'scale')!
    const show = ALL_SHOW
    const theme = gizmo.getTheme()
    const lines = scale.visual.children.filter((o): o is Line => o.type === 'Line')
    const shafts = scale.getVisualHandles().filter((h) => h.geometry.type === 'CylinderGeometry')

    scale.updateVisuals(null, null, theme, show)
    expect(shafts.some((h) => h.visible)).toBe(true)
    expect(lines.every((l) => !l.visible)).toBe(true)

    scale.updateVisuals('+Y', null, theme, show, { alt: false, shift: false })
    expect(shafts.every((h) => !h.visible)).toBe(true)
    expect(lines.filter((l) => l.visible).length).toBe(1)
  })

  it('shows Shift on idle axes and Alt on the opposite half', () => {
    gizmo.setMode('scale')
    gizmo.setTheme({ showScaleModifiers: true })
    gizmo.updateMatrixWorld(true)
    const scale = modeChildren().find((c) => c.mode === 'scale')!
    const theme = gizmo.getTheme()
    const show = ALL_SHOW
    const sprites = scale.visual.children.filter((o) => o.type === 'Sprite')

    scale.updateVisuals(null, null, theme, show)
    expect(sprites.filter((s) => s.visible).length).toBe(0)

    // +X: Shift on Y and Z, Alt on -X
    scale.updateVisuals('+X', null, theme, show, { alt: false, shift: false })
    const visible = sprites.filter((s) => s.visible)
    expect(visible.length).toBe(3)
    const positions = visible.map((s) => s.position.clone())
    const near = theme.sizes.scaleHandleDistanceNonUniform * 0.5
    expect(positions.some((p) => p.y > near && Math.abs(p.x) < 0.1 && Math.abs(p.z) < 0.1)).toBe(true)
    expect(positions.some((p) => p.z > near && Math.abs(p.x) < 0.1 && Math.abs(p.y) < 0.1)).toBe(true)
    expect(positions.some((p) => p.x < -near && Math.abs(p.y) < 0.1 && Math.abs(p.z) < 0.1)).toBe(true)

    // +XY: Shift on Z, Alt on -X and -Y
    scale.updateVisuals('+XY', null, theme, show, { alt: false, shift: false })
    expect(sprites.filter((s) => s.visible).length).toBe(3)

    scale.updateVisuals('XYZ', null, theme, show, { alt: false, shift: false })
    expect(sprites.filter((s) => s.visible).length).toBe(0)

    gizmo.setTheme({ showScaleModifiers: false })
    const scaleOff = modeChildren().find((c) => c.mode === 'scale')!
    scaleOff.updateVisuals('+X', null, gizmo.getTheme(), show, { alt: false, shift: false })
    const spritesOff = scaleOff.visual.children.filter((o) => o.type === 'Sprite')
    expect(spritesOff.filter((s) => s.visible).length).toBe(0)
  })

  it('shows an origin trail while translating or extrude-scaling', () => {
    const origin = gizmo.children.find((c) => {
      if ('mode' in c) return false
      const lines = c.children.filter((ch) => ch.type === 'Line')
      const meshes = c.children.filter((ch) => ch.type === 'Mesh')
      return lines.length >= 1 && meshes.length === 1
    })
    expect(origin).toBeTruthy()
    expect(origin!.visible).toBe(false)

    gizmo.setMode('translate')
    const pt = handlePoint(X, arrowTip())
    down(pt)
    move({ x: pt.x + 40, y: pt.y })
    gizmo.updateMatrixWorld(true)
    expect(origin!.visible).toBe(true)
    up({ x: pt.x + 40, y: pt.y })
    gizmo.updateMatrixWorld(true)
    expect(origin!.visible).toBe(false)

    // center-anchored scale: ghost circle still shows when origins coincide
    cube.position.set(0, 0, 0)
    gizmo.setMode('scale')
    const spt = handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform)
    down(spt, { altKey: true })
    move({ x: spt.x + 40, y: spt.y }, { altKey: true })
    gizmo.updateMatrixWorld(true)
    expect(origin!.visible).toBe(true)
    up({ x: spt.x + 40, y: spt.y }, { altKey: true })
  })

  it('keeps translate arrows inside the rotate ring; scale cubes outside', () => {
    const { arrowLength, ringRadius, scaleHandleDistance, scaleHandleDistanceNonUniform, gripSize } =
      gizmo.getTheme().sizes
    expect(arrowLength).toBeLessThan(ringRadius)
    expect(scaleHandleDistanceNonUniform).toBeGreaterThan(arrowLength)
    expect(scaleHandleDistanceNonUniform).toBeLessThan(ringRadius)
    expect(scaleHandleDistance - gripSize / 2).toBeGreaterThan(ringRadius)
  })

  it('expands translate arrows to the dedicated scale radius only in translate mode', () => {
    const translate = modeChildren().find(
      (c) => c.mode === 'translate',
    ) as import('../src/gizmos/TranslateGizmo').TranslateGizmo
    const { arrowLength, scaleHandleDistanceNonUniform, arrowHeadLength } = gizmo.getTheme().sizes

    gizmo.setMode('translate')
    gizmo.updateMatrixWorld(true)
    expect(translate.expanded).toBe(true)
    const soloHead = translate
      .getVisualHandles()
      .find((h) => h.userData.handle.axis === 'X' && h.geometry.type === 'ConeGeometry')!
    expect(soloHead.position.length()).toBeCloseTo(scaleHandleDistanceNonUniform - arrowHeadLength / 2)

    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    expect(translate.expanded).toBe(false)
    expect(soloHead.position.length()).toBeCloseTo(arrowLength - arrowHeadLength / 2)
  })

  it('prefers translate over rotate when hovering an arrow near a ring', () => {
    gizmo.setMode('combined')
    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    // mid-shaft: also near the Y ring's picker, which used to win on distance
    drag(handlePoint(X, arrowAlong(0.75)), 40, 0)
    expect(op).toBe('translate')
  })

  it('keeps rotate sticky while the ring is still under the pointer', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const r = gizmo.getTheme().sizes.ringRadius * gizmo.scale.x
    // start on the ring away from axes, then drift toward +X where translate
    // would normally steal the hit
    const onRing = toScreen(
      cube.getWorldPosition(new Vector3()).add(new Vector3(r * Math.cos(1.3), 0, r * Math.sin(1.3))),
    )
    move(onRing)

    const towardAxis = toScreen(
      cube.getWorldPosition(new Vector3()).add(new Vector3(r * Math.cos(0.35), 0, r * Math.sin(0.35))),
    )
    move(towardAxis)

    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    down(towardAxis)
    expect(op).toBe('rotate')
    up(towardAxis)
  })

  it('overrides sticky rotate when the scale cube core is under the pointer', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const r = gizmo.getTheme().sizes.ringRadius * gizmo.scale.x
    const onRing = toScreen(
      cube.getWorldPosition(new Vector3()).add(new Vector3(r * Math.cos(1.3), 0, r * Math.sin(1.3))),
    )
    move(onRing)

    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    const cubePt = pickerScreen('scale', '+X')
    move(cubePt)
    down(cubePt)
    expect(op).toBe('scale')
    up(cubePt)
  })

  it('overrides sticky rotate when the translate arrow core is under the pointer', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const r = gizmo.getTheme().sizes.ringRadius * gizmo.scale.x
    const onRing = toScreen(
      cube.getWorldPosition(new Vector3()).add(new Vector3(r * Math.cos(1.3), 0, r * Math.sin(1.3))),
    )
    move(onRing)

    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    // on the arrow silhouette (core radius = arrowHeadRadius)
    const arrowPt = handlePoint(X, arrowAlong(0.85))
    move(arrowPt)
    down(arrowPt)
    expect(op).toBe('translate')
    up(arrowPt)
  })

  it('prefers scale over rotate when both pickers hit', () => {
    gizmo.setMode('combined')
    let op: string | null = null
    gizmo.addEventListener('mouseDown', (e) => {
      op = e.mode
    })
    drag(pickerScreen('scale', '+X'), 40, 0)
    expect(op).toBe('scale')
  })
})

describe('TransformControls API parity', () => {
  it('exposes getMode and getHelper', () => {
    expect(gizmo.getMode()).toBe('translate')
    gizmo.setMode('rotate')
    expect(gizmo.getMode()).toBe('rotate')
    expect(gizmo.getHelper()).toBe(gizmo)
  })

  it('setColors updates theme axis and active colors', () => {
    gizmo.setColors(0x111111, 0x222222, 0x333333, 0xabcdef)
    const t = gizmo.getTheme()
    expect(t.colors.x).toBe(0x111111)
    expect(t.colors.y).toBe(0x222222)
    expect(t.colors.z).toBe(0x333333)
    expect(t.colors.active).toBe(0xabcdef)
    expect(t.colors.hover).toBe(0xabcdef)
  })

  it('emits size-changed and showX-changed with change', () => {
    const sizes: number[] = []
    const shows: boolean[] = []
    let changes = 0
    gizmo.addEventListener('size-changed', (e) => {
      sizes.push(e.value)
    })
    gizmo.addEventListener('showX-changed', (e) => {
      shows.push(e.value)
    })
    gizmo.addEventListener('change', () => {
      changes++
    })
    gizmo.size = 1.5
    gizmo.showX = false
    expect(sizes).toEqual([1.5])
    expect(shows).toEqual([false])
    expect(changes).toBeGreaterThanOrEqual(2)
  })

  function planePoint(dir: Vector3): { x: number; y: number } {
    const planeDist = gizmo.getTheme().sizes.planeOffset
    return toScreen(cube.getWorldPosition(new Vector3()).add(dir.clone().multiplyScalar(planeDist * gizmo.scale.x)))
  }

  it('hides plane picking when showXY is false', () => {
    gizmo.setMode('translate')
    gizmo.updateMatrixWorld(true)
    const pt = planePoint(new Vector3(1, 1, 0))
    move(pt)
    expect(gizmo.axis).toBe('XY' as AxisId)
    gizmo.showXY = false
    move(pt)
    expect(gizmo.axis).not.toBe('XY' as AxisId)
  })

  it('hides plane picking when showXZ is false', () => {
    gizmo.setMode('translate')
    gizmo.updateMatrixWorld(true)
    const pt = planePoint(new Vector3(1, 0, 1))
    move(pt)
    expect(gizmo.axis).toBe('XZ' as AxisId)
    gizmo.showXZ = false
    move(pt)
    expect(gizmo.axis).not.toBe('XZ' as AxisId)
  })

  it('hides plane picking when showYZ is false', () => {
    gizmo.setMode('translate')
    gizmo.updateMatrixWorld(true)
    const pt = planePoint(new Vector3(0, 1, 1))
    move(pt)
    expect(gizmo.axis).toBe('YZ' as AxisId)
    gizmo.showYZ = false
    move(pt)
    expect(gizmo.axis).not.toBe('YZ' as AxisId)
  })

  it('hides E ring picking when showE is false', () => {
    gizmo.setMode('rotate')
    gizmo.updateMatrixWorld(true)
    const r = gizmo.getTheme().sizes.screenRingRadius * gizmo.scale.x
    const pt = toScreen(cube.getWorldPosition(new Vector3()).add(new Vector3(r, 0, 0)))
    move(pt)
    expect(gizmo.axis).toBe('E' as AxisId)
    gizmo.showE = false
    move(pt)
    expect(gizmo.axis).not.toBe('E' as AxisId)
  })

  it('picks XYZE trackball near the origin in rotate mode', () => {
    gizmo.setMode('rotate')
    gizmo.updateMatrixWorld(true)
    const pt = toScreen(cube.getWorldPosition(new Vector3()))
    move(pt)
    expect(gizmo.axis).toBe('XYZE' as AxisId)
  })

  it('hides XYZE picking when showXYZE is false', () => {
    gizmo.setMode('rotate')
    gizmo.updateMatrixWorld(true)
    const pt = toScreen(cube.getWorldPosition(new Vector3()))
    move(pt)
    expect(gizmo.axis).toBe('XYZE' as AxisId)
    gizmo.showXYZE = false
    move(pt)
    expect(gizmo.axis).not.toBe('XYZE' as AxisId)
  })

  it('XYZE drag changes object orientation', () => {
    gizmo.setMode('rotate')
    gizmo.updateMatrixWorld(true)
    const before = cube.quaternion.clone()
    const origin = toScreen(cube.getWorldPosition(new Vector3()))
    drag(origin, 80, 40)
    expect(cube.quaternion.equals(before)).toBe(false)
  })

  it('does not expose XYZE in combined mode (center stays translate/scale)', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const pt = toScreen(cube.getWorldPosition(new Vector3()))
    move(pt)
    expect(gizmo.axis).not.toBe('XYZE' as AxisId)
  })

  it('clamps translation with minX / maxX', () => {
    gizmo.setMode('translate')
    gizmo.minX = -0.2
    gizmo.maxX = 0.2
    drag(handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform), 200, 0)
    expect(cube.position.x).toBeLessThanOrEqual(0.2 + 1e-6)
    expect(cube.position.x).toBeGreaterThan(0)
  })

  it('clamps translation with minY / maxZ', () => {
    gizmo.setMode('translate')
    gizmo.minY = 0.3
    gizmo.maxZ = -0.05
    drag(handlePoint(Y, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform), 0, -80)
    expect(cube.position.y).toBeGreaterThanOrEqual(0.3 - 1e-6)
    drag(handlePoint(Z, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform), 80, 0)
    expect(cube.position.z).toBeLessThanOrEqual(-0.05 + 1e-6)
  })

  it('emits camera-changed and picks with the assigned camera', () => {
    const cameras: Camera[] = []
    gizmo.addEventListener('camera-changed', (e) => {
      cameras.push(e.value)
    })
    const next = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 100)
    next.position.copy(camera.position)
    next.quaternion.copy(camera.quaternion)
    next.updateMatrixWorld(true)
    gizmo.camera = next
    expect(cameras).toEqual([next])
    move(handlePoint(X, arrowTip(), next))
    expect(gizmo.axis).toBe('X')
  })

  it('respects raycaster layers when picking', () => {
    move(handlePoint(X, arrowTip()))
    expect(gizmo.axis).toBe('X')
    gizmo.getRaycaster().layers.disable(0)
    move(handlePoint(X, arrowTip()))
    expect(gizmo.axis).toBeNull()
    gizmo.getRaycaster().layers.enable(0)
    move(handlePoint(X, arrowTip()))
    expect(gizmo.axis).toBe('X')
  })

  it('disconnect stops pointer handling; connect restores it', () => {
    gizmo.disconnect()
    const before = cube.position.clone()
    drag(handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform), 60, 0)
    expect(cube.position.equals(before)).toBe(true)
    gizmo.connect()
    drag(handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform), 60, 0)
    expect(cube.position.x).toBeGreaterThan(before.x)
  })

  it('maps pointers through viewport when set', () => {
    gizmo.updateMatrixWorld(true)
    const tip = handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform)
    move(tip)
    expect(gizmo.axis).toBe('X' as AxisId)

    gizmo.viewport = new Vector4(0, 0, WIDTH / 2, HEIGHT)
    move(tip)
    expect(gizmo.axis).not.toBe('X' as AxisId)
  })
})
