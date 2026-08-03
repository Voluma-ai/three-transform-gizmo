import {
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  Vector3,
} from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId, GizmoShowFlags } from '../types'
import { geo, halfOverhangRadius, makeHandle, type HandleMesh } from './HandleFactory'
import { ModeGizmo } from './ModeGizmo'
import { TextLabel } from './TextLabel'

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

/** How much yellow axis visuals track object scale: visual = 1 + blend*(r-1). */
const VISUAL_SCALE_BLEND = 0.8

interface AxisEnd {
  axis: AxisId
  letter: 'X' | 'Y' | 'Z'
  sign: 1 | -1
  dir: Vector3
  shaft: HandleMesh
  cube: HandleMesh
  picker: HandleMesh
  core: HandleMesh
  line: Line<BufferGeometry, LineDashedMaterial>
  linePositions: Float32Array
}

export interface ScaleVisualMods {
  alt: boolean
  shift: boolean
  /** relative scale ratio while dragging; omit / null when not dragging */
  scaleRatio?: number | null
  /** fade every handle (sibling tools during a rotate drag) */
  dimAll?: boolean
}

/**
 * Scale gizmo with handles on BOTH ends of every axis (+X/-X, ...) for
 * extrude-style anchored scaling, one plane quad per plane in the positive
 * corner (+XY/+XZ/+YZ, matching TransformControls), and a center cube for
 * uniform scaling. Plane drags stay center-anchored.
 */
export class ScaleGizmo extends ModeGizmo {
  readonly mode = 'scale' as const
  /** outer distance — combined mode and dedicated-scale uniform (Shift / XYZ) */
  readonly handleDistance: number
  /** inward distance — dedicated scale mode while non-uniform */
  readonly handleDistanceNonUniform: number
  readonly planeHandleDistance: number
  /**
   * When true (`TransformGizmo` mode === `'scale'`), non-uniform axis cubes sit
   * inward; combined / other modes keep the outer radius outside the rings.
   */
  compact = false

  private readonly axisEnds: AxisEnd[] = []
  private readonly shafts: HandleMesh[] = []
  private readonly cubeSize: number
  /** one Shift hint per axis letter — shown on letters inactive without Shift */
  private readonly shiftLabels: { letter: 'X' | 'Y' | 'Z'; label: TextLabel }[] = []
  /** one Alt hint per axis letter — shown on the opposite side of active letters */
  private readonly altLabels: { letter: 'X' | 'Y' | 'Z'; label: TextLabel }[] = []
  private readonly scaleLabel: TextLabel
  private readonly showScaleLabel: boolean
  private readonly showScaleModifiers: boolean
  private readonly labelColor: number
  private readonly modifierIdleColor: number

  constructor(theme: GizmoTheme) {
    super()
    const t = theme
    this.handleDistance = t.sizes.scaleHandleDistance
    this.handleDistanceNonUniform = t.sizes.scaleHandleDistanceNonUniform
    this.planeHandleDistance = t.sizes.planeOffset
    this.cubeSize = t.sizes.gripSize
    this.showScaleLabel = t.showScaleLabel
    this.showScaleModifiers = t.showScaleModifiers
    this.labelColor = t.colors.sectorLabel
    this.modifierIdleColor = t.colors.originGhost

    const colors = { x: t.colors.x, y: t.colors.y, z: t.colors.z }
    // Default resting position matches combined / pre-session layout (outside ring).
    const d = this.handleDistance
    const shaftSpan = this.handleDistanceNonUniform - this.cubeSize / 2

    for (const { letter, rot, dir } of AXES) {
      const L = letter.toUpperCase() as 'X' | 'Y' | 'Z'
      for (const sign of [1, -1] as const) {
        const axis = `${sign > 0 ? '+' : '-'}${L}` as AxisId
        const halfSpan = d - this.cubeSize / 2

        const shaft = makeHandle(
          new CylinderGeometry(t.sizes.axisLineRadius, t.sizes.axisLineRadius, shaftSpan, 8),
          colors[letter],
          'scale',
          axis,
          t,
        )
        shaft.rotation.copy(rot)
        shaft.position.copy(dir).multiplyScalar((sign * shaftSpan) / 2)
        this.visual.add(shaft)
        this.shafts.push(shaft)

        const cube = makeHandle(geo.cube(t), colors[letter], 'scale', axis, t)
        cube.position.copy(dir).multiplyScalar(d * sign)
        cube.rotation.copy(rot)
        this.visual.add(cube)

        const pickR = halfOverhangRadius(this.cubeSize / 2, this.cubeSize * t.sizes.pickerScale * 0.6)
        const picker = makeHandle(geo.sphere(pickR), 0, 'scale', axis, t, true)
        picker.position.copy(cube.position)
        this.picker.add(picker)

        const core = makeHandle(geo.sphere(this.cubeSize / 2), 0, 'scale', axis, t, true)
        core.position.copy(cube.position)
        core.userData.handle.core = true
        this.picker.add(core)

        const linePositions = new Float32Array([
          0,
          0,
          0,
          dir.x * sign * halfSpan,
          dir.y * sign * halfSpan,
          dir.z * sign * halfSpan,
        ])
        const geoLine = new BufferGeometry()
        geoLine.setAttribute('position', new Float32BufferAttribute(linePositions, 3))
        const mat = new LineDashedMaterial({
          color: colors[letter],
          dashSize: 0.039,
          gapSize: 0.026,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        })
        const line = new Line(geoLine, mat)
        line.computeLineDistances()
        line.renderOrder = t.renderOrder
        line.visible = false
        this.visual.add(line)

        this.axisEnds.push({
          axis,
          letter: L,
          sign,
          dir: dir.clone(),
          shaft,
          cube,
          picker,
          core,
          line,
          linePositions,
        })
      }
    }

    for (const { pair, rot, dir } of PLANES) {
      // Plane color = perpendicular axis (TransformControls): XY→Z, XZ→Y, YZ→X
      const perp = pair === 'XY' ? 'z' : pair === 'XZ' ? 'y' : 'x'
      const color = colors[perp]
      // One positive-corner quad per plane — same layout as TransformControls.
      const axis = `+${pair}` as AxisId
      const quad = makeHandle(geo.plane(t), color, 'scale', axis, t)
      quad.rotation.copy(rot)
      quad.position.copy(dir).multiplyScalar(this.planeHandleDistance)
      quad.material.opacity = 0.5
      quad.userData.handle.baseOpacity = 0.5
      this.visual.add(quad)

      const picker = makeHandle(geo.plane(t), 0, 'scale', axis, t, true)
      picker.rotation.copy(rot)
      picker.position.copy(quad.position)
      picker.scale.setScalar(1.6)
      this.picker.add(picker)
    }

    const center = makeHandle(geo.cube(t), t.colors.uniform, 'scale', 'XYZ', t)
    center.scale.setScalar(1.15)
    this.visual.add(center)
    const centerShapeR = (this.cubeSize * 1.15) / 2
    const centerPicker = makeHandle(
      geo.sphere(halfOverhangRadius(centerShapeR, this.cubeSize * 1.5)),
      0,
      'scale',
      'XYZ',
      t,
      true,
    )
    this.picker.add(centerPicker)
    const centerCore = makeHandle(geo.sphere(centerShapeR), 0, 'scale', 'XYZ', t, true)
    centerCore.userData.handle.core = true
    this.picker.add(centerCore)

    const labelOpts = {
      color: this.labelColor,
      size: t.sizes.labelSize * 0.75,
      renderOrder: t.renderOrder + 2,
    }
    for (const letter of ['X', 'Y', 'Z'] as const) {
      const shift = new TextLabel(labelOpts)
      shift.setText('Shift')
      shift.visible = false
      this.visual.add(shift)
      this.shiftLabels.push({ letter, label: shift })

      const alt = new TextLabel(labelOpts)
      alt.setText('Alt')
      alt.visible = false
      this.visual.add(alt)
      this.altLabels.push({ letter, label: alt })
    }
    this.scaleLabel = new TextLabel({
      color: this.labelColor,
      size: t.sizes.labelSize * 1.15,
      renderOrder: t.renderOrder + 3,
    })
    this.scaleLabel.visible = false
    this.visual.add(this.scaleLabel)
  }

  /** Distance used for ExtrudeMath sensitivity for a given axis + Shift state. */
  axisHandleDistance(axis: AxisId, _shift: boolean): number {
    if (axis === 'XYZ') return this.compact ? this.handleDistanceNonUniform : this.handleDistance
    const core = axis.replace(/^[+-]/, '')
    if (core.length === 2) return this.planeHandleDistance
    // Dedicated scale mode keeps the inward radius even with Shift; combined
    // stays at the outer radius outside the rotate rings.
    return this.compact ? this.handleDistanceNonUniform : this.handleDistance
  }

  /** Axis-cube / dashed-guide radius for the current mode. */
  private axisRadius(): number {
    return this.compact ? this.handleDistanceNonUniform : this.handleDistance
  }

  override updateVisuals(
    hoverAxis: AxisId | null,
    dragAxis: AxisId | null,
    theme: GizmoTheme,
    show: GizmoShowFlags,
    mods: ScaleVisualMods = { alt: false, shift: false },
  ): void {
    super.updateVisuals(hoverAxis, dragAxis, theme, show, mods)

    const active = dragAxis ?? hoverAxis
    const guiding = active !== null
    const combined = this.layout === 'combined'
    const d = this.axisRadius()

    const highlight = dragAxis ? theme.colors.active : theme.colors.hover
    const opacity = dragAxis ? theme.opacity.active : theme.opacity.hover
    const showHalves = guiding ? this.halvesToShow(active!, mods) : null

    // Yellow halves track object scale at half intensity while dragging.
    const ratio = mods.scaleRatio
    const stretch =
      dragAxis !== null && ratio != null && Number.isFinite(ratio) ? 1 + VISUAL_SCALE_BLEND * (ratio - 1) : 1
    const dStretched = d * stretch

    this.layoutAxisEnds(d, showHalves, stretch)

    // solid shafts: idle dedicated-scale look only
    for (const shaft of this.shafts) {
      if (combined || guiding) shaft.visible = false
    }

    for (const end of this.axisEnds) {
      const on = showHalves !== null && showHalves.has(end.axis) && ModeGizmo.axisShown(end.axis, show)
      end.line.visible = on
      if (on) {
        end.line.material.color.setHex(highlight)
        end.line.material.opacity = opacity
      }
    }

    this.updateModifierLabels(active, guiding, d, dStretched, show, mods)
    this.updateScalePercent(dragAxis, mods.scaleRatio ?? null, dStretched)
  }

  /**
   * Place cubes / pickers / dashed-guide tips. Highlighted halves use `d * stretch`
   * so the yellow axis gives scale feedback without matching the object 1:1.
   */
  private layoutAxisEnds(d: number, stretchedHalves: Set<AxisId> | null, stretch: number): void {
    // Shafts stay at the inward idle length; cubes / pickers / dashed guides
    // share the mode radius (inward in dedicated scale, outer in combined).
    for (const end of this.axisEnds) {
      const { dir, sign } = end
      const rd = stretchedHalves?.has(end.axis) ? d * stretch : d
      const halfSpan = rd - this.cubeSize / 2
      end.cube.position.copy(dir).multiplyScalar(rd * sign)
      end.picker.position.copy(end.cube.position)
      end.core.position.copy(end.cube.position)

      const attr = end.line.geometry.getAttribute('position')
      attr.setXYZ(1, dir.x * sign * halfSpan, dir.y * sign * halfSpan, dir.z * sign * halfSpan)
      attr.needsUpdate = true
      end.line.computeLineDistances()
    }
  }

  private static letterDir(letter: 'X' | 'Y' | 'Z'): Vector3 {
    if (letter === 'X') return new Vector3(1, 0, 0)
    if (letter === 'Y') return new Vector3(0, 1, 0)
    return new Vector3(0, 0, 1)
  }

  /**
   * Shift → on axes that are idle without the modifier (would join under
   * proportional scale). Alt → on the opposite half of each selected axis
   * (would light up under center-anchored Alt).
   * Holding a key hides that key's hints and leaves the other visible in gray.
   */
  private updateModifierLabels(
    active: AxisId | null,
    guiding: boolean,
    d: number,
    dStretched: number,
    showAxes: GizmoShowFlags,
    mods: ScaleVisualMods,
  ): void {
    for (const { label } of this.shiftLabels) label.visible = false
    for (const { label } of this.altLabels) label.visible = false

    if (!this.showScaleModifiers || !guiding || !active || active === 'XYZ') return

    const core = active.replace(/^[+-]/, '')
    const sign = active.startsWith('-') ? -1 : 1
    const activeLetters = new Set(core.split('') as ('X' | 'Y' | 'Z')[])
    // Shift hints sit on idle axes (base radius). Alt hints on the opposite
    // half: stretch with the yellow axis only when Alt lights that half too.
    const shiftR = d * 0.72
    const altR = (mods.alt ? dStretched : d) * 0.72
    const shiftColor = mods.shift ? this.labelColor : this.modifierIdleColor
    const altColor = mods.alt ? this.labelColor : this.modifierIdleColor

    for (const { letter, label } of this.shiftLabels) {
      if (mods.shift) continue
      if (activeLetters.has(letter)) continue
      if (!ModeGizmo.axisShown(`+${letter}` as AxisId, showAxes)) continue
      label.visible = true
      label.setColor(shiftColor)
      label.position.copy(ScaleGizmo.letterDir(letter)).multiplyScalar(shiftR)
    }

    for (const { letter, label } of this.altLabels) {
      if (mods.alt) continue
      if (!activeLetters.has(letter)) continue
      if (!ModeGizmo.axisShown(`+${letter}` as AxisId, showAxes)) continue
      label.visible = true
      label.setColor(altColor)
      // opposite side of the grabbed handle
      label.position.copy(ScaleGizmo.letterDir(letter)).multiplyScalar(-sign * altR)
    }
  }

  private updateScalePercent(dragAxis: AxisId | null, ratio: number | null, d: number): void {
    const show = this.showScaleLabel && dragAxis !== null && ratio !== null && Number.isFinite(ratio)
    this.scaleLabel.visible = !!show
    if (!show || !dragAxis) return

    const pct = Math.round(ratio! * 100)
    this.scaleLabel.setText(`${pct}%`)

    if (dragAxis === 'XYZ') {
      this.scaleLabel.position.set(0, d * 0.35, 0)
      return
    }
    const core = dragAxis.replace(/^[+-]/, '')
    const sign = dragAxis.startsWith('-') ? -1 : 1
    const letter = core[0] as 'X' | 'Y' | 'Z'
    const dir = letter === 'X' ? new Vector3(1, 0, 0) : letter === 'Y' ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1)
    this.scaleLabel.position.copy(dir).multiplyScalar(sign * d * 0.45)
  }

  /**
   * Which signed half-axes to draw for the active handle + modifiers.
   * - Shift → all halves (proportional preview)
   * - Alt → full current axis / axes (both signs)
   * - none → only the half from center to the active cube(s)
   */
  private halvesToShow(active: AxisId, mods: ScaleVisualMods): Set<AxisId> {
    const out = new Set<AxisId>()
    const addBoth = (letter: string) => {
      out.add(`+${letter}` as AxisId)
      out.add(`-${letter}` as AxisId)
    }

    if (mods.shift || active === 'XYZ') {
      for (const L of ['X', 'Y', 'Z'] as const) addBoth(L)
      return out
    }

    const core = active.replace(/^[+-]/, '')
    const sign = active.startsWith('-') ? '-' : '+'

    if (mods.alt) {
      for (const L of core) addBoth(L)
      return out
    }

    // no modifier: half (or halves) toward the grabbed handle
    if (core.length === 1) {
      out.add(active)
    } else {
      for (const L of core) out.add(`${sign}${L}` as AxisId)
    }
    return out
  }

  /** plane quads clutter the multi-tool view — cubes only */
  protected override hiddenInCombined(axis: AxisId): boolean {
    const core = axis.replace(/^[+-]/, '')
    return core.length === 2
  }

  override dispose(): void {
    for (const end of this.axisEnds) {
      end.line.geometry.dispose()
      end.line.material.dispose()
    }
    this.axisEnds.length = 0
    for (const { label } of this.shiftLabels) label.dispose()
    for (const { label } of this.altLabels) label.dispose()
    this.scaleLabel.dispose()
    super.dispose()
  }
}
