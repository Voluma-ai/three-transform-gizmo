import { Camera, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'

const _camPos = new Vector3()

/**
 * Scale factor keeping the gizmo a constant size on screen
 * (same formula as three.js TransformControls).
 */
export function screenScaleFactor(camera: Camera, worldPosition: Vector3): number {
  if ((camera as OrthographicCamera).isOrthographicCamera) {
    const c = camera as OrthographicCamera
    return (c.top - c.bottom) / c.zoom
  }
  const c = camera as PerspectiveCamera
  const dist = worldPosition.distanceTo(c.getWorldPosition(_camPos))
  return dist * Math.min((1.9 * Math.tan((Math.PI * c.fov) / 360)) / c.zoom, 7)
}
