import { isValidJsonString } from './utils'
import transformCss from './transformCss'
import { TransformPixelsOptions, UiScalerOptions } from './types'
import { transformPixelsDefault, uiScalerOptionsDefault } from './options'

import scalerScript from './script'

function collectStyleRules(cssRules: CSSRuleList): CSSStyleRule[] {
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


const runtimeOptionsDefault: Required<UiScalerOptions> = { ...uiScalerOptionsDefault, transformPixels: true }

function mergeUiScalerOptions(defaults: Required<UiScalerOptions>, overrides?: UiScalerOptions): Required<UiScalerOptions> {
  return {
    transformPixels: overrides?.transformPixels ?? defaults.transformPixels,
    baseFontSize: overrides?.baseFontSize ?? defaults.baseFontSize,
    enableLandscapeScaling: overrides?.enableLandscapeScaling ?? defaults.enableLandscapeScaling,
    enablePortraitScaling: overrides?.enablePortraitScaling ?? defaults.enablePortraitScaling
  }
}

export default function(options?: UiScalerOptions) {
  const mergedOptions = mergeUiScalerOptions(uiScalerOptionsDefault, options)

  function scaleUI() {
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
      ? Object.assign(transformPixelsDefault, { ...transformPixels })
      : transformPixelsDefault

    setTimeout(() => {
      transformExistingStyles(shouldTransformPixels, transformPixelsOptions)
      observeNewlyAddedStyles(shouldTransformPixels, transformPixelsOptions)
    })

    const script = scalerScript(baseFontSize, enableLandscapeScaling, enablePortraitScaling)
    const scriptTag = document.createElement('script')
    scriptTag.setAttribute('data-ui-scaler-html-font-size-watcher', 'true')
    scriptTag.textContent = script
    document.head.appendChild(scriptTag)
  }

  if (window.document.readyState !== 'loading') {
    scaleUI()
  } else {
    window.document.addEventListener('DOMContentLoaded', function() {
      scaleUI()
    })
  }
}