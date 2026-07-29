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
