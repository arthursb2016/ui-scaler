import { fontSizeHandlerSource } from '../generated/runtimeSsrSources'
import { getfontSizeHandlerParams, toScript } from '../config/params'

// Returns the html font-size watcher as a script string. Only used by the SSR helper:
// scaleUI() runs the same code directly (src/runtime/fontSizeHandler.ts)
export default (configBaseFontSize: number, enableLandscapeScaling: boolean, enablePortraitScaling: boolean) =>
  toScript(fontSizeHandlerSource, getfontSizeHandlerParams(configBaseFontSize, enableLandscapeScaling, enablePortraitScaling))
