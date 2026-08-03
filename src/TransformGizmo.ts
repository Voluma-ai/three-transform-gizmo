import {
  Box3,
  Camera,
  Color,
  ColorRepresentation,
  Matrix4,
  Object3D,
  Object3DEventMap,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { getDragPlane, intersectPlane } from './core/DragPlane'
import { computeAnchoredScale, effectiveScaleRatio } from './core/ExtrudeMath'
import { screenScaleFactor } from './core/ScreenScale'
import { snapAngle, twistAngleAroundAxis } from './core/Snapping'
import { AngleSector } from './gizmos/AngleSector'
import type { HandleMesh } from './gizmos/HandleFactory'
import { ModeGizmo } from './gizmos/ModeGizmo'
import { OriginTrail } from './gizmos/OriginTrail'
import { RotateGizmo } from './gizmos/RotateGizmo'
import { ScaleGizmo } from './gizmos/ScaleGizmo'
import { TranslateGizmo } from './gizmos/TranslateGizmo'
import { defaultTheme, mergeTheme, type GizmoTheme, type PartialTheme } from './theme'
import type { AxisId, GizmoEventMap, GizmoMode, GizmoOperation, GizmoShowFlags, GizmoSpace, ScaleAnchor } from './types'

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
  /** relative scale ratio while dragging scale (1 = unchanged); null otherwise */
  scaleRatio: number | null
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
 * TransformControls, with per-axis "extrude" scaling (handles on both ends of
 * each axis; the opposite side stays anchored, Alt/Option flips the configured
 * scale anchor, Shift constrains proportions and keeps the origin fixed),
 * TransformControls-style plane scale quads (center-anchored), space-aware
 * Ctrl/Command snapping, and themeable styling.
 *
 * Add the instance to your scene (or `scene.add(gizmo.getHelper())`). Dispatches
 * the same event names as TransformControls: change, objectChange,
 * dragging-changed, mouseDown, mouseUp, plus `*-changed` property events.
 */
export class TransformGizmo extends Object3D<GizmoEventMap & Object3DEventMap> {
  domElement: HTMLElement

  /** Sub-canvas region for pointer mapping (CSS pixels, origin lower-left). */
  viewport: Vector4 | null = null

  private _camera: Camera
  private _object: Object3D | null = null
  private _size = 1
  private _translationSnap: number | null = null
  private _rotationSnap: number | null = null
  private _scaleSnap: number | null = null
  private _showX = true
  private _showY = true
  private _showZ = true
  private _showXY = true
  private _showXZ = true
  private _showYZ = true
  private _showE = true
  /** Whether the XYZE trackball free-rotate picker is enabled. */
  private _showXYZE = true
  private _minX = -Infinity
  private _maxX = Infinity
  private _minY = -Infinity
  private _maxY = Infinity
  private _minZ = -Infinity
  private _maxZ = Infinity

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
  /** Ctrl or Command — platform-agnostic temporary snap. */
  private _ctrlKey = false
  private _connected = false

  private _translate: TranslateGizmo
  private _rotate: RotateGizmo
  private _scale: ScaleGizmo
  private _sector: AngleSector
  private _originTrail: OriginTrail

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
    this._camera = camera
    this.domElement = domElement
    this._theme = mergeTheme(defaultTheme, options.theme)
    if (options.scaleAnchor) this._scaleAnchor = options.scaleAnchor

    this._translate = new TranslateGizmo(this._theme)
    this._rotate = new RotateGizmo(this._theme)
    this._scale = new ScaleGizmo(this._theme)
    this._sector = new AngleSector(this._theme)
    this._sector.setRadius(this._theme.sizes.ringRadius)
    this._originTrail = new OriginTrail(this._theme)
    this.add(this._translate, this._rotate, this._scale, this._sector, this._originTrail)
    this.applyModeLayout()
    this.visible = false

    this.connect(domElement)
  }

  // ---------------------------------------------------------------- public API

  get camera(): Camera {
    return this._camera
  }
  set camera(v: Camera) {
    this.setCompatProp(
      'camera',
      this._camera,
      () => {
        this._camera = v
      },
      v,
    )
  }

  get object(): Object3D | null {
    return this._object
  }
  set object(v: Object3D | null) {
    this.setCompatProp(
      'object',
      this._object,
      () => {
        this._object = v
      },
      v,
    )
  }

  get enabled(): boolean {
    return this._enabled
  }
  set enabled(v: boolean) {
    if (v === this._enabled) return
    this._enabled = v
    if (!v) this.endDrag()
    this.dispatchEvent({ type: 'enabled-changed', value: v })
    this.dispatchEvent({ type: 'change' })
  }

  get size(): number {
    return this._size
  }
  set size(v: number) {
    this.setCompatProp(
      'size',
      this._size,
      () => {
        this._size = v
      },
      v,
    )
  }

  get translationSnap(): number | null {
    return this._translationSnap
  }
  set translationSnap(v: number | null) {
    this.setCompatProp(
      'translationSnap',
      this._translationSnap,
      () => {
        this._translationSnap = v
      },
      v,
    )
  }

  get rotationSnap(): number | null {
    return this._rotationSnap
  }
  set rotationSnap(v: number | null) {
    this.setCompatProp(
      'rotationSnap',
      this._rotationSnap,
      () => {
        this._rotationSnap = v
      },
      v,
    )
  }

  get scaleSnap(): number | null {
    return this._scaleSnap
  }
  set scaleSnap(v: number | null) {
    this.setCompatProp(
      'scaleSnap',
      this._scaleSnap,
      () => {
        this._scaleSnap = v
      },
      v,
    )
  }

  get showX(): boolean {
    return this._showX
  }
  set showX(v: boolean) {
    this.setCompatProp(
      'showX',
      this._showX,
      () => {
        this._showX = v
      },
      v,
    )
  }
  get showY(): boolean {
    return this._showY
  }
  set showY(v: boolean) {
    this.setCompatProp(
      'showY',
      this._showY,
      () => {
        this._showY = v
      },
      v,
    )
  }
  get showZ(): boolean {
    return this._showZ
  }
  set showZ(v: boolean) {
    this.setCompatProp(
      'showZ',
      this._showZ,
      () => {
        this._showZ = v
      },
      v,
    )
  }
  get showXY(): boolean {
    return this._showXY
  }
  set showXY(v: boolean) {
    this.setCompatProp(
      'showXY',
      this._showXY,
      () => {
        this._showXY = v
      },
      v,
    )
  }
  get showXZ(): boolean {
    return this._showXZ
  }
  set showXZ(v: boolean) {
    this.setCompatProp(
      'showXZ',
      this._showXZ,
      () => {
        this._showXZ = v
      },
      v,
    )
  }
  get showYZ(): boolean {
    return this._showYZ
  }
  set showYZ(v: boolean) {
    this.setCompatProp(
      'showYZ',
      this._showYZ,
      () => {
        this._showYZ = v
      },
      v,
    )
  }
  get showE(): boolean {
    return this._showE
  }
  set showE(v: boolean) {
    this.setCompatProp(
      'showE',
      this._showE,
      () => {
        this._showE = v
      },
      v,
    )
  }
  /** Trackball free-rotate sphere (TransformControls XYZE). */
  get showXYZE(): boolean {
    return this._showXYZE
  }
  set showXYZE(v: boolean) {
    this.setCompatProp(
      'showXYZE',
      this._showXYZE,
      () => {
        this._showXYZE = v
      },
      v,
    )
  }

  get minX(): number {
    return this._minX
  }
  set minX(v: number) {
    this.setCompatProp(
      'minX',
      this._minX,
      () => {
        this._minX = v
      },
      v,
    )
  }
  get maxX(): number {
    return this._maxX
  }
  set maxX(v: number) {
    this.setCompatProp(
      'maxX',
      this._maxX,
      () => {
        this._maxX = v
      },
      v,
    )
  }
  get minY(): number {
    return this._minY
  }
  set minY(v: number) {
    this.setCompatProp(
      'minY',
      this._minY,
      () => {
        this._minY = v
      },
      v,
    )
  }
  get maxY(): number {
    return this._maxY
  }
  set maxY(v: number) {
    this.setCompatProp(
      'maxY',
      this._maxY,
      () => {
        this._maxY = v
      },
      v,
    )
  }
  get minZ(): number {
    return this._minZ
  }
  set minZ(v: number) {
    this.setCompatProp(
      'minZ',
      this._minZ,
      () => {
        this._minZ = v
      },
      v,
    )
  }
  get maxZ(): number {
    return this._maxZ
  }
  set maxZ(v: number) {
    this.setCompatProp(
      'maxZ',
      this._maxZ,
      () => {
        this._maxZ = v
      },
      v,
    )
  }

  get mode(): GizmoMode {
    return this._mode
  }
  set mode(m: GizmoMode) {
    if (m === this._mode) return
    this.endDrag()
    this._mode = m
    this.writeAxis(null)
    this._operation = null
    this.applyModeLayout()
    this.dispatchEvent({ type: 'mode-changed', value: m })
    this.dispatchEvent({ type: 'change' })
  }
  setMode(mode: GizmoMode): void {
    this.mode = mode
  }
  getMode(): GizmoMode {
    return this.mode
  }

  get space(): GizmoSpace {
    return this._space
  }
  set space(s: GizmoSpace) {
    if (s === this._space) return
    this.endDrag()
    this._space = s
    this.dispatchEvent({ type: 'space-changed', value: s })
    this.dispatchEvent({ type: 'change' })
  }
  setSpace(space: GizmoSpace): void {
    this.space = space
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
   * selects the other mode. Holding Shift always keeps the origin fixed.
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
  }

  /** Visual root for scene graph — this instance (TransformControls returns a helper). */
  getHelper(): this {
    return this
  }

  /**
   * Set axis colors (TransformControls-compatible). Maps `active` to both
   * theme `active` and `hover`.
   */
  setColors(
    xAxis: ColorRepresentation,
    yAxis: ColorRepresentation,
    zAxis: ColorRepresentation,
    active: ColorRepresentation,
  ): void {
    const c = new Color()
    this.setTheme({
      colors: {
        x: c.set(xAxis).getHex(),
        y: c.set(yAxis).getHex(),
        z: c.set(zAxis).getHex(),
        active: c.set(active).getHex(),
        hover: c.set(active).getHex(),
      },
    })
  }

  /** Attach pointer/keyboard listeners (constructor already connects). */
  connect(domElement?: HTMLElement): void {
    if (domElement) this.domElement = domElement
    if (this._connected) this.disconnect()
    const el = this.domElement
    el.addEventListener('pointerdown', this._onPointerDown)
    el.addEventListener('pointermove', this._onPointerMove)
    el.addEventListener('pointerup', this._onPointerUp)
    el.addEventListener('pointercancel', this._onPointerUp)
    el.ownerDocument?.addEventListener('keydown', this._onKeyChange)
    el.ownerDocument?.addEventListener('keyup', this._onKeyChange)
    el.style.touchAction = 'none'
    this._connected = true
  }

  /** Remove pointer/keyboard listeners. */
  disconnect(): void {
    if (!this._connected) return
    const el = this.domElement
    el.removeEventListener('pointerdown', this._onPointerDown)
    el.removeEventListener('pointermove', this._onPointerMove)
    el.removeEventListener('pointerup', this._onPointerUp)
    el.removeEventListener('pointercancel', this._onPointerUp)
    el.ownerDocument?.removeEventListener('keydown', this._onKeyChange)
    el.ownerDocument?.removeEventListener('keyup', this._onKeyChange)
    el.style.touchAction = ''
    this._connected = false
  }

  attach(object: Object3D): this {
    this.object = object
    this.visible = true
    return this
  }

  detach(): this {
    this.endDrag()
    this.object = null
    this.visible = false
    this.writeAxis(null)
    this._operation = null
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
    this.remove(this._translate, this._rotate, this._scale, this._sector, this._originTrail)
    this._translate.dispose()
    this._rotate.dispose()
    this._scale.dispose()
    this._sector.dispose()
    this._originTrail.dispose()
    this._translate = new TranslateGizmo(this._theme)
    this._rotate = new RotateGizmo(this._theme)
    this._scale = new ScaleGizmo(this._theme)
    this._sector = new AngleSector(this._theme)
    this._sector.setRadius(this._theme.sizes.ringRadius)
    this._originTrail = new OriginTrail(this._theme)
    this.add(this._translate, this._rotate, this._scale, this._sector, this._originTrail)
    this.applyModeLayout()
    this.dispatchEvent({ type: 'change' })
  }

  dispose(): void {
    this.endDrag()
    this.disconnect()
    this._translate.dispose()
    this._rotate.dispose()
    this._scale.dispose()
    this._sector.dispose()
    this._originTrail.dispose()
  }

  /** TransformControls-style property assign: `name-changed` then `change`. */
  private setCompatProp(name: string, current: unknown, assign: () => void, value: unknown): void {
    if (current === value) return
    assign()
    this.dispatchEvent({ type: `${name}-changed`, value } as never)
    this.dispatchEvent({ type: 'change' })
  }

  private writeAxis(axis: AxisId | null): void {
    if (axis === this._axis) return
    this._axis = axis
    this.dispatchEvent({ type: 'axis-changed', value: axis })
  }

  private showFlags(): GizmoShowFlags {
    return {
      x: this._showX,
      y: this._showY,
      z: this._showZ,
      xy: this._showXY,
      xz: this._showXZ,
      yz: this._showYZ,
      e: this._showE,
      xyze: this._showXYZE,
    }
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
      this.scale.setScalar((this._factor * this.size) / 4)

      this.camera.updateMatrixWorld?.()
      this._eye.copy(this.camera.getWorldPosition(_v2)).sub(this._worldPosition).normalize()

      // billboard the screen-space rotate ring (compensate our own rotation)
      const camQ = this.camera.getWorldQuaternion(_q2)
      this._rotate.screenGroup.quaternion.copy(this.quaternion).invert().multiply(camQ)

      const show = this.showFlags()
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

      const mods = {
        alt: this._altKey,
        shift: this._shiftKey,
        scaleRatio: this._dragging && this._drag?.mode === 'scale' ? this._drag.scaleRatio : null,
      }
      for (const g of this.visibleModeGizmos()) {
        const match = activeOp === g.mode
        // Rotate keeps translate/scale visible for context — dim them like
        // inactive rings while the active ring is dragged.
        const dimAll = !match && dragAxis !== null && activeOp === 'rotate'
        g.updateVisuals(match ? hoverAxis : null, match ? dragAxis : null, this._theme, show, {
          ...mods,
          dimAll,
        })
      }

      if (this._dragging && this._drag && (this._drag.mode === 'translate' || this._drag.mode === 'scale')) {
        // Offset in gizmo-local space (avoid worldToLocal before matrixWorld is current).
        _v1.copy(this._drag.worldPositionStart).sub(this._worldPosition)
        _q1.copy(this.quaternion).invert()
        _v1.applyQuaternion(_q1)
        const s = this.scale.x
        if (Math.abs(s) > 1e-12) _v1.multiplyScalar(1 / s)
        const camQ = this.camera.getWorldQuaternion(_q2)
        const worldDist = this._drag.worldPositionStart.distanceTo(this._worldPosition)
        this._originTrail.update(
          _v1,
          camQ,
          this.quaternion,
          this.trailLineColors(this._drag.axis),
          worldDist,
          // Distance label is translate-only — during scale it competes with %.
          this._drag.mode === 'translate',
        )
      } else {
        this._originTrail.hide()
      }
    }
    super.updateMatrixWorld(force)
  }

  /** Dotted trail colors: one for a single axis, two (alternating) for a plane. */
  private trailLineColors(axis: AxisId): number[] {
    const core = axis.replace(/^[+-]/, '')
    const c = this._theme.colors
    if (core === 'X') return [c.x]
    if (core === 'Y') return [c.y]
    if (core === 'Z') return [c.z]
    if (core === 'XY') return [c.x, c.y]
    if (core === 'XZ') return [c.x, c.z]
    if (core === 'YZ') return [c.y, c.z]
    return [c.originGhost]
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
    // Dedicated scale pulls non-uniform cubes inward; combined keeps outer radius.
    this._scale.compact = this._mode === 'scale'
    // Dedicated translate stretches arrows to the dedicated-scale radius;
    // combined keeps the short arrows inside the rotate ring.
    this._translate.expanded = this._mode === 'translate'
  }

  private setRayFromEvent(event: PointerEvent): void {
    const rect = this.domElement.getBoundingClientRect()
    const viewport = this.viewport
    let originX: number
    let originY: number
    let regionWidth: number
    let regionHeight: number
    if (viewport !== null) {
      originX = viewport.x
      originY = rect.height - viewport.y - viewport.w
      regionWidth = viewport.z
      regionHeight = viewport.w
    } else {
      originX = 0
      originY = 0
      regionWidth = rect.width
      regionHeight = rect.height
    }
    _pointer.set(
      ((event.clientX - rect.left - originX) / regionWidth) * 2 - 1,
      (-(event.clientY - rect.top - originY) / regionHeight) * 2 + 1,
    )
    this._raycaster.setFromCamera(_pointer, this.camera)
  }

  private pickHandle(event: PointerEvent): PickedHandle | null {
    // make sure handle world matrices reflect the current camera/object state:
    // picking can happen before the app's first render after attach()
    this.updateMatrixWorld(true)
    this.setRayFromEvent(event)
    const show = this.showFlags()
    const pickers = this.visibleModeGizmos().flatMap((g) =>
      g.getPickers().filter((p) => ModeGizmo.axisShown(p.userData.handle.axis, show)),
    )
    const hits = this._raycaster.intersectObjects(pickers, false)
    if (hits.length === 0) return null

    const handleOf = (h: (typeof hits)[number]) => (h.object as HandleMesh).userData.handle

    // once a rotate ring is the active hover, keep it while the ray still hits
    // a rotate picker — unless the pointer is over a translate/scale *core*
    // (the drawn arrow/cube shape), which always overrides sticky rotate
    if (!this._dragging && this._operation === 'rotate') {
      let bestCore: (typeof hits)[number] | null = null
      let bestCorePri = Infinity
      let bestRotate: (typeof hits)[number] | null = null
      for (const h of hits) {
        const handle = handleOf(h)
        if (handle.core && (handle.mode === 'translate' || handle.mode === 'scale')) {
          const pri = PICK_PRIORITY[handle.mode]
          if (!bestCore || pri < bestCorePri || (pri === bestCorePri && h.distance < bestCore.distance)) {
            bestCore = h
            bestCorePri = pri
          }
        } else if (handle.mode === 'rotate') {
          if (!bestRotate || h.distance < bestRotate.distance) bestRotate = h
        }
      }
      if (bestCore) {
        const { mode, axis } = handleOf(bestCore)
        return { mode, axis }
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
    this._originTrail.hide()
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
    this._ctrlKey = event.ctrlKey || event.metaKey

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
      else if (axis !== 'XYZE') {
        rotationAxisWorld.copy(UNIT[axis as 'X' | 'Y' | 'Z'])
        if (this._space === 'local') rotationAxisWorld.applyQuaternion(worldQuaternionStart)
      }
      // XYZE: rotation axis is recomputed every move from the drag offset
    }

    const localHalfExtents = new Vector3()
    const localCenterOffset = new Vector3()
    let handleDistanceWorld = 1
    let boundsKnown = true
    if (mode === 'scale') {
      boundsKnown = this.computeLocalBounds(object, localHalfExtents, localCenterOffset)
      const gizmoScale = (this._factor * this.size) / 4
      const dist = this._scale.axisHandleDistance(axis, this._shiftKey)
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
      scaleRatio: mode === 'scale' ? 1 : null,
    }

    this.writeAxis(axis)
    this._operation = mode
    this._dragging = true
    if (mode === 'rotate' && axis !== 'XYZE') this.orientSector()
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
    this._ctrlKey = event.ctrlKey || event.metaKey
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
    const ctrl = event.ctrlKey || event.metaKey
    if (alt === this._altKey && shift === this._shiftKey && ctrl === this._ctrlKey) return
    this._altKey = alt
    this._shiftKey = shift
    this._ctrlKey = ctrl
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
    this.writeAxis(axis)
    this._operation = operation
    if (axis) this.dispatchEvent({ type: 'hoveron', axis })
    else if (prev) this.dispatchEvent({ type: 'hoveroff' })
    this.dispatchEvent({ type: 'change' })
  }

  // ------------------------------------------------------------- drag: modes

  /** Configured snap, else temporary Ctrl/Command default, else continuous. */
  private activeTranslationSnap(): number | null {
    if (this._translationSnap) return this._translationSnap
    if (this._ctrlKey) {
      const snap = this._theme.snapping.temporaryTranslationSnap
      return snap || null
    }
    return null
  }

  private activeRotationSnap(): number | null {
    if (this._rotationSnap) return this._rotationSnap
    if (this._ctrlKey) {
      const deg = this._theme.snapping.temporaryRotationSnapDeg
      return deg ? (deg * Math.PI) / 180 : null
    }
    return null
  }

  private activeScaleSnap(): number | null {
    if (this._scaleSnap) return this._scaleSnap
    if (this._ctrlKey) {
      const snap = this._theme.snapping.temporaryScaleSnap
      return snap || null
    }
    return null
  }

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

    const snap = this.activeTranslationSnap()
    if (snap) {
      if (drag.space === 'world') {
        // Quantize resulting world coordinates on the dragged axes.
        object.updateWorldMatrix(true, false)
        object.getWorldPosition(_v2)
        for (const l of ['X', 'Y', 'Z'] as const) {
          if (drag.axis === 'XYZ' || bare.includes(l)) {
            const k = l.toLowerCase() as 'x' | 'y' | 'z'
            _v2[k] = Math.round(_v2[k] / snap) * snap
          }
        }
        if (object.parent) object.parent.worldToLocal(_v2)
        object.position.copy(_v2)
      } else {
        // Quantize the drag offset in the drag-start local (object) frame.
        object.updateWorldMatrix(true, false)
        object.getWorldPosition(_v2)
        _v3.copy(_v2).sub(drag.worldPositionStart)
        _v3.applyQuaternion(_q1.copy(drag.worldQuaternionStart).invert())
        for (const l of ['X', 'Y', 'Z'] as const) {
          if (drag.axis === 'XYZ' || bare.includes(l)) {
            const k = l.toLowerCase() as 'x' | 'y' | 'z'
            _v3[k] = Math.round(_v3[k] / snap) * snap
          }
        }
        _v3.applyQuaternion(drag.worldQuaternionStart)
        _v2.copy(drag.worldPositionStart).add(_v3)
        if (object.parent) object.parent.worldToLocal(_v2)
        object.position.copy(_v2)
      }
    }

    object.position.x = Math.max(this.minX, Math.min(this.maxX, object.position.x))
    object.position.y = Math.max(this.minY, Math.min(this.maxY, object.position.y))
    object.position.z = Math.max(this.minZ, Math.min(this.maxZ, object.position.z))
  }

  private applyRotate(drag: DragState, point: Vector3): void {
    const object = this.object!
    const snap = this.activeRotationSnap()

    if (drag.axis === 'XYZE') {
      // TransformControls trackball: axis = offset × eye, angle from offset · (axis × eye)
      // Free rotate stays relative in every space (absolute orientation is undefined).
      this._sector.hide()
      const offset = _v2.copy(point).sub(drag.startPoint)
      const camDist = Math.max(drag.worldPositionStart.distanceTo(this.camera.getWorldPosition(_v1)), 1e-6)
      const speed = 20 / camDist
      const n = drag.rotationAxisWorld.copy(offset).cross(this._eye)
      if (n.lengthSq() < 1e-12) return
      n.normalize()
      let angle = offset.dot(_v3.copy(n).cross(this._eye)) * speed
      angle = snapAngle(angle, snap)
      _q1.setFromAxisAngle(n, angle)
      object.quaternion
        .copy(drag.parentQuaternionInv)
        .multiply(_q1)
        .multiply(drag.parentQuaternion)
        .multiply(drag.quaternionStart)
      return
    }

    const n = drag.rotationAxisWorld
    const v0 = _v2.copy(drag.startPoint).sub(drag.worldPositionStart).projectOnPlane(n)
    const v1 = _v3.copy(point).sub(drag.worldPositionStart).projectOnPlane(n)
    if (v0.lengthSq() < 1e-12 || v1.lengthSq() < 1e-12) return
    let angle = Math.atan2(v0.clone().cross(v1).dot(n), v0.dot(v1))

    // World X/Y/Z: snap absolute twist around the axis (preserves swing).
    // Local X/Y/Z and screen E: snap the angular delta from drag start.
    const constrainedAxis = drag.axis === 'X' || drag.axis === 'Y' || drag.axis === 'Z'
    if (snap && constrainedAxis && drag.space === 'world') {
      const startTwist = twistAngleAroundAxis(drag.worldQuaternionStart, n)
      if (startTwist != null) {
        angle = snapAngle(startTwist + angle, snap) - startTwist
      } else {
        angle = snapAngle(angle, snap)
      }
    } else {
      angle = snapAngle(angle, snap)
    }

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
      // Alt/Option selects the anchor the gizmo is NOT configured for. Shift
      // (proportional) always keeps the origin fixed. Uniform XYZ, plane
      // (multi-axis) handles, and unknown bounds are always centered.
      centerAnchored:
        this._shiftKey ||
        (this._scaleAnchor === 'center' ? !this._altKey : this._altKey) ||
        drag.axis === 'XYZ' ||
        drag.axis.replace(/^[+-]/, '').length === 2 ||
        !drag.boundsKnown,
      // Shift constrains proportions, as in most 2D and 3D editors. The center
      // cube already scales every axis, so the modifier is a no-op there.
      proportional: this._shiftKey,
      scaleSnap: this.activeScaleSnap(),
    })
    object.scale.copy(scale)
    object.position.copy(position)

    // Drag-relative ratio for % readout / yellow-axis stretch. Uses the same
    // sensitivity floor as ExtrudeMath so near-zero starts do not explode UI.
    const fallbackSign = drag.axis.startsWith('-') ? -1 : 1
    const sx = effectiveScaleRatio(drag.scaleStart.x, scale.x, fallbackSign)
    const sy = effectiveScaleRatio(drag.scaleStart.y, scale.y, fallbackSign)
    const sz = effectiveScaleRatio(drag.scaleStart.z, scale.z, fallbackSign)
    if (this._shiftKey || drag.axis === 'XYZ') {
      drag.scaleRatio = (sx + sy + sz) / 3
    } else {
      const core = drag.axis.replace(/^[+-]/, '')
      let sum = 0
      let n = 0
      if (core.includes('X')) {
        sum += sx
        n++
      }
      if (core.includes('Y')) {
        sum += sy
        n++
      }
      if (core.includes('Z')) {
        sum += sz
        n++
      }
      drag.scaleRatio = n > 0 ? sum / n : 1
    }
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
