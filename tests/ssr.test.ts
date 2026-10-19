/**
 * @jest-environment node
 */
import scaleUI from '../src/index'

describe('scaleUI in a non-browser environment (SSR)', () => {
  it('has no window or document', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
  })

  it('does not throw', () => {
    expect(() => scaleUI()).not.toThrow()
    expect(() => scaleUI({ transformPixels: true, baseFontSize: 14 })).not.toThrow()
  })
})
