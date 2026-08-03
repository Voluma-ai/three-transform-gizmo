import { Group, Object3D } from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId, GizmoOperation, GizmoShowFlags } from '../types'
import type { HandleMesh } from './HandleFactory'

/** Full tool UI, or the stripped layout used when all three modes share the view. */
export type GizmoLayout = 'full' | 'combined'

/**
 * Base for the per-mode gizmo groups. Holds a `visual` group and an invisible
 * `picker` group (opacity-0 materials, larger hit areas). Handles carry
 * userData.handle = { mode, axis, baseColor }.
 */
export abstract class ModeGizmo extends Object3D {
  abstract readonly mode: GizmoOperation
  readonly visual = new Group()
  readonly picker = new Group()
  /** `'combined'` hides handles that clutter the multi-tool view. */
  layout: GizmoLayout = 'full'

  constructor() {
    super()
    this.add(this.visual)
    this.add(this.picker)
  }

  getPickers(): HandleMesh[] {
    return (this.picker.children as HandleMesh[]).filter(
      (p) => this.layout !== 'combined' || !this.hiddenInCombined(p.userData.handle.axis),
    )
  }

  /** axes suppressed when {@link layout} is `'combined'` (override in subclasses) */
  protected hiddenInCombined(_axis: AxisId): boolean {
    return false
  }

  getVisualHandles(): HandleMesh[] {
    const out: HandleMesh[] = []
    this.visual.traverse((o) => {
      const h = o as HandleMesh
      if (h.isMesh && h.userData?.handle && !h.userData.handle.picker) out.push(h)
    })
    return out
  }

  /** does `axis` involve the given letter (for showX/Y/Z filtering)? */
  static axisUses(axis: AxisId, letter: 'X' | 'Y' | 'Z'): boolean {
    return axis.replace(/^[+-]/, '').includes(letter)
  }

  /**
   * Per-frame visual state: hover/active tint and fading of inactive handles
   * while dragging. Pass `dimAll` to fade every handle (e.g. translate/scale
   * while a rotate drag keeps them visible for context).
   */
  updateVisuals(
    hoverAxis: AxisId | null,
    dragAxis: AxisId | null,
    theme: GizmoTheme,
    show: GizmoShowFlags,
    _mods?: { alt?: boolean; shift?: boolean; dimAll?: boolean },
  ): void {
    for (const h of this.getVisualHandles()) {
      const { axis, baseColor, baseOpacity } = h.userData.handle
      const visible = ModeGizmo.axisShown(axis, show) && !(this.layout === 'combined' && this.hiddenInCombined(axis))
      h.visible = visible
      if (!visible) continue
      if (dragAxis || _mods?.dimAll) {
        if (dragAxis && axis === dragAxis) {
          h.material.color.setHex(theme.colors.active)
          h.material.opacity = theme.opacity.active
        } else {
          h.material.color.setHex(baseColor)
          h.material.opacity = theme.opacity.inactiveWhileDragging * baseOpacity
        }
      } else if (hoverAxis === axis) {
        h.material.color.setHex(theme.colors.hover)
        h.material.opacity = theme.opacity.hover
      } else {
        h.material.color.setHex(baseColor)
        h.material.opacity = theme.opacity.idle * baseOpacity
      }
    }
  }

  /** should a handle with this axis be active given the show flags? */
  static axisShown(axis: AxisId, show: GizmoShowFlags): boolean {
    const core = axis.replace(/^[+-]/, '')
    if (core === 'E') return show.e
    if (core === 'XYZE') return show.xyze
    if (core === 'XYZ') return true
    if (core === 'XY') return show.xy && show.x && show.y
    if (core === 'XZ') return show.xz && show.x && show.z
    if (core === 'YZ') return show.yz && show.y && show.z
    return (
      (!ModeGizmo.axisUses(axis, 'X') || show.x) &&
      (!ModeGizmo.axisUses(axis, 'Y') || show.y) &&
      (!ModeGizmo.axisUses(axis, 'Z') || show.z)
    )
  }

  dispose(): void {
    for (const h of [...this.getVisualHandles(), ...this.getPickers()]) {
      h.geometry.dispose()
      h.material.dispose()
    }
  }
}
