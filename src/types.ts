export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type GizmoSpace = 'world' | 'local'

/**
 * Where a scale drag anchors.
 * 'opposite' — extrude: the face opposite the grabbed handle stays fixed in
 *              world space, so the object's position shifts as it grows.
 * 'center'   — the object's origin stays fixed, so scaling never changes
 *              position. Use this when the host app stores position and scale
 *              separately, or forces uniform scale.
 * Holding Alt during a drag selects the other mode.
 */
export type ScaleAnchor = 'opposite' | 'center'

/**
 * Handle identifiers.
 * Translate: X, Y, Z, XY, XZ, YZ, XYZ (screen-plane center)
 * Rotate:    X, Y, Z, E (screen-space ring)
 * Scale:     +X, -X, +Y, -Y, +Z, -Z, +XY, -XY, +XZ, -XZ, +YZ, -YZ, XYZ (uniform)
 *            (sign = the grabbed side; the opposite side is the anchor)
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
  | '+X'
  | '-X'
  | '+Y'
  | '-Y'
  | '+Z'
  | '-Z'
  | '+XY'
  | '-XY'
  | '+XZ'
  | '-XZ'
  | '+YZ'
  | '-YZ'

export interface HandleInfo {
  mode: GizmoMode
  axis: AxisId
  picker?: boolean
}

/** Payloads for the events dispatched by {@link TransformGizmo}. */
export interface GizmoEventMap {
  /** the gizmo needs a re-render (hover, mode/space change, drag) */
  change: Record<string, unknown>
  /** the attached object's transform was modified by a drag */
  objectChange: Record<string, unknown>
  /** a drag started (true) or ended (false) — use it to gate orbit controls */
  'dragging-changed': { value: boolean }
  mouseDown: { mode: GizmoMode }
  mouseUp: { mode: GizmoMode }
  hoveron: { axis: AxisId }
  hoveroff: Record<string, unknown>
}
