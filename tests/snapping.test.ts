import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { snapAngle, snapScale, twistAngleAroundAxis } from '../src/core/Snapping'

const DEG15 = Math.PI / 12

describe('snapAngle', () => {
  it('passes through with null snap', () => {
    expect(snapAngle(0.1234, null)).toBe(0.1234)
  })
  it('snaps to 15 degree steps', () => {
    expect(snapAngle(0.9 * DEG15, DEG15)).toBeCloseTo(DEG15)
    expect(snapAngle(1.4 * DEG15, DEG15)).toBeCloseTo(DEG15)
    expect(snapAngle(1.6 * DEG15, DEG15)).toBeCloseTo(2 * DEG15)
  })
  it('handles negatives', () => {
    expect(snapAngle(-1.6 * DEG15, DEG15)).toBeCloseTo(-2 * DEG15)
  })
})

describe('snapScale', () => {
  it('quantizes to the snap grid', () => {
    expect(snapScale(1.3, 0.5)).toBeCloseTo(1.5)
    expect(snapScale(2.1, 1)).toBeCloseTo(2)
    expect(snapScale(1.234, null)).toBeCloseTo(1.234)
  })
  it('clamps magnitude away from zero', () => {
    expect(snapScale(0.1, 0.5)).toBeCloseTo(1e-4) // would round to 0
    expect(snapScale(0, null)).toBeCloseTo(1e-4)
  })
  it('preserves sign for mirrored scales', () => {
    expect(snapScale(-1.5, null)).toBeCloseTo(-1.5)
    expect(snapScale(-1.3, 0.5)).toBeCloseTo(-1.5)
    expect(snapScale(-2, null)).toBeCloseTo(-2)
    expect(snapScale(-0.00001, null)).toBeCloseTo(-1e-4)
  })
})

describe('twistAngleAroundAxis', () => {
  const y = new Vector3(0, 1, 0)

  it('extracts a pure Y twist', () => {
    const q = new Quaternion().setFromAxisAngle(y, (2.241 * Math.PI) / 180)
    expect((twistAngleAroundAxis(q, y)! * 180) / Math.PI).toBeCloseTo(2.241, 5)
  })

  it('returns null for a degenerate 180° swing', () => {
    // 180° about X: vector part is orthogonal to Y with w≈0 → twist collapses.
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
    expect(twistAngleAroundAxis(q, y)).toBeNull()
  })
})
