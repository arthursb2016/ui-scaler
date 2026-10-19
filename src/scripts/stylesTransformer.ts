import { TransformPixelsOptions } from '../types'
import { htmlTagBaseFontSize, bypassScalerTransformationClassName, browserFontSizeDiffVarName } from '../constants'

// Returns a script (as a string) that:
// - transforms the font-size styles to calc the browser font-size difference
// - optionally transforms other pixel-based styles to rems
// - does the same for the <style> elements added afterwards
// It is injected as a <script> by the default usage of the package, and rendered inline by the SSR helper
export default (shouldTransformPixels: boolean, options: TransformPixelsOptions) => {
  // "<" is escaped so the options can never close the <script> tag when rendered inline in HTML
  const serializedOptions = JSON.stringify(options).replace(/</g, '\\u003c')

  return String.raw`
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const shouldTransformPixels = ${shouldTransformPixels}
      const options = ${serializedOptions}

      function getPxToRemValue(value) {
        return (value / ${htmlTagBaseFontSize}).toFixed(4).replace(/[.,]0+$/, '')
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
          transformations.set('font-size', 'calc(' + fontSizeValue + ' + var(${browserFontSizeDiffVarName}))')
        }

        Array.from(rule.styleMap).forEach(function(prop) {
          const propName = prop[0]
          if (propName === 'font-size') return

          const cssUnitValueArr = prop[1]
          if (cssUnitValueArr && Array.isArray(cssUnitValueArr) && cssUnitValueArr[0] instanceof CSSUnitValue) {
            const cssUnitValue = cssUnitValueArr[0]
            const isPixelUnit = cssUnitValue.unit === 'px'
            const isExcludedAttr = options.excludeAttributes.some(function(i) { return propName.includes(i) })
            if (shouldTransformPixels && isPixelUnit && !isExcludedSelector && !isExcludedAttr) {
              transformations.set(propName, getPxToRemValue(cssUnitValue.value) + 'rem')
            }
          }
        })

        if (!transformations.size) return ''
        let transformedCss = selector + ':not(.${bypassScalerTransformationClassName}) {'
        transformations.forEach(function(value, key) {
          transformedCss += key + ': ' + value + ';'
        })
        return transformedCss + '}'
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
              if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'style' && node.sheet) {
                let transformations = ''
                collectStyleRules(node.sheet.cssRules).forEach(function(rule) {
                  transformations += transformCss(rule)
                })
                if (transformations) node.textContent = (node.textContent || '') + transformations
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
  `
}
