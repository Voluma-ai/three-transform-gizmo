import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { snapAngle, snapScale, snapTranslate } from '../src/core/Snapping'

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

describe('snapTranslate', () => {
  it('snaps per component in world space', () => {
    const v = snapTranslate(new Vector3(0.9, 1.4, -0.6), 1, undefined)
    expect(v.toArray()).toEqual([1, 1, -1])
  })
  it('snaps in a rotated local frame', () => {
    // frame rotated 90deg around Z: local X = world Y
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
    const v = snapTranslate(new Vector3(0, 0.9, 0), 1, q)
    // 0.9 along world Y is 0.9 along local X -> snaps to 1 local X -> world Y
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(1)
    expect(v.z).toBeCloseTo(0)
  })
})

describe('snapScale', () => {
  it('quantizes and clamps', () => {
    expect(snapScale(1.3, 0.5)).toBeCloseTo(1.5)
    expect(snapScale(-2, null)).toBeCloseTo(1e-4)
    expect(snapScale(0.1, 0.5)).toBeCloseTo(1e-4) // rounds to 0 -> clamped
  })
})
