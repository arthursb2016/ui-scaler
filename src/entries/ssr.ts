import { UiScalerOptions } from '../config/types'
import { transformPixelsDefault, uiScalerOptionsDefault } from '../config/options'
import { mergeUiScalerOptions } from './client'

import scalerScript from '../scripts/fontSizeWatcher'
import transformCssScript from '../scripts/stylesTransformer'

// SSR helper: returns the whole ui-scaler setup as a script string, to be rendered inline in the server <head>
export function getUiScalerSsrScript(options?: Pick<UiScalerOptions, 'baseFontSize' | 'enableLandscapeScaling' | 'enablePortraitScaling'>): string {
  const { baseFontSize, enableLandscapeScaling, enablePortraitScaling } = mergeUiScalerOptions(uiScalerOptionsDefault, options)
  const fontSizeWatcher = scalerScript(baseFontSize, enableLandscapeScaling, enablePortraitScaling)
  const cssTransformations = transformCssScript(false, transformPixelsDefault)
  return `${fontSizeWatcher}\n;${cssTransformations}`
}
