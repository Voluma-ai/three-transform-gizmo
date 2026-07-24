import type { Object3D } from 'three'

export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type GizmoSpace = 'world' | 'local'

/**
 * Handle identifiers.
 * Translate: X, Y, Z, XY, XZ, YZ, XYZ (screen-plane center)
 * Rotate:    X, Y, Z, E (screen-space ring)
 * Scale:     +X, -X, +Y, -Y, +Z, -Z, +XY, -XY, +XZ, -XZ, +YZ, -YZ, XYZ (uniform)
 *            (sign = the grabbed side; the opposite side is the anchor)
 */
export type AxisId =
  | 'X' | 'Y' | 'Z'
  | 'XY' | 'XZ' | 'YZ'
  | 'XYZ' | 'E'
  | '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'
  | '+XY' | '-XY' | '+XZ' | '-XZ' | '+YZ' | '-YZ'

export interface HandleInfo {
  mode: GizmoMode
  axis: AxisId
  picker?: boolean
}

export interface GizmoEventMap {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  change: {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  objectChange: {}
  'dragging-changed': { value: boolean }
  mouseDown: { mode: GizmoMode }
  mouseUp: { mode: GizmoMode }
  hoveron: { axis: AxisId }
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  hoveroff: {}
}

export interface AttachEvent {
  object: Object3D
}
