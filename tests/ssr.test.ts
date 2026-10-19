/**
 * @jest-environment node
 */
import scaleUI, { getUiScalerSsrScript } from '../src/index'

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

describe('getUiScalerSsrScript', () => {
  it('returns the script string without touching window or document', () => {
    const script = getUiScalerSsrScript()
    expect(typeof script).toBe('string')
    expect(script).toContain('window.__uiScaler')
  })

  it('includes the css transformations next to the html font-size watcher', () => {
    const script = getUiScalerSsrScript()
    expect(script).toContain('data-ui-scaler-transformations')
    expect(script).toContain('function transformCss(rule)')
  })

  it('embeds the provided options', () => {
    const script = getUiScalerSsrScript({ baseFontSize: 20, enableLandscapeScaling: false, enablePortraitScaling: true })
    expect(script).toContain('const configured = 20')
    expect(script).toContain('const enableLandscapeScaling = false')
    expect(script).toContain('const enablePortraitScaling = true')
  })

  it('uses the defaults when no options are provided', () => {
    const script = getUiScalerSsrScript()
    expect(script).toContain('const configured = 16')
    expect(script).toContain('const enableLandscapeScaling = true')
    expect(script).toContain('const enablePortraitScaling = true')
  })

  it('does not transform pixels', () => {
    expect(getUiScalerSsrScript()).toContain('const shouldTransformPixels = false')
  })

  it('produces a script that is valid JavaScript', () => {
    expect(() => new Function(getUiScalerSsrScript())).not.toThrow()
  })

  it('can run on the server without throwing, doing nothing', () => {
    expect(() => new Function(getUiScalerSsrScript())()).not.toThrow()
  })
})
