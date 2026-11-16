import { isValidJsonString } from '../utils'
import { UiScalerOptions, ResolvedConfig } from '../config/types'
import { transformPixelsDefault, uiScalerOptionsDefault } from '../config/options'

import { runfontSizeHandler } from '../runtime/fontSizeHandler'
import { runStylesTransformer } from '../runtime/stylesTransformer'
import { getfontSizeHandlerParams, getStylesTransformerParams } from '../config/params'

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

// Library entry point. Initializes UI scaling with provided options
export default function(options?: UiScalerOptions) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const mergedOptions = mergeUiScalerOptions(uiScalerOptionsDefault, options)
  const config = resolveConfig(mergedOptions)

  // Both run directly, with no injected <script> or <style>, so a Content-Security-Policy does not need to allow them
  runfontSizeHandler(getfontSizeHandlerParams(config.baseFontSize, config.enableLandscapeScaling, config.enablePortraitScaling))
  runStylesTransformer(getStylesTransformerParams(config.shouldTransformPixels, config.transformPixelsOptions))
}