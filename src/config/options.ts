import { TransformPixelsOptions, UiScalerOptions } from './types'
import { htmlTagBaseFontSize } from './constants'

export const transformPixelsDefault: TransformPixelsOptions = {
  excludeAttributes: [],
  excludeSelectors: []
}

export const uiScalerOptionsDefault: Required<UiScalerOptions> = {
  transformPixels: false,
  baseFontSize: htmlTagBaseFontSize,
  enableLandscapeScaling: true,
  enablePortraitScaling: true
}