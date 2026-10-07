import scalerScript from '../src/script'
import { htmlTagBaseFontSize, browserFontSizeDiffVarName } from '../src/constants'

const html = document.documentElement
const win = window as any
const originalDevicePixelRatio = window.devicePixelRatio

type MockQuery = { media: string; listeners: EventListener[]; addListener: jest.Mock }

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

// jsdom has no matchMedia. The mock reads `coarse` live, like a real MediaQueryList, reports
// resolution queries as supported, and records their listeners so tests can fire a pixel ratio
// change with fireResolutionChange()
const mockPointerMedia = (coarse: boolean) => {
  const state = {
    coarse,
    queries: [] as MockQuery[],
    // Fires, and drops, the listeners of the latest resolution query, like a real
    // { once: true } subscription. A no-op when nothing is subscribed
    fireResolutionChange() {
      const query = state.queries.slice().reverse()
        .find(item => item.media.includes('resolution') && item.listeners.length > 0)
      const listeners = query ? query.listeners.splice(0) : []
      listeners.forEach(listener => listener(new Event('change')))
    }
  }

  win.matchMedia = jest.fn((media: string) => {
    const query: MockQuery = {
      media,
      listeners: [],
      addListener: jest.fn((_type: string, listener: EventListener) => { query.listeners.push(listener) })
    }
    state.queries.push(query)
    return {
      media,
      get matches() { return media === '(pointer: coarse)' ? state.coarse : media.includes('resolution') },
      addEventListener: query.addListener,
      removeEventListener: jest.fn((_type: string, listener: EventListener) => {
        query.listeners = query.listeners.filter(item => item !== listener)
      })
    }
  })
  return state
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
  win.matchMedia = undefined
})

afterEach(() => {
  // Remove the listeners of the instance left behind, before the spies are restored
  if (win.__uiScaler) {
    window.removeEventListener('resize', win.__uiScaler.onResize)
    document.removeEventListener('DOMContentLoaded', win.__uiScaler.onReady)
    if (win.__uiScaler.dprQuery) {
      win.__uiScaler.dprQuery.removeEventListener('change', win.__uiScaler.onDprChange)
    }
    delete win.__uiScaler
  }
  delete win.navigator.maxTouchPoints
  Reflect.deleteProperty(window, 'ontouchstart') // defined by the touch test below
  while (removedTouchHandlers.length) {
    const [target, descriptor] = removedTouchHandlers.pop()!
    Object.defineProperty(target, 'ontouchstart', descriptor)
  }
  setDevicePixelRatio(originalDevicePixelRatio)
  delete win.matchMedia
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

  describe('when matchMedia is available', () => {
    test('queries the primary pointer, not any-pointer', () => {
      mockPointerMedia(false)
      runScript()
      expect(win.matchMedia).toHaveBeenCalledWith('(pointer: coarse)')
      expect(win.matchMedia).not.toHaveBeenCalledWith(expect.stringContaining('any-pointer'))
    })

    test('compensates the zoom when the primary pointer is fine', () => {
      mockPointerMedia(false)
      runScript()
      setDevicePixelRatio(1.5)
      resize()
      expect(getFontSize()).toBe('36px')
    })

    // The regression this PR fixes
    test('compensates the zoom on a touch-screen laptop (fine primary pointer, touch signals present)', () => {
      mockPointerMedia(false)
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })
      Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true })
      runScript()
      setDevicePixelRatio(1.5)
      resize()
      expect(getFontSize()).toBe('36px')
    })

    test('skips the compensation when the primary pointer is coarse', () => {
      mockPointerMedia(true)
      runScript()
      setDevicePixelRatio(1.5)
      resize()
      expect(getFontSize()).toBe('24px')
    })

    test('follows primary pointer changes after init (2-in-1 devices)', () => {
      const pointer = mockPointerMedia(false)
      runScript()
      setDevicePixelRatio(1.5)
      resize()
      expect(getFontSize()).toBe('36px')

      pointer.coarse = true
      resize()
      expect(getFontSize()).toBe('24px')
    })
  })

  describe('when matchMedia is unavailable (legacy touch detection)', () => {
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
})

describe('device pixel ratio changes', () => {
  describe('subscription', () => {
    test('watches a range around the current pixel ratio', () => {
      mockPointerMedia(false)
      runScript()
      expect(win.matchMedia).toHaveBeenCalledWith('(min-resolution: 0.999dppx) and (max-resolution: 1.001dppx)')
    })

    test('subscribes with { once: true } and keeps the query on the instance state', () => {
      const media = mockPointerMedia(false)
      runScript()
      const query = media.queries.find(item => item.media.includes('resolution'))!
      expect(query.addListener).toHaveBeenCalledWith('change', win.__uiScaler.onDprChange, { once: true })
      expect(win.__uiScaler.dprQuery).not.toBeNull()
    })

    test('watches the new ratio after a change (re-arms)', () => {
      const media = mockPointerMedia(false)
      runScript()
      setDevicePixelRatio(2)
      media.fireResolutionChange()
      expect(win.matchMedia).toHaveBeenCalledWith('(min-resolution: 1.999dppx) and (max-resolution: 2.001dppx)')
    })

    test('removes the previous instance listener when the script runs again', () => {
      const media = mockPointerMedia(false)
      runScript()
      const first = win.__uiScaler
      const query = media.queries.find(item => item.media.includes('resolution'))!
      expect(query.listeners).toContain(first.onDprChange)

      runScript()
      expect(query.listeners).not.toContain(first.onDprChange)
    })

    test('does not subscribe, and does not throw, when matchMedia is unavailable', () => {
      expect(() => runScript()).not.toThrow()
      expect(win.__uiScaler.dprQuery).toBeNull()
      expect(getFontSize()).toBe('24px')
    })

    test('does not subscribe when the resolution query is not supported', () => {
      const addListener = jest.fn()
      win.matchMedia = jest.fn((media: string) => ({ media, matches: false, addEventListener: addListener }))
      expect(() => runScript()).not.toThrow()
      expect(addListener).not.toHaveBeenCalled()
      expect(win.__uiScaler.dprQuery).toBeNull()
      expect(getFontSize()).toBe('24px')
    })

    test('does not throw when the media query list has no addEventListener', () => {
      win.matchMedia = jest.fn(() => ({ matches: true }))
      expect(() => runScript()).not.toThrow()
      expect(win.__uiScaler.dprQuery).toBeNull()
      expect(getFontSize()).toBe('24px')
    })
  })

  // Zoom keeps the physical window size (CSS px * ratio) constant, so the baseline must stay put
  describe('zoom (the physical window size is preserved)', () => {
    test('does not re-base when nothing changed', () => {
      const media = mockPointerMedia(false)
      runScript()
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('24px')
    })

    test('keeps compensating zoom to 200%', () => {
      const media = mockPointerMedia(false)
      runScript()
      setViewport(960, 540)
      setDevicePixelRatio(2)
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('28px') // the curve gives 14 here, times a factor of 2
    })

    // 1097x617 at a ratio of 1.75 is 1919.75x1079.75 device px: rounding shifts the physical size
    test('keeps compensating zoom at a fractional level, where rounding shifts the physical size', () => {
      const media = mockPointerMedia(false)
      runScript()
      setViewport(1097, 617)
      setDevicePixelRatio(1.75)
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('26.25px') // the curve gives 15; re-based wrongly it would be 15px
    })

    // At a ratio of 2 the tolerance is 6 device px
    test.each([
      ['inside the tolerance (4 device px off)', 962, '28px'],
      ['outside the tolerance (8 device px off)', 964, '14px']
    ])('treats a window %s correctly', (_label, width, expected) => {
      const media = mockPointerMedia(false)
      runScript()
      setViewport(width, 540)
      setDevicePixelRatio(2)
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe(expected)
    })
  })

  // A ratio change that alters the physical window size is not zoom: the baseline must move
  describe('monitor or device changes (the physical window size differs)', () => {
    // Without the re-base, the next resize would apply a factor of 2 (48px)
    test('does not jump after a ratio change that keeps the CSS viewport', () => {
      const media = mockPointerMedia(false)
      runScript()
      setDevicePixelRatio(2)
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('24px')
    })

    // Without the re-base: 32px
    test('re-bases when the window is also resized by the move', () => {
      const media = mockPointerMedia(false)
      runScript()
      setViewport(1280, 720)
      setDevicePixelRatio(2)
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('16px')
    })

    // Without the re-base the second step gives 42px
    test('keeps an existing zoom factor across a later monitor change', () => {
      const media = mockPointerMedia(false)
      runScript()

      setViewport(960, 540) // zoom to 200%
      setDevicePixelRatio(2)
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('28px')

      setDevicePixelRatio(3) // monitor change, same CSS viewport
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('28px')
    })

    // Without the re-base the last step gives 48px
    test('re-bases even when scaling is disabled for the current orientation', () => {
      const media = mockPointerMedia(false)
      runScript(htmlTagBaseFontSize, false, true) // landscape scaling off
      expect(getFontSize()).toBe('')

      setDevicePixelRatio(2)
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('')

      setViewport(1080, 1920) // portrait: scaled
      resize()
      expect(getFontSize()).toBe('24px')
    })

    // DevTools device switch without a reload
    test('follows a switch from a desktop to a touch device and back', () => {
      const media = mockPointerMedia(false)
      runScript() // desktop: 1920x1080 at a ratio of 1
      expect(getFontSize()).toBe('24px')

      setViewport(1180, 820) // tablet
      setDevicePixelRatio(2)
      media.coarse = true
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('17px')

      setViewport(1920, 1080) // back to the desktop
      setDevicePixelRatio(1)
      media.coarse = false
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('24px')
    })

    // The case that halved the font-size before: the baseline was captured on the tablet
    test('follows a switch from a touch device loaded first to a desktop', () => {
      setViewport(1180, 820)
      setDevicePixelRatio(2)
      const media = mockPointerMedia(true)
      runScript() // loaded as a tablet: the baseline ratio is 2
      expect(getFontSize()).toBe('17px')

      setViewport(1920, 1080)
      setDevicePixelRatio(1)
      media.coarse = false
      media.fireResolutionChange()
      resize()
      expect(getFontSize()).toBe('24px') // without the re-base: 12px (a factor of 1/2)
    })
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