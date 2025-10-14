import { TransformPixelsOptions, MappedProp } from './types'
import { htmlTagBaseFontSize, bypassScalerTransformationClassName, browserFontSizeDiffVarName } from './constants'

function getPxToRemValue(value: number) {
  return (value / htmlTagBaseFontSize).toFixed(4).replace(/[.,]0+$/, "")
}

export default (shouldTransformPixels: boolean, options: TransformPixelsOptions, css: CSSStyleRule) => {
  const selector = css.selectorText
  if (!selector) return ''
  const isExcludedSelector = options.excludeSelectors.some(i => selector.includes(i))
  const transformations = new Map()
  // @ts-ignore
  Array.from(css.styleMap).forEach((prop: [string, Iterable<CSSStyleValue>]) => {
    const propName = prop[0]
    const cssUnitValueArr = prop[1]
    if (cssUnitValueArr && Array.isArray(cssUnitValueArr) && cssUnitValueArr[0] instanceof CSSUnitValue) {
      const cssUnitValue = cssUnitValueArr[0]
      const isPixelUnit = cssUnitValue.unit === 'px'
      const isExcludedAttr = options.excludeAttributes.some(i => propName.includes(i))
      if (propName === 'font-size') {
        const fontSizeValue = isPixelUnit
          ? `${getPxToRemValue(cssUnitValue.value)}rem`
          : `${cssUnitValue.value}${cssUnitValue.unit}`
        transformations.set(propName, `calc(${fontSizeValue} + var(${browserFontSizeDiffVarName}))`)
      } else if (shouldTransformPixels && isPixelUnit && !isExcludedSelector && !isExcludedAttr) {
        transformations.set(propName, `${getPxToRemValue(cssUnitValue.value)}rem`)
      }
    }
  })
  if (transformations.size) {
    let transformedCss = `${selector}:not(${bypassScalerTransformationClassName}) {\n`
    transformations.forEach((value, key) => {
      transformedCss += `${key}: ${value};\n`
    })
    transformedCss += '}'
    return transformedCss
  }
  return ''
}