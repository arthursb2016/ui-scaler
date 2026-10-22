import transformCssScript from '../src/scripts/stylesTransformer'
import { transformPixelsDefault } from '../src/config/options'
import { bypassScalerTransformationClassName, browserFontSizeDiffVarName } from '../src/config/constants'
import { TransformPixelsOptions } from '../src/config/types'

class MockCSSUnitValue {
  value: number
  unit: string
  constructor(value: number, unit: string) {
    this.value = value
    this.unit = unit
  }
}

(global as any).CSSUnitValue = MockCSSUnitValue

type MockRuleOptions = {
  selectorText?: string,
  styleMap?: Map<string, unknown>,
  rawStyles?: Record<string, string>
}

// A rule that passes the "instanceof CSSStyleRule" check, with the given selector, styleMap and legacy style declaration
function createMockRule({ selectorText = '.mock', styleMap = new Map(), rawStyles = {} }: MockRuleOptions = {}) {
  const rule = Object.create(CSSStyleRule.prototype)
  Object.defineProperty(rule, 'selectorText', { value: selectorText })
  Object.defineProperty(rule, 'styleMap', { value: styleMap })
  Object.defineProperty(rule, 'style', { value: { getPropertyValue: (propName: string) => rawStyles[propName] ?? '' } })
  return rule as CSSStyleRule
}

function unitEntry(value: number, unit: string) {
  return [new MockCSSUnitValue(value, unit)]
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function addStyle(css: string) {
  const styleEl = document.createElement('style')
  styleEl.textContent = css
  document.head.appendChild(styleEl)
  return styleEl
}

function mockStyleSheets(sheets: unknown[]) {
  Object.defineProperty(document, 'styleSheets', { configurable: true, get: () => sheets })
}

function getTransformations() {
  return document.head.querySelector('style[data-ui-scaler-transformations]')?.textContent
}

// Runs the script and waits for its setTimeout. Rules are given through a mocked document.styleSheets
async function run(shouldTransformPixels: boolean, rules?: CSSStyleRule[], options: TransformPixelsOptions = transformPixelsDefault) {
  if (rules) mockStyleSheets([{ cssRules: rules }])
  new Function(transformCssScript(shouldTransformPixels, options))()
  await tick()
}

const rule = (selector: string, body: string) =>
  `${selector}:not(.${bypassScalerTransformationClassName}) {${body}}`
const fontSizeRule = (selector: string, value: string) =>
  rule(selector, `font-size: calc(${value} + var(${browserFontSizeDiffVarName}));`)

// The script keeps a MutationObserver alive, so the ones created in a test are disconnected afterwards
const RealMutationObserver = window.MutationObserver
let observers: MutationObserver[] = []

beforeEach(() => {
  document.head.innerHTML = ''
  observers = []
  window.MutationObserver = class extends RealMutationObserver {
    constructor(callback: MutationCallback) {
      super(callback)
      observers.push(this)
    }
  }
  // jsdom has no Typed OM
  Object.defineProperty(CSSStyleRule.prototype, 'styleMap', { configurable: true, get: () => new Map() })
})

afterEach(() => {
  observers.forEach((observer) => observer.disconnect())
  window.MutationObserver = RealMutationObserver
  delete (window as any).__uiScalerStyles
  delete (document as any).styleSheets
  delete (CSSStyleRule.prototype as any).styleMap
  jest.restoreAllMocks()
})

describe('transformCssScript()', () => {
  test('returns a string that is valid JavaScript', () => {
    const script = transformCssScript(false, transformPixelsDefault)
    expect(typeof script).toBe('string')
    expect(() => new Function(script)).not.toThrow()
  })

  test('embeds the shouldTransformPixels flag', () => {
    expect(transformCssScript(true, transformPixelsDefault)).toContain('"shouldTransformPixels":true')
    expect(transformCssScript(false, transformPixelsDefault)).toContain('"shouldTransformPixels":false')
  })

  test('escapes the options so they cannot close the script tag', () => {
    const script = transformCssScript(true, { excludeAttributes: [], excludeSelectors: ['</script>'] })
    expect(script).not.toContain('</script>')
    expect(() => new Function(script)).not.toThrow()
  })
})

describe('transformations written by the script', () => {
  test('creates the transformations style, empty when there is nothing to transform', async () => {
    await run(false, [createMockRule({ styleMap: new Map([['margin-top', unitEntry(1, 'rem')]]) })])
    expect(getTransformations()).toBe('')
  })

  test('does nothing until the timeout fires', () => {
    new Function(transformCssScript(false, transformPixelsDefault))()
    expect(getTransformations()).toBeUndefined()
  })

  test('skips rules without selectorText', async () => {
    await run(true, [createMockRule({ selectorText: '', styleMap: new Map([['margin-top', unitEntry(16, 'px')]]) })])
    expect(getTransformations()).toBe('')
  })

  test('transforms px properties to rem when shouldTransformPixels is true', async () => {
    await run(true, [createMockRule({ selectorText: '.mt-4', styleMap: new Map([['margin-top', unitEntry(16, 'px')]]) })])
    expect(getTransformations()).toBe(rule('.mt-4', 'margin-top: 1rem;'))
  })

  test('does not transform px properties when shouldTransformPixels is false', async () => {
    await run(false, [createMockRule({ selectorText: '.mt-4', styleMap: new Map([['margin-top', unitEntry(16, 'px')]]) })])
    expect(getTransformations()).toBe('')
  })

  test('does not transform properties with a non-px unit', async () => {
    await run(true, [createMockRule({ selectorText: '.mt-4', styleMap: new Map([['margin-top', unitEntry(1, 'rem')]]) })])
    expect(getTransformations()).toBe('')
  })

  test('skips selectors listed in excludeSelectors', async () => {
    const options = { ...transformPixelsDefault, excludeSelectors: ['#myCustomId'] }
    await run(true, [createMockRule({ selectorText: '#myCustomId', styleMap: new Map([['padding', unitEntry(8, 'px')]]) })], options)
    expect(getTransformations()).toBe('')
  })

  test('skips attributes listed in excludeAttributes', async () => {
    const options = { ...transformPixelsDefault, excludeAttributes: ['padding'] }
    await run(true, [createMockRule({ selectorText: '.p-2', styleMap: new Map([['padding', unitEntry(8, 'px')]]) })], options)
    expect(getTransformations()).toBe('')
  })

  test('transforms multiple px properties in the same rule', async () => {
    await run(true, [createMockRule({
      selectorText: '.p-4',
      styleMap: new Map([['padding-top', unitEntry(16, 'px')], ['padding-bottom', unitEntry(32, 'px')]])
    })])
    expect(getTransformations()).toBe(rule('.p-4', 'padding-top: 1rem;padding-bottom: 2rem;'))
  })

  test('wraps a px font-size in calc() with the browser font-size diff variable', async () => {
    await run(false, [createMockRule({ selectorText: '.text-base', rawStyles: { 'font-size': '16px' } })])
    expect(getTransformations()).toBe(fontSizeRule('.text-base', '1rem'))
  })

  test('wraps a non-px font-size (e.g. rem) in calc() without converting its unit', async () => {
    await run(false, [createMockRule({ selectorText: '.text-base', rawStyles: { 'font-size': '1.5rem' } })])
    expect(getTransformations()).toBe(fontSizeRule('.text-base', '1.5rem'))
  })

  test('wraps a font-size referencing a CSS custom property (e.g. TailwindCSS var()) in calc()', async () => {
    await run(false, [createMockRule({ selectorText: '.text-sm', rawStyles: { 'font-size': 'var(--text-sm)' } })])
    expect(getTransformations()).toBe(fontSizeRule('.text-sm', 'var(--text-sm)'))
  })

  test('applies the font-size transformation regardless of shouldTransformPixels', async () => {
    await run(true, [createMockRule({ selectorText: '.text-base', rawStyles: { 'font-size': '16px' } })])
    expect(getTransformations()).toBe(fontSizeRule('.text-base', '1rem'))
  })

  test('combines font-size with other pixel transformations in the same rule', async () => {
    await run(true, [createMockRule({
      selectorText: '.card',
      rawStyles: { 'font-size': '16px' },
      styleMap: new Map([['padding', unitEntry(16, 'px')]])
    })])
    expect(getTransformations()).toBe(rule('.card', `font-size: calc(1rem + var(${browserFontSizeDiffVarName}));padding: 1rem;`))
  })

  test('does not throw and skips font-size handling when the rule has no style declaration', async () => {
    const ruleWithoutStyle = Object.create(CSSStyleRule.prototype)
    Object.defineProperty(ruleWithoutStyle, 'selectorText', { value: '.p-2' })
    Object.defineProperty(ruleWithoutStyle, 'styleMap', { value: new Map([['padding', unitEntry(16, 'px')]]) })
    Object.defineProperty(ruleWithoutStyle, 'style', { value: undefined })
    await run(true, [ruleWithoutStyle])
    expect(getTransformations()).toBe(rule('.p-2', 'padding: 1rem;'))
  })

  test('keeps the font-size transformation when the browser has no styleMap (e.g. Firefox, Safari)', async () => {
    const ruleWithoutStyleMap = Object.create(CSSStyleRule.prototype)
    Object.defineProperty(ruleWithoutStyleMap, 'selectorText', { value: '.text-base' })
    Object.defineProperty(ruleWithoutStyleMap, 'styleMap', { value: undefined })
    Object.defineProperty(ruleWithoutStyleMap, 'style', { value: { getPropertyValue: () => '16px' } })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await run(false, [ruleWithoutStyleMap])
    expect(getTransformations()).toBe(fontSizeRule('.text-base', '1rem'))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('does not throw when pixels are transformed but the browser has no styleMap', async () => {
    const ruleWithoutStyleMap = Object.create(CSSStyleRule.prototype)
    Object.defineProperty(ruleWithoutStyleMap, 'selectorText', { value: '.text-base' })
    Object.defineProperty(ruleWithoutStyleMap, 'styleMap', { value: undefined })
    Object.defineProperty(ruleWithoutStyleMap, 'style', { value: { getPropertyValue: () => '16px' } })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await run(true, [ruleWithoutStyleMap])
    expect(getTransformations()).toBe(fontSizeRule('.text-base', '1rem'))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('concatenates the transformations of several rules', async () => {
    await run(false, [
      createMockRule({ selectorText: '.a', rawStyles: { 'font-size': '16px' } }),
      createMockRule({ selectorText: '.b', rawStyles: { 'font-size': '32px' } })
    ])
    expect(getTransformations()).toBe(fontSizeRule('.a', '1rem') + fontSizeRule('.b', '2rem'))
  })

  test('warns and keeps going when a stylesheet cannot be read', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const unreadableSheet = { get cssRules() { throw new Error('SecurityError') } }
    const readableSheet = { cssRules: [createMockRule({ selectorText: '.a', rawStyles: { 'font-size': '16px' } })] }
    mockStyleSheets([unreadableSheet, readableSheet])
    await run(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(getTransformations()).toBe(fontSizeRule('.a', '1rem'))
  })
})

describe('running the script more than once', () => {
  test('creates a single transformations style and observer', async () => {
    addStyle('.a { font-size: 16px; }')
    await run(false)
    await run(false)
    expect(document.head.querySelectorAll('style[data-ui-scaler-transformations]')).toHaveLength(1)
    expect(observers).toHaveLength(1)
    expect(getTransformations()).toBe(fontSizeRule('.a', '1rem'))
  })

  test('transforms newly added styles only once', async () => {
    await run(false)
    await run(false)
    const styleEl = addStyle('.late { font-size: 32px; }')
    await tick()
    expect(styleEl.textContent).toBe('.late { font-size: 32px; }' + fontSizeRule('.late', '2rem'))
  })
})

describe('rules inside grouping rules', () => {
  function createNestedRule(selector: string, parents: string[]) {
    const nested = createMockRule({ selectorText: selector, rawStyles: { 'font-size': '16px' } })
    // parents are listed from the innermost to the outermost
    let child: any = nested
    parents.forEach((header) => {
      const parent = { cssText: `${header} { /* body */ }` }
      Object.defineProperty(child, 'parentRule', { value: parent, configurable: true })
      child = parent
    })
    return nested
  }

  test('wraps the transformed rule in the @media block of the original rule', async () => {
    await run(false, [createNestedRule('.title', ['@media (min-width: 768px)'])])
    expect(getTransformations()).toBe(`@media (min-width: 768px) {${fontSizeRule('.title', '1rem')}}`)
  })

  test('wraps the transformed rule in every nested grouping rule, outermost first', async () => {
    await run(false, [createNestedRule('.title', ['@media (min-width: 768px)', '@layer utilities'])])
    expect(getTransformations()).toBe(`@layer utilities {@media (min-width: 768px) {${fontSizeRule('.title', '1rem')}}}`)
  })

  test('does not wrap rules that are not inside a grouping rule', async () => {
    await run(false, [createNestedRule('.title', [])])
    expect(getTransformations()).toBe(fontSizeRule('.title', '1rem'))
  })

  test('wraps the rules of real stylesheets', async () => {
    addStyle('@media (min-width: 100px) { .foo { font-size: 16px; } }')
    await run(false)
    expect(getTransformations()).toMatch(/^@media \(min-width: 100px\) \{.foo:not\(\.ignore-ui-scaler\) \{font-size: calc\(1rem \+ var\(--browser-font-size-diff\)\);\}\}$/)
  })

  test('collects top-level rules of the real stylesheets', async () => {
    addStyle('.a { font-size: 16px; } .b { font-size: 32px; }')
    await run(false)
    expect(getTransformations()).toBe(fontSizeRule('.a', '1rem') + fontSizeRule('.b', '2rem'))
  })

  test('recurses into @layer blocks', async () => {
    addStyle('@layer utilities { .text-sm { font-size: 16px; } }')
    await run(false)
    expect(getTransformations()).toBe(`@layer utilities {${fontSizeRule('.text-sm', '1rem')}}`)
  })

  test('recurses into @media blocks', async () => {
    addStyle('@media (min-width: 100px) { .foo { font-size: 16px; } }')
    await run(false)
    expect(getTransformations()).toBe(`@media (min-width: 100px) {${fontSizeRule('.foo', '1rem')}}`)
  })

  test('recurses through multiple nested grouping rules', async () => {
    addStyle('@layer utilities { @media (min-width: 100px) { .bar { font-size: 16px; } } }')
    await run(false)
    // jsdom does not link the rules nested in an @layer back to it, so only the innermost @media wrapper is asserted
    expect(getTransformations()).toContain(`@media (min-width: 100px) {${fontSizeRule('.bar', '1rem')}}`)
  })

  test('collects a mix of top-level and nested rules', async () => {
    addStyle('.a { font-size: 16px; } @layer utilities { .b { font-size: 32px; } }')
    await run(false)
    expect(getTransformations()).toBe(fontSizeRule('.a', '1rem') + `@layer utilities {${fontSizeRule('.b', '2rem')}}`)
  })
})

describe('newly added styles', () => {
  test('does not transform the transformations style itself', async () => {
    await run(false)
    const ownStyle = document.createElement('style')
    ownStyle.setAttribute('data-ui-scaler-transformations', 'true')
    ownStyle.textContent = '.own { font-size: 16px; }'
    document.head.appendChild(ownStyle)
    await tick()
    expect(ownStyle.textContent).toBe('.own { font-size: 16px; }')
  })

  test('appends the transformations to a <style> added after the script ran', async () => {
    await run(false)
    const styleEl = addStyle('.late { font-size: 32px; }')
    await tick()
    expect(styleEl.textContent).toBe('.late { font-size: 32px; }' + fontSizeRule('.late', '2rem'))
  })

  test('leaves a <style> without transformations untouched', async () => {
    await run(false)
    const styleEl = addStyle('.late { color: red; }')
    await tick()
    expect(styleEl.textContent).toBe('.late { color: red; }')
  })

  test('ignores elements other than <style>', async () => {
    await run(false)
    const div = document.createElement('div')
    document.head.appendChild(div)
    await tick()
    expect(div.textContent).toBe('')
  })
})

describe('when the script runs', () => {
  test('waits for DOMContentLoaded while the document is still loading', async () => {
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    const addListenerSpy = jest.spyOn(document, 'addEventListener').mockImplementation(() => {})
    await run(false)
    const onReady = addListenerSpy.mock.calls.find(([type]) => type === 'DOMContentLoaded')?.[1] as EventListener

    expect(onReady).toBeDefined()
    expect(getTransformations()).toBeUndefined()

    onReady(new Event('DOMContentLoaded'))
    await tick()
    expect(getTransformations()).toBe('')
  })

  test('runs right away when the document is already parsed', async () => {
    await run(false)
    expect(getTransformations()).toBe('')
  })
})

describe('with constructable stylesheets (adoptedStyleSheets)', () => {
  class MockCSSStyleSheet {
    css = ''
    replaceSync(css: string) { this.css = css }
  }
  const realCSSStyleSheet = (global as any).CSSStyleSheet
  const hadAdopted = 'adoptedStyleSheets' in document

  beforeEach(() => {
    (global as any).CSSStyleSheet = MockCSSStyleSheet
    ;(document as any).adoptedStyleSheets = []
  })

  afterEach(() => {
    (global as any).CSSStyleSheet = realCSSStyleSheet
    if (!hadAdopted) delete (document as any).adoptedStyleSheets
  })

  const adopted = () => (document as any).adoptedStyleSheets as MockCSSStyleSheet[]

  test('adopts one stylesheet with the transformations, without creating a style element', async () => {
    await run(false, [createMockRule({ selectorText: '.a', rawStyles: { 'font-size': '16px' } })])
    expect(adopted()).toHaveLength(1)
    expect(adopted()[0].css).toBe(fontSizeRule('.a', '1rem'))
    expect(document.head.querySelector('style')).toBeNull()
  })

  test('adds the transformations of newly added styles to the same adopted stylesheet, leaving them untouched', async () => {
    await run(false, [createMockRule({ selectorText: '.a', rawStyles: { 'font-size': '16px' } })])
    const styleEl = document.createElement('style')
    styleEl.textContent = '.late { font-size: 32px; }'
    Object.defineProperty(styleEl, 'sheet', { value: { cssRules: [createMockRule({ selectorText: '.late', rawStyles: { 'font-size': '32px' } })] } })
    document.head.appendChild(styleEl)
    await tick()
    expect(adopted()).toHaveLength(1)
    expect(adopted()[0].css).toBe(fontSizeRule('.a', '1rem') + fontSizeRule('.late', '2rem'))
    expect(styleEl.textContent).toBe('.late { font-size: 32px; }')
  })

  test('does not adopt anything when there is nothing to transform', async () => {
    await run(false, [createMockRule({ styleMap: new Map([['margin-top', unitEntry(1, 'rem')]]) })])
    expect(adopted()).toHaveLength(0)
    expect(document.head.querySelector('style')).toBeNull()
  })

  test('falls back to a style element when the stylesheet cannot be adopted', async () => {
    MockCSSStyleSheet.prototype.replaceSync = () => { throw new Error('blocked') }
    await run(false, [createMockRule({ selectorText: '.a', rawStyles: { 'font-size': '16px' } })])
    expect(getTransformations()).toBe(fontSizeRule('.a', '1rem'))
    delete (MockCSSStyleSheet.prototype as any).replaceSync
    MockCSSStyleSheet.prototype.replaceSync = function(this: MockCSSStyleSheet, css: string) { this.css = css }
  })
})
