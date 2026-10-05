import { isValidJsonString } from './utils'
import transformCss from './transformCss'
import { TransformPixelsOptions, UiScalerOptions, ResolvedConfig } from './types'
import { transformPixelsDefault, uiScalerOptionsDefault } from './options'

import scalerScript from './script'

const runtimeOptionsDefault: Required<UiScalerOptions> = { ...uiScalerOptionsDefault, transformPixels: true }

// Parses the CSS rules from a CSSRuleList and returns an array of CSSStyleRule objects, including those nested within grouping rules (e.g., @media, @supports, @layer, etc.)
export function collectStyleRules(cssRules: CSSRuleList): CSSStyleRule[] {
  const styleRules: CSSStyleRule[] = []
  Array.from(cssRules).forEach((rule) => {
    if (rule instanceof CSSStyleRule) {
      styleRules.push(rule)
    } else if ('cssRules' in rule) {
      // Recurse into grouping rules such as @layer, @media, @supports, @container, etc.,
      // since TailwindCSS wraps its utility classes (e.g. font-size) inside @layer blocks
      styleRules.push(...collectStyleRules((rule as CSSGroupingRule).cssRules))
    }
  })
  return styleRules
}

// Transforms font-size styles to calc the browser font-size difference, plus optianlly transforms other pixel-based styles to rems, based on the provided options
function transformExistingStyles(shouldTransformPixels: boolean, options: TransformPixelsOptions) {
  let transformations = ''
  Array.from(document.styleSheets).forEach((styleSheet: CSSStyleSheet) => {
    try {
      const cssRules = styleSheet.cssRules
      collectStyleRules(cssRules).forEach((rule) => {
        const transformedRules = transformCss(shouldTransformPixels, options, rule)
        if (transformedRules) transformations += '\n' + transformedRules
      })
    } catch (error) {
      console.warn('ui-scaler: Could not access a stylesheet rule. This might or might not affect your page responsiveness', error, styleSheet)
    }
  })
  const style = document.createElement('style')
  style.setAttribute('type', 'text/css')
  style.setAttribute('data-ui-scaler-transformations', 'true')
  style.textContent = transformations.replace(/\n/g, '')
  document.head.appendChild(style)
}

// Observes the document head for newly added <style> elements to perform the same transformations as "transformExistingStyles"
function observeNewlyAddedStyles(shouldTransformPixels: boolean, options: TransformPixelsOptions) {
  const cssObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'style') {
            const styleEl = node as HTMLStyleElement
            if (styleEl.sheet) {
              let transformations = ''
              collectStyleRules(styleEl.sheet.cssRules).forEach((rule) => {
                const transformedRules = transformCss(shouldTransformPixels, options, rule)
                if (transformedRules) transformations += '\n' + transformedRules
              });
              if (transformations) {
                const css = styleEl.textContent ?? ''
                styleEl.textContent = css + transformations
              }
            }
          }
        })
      }
    }
  })
  cssObserver.observe(document.head, {
    childList: true,
    subtree: true,
  })
}

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
  if (isRuntimeMode && uiScalerOptionsAttr && isValidJsonString(uiScalerOptionsAttr)) {
    runtimeOptions = JSON.parse(uiScalerOptionsAttr) as UiScalerOptions
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
    ? Object.assign({}, transformPixelsDefault, transformPixels) // Hunk A
    : transformPixelsDefault

  return { shouldTransformPixels, transformPixelsOptions, baseFontSize, enableLandscapeScaling, enablePortraitScaling }
}

// Injects the html font-size watcher script
function injectFontSizeWatcher(config: ResolvedConfig) {
  const script = scalerScript(config.baseFontSize, config.enableLandscapeScaling, config.enablePortraitScaling)
  const scriptTag = document.createElement('script')
  scriptTag.setAttribute('data-ui-scaler-html-font-size-watcher', 'true')
  scriptTag.textContent = script
  const parent = document.head || document.documentElement
  parent.appendChild(scriptTag)
}

// Executes the style transformation scripts (existing and newly added styles)
function transformStyles(config: ResolvedConfig) {
  setTimeout(() => {
    transformExistingStyles(config.shouldTransformPixels, config.transformPixelsOptions)
    observeNewlyAddedStyles(config.shouldTransformPixels, config.transformPixelsOptions)
  })
}

// Library entry point. Initializes UI scaling with provided options
export default function(options?: UiScalerOptions) {
  const mergedOptions = mergeUiScalerOptions(uiScalerOptionsDefault, options)
  const config = resolveConfig(mergedOptions)

  injectFontSizeWatcher(config)

  if (window.document.readyState !== 'loading') {
    transformStyles(config)
  } else {
    window.document.addEventListener('DOMContentLoaded', function() {
      transformStyles(config)
    })
  }
}