import { BoxGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { TransformGizmo } from '../src'
import type { GizmoMode, GizmoSpace } from '../src/types'

type VisualPose = 'idle' | 'sector' | 'extrude'

interface VisualSpec {
  mode: GizmoMode
  space: GizmoSpace
  pose?: VisualPose
}

const WIDTH = 800
const HEIGHT = 600

const scene = new Scene()
scene.background = new Color(0x16161a)

const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 200)
camera.position.set(4, 3.5, 6)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld(true)

const renderer = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(WIDTH, HEIGHT, false)
document.body.appendChild(renderer.domElement)

const cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0x6688cc }))
scene.add(cube)

const gizmo = new TransformGizmo(camera, renderer.domElement)
gizmo.attach(cube)
scene.add(gizmo)

function toScreen(p: Vector3): { x: number; y: number } {
  const v = p.clone().project(camera)
  return { x: ((v.x + 1) / 2) * WIDTH, y: ((1 - v.y) / 2) * HEIGHT }
}

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

function pointer(type: string, x: number, y: number): void {
  renderer.domElement.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      bubbles: true,
    }),
  )
}

function resetObject(): void {
  cube.position.set(0, 0, 0)
  cube.quaternion.identity()
  cube.scale.set(1, 1, 1)
}

function apply(spec: VisualSpec): void {
  const pose = spec.pose ?? 'idle'
  gizmo.finishDrag()
  gizmo.setTheme({})
  resetObject()
  if (spec.space === 'local') cube.rotation.set(0.4, 0.8, 0.25)
  cube.updateMatrixWorld(true)

  gizmo.setSpace(spec.space)
  gizmo.setMode(spec.mode)
  gizmo.updateMatrixWorld(true)

  if (pose === 'sector') {
    const r = gizmo.getTheme().sizes.ringRadius
    const from = handlePoint(new Vector3(0, 1, 0), r)
    pointer('pointerdown', from.x, from.y)
    pointer('pointermove', from.x + 48, from.y + 12)
  } else if (pose === 'extrude') {
    const dist = gizmo.getTheme().sizes.scaleHandleDistanceNonUniform
    const from = handlePoint(new Vector3(1, 0, 0), dist)
    pointer('pointerdown', from.x, from.y)
    pointer('pointermove', from.x + 70, from.y)
  }

  gizmo.updateMatrixWorld(true)
  renderer.render(scene, camera)
}

apply({ mode: 'translate', space: 'world' })

Object.assign(window, {
  __visualReady: true,
  __setVisual: apply,
})
