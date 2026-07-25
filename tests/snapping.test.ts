import { describe, expect, it } from 'vitest'
import { snapAngle, snapScale } from '../src/core/Snapping'

const DEG15 = (15 * Math.PI) / 180

describe('snapAngle', () => {
  it('passes through with null snap', () => {
    expect(snapAngle(0.1234, null)).toBe(0.1234)
  })
  it('snaps to 15 degree steps', () => {
    expect(snapAngle(0.9 * DEG15, DEG15)).toBeCloseTo(DEG15)
    expect(snapAngle(1.4 * DEG15, DEG15)).toBeCloseTo(DEG15)
    expect(snapAngle(1.6 * DEG15, DEG15)).toBeCloseTo(2 * DEG15)
  })
  it('handles negative angles', () => {
    expect(snapAngle(-1.6 * DEG15, DEG15)).toBeCloseTo(-2 * DEG15)
  })
})

describe('snapScale', () => {
  it('quantizes to the snap grid', () => {
    expect(snapScale(1.3, 0.5)).toBeCloseTo(1.5)
    expect(snapScale(2.1, 1)).toBeCloseTo(2)
    expect(snapScale(1.234, null)).toBeCloseTo(1.234)
  })

  it('clamps the magnitude, never crossing zero', () => {
    expect(snapScale(0.1, 0.5)).toBeCloseTo(1e-4) // would round to 0
    expect(snapScale(0, null)).toBeCloseTo(1e-4)
  })

  it('preserves handedness of mirrored (negative) scales', () => {
    // a mirrored object must stay mirrored and must not collapse
    expect(snapScale(-1.5, null)).toBeCloseTo(-1.5)
    expect(snapScale(-1.3, 0.5)).toBeCloseTo(-1.5)
    expect(snapScale(-2, null)).toBeCloseTo(-2)
    expect(snapScale(-0.00001, null)).toBeCloseTo(-1e-4)
  })
})
