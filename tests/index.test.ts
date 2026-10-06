import scaleUI, { collectStyleRules, mergeUiScalerOptions, resolveConfig } from '../src/index'
import transformCss from '../src/transformCss'
import scalerScript from '../src/script'
import { uiScalerOptionsDefault, transformPixelsDefault } from '../src/options'
import { UiScalerOptions } from '../src/types'

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

describe('resolveConfig()', () => {
  const resolve = (options?: UiScalerOptions) =>
    resolveConfig(mergeUiScalerOptions(uiScalerOptionsDefault, options))

  const setRuntimeAttribute = (value: string) =>
    document.documentElement.setAttribute('data-ui-scaler-options', value)

  describe('static options (non-runtime mode)', () => {
    test('returns the default configuration when no options are provided', () => {
      const config = resolve()
      expect(config.shouldTransformPixels).toBe(false)
      expect(config.baseFontSize).toBe(uiScalerOptionsDefault.baseFontSize)
      expect(config.enableLandscapeScaling).toBe(uiScalerOptionsDefault.enableLandscapeScaling)
      expect(config.enablePortraitScaling).toBe(uiScalerOptionsDefault.enablePortraitScaling)
      expect(config.transformPixelsOptions).toBe(transformPixelsDefault)
    })

    test('passes custom baseFontSize and scaling flags through', () => {
      const config = resolve({ baseFontSize: 20, enableLandscapeScaling: false, enablePortraitScaling: false })
      expect(config.baseFontSize).toBe(20)
      expect(config.enableLandscapeScaling).toBe(false)
      expect(config.enablePortraitScaling).toBe(false)
    })

    test('enables pixel transformation with the default options when transformPixels is true', () => {
      const config = resolve({ transformPixels: true })
      expect(config.shouldTransformPixels).toBe(true)
      expect(config.transformPixelsOptions).toBe(transformPixelsDefault)
    })

    test('enables pixel transformation and merges custom options when transformPixels is an object', () => {
      const config = resolve({ transformPixels: { excludeAttributes: ['border-radius'] } })
      expect(config.shouldTransformPixels).toBe(true)
      expect(config.transformPixelsOptions).toEqual(
        expect.objectContaining({ excludeAttributes: ['border-radius'] })
      )
    })

    test('keeps default values for custom options that are not overridden', () => {
      const config = resolve({ transformPixels: { excludeAttributes: ['border-radius'] } })
      expect(config.transformPixelsOptions.excludeSelectors).toEqual(transformPixelsDefault.excludeSelectors)
    })

    test('returns a new options object instead of the shared defaults when custom options are given', () => {
      const config = resolve({ transformPixels: { excludeAttributes: ['border-radius'] } })
      expect(config.transformPixelsOptions).not.toBe(transformPixelsDefault)
    })

    test('does not mutate the shared default options', () => {
      const snapshot = JSON.parse(JSON.stringify(transformPixelsDefault))
      resolve({ transformPixels: { excludeAttributes: ['border-radius'], excludeSelectors: ['#custom'] } })
      expect(transformPixelsDefault).toEqual(snapshot)
    })

    test('does not leak custom options into later calls', () => {
      resolve({ transformPixels: { excludeAttributes: ['border-radius'], excludeSelectors: ['#custom'] } })
      const later = resolve({ transformPixels: true })
      expect(later.transformPixelsOptions).toBe(transformPixelsDefault)
      expect(later.transformPixelsOptions.excludeSelectors).not.toContain('#custom')
    })

    test('ignores the html attribute when not in runtime mode', () => {
      setRuntimeAttribute(JSON.stringify({ baseFontSize: 24, transformPixels: true }))
      const config = resolve({ baseFontSize: 18 })
      expect(config.baseFontSize).toBe(18)
      expect(config.shouldTransformPixels).toBe(false)
    })
  })

  describe('runtime mode', () => {
    test('uses the runtime defaults (transformPixels enabled) when the attribute is absent', () => {
      const config = resolve({ transformPixels: 'runtime' })
      expect(config.shouldTransformPixels).toBe(true)
      expect(config.baseFontSize).toBe(uiScalerOptionsDefault.baseFontSize)
      expect(config.transformPixelsOptions).toBe(transformPixelsDefault)
    })

    test('applies options from the html attribute', () => {
      setRuntimeAttribute(JSON.stringify({
        baseFontSize: 24,
        enableLandscapeScaling: false,
        enablePortraitScaling: false
      }))
      const config = resolve({ transformPixels: 'runtime' })
      expect(config.baseFontSize).toBe(24)
      expect(config.enableLandscapeScaling).toBe(false)
      expect(config.enablePortraitScaling).toBe(false)
      expect(config.shouldTransformPixels).toBe(true)
    })

    test('disables pixel transformation when the attribute sets transformPixels to false', () => {
      setRuntimeAttribute(JSON.stringify({ transformPixels: false }))
      const config = resolve({ transformPixels: 'runtime' })
      expect(config.shouldTransformPixels).toBe(false)
    })

    test('merges custom transform options coming from the html attribute', () => {
      setRuntimeAttribute(JSON.stringify({ transformPixels: { excludeAttributes: ['border-radius'] } }))
      const config = resolve({ transformPixels: 'runtime' })
      expect(config.shouldTransformPixels).toBe(true)
      expect(config.transformPixelsOptions).toEqual(
        expect.objectContaining({ excludeAttributes: ['border-radius'] })
      )
      expect(config.transformPixelsOptions).not.toBe(transformPixelsDefault)
    })

    test('falls back to the runtime defaults when the attribute is not valid JSON', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      setRuntimeAttribute('{ not valid json')
      const config = resolve({ transformPixels: 'runtime' })
      expect(config.shouldTransformPixels).toBe(true)
      expect(config.baseFontSize).toBe(uiScalerOptionsDefault.baseFontSize)
      warnSpy.mockRestore()
    })

    test('takes its settings from the attribute, not from options passed in code', () => {
      const config = resolve({ transformPixels: 'runtime', baseFontSize: 20 })
      expect(config.baseFontSize).toBe(uiScalerOptionsDefault.baseFontSize)
    })
  })

  describe('invalid attribute warning', () => {
    let warnSpy: jest.SpyInstance

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    test('warns once, including the received value, when the attribute is not valid JSON', () => {
      setRuntimeAttribute("{'baseFontSize': 20}")
      resolve({ transformPixels: 'runtime' })
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('data-ui-scaler-options'),
        "{'baseFontSize': 20}"
      )
    })

    test('warns for a whitespace-only attribute', () => {
      setRuntimeAttribute('   ')
      resolve({ transformPixels: 'runtime' })
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    test('does not warn when the attribute is valid JSON', () => {
      setRuntimeAttribute(JSON.stringify({ baseFontSize: 24 }))
      resolve({ transformPixels: 'runtime' })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    test('does not warn when the attribute is absent', () => {
      resolve({ transformPixels: 'runtime' })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    test('does not warn when the attribute is empty', () => {
      setRuntimeAttribute('')
      resolve({ transformPixels: 'runtime' })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    test('does not warn outside runtime mode, where the attribute is ignored', () => {
      setRuntimeAttribute('{ not valid json')
      resolve({ baseFontSize: 18 })
      expect(warnSpy).not.toHaveBeenCalled()
    })
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

  test('injects the font-size watcher immediately while the document is still loading', () => {
    const readyStateSpy = jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    scaleUI()
    readyStateSpy.mockRestore()

    expect(document.head.querySelector('script[data-ui-scaler-html-font-size-watcher]')).not.toBeNull()
  })

  test('waits for DOMContentLoaded before transforming styles while the document is still loading', () => {
    jest.useFakeTimers()
    const readyStateSpy = jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    const addListenerSpy = jest.spyOn(document, 'addEventListener')
    scaleUI()

    // Read the calls BEFORE restoring: mockRestore() also clears mock.calls
    const onReady = addListenerSpy.mock.calls.find(([type]) => type === 'DOMContentLoaded')?.[1] as EventListener
    readyStateSpy.mockRestore()
    addListenerSpy.mockRestore()

    expect(onReady).toBeDefined()

    jest.runAllTimers()
    expect(document.head.querySelector('style[data-ui-scaler-transformations]')).toBeNull()

    // Invoke the handler registered by THIS call, rather than dispatching a real event:
    // a listener left on document by another test could otherwise satisfy the assertion below
    onReady(new Event('DOMContentLoaded'))
    jest.runAllTimers()
    expect(document.head.querySelector('style[data-ui-scaler-transformations]')).not.toBeNull()

    jest.useRealTimers()
  })
})