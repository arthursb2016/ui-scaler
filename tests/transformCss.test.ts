import transformCss from '../src/transformCss'
import { transformPixelsDefault } from '../src/options'
import { bypassScalerTransformationClassName, browserFontSizeDiffVarName } from '../src/constants'

class MockCSSUnitValue {
  value: number;
  unit: string;
  constructor(value: number, unit: string) {
    this.value = value;
    this.unit = unit;
  }

  toString() {
    return `${this.value}${this.unit}`;
  }

  // You can add more methods/properties as needed
}

(global as any).CSSUnitValue = MockCSSUnitValue

type MockRuleOptions = {
  selectorText?: string,
  styleMap?: Map<string, unknown>,
  rawStyles?: Record<string, string>
}

function createMockRule({ selectorText = '.mock', styleMap = new Map(), rawStyles = {} }: MockRuleOptions = {}) {
  return {
    selectorText,
    styleMap,
    style: {
      getPropertyValue: (propName: string) => rawStyles[propName] ?? ''
    }
  } as unknown as CSSStyleRule
}

function unitEntry(value: number, unit: string) {
  return [new MockCSSUnitValue(value, unit)] as unknown as CSSUnitValue
}

describe('transformCss()', () => {
  test('returns an empty string when the rule has no selectorText', () => {
    const mockRule = createMockRule({ selectorText: '' })
    const transformation = transformCss(true, transformPixelsDefault, mockRule)
    expect(transformation).toBe('')
  })

  test('returns an empty string when there is nothing to transform', () => {
    const mockRule = createMockRule({
      styleMap: new Map([['margin-top', unitEntry(1, 'rem')]])
    })
    const transformation = transformCss(false, transformPixelsDefault, mockRule)
    expect(transformation).toBe('')
  })

  test('transforms px properties to rem when shouldTransformPixels is true', () => {
    const mockRule = createMockRule({
      selectorText: '.mt-4',
      styleMap: new Map([['margin-top', unitEntry(16, 'px')]])
    })
    const transformation = transformCss(true, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.mt-4:not(${bypassScalerTransformationClassName}) {\nmargin-top: 1rem;\n}`)
  })

  test('does not transform px properties when shouldTransformPixels is false', () => {
    const mockRule = createMockRule({
      selectorText: '.mt-4',
      styleMap: new Map([['margin-top', unitEntry(16, 'px')]])
    })
    const transformation = transformCss(false, transformPixelsDefault, mockRule)
    expect(transformation).toBe('')
  })

  test('does not transform properties with a non-px unit', () => {
    const mockRule = createMockRule({
      selectorText: '.mt-4',
      styleMap: new Map([['margin-top', unitEntry(1, 'rem')]])
    })
    const transformation = transformCss(true, transformPixelsDefault, mockRule)
    expect(transformation).toBe('')
  })

  test('skips selectors listed in excludeSelectors', () => {
    const mockRule = createMockRule({
      selectorText: '#myCustomId',
      styleMap: new Map([['padding', unitEntry(8, 'px')]])
    })
    const options = { ...transformPixelsDefault, excludeSelectors: ['#myCustomId'] }
    const transformation = transformCss(true, options, mockRule)
    expect(transformation).toBe('')
  })

  test('skips attributes listed in excludeAttributes', () => {
    const mockRule = createMockRule({
      selectorText: '.p-2',
      styleMap: new Map([['padding', unitEntry(8, 'px')]])
    })
    const options = { ...transformPixelsDefault, excludeAttributes: ['padding'] }
    const transformation = transformCss(true, options, mockRule)
    expect(transformation).toBe('')
  })

  test('transforms multiple px properties in the same rule', () => {
    const mockRule = createMockRule({
      selectorText: '.p-4',
      styleMap: new Map([
        ['padding-top', unitEntry(16, 'px')],
        ['padding-bottom', unitEntry(32, 'px')]
      ])
    })
    const transformation = transformCss(true, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.p-4:not(${bypassScalerTransformationClassName}) {\npadding-top: 1rem;\npadding-bottom: 2rem;\n}`)
  })

  test('wraps a px font-size in calc() with the browser font-size diff variable', () => {
    const mockRule = createMockRule({
      selectorText: '.text-base',
      rawStyles: { 'font-size': '16px' }
    })
    const transformation = transformCss(false, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.text-base:not(${bypassScalerTransformationClassName}) {\nfont-size: calc(1rem + var(${browserFontSizeDiffVarName}));\n}`)
  })

  test('wraps a non-px font-size (e.g. rem) in calc() without converting its unit', () => {
    const mockRule = createMockRule({
      selectorText: '.text-base',
      rawStyles: { 'font-size': '1.5rem' }
    })
    const transformation = transformCss(false, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.text-base:not(${bypassScalerTransformationClassName}) {\nfont-size: calc(1.5rem + var(${browserFontSizeDiffVarName}));\n}`)
  })

  test('wraps a font-size referencing a CSS custom property (e.g. TailwindCSS var()) in calc()', () => {
    const mockRule = createMockRule({
      selectorText: '.text-sm',
      rawStyles: { 'font-size': 'var(--text-sm)' }
    })
    const transformation = transformCss(false, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.text-sm:not(${bypassScalerTransformationClassName}) {\nfont-size: calc(var(--text-sm) + var(${browserFontSizeDiffVarName}));\n}`)
  })

  test('applies font-size transformation regardless of shouldTransformPixels', () => {
    const mockRule = createMockRule({
      selectorText: '.text-base',
      rawStyles: { 'font-size': '16px' }
    })
    const transformation = transformCss(true, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.text-base:not(${bypassScalerTransformationClassName}) {\nfont-size: calc(1rem + var(${browserFontSizeDiffVarName}));\n}`)
  })

  test('combines font-size with other pixel transformations in the same rule', () => {
    const mockRule = createMockRule({
      selectorText: '.card',
      rawStyles: { 'font-size': '16px' },
      styleMap: new Map([['padding', unitEntry(16, 'px')]])
    })
    const transformation = transformCss(true, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.card:not(${bypassScalerTransformationClassName}) {\nfont-size: calc(1rem + var(${browserFontSizeDiffVarName}));\npadding: 1rem;\n}`)
  })

  test('does not throw and skips font-size handling when the rule has no style declaration', () => {
    const mockRule = {
      selectorText: '.p-2',
      styleMap: new Map([['padding', unitEntry(16, 'px')]])
    } as unknown as CSSStyleRule
    const transformation = transformCss(true, transformPixelsDefault, mockRule)
    expect(transformation).toBe(`.p-2:not(${bypassScalerTransformationClassName}) {\npadding: 1rem;\n}`)
  })
})