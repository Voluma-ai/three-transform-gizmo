import type { GizmoTheme } from '../theme'
import { TextLabel } from './TextLabel'

/**
 * Camera-facing text sprite showing the swept rotation angle in degrees
 * (e.g. "45°") inside the angle sector during a rotate drag.
 */
export class AngleLabel extends TextLabel {
  constructor(theme: GizmoTheme) {
    super({
      color: theme.colors.sectorLabel,
      size: theme.sizes.sectorLabelSize,
      renderOrder: theme.renderOrder + 1,
    })
  }
}
