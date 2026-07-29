import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial } from 'three'
import type { GizmoTheme } from '../theme'

const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 96
const FONT = 'bold 56px system-ui, -apple-system, "Segoe UI", sans-serif'

/**
 * Camera-facing text sprite showing the swept rotation angle in degrees
 * (e.g. "45°") inside the angle sector during a rotate drag. Text is drawn to
 * a canvas texture, redrawn only when it changes. In environments without a
 * 2D canvas (e.g. Node tests) the sprite stays blank and every call is a no-op.
 */
export class AngleLabel extends Sprite {
  private ctx: CanvasRenderingContext2D | null = null
  private texture: CanvasTexture | null = null
  private fillStyle: string
  private lastText = ''

  constructor(theme: GizmoTheme) {
    super(
      new SpriteMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    )
    this.fillStyle = `#${theme.colors.sectorLabel.toString(16).padStart(6, '0')}`
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = CANVAS_WIDTH
      canvas.height = CANVAS_HEIGHT
      const ctx = canvas.getContext('2d')
      if (ctx) {
        this.ctx = ctx
        this.texture = new CanvasTexture(canvas)
        this.texture.minFilter = LinearFilter
        this.material.map = this.texture
      }
    }
    const h = theme.sizes.sectorLabelSize
    this.scale.set((CANVAS_WIDTH / CANVAS_HEIGHT) * h, h, 1)
    this.renderOrder = theme.renderOrder + 1
  }

  setText(text: string): void {
    const ctx = this.ctx
    if (!ctx || text === this.lastText) return
    this.lastText = text
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.font = FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // dark outline keeps the text readable over the translucent sector fill
    ctx.lineWidth = 8
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.strokeText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
    ctx.fillStyle = this.fillStyle
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
    this.texture!.needsUpdate = true
  }

  dispose(): void {
    this.texture?.dispose()
    this.material.dispose()
  }
}
