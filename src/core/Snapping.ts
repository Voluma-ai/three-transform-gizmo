import type { Quaternion, Vector3 } from 'three'

/** Snap an angle (radians) to the nearest multiple of `snap`. */
export function snapAngle(angle: number, snap: number | null): number {
  if (!snap) return angle
  return Math.round(angle / snap) * snap
}

/**
 * Snap a resulting scale value to multiples of `snap` (in absolute scale units,
 * like TransformControls' scaleSnap).
 *
 * Clamping is applied to the *magnitude* so mirrored objects (negative scale)
 * keep their handedness: a scale of -1 stays negative instead of flipping.
 */
export function snapScale(value: number, snap: number | null, min = 1e-4): number {
  const sign = value < 0 ? -1 : 1
  let magnitude = Math.abs(value)
  if (snap) magnitude = Math.round(magnitude / snap) * snap
  if (magnitude < min) magnitude = min
  return sign * magnitude
}

/**
 * Signed twist angle (radians) of `q` around unit axis `axis`, via swing/twist
 * decomposition. Returns `null` when the decomposition is degenerate (e.g. a
 * pure 180° swing with no well-defined twist).
 */
export function twistAngleAroundAxis(q: Quaternion, axis: Vector3): number | null {
  // Project the quaternion vector part onto the axis → twist imag components.
  const dot = q.x * axis.x + q.y * axis.y + q.z * axis.z
  const tx = axis.x * dot
  const ty = axis.y * dot
  const tz = axis.z * dot
  const tw = q.w
  const lenSq = tx * tx + ty * ty + tz * tz + tw * tw
  if (lenSq < 1e-20) return null
  const inv = 1 / Math.sqrt(lenSq)
  // Signed half-angle sine along +axis (right-handed).
  const sinHalf = (tx * axis.x + ty * axis.y + tz * axis.z) * inv
  const cosHalf = tw * inv
  return 2 * Math.atan2(sinHalf, cosHalf)
}
