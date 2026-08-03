import { Quaternion, Vector3 } from 'three'
import { snapScale } from './Snapping'
import type { AxisId } from '../types'

export interface AnchoredScaleInput {
  /** the grabbed scale handle, e.g. '+X', '+XY', 'XYZ' */
  handle: AxisId
  /** world-space drag offset (current plane point minus start plane point) */
  offsetWorld: Vector3
  /** object world orientation at drag start */
  worldQuaternionStart: Quaternion
  /** object local scale at drag start */
  scaleStart: Vector3
  /** object world scale at drag start (includes parent scale) */
  worldScaleStart: Vector3
  /** object local position at drag start */
  positionStart: Vector3
  /** inverse of the parent's world quaternion */
  parentQuaternionInv: Quaternion
  /** inverse of the parent's world scale (1/s per component) */
  parentScaleInv: Vector3
  /** local-space bounding-box half extents of the object (at scale 1) */
  localHalfExtents: Vector3
  /** local-space bounding-box center offset from the object origin */
  localCenterOffset: Vector3
  /** world distance from gizmo center to the grabbed handle at drag start */
  handleDistanceWorld: number
  /** true = scale from center (Alt held); false = anchor the opposite side */
  centerAnchored: boolean
  /**
   * true = constrain proportions (Shift held): every axis takes the same ratio,
   * derived from the dragged axes, instead of only the dragged ones changing.
   */
  proportional?: boolean
  scaleSnap: number | null
}

export interface AnchoredScaleResult {
  scale: Vector3
  position: Vector3
}

type AxisKey = 'x' | 'y' | 'z'

const AXIS_VECS: Record<AxisKey, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
}

/**
 * Floors drag sensitivity so a near-zero start scale can grow again.
 * When `|scaleStart| >= MIN`, this is identical to `scaleStart * ratio`.
 */
export const MIN_SCALE_SENSITIVITY = 0.1

function scaleSign(scaleStart: number, fallbackSign: number): number {
  return Math.abs(scaleStart) >= 1e-15 ? Math.sign(scaleStart) : fallbackSign !== 0 ? Math.sign(fallbackSign) : 1
}

/**
 * Apply a handle-distance ratio to a start scale component.
 * `fallbackSign` is used when `scaleStart` is ~0 (e.g. the grabbed handle sign).
 */
function applyScaleRatio(scaleStart: number, ratio: number, fallbackSign: number): number {
  const delta = ratio - 1
  const sgn = scaleSign(scaleStart, fallbackSign)
  const sensitivity = Math.max(Math.abs(scaleStart), MIN_SCALE_SENSITIVITY)
  return scaleStart + sgn * sensitivity * delta
}

/**
 * Drag-relative scale factor for UI (% label, yellow-axis stretch).
 * Matches multiplicative `next/start` for normal magnitudes; near zero uses the
 * sensitivity floor so the readout does not explode (e.g. 1e-6 → 0.05).
 */
export function effectiveScaleRatio(scaleStart: number, scaleNext: number, fallbackSign = 1): number {
  const sgn = scaleSign(scaleStart, fallbackSign)
  const sensitivity = Math.max(Math.abs(scaleStart), MIN_SCALE_SENSITIVITY)
  return 1 + (scaleNext - scaleStart) / (sgn * sensitivity)
}

/** Parse a scale handle id into its axes and grab signs. */
export function parseScaleHandle(handle: AxisId): { axes: AxisKey[]; sign: number } {
  if (handle === 'XYZ') return { axes: ['x', 'y', 'z'], sign: 0 }
  const sign = handle.startsWith('-') ? -1 : 1
  const letters = handle.replace(/^[+-]/, '').toLowerCase()
  return { axes: letters.split('') as AxisKey[], sign }
}

const _u = new Vector3()
const _shift = new Vector3()
const _tmp = new Vector3()

/**
 * Compute the new local scale and position for an anchored ("extrude") scale drag.
 *
 * All scale handles operate in the object's LOCAL axes (like TransformControls'
 * scale gizmo). The drag offset is projected onto each affected world axis
 * direction; the resulting handle-distance ratio gives the per-axis scale
 * factor. Unless centerAnchored, the object's position shifts so the face
 * (or corner) opposite the grabbed handle stays fixed in world space.
 *
 * When proportional, that ratio is applied to all three axes rather than only
 * the dragged ones, and the caller typically also sets centerAnchored so growth
 * stays about the origin.
 *
 * Near-zero start scales use a sensitivity floor ({@link MIN_SCALE_SENSITIVITY})
 * so a later drag can grow the object again without needing absurd ratios.
 */
export function computeAnchoredScale(input: AnchoredScaleInput): AnchoredScaleResult {
  const { axes, sign } = parseScaleHandle(input.handle)
  const scale = input.scaleStart.clone()
  const position = input.positionStart.clone()
  _shift.set(0, 0, 0)
  const fallbackSign = sign !== 0 ? sign : 1

  if (input.handle === 'XYZ') {
    // uniform, always center-anchored; ratio from drag along camera-right is
    // computed by the caller and passed via offsetWorld.x (see TransformGizmo)
    const s = Math.max(1e-4, 1 + input.offsetWorld.x / Math.max(Math.abs(input.handleDistanceWorld), 1e-6))
    for (const a of ['x', 'y', 'z'] as AxisKey[]) {
      scale[a] = snapScale(applyScaleRatio(input.scaleStart[a], s, 1), input.scaleSnap)
    }
    return { scale, position }
  }

  /** world direction of a local axis, pointing toward the grabbed handle */
  const axisDir = (a: AxisKey) =>
    _u.copy(AXIS_VECS[a]).applyQuaternion(input.worldQuaternionStart).normalize().multiplyScalar(sign)

  const rawRatio = (a: AxisKey) => {
    const d = input.offsetWorld.dot(axisDir(a))
    const h0 = input.handleDistanceWorld
    return Math.max(1e-4, (h0 + d) / h0)
  }

  // One ratio for every axis: the mean over the dragged axes, so a plane handle
  // stays symmetric instead of favouring whichever axis is listed first.
  let proportionalRatio = input.proportional ? axes.reduce((sum, a) => sum + rawRatio(a), 0) / axes.length : 0

  if (input.proportional && input.scaleSnap) {
    // Snap one representative magnitude, then reuse its effective ratio for
    // every axis. Snapping each resulting component independently would distort
    // an object whose starting scale is non-uniform.
    const referenceScale = axes.reduce((sum, a) => sum + Math.abs(input.scaleStart[a]), 0) / axes.length
    const sensitivity = Math.max(referenceScale, MIN_SCALE_SENSITIVITY)
    const unsapped = applyScaleRatio(referenceScale, proportionalRatio, 1)
    const snappedReferenceScale = Math.abs(snapScale(unsapped, input.scaleSnap))
    // Invert applyScaleRatio for a positive reference: ref + sens*(r-1) = snapped
    proportionalRatio = 1 + (snappedReferenceScale - referenceScale) / sensitivity
  }

  const draggedAxes = new Set(axes)
  const scaledAxes: AxisKey[] = input.proportional ? ['x', 'y', 'z'] : axes

  for (const a of scaledAxes) {
    const startAxisScale = input.scaleStart[a]
    const ratio = input.proportional ? proportionalRatio : rawRatio(a)
    const newAxisScale = input.proportional
      ? applyScaleRatio(startAxisScale, ratio, fallbackSign)
      : snapScale(applyScaleRatio(startAxisScale, ratio, fallbackSign), input.scaleSnap)
    scale[a] = newAxisScale

    // Only a dragged axis has a face to pin.
    if (!input.centerAnchored && draggedAxes.has(a)) {
      // Keep the opposite face fixed: the anchor sits at
      // (center - sign*e) along the axis in local units. When the axis scale
      // grows by Δs, pinning the anchor moves the origin in world by
      // u * worldDelta * (e - sign*c). Use local Δs mapped through world/start
      // (not worldStart*(r-1) with a sensitivity-floored r) so near-zero starts
      // still extrude instead of looking center-anchored.
      const e = input.localHalfExtents[a]
      const c = input.localCenterOffset[a] * sign
      const localDelta = newAxisScale - startAxisScale
      const worldDelta =
        Math.abs(startAxisScale) >= 1e-10
          ? (input.worldScaleStart[a] * localDelta) / startAxisScale
          : localDelta / (Math.abs(input.parentScaleInv[a]) > 1e-15 ? input.parentScaleInv[a] : 1)
      const shiftLen = worldDelta * (e - c)
      _shift.addScaledVector(axisDir(a), shiftLen)
    }
  }

  if (!input.centerAnchored && _shift.lengthSq() > 0) {
    // world shift -> parent local space
    _tmp.copy(_shift).applyQuaternion(input.parentQuaternionInv)
    _tmp.multiply(input.parentScaleInv)
    position.add(_tmp)
  }

  return { scale, position }
}
