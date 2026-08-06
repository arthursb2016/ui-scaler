export type TransformPixelsOptions = {
  excludeAttributes: string[],
  excludeSelectors: string[]
}

export type UiScalerOptions = {
  transformPixels?: 'runtime' | Partial<TransformPixelsOptions> | boolean,
  baseFontSize?: number,
  enableLandscapeScaling?: boolean,
  enablePortraitScaling?: boolean
}

export type MappedProp = {
  key: string,
  value: string,
  selector: string,
  isExcludedSelector: boolean
}