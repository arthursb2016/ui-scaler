export type TransformPixelsOptions = {
  excludeAttributes: string[],
  excludeSelectors: string[]
}

export type MappedProp = {
  key: string,
  value: string,
  selector: string,
  isExcludedSelector: boolean
}