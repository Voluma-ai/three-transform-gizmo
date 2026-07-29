import { describe, expect, it } from 'vitest'
import { Plane, Quaternion, Ray, Vector3 } from 'three'
import { getDragPlane, intersectPlane } from '../src/core/DragPlane'

const origin = new Vector3()
const identity = new Quaternion()

describe('getDragPlane', () => {
  it('single-axis translate: normal perpendicular to the axis, facing the eye', () => {
    const eye = new Vector3(0.3, 0.4, 1).normalize()
    const plane = new Plane()
    getDragPlane('translate', 'X', 'world', identity, origin, eye, plane)
    expect(Math.abs(plane.normal.dot(new Vector3(1, 0, 0)))).toBeLessThan(1e-10)
    expect(plane.normal.dot(eye)).toBeGreaterThan(0.5)
  })

  it('plane handle XY: normal is Z', () => {
    const plane = new Plane()
    getDragPlane('translate', 'XY', 'world', identity, origin, new Vector3(0, 0, 1), plane)
    expect(Math.abs(plane.normal.z)).toBeCloseTo(1)
  })

  it('scale plane handle uses local axes even in world space', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    const plane = new Plane()
    getDragPlane('scale', '+XY', 'world', q, origin, new Vector3(0, 0, 1), plane)
    // local Z rotated 90deg around Y points along world -X... check perpendicular to local X and Y dirs
    const localZ = new Vector3(0, 0, 1).applyQuaternion(q)
    expect(Math.abs(plane.normal.dot(localZ))).toBeCloseTo(1)
  })

  it('rotate: plane perpendicular to rotation axis', () => {
    const plane = new Plane()
    getDragPlane('rotate', 'Y', 'world', identity, origin, new Vector3(0, 0, 1), plane)
    expect(Math.abs(plane.normal.y)).toBeCloseTo(1)
  })

  it('screen ring E: plane faces the eye', () => {
    const eye = new Vector3(1, 2, 3).normalize()
    const plane = new Plane()
    getDragPlane('rotate', 'E', 'world', identity, origin, eye, plane)
    expect(plane.normal.dot(eye)).toBeCloseTo(1)
  })
})

describe('intersectPlane', () => {
  it('intersects and returns the hit point', () => {
    const plane = new Plane(new Vector3(0, 0, 1), 0)
    const ray = new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1))
    const out = new Vector3()
    expect(intersectPlane(ray, plane, out)).not.toBeNull()
    expect(out.z).toBeCloseTo(0)
  })
  it('returns null when near-parallel', () => {
    const plane = new Plane(new Vector3(0, 0, 1), 0)
    const ray = new Ray(new Vector3(0, 0, 5), new Vector3(1, 0, 1e-9).normalize())
    expect(intersectPlane(ray, plane, new Vector3())).toBeNull()
  })
})
