import { Euler, Group } from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId } from '../types'
import { geo, makeHandle } from './HandleFactory'
import { ModeGizmo } from './ModeGizmo'

const RINGS: { axis: AxisId; rot: Euler }[] = [
  // torus lies in XY plane (axis = Z); orient so the ring's axis matches
  { axis: 'X', rot: new Euler(0, Math.PI / 2, 0) },
  { axis: 'Y', rot: new Euler(Math.PI / 2, 0, 0) },
  { axis: 'Z', rot: new Euler(0, 0, 0) },
]

export class RotateGizmo extends ModeGizmo {
  readonly mode = 'rotate' as const
  /** billboarded by TransformGizmo to face the camera (holds the E ring) */
  readonly screenGroup = new Group()

  constructor(theme: GizmoTheme) {
    super()
    const t = theme
    const colors: Record<string, number> = { X: t.colors.x, Y: t.colors.y, Z: t.colors.z }

    for (const { axis, rot } of RINGS) {
      const ring = makeHandle(geo.ring(t, t.sizes.ringRadius), colors[axis]!, 'rotate', axis, t)
      ring.rotation.copy(rot)
      this.visual.add(ring)

      const picker = makeHandle(geo.ringPicker(t, t.sizes.ringRadius), 0, 'rotate', axis, t, true)
      picker.rotation.copy(rot)
      this.picker.add(picker)
    }

    const eRing = makeHandle(geo.ring(t, t.sizes.screenRingRadius), t.colors.screen, 'rotate', 'E', t)
    this.screenGroup.add(eRing)
    const ePicker = makeHandle(geo.ringPicker(t, t.sizes.screenRingRadius), 0, 'rotate', 'E', t, true)
    this.screenGroup.add(ePicker)
    this.visual.add(this.screenGroup)
  }

  override getPickers() {
    return [...super.getPickers(), this.screenGroup.children[1] as ReturnType<ModeGizmo['getPickers']>[number]]
  }
}
