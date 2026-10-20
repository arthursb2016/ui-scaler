import { fontSizeWatcherSource } from '../generated/runtimeSsrSources'
import { getFontSizeWatcherParams, toScript } from '../config/params'

// Returns the html font-size watcher as a script string. Only used by the SSR helper:
// scaleUI() runs the same code directly (src/runtime/fontSizeWatcher.ts)
export default (configBaseFontSize: number, enableLandscapeScaling: boolean, enablePortraitScaling: boolean) =>
  toScript(fontSizeWatcherSource, getFontSizeWatcherParams(configBaseFontSize, enableLandscapeScaling, enablePortraitScaling))
