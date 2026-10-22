// @ts-nocheck
// - transforms the font-size styles to calc the browser font-size difference
// - optionally transforms other pixel-based styles to rems
// - does the same for the <style> elements added afterwards
// The transformations are applied through a constructable stylesheet (adoptedStyleSheets), which, unlike a <style> element,
// is not blocked by a Content-Security-Policy without 'unsafe-inline'. A <style> element is the fallback for older browsers.
// This function must be self-contained (no references outside of itself): it runs directly in the bundle, and its
// compiled source is also embedded in the string returned by getUiScalerSsrScript (see scripts/generate-runtime-sources.js)
export function runStylesTransformer(params) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.__uiScalerStyles) return
  window.__uiScalerStyles = true

  const shouldTransformPixels = params.shouldTransformPixels
  const options = params.options

  function getPxToRemValue(value) {
    return (value / params.htmlTagBaseFontSize).toFixed(4).replace(/[.,]0+$/, '')
  }

  // Collects the CSSStyleRule objects of a CSSRuleList, including those nested within grouping rules (e.g., @media, @supports, @layer, etc.)
  function collectStyleRules(cssRules) {
    const styleRules = []
    Array.from(cssRules).forEach(function(rule) {
      if (rule instanceof CSSStyleRule) {
        styleRules.push(rule)
      } else if ('cssRules' in rule) {
        // Recurse into grouping rules such as @layer, @media, @supports, @container, etc.,
        // since TailwindCSS wraps its utility classes (e.g. font-size) inside @layer blocks
        Array.prototype.push.apply(styleRules, collectStyleRules(rule.cssRules))
      }
    })
    return styleRules
  }

  // Wraps a transformed rule in the grouping rules (@media, @layer, @supports, etc.) the original rule was declared in,
  function wrapInParentRules(rule, css) {
    let parent = rule.parentRule
    while (parent) {
      const cssText = parent.cssText || ''
      const bodyStart = cssText.indexOf('{')
      const header = bodyStart > 0 ? cssText.slice(0, bodyStart).trim() : ''
      if (header) css = header + ' {' + css + '}'
      parent = parent.parentRule
    }
    return css
  }

  function transformCss(rule) {
    const selector = rule.selectorText
    if (!selector) return ''
    const isExcludedSelector = options.excludeSelectors.some(function(i) { return selector.includes(i) })
    const transformations = new Map()

    // Read the specified font-size directly from the legacy CSSOM API, since properties
    // referencing custom properties (e.g. var(--text-sm), as set by TailwindCSS) are not
    // reliably represented as a CSSUnitValue in the Typed OM styleMap below.
    const fontSizeRawValue = ((rule.style && rule.style.getPropertyValue('font-size')) || '').trim()
    if (fontSizeRawValue) {
      const pixelMatch = fontSizeRawValue.match(/^(-?[\d.]+)px$/)
      const fontSizeValue = pixelMatch ? getPxToRemValue(parseFloat(pixelMatch[1])) + 'rem' : fontSizeRawValue
      transformations.set('font-size', 'calc(' + fontSizeValue + ' + var(' + params.browserFontSizeDiffVarName + '))')
    }

    if (shouldTransformPixels && rule.styleMap) {
      Array.from(rule.styleMap).forEach(function(prop) {
        const propName = prop[0]
        if (propName === 'font-size') return

        const cssUnitValueArr = prop[1]
        if (cssUnitValueArr && Array.isArray(cssUnitValueArr) && cssUnitValueArr[0] instanceof CSSUnitValue) {
          const cssUnitValue = cssUnitValueArr[0]
          const isPixelUnit = cssUnitValue.unit === 'px'
          const isExcludedAttr = options.excludeAttributes.some(function(i) { return propName.includes(i) })
          if (isPixelUnit && !isExcludedSelector && !isExcludedAttr) {
            transformations.set(propName, getPxToRemValue(cssUnitValue.value) + 'rem')
          }
        }
      })
    }

    if (!transformations.size) return ''
    let transformedCss = selector + ':not(.' + params.bypassClassName + ') {'
    transformations.forEach(function(value, key) {
      transformedCss += key + ': ' + value + ';'
    })
    return wrapInParentRules(rule, transformedCss + '}')
  }

  const supportsAdoptedStyleSheets =
    typeof CSSStyleSheet === 'function' &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function' &&
    'adoptedStyleSheets' in document

  let adoptedSheet = null
  let adoptedCss = ''

  // Adds css to the constructable stylesheet shared by all transformations. Returns false when it could not be done
  function adoptTransformations(css) {
    if (!supportsAdoptedStyleSheets) return false
    if (!css) return true
    try {
      if (!adoptedSheet) {
        adoptedSheet = new CSSStyleSheet()
        document.adoptedStyleSheets = Array.from(document.adoptedStyleSheets).concat(adoptedSheet)
      }
      adoptedSheet.replaceSync(adoptedCss + css)
      adoptedCss += css
      return true
    } catch (error) {
      return false
    }
  }

  // Transforms the styles that already exist in the document
  function transformExistingStyles() {
    let transformations = ''
    Array.from(document.styleSheets).forEach(function(styleSheet) {
      try {
        collectStyleRules(styleSheet.cssRules).forEach(function(rule) {
          transformations += transformCss(rule)
        })
      } catch (error) {
        console.warn('ui-scaler: Could not access a stylesheet rule. This might or might not affect your page responsiveness', error, styleSheet)
      }
    })
    if (adoptTransformations(transformations)) return
    const style = document.createElement('style')
    style.setAttribute('type', 'text/css')
    style.setAttribute('data-ui-scaler-transformations', 'true')
    style.textContent = transformations
    document.head.appendChild(style)
  }

  // Observes the document head for newly added <style> elements to perform the same transformations
  function observeNewlyAddedStyles() {
    const cssObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type !== 'childList') return
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType !== Node.ELEMENT_NODE) return
          if (node.hasAttribute('data-ui-scaler-transformations')) return
          if (node.tagName.toLowerCase() === 'style' && node.sheet) {
            let transformations = ''
            collectStyleRules(node.sheet.cssRules).forEach(function(rule) {
              transformations += transformCss(rule)
            })
            if (transformations && !adoptTransformations(transformations)) {
              node.textContent = (node.textContent || '') + transformations
            }
          }
        })
      })
    })
    cssObserver.observe(document.head, { childList: true, subtree: true })
  }

  function transformStyles() {
    setTimeout(function() {
      transformExistingStyles()
      observeNewlyAddedStyles()
    })
  }

  if (document.readyState !== 'loading') {
    transformStyles()
  } else {
    document.addEventListener('DOMContentLoaded', transformStyles)
  }
}
