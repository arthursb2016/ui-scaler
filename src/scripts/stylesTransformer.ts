import { TransformPixelsOptions } from '../config/types'
import { stylesTransformerSource } from '../generated/runtimeSsrSources'
import { getStylesTransformerParams, toScript } from '../config/params'

// Returns the css transformer as a script string. Only used by the SSR helper:
// scaleUI() runs the same code directly (src/runtime/stylesTransformer.ts)
export default (shouldTransformPixels: boolean, options: TransformPixelsOptions) =>
  toScript(stylesTransformerSource, getStylesTransformerParams(shouldTransformPixels, options))
