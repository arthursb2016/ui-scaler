/**
 * @jest-environment node
 */
import scaleUI, { getScalerScript } from '../src/index'

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

describe('getScalerScript', () => {
  it('returns the script string without touching window or document', () => {
    const script = getScalerScript()
    expect(typeof script).toBe('string')
    expect(script).toContain('window.__uiScaler')
  })

  it('embeds the provided options', () => {
    const script = getScalerScript({ baseFontSize: 20, enableLandscapeScaling: false, enablePortraitScaling: true })
    expect(script).toContain('const configured = 20')
    expect(script).toContain('const enableLandscapeScaling = false')
    expect(script).toContain('const enablePortraitScaling = true')
  })

  it('uses the defaults when no options are provided', () => {
    const script = getScalerScript()
    expect(script).toContain('const configured = 16')
    expect(script).toContain('const enableLandscapeScaling = true')
    expect(script).toContain('const enablePortraitScaling = true')
  })

  it('produces a script that is valid JavaScript', () => {
    expect(() => new Function(getScalerScript())).not.toThrow()
  })
})
