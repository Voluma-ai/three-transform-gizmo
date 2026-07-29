import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three'
import type { GizmoTheme } from '../theme'

const MAX_SEGMENTS = 128

/**
 * Semi-transparent "pie slice" showing the swept rotation angle during a
 * rotate drag. Geometry is preallocated; update() rewrites positions and
 * adjusts drawRange (no per-frame allocation). The sector lies in the local
 * XY plane from angle 0 (start direction) to the current swept angle; the
 * parent orients it into the rotation plane.
 */
export class AngleSector extends Mesh<BufferGeometry, MeshBasicMaterial> {
  private radius = 1

  constructor(theme: GizmoTheme) {
    const geometry = new BufferGeometry()
    const positions = new Float32Array(MAX_SEGMENTS * 3 * 3)
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setDrawRange(0, 0)
    const material = new MeshBasicMaterial({
      color: theme.colors.sector,
      transparent: true,
      opacity: theme.opacity.sector,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
      toneMapped: false,
    })
    super(geometry, material)
    this.renderOrder = theme.renderOrder - 1
    this.visible = false
    this.frustumCulled = false
  }

  setRadius(r: number): void {
    this.radius = r
  }

  /** angle in radians, signed; visual clamped to +-2PI */
  update(angle: number): void {
    const a = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, angle))
    const segments = Math.max(1, Math.min(MAX_SEGMENTS, Math.ceil((Math.abs(a) / (Math.PI * 2)) * MAX_SEGMENTS)))
    const attr = this.geometry.getAttribute('position') as BufferAttribute
    const arr = attr.array as Float32Array
    const r = this.radius
    for (let i = 0; i < segments; i++) {
      const a0 = (a * i) / segments
      const a1 = (a * (i + 1)) / segments
      const o = i * 9
      arr[o] = 0
      arr[o + 1] = 0
      arr[o + 2] = 0
      arr[o + 3] = Math.cos(a0) * r
      arr[o + 4] = Math.sin(a0) * r
      arr[o + 5] = 0
      arr[o + 6] = Math.cos(a1) * r
      arr[o + 7] = Math.sin(a1) * r
      arr[o + 8] = 0
    }
    attr.needsUpdate = true
    this.geometry.setDrawRange(0, segments * 3)
    this.visible = true
  }

  hide(): void {
    this.visible = false
    this.geometry.setDrawRange(0, 0)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
