import scalerScript from '../src/script'
import { htmlTagBaseFontSize, browserFontSizeDiffVarName } from '../src/constants'

const html = document.documentElement
const win = window as any
const originalDevicePixelRatio = window.devicePixelRatio

let frames: Map<number, FrameRequestCallback>
let nextFrameId: number
let computedStyleSpy: jest.SpyInstance
const removedTouchHandlers: Array<[object, PropertyDescriptor]> = []

const flushFrames = () => {
  const pending = Array.from(frames.values())
  frames.clear()
  pending.forEach(callback => callback(0))
}

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

const setDevicePixelRatio = (ratio: number) => {
  Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true, writable: true })
}

const setMeasuredBrowserFontSize = (size: string) => {
  computedStyleSpy.mockReturnValue({ fontSize: size } as unknown as CSSStyleDeclaration)
}

// jsdom defines ontouchstart, so 'ontouchstart' in window is true and the script
// treats the environment as a touch device. Remove it to simulate a desktop browser.
// Walks the prototype chain because the property may live on a prototype.
const simulateNonTouchBrowser = () => {
  let target: object | null = window
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'ontouchstart')
    if (descriptor && Reflect.deleteProperty(target, 'ontouchstart')) {
      removedTouchHandlers.push([target, descriptor])
    }
    target = Object.getPrototypeOf(target)
  }
}

const resize = () => {
  window.dispatchEvent(new Event('resize'))
  flushFrames()
}

// Defaults to the internal base size, so the user-option offset is 0 unless a test overrides it
const runScript = (baseFontSize = htmlTagBaseFontSize, landscape = true, portrait = true) =>
  new Function(scalerScript(baseFontSize, landscape, portrait))()

const getFontSize = () => html.style.getPropertyValue('font-size')
const getDiffVar = () => html.style.getPropertyValue(browserFontSizeDiffVarName)

beforeEach(() => {
  frames = new Map()
  nextFrameId = 1

  // A queue instead of a synchronous stub: the script's rafId guard needs the id to be
  // assigned BEFORE the callback runs, and flushFrames() controls when that happens
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  })
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
    frames.delete(id)
  })

  // jsdom does not resolve font-size keywords, so the probe measurement is mocked
  computedStyleSpy = jest.spyOn(window, 'getComputedStyle')
  setMeasuredBrowserFontSize(`${htmlTagBaseFontSize}px`)

  html.removeAttribute('style')
  setViewport(1920, 1080)
  setDevicePixelRatio(1)
  simulateNonTouchBrowser()
})

afterEach(() => {
  // Remove the listeners of the instance left behind, before the spies are restored
  if (win.__uiScaler) {
    window.removeEventListener('resize', win.__uiScaler.onResize)
    document.removeEventListener('DOMContentLoaded', win.__uiScaler.onReady)
    delete win.__uiScaler
  }
  delete win.navigator.maxTouchPoints
  Reflect.deleteProperty(window, 'ontouchstart') // defined by the touch test below
  while (removedTouchHandlers.length) {
    const [target, descriptor] = removedTouchHandlers.pop()!
    Object.defineProperty(target, 'ontouchstart', descriptor)
  }
  setDevicePixelRatio(originalDevicePixelRatio)
  jest.restoreAllMocks()
})

describe('font-size scaling curve', () => {
  test.each([
    ['1280x720 landscape', 1280, 720, 16],
    ['1920x1080 landscape', 1920, 1080, 24],
    ['2560x1440 landscape', 2560, 1440, 32],
    ['3840x2160 landscape', 3840, 2160, 48],
    ['1000x600 landscape (below the precise breakpoint)', 1000, 600, 14],
    ['1080x1920 portrait', 1080, 1920, 24],
    ['390x844 portrait phone', 390, 844, 12]
  ])('%s', (_label, width, height, expected) => {
    setViewport(width, height)
    runScript()
    expect(getFontSize()).toBe(`${expected}px`)
  })

  test('adds the offset between the baseFontSize option and the internal base size', () => {
    runScript(htmlTagBaseFontSize + 4)
    expect(getFontSize()).toBe('28px')
  })

  test('supports a negative offset', () => {
    runScript(htmlTagBaseFontSize - 2)
    expect(getFontSize()).toBe('22px')
  })

  test('applies the size synchronously on the first run', () => {
    runScript()
    expect(getFontSize()).not.toBe('')
    expect(frames.size).toBe(0)
  })
})

describe('orientation flags', () => {
  test('does not scale in landscape when landscape scaling is disabled', () => {
    runScript(htmlTagBaseFontSize, false, true)
    expect(getFontSize()).toBe('')
  })

  test('does not scale in portrait when portrait scaling is disabled', () => {
    setViewport(1080, 1920)
    runScript(htmlTagBaseFontSize, true, false)
    expect(getFontSize()).toBe('')
  })

  test('still scales the other orientation when one is disabled', () => {
    setViewport(1080, 1920)
    runScript(htmlTagBaseFontSize, false, true)
    expect(getFontSize()).toBe('24px')
  })

  // Documents current behavior: a square viewport ignores both flags
  test('scales square viewports regardless of the orientation flags', () => {
    setViewport(1000, 1000)
    runScript(htmlTagBaseFontSize, false, false)
    expect(getFontSize()).not.toBe('')
  })

  test('sets, clears and sets the inline size again as the orientation changes', () => {
    runScript(htmlTagBaseFontSize, false, true) // landscape scaling off
    expect(getFontSize()).toBe('')

    setViewport(1080, 1920) // portrait: scaled
    resize()
    expect(getFontSize()).toBe('24px')

    setViewport(1920, 1080) // landscape: must be cleared explicitly
    resize()
    expect(getFontSize()).toBe('')

    setViewport(1080, 1920)
    resize()
    expect(getFontSize()).toBe('24px')
  })

  test('still writes the browser font-size variable when scaling is off for the orientation', () => {
    setMeasuredBrowserFontSize('20px')
    runScript(htmlTagBaseFontSize, false, true)
    expect(getFontSize()).toBe('')
    expect(getDiffVar()).toBe(`${20 - htmlTagBaseFontSize}px`)
  })
})

describe('browser font-size measurement', () => {
  test('writes the difference between the user setting and the internal base size', () => {
    setMeasuredBrowserFontSize('20px')
    runScript()
    expect(getDiffVar()).toBe(`${20 - htmlTagBaseFontSize}px`)
  })

  test('measures with a probe using font-size: medium !important, not the html element', () => {
    runScript()
    const measured = computedStyleSpy.mock.calls.map(([element]) => element as HTMLElement)
    expect(measured).not.toContain(html)
    expect(measured[0].style.getPropertyValue('font-size')).toBe('medium')
    expect(measured[0].style.getPropertyPriority('font-size')).toBe('important')
  })

  test('removes the probe after measuring', () => {
    const childCount = html.children.length
    runScript()
    expect(html.children.length).toBe(childCount)
  })

  test('falls back to a zero difference when the measured size is not a number', () => {
    setMeasuredBrowserFontSize('')
    runScript()
    expect(getDiffVar()).toBe('0px')
  })

  test('falls back to a zero difference when the measured size is zero', () => {
    setMeasuredBrowserFontSize('0px')
    runScript()
    expect(getDiffVar()).toBe('0px')
  })

  test('falls back to a zero difference, and keeps scaling, when appending the probe throws', () => {
    jest.spyOn(html, 'appendChild').mockImplementation(() => { throw new Error('append failed') })
    expect(() => runScript()).not.toThrow()
    expect(getDiffVar()).toBe('0px')
    expect(getFontSize()).toBe('24px')
  })

  test('falls back to a zero difference, and does not leak the probe, when getComputedStyle throws', () => {
    const childCount = html.children.length
    computedStyleSpy.mockImplementation(() => { throw new Error('style failed') })
    expect(() => runScript()).not.toThrow()
    expect(getDiffVar()).toBe('0px')
    expect(html.children.length).toBe(childCount)
  })
})

describe('zoom compensation', () => {
  test('keeps the size when the device pixel ratio is unchanged', () => {
    runScript()
    resize()
    expect(getFontSize()).toBe('24px')
  })

  test('scales by the device pixel ratio relative to the one at load', () => {
    runScript()
    setDevicePixelRatio(1.5)
    resize()
    expect(getFontSize()).toBe('36px')
  })

  // Document current behavior: any touch-capable device skips the compensation
  // (the pointer: coarse PR will change these tests)
  test('skips the compensation when the device reports touch points', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true })
    runScript()
    setDevicePixelRatio(1.5)
    resize()
    expect(getFontSize()).toBe('24px')
  })

  test('skips the compensation when ontouchstart exists on window', () => {
    Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true })
    runScript()
    setDevicePixelRatio(1.5)
    resize()
    expect(getFontSize()).toBe('24px')
  })
})

describe('resize throttling', () => {
  test('schedules a single frame for a burst of resize events', () => {
    runScript()
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
  })

  test('applies the latest viewport only when the frame runs', () => {
    runScript()
    setViewport(2560, 1440)
    window.dispatchEvent(new Event('resize'))
    expect(getFontSize()).toBe('24px')

    flushFrames()
    expect(getFontSize()).toBe('32px')
  })

  test('schedules a new frame once the previous one has run', () => {
    runScript()
    resize()
    window.dispatchEvent(new Event('resize'))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2)
  })
})

describe('running the script more than once', () => {
  test('removes the previous instance resize listener and keeps a single one active', () => {
    runScript()
    const first = win.__uiScaler
    const removeSpy = jest.spyOn(window, 'removeEventListener')

    runScript()
    expect(removeSpy).toHaveBeenCalledWith('resize', first.onResize)
    expect(win.__uiScaler).not.toBe(first)

    window.dispatchEvent(new Event('resize'))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
  })

  test('cancels a frame still pending from the previous instance', () => {
    runScript()
    window.dispatchEvent(new Event('resize')) // schedules a frame, not flushed
    const pendingId = (window.requestAnimationFrame as jest.Mock).mock.results[0].value
    expect(frames.has(pendingId)).toBe(true)

    runScript()
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(pendingId)
    expect(frames.size).toBe(0)
  })

  test('removes the previous instance DOMContentLoaded listener', () => {
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    runScript()
    const first = win.__uiScaler
    const removeSpy = jest.spyOn(document, 'removeEventListener')

    runScript()
    expect(removeSpy).toHaveBeenCalledWith('DOMContentLoaded', first.onReady)
  })
})

describe('DOMContentLoaded', () => {
  test('re-applies the size once parsing is done when the script runs while loading', () => {
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    runScript()
    expect(getFontSize()).toBe('24px')

    setViewport(2560, 1440)
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(getFontSize()).toBe('32px')
  })

  test('does not register a listener when the document is already loaded', () => {
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('complete')
    const addSpy = jest.spyOn(document, 'addEventListener')
    runScript()
    expect(addSpy).not.toHaveBeenCalledWith('DOMContentLoaded', expect.anything())
  })
})