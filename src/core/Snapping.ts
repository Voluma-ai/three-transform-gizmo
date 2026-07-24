import { Quaternion, Vector3 } from 'three'

/** Snap an angle (radians) to the nearest multiple of `snap`. */
export function snapAngle(angle: number, snap: number | null): number {
  if (!snap) return angle
  return Math.round(angle / snap) * snap
}

const _q = new Quaternion()

/**
 * Snap a world-space translation offset to a grid of `snap`.
 * If `quaternion` is given, snapping happens in that (local) frame:
 * the offset is rotated into the frame, snapped per component, and rotated back.
 */
export function snapTranslate(offset: Vector3, snap: number | null, quaternion?: Quaternion): Vector3 {
  if (!snap) return offset
  if (quaternion) {
    _q.copy(quaternion).invert()
    offset.applyQuaternion(_q)
  }
  offset.x = Math.round(offset.x / snap) * snap
  offset.y = Math.round(offset.y / snap) * snap
  offset.z = Math.round(offset.z / snap) * snap
  if (quaternion) offset.applyQuaternion(quaternion)
  return offset
}

/**
 * Snap a resulting scale value to multiples of `snap` (in absolute scale units,
 * like TransformControls' scaleSnap). Guards against zero/negative results.
 */
export function snapScale(value: number, snap: number | null, min = 1e-4): number {
  let v = value
  if (snap) v = Math.round(v / snap) * snap
  if (v < min) v = min
  return v
}
