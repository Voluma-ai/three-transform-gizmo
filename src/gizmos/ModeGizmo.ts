import { Group, Object3D } from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId, GizmoMode } from '../types'
import type { HandleMesh } from './HandleFactory'

/**
 * Base for the per-mode gizmo groups. Holds a `visual` group and an invisible
 * `picker` group (opacity-0 materials, larger hit areas). Handles carry
 * userData.handle = { mode, axis, baseColor }.
 */
export abstract class ModeGizmo extends Object3D {
  abstract readonly mode: GizmoMode
  readonly visual = new Group()
  readonly picker = new Group()

  constructor() {
    super()
    this.add(this.visual)
    this.add(this.picker)
  }

  getPickers(): HandleMesh[] {
    return this.picker.children as HandleMesh[]
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
   * while dragging.
   */
  updateVisuals(hoverAxis: AxisId | null, dragAxis: AxisId | null, theme: GizmoTheme, show: { x: boolean; y: boolean; z: boolean }): void {
    for (const h of this.getVisualHandles()) {
      const { axis, baseColor, baseOpacity } = h.userData.handle
      const visible =
        (axis === 'E' || axis === 'XYZ') ||
        ((!ModeGizmo.axisUses(axis, 'X') || show.x) &&
          (!ModeGizmo.axisUses(axis, 'Y') || show.y) &&
          (!ModeGizmo.axisUses(axis, 'Z') || show.z))
      h.visible = visible
      if (!visible) continue
      if (dragAxis) {
        if (axis === dragAxis) {
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
    for (const p of this.getPickers()) {
      const { axis } = p.userData.handle
      p.visible =
        (axis === 'E' || axis === 'XYZ') ||
        ((!ModeGizmo.axisUses(axis, 'X') || show.x) &&
          (!ModeGizmo.axisUses(axis, 'Y') || show.y) &&
          (!ModeGizmo.axisUses(axis, 'Z') || show.z))
    }
  }

  dispose(): void {
    for (const h of [...this.getVisualHandles(), ...this.getPickers()]) {
      h.geometry.dispose()
      h.material.dispose()
    }
  }
}
