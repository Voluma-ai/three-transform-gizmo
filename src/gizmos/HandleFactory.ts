import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import type { GizmoTheme } from '../theme'
import type { AxisId, GizmoOperation } from '../types'

export interface HandleMesh extends Mesh<BufferGeometry, MeshBasicMaterial> {
  userData: {
    handle: {
      mode: GizmoOperation
      axis: AxisId
      baseColor: number
      baseOpacity: number
      picker: boolean
      /** shape-sized picker; sticky rotate yields to these over overhang pickers */
      core?: boolean
    }
  }
}

export function gizmoMaterial(color: number, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  })
}

export function pickerMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  })
}

/**
 * Hit radius that only extends half as far past the visual as `oldPickerRadius`
 * did: `shape + 0.5 * (old − shape)`.
 */
export function halfOverhangRadius(shapeRadius: number, oldPickerRadius: number): number {
  return shapeRadius + 0.5 * (oldPickerRadius - shapeRadius)
}

export function makeHandle(
  geometry: BufferGeometry,
  color: number,
  mode: GizmoOperation,
  axis: AxisId,
  theme: GizmoTheme,
  picker = false,
): HandleMesh {
  const mesh = new Mesh(geometry, picker ? pickerMaterial() : gizmoMaterial(color, theme.opacity.idle)) as HandleMesh
  mesh.renderOrder = theme.renderOrder
  // pickers are never rendered; the raycaster is given them explicitly, which
  // works regardless of visibility
  if (picker) mesh.visible = false
  mesh.userData = { handle: { mode, axis, baseColor: color, baseOpacity: 1, picker } }
  return mesh
}

// geometry builders (unit-space; positioned/rotated by the mode gizmos)
export const geo = {
  arrowShaft: (t: GizmoTheme) =>
    new CylinderGeometry(
      t.sizes.axisLineRadius,
      t.sizes.axisLineRadius,
      t.sizes.arrowLength - t.sizes.arrowHeadLength,
      8,
    ),
  arrowHead: (t: GizmoTheme) => new ConeGeometry(t.sizes.arrowHeadRadius, t.sizes.arrowHeadLength, 16),
  plane: (t: GizmoTheme) => new PlaneGeometry(t.sizes.planeSize, t.sizes.planeSize),
  ring: (t: GizmoTheme, radius: number) => new TorusGeometry(radius, t.sizes.ringTube, 8, 64),
  ringPicker: (t: GizmoTheme, radius: number) =>
    // keep pick tube ~0.12 even when the visual tube changes (was 0.0075×2.5×6)
    new TorusGeometry(radius, Math.max(t.sizes.ringTube * t.sizes.pickerScale, 0.12), 8, 32),
  cube: (t: GizmoTheme) => new BoxGeometry(t.sizes.scaleCubeSize, t.sizes.scaleCubeSize, t.sizes.scaleCubeSize),
  octa: (t: GizmoTheme) => new OctahedronGeometry(t.sizes.scaleCubeSize * 0.8, 0),
  sphere: (r: number) => new SphereGeometry(r, 12, 8),
}
