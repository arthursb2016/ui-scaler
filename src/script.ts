import { htmlTagBaseFontSize, browserFontSizeDiffVarName } from './constants'

export default (baseFontSize: number) => {
  return `
    if (typeof window !== 'undefined') {
      const baseFontSize = ${htmlTagBaseFontSize}
      const segments = { width: 80, height: 45 }
      const preciseBreakpoints = { width: 1320, height: 720 }

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

      const setBrowserFontSizeDiff = function(htmlElement) {
        htmlElement.style.removeProperty('font-size');
        const browserFontSize = window.getComputedStyle(htmlElement).getPropertyValue('font-size');
        const browserDifference = Number(browserFontSize.replace('px', '')) - baseFontSize;
        document.documentElement.style.setProperty('${browserFontSizeDiffVarName}', browserDifference + 'px')
      }

      const setVirtualRemFontSize = function(htmlElement) {
        const vRemFull = getVirtualRemFontSize(window.innerWidth, window.innerHeight)
        const vRemAdjusted = vRemFull + (${baseFontSize} - ${htmlTagBaseFontSize})
        htmlElement.style.setProperty('font-size', vRemAdjusted + 'px')
      }

      const updateHtmlFontSize = function() {
        const htmlElement = document.querySelector('html');
        setBrowserFontSizeDiff(htmlElement)
        setVirtualRemFontSize(htmlElement)
      }

      const initHtmlFontSizeWatcher = function() {
        window.addEventListener('resize', updateHtmlFontSize)
        updateHtmlFontSize()
      }

      if (window.document.readyState !== 'loading') {
        initHtmlFontSizeWatcher();
      } else {
        window.document.addEventListener('DOMContentLoaded', function() {
          initHtmlFontSizeWatcher();
        });
      }
    }`
}