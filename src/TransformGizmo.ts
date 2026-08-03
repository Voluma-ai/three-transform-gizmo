import {
  Box3,
  Camera,
  Matrix4,
  Object3D,
  Object3DEventMap,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { getDragPlane, intersectPlane } from './core/DragPlane'
import { computeAnchoredScale } from './core/ExtrudeMath'
import { screenScaleFactor } from './core/ScreenScale'
import { snapAngle } from './core/Snapping'
import { AngleSector } from './gizmos/AngleSector'
import type { HandleMesh } from './gizmos/HandleFactory'
import { ModeGizmo } from './gizmos/ModeGizmo'
import { RotateGizmo } from './gizmos/RotateGizmo'
import { ScaleGizmo } from './gizmos/ScaleGizmo'
import { TranslateGizmo } from './gizmos/TranslateGizmo'
import { defaultTheme, mergeTheme, type GizmoTheme, type PartialTheme } from './theme'
import type { AxisId, GizmoEventMap, GizmoMode, GizmoOperation, GizmoSpace, ScaleAnchor } from './types'

export interface TransformGizmoOptions {
  theme?: PartialTheme
  /** where scale drags anchor; defaults to 'opposite' (extrude) */
  scaleAnchor?: ScaleAnchor
}

interface DragState {
  axis: AxisId
  mode: GizmoOperation
  /** space captured at drag start, so the drag stays consistent */
  space: GizmoSpace
  pointerId: number
  plane: Plane
  startPoint: Vector3
  positionStart: Vector3
  quaternionStart: Quaternion
  scaleStart: Vector3
  worldPositionStart: Vector3
  worldQuaternionStart: Quaternion
  worldScaleStart: Vector3
  parentQuaternion: Quaternion
  parentQuaternionInv: Quaternion
  parentScaleInv: Vector3
  rotationAxisWorld: Vector3
  sectorStartDir: Vector3
  localHalfExtents: Vector3
  localCenterOffset: Vector3
  handleDistanceWorld: number
  /** false when the object has no measurable geometry, so no anchor can be derived */
  boundsKnown: boolean
}

interface PickedHandle {
  mode: GizmoOperation
  axis: AxisId
}

/** lower = preferred when several mode pickers intersect the same ray */
const PICK_PRIORITY: Record<GizmoOperation, number> = {
  translate: 0,
  scale: 1,
  rotate: 2,
}

const _pointer = new Vector2()
const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()
const _q1 = new Quaternion()
const _q2 = new Quaternion()
const _m1 = new Matrix4()
const _m2 = new Matrix4()
const _box = new Box3()
const _childBox = new Box3()
// dedicated scratch for matrix decomposition, kept separate from _v1.._v3 so
// decomposing never clobbers a caller's in-flight vector
const _decompPos = new Vector3()
const _decompScale = new Vector3()
const _unitX = new Vector3(1, 0, 0)
const _unitY = new Vector3(0, 1, 0)
const _unitZ = new Vector3(0, 0, 1)
const UNIT: Record<'X' | 'Y' | 'Z', Vector3> = { X: _unitX, Y: _unitY, Z: _unitZ }

/**
 * Custom transform gizmo — near drop-in replacement for three.js
 * TransformControls, with per-axis / per-plane "extrude" scaling (handles on
 * both ends of each axis; the opposite side stays anchored, Alt scales from
 * center), a rotation angle sector with Shift snapping, and themeable styling.
 *
 * Add the instance to your scene. Dispatches the same event names as
 * TransformControls: change, objectChange, dragging-changed, mouseDown, mouseUp.
 */
export class TransformGizmo extends Object3D<GizmoEventMap & Object3DEventMap> {
  camera: Camera
  domElement: HTMLElement
  object: Object3D | null = null

  size = 1
  translationSnap: number | null = null
  rotationSnap: number | null = null
  scaleSnap: number | null = null
  showX = true
  showY = true
  showZ = true

  private _enabled = true
  private _mode: GizmoMode = 'translate'
  private _space: GizmoSpace = 'world'
  private _scaleAnchor: ScaleAnchor = 'opposite'
  private _axis: AxisId | null = null
  /** operation of the hovered/dragged handle (needed when mode is `'combined'`) */
  private _operation: GizmoOperation | null = null
  private _dragging = false
  private _theme: GizmoTheme
  private _drag: DragState | null = null
  private _altKey = false
  private _shiftKey = false

  private _translate: TranslateGizmo
  private _rotate: RotateGizmo
  private _scale: ScaleGizmo
  private _sector: AngleSector

  private _raycaster = new Raycaster()
  private _worldPosition = new Vector3()
  private _worldQuaternion = new Quaternion()
  private _eye = new Vector3()
  private _factor = 1

  private _onPointerDown = (e: PointerEvent) => this.pointerDown(e)
  private _onPointerMove = (e: PointerEvent) => this.pointerMove(e)
  private _onPointerUp = (e: PointerEvent) => this.pointerUp(e)
  private _onKeyChange = (e: KeyboardEvent) => this.keyChange(e)

  constructor(camera: Camera, domElement: HTMLElement, options: TransformGizmoOptions = {}) {
    super()
    this.camera = camera
    this.domElement = domElement
    this._theme = mergeTheme(defaultTheme, options.theme)
    if (options.scaleAnchor) this._scaleAnchor = options.scaleAnchor

    this._translate = new TranslateGizmo(this._theme)
    this._rotate = new RotateGizmo(this._theme)
    this._scale = new ScaleGizmo(this._theme)
    this._sector = new AngleSector(this._theme)
    this._sector.setRadius(this._theme.sizes.ringRadius)
    this.add(this._translate, this._rotate, this._scale, this._sector)
    this.visible = false

    domElement.addEventListener('pointerdown', this._onPointerDown)
    domElement.addEventListener('pointermove', this._onPointerMove)
    domElement.addEventListener('pointerup', this._onPointerUp)
    domElement.addEventListener('pointercancel', this._onPointerUp)
    domElement.ownerDocument?.addEventListener('keydown', this._onKeyChange)
    domElement.ownerDocument?.addEventListener('keyup', this._onKeyChange)
  }

  // ---------------------------------------------------------------- public API

  get enabled(): boolean {
    return this._enabled
  }
  set enabled(v: boolean) {
    this._enabled = v
    if (!v) this.endDrag()
  }

  get mode(): GizmoMode {
    return this._mode
  }
  set mode(m: GizmoMode) {
    this.setMode(m)
  }
  setMode(mode: GizmoMode): void {
    if (mode === this._mode) return
    this.endDrag()
    this._mode = mode
    this._axis = null
    this._operation = null
    this.applyModeLayout()
    this.dispatchEvent({ type: 'change' })
  }

  get space(): GizmoSpace {
    return this._space
  }
  set space(s: GizmoSpace) {
    this.setSpace(s)
  }
  setSpace(space: GizmoSpace): void {
    if (space === this._space) return
    this.endDrag()
    this._space = space
    this.dispatchEvent({ type: 'change' })
  }

  get scaleAnchor(): ScaleAnchor {
    return this._scaleAnchor
  }
  set scaleAnchor(a: ScaleAnchor) {
    this.setScaleAnchor(a)
  }
  /**
   * Choose whether scale drags pin the face opposite the grabbed handle
   * ('opposite', the default extrude behaviour) or the object's origin
   * ('center', so scaling never moves the object). Holding Alt during a drag
   * selects the other mode.
   */
  setScaleAnchor(anchor: ScaleAnchor): void {
    if (anchor === this._scaleAnchor) return
    this.endDrag()
    this._scaleAnchor = anchor
  }

  get axis(): AxisId | null {
    return this._axis
  }
  get dragging(): boolean {
    return this._dragging
  }

  setTranslationSnap(snap: number | null): void {
    this.translationSnap = snap
  }
  setRotationSnap(snap: number | null): void {
    this.rotationSnap = snap
  }
  setScaleSnap(snap: number | null): void {
    this.scaleSnap = snap
  }
  setSize(size: number): void {
    this.size = size
    this.dispatchEvent({ type: 'change' })
  }

  attach(object: Object3D): this {
    this.object = object
    this.visible = true
    this.dispatchEvent({ type: 'change' })
    return this
  }

  detach(): this {
    this.endDrag()
    this.object = null
    this.visible = false
    this._axis = null
    this._operation = null
    this.dispatchEvent({ type: 'change' })
    return this
  }

  /** the raycaster used for handle picking (e.g. to configure layers) */
  getRaycaster(): Raycaster {
    return this._raycaster
  }

  /** cancel the current drag and restore the object's transform from drag start */
  reset(): void {
    const drag = this._drag
    if (!drag || !this.object) return
    this.object.position.copy(drag.positionStart)
    this.object.quaternion.copy(drag.quaternionStart)
    this.object.scale.copy(drag.scaleStart)
    if (this.domElement.hasPointerCapture(drag.pointerId)) {
      this.domElement.releasePointerCapture(drag.pointerId)
    }
    this.dispatchEvent({ type: 'objectChange' })
    this.dispatchEvent({ type: 'change' })
    this.endDrag()
  }

  getTheme(): GizmoTheme {
    return this._theme
  }

  setTheme(partial: PartialTheme): void {
    this.endDrag()
    this._theme = mergeTheme(this._theme, partial)
    // rebuild gizmos with new geometry sizes/colors
    this.remove(this._translate, this._rotate, this._scale, this._sector)
    this._translate.dispose()
    this._rotate.dispose()
    this._scale.dispose()
    this._sector.dispose()
    this._translate = new TranslateGizmo(this._theme)
    this._rotate = new RotateGizmo(this._theme)
    this._scale = new ScaleGizmo(this._theme)
    this._sector = new AngleSector(this._theme)
    this._sector.setRadius(this._theme.sizes.ringRadius)
    this.add(this._translate, this._rotate, this._scale, this._sector)
    this.applyModeLayout()
    this.dispatchEvent({ type: 'change' })
  }

  dispose(): void {
    this.endDrag()
    this.domElement.removeEventListener('pointerdown', this._onPointerDown)
    this.domElement.removeEventListener('pointermove', this._onPointerMove)
    this.domElement.removeEventListener('pointerup', this._onPointerUp)
    this.domElement.removeEventListener('pointercancel', this._onPointerUp)
    this.domElement.ownerDocument?.removeEventListener('keydown', this._onKeyChange)
    this.domElement.ownerDocument?.removeEventListener('keyup', this._onKeyChange)
    this._translate.dispose()
    this._rotate.dispose()
    this._scale.dispose()
    this._sector.dispose()
  }

  // ------------------------------------------------------------ frame update

  override updateMatrixWorld(force?: boolean): void {
    if (this.object) {
      this.object.updateWorldMatrix(true, false)
      this.object.matrixWorld.decompose(this._worldPosition, this._worldQuaternion, _decompScale)
      this.position.copy(this._worldPosition)

      const useLocal = this._space === 'local' || this._mode === 'scale'
      this.quaternion.copy(useLocal ? this._worldQuaternion : _q1.identity())

      // scale always sits on object-local axes; when combined+world the root is
      // world-aligned, so counter-orient the scale child onto the object
      if (this._mode === 'combined' && this._space === 'world') {
        this._scale.quaternion.copy(this.quaternion).invert().multiply(this._worldQuaternion)
      } else {
        this._scale.quaternion.identity()
      }

      this._factor = screenScaleFactor(this.camera, this._worldPosition)
      this.scale.setScalar((this._factor * this.size * this._theme.sizes.gizmoSize) / 4)

      this.camera.updateMatrixWorld?.()
      this._eye.copy(this.camera.getWorldPosition(_v2)).sub(this._worldPosition).normalize()

      // billboard the screen-space rotate ring (compensate our own rotation)
      const camQ = this.camera.getWorldQuaternion(_q2)
      this._rotate.screenGroup.quaternion.copy(this.quaternion).invert().multiply(camQ)

      const show = { x: this.showX, y: this.showY, z: this.showZ }
      const dragAxis = this._dragging ? this._axis : null
      const hoverAxis = this._dragging ? null : this._axis
      const activeOp = this._dragging ? (this._drag?.mode ?? null) : this._operation

      this._translate.visible = this._mode === 'translate' || this._mode === 'combined'
      this._rotate.visible = this._mode === 'rotate' || this._mode === 'combined'
      this._scale.visible = this._mode === 'scale' || this._mode === 'combined'
      // combined: hide other tools' visuals while translate/scale is active
      // (rotate keeps the full multi-tool view so rings stay contextual)
      const focus = this._mode === 'combined' ? activeOp : null
      const solo = focus === 'translate' || focus === 'scale'
      this._translate.visual.visible = !solo || focus === 'translate'
      this._rotate.visual.visible = !solo // rotate never solos; hide when translate/scale focused
      this._scale.visual.visible = !solo || focus === 'scale'

      const mods = { alt: this._altKey, shift: this._shiftKey }
      for (const g of this.visibleModeGizmos()) {
        const match = activeOp === g.mode
        g.updateVisuals(match ? hoverAxis : null, match ? dragAxis : null, this._theme, show, mods)
      }
    }
    super.updateMatrixWorld(force)
  }

  // ---------------------------------------------------------------- pointers

  private visibleModeGizmos(): ModeGizmo[] {
    const out: ModeGizmo[] = []
    if (this._translate.visible) out.push(this._translate)
    if (this._rotate.visible) out.push(this._rotate)
    if (this._scale.visible) out.push(this._scale)
    return out
  }

  private applyModeLayout(): void {
    const layout = this._mode === 'combined' ? 'combined' : 'full'
    this._translate.layout = layout
    this._rotate.layout = layout
    this._scale.layout = layout
  }

  private setRayFromEvent(event: PointerEvent): void {
    const rect = this.domElement.getBoundingClientRect()
    _pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this._raycaster.setFromCamera(_pointer, this.camera)
  }

  private pickHandle(event: PointerEvent): PickedHandle | null {
    // make sure handle world matrices reflect the current camera/object state:
    // picking can happen before the app's first render after attach()
    this.updateMatrixWorld(true)
    this.setRayFromEvent(event)
    const show = { x: this.showX, y: this.showY, z: this.showZ }
    const pickers = this.visibleModeGizmos().flatMap((g) =>
      g.getPickers().filter((p) => ModeGizmo.axisShown(p.userData.handle.axis, show)),
    )
    const hits = this._raycaster.intersectObjects(pickers, false)
    if (hits.length === 0) return null

    const handleOf = (h: (typeof hits)[number]) => (h.object as HandleMesh).userData.handle

    // once a rotate ring is the active hover, keep it while the ray still
    // hits any rotate picker — avoids flicker onto overlapping translate/scale
    if (!this._dragging && this._operation === 'rotate') {
      let bestRotate: (typeof hits)[number] | null = null
      for (const h of hits) {
        if (handleOf(h).mode !== 'rotate') continue
        if (!bestRotate || h.distance < bestRotate.distance) bestRotate = h
      }
      if (bestRotate) {
        const { mode, axis } = handleOf(bestRotate)
        return { mode, axis }
      }
    }

    // default: translate beats scale beats rotate
    let best = hits[0]!
    let bestPri = PICK_PRIORITY[handleOf(best).mode]
    for (let i = 1; i < hits.length; i++) {
      const h = hits[i]!
      const pri = PICK_PRIORITY[handleOf(h).mode]
      if (pri < bestPri || (pri === bestPri && h.distance < best.distance)) {
        best = h
        bestPri = pri
      }
    }
    const { mode, axis } = handleOf(best)
    return { mode, axis }
  }

  /** end an active drag (pointer up, detach, disable, theme rebuild) */
  private endDrag(): void {
    if (!this._dragging) return
    const op = this._drag?.mode ?? this._operation ?? 'translate'
    this._dragging = false
    this._drag = null
    this._sector.hide()
    this.dispatchEvent({ type: 'mouseUp', mode: op })
    this.dispatchEvent({ type: 'dragging-changed', value: false })
    this.dispatchEvent({ type: 'change' })
  }

  private pointerDown(event: PointerEvent): void {
    if (!this._enabled || !this.object || this._dragging || event.button !== 0) return
    const picked = this.pickHandle(event)
    if (!picked) return
    const { mode, axis } = picked
    this._altKey = event.altKey
    this._shiftKey = event.shiftKey

    this.updateMatrixWorld(true)
    const object = this.object
    object.updateWorldMatrix(true, false)

    const worldPositionStart = new Vector3()
    const worldQuaternionStart = new Quaternion()
    const worldScaleStart = new Vector3()
    object.matrixWorld.decompose(worldPositionStart, worldQuaternionStart, worldScaleStart)

    const parentQuaternion = new Quaternion()
    const parentScale = new Vector3()
    if (object.parent) {
      object.parent.matrixWorld.decompose(_v1, parentQuaternion, parentScale)
    } else {
      parentScale.set(1, 1, 1)
    }

    const plane = new Plane()
    getDragPlane(mode, axis, this._space, worldQuaternionStart, worldPositionStart, this._eye, plane)
    this.setRayFromEvent(event)
    const startPoint = new Vector3()
    if (!intersectPlane(this._raycaster.ray, plane, startPoint)) return

    const rotationAxisWorld = new Vector3()
    if (mode === 'rotate') {
      if (axis === 'E') rotationAxisWorld.copy(this._eye)
      else {
        rotationAxisWorld.copy(UNIT[axis as 'X' | 'Y' | 'Z'])
        if (this._space === 'local') rotationAxisWorld.applyQuaternion(worldQuaternionStart)
      }
    }

    const localHalfExtents = new Vector3()
    const localCenterOffset = new Vector3()
    let handleDistanceWorld = 1
    let boundsKnown = true
    if (mode === 'scale') {
      boundsKnown = this.computeLocalBounds(object, localHalfExtents, localCenterOffset)
      const gizmoScale = (this._factor * this.size * this._theme.sizes.gizmoSize) / 4
      const dist =
        axis === 'XYZ' || axis.replace(/^[+-]/, '').length === 1
          ? this._scale.handleDistance
          : this._scale.planeHandleDistance
      handleDistanceWorld = Math.max(gizmoScale * dist, 1e-6)
    }

    this._drag = {
      axis,
      mode,
      space: mode === 'scale' ? 'local' : this._space,
      pointerId: event.pointerId,
      plane,
      startPoint,
      positionStart: object.position.clone(),
      quaternionStart: object.quaternion.clone(),
      scaleStart: object.scale.clone(),
      worldPositionStart,
      worldQuaternionStart,
      worldScaleStart,
      parentQuaternion,
      parentQuaternionInv: parentQuaternion.clone().invert(),
      parentScaleInv: new Vector3(1 / parentScale.x, 1 / parentScale.y, 1 / parentScale.z),
      rotationAxisWorld,
      sectorStartDir: _v2.copy(startPoint).sub(worldPositionStart).projectOnPlane(plane.normal).normalize().clone(),
      localHalfExtents,
      localCenterOffset,
      handleDistanceWorld,
      boundsKnown,
    }

    this._axis = axis
    this._operation = mode
    this._dragging = true
    if (mode === 'rotate') this.orientSector()
    try {
      this.domElement.setPointerCapture(event.pointerId)
    } catch {
      // pointer already gone (pen lift / touch-cancel race) — drag ends on pointerup/cancel
    }
    this.dispatchEvent({ type: 'mouseDown', mode })
    this.dispatchEvent({ type: 'dragging-changed', value: true })
    this.dispatchEvent({ type: 'change' })
  }

  private pointerMove(event: PointerEvent): void {
    if (!this._enabled || !this.object) return
    this._altKey = event.altKey
    this._shiftKey = event.shiftKey
    if (!this._dragging) {
      if (!event.isPrimary) return
      this.updateHover(this.pickHandle(event))
      return
    }
    const drag = this._drag
    if (!drag || event.pointerId !== drag.pointerId) return

    this.setRayFromEvent(event)
    if (!intersectPlane(this._raycaster.ray, drag.plane, _v1)) return
    const point = _v1

    if (drag.mode === 'translate') this.applyTranslate(drag, point)
    else if (drag.mode === 'rotate') this.applyRotate(drag, point)
    else this.applyScale(drag, point)

    this.dispatchEvent({ type: 'objectChange' })
    this.dispatchEvent({ type: 'change' })
  }

  private keyChange(event: KeyboardEvent): void {
    if (!this._enabled || !this.object) return
    const alt = event.altKey
    const shift = event.shiftKey
    if (alt === this._altKey && shift === this._shiftKey) return
    this._altKey = alt
    this._shiftKey = shift
    // refresh dashed scale guides while hovering / dragging without moving
    this.dispatchEvent({ type: 'change' })
  }

  private pointerUp(event: PointerEvent): void {
    if (!this._dragging || (this._drag && event.pointerId !== this._drag.pointerId)) return
    if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId)
    this.endDrag()
    this.updateHover(this.pickHandle(event))
  }

  /** apply a new hover handle, firing hoveron/hoveroff/change as needed */
  private updateHover(picked: PickedHandle | null): void {
    const axis = picked?.axis ?? null
    const operation = picked?.mode ?? null
    if (axis === this._axis && operation === this._operation) return
    const prev = this._axis
    this._axis = axis
    this._operation = operation
    if (axis) this.dispatchEvent({ type: 'hoveron', axis })
    else if (prev) this.dispatchEvent({ type: 'hoveroff' })
    this.dispatchEvent({ type: 'change' })
  }

  // ------------------------------------------------------------- drag: modes

  private applyTranslate(drag: DragState, point: Vector3): void {
    const object = this.object!
    const offset = _v2.copy(point).sub(drag.startPoint)

    const bare = drag.axis.replace(/^[+-]/, '')
    if (bare.length === 1 && bare !== 'E') {
      const dir = _v3.copy(UNIT[bare as 'X' | 'Y' | 'Z'])
      if (drag.space === 'local') dir.applyQuaternion(drag.worldQuaternionStart)
      offset.copy(dir.multiplyScalar(offset.dot(dir.clone().normalize())))
    }
    // plane handles and XYZ: offset already constrained by the drag plane

    // world offset -> parent local
    offset.applyQuaternion(drag.parentQuaternionInv).multiply(drag.parentScaleInv)
    object.position.copy(drag.positionStart).add(offset)

    // snap the RESULTING position to the grid (TransformControls semantics),
    // only on the axes involved in the drag
    if (this.translationSnap) {
      const snap = this.translationSnap
      const p = object.position
      if (drag.space === 'local') {
        p.applyQuaternion(_q1.copy(drag.quaternionStart).invert())
        for (const l of ['X', 'Y', 'Z'] as const) {
          if (drag.axis === 'XYZ' || bare.includes(l)) {
            const k = l.toLowerCase() as 'x' | 'y' | 'z'
            p[k] = Math.round(p[k] / snap) * snap
          }
        }
        p.applyQuaternion(drag.quaternionStart)
      } else {
        // account for the parent's world translation so snapping is world-grid
        // aligned (rotated/scaled parents follow TransformControls' approximation)
        if (object.parent) p.add(_v3.setFromMatrixPosition(object.parent.matrixWorld))
        for (const l of ['X', 'Y', 'Z'] as const) {
          if (drag.axis === 'XYZ' || bare.includes(l)) {
            const k = l.toLowerCase() as 'x' | 'y' | 'z'
            p[k] = Math.round(p[k] / snap) * snap
          }
        }
        if (object.parent) p.sub(_v3.setFromMatrixPosition(object.parent.matrixWorld))
      }
    }
  }

  private applyRotate(drag: DragState, point: Vector3): void {
    const object = this.object!
    const n = drag.rotationAxisWorld
    const v0 = _v2.copy(drag.startPoint).sub(drag.worldPositionStart).projectOnPlane(n)
    const v1 = _v3.copy(point).sub(drag.worldPositionStart).projectOnPlane(n)
    if (v0.lengthSq() < 1e-12 || v1.lengthSq() < 1e-12) return
    let angle = Math.atan2(v0.clone().cross(v1).dot(n), v0.dot(v1))

    const shiftSnap = (this._theme.snapping.shiftRotationSnapDeg * Math.PI) / 180
    angle = snapAngle(angle, this._shiftKey ? shiftSnap : this.rotationSnap)

    // newWorldQ = R * worldQ0  ->  newLocalQ = parentQInv * R * parentQ * localQ0
    _q1.setFromAxisAngle(n, angle)
    object.quaternion
      .copy(drag.parentQuaternionInv)
      .multiply(_q1)
      .multiply(drag.parentQuaternion)
      .multiply(drag.quaternionStart)

    // re-orient every move: in local space the gizmo root rotates with the
    // object, so a one-shot orientation at pointerdown would drift
    this.orientSector()
    this._sector.update(angle)
  }

  private applyScale(drag: DragState, point: Vector3): void {
    const object = this.object!
    const offsetWorld = _v2.copy(point).sub(drag.startPoint)

    if (drag.axis === 'XYZ') {
      // uniform: use signed drag distance along camera-right
      const right = _v3.set(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(_q1))
      offsetWorld.set(offsetWorld.dot(right), 0, 0)
    }

    const { scale, position } = computeAnchoredScale({
      handle: drag.axis,
      offsetWorld,
      worldQuaternionStart: drag.worldQuaternionStart,
      scaleStart: drag.scaleStart,
      worldScaleStart: drag.worldScaleStart,
      positionStart: drag.positionStart,
      parentQuaternionInv: drag.parentQuaternionInv,
      parentScaleInv: drag.parentScaleInv,
      localHalfExtents: drag.localHalfExtents,
      localCenterOffset: drag.localCenterOffset,
      handleDistanceWorld: drag.handleDistanceWorld,
      // Alt selects the anchor the gizmo is NOT configured for. Uniform scaling
      // is always centered, and without measurable bounds there is no opposite
      // face to pin — shifting by a guessed extent would just slide the object.
      centerAnchored:
        (this._scaleAnchor === 'center' ? !this._altKey : this._altKey) || drag.axis === 'XYZ' || !drag.boundsKnown,
      // Shift constrains proportions, as in most 2D and 3D editors. The center
      // cube already scales every axis, so the modifier is a no-op there.
      proportional: this._shiftKey,
      scaleSnap: this.scaleSnap,
    })
    object.scale.copy(scale)
    object.position.copy(position)
  }

  // ---------------------------------------------------------------- helpers

  /** orient the angle sector into the rotation plane, X axis toward the start direction */
  private orientSector(): void {
    const drag = this._drag!
    const n = drag.rotationAxisWorld
    const x = drag.sectorStartDir
    if (x.lengthSq() < 1e-12 || n.lengthSq() < 1e-12) return // degenerate grab at the exact center
    const y = _v3.copy(n).cross(x).normalize()
    if (y.lengthSq() < 1e-12) return
    _m1.makeBasis(x, y, n)
    _q1.setFromRotationMatrix(_m1)
    // The sector lives inside the gizmo root, so convert world -> gizmo space.
    // Derive the root's CURRENT world orientation the same way updateMatrixWorld
    // does (decompose, not parentQ * localQ — those differ under non-uniform
    // parent scale), because this.quaternion lags a frame during a local drag.
    const useLocal = this._space === 'local' || this._mode === 'scale'
    if (useLocal && this.object) {
      if (this.object.parent) {
        this.object.updateMatrix()
        _m2
          .multiplyMatrices(this.object.parent.matrixWorld, this.object.matrix)
          .decompose(_decompPos, _q2, _decompScale)
      } else {
        _q2.copy(this.object.quaternion)
      }
    } else {
      _q2.identity()
    }
    this._sector.quaternion.copy(_q2).invert().multiply(_q1)
    const radius =
      drag.mode === 'rotate' && drag.axis === 'E' ? this._theme.sizes.screenRingRadius : this._theme.sizes.ringRadius
    this._sector.setRadius(radius)
  }

  /**
   * Bounding box of the object in its own local (unscaled) frame:
   * half extents + center offset, used to place the extrude anchor.
   *
   * @returns false when nothing measurable was found (e.g. a splat or an empty
   * container), in which case the caller must fall back to center anchoring.
   */
  private computeLocalBounds(object: Object3D, halfExtents: Vector3, centerOffset: Vector3): boolean {
    // descendants' matrixWorld may be stale (attach + grab before the first
    // render, or children moved programmatically) — refresh the subtree
    object.updateWorldMatrix(false, true)
    _m1.copy(object.matrixWorld).invert()
    _box.makeEmpty()
    object.traverse((child) => {
      const mesh = child as { isMesh?: boolean; geometry?: { boundingBox: Box3 | null; computeBoundingBox(): void } }
      if (!mesh.isMesh || !mesh.geometry) return
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox
      if (!bb) return
      _m2.multiplyMatrices(_m1, child.matrixWorld)
      _childBox.copy(bb).applyMatrix4(_m2)
      _box.union(_childBox)
    })
    if (_box.isEmpty()) {
      halfExtents.set(0.5, 0.5, 0.5)
      centerOffset.set(0, 0, 0)
      return false
    }
    _box.getSize(halfExtents).multiplyScalar(0.5)
    _box.getCenter(centerOffset)
    // guard degenerate flat geometry
    halfExtents.x = Math.max(halfExtents.x, 1e-6)
    halfExtents.y = Math.max(halfExtents.y, 1e-6)
    halfExtents.z = Math.max(halfExtents.z, 1e-6)
    return true
  }
}
