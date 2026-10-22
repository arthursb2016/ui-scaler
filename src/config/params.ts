import { TransformPixelsOptions } from './types'
import { htmlTagBaseFontSize, bypassScalerTransformationClassName, browserFontSizeDiffVarName } from './constants'

export type fontSizeHandlerParams = {
  htmlTagBaseFontSize: number
  baseFontSize: number
  enableLandscapeScaling: boolean
  enablePortraitScaling: boolean
  browserFontSizeDiffVarName: string
}

export type StylesTransformerParams = {
  shouldTransformPixels: boolean
  options: TransformPixelsOptions
  htmlTagBaseFontSize: number
  bypassClassName: string
  browserFontSizeDiffVarName: string
}

export function getfontSizeHandlerParams(baseFontSize: number, enableLandscapeScaling: boolean, enablePortraitScaling: boolean): fontSizeHandlerParams {
  return { htmlTagBaseFontSize, baseFontSize, enableLandscapeScaling, enablePortraitScaling, browserFontSizeDiffVarName }
}

export function getStylesTransformerParams(shouldTransformPixels: boolean, options: TransformPixelsOptions): StylesTransformerParams {
  return {
    shouldTransformPixels,
    options,
    htmlTagBaseFontSize,
    bypassClassName: bypassScalerTransformationClassName,
    browserFontSizeDiffVarName
  }
}

// Builds the script that calls a runtime function (given as source) with its params.
// "<" is escaped so the params can never close the <script> tag when rendered inline in HTML
export function toScript(functionSource: string, params: object): string {
  return `(${functionSource})(${JSON.stringify(params).replace(/</g, '\\u003c')})`
}
