import { isValidJsonString } from './utils'
import { UiScalerOptions, ResolvedConfig } from './types'
import { transformPixelsDefault, uiScalerOptionsDefault } from './options'

import scalerScript from './scripts/fontSizeWatcher'
import transformCssScript from './scripts/stylesTransformer'

const runtimeOptionsDefault: Required<UiScalerOptions> = { ...uiScalerOptionsDefault, transformPixels: true }

// Merges the default options with the user-provided options, giving precedence to the user-provided values
export function mergeUiScalerOptions(defaults: Required<UiScalerOptions>, overrides?: UiScalerOptions): Required<UiScalerOptions> {
  return {
    transformPixels: overrides?.transformPixels ?? defaults.transformPixels,
    baseFontSize: overrides?.baseFontSize ?? defaults.baseFontSize,
    enableLandscapeScaling: overrides?.enableLandscapeScaling ?? defaults.enableLandscapeScaling,
    enablePortraitScaling: overrides?.enablePortraitScaling ?? defaults.enablePortraitScaling
  }
}

// Resolves the final configuration by merging the default options, user-provided options, and any runtime options specified in the HTML attribute
export function resolveConfig(mergedOptions: Required<UiScalerOptions>): ResolvedConfig {
  const htmlElem = document.querySelector('html')
  const uiScalerOptionsAttr = htmlElem?.getAttribute('data-ui-scaler-options')
  const isRuntimeMode = mergedOptions.transformPixels === 'runtime'

  let runtimeOptions: UiScalerOptions = {}
  if (isRuntimeMode && uiScalerOptionsAttr) {
    if (isValidJsonString(uiScalerOptionsAttr)) {
      runtimeOptions = JSON.parse(uiScalerOptionsAttr) as UiScalerOptions
    } else {
      console.warn(
        'ui-scaler: the data-ui-scaler-options attribute is not valid JSON, so the default options will be used. Keys and strings need double quotes. Received:',
        uiScalerOptionsAttr
      )
    }
  }

  const {
    transformPixels,
    baseFontSize,
    enableLandscapeScaling,
    enablePortraitScaling
  } = isRuntimeMode ? mergeUiScalerOptions(runtimeOptionsDefault, runtimeOptions) : mergedOptions

  const hasCustomOptions = typeof transformPixels === 'object'
  const shouldTransformPixels = hasCustomOptions || transformPixels === true

  const transformPixelsOptions = hasCustomOptions
    ? Object.assign({}, transformPixelsDefault, transformPixels)
    : transformPixelsDefault

  return { shouldTransformPixels, transformPixelsOptions, baseFontSize, enableLandscapeScaling, enablePortraitScaling }
}

// Appends an inline script tag to the document
function injectScript(attributeName: string, script: string) {
  const scriptTag = document.createElement('script')
  scriptTag.setAttribute(attributeName, 'true')
  scriptTag.textContent = script
  const parent = document.head || document.documentElement
  parent.appendChild(scriptTag)
}

// Injects the html font-size watcher script
function injectFontSizeWatcher(config: ResolvedConfig) {
  injectScript('data-ui-scaler-html-font-size-watcher', scalerScript(config.baseFontSize, config.enableLandscapeScaling, config.enablePortraitScaling))
}

// Injects the css transformations script (existing and newly added styles)
function injectCssTransformations(config: ResolvedConfig) {
  injectScript('data-ui-scaler-css-transformations', transformCssScript(config.shouldTransformPixels, config.transformPixelsOptions))
}

// SSR helper: returns the whole ui-scaler setup as a script string, to be rendered inline in the server <head>
export function getSsrScript(options?: Pick<UiScalerOptions, 'baseFontSize' | 'enableLandscapeScaling' | 'enablePortraitScaling'>): string {
  const { baseFontSize, enableLandscapeScaling, enablePortraitScaling } = mergeUiScalerOptions(uiScalerOptionsDefault, options)
  const fontSizeWatcher = scalerScript(baseFontSize, enableLandscapeScaling, enablePortraitScaling)
  const cssTransformations = transformCssScript(false, transformPixelsDefault)
  return `${fontSizeWatcher}\n;${cssTransformations}`
}

// Library entry point. Initializes UI scaling with provided options
export default function(options?: UiScalerOptions) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const mergedOptions = mergeUiScalerOptions(uiScalerOptionsDefault, options)
  const config = resolveConfig(mergedOptions)

  injectFontSizeWatcher(config)
  injectCssTransformations(config)
}