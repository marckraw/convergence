import { describe, expect, it } from 'vitest'
import {
  meterFromProcessTable,
  parseMeterProcessTable,
  roundMeterUsage,
} from './agent-meter.pure'

describe('meterFromProcessTable', () => {
  const rows = parseMeterProcessTable(`PID PPID %CPU RSS
10 1 2 10240
11 10 3 20480
12 11 4 30720
20 1 5 40960
21 20 6 51200`)

  it('R1 sums child and grandchild and two independent roots', () => {
    expect(meterFromProcessTable(rows, [10, 20])).toEqual([
      { cpu: 9, memoryMb: 60 },
      { cpu: 11, memoryMb: 90 },
    ])
  })
  it('R1 ignores absent roots and a released root whose pid is reused', () => {
    expect(meterFromProcessTable(rows, [99, null])).toEqual([null, null])
  })
  it('does not loop on a malformed process cycle', () => {
    expect(
      meterFromProcessTable(
        [
          { pid: 1, ppid: 2, cpu: 1, rss: 1024 },
          { pid: 2, ppid: 1, cpu: 2, rss: 2048 },
        ],
        [1],
      ),
    ).toEqual([{ cpu: 3, memoryMb: 3 }])
  })
  it('rounds at one CPU percent and ten MB', () => {
    expect(roundMeterUsage({ cpu: 1.4, memoryMb: 14 })).toEqual({
      cpu: 1,
      memoryMb: 10,
    })
  })
})
