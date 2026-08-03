import { Plane, Quaternion, Ray, Vector3 } from 'three'
import type { AxisId, GizmoOperation, GizmoSpace } from '../types'

const _v1 = new Vector3()
const _v2 = new Vector3()
const _n = new Vector3()
const UNIT = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
}

function axisDir(letter: 'X' | 'Y' | 'Z', space: GizmoSpace, worldQuaternion: Quaternion, out: Vector3): Vector3 {
  out.copy(UNIT[letter])
  if (space === 'local') out.applyQuaternion(worldQuaternion)
  return out
}

/**
 * Compute the world-space drag plane for a given mode/axis, positioned at the
 * gizmo center. `eye` = normalized direction from gizmo toward the camera.
 *
 * - single-axis translate/scale: plane containing the axis, oriented as
 *   perpendicular to the eye as possible (normal = axis x (eye x axis)).
 * - plane handles: the plane itself.
 * - rotate: plane perpendicular to the rotation axis; screen ring / uniform:
 *   plane perpendicular to the eye.
 */
export function getDragPlane(
  mode: GizmoOperation,
  axis: AxisId,
  space: GizmoSpace,
  worldQuaternion: Quaternion,
  center: Vector3,
  eye: Vector3,
  out: Plane,
): Plane {
  // scale always operates in local axes
  const effSpace: GizmoSpace = mode === 'scale' ? 'local' : space
  const bare = axis.replace(/^[+-]/, '')

  if (axis === 'XYZ' || axis === 'E') {
    _n.copy(eye)
  } else if (bare.length === 2) {
    // plane handle: normal is the missing axis
    const missing = (['X', 'Y', 'Z'] as const).find((l) => !bare.includes(l))!
    axisDir(missing, effSpace, worldQuaternion, _n)
  } else if (mode === 'rotate') {
    axisDir(bare as 'X' | 'Y' | 'Z', effSpace, worldQuaternion, _n)
  } else {
    // single axis translate/scale: most camera-facing plane containing the axis
    const a = axisDir(bare as 'X' | 'Y' | 'Z', effSpace, worldQuaternion, _v1)
    _v2.copy(eye).cross(a) // in-plane direction
    _n.copy(a).cross(_v2)
    if (_n.lengthSq() < 1e-10) _n.copy(eye) // axis parallel to eye
    _n.normalize()
  }

  out.setFromNormalAndCoplanarPoint(_n, center)
  return out
}

const _hit = new Vector3()

/** Intersect a ray with the plane; returns null when near-parallel or behind. */
export function intersectPlane(ray: Ray, plane: Plane, out: Vector3): Vector3 | null {
  const denom = plane.normal.dot(ray.direction)
  if (Math.abs(denom) < 1e-6) return null
  const p = ray.intersectPlane(plane, _hit)
  if (!p) return null
  return out.copy(p)
}
