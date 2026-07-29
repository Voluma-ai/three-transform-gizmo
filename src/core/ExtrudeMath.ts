import { Quaternion, Vector3 } from 'three'
import { snapScale } from './Snapping'
import type { AxisId } from '../types'

export interface AnchoredScaleInput {
  /** the grabbed scale handle, e.g. '+X', '-XY', 'XYZ' */
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
 */
export function computeAnchoredScale(input: AnchoredScaleInput): AnchoredScaleResult {
  const { axes, sign } = parseScaleHandle(input.handle)
  const scale = input.scaleStart.clone()
  const position = input.positionStart.clone()
  _shift.set(0, 0, 0)

  if (input.handle === 'XYZ') {
    // uniform, always center-anchored; ratio from drag along camera-right is
    // computed by the caller and passed via offsetWorld.x (see TransformGizmo)
    const s = Math.max(1e-4, 1 + input.offsetWorld.x / Math.max(Math.abs(input.handleDistanceWorld), 1e-6))
    for (const a of ['x', 'y', 'z'] as AxisKey[]) {
      scale[a] = snapScale(input.scaleStart[a] * s, input.scaleSnap)
    }
    return { scale, position }
  }

  for (const a of axes) {
    // world direction of this local axis, pointing toward the grabbed handle
    _u.copy(AXIS_VECS[a]).applyQuaternion(input.worldQuaternionStart).normalize().multiplyScalar(sign)
    const d = input.offsetWorld.dot(_u)
    const h0 = input.handleDistanceWorld
    const s = Math.max(1e-4, (h0 + d) / h0)
    const startAxisScale = Math.abs(input.scaleStart[a]) < 1e-10 ? 1e-10 : input.scaleStart[a]
    const newAxisScale = snapScale(startAxisScale * s, input.scaleSnap)
    const effectiveRatio = newAxisScale / startAxisScale
    scale[a] = newAxisScale

    if (!input.centerAnchored) {
      // Keep the opposite face fixed: the anchor sits at
      // (center - sign*e) along the axis in local units. When the axis scale
      // grows by ratio r, every local point p maps to world offset that grows
      // linearly, so pinning the anchor moves the origin in world by
      // u * worldScale_axis * (r-1) * (e - sign*c)  where e = half extent,
      // c = local bbox center offset along the axis (signed toward +axis).
      const e = input.localHalfExtents[a]
      const c = input.localCenterOffset[a] * sign
      const shiftLen = input.worldScaleStart[a] * (effectiveRatio - 1) * (e - c)
      _shift.addScaledVector(_u, shiftLen)
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
