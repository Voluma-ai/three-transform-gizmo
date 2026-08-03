import { beforeEach, describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three'
import { ModeGizmo } from '../src/gizmos/ModeGizmo'
import { TransformGizmo } from '../src/TransformGizmo'
import type { AxisId } from '../src/types'
import { createFakeElement, HEIGHT, pointerEvent, WIDTH, type FakeElement } from './helpers/fakeDom'

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
function toScreen(p: Vector3): { x: number; y: number } {
  const v = p.clone().project(camera)
  return { x: ((v.x + 1) / 2) * WIDTH, y: ((1 - v.y) / 2) * HEIGHT }
}

/** screen position of a point at `dist` along a local axis, in gizmo units */
function handlePoint(dir: Vector3, dist: number): { x: number; y: number } {
  gizmo.updateMatrixWorld(true)
  const world = cube.getWorldPosition(new Vector3()).add(
    dir
      .clone()
      .normalize()
      .multiplyScalar(gizmo.scale.x * dist),
  )
  return toScreen(world)
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
    drag(handlePoint(X, 0.6), 60, 0)
    expect(cube.position.equals(before)).toBe(true)
    expect(gizmo.dragging).toBe(false)
  })
})

describe('hover picking', () => {
  it('picks the axis under the pointer and fires hoveron/hoveroff', () => {
    const events: string[] = []
    gizmo.addEventListener('hoveron', (e) => events.push(`on:${e.axis}`))
    gizmo.addEventListener('hoveroff', () => events.push('off'))

    move(handlePoint(X, 0.6))
    expect(gizmo.axis).toBe('X')
    move({ x: 5, y: 5 }) // far from the gizmo
    expect(gizmo.axis).toBeNull()
    expect(events).toEqual(['on:X', 'off'])
  })

  it('picks the same axis from the negative side of the arrow', () => {
    move(handlePoint(X.clone().negate(), 0.6))
    expect(gizmo.axis).toBe('X')
  })

  it('drags along the negative arrow the same way as the positive one', () => {
    drag(handlePoint(X.clone().negate(), 0.6), 60, 0)
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
    const pt = toScreen(far.getWorldPosition(new Vector3()).add(X.clone().multiplyScalar(g.scale.x * 0.6)))
    // deliberately do NOT render/update again
    el.dispatch('pointermove', pointerEvent(pt.x, pt.y))
    expect(g.axis).toBe('X')
    g.dispose()
  })

  it('does not pick axes hidden via showX/showY/showZ', () => {
    gizmo.showX = false
    move(handlePoint(X, 0.6))
    expect(gizmo.axis).not.toBe('X')
  })
})

describe('translate', () => {
  it('moves the object along the dragged axis only', () => {
    drag(handlePoint(X, 0.6), 60, 0)
    expect(cube.position.x).toBeGreaterThan(0.1)
    expect(cube.position.y).toBeCloseTo(0)
    expect(cube.position.z).toBeCloseTo(0)
  })

  it('snaps the resulting position to the grid, not the offset', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    gizmo.setTranslationSnap(1)
    drag(handlePoint(X, 0.6), 80, 0)
    // TransformControls semantics: lands ON the grid, not 0.37 + n
    expect(cube.position.x % 1).toBeCloseTo(0)
  })

  it('snaps to integer world coordinates while Shift is held', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    drag(handlePoint(X, 0.6), 80, 0, { shiftKey: true })
    const world = cube.getWorldPosition(new Vector3())
    expect(world.x % 1).toBeCloseTo(0)
  })

  it('snaps the drag offset with Alt, not absolute world position', () => {
    cube.position.set(0.37, 0, 0)
    scene.updateMatrixWorld(true)
    drag(handlePoint(X, 0.6), 80, 0, { altKey: true })
    // relative to start: 0.37 + n*snap — not an absolute world integer
    expect((cube.position.x - 0.37) % 1).toBeCloseTo(0)
    expect(cube.position.x % 1).toBeCloseTo(0.37)
  })

  it('respects a translated parent when snapping in world space', () => {
    const parent = new Group()
    parent.position.set(0.5, 0, 0)
    scene.add(parent)
    scene.remove(cube)
    parent.add(cube)
    scene.updateMatrixWorld(true)
    gizmo.setTranslationSnap(1)
    drag(handlePoint(X, 0.6), 80, 0)
    const world = cube.getWorldPosition(new Vector3())
    expect(world.x % 1).toBeCloseTo(0)
  })
})

describe('rotate', () => {
  function ringPoint(): { x: number; y: number } {
    return handlePoint(Y, gizmo.getTheme().sizes.ringRadius)
  }

  it('rotates the object and snaps with Shift', () => {
    gizmo.setMode('rotate')
    drag(ringPoint(), 60, 25, { shiftKey: true })
    const angle = 2 * Math.acos(Math.min(1, Math.abs(cube.quaternion.w)))
    const deg = (angle * 180) / Math.PI
    expect(deg).toBeGreaterThan(0)
    expect(deg % 15).toBeCloseTo(0, 4)
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

    gizmo.setTheme({ showSectorLabel: true, sizes: { sectorLabelSize: 0.2 } })
    expect(gizmo.getTheme().showSectorLabel).toBe(true)
    expect(gizmo.getTheme().sizes.sectorLabelSize).toBe(0.2)
    down(pt)
    move({ x: pt.x + 40, y: pt.y + 15 })
    const sectorOn = gizmo.children.find((c) => c.type === 'Mesh')!
    expect(sectorOn.children[0]!.visible).toBe(true)
    up({ x: pt.x + 40, y: pt.y + 15 })
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
    drag(handlePoint(X, 0.6), 40, 0)
    expect(seen[0]).toBe('mouseDown')
    expect(seen[1]).toBe('dragging:true')
    expect(seen).toContain('objectChange')
    expect(seen[seen.length - 2]).toBe('mouseUp')
    expect(seen[seen.length - 1]).toBe('dragging:false')
  })
})

describe('drag lifecycle safety', () => {
  function startDrag(): void {
    const pt = handlePoint(X, 0.6)
    down(pt)
    move({ x: pt.x + 20, y: pt.y })
  }

  it.each([
    ['detach', (g: TransformGizmo) => g.detach()],
    ['enabled=false', (g: TransformGizmo) => void (g.enabled = false)],
    ['setMode', (g: TransformGizmo) => g.setMode('rotate')],
    ['setSpace', (g: TransformGizmo) => g.setSpace('local')],
    ['setTheme', (g: TransformGizmo) => g.setTheme({ colors: { x: 0x123456 } })],
    ['dispose', (g: TransformGizmo) => g.dispose()],
  ])('%s during a drag ends it and reports dragging-changed:false', (_name, action) => {
    let lastDragging: boolean | null = null
    gizmo.addEventListener('dragging-changed', (e) => {
      lastDragging = e.value
    })
    startDrag()
    expect(gizmo.dragging).toBe(true)
    action(gizmo)
    expect(gizmo.dragging).toBe(false)
    expect(lastDragging).toBe(false)
  })

  it('reset() restores the transform captured at drag start', () => {
    gizmo.setMode('scale')
    const pos = cube.position.clone()
    const scl = cube.scale.clone()
    const pt = handlePoint(X, gizmo.getTheme().sizes.scaleHandleDistanceNonUniform)
    down(pt)
    move({ x: pt.x + 50, y: pt.y })
    expect(cube.scale.x).not.toBeCloseTo(scl.x)
    gizmo.reset()
    expect(cube.scale.distanceTo(scl)).toBeCloseTo(0)
    expect(cube.position.distanceTo(pos)).toBeCloseTo(0)
    expect(gizmo.dragging).toBe(false)
    expect(el.captured.size).toBe(0)
  })

  it('ignores events from a second pointer during a drag', () => {
    const pt = handlePoint(X, 0.6)
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
    const pt = handlePoint(X, 0.6)
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
    drag(handlePoint(X, 0.6), 60, 0)
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
    gizmo.setTheme({ sizes: { arrowLength: 1.2 } })
    move(handlePoint(X, 0.6))
    expect(gizmo.axis).toBe('X' as AxisId)
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
    drag(handlePoint(X, 0.35), 60, 0)
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
    drag(handlePoint(X, 0.35), 40, 0)
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

    move(handlePoint(X, 0.35))
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

  it('hides plane quads, scale shafts, and the outer screen rotate ring', () => {
    gizmo.setMode('combined')
    gizmo.updateMatrixWorld(true)
    const translate = modeChildren().find((c) => c.mode === 'translate')!
    const scale = modeChildren().find((c) => c.mode === 'scale')!
    const rotate = modeChildren().find((c) => c.mode === 'rotate')!
    expect(translate.getPickers().some((p) => p.userData.handle.axis === 'XY')).toBe(false)
    expect(scale.getPickers().some((p) => p.userData.handle.axis === '+XY')).toBe(false)
    expect(rotate.getPickers().some((p) => p.userData.handle.axis === 'E')).toBe(false)

    const show = { x: true, y: true, z: true }
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
    const show = { x: true, y: true, z: true }
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
    const show = { x: true, y: true, z: true }
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
    const show = { x: true, y: true, z: true }
    const sprites = scale.visual.children.filter((o) => o.type === 'Sprite')

    scale.updateVisuals(null, null, theme, show)
    expect(sprites.filter((s) => s.visible).length).toBe(0)

    // +X: Shift on Y and Z, Alt on -X
    scale.updateVisuals('+X', null, theme, show, { alt: false, shift: false })
    const visible = sprites.filter((s) => s.visible)
    expect(visible.length).toBe(3)
    const positions = visible.map((s) => s.position.clone())
    expect(positions.some((p) => p.y > 0.3 && Math.abs(p.x) < 0.1 && Math.abs(p.z) < 0.1)).toBe(true)
    expect(positions.some((p) => p.z > 0.3 && Math.abs(p.x) < 0.1 && Math.abs(p.y) < 0.1)).toBe(true)
    expect(positions.some((p) => p.x < -0.3 && Math.abs(p.y) < 0.1 && Math.abs(p.z) < 0.1)).toBe(true)

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
    const pt = handlePoint(X, 0.6)
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
    const { arrowLength, ringRadius, scaleHandleDistance, scaleHandleDistanceNonUniform, scaleCubeSize } =
      gizmo.getTheme().sizes
    expect(arrowLength).toBeLessThan(ringRadius)
    expect(scaleHandleDistanceNonUniform).toBeGreaterThan(arrowLength)
    expect(scaleHandleDistanceNonUniform).toBeLessThan(ringRadius)
    expect(scaleHandleDistance - scaleCubeSize / 2).toBeGreaterThan(ringRadius)
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
    drag(handlePoint(X, 0.4), 40, 0)
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
    const arrowPt = handlePoint(X, 0.45)
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
