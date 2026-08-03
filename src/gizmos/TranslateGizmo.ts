import { CylinderGeometry, Euler, Vector3 } from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId } from '../types'
import { geo, halfOverhangRadius, makeHandle } from './HandleFactory'
import { ModeGizmo } from './ModeGizmo'

const AXES: { axis: AxisId; letter: 'x' | 'y' | 'z'; rot: Euler; dir: Vector3 }[] = [
  { axis: 'X', letter: 'x', rot: new Euler(0, 0, -Math.PI / 2), dir: new Vector3(1, 0, 0) },
  { axis: 'Y', letter: 'y', rot: new Euler(0, 0, 0), dir: new Vector3(0, 1, 0) },
  { axis: 'Z', letter: 'z', rot: new Euler(Math.PI / 2, 0, 0), dir: new Vector3(0, 0, 1) },
]

const PLANES: { axis: AxisId; rot: Euler; pos: Vector3 }[] = [
  { axis: 'XY', rot: new Euler(0, 0, 0), pos: new Vector3(1, 1, 0) },
  { axis: 'XZ', rot: new Euler(-Math.PI / 2, 0, 0), pos: new Vector3(1, 0, 1) },
  { axis: 'YZ', rot: new Euler(0, Math.PI / 2, 0), pos: new Vector3(0, 1, 1) },
]

export class TranslateGizmo extends ModeGizmo {
  readonly mode = 'translate' as const

  constructor(theme: GizmoTheme) {
    super()
    const t = theme
    const colors = { x: t.colors.x, y: t.colors.y, z: t.colors.z }

    for (const { axis, letter, rot, dir } of AXES) {
      const shaft = makeHandle(geo.arrowShaft(t), colors[letter], 'translate', axis, t)
      shaft.rotation.copy(rot)
      shaft.position.copy(dir).multiplyScalar((t.sizes.arrowLength - t.sizes.arrowHeadLength) / 2)
      this.visual.add(shaft)

      // arrow heads on both ends of the axis; the shaft is only drawn on the
      // positive side, matching three.js TransformControls
      for (const sign of [1, -1]) {
        const head = makeHandle(geo.arrowHead(t), colors[letter], 'translate', axis, t)
        head.rotation.copy(rot)
        // flip the cone in its own frame so it points away from the origin
        if (sign < 0) head.rotateZ(Math.PI)
        head.position.copy(dir).multiplyScalar(sign * (t.sizes.arrowLength - t.sizes.arrowHeadLength / 2))
        this.visual.add(head)

        const pickPos = dir.clone().multiplyScalar(sign * (t.sizes.arrowLength / 2 + 0.1))
        const pickR = halfOverhangRadius(t.sizes.arrowHeadRadius, t.sizes.arrowHeadRadius * t.sizes.pickerScale)
        const picker = makeHandle(
          new CylinderGeometry(pickR, pickR, t.sizes.arrowLength, 6),
          0,
          'translate',
          axis,
          t,
          true,
        )
        picker.rotation.copy(rot)
        picker.position.copy(pickPos)
        this.picker.add(picker)

        const coreR = t.sizes.arrowHeadRadius
        const core = makeHandle(
          new CylinderGeometry(coreR, coreR, t.sizes.arrowLength, 6),
          0,
          'translate',
          axis,
          t,
          true,
        )
        core.rotation.copy(rot)
        core.position.copy(pickPos)
        core.userData.handle.core = true
        this.picker.add(core)
      }
    }

    for (const { axis, rot, pos } of PLANES) {
      const letters = axis.toLowerCase().split('') as ('x' | 'y' | 'z')[]
      const color = colors[letters[0]!]
      const quad = makeHandle(geo.plane(t), color, 'translate', axis, t)
      quad.rotation.copy(rot)
      quad.position.copy(pos).multiplyScalar(t.sizes.planeOffset)
      quad.material.opacity = 0.5
      quad.userData.handle.baseOpacity = 0.5
      this.visual.add(quad)

      const picker = makeHandle(geo.plane(t), 0, 'translate', axis, t, true)
      picker.rotation.copy(rot)
      picker.position.copy(quad.position)
      picker.scale.setScalar(1.6)
      this.picker.add(picker)
    }

    const center = makeHandle(geo.octa(t), t.colors.screen, 'translate', 'XYZ', t)
    center.scale.setScalar(0.6)
    this.visual.add(center)
    const centerPicker = makeHandle(geo.sphere(t.sizes.scaleCubeSize * 1.2), 0, 'translate', 'XYZ', t, true)
    this.picker.add(centerPicker)
  }

  /** plane quads sit in the same planes as rotate rings — drop them in combined */
  protected override hiddenInCombined(axis: AxisId): boolean {
    return axis.length === 2
  }
}
