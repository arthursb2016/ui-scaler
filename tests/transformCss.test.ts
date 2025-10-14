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

describe('transformCss()', () => {
  test('transforms a CSS rule correctly', () => {
    const mockRule = {
      selectorText: '.mt-4',
      styleMap: new Map([['margin-top', [16, 'px'] as unknown as CSSUnitValue]])
    }
    const transformation = transformCss(true, transformPixelsDefault, mockRule as unknown as CSSStyleRule)
    // TODO: continue the test logic
    expect(transformation).toBe('')
  })
})