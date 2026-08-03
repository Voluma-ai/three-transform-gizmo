/**
 * Minimal DOM/pointer stand-ins so the gizmo's interaction pipeline can be
 * driven headlessly in vitest (node environment, no jsdom needed).
 */

export interface FakeElement {
  listeners: Map<string, ((e: unknown) => void)[]>
  captured: Set<number>
  style: { touchAction: string }
  ownerDocument?: {
    addEventListener: FakeElement['addEventListener']
    removeEventListener: FakeElement['removeEventListener']
  }
  addEventListener(type: string, fn: (e: unknown) => void): void
  removeEventListener(type: string, fn: (e: unknown) => void): void
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
  setPointerCapture(id: number): void
  releasePointerCapture(id: number): void
  hasPointerCapture(id: number): boolean
  dispatch(type: string, event: Record<string, unknown>): void
  listenerCount(): number
}

export const WIDTH = 800
export const HEIGHT = 600

export function createFakeElement(): FakeElement {
  const listeners = new Map<string, ((e: unknown) => void)[]>()
  const captured = new Set<number>()
  const style = { touchAction: '' }
  const el: FakeElement = {
    listeners,
    captured,
    style,
    addEventListener(type, fn) {
      const arr = listeners.get(type) ?? []
      arr.push(fn)
      listeners.set(type, arr)
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type)
      if (!arr) return
      const i = arr.indexOf(fn)
      if (i >= 0) arr.splice(i, 1)
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }),
    setPointerCapture(id) {
      captured.add(id)
    },
    releasePointerCapture(id) {
      captured.delete(id)
    },
    hasPointerCapture(id) {
      return captured.has(id)
    },
    dispatch(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event)
    },
    listenerCount() {
      let n = 0
      for (const arr of listeners.values()) n += arr.length
      return n
    },
  }
  el.ownerDocument = {
    addEventListener: el.addEventListener.bind(el),
    removeEventListener: el.removeEventListener.bind(el),
  }
  return el
}

export interface PointerOpts {
  pointerId?: number
  button?: number
  altKey?: boolean
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  isPrimary?: boolean
}

export function pointerEvent(clientX: number, clientY: number, opts: PointerOpts = {}): Record<string, unknown> {
  return {
    clientX,
    clientY,
    pointerId: opts.pointerId ?? 1,
    button: opts.button ?? 0,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    isPrimary: opts.isPrimary ?? true,
  }
}
