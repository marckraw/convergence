/** Radix SelectItem values cannot be an empty string. */
export const SELECT_EMPTY_VALUE = '__empty__'

export function toSelectValue(value: string): string {
  return value === '' ? SELECT_EMPTY_VALUE : value
}

export function fromSelectValue(value: string): string {
  return value === SELECT_EMPTY_VALUE ? '' : value
}
