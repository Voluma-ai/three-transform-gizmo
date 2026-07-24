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
import type { AxisId, GizmoEventMap, GizmoMode, GizmoSpace } from './types'

export interface TransformGizmoOptions {
  theme?: PartialTheme
}

interface DragState {
  axis: AxisId
  mode: GizmoMode
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
}

const _ray = new Raycaster()
const _pointer = new Vector2()
const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()
const _q1 = new Quaternion()
const _q2 = new Quaternion()
const _m1 = new Matrix4()
const _box = new Box3()
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
  private _axis: AxisId | null = null
  private _dragging = false
  private _theme: GizmoTheme
  private _drag: DragState | null = null
  private _altKey = false
  private _shiftKey = false

  private _translate: TranslateGizmo
  private _rotate: RotateGizmo
  private _scale: ScaleGizmo
  private _sector: AngleSector

  private _worldPosition = new Vector3()
  private _worldQuaternion = new Quaternion()
  private _eye = new Vector3()
  private _factor = 1

  private _onPointerDown = (e: PointerEvent) => this.pointerDown(e)
  private _onPointerMove = (e: PointerEvent) => this.pointerMove(e)
  private _onPointerUp = (e: PointerEvent) => this.pointerUp(e)

  constructor(camera: Camera, domElement: HTMLElement, options: TransformGizmoOptions = {}) {
    super()
    this.camera = camera
    this.domElement = domElement
    this._theme = mergeTheme(defaultTheme, options.theme)

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
    this._mode = mode
    this._axis = null
    this.dispatchEvent({ type: 'change' })
  }

  get space(): GizmoSpace {
    return this._space
  }
  set space(s: GizmoSpace) {
    this.setSpace(s)
  }
  setSpace(space: GizmoSpace): void {
    this._space = space
    this.dispatchEvent({ type: 'change' })
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
    this.dispatchEvent({ type: 'change' })
    return this
  }

  /** the raycaster used for handle picking (e.g. to configure layers) */
  getRaycaster(): Raycaster {
    return _ray
  }

  /** cancel the current drag and restore the object's transform from drag start */
  reset(): void {
    if (!this._drag || !this.object) return
    this.object.position.copy(this._drag.positionStart)
    this.object.quaternion.copy(this._drag.quaternionStart)
    this.object.scale.copy(this._drag.scaleStart)
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
    this.dispatchEvent({ type: 'change' })
  }

  dispose(): void {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown)
    this.domElement.removeEventListener('pointermove', this._onPointerMove)
    this.domElement.removeEventListener('pointerup', this._onPointerUp)
    this.domElement.removeEventListener('pointercancel', this._onPointerUp)
    this._translate.dispose()
    this._rotate.dispose()
    this._scale.dispose()
    this._sector.dispose()
  }

  // ------------------------------------------------------------ frame update

  override updateMatrixWorld(force?: boolean): void {
    if (this.object) {
      this.object.updateWorldMatrix(true, false)
      this.object.matrixWorld.decompose(this._worldPosition, this._worldQuaternion, _v1)
      this.position.copy(this._worldPosition)

      const useLocal = this._space === 'local' || this._mode === 'scale'
      this.quaternion.copy(useLocal ? this._worldQuaternion : _q1.identity())

      this._factor = screenScaleFactor(this.camera, this._worldPosition)
      this.scale.setScalar((this._factor * this.size * this._theme.sizes.gizmoSize) / 4)

      this.camera.updateMatrixWorld?.()
      this._eye.copy(this.camera.getWorldPosition(_v2)).sub(this._worldPosition).normalize()

      // billboard the screen-space rotate ring (compensate our own rotation)
      const camQ = this.camera.getWorldQuaternion(_q2)
      this._rotate.screenGroup.quaternion.copy(this.quaternion).invert().multiply(camQ)

      this._translate.visible = this._mode === 'translate'
      this._rotate.visible = this._mode === 'rotate'
      this._scale.visible = this._mode === 'scale'

      const show = { x: this.showX, y: this.showY, z: this.showZ }
      const dragAxis = this._dragging ? this._axis : null
      const hoverAxis = this._dragging ? null : this._axis
      this.activeGizmo().updateVisuals(hoverAxis, dragAxis, this._theme, show)
    }
    super.updateMatrixWorld(force)
  }

  // ---------------------------------------------------------------- pointers

  private activeGizmo(): ModeGizmo {
    return this._mode === 'translate' ? this._translate : this._mode === 'rotate' ? this._rotate : this._scale
  }

  private setRayFromEvent(event: PointerEvent): void {
    const rect = this.domElement.getBoundingClientRect()
    _pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1)
    _ray.setFromCamera(_pointer, this.camera)
  }

  private pickAxis(event: PointerEvent): AxisId | null {
    this.setRayFromEvent(event)
    const show = { x: this.showX, y: this.showY, z: this.showZ }
    const pickers = this.activeGizmo()
      .getPickers()
      .filter((p) => ModeGizmo.axisShown(p.userData.handle.axis, show))
    const hits = _ray.intersectObjects(pickers, false)
    const hit = hits[0]
    return hit ? (hit.object as HandleMesh).userData.handle.axis : null
  }

  /** end an active drag (pointer up, detach, disable, theme rebuild) */
  private endDrag(): void {
    if (!this._dragging) return
    this._dragging = false
    this._drag = null
    this._sector.hide()
    this.dispatchEvent({ type: 'mouseUp', mode: this._mode })
    this.dispatchEvent({ type: 'dragging-changed', value: false })
    this.dispatchEvent({ type: 'change' })
  }

  private pointerDown(event: PointerEvent): void {
    if (!this._enabled || !this.object || this._dragging || event.button !== 0) return
    const axis = this.pickAxis(event)
    if (!axis) return
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
    getDragPlane(this._mode, axis, this._space, worldQuaternionStart, worldPositionStart, this._eye, plane)
    this.setRayFromEvent(event)
    const startPoint = new Vector3()
    if (!intersectPlane(_ray.ray, plane, startPoint)) return

    const rotationAxisWorld = new Vector3()
    if (this._mode === 'rotate') {
      if (axis === 'E') rotationAxisWorld.copy(this._eye)
      else {
        rotationAxisWorld.copy(UNIT[axis as 'X' | 'Y' | 'Z'])
        if (this._space === 'local') rotationAxisWorld.applyQuaternion(worldQuaternionStart)
      }
    }

    const localHalfExtents = new Vector3()
    const localCenterOffset = new Vector3()
    let handleDistanceWorld = 1
    if (this._mode === 'scale') {
      this.computeLocalBounds(object, localHalfExtents, localCenterOffset)
      const gizmoScale = (this._factor * this.size * this._theme.sizes.gizmoSize) / 4
      const dist = axis === 'XYZ' || axis.replace(/^[+-]/, '').length === 1
        ? this._scale.handleDistance
        : this._scale.planeHandleDistance
      handleDistanceWorld = Math.max(gizmoScale * dist, 1e-6)
    }

    this._drag = {
      axis,
      mode: this._mode,
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
    }

    this._axis = axis
    this._dragging = true
    if (this._mode === 'rotate') this.orientSector()
    try {
      this.domElement.setPointerCapture(event.pointerId)
    } catch {
      // pointer already gone (pen lift / touch-cancel race) — drag ends on pointerup/cancel
    }
    this.dispatchEvent({ type: 'mouseDown', mode: this._mode })
    this.dispatchEvent({ type: 'dragging-changed', value: true })
    this.dispatchEvent({ type: 'change' })
  }

  private pointerMove(event: PointerEvent): void {
    if (!this._enabled || !this.object) return
    if (!this._dragging) {
      if (!event.isPrimary) return
      const axis = this.pickAxis(event)
      if (axis !== this._axis) {
        const prev = this._axis
        this._axis = axis
        if (axis) this.dispatchEvent({ type: 'hoveron', axis })
        else if (prev) this.dispatchEvent({ type: 'hoveroff' })
        this.dispatchEvent({ type: 'change' })
      }
      return
    }
    const drag = this._drag
    if (!drag || event.pointerId !== drag.pointerId) return
    this._altKey = event.altKey
    this._shiftKey = event.shiftKey

    this.setRayFromEvent(event)
    if (!intersectPlane(_ray.ray, drag.plane, _v1)) return
    const point = _v1

    if (drag.mode === 'translate') this.applyTranslate(drag, point)
    else if (drag.mode === 'rotate') this.applyRotate(drag, point)
    else this.applyScale(drag, point)

    this.dispatchEvent({ type: 'objectChange' })
    this.dispatchEvent({ type: 'change' })
  }

  private pointerUp(event: PointerEvent): void {
    if (!this._dragging || (this._drag && event.pointerId !== this._drag.pointerId)) return
    if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId)
    this.endDrag()
    // re-evaluate hover at the release position
    const axis = this.pickAxis(event)
    if (axis !== this._axis) {
      this._axis = axis
      this.dispatchEvent({ type: 'change' })
    }
  }

  // ------------------------------------------------------------- drag: modes

  private applyTranslate(drag: DragState, point: Vector3): void {
    const object = this.object!
    const offset = _v2.copy(point).sub(drag.startPoint)

    const bare = drag.axis.replace(/^[+-]/, '')
    if (bare.length === 1 && bare !== 'E') {
      const dir = _v3.copy(UNIT[bare as 'X' | 'Y' | 'Z'])
      if (this._space === 'local') dir.applyQuaternion(drag.worldQuaternionStart)
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
      if (this._space === 'local') {
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
      centerAnchored: this._altKey || drag.axis === 'XYZ',
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
    const y = _v3.copy(n).cross(x).normalize()
    _m1.makeBasis(x, y, n)
    _q1.setFromRotationMatrix(_m1)
    // sector lives inside the (scaled, rotated) gizmo root: convert world->gizmo.
    // Compute the root's CURRENT orientation from the object (the cached
    // this.quaternion lags a frame behind during a local-space rotate drag).
    if (this._space === 'local' && this.object) {
      _q2.copy(this._drag!.parentQuaternion).multiply(this.object.quaternion)
    } else {
      _q2.identity()
    }
    this._sector.quaternion.copy(_q2).invert().multiply(_q1)
    const radius = drag.mode === 'rotate' && drag.axis === 'E' ? this._theme.sizes.screenRingRadius : this._theme.sizes.ringRadius
    this._sector.setRadius(radius)
  }

  /**
   * Bounding box of the object in its own local (unscaled) frame:
   * half extents + center offset, used to place the extrude anchor.
   */
  private computeLocalBounds(object: Object3D, halfExtents: Vector3, centerOffset: Vector3): void {
    _m1.copy(object.matrixWorld).invert()
    _box.makeEmpty()
    object.traverse((child) => {
      const mesh = child as { isMesh?: boolean; geometry?: { boundingBox: Box3 | null; computeBoundingBox(): void } }
      if (!mesh.isMesh || !mesh.geometry) return
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox
      if (!bb) return
      const rel = new Matrix4().multiplyMatrices(_m1, child.matrixWorld)
      const b = bb.clone().applyMatrix4(rel)
      _box.union(b)
    })
    if (_box.isEmpty()) {
      halfExtents.set(0.5, 0.5, 0.5)
      centerOffset.set(0, 0, 0)
      return
    }
    _box.getSize(halfExtents).multiplyScalar(0.5)
    _box.getCenter(centerOffset)
    // guard degenerate flat geometry
    halfExtents.x = Math.max(halfExtents.x, 1e-6)
    halfExtents.y = Math.max(halfExtents.y, 1e-6)
    halfExtents.z = Math.max(halfExtents.z, 1e-6)
  }
}
