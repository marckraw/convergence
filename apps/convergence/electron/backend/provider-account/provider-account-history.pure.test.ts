import { expect, it } from 'vitest'
import { isAccountHistoryOsJunk } from './provider-account-history.pure'

it.each(['.DS_Store', 'Thumbs.db', '.localized'])(
  'recognizes %s without hiding similarly named user files',
  (name) => {
    expect(isAccountHistoryOsJunk(name)).toBe(true)
    expect(isAccountHistoryOsJunk(`${name}.backup`)).toBe(false)
  },
)
