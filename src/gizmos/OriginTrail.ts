import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import type { GizmoTheme } from '../theme'
import { TextLabel } from './TextLabel'

const _start = new Vector3()
const _q = new Quaternion()

const DASH = 0.0325
/** Gap is 3× dash so the period is color / empty / color / empty with equal lengths. */
const GAP = DASH * 3
/** Offset the second color into the third quarter of the period. */
const SECOND_COLOR_OFFSET = DASH * 2

function makeDashedLine(color: number, renderOrder: number): Line<BufferGeometry, LineDashedMaterial> {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3))
  const line = new Line(
    geo,
    new LineDashedMaterial({
      color,
      dashSize: DASH,
      gapSize: GAP,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  )
  line.computeLineDistances()
  line.renderOrder = renderOrder
  line.frustumCulled = false
  return line
}

function formatDistance(worldDistance: number): string {
  const abs = Math.abs(worldDistance)
  let text: string
  if (abs >= 100) text = worldDistance.toFixed(0)
  else if (abs >= 10) text = worldDistance.toFixed(1)
  else text = worldDistance.toFixed(2)
  if (text.includes('.')) text = text.replace(/\.?0+$/, '')
  if (text === '-0') text = '0'
  return text
}

/**
 * Drag-start origin marker: a small gray disc at the object's position when
 * the drag began, plus a dotted line to the current origin (gizmo local 0).
 * Single-axis drags use one axis color; plane drags alternate both axis colors.
 */
export class OriginTrail extends Object3D {
  private readonly circle: Mesh<CircleGeometry, MeshBasicMaterial>
  private readonly lineA: Line<BufferGeometry, LineDashedMaterial>
  private readonly lineB: Line<BufferGeometry, LineDashedMaterial>
  private readonly distanceLabel: TextLabel
  private readonly showDistanceLabel: boolean

  constructor(theme: GizmoTheme) {
    super()
    const color = theme.colors.originGhost
    const r = theme.sizes.originGhostRadius
    // Former ring hole radius was 0.55*r; disc diameter is half that hole's diameter.
    const discRadius = r * 0.55 * 0.5
    this.showDistanceLabel = theme.showOriginDistanceLabel

    this.circle = new Mesh(
      new CircleGeometry(discRadius, 24),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    )
    this.circle.renderOrder = theme.renderOrder + 2
    this.circle.frustumCulled = false
    this.add(this.circle)

    this.lineA = makeDashedLine(color, theme.renderOrder + 1)
    this.lineB = makeDashedLine(color, theme.renderOrder + 1)
    this.lineB.visible = false
    this.add(this.lineA, this.lineB)

    this.distanceLabel = new TextLabel({
      color: theme.colors.sectorLabel,
      size: theme.sizes.labelSize,
      renderOrder: theme.renderOrder + 3,
    })
    this.distanceLabel.visible = false
    this.add(this.distanceLabel)

    this.visible = false
  }

  /**
   * Place the ghost at `startLocal` (gizmo-local); line runs to the origin.
   * Pass one color for a single-axis trail, or two for an alternating dual-axis dash.
   * `worldDistance` is the world-space length of the trail (for the optional label).
   * Pass `showDistance = false` to keep the trail but hide the distance readout
   * (e.g. while scaling, where the % label is enough).
   */
  update(
    startLocal: Vector3,
    cameraWorldQuaternion?: Quaternion,
    parentWorldQuaternion?: Quaternion,
    lineColors: number[] = [],
    worldDistance = 0,
    showDistance = true,
  ): void {
    _start.copy(startLocal)
    this.circle.position.copy(_start)

    if (cameraWorldQuaternion && parentWorldQuaternion) {
      this.circle.quaternion.copy(_q.copy(parentWorldQuaternion).invert().multiply(cameraWorldQuaternion))
    }

    const moved = _start.lengthSq() > 1e-8
    this.setLineEndpoints(this.lineA, _start)
    this.setLineEndpoints(this.lineB, _start)

    const c0 = lineColors[0]
    const c1 = lineColors[1]
    const dual = c1 !== undefined

    // Single-axis: dense dash/gap. Dual: equal color / empty / color / empty.
    this.lineA.material.dashSize = DASH
    this.lineA.material.gapSize = dual ? GAP : DASH
    this.lineB.material.dashSize = DASH
    this.lineB.material.gapSize = GAP

    if (c0 !== undefined) this.lineA.material.color.setHex(c0)
    if (dual) {
      this.lineB.material.color.setHex(c1!)
      // Shift into the third quarter: A, empty, B, empty (equal segment lengths).
      this.offsetLineDistances(this.lineB, SECOND_COLOR_OFFSET)
      this.lineB.visible = moved
    } else {
      this.lineB.visible = false
    }

    this.lineA.visible = moved

    if (this.showDistanceLabel && showDistance && moved) {
      this.distanceLabel.setText(formatDistance(worldDistance))
      this.distanceLabel.position.copy(_start).multiplyScalar(0.5)
      this.distanceLabel.visible = true
    } else {
      this.distanceLabel.visible = false
    }

    this.visible = true
  }

  hide(): void {
    this.visible = false
    this.distanceLabel.visible = false
  }

  private setLineEndpoints(line: Line<BufferGeometry, LineDashedMaterial>, start: Vector3): void {
    const attr = line.geometry.getAttribute('position')
    attr.setXYZ(0, start.x, start.y, start.z)
    attr.setXYZ(1, 0, 0, 0)
    attr.needsUpdate = true
    line.computeLineDistances()
  }

  private offsetLineDistances(line: Line<BufferGeometry, LineDashedMaterial>, offset: number): void {
    const dist = line.geometry.getAttribute('lineDistance') as BufferAttribute | undefined
    if (!dist) return
    for (let i = 0; i < dist.count; i++) {
      dist.setX(i, dist.getX(i) + offset)
    }
    dist.needsUpdate = true
  }

  dispose(): void {
    this.circle.geometry.dispose()
    this.circle.material.dispose()
    this.lineA.geometry.dispose()
    this.lineA.material.dispose()
    this.lineB.geometry.dispose()
    this.lineB.material.dispose()
    this.distanceLabel.dispose()
  }
}
