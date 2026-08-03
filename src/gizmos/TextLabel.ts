import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial } from 'three'

const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 96
const FONT = 'bold 56px system-ui, -apple-system, "Segoe UI", sans-serif'

export interface TextLabelOptions {
  color: number
  /** Label height in gizmo units (scaled with the parent via `setSize`). */
  size: number
  renderOrder: number
}

/**
 * Camera-facing text sprite. Text is drawn to a canvas texture and redrawn
 * only when it changes. In environments without a 2D canvas (e.g. Node tests)
 * the sprite stays blank and every call is a no-op.
 */
export class TextLabel extends Sprite {
  private ctx: CanvasRenderingContext2D | null = null
  private texture: CanvasTexture | null = null
  private fillStyle: string
  private lastText = ''

  constructor(opts: TextLabelOptions) {
    super(
      new SpriteMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    )
    this.fillStyle = `#${opts.color.toString(16).padStart(6, '0')}`
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = CANVAS_WIDTH
      canvas.height = CANVAS_HEIGHT
      const ctx = canvas.getContext('2d')
      if (ctx) {
        this.ctx = ctx
        this.texture = new CanvasTexture(canvas)
        // Upload without the flip pixel-store and draw pre-flipped instead (see
        // setText). Splat renderers (e.g. Spark) call gl.pixelStorei(UNPACK_FLIP_Y)
        // directly on the shared context, desyncing three's cached pixel-store
        // state; a flipY upload then gets silently skipped and the text renders
        // upside down. A flip-free upload is correct regardless of that state.
        this.texture.flipY = false
        this.texture.minFilter = LinearFilter
        this.material.map = this.texture
      }
    }
    const h = opts.size
    this.scale.set((CANVAS_WIDTH / CANVAS_HEIGHT) * h, h, 1)
    this.renderOrder = opts.renderOrder
  }

  setText(text: string): void {
    const ctx = this.ctx
    if (!ctx || text === this.lastText) return
    this.lastText = text
    this.redraw()
  }

  /** Change fill color; redraws the current text if any. */
  setColor(color: number): void {
    const next = `#${color.toString(16).padStart(6, '0')}`
    if (next === this.fillStyle) return
    this.fillStyle = next
    if (this.lastText) this.redraw(true)
  }

  private redraw(force = false): void {
    const ctx = this.ctx
    if (!ctx) return
    const text = this.lastText
    if (!text && !force) return
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    if (!text) {
      this.texture!.needsUpdate = true
      return
    }
    ctx.save()
    // draw mirrored vertically to match the flip-free upload (flipY = false)
    ctx.translate(0, CANVAS_HEIGHT)
    ctx.scale(1, -1)
    ctx.font = FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // dark outline keeps the text readable over busy backgrounds
    ctx.lineWidth = 8
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.strokeText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
    ctx.fillStyle = this.fillStyle
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
    ctx.restore()
    this.texture!.needsUpdate = true
  }

  dispose(): void {
    this.texture?.dispose()
    this.material.dispose()
  }
}
