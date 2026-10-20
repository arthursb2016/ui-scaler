import scaleUI, { mergeUiScalerOptions, resolveConfig } from '../src/index'
import { runStylesTransformer } from '../src/runtime/stylesTransformer'
import { runFontSizeWatcher } from '../src/runtime/fontSizeWatcher'
import { bypassScalerTransformationClassName, browserFontSizeDiffVarName, htmlTagBaseFontSize } from '../src/config/constants'
import { uiScalerOptionsDefault, transformPixelsDefault } from '../src/config/options'
import { UiScalerOptions } from '../src/config/types'

jest.mock('../src/runtime/stylesTransformer')
jest.mock('../src/runtime/fontSizeWatcher')

const mockedStylesTransformer = runStylesTransformer as jest.Mock
const mockedFontSizeWatcher = runFontSizeWatcher as jest.Mock

const watcherParams = (baseFontSize: number, enableLandscapeScaling: boolean, enablePortraitScaling: boolean) => ({
  htmlTagBaseFontSize, baseFontSize, enableLandscapeScaling, enablePortraitScaling, browserFontSizeDiffVarName
})

beforeEach(() => {
  document.head.innerHTML = ''
  document.documentElement.removeAttribute('data-ui-scaler-options')
  mockedStylesTransformer.mockReset()
  mockedFontSizeWatcher.mockReset()
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
  test('runs the font-size watcher directly with default options', () => {
    scaleUI()
    expect(mockedFontSizeWatcher).toHaveBeenCalledTimes(1)
    expect(mockedFontSizeWatcher).toHaveBeenCalledWith(watcherParams(16, true, true))
  })

  test('does not inject any script or style element, so a CSP does not need to allow them', () => {
    scaleUI()
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('style')).toBeNull()
  })

  test('passes custom baseFontSize and scaling flags through to the font-size watcher', () => {
    scaleUI({ baseFontSize: 20, enablePortraitScaling: false })
    expect(mockedFontSizeWatcher).toHaveBeenCalledWith(watcherParams(20, true, false))
  })

  test('reads runtime options from the data-ui-scaler-options html attribute', () => {
    document.documentElement.setAttribute('data-ui-scaler-options', JSON.stringify({
      baseFontSize: 24,
      enablePortraitScaling: false
    }))
    scaleUI({ transformPixels: 'runtime' })
    expect(mockedFontSizeWatcher).toHaveBeenCalledWith(watcherParams(24, true, false))
  })

  test('ignores the html attribute when not in runtime mode', () => {
    document.documentElement.setAttribute('data-ui-scaler-options', JSON.stringify({ baseFontSize: 24 }))
    scaleUI({ baseFontSize: 18 })
    expect(mockedFontSizeWatcher).toHaveBeenCalledWith(watcherParams(18, true, true))
  })

  test('runs the css transformer directly with the resolved options', () => {
    scaleUI()
    expect(mockedStylesTransformer).toHaveBeenCalledTimes(1)
    expect(mockedStylesTransformer).toHaveBeenCalledWith({
      shouldTransformPixels: false,
      options: transformPixelsDefault,
      htmlTagBaseFontSize,
      bypassClassName: bypassScalerTransformationClassName,
      browserFontSizeDiffVarName
    })
  })

  test('passes custom pixel transformation options through to the css transformer', () => {
    scaleUI({ transformPixels: { excludeAttributes: ['border-radius'] } })
    expect(mockedStylesTransformer).toHaveBeenCalledWith(expect.objectContaining({
      shouldTransformPixels: true,
      options: expect.objectContaining({ excludeAttributes: ['border-radius'] })
    }))
  })

  test('defaults transformPixels to true in runtime mode unless overridden', () => {
    scaleUI({ transformPixels: 'runtime' })
    expect(mockedStylesTransformer).toHaveBeenCalledWith(expect.objectContaining({ shouldTransformPixels: true }))
  })

  test('disables pixel transformation in runtime mode when explicitly set to false via the html attribute', () => {
    document.documentElement.setAttribute('data-ui-scaler-options', JSON.stringify({ transformPixels: false }))
    scaleUI({ transformPixels: 'runtime' })
    expect(mockedStylesTransformer).toHaveBeenCalledWith(expect.objectContaining({ shouldTransformPixels: false }))
  })

  test('runs both while the document is still loading, since they wait for it by themselves', () => {
    const readyStateSpy = jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    scaleUI()
    readyStateSpy.mockRestore()

    expect(mockedFontSizeWatcher).toHaveBeenCalledTimes(1)
    expect(mockedStylesTransformer).toHaveBeenCalledTimes(1)
  })
})