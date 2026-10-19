/**
 * @jest-environment node
 */
import scaleUI, { getSsrScript } from '../src/index'

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

describe('getSsrScript', () => {
  it('returns the script string without touching window or document', () => {
    const script = getSsrScript()
    expect(typeof script).toBe('string')
    expect(script).toContain('window.__uiScaler')
  })

  it('includes the css transformations next to the html font-size watcher', () => {
    const script = getSsrScript()
    expect(script).toContain('data-ui-scaler-transformations')
    expect(script).toContain('function transformCss(rule)')
  })

  it('embeds the provided options', () => {
    const script = getSsrScript({ baseFontSize: 20, enableLandscapeScaling: false, enablePortraitScaling: true })
    expect(script).toContain('const configured = 20')
    expect(script).toContain('const enableLandscapeScaling = false')
    expect(script).toContain('const enablePortraitScaling = true')
  })

  it('uses the defaults when no options are provided', () => {
    const script = getSsrScript()
    expect(script).toContain('const configured = 16')
    expect(script).toContain('const enableLandscapeScaling = true')
    expect(script).toContain('const enablePortraitScaling = true')
  })

  it('does not transform pixels', () => {
    expect(getSsrScript()).toContain('const shouldTransformPixels = false')
  })

  it('produces a script that is valid JavaScript', () => {
    expect(() => new Function(getSsrScript())).not.toThrow()
  })

  it('can run on the server without throwing, doing nothing', () => {
    expect(() => new Function(getSsrScript())()).not.toThrow()
  })
})
