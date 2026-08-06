import scaleUI, { collectStyleRules, mergeUiScalerOptions } from '../src/index'
import transformCss from '../src/transformCss'
import scalerScript from '../src/script'
import { uiScalerOptionsDefault } from '../src/options'

jest.mock('../src/transformCss')
jest.mock('../src/script')

const mockedTransformCss = transformCss as jest.Mock
const mockedScalerScript = scalerScript as jest.Mock

function addStylesheet(css: string) {
  const styleEl = document.createElement('style')
  styleEl.textContent = css
  document.head.appendChild(styleEl)
  return styleEl.sheet as CSSStyleSheet
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.documentElement.removeAttribute('data-ui-scaler-options')
  mockedTransformCss.mockReset().mockReturnValue('')
  mockedScalerScript.mockReset().mockReturnValue('/* mock script */')
})

describe('mergeUiScalerOptions()', () => {
  test('returns the defaults when no overrides are provided', () => {
    const result = mergeUiScalerOptions(uiScalerOptionsDefault)
    expect(result).toEqual(uiScalerOptionsDefault)
  })

  test('overrides individual fields while keeping the rest as default', () => {
    const result = mergeUiScalerOptions(uiScalerOptionsDefault, { baseFontSize: 20 })
    expect(result).toEqual({ ...uiScalerOptionsDefault, baseFontSize: 20 })
  })

  test('overrides multiple fields at once', () => {
    const result = mergeUiScalerOptions(uiScalerOptionsDefault, {
      transformPixels: true,
      enablePortraitScaling: false
    })
    expect(result).toEqual({
      ...uiScalerOptionsDefault,
      transformPixels: true,
      enablePortraitScaling: false
    })
  })

  test('respects explicit falsy overrides instead of falling back to defaults', () => {
    const result = mergeUiScalerOptions(uiScalerOptionsDefault, {
      enableLandscapeScaling: false,
      baseFontSize: 0
    })
    expect(result.enableLandscapeScaling).toBe(false)
    expect(result.baseFontSize).toBe(0)
  })
})

describe('collectStyleRules()', () => {
  test('collects top-level CSSStyleRule instances', () => {
    const sheet = addStylesheet('.a { color: red; } .b { color: blue; }')
    const rules = collectStyleRules(sheet.cssRules)
    expect(rules.map(r => r.selectorText)).toEqual(['.a', '.b'])
    expect(rules.every(r => r instanceof CSSStyleRule)).toBe(true)
  })

  test('recurses into @layer blocks', () => {
    const sheet = addStylesheet('@layer utilities { .text-sm { font-size: 1px; } }')
    const rules = collectStyleRules(sheet.cssRules)
    expect(rules.map(r => r.selectorText)).toEqual(['.text-sm'])
  })

  test('recurses into @media blocks', () => {
    const sheet = addStylesheet('@media (min-width: 100px) { .foo { color: red; } }')
    const rules = collectStyleRules(sheet.cssRules)
    expect(rules.map(r => r.selectorText)).toEqual(['.foo'])
  })

  test('recurses through multiple nested grouping rules', () => {
    const sheet = addStylesheet('@layer utilities { @media (min-width: 100px) { .bar { color: green; } } }')
    const rules = collectStyleRules(sheet.cssRules)
    expect(rules.map(r => r.selectorText)).toEqual(['.bar'])
  })

  test('collects a mix of top-level and nested rules', () => {
    const sheet = addStylesheet('.a { color: red; } @layer utilities { .b { color: blue; } }')
    const rules = collectStyleRules(sheet.cssRules)
    expect(rules.map(r => r.selectorText)).toEqual(['.a', '.b'])
  })
})

describe('scaleUI() (default export)', () => {
  test('appends the font-size watcher script tag with default options', () => {
    scaleUI()
    const scriptEl = document.head.querySelector('script[data-ui-scaler-html-font-size-watcher]')
    expect(scriptEl).not.toBeNull()
    expect(scriptEl?.textContent).toBe('/* mock script */')
    expect(mockedScalerScript).toHaveBeenCalledWith(16, true, true)
  })

  test('passes custom baseFontSize and scaling flags through to the generated script', () => {
    scaleUI({ baseFontSize: 20, enablePortraitScaling: false })
    expect(mockedScalerScript).toHaveBeenCalledWith(20, true, false)
  })

  test('reads runtime options from the data-ui-scaler-options html attribute', () => {
    document.documentElement.setAttribute('data-ui-scaler-options', JSON.stringify({
      baseFontSize: 24,
      enablePortraitScaling: false
    }))
    scaleUI({ transformPixels: 'runtime' })
    expect(mockedScalerScript).toHaveBeenCalledWith(24, true, false)
  })

  test('ignores the html attribute when not in runtime mode', () => {
    document.documentElement.setAttribute('data-ui-scaler-options', JSON.stringify({ baseFontSize: 24 }))
    scaleUI({ baseFontSize: 18 })
    expect(mockedScalerScript).toHaveBeenCalledWith(18, true, true)
  })

  test('defaults transformPixels to true in runtime mode unless overridden', () => {
    jest.useFakeTimers()
    addStylesheet('.a { color: red; }')
    scaleUI({ transformPixels: 'runtime' })
    jest.runAllTimers()
    expect(mockedTransformCss).toHaveBeenCalledWith(true, expect.anything(), expect.anything())
    jest.useRealTimers()
  })

  test('disables pixel transformation in runtime mode when explicitly set to false via the html attribute', () => {
    jest.useFakeTimers()
    addStylesheet('.a { color: red; }')
    document.documentElement.setAttribute('data-ui-scaler-options', JSON.stringify({ transformPixels: false }))
    scaleUI({ transformPixels: 'runtime' })
    jest.runAllTimers()
    expect(mockedTransformCss).toHaveBeenCalledWith(false, expect.anything(), expect.anything())
    jest.useRealTimers()
  })

  test('waits for DOMContentLoaded before running when the document is still loading', () => {
    const readyStateSpy = jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    scaleUI()
    expect(document.head.querySelector('script[data-ui-scaler-html-font-size-watcher]')).toBeNull()

    readyStateSpy.mockRestore()
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(document.head.querySelector('script[data-ui-scaler-html-font-size-watcher]')).not.toBeNull()
  })
})
