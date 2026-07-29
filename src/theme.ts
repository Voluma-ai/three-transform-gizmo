/**
 * Visual theme for the gizmo. Pass a partial theme to the constructor or
 * setTheme() — it is deep-merged over the defaults.
 */
export interface GizmoTheme {
  colors: {
    x: number
    y: number
    z: number
    /** screen-space rotate ring / screen translate handle */
    screen: number
    /** uniform-scale center handle */
    uniform: number
    hover: number
    active: number
    /** rotation angle sector fill */
    sector: number
    /** degrees readout shown inside the angle sector */
    sectorLabel: number
  }
  opacity: {
    idle: number
    hover: number
    active: number
    /** opacity of non-active handles while dragging */
    inactiveWhileDragging: number
    sector: number
  }
  sizes: {
    /** overall gizmo scale multiplier (same meaning as TransformControls `size`) */
    gizmoSize: number
    arrowLength: number
    arrowHeadLength: number
    arrowHeadRadius: number
    axisLineRadius: number
    /** offset of plane handles from center (fraction of arrow length) */
    planeOffset: number
    planeSize: number
    ringRadius: number
    ringTube: number
    screenRingRadius: number
    scaleCubeSize: number
    scaleHandleDistance: number
    /** scale factor for invisible picker hit areas */
    pickerScale: number
    /**
     * Relative height of the degrees readout (gizmo units). Only used when
     * `showSectorLabel` is true.
     */
    sectorLabelSize: number
  }
  snapping: {
    /** rotation snap in degrees applied while Shift is held */
    shiftRotationSnapDeg: number
  }
  /**
   * When true, show a degrees readout (e.g. `45°`) inside the rotation angle
   * sector while dragging. Off by default.
   */
  showSectorLabel: boolean
  renderOrder: number
}

export type PartialTheme = {
  [K in keyof GizmoTheme]?: GizmoTheme[K] extends object ? Partial<GizmoTheme[K]> : GizmoTheme[K]
}

export const defaultTheme: GizmoTheme = {
  colors: {
    x: 0xe5484d,
    y: 0x30a46c,
    z: 0x0091ff,
    screen: 0xe0e0e0,
    uniform: 0xffffff,
    hover: 0xffd60a,
    active: 0xffd60a,
    sector: 0xffd60a,
    sectorLabel: 0xffd60a,
  },
  opacity: {
    idle: 1.0,
    hover: 1.0,
    active: 1.0,
    inactiveWhileDragging: 0.15,
    sector: 0.25,
  },
  sizes: {
    gizmoSize: 1,
    arrowLength: 0.8,
    arrowHeadLength: 0.2,
    arrowHeadRadius: 0.06,
    axisLineRadius: 0.0125,
    planeOffset: 0.45,
    planeSize: 0.22,
    ringRadius: 0.75,
    ringTube: 0.015,
    screenRingRadius: 0.95,
    scaleCubeSize: 0.1,
    scaleHandleDistance: 0.8,
    pickerScale: 2.5,
    sectorLabelSize: 0.16,
  },
  snapping: {
    shiftRotationSnapDeg: 15,
  },
  showSectorLabel: false,
  renderOrder: 999,
}

export function mergeTheme(base: GizmoTheme, partial?: PartialTheme): GizmoTheme {
  return {
    colors: { ...base.colors, ...partial?.colors },
    opacity: { ...base.opacity, ...partial?.opacity },
    sizes: { ...base.sizes, ...partial?.sizes },
    snapping: { ...base.snapping, ...partial?.snapping },
    showSectorLabel: partial?.showSectorLabel ?? base.showSectorLabel,
    renderOrder: partial?.renderOrder ?? base.renderOrder,
  }
}
