import { htmlTagBaseFontSize, browserFontSizeDiffVarName } from './constants'

export default (configBaseFontSize: number, enableLandscapeScaling: boolean, enablePortraitScaling: boolean) => {
  return `
    if (typeof window !== 'undefined') {
      if (window.__uiScaler) {
        window.removeEventListener('resize', window.__uiScaler.onResize)
        window.document.removeEventListener('DOMContentLoaded', window.__uiScaler.onReady)
        window.cancelAnimationFrame(window.__uiScaler.rafId)
      }

      const baseFontSize = ${htmlTagBaseFontSize}
      const enableLandscapeScaling = ${enableLandscapeScaling}
      const enablePortraitScaling = ${enablePortraitScaling}
      const segments = { width: 80, height: 45 }
      const preciseBreakpoints = { width: 1320, height: 720 }
      const BASELINE_DPR = window.devicePixelRatio || 1

      function getVirtualRemFontSize(width, height) {
        const isLandscape = width > height
        const widthSegment = isLandscape ? segments.width : segments.height
        const heightSegment = isLandscape ? segments.height : segments.width
        const preciseWidthBreakpoint = isLandscape ? preciseBreakpoints.width : preciseBreakpoints.height
        const preciseHeightBreakpoint = isLandscape ? preciseBreakpoints.height : preciseBreakpoints.width
        let X = width > preciseWidthBreakpoint ? widthSegment : widthSegment - Math.floor((preciseWidthBreakpoint - width) / (widthSegment / 2))
        let Y = height > preciseHeightBreakpoint ? heightSegment : heightSegment - Math.floor((preciseHeightBreakpoint - height) / (heightSegment / 2))
        return Math.round(((width / X) + (height / Y)) / 2)
      }

      const measureBrowserFontSize = function() {
        const probe = document.createElement('div')
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;font-family:sans-serif;font-size:medium !important'
        try {
          document.documentElement.appendChild(probe)
          const size = parseFloat(window.getComputedStyle(probe).fontSize)
          return size > 0 && isFinite(size) ? size : baseFontSize
        } catch (error) {
          return baseFontSize
        } finally {
          probe.remove()
        }
      }

      const setBrowserFontSizeDiff = function(htmlElement) {
        const browserDifference = measureBrowserFontSize() - baseFontSize
        htmlElement.style.setProperty('${browserFontSizeDiffVarName}', browserDifference + 'px')
      }

      function isTouchPrimaryDevice() {
        const coarsePointerQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null
        if (coarsePointerQuery) {
          return coarsePointerQuery.matches
        }
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)
      }

      function getDesktopZoomFactor() {
        if (isTouchPrimaryDevice()) {
          return 1;
        }
        return (window.devicePixelRatio || 1) / BASELINE_DPR
      }

      const setVirtualRemFontSize = function(htmlElement) {
        const vRemFull = getVirtualRemFontSize(window.innerWidth, window.innerHeight)
        const vRemAdjusted = (vRemFull * getDesktopZoomFactor()) + (${configBaseFontSize} - ${htmlTagBaseFontSize})
        htmlElement.style.setProperty('font-size', vRemAdjusted + 'px')
      }

      const updateHtmlFontSize = function() {
        const htmlElement = document.querySelector('html');
        setBrowserFontSizeDiff(htmlElement)
        const isScreenLandscape = window.innerWidth > window.innerHeight
        const isScreenPortrait = window.innerHeight > window.innerWidth
        const isScreenSquare = window.innerWidth === window.innerHeight
        if (isScreenLandscape && enableLandscapeScaling) {
          setVirtualRemFontSize(htmlElement)
        } else if (isScreenPortrait && enablePortraitScaling) {
          setVirtualRemFontSize(htmlElement)
        } else if (isScreenSquare) {
          setVirtualRemFontSize(htmlElement)
        } else {
          htmlElement.style.removeProperty('font-size')
        }
      }

      const initHtmlFontSizeWatcher = function() {
        const state = { rafId: 0, onResize: null, onReady: updateHtmlFontSize }
        state.onResize = function() {
          if (state.rafId) return
          state.rafId = window.requestAnimationFrame(function() {
            state.rafId = 0
            updateHtmlFontSize()
          })
        }
        window.__uiScaler = state
        window.addEventListener('resize', state.onResize)
        if (window.document.readyState === 'loading') {
          window.document.addEventListener('DOMContentLoaded', state.onReady)
        }
        updateHtmlFontSize()
      }

      initHtmlFontSizeWatcher()
    }`
}