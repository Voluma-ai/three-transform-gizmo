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
    /** drag-start origin ghost (circle + dotted trail) */
    originGhost: number
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
    /** Edge length of scale cubes; also sizes the translate center octahedron. */
    gripSize: number
    /**
     * Radial distance of scale axis cubes while uniform (Shift / XYZ guides).
     * Sits outside the rotate ring.
     */
    scaleHandleDistance: number
    /**
     * Radial distance of scale axis cubes in dedicated scale mode while
     * non-uniform (no Shift). Combined / multi-tool view keeps cubes at
     * `scaleHandleDistance` outside the rotate ring.
     */
    scaleHandleDistanceNonUniform: number
    /** scale factor for invisible picker hit areas */
    pickerScale: number
    /**
     * Relative height of readout labels in gizmo units (before `setSize` /
     * screen-scale). Scale % and degrees use `× 1.15`; Shift/Alt hints use
     * `× 0.75`; origin distance uses the base value.
     */
    labelSize: number
    /** Radius of the former origin-ghost ring; disc diameter is 55% of this value. */
    originGhostRadius: number
  }
  snapping: {
    /**
     * Temporary translation snap (world/local units) while Ctrl/Command is held
     * and `translationSnap` is unset.
     */
    temporaryTranslationSnap: number
    /**
     * Temporary rotation snap in degrees while Ctrl/Command is held and
     * `rotationSnap` is unset.
     */
    temporaryRotationSnapDeg: number
    /**
     * Temporary scale snap (absolute scale units) while Ctrl/Command is held
     * and `scaleSnap` is unset.
     */
    temporaryScaleSnap: number
  }
  /**
   * When true, show a degrees readout (e.g. `45°`) inside the rotation angle
   * sector while dragging. Off by default.
   */
  showSectorLabel: boolean
  /**
   * When true, show a relative scale percentage (e.g. `150%`) while scaling.
   * Off by default.
   */
  showScaleLabel: boolean
  /**
   * When true, show Shift / Alt key hints on inactive / opposite scale axes
   * while hovering or dragging a scale handle. Off by default.
   */
  showScaleModifiers: boolean
  /**
   * When true, show the world-space distance from the drag-start origin while
   * translating. Off by default (hidden during scale either way).
   */
  showOriginDistanceLabel: boolean
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
    originGhost: 0x888888,
  },
  opacity: {
    idle: 1.0,
    hover: 1.0,
    active: 1.0,
    inactiveWhileDragging: 0.15,
    sector: 0.25,
  },
  sizes: {
    // radial layout: arrow tip (0.3575) → ring (0.4875) → scale cube (0.65).
    // Dedicated scale mode pulls non-uniform cubes inward to 0.4225.
    // Dedicated translate mode matches that same inward radius.
    arrowLength: 0.3575,
    arrowHeadLength: 0.13,
    arrowHeadRadius: 0.039,
    axisLineRadius: 0.0040625,
    planeOffset: 0.195,
    planeSize: 0.1001,
    ringRadius: 0.4875,
    ringTube: 0.0078,
    screenRingRadius: 0.6175,
    gripSize: 0.065,
    scaleHandleDistance: 0.65,
    scaleHandleDistanceNonUniform: 0.4225,
    pickerScale: 2.5,
    labelSize: 0.117,
    originGhostRadius: 0.039,
  },
  snapping: {
    temporaryTranslationSnap: 1,
    temporaryRotationSnapDeg: 15,
    temporaryScaleSnap: 0.25,
  },
  showSectorLabel: false,
  showScaleLabel: false,
  showScaleModifiers: false,
  showOriginDistanceLabel: false,
  renderOrder: 999,
}

export function mergeTheme(base: GizmoTheme, partial?: PartialTheme): GizmoTheme {
  return {
    colors: { ...base.colors, ...partial?.colors },
    opacity: { ...base.opacity, ...partial?.opacity },
    sizes: { ...base.sizes, ...partial?.sizes },
    snapping: { ...base.snapping, ...partial?.snapping },
    showSectorLabel: partial?.showSectorLabel ?? base.showSectorLabel,
    showScaleLabel: partial?.showScaleLabel ?? base.showScaleLabel,
    showScaleModifiers: partial?.showScaleModifiers ?? base.showScaleModifiers,
    showOriginDistanceLabel: partial?.showOriginDistanceLabel ?? base.showOriginDistanceLabel,
    renderOrder: partial?.renderOrder ?? base.renderOrder,
  }
}
