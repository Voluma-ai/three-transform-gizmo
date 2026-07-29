import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { computeAnchoredScale, parseScaleHandle, type AnchoredScaleInput } from '../src/core/ExtrudeMath'
import type { AxisId } from '../src/types'

function baseInput(overrides: Partial<AnchoredScaleInput> = {}): AnchoredScaleInput {
  return {
    handle: '+X',
    offsetWorld: new Vector3(),
    worldQuaternionStart: new Quaternion(),
    scaleStart: new Vector3(1, 1, 1),
    worldScaleStart: new Vector3(1, 1, 1),
    positionStart: new Vector3(),
    parentQuaternionInv: new Quaternion(),
    parentScaleInv: new Vector3(1, 1, 1),
    localHalfExtents: new Vector3(0.5, 0.5, 0.5),
    localCenterOffset: new Vector3(),
    handleDistanceWorld: 1,
    centerAnchored: false,
    scaleSnap: null,
    ...overrides,
  }
}

/** world coordinate of a local point given local TRS + (identity) parent */
function localToWorld(p: Vector3, pos: Vector3, q: Quaternion, s: Vector3): Vector3 {
  const m = new Matrix4().compose(pos, q, s)
  return p.clone().applyMatrix4(m)
}

describe('parseScaleHandle', () => {
  it('parses signs and axes', () => {
    expect(parseScaleHandle('+X' as AxisId)).toEqual({ axes: ['x'], sign: 1 })
    expect(parseScaleHandle('-YZ' as AxisId)).toEqual({ axes: ['y', 'z'], sign: -1 })
    expect(parseScaleHandle('XYZ' as AxisId)).toEqual({ axes: ['x', 'y', 'z'], sign: 0 })
  })
})

describe('computeAnchoredScale', () => {
  it('+X drag grows scale.x and keeps the -X face fixed in world', () => {
    const input = baseInput({ offsetWorld: new Vector3(0.5, 0, 0) })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    expect(scale.y).toBeCloseTo(1)
    // anchored face: local point (-0.5, 0, 0)
    const before = localToWorld(new Vector3(-0.5, 0, 0), input.positionStart, new Quaternion(), input.scaleStart)
    const after = localToWorld(new Vector3(-0.5, 0, 0), position, new Quaternion(), scale)
    expect(after.distanceTo(before)).toBeLessThan(1e-10)
    expect(position.x).toBeCloseTo(0.25)
  })

  it('-X handle mirrors: position shifts -x, +X face fixed', () => {
    const input = baseInput({ handle: '-X' as AxisId, offsetWorld: new Vector3(-0.5, 0, 0) })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    const before = localToWorld(new Vector3(0.5, 0, 0), input.positionStart, new Quaternion(), input.scaleStart)
    const after = localToWorld(new Vector3(0.5, 0, 0), position, new Quaternion(), scale)
    expect(after.distanceTo(before)).toBeLessThan(1e-10)
    expect(position.x).toBeCloseTo(-0.25)
  })

  it('center-anchored (Alt): scale changes, position unchanged', () => {
    const input = baseInput({ offsetWorld: new Vector3(0.5, 0, 0), centerAnchored: true })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    expect(position.length()).toBeCloseTo(0)
  })

  it('proportional (Shift): one ratio on every axis, dragged face still pinned', () => {
    const input = baseInput({ offsetWorld: new Vector3(0.5, 0, 0), proportional: true })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    expect(scale.y).toBeCloseTo(1.5)
    expect(scale.z).toBeCloseTo(1.5)
    // the grabbed axis keeps its anchor; y/z simply grow about the origin
    const before = localToWorld(new Vector3(-0.5, 0, 0), input.positionStart, new Quaternion(), input.scaleStart)
    const after = localToWorld(new Vector3(-0.5, 0, 0), position, new Quaternion(), scale)
    expect(after.distanceTo(before)).toBeLessThan(1e-10)
    expect(position.y).toBeCloseTo(0)
    expect(position.z).toBeCloseTo(0)
  })

  it('proportional + center-anchored: grows every axis without moving', () => {
    const input = baseInput({ offsetWorld: new Vector3(0.5, 0, 0), proportional: true, centerAnchored: true })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    expect(scale.z).toBeCloseTo(1.5)
    expect(position.length()).toBeCloseTo(0)
  })

  it('proportional on a plane handle averages the dragged axes', () => {
    // +XY dragged purely along +x: x sees the full ratio, y sees none
    const input = baseInput({ handle: '+XY' as AxisId, offsetWorld: new Vector3(0.5, 0, 0), proportional: true })
    const { scale } = computeAnchoredScale(input)
    const expected = (1.5 + 1) / 2
    expect(scale.x).toBeCloseTo(expected)
    expect(scale.y).toBeCloseTo(expected)
    expect(scale.z).toBeCloseTo(expected)
  })

  it('proportional keeps mirrored axes mirrored', () => {
    const input = baseInput({
      offsetWorld: new Vector3(0.5, 0, 0),
      proportional: true,
      scaleStart: new Vector3(1, -2, 1),
      worldScaleStart: new Vector3(1, -2, 1),
    })
    const { scale } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    expect(scale.y).toBeCloseTo(-3)
  })

  it('rotated object: anchor invariant holds in world space', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4)
    // drag along the world direction of local +X
    const u = new Vector3(1, 0, 0).applyQuaternion(q)
    const input = baseInput({
      worldQuaternionStart: q,
      offsetWorld: u.clone().multiplyScalar(0.5),
      positionStart: new Vector3(2, 3, 4),
    })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    const before = localToWorld(new Vector3(-0.5, 0, 0), input.positionStart, q, input.scaleStart)
    const after = localToWorld(new Vector3(-0.5, 0, 0), position, q, scale)
    expect(after.distanceTo(before)).toBeLessThan(1e-9)
  })

  it('scaled parent: parentScaleInv/parentQuaternionInv are applied', () => {
    // parent scaled by 2 and rotated 90deg around Y; object axis-aligned within it
    const parentQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    const parentS = new Vector3(2, 2, 2)
    const parentM = new Matrix4().compose(new Vector3(0, 0, 0), parentQ, parentS)
    const objWorldQ = parentQ.clone() // object identity inside parent
    const input = baseInput({
      worldQuaternionStart: objWorldQ,
      worldScaleStart: new Vector3(2, 2, 2),
      parentQuaternionInv: parentQ.clone().invert(),
      parentScaleInv: new Vector3(0.5, 0.5, 0.5),
      // world dir of local +X, handle at world distance 1
      offsetWorld: new Vector3(1, 0, 0).applyQuaternion(objWorldQ).multiplyScalar(0.5),
    })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    // verify world anchor invariant with full parent composition
    const anchorLocal = new Vector3(-0.5, 0, 0)
    const mBefore = new Matrix4().compose(input.positionStart, new Quaternion(), input.scaleStart).premultiply(parentM)
    const mAfter = new Matrix4().compose(position, new Quaternion(), scale).premultiply(parentM)
    const before = anchorLocal.clone().applyMatrix4(mBefore)
    const after = anchorLocal.clone().applyMatrix4(mAfter)
    expect(after.distanceTo(before)).toBeLessThan(1e-9)
  })

  it('plane handle +XY: both axes scale, opposite corner fixed', () => {
    const input = baseInput({
      handle: '+XY' as AxisId,
      offsetWorld: new Vector3(0.5, 0.25, 0),
    })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    expect(scale.y).toBeCloseTo(1.25)
    const corner = new Vector3(-0.5, -0.5, 0)
    const before = localToWorld(corner, input.positionStart, new Quaternion(), input.scaleStart)
    const after = localToWorld(corner, position, new Quaternion(), scale)
    expect(after.distanceTo(before)).toBeLessThan(1e-10)
  })

  it('off-center geometry: anchor at the actual bbox face', () => {
    // bbox spans x in [0, 2] locally: center offset +1, half extent 1
    const input = baseInput({
      localHalfExtents: new Vector3(1, 0.5, 0.5),
      localCenterOffset: new Vector3(1, 0, 0),
      offsetWorld: new Vector3(1, 0, 0),
    })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(2)
    // anchored face: local x = 0 (bbox min). It must not move.
    const before = localToWorld(new Vector3(0, 0, 0), input.positionStart, new Quaternion(), input.scaleStart)
    const after = localToWorld(new Vector3(0, 0, 0), position, new Quaternion(), scale)
    expect(after.distanceTo(before)).toBeLessThan(1e-10)
  })

  it('scaleSnap quantizes the resulting scale', () => {
    const input = baseInput({ offsetWorld: new Vector3(0.3, 0, 0), scaleSnap: 0.5 })
    const { scale } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
  })

  it('clamps to epsilon instead of going negative', () => {
    const input = baseInput({ offsetWorld: new Vector3(-5, 0, 0) })
    const { scale } = computeAnchoredScale(input)
    expect(scale.x).toBeGreaterThan(0)
  })

  it('non-uniform start scale: anchor invariant still holds', () => {
    const scaleStart = new Vector3(2, 0.5, 3)
    const input = baseInput({
      scaleStart,
      worldScaleStart: scaleStart.clone(),
      offsetWorld: new Vector3(0.5, 0, 0),
    })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.y).toBeCloseTo(0.5) // untouched axes preserved
    expect(scale.z).toBeCloseTo(3)
    const before = localToWorld(new Vector3(-0.5, 0, 0), input.positionStart, new Quaternion(), scaleStart)
    const after = localToWorld(new Vector3(-0.5, 0, 0), position, new Quaternion(), scale)
    expect(after.distanceTo(before)).toBeLessThan(1e-10)
  })

  it('mirrored object keeps its negative scale and grows in magnitude', () => {
    const scaleStart = new Vector3(-1, 1, 1)
    const input = baseInput({
      scaleStart,
      worldScaleStart: new Vector3(-1, 1, 1),
      offsetWorld: new Vector3(0.5, 0, 0),
    })
    const { scale } = computeAnchoredScale(input)
    expect(scale.x).toBeLessThan(0)
    expect(Math.abs(scale.x)).toBeCloseTo(1.5)
  })

  it('zero start scale does not produce NaN', () => {
    const input = baseInput({
      scaleStart: new Vector3(0, 1, 1),
      worldScaleStart: new Vector3(0, 1, 1),
      offsetWorld: new Vector3(0.5, 0, 0),
    })
    const { scale, position } = computeAnchoredScale(input)
    expect(Number.isFinite(scale.x)).toBe(true)
    expect(Number.isFinite(position.x)).toBe(true)
  })

  it('uniform XYZ scales all axes, center anchored', () => {
    const input = baseInput({ handle: 'XYZ' as AxisId, offsetWorld: new Vector3(0.5, 0, 0) })
    const { scale, position } = computeAnchoredScale(input)
    expect(scale.x).toBeCloseTo(1.5)
    expect(scale.y).toBeCloseTo(1.5)
    expect(scale.z).toBeCloseTo(1.5)
    expect(position.length()).toBeCloseTo(0)
  })
})
