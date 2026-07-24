import { CylinderGeometry, Euler, Vector3 } from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId } from '../types'
import { geo, makeHandle } from './HandleFactory'
import { ModeGizmo } from './ModeGizmo'

interface AxisDef {
  letter: 'x' | 'y' | 'z'
  rot: Euler
  dir: Vector3
}

const AXES: AxisDef[] = [
  { letter: 'x', rot: new Euler(0, 0, -Math.PI / 2), dir: new Vector3(1, 0, 0) },
  { letter: 'y', rot: new Euler(0, 0, 0), dir: new Vector3(0, 1, 0) },
  { letter: 'z', rot: new Euler(Math.PI / 2, 0, 0), dir: new Vector3(0, 0, 1) },
]

const PLANES: { pair: string; rot: Euler; dir: Vector3 }[] = [
  { pair: 'XY', rot: new Euler(0, 0, 0), dir: new Vector3(1, 1, 0) },
  { pair: 'XZ', rot: new Euler(-Math.PI / 2, 0, 0), dir: new Vector3(1, 0, 1) },
  { pair: 'YZ', rot: new Euler(0, Math.PI / 2, 0), dir: new Vector3(0, 1, 1) },
]

/**
 * Scale gizmo with handles on BOTH ends of every axis (+X/-X, ...) for
 * extrude-style anchored scaling, plane handles on both diagonal corners
 * (+XY/-XY, ...), and a center cube for uniform scaling.
 */
export class ScaleGizmo extends ModeGizmo {
  readonly mode = 'scale' as const
  /** world distance factor (pre screen-scale) from center to axis handles */
  readonly handleDistance: number
  readonly planeHandleDistance: number

  constructor(theme: GizmoTheme) {
    super()
    const t = theme
    this.handleDistance = t.sizes.scaleHandleDistance
    this.planeHandleDistance = t.sizes.planeOffset
    const colors = { x: t.colors.x, y: t.colors.y, z: t.colors.z }
    const d = t.sizes.scaleHandleDistance

    for (const { letter, rot, dir } of AXES) {
      const L = letter.toUpperCase()
      // shaft spanning the full axis through the center
      const shaft = makeHandle(
        new CylinderGeometry(t.sizes.axisLineRadius, t.sizes.axisLineRadius, d * 2 - t.sizes.scaleCubeSize, 8),
        colors[letter],
        'scale',
        `+${L}` as AxisId,
        t,
      )
      shaft.rotation.copy(rot)
      shaft.userData.handle.axis = `+${L}` as AxisId // visual only; tint follows +side
      this.visual.add(shaft)

      for (const sign of [1, -1]) {
        const axis = `${sign > 0 ? '+' : '-'}${L}` as AxisId
        const cube = makeHandle(geo.cube(t), colors[letter], 'scale', axis, t)
        cube.position.copy(dir).multiplyScalar(d * sign)
        cube.rotation.copy(rot)
        this.visual.add(cube)

        const picker = makeHandle(geo.sphere(t.sizes.scaleCubeSize * t.sizes.pickerScale * 0.6), 0, 'scale', axis, t, true)
        picker.position.copy(cube.position)
        this.picker.add(picker)
      }
    }

    for (const { pair, rot, dir } of PLANES) {
      const letters = pair.toLowerCase().split('') as ('x' | 'y' | 'z')[]
      const color = colors[letters[0]!]
      for (const sign of [1, -1]) {
        const axis = `${sign > 0 ? '+' : '-'}${pair}` as AxisId
        const quad = makeHandle(geo.plane(t), color, 'scale', axis, t)
        quad.rotation.copy(rot)
        quad.position.copy(dir).multiplyScalar(this.planeHandleDistance * sign)
        quad.material.opacity = 0.5
        quad.userData.handle.baseOpacity = 0.5
        this.visual.add(quad)

        const picker = makeHandle(geo.plane(t), 0, 'scale', axis, t, true)
        picker.rotation.copy(rot)
        picker.position.copy(quad.position)
        picker.scale.setScalar(1.6)
        this.picker.add(picker)
      }
    }

    const center = makeHandle(geo.cube(t), t.colors.uniform, 'scale', 'XYZ', t)
    center.scale.setScalar(1.15)
    this.visual.add(center)
    const centerPicker = makeHandle(geo.sphere(t.sizes.scaleCubeSize * 1.5), 0, 'scale', 'XYZ', t, true)
    this.picker.add(centerPicker)
  }
}
