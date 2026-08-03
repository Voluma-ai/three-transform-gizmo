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
import type { AxisId } from '../types'
import { geo, halfOverhangRadius, makeHandle, type HandleMesh } from './HandleFactory'
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

interface DashedHalf {
  /** signed axis this half belongs to, e.g. `+X` */
  axis: AxisId
  letter: 'X' | 'Y' | 'Z'
  line: Line<BufferGeometry, LineDashedMaterial>
}

export interface ScaleVisualMods {
  alt: boolean
  shift: boolean
}

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
  /** solid axis shafts — idle look in dedicated scale mode */
  private readonly shafts: HandleMesh[] = []
  /** dashed half-axis guides while a scale handle is hovered / dragged */
  private readonly dashedHalves: DashedHalf[] = []

  constructor(theme: GizmoTheme) {
    super()
    const t = theme
    this.handleDistance = t.sizes.scaleHandleDistance
    this.planeHandleDistance = t.sizes.planeOffset
    const colors = { x: t.colors.x, y: t.colors.y, z: t.colors.z }
    const d = t.sizes.scaleHandleDistance
    const halfSpan = d - t.sizes.scaleCubeSize / 2

    for (const { letter, rot, dir } of AXES) {
      const L = letter.toUpperCase() as 'X' | 'Y' | 'Z'
      for (const sign of [1, -1]) {
        const axis = `${sign > 0 ? '+' : '-'}${L}` as AxisId

        const shaft = makeHandle(
          new CylinderGeometry(t.sizes.axisLineRadius, t.sizes.axisLineRadius, halfSpan, 8),
          colors[letter],
          'scale',
          axis,
          t,
        )
        shaft.rotation.copy(rot)
        shaft.position.copy(dir).multiplyScalar((sign * halfSpan) / 2)
        this.visual.add(shaft)
        this.shafts.push(shaft)

        const cube = makeHandle(geo.cube(t), colors[letter], 'scale', axis, t)
        cube.position.copy(dir).multiplyScalar(d * sign)
        cube.rotation.copy(rot)
        this.visual.add(cube)

        const pickR = halfOverhangRadius(t.sizes.scaleCubeSize / 2, t.sizes.scaleCubeSize * t.sizes.pickerScale * 0.6)
        const picker = makeHandle(geo.sphere(pickR), 0, 'scale', axis, t, true)
        picker.position.copy(cube.position)
        this.picker.add(picker)

        const core = makeHandle(geo.sphere(t.sizes.scaleCubeSize / 2), 0, 'scale', axis, t, true)
        core.position.copy(cube.position)
        core.userData.handle.core = true
        this.picker.add(core)

        // dashed half from center toward this cube
        const end = dir.clone().multiplyScalar(sign * halfSpan)
        const geoLine = new BufferGeometry()
        geoLine.setAttribute('position', new Float32BufferAttribute([0, 0, 0, end.x, end.y, end.z], 3))
        const mat = new LineDashedMaterial({
          color: colors[letter],
          dashSize: 0.06,
          gapSize: 0.04,
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
        this.dashedHalves.push({ axis, letter: L, line })
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
    const centerShapeR = (t.sizes.scaleCubeSize * 1.15) / 2
    const centerPicker = makeHandle(
      geo.sphere(halfOverhangRadius(centerShapeR, t.sizes.scaleCubeSize * 1.5)),
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
  }

  override updateVisuals(
    hoverAxis: AxisId | null,
    dragAxis: AxisId | null,
    theme: GizmoTheme,
    show: { x: boolean; y: boolean; z: boolean },
    mods: ScaleVisualMods = { alt: false, shift: false },
  ): void {
    super.updateVisuals(hoverAxis, dragAxis, theme, show)

    const active = dragAxis ?? hoverAxis
    const guiding = active !== null
    const combined = this.layout === 'combined'

    // solid shafts: idle dedicated-scale look only
    for (const shaft of this.shafts) {
      if (combined || guiding) shaft.visible = false
    }

    const highlight = dragAxis ? theme.colors.active : theme.colors.hover
    const opacity = dragAxis ? theme.opacity.active : theme.opacity.hover
    const showHalves = guiding ? this.halvesToShow(active!, mods) : null

    for (const { axis, line } of this.dashedHalves) {
      const on = showHalves !== null && showHalves.has(axis) && ModeGizmo.axisShown(axis, show)
      line.visible = on
      if (on) {
        line.material.color.setHex(highlight)
        line.material.opacity = opacity
      }
    }
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
    for (const { line } of this.dashedHalves) {
      line.geometry.dispose()
      line.material.dispose()
    }
    this.dashedHalves.length = 0
    super.dispose()
  }
}
