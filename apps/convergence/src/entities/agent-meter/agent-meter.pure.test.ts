import { expect, it } from 'vitest'
import { formatMeterUsage, formatSessionMeter } from './agent-meter.pure'

it('formats missing samples as unavailable rather than zero', () => {
  expect(formatMeterUsage(null)).toBe('—')
  expect(formatMeterUsage(undefined)).toBe('—')
  expect(formatMeterUsage({ cpu: 0, memoryMb: 0 })).toBe('0% · 0 MB')
})

it('keeps small memory readings in MB and large readings in GB', () => {
  expect(formatMeterUsage({ cpu: 34, memoryMb: 990 })).toBe('34% · 990 MB')
  expect(formatMeterUsage({ cpu: 34, memoryMb: 1000 })).toBe('34% · 1.0 GB')
  expect(formatMeterUsage({ cpu: 120, memoryMb: 2100 })).toBe('120% · 2.1 GB')
})

it('remote readings never expose local numbers and shared readings name the account', () => {
  const row = {
    sessionId: 'a',
    account: 'Work',
    usage: { cpu: 10, memoryMb: 500 },
  }
  expect(formatSessionMeter(row, true)).toBe('remote')
  expect(formatSessionMeter(row, false)).toBe('10% · 500 MB · shared · Work')
  expect(formatSessionMeter({ ...row, usage: null }, false)).toBe(
    '— · shared · Work',
  )
})
