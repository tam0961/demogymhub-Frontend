import { describe, expect, it } from 'vitest'
import { MAX_BASE64_CHARS, encodeUnderLimit, squareCrop, validateFile, validateSize } from '../lib/photo'

describe('photo validation', () => {
  it('rejects non-images and files over 8 MB', () => {
    expect(validateFile({ type: 'application/pdf', size: 100 })).toContain('không phải là ảnh')
    expect(validateFile({ type: 'image/png', size: 8 * 1024 * 1024 + 1 })).toContain('8 MB')
    expect(validateFile({ type: 'image/png', size: 8 * 1024 * 1024 })).toBeNull()
  })
  it('rejects images under 200px on the short side', () => {
    expect(validateSize(199, 900)).toContain('200px')
    expect(validateSize(900, 150)).toContain('200px')
    expect(validateSize(200, 200)).toBeNull()
  })
  it('center-crops to a square', () => {
    expect(squareCrop(1000, 600)).toEqual({ sx: 200, sy: 0, s: 600 })
    expect(squareCrop(500, 801)).toEqual({ sx: 0, sy: 150, s: 500 })
  })
  it('lowers quality until the base64 fits under 180 KB', () => {
    const tried: number[] = []
    const r = encodeUnderLimit((q) => { tried.push(q); return 'data:image/jpeg;base64,' + 'A'.repeat(q > 0.6 ? MAX_BASE64_CHARS + 10 : 1000) })
    expect(tried[0]).toBe(0.82)
    expect(r?.quality).toBeLessThanOrEqual(0.6)
    expect(tried.length).toBeGreaterThan(1)
  })
  it('gives up when nothing fits', () => {
    expect(encodeUnderLimit(() => 'data:image/jpeg;base64,' + 'A'.repeat(MAX_BASE64_CHARS + 1))).toBeNull()
  })
})
