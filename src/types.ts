import type { Camera, Object3D } from 'three'

/** Per-handle / per-drag operation (never `'combined'`). */
export type GizmoOperation = 'translate' | 'rotate' | 'scale'
/** Active tool mode on {@link TransformGizmo}. */
export type GizmoMode = GizmoOperation | 'combined'
export type GizmoSpace = 'world' | 'local'

/**
 * Where a scale drag anchors.
 * 'opposite' — extrude: the face opposite the grabbed handle stays fixed in
 *              world space, so the object's position shifts as it grows.
 * 'center'   — the object's origin stays fixed, so scaling never changes
 *              position. Use this when the host app stores position and scale
 *              separately, or forces uniform scale.
 * Holding Alt during a drag selects the other mode. Holding Shift (proportional)
 * always keeps the origin fixed.
 */
export type ScaleAnchor = 'opposite' | 'center'

/**
 * Handle identifiers.
 * Translate: X, Y, Z, XY, XZ, YZ, XYZ (screen-plane center)
 * Rotate:    X, Y, Z, E (screen-space ring), XYZE (trackball / free-rotate)
 * Scale:     +X, -X, +Y, -Y, +Z, -Z, +XY, +XZ, +YZ, XYZ (uniform)
 *            (axis sign = grabbed side / opposite-face anchor; plane quads are
 *            positive-corner only and always center-anchored)
 */
export type AxisId =
  | 'X'
  | 'Y'
  | 'Z'
  | 'XY'
  | 'XZ'
  | 'YZ'
  | 'XYZ'
  | 'E'
  | 'XYZE'
  | '+X'
  | '-X'
  | '+Y'
  | '-Y'
  | '+Z'
  | '-Z'
  | '+XY'
  | '+XZ'
  | '+YZ'

export interface HandleInfo {
  mode: GizmoOperation
  axis: AxisId
  picker?: boolean
}

/** Visibility flags passed into mode gizmos (TransformControls-compatible). */
export interface GizmoShowFlags {
  x: boolean
  y: boolean
  z: boolean
  xy: boolean
  xz: boolean
  yz: boolean
  e: boolean
  xyze: boolean
}

type PropChanged<T> = { value: T }

/** Payloads for the events dispatched by {@link TransformGizmo}. */
export interface GizmoEventMap {
  /** the gizmo needs a re-render (hover, mode/space change, drag) */
  change: Record<string, unknown>
  /** the attached object's transform was modified by a drag */
  objectChange: Record<string, unknown>
  /** a drag started (true) or ended (false) — use it to gate orbit controls */
  'dragging-changed': { value: boolean }
  mouseDown: { mode: GizmoOperation }
  mouseUp: { mode: GizmoOperation }
  hoveron: { axis: AxisId }
  hoveroff: Record<string, unknown>
  // TransformControls-compatible property change events
  'camera-changed': PropChanged<Camera>
  'object-changed': PropChanged<Object3D | null>
  'enabled-changed': PropChanged<boolean>
  'axis-changed': PropChanged<AxisId | null>
  'mode-changed': PropChanged<GizmoMode>
  'space-changed': PropChanged<GizmoSpace>
  'size-changed': PropChanged<number>
  'translationSnap-changed': PropChanged<number | null>
  'rotationSnap-changed': PropChanged<number | null>
  'scaleSnap-changed': PropChanged<number | null>
  'showX-changed': PropChanged<boolean>
  'showY-changed': PropChanged<boolean>
  'showZ-changed': PropChanged<boolean>
  'showXY-changed': PropChanged<boolean>
  'showXZ-changed': PropChanged<boolean>
  'showYZ-changed': PropChanged<boolean>
  'showE-changed': PropChanged<boolean>
  'showXYZE-changed': PropChanged<boolean>
  'minX-changed': PropChanged<number>
  'maxX-changed': PropChanged<number>
  'minY-changed': PropChanged<number>
  'maxY-changed': PropChanged<number>
  'minZ-changed': PropChanged<number>
  'maxZ-changed': PropChanged<number>
}
