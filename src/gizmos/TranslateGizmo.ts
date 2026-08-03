import { CylinderGeometry, Euler, Vector3 } from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId } from '../types'
import { geo, halfOverhangRadius, makeHandle, type HandleMesh } from './HandleFactory'
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

interface AxisParts {
  axis: AxisId
  dir: Vector3
  rot: Euler
  shaft: HandleMesh
  heads: HandleMesh[]
  pickers: HandleMesh[]
  cores: HandleMesh[]
}

/**
 * Translate gizmo with dual-end arrow heads. In combined mode the tip sits at
 * `arrowLength` (inside the rotate ring). In dedicated translate mode the axis
 * matches the dedicated scale gizmo radius (`scaleHandleDistanceNonUniform`).
 */
export class TranslateGizmo extends ModeGizmo {
  readonly mode = 'translate' as const
  /** tip distance in combined mode */
  readonly combinedLength: number
  /** tip distance in dedicated translate mode (matches dedicated scale radius) */
  readonly soloLength: number
  private readonly headLength: number
  private readonly baseShaftLength: number
  /**
   * When true (`TransformGizmo` mode === `'translate'`), axes use
   * {@link soloLength}; combined keeps {@link combinedLength}.
   */
  expanded = false

  private readonly axisParts: AxisParts[] = []
  private appliedLength = 0

  constructor(theme: GizmoTheme) {
    super()
    const t = theme
    this.combinedLength = t.sizes.arrowLength
    this.soloLength = t.sizes.scaleHandleDistanceNonUniform
    this.headLength = t.sizes.arrowHeadLength
    this.baseShaftLength = t.sizes.arrowLength - t.sizes.arrowHeadLength
    this.appliedLength = this.combinedLength

    const colors = { x: t.colors.x, y: t.colors.y, z: t.colors.z }
    const L = this.combinedLength

    for (const { axis, letter, rot, dir } of AXES) {
      const shaft = makeHandle(geo.arrowShaft(t), colors[letter], 'translate', axis, t)
      shaft.rotation.copy(rot)
      shaft.position.copy(dir).multiplyScalar((L - this.headLength) / 2)
      this.visual.add(shaft)

      const heads: HandleMesh[] = []
      const pickers: HandleMesh[] = []
      const cores: HandleMesh[] = []

      // arrow heads on both ends of the axis; the shaft is only drawn on the
      // positive side, matching three.js TransformControls
      for (const sign of [1, -1]) {
        const head = makeHandle(geo.arrowHead(t), colors[letter], 'translate', axis, t)
        head.rotation.copy(rot)
        // flip the cone in its own frame so it points away from the origin
        if (sign < 0) head.rotateZ(Math.PI)
        head.position.copy(dir).multiplyScalar(sign * (L - this.headLength / 2))
        this.visual.add(head)
        heads.push(head)

        const pickPos = dir.clone().multiplyScalar(sign * (L / 2 + 0.1))
        const pickR = halfOverhangRadius(t.sizes.arrowHeadRadius, t.sizes.arrowHeadRadius * t.sizes.pickerScale)
        const picker = makeHandle(new CylinderGeometry(pickR, pickR, L, 6), 0, 'translate', axis, t, true)
        picker.rotation.copy(rot)
        picker.position.copy(pickPos)
        this.picker.add(picker)
        pickers.push(picker)

        const coreR = t.sizes.arrowHeadRadius
        const core = makeHandle(new CylinderGeometry(coreR, coreR, L, 6), 0, 'translate', axis, t, true)
        core.rotation.copy(rot)
        core.position.copy(pickPos)
        core.userData.handle.core = true
        this.picker.add(core)
        cores.push(core)
      }

      this.axisParts.push({
        axis,
        dir: dir.clone(),
        rot: rot.clone(),
        shaft,
        heads,
        pickers,
        cores,
      })
    }

    for (const { axis, rot, pos } of PLANES) {
      // Plane color = perpendicular axis (TransformControls): XY→Z, XZ→Y, YZ→X
      const perp = axis === 'XY' ? 'z' : axis === 'XZ' ? 'y' : 'x'
      const color = colors[perp]
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

  override updateVisuals(
    hoverAxis: AxisId | null,
    dragAxis: AxisId | null,
    theme: GizmoTheme,
    show: { x: boolean; y: boolean; z: boolean },
    _mods?: { alt: boolean; shift: boolean },
  ): void {
    const L = this.expanded ? this.soloLength : this.combinedLength
    if (L !== this.appliedLength) {
      this.layoutAxes(L)
      this.appliedLength = L
    }
    super.updateVisuals(hoverAxis, dragAxis, theme, show)
  }

  private layoutAxes(L: number): void {
    const shaftLen = Math.max(L - this.headLength, 1e-4)
    const shaftScaleY = shaftLen / this.baseShaftLength
    const pickScaleY = L / this.combinedLength

    for (const part of this.axisParts) {
      const { dir, shaft, heads, pickers, cores } = part
      shaft.scale.set(1, shaftScaleY, 1)
      shaft.position.copy(dir).multiplyScalar(shaftLen / 2)

      for (let i = 0; i < 2; i++) {
        const sign = i === 0 ? 1 : -1
        heads[i]!.position.copy(dir).multiplyScalar(sign * (L - this.headLength / 2))
        const pickPos = dir.clone().multiplyScalar(sign * (L / 2 + 0.1))
        pickers[i]!.position.copy(pickPos)
        pickers[i]!.scale.set(1, pickScaleY, 1)
        cores[i]!.position.copy(pickPos)
        cores[i]!.scale.set(1, pickScaleY, 1)
      }
    }
  }

  /** plane quads sit in the same planes as rotate rings — drop them in combined */
  protected override hiddenInCombined(axis: AxisId): boolean {
    return axis.length === 2
  }
}
