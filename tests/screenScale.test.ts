import { describe, expect, it } from 'vitest'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { screenScaleFactor } from '../src/core/ScreenScale'

describe('screenScaleFactor', () => {
  it('grows with distance for perspective cameras', () => {
    const cam = new PerspectiveCamera(50, 1, 0.1, 100)
    cam.position.set(0, 0, 5)
    const near = screenScaleFactor(cam, new Vector3(0, 0, 0))
    cam.position.set(0, 0, 10)
    const far = screenScaleFactor(cam, new Vector3(0, 0, 0))
    expect(far).toBeCloseTo(near * 2)
  })

  it('is independent of target position for orthographic cameras, scales with zoom', () => {
    const cam = new OrthographicCamera(-2, 2, 2, -2, 0.1, 100)
    const a = screenScaleFactor(cam, new Vector3(0, 0, 0))
    const b = screenScaleFactor(cam, new Vector3(5, 5, -20))
    expect(a).toBeCloseTo(b)
    cam.zoom = 2
    expect(screenScaleFactor(cam, new Vector3())).toBeCloseTo(a / 2)
  })
})
