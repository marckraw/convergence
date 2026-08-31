import { describe, expect, it } from 'vitest'
import {
  parsePsOutput,
  findForegroundDescendant,
} from './foreground-process.pure'

describe('parsePsOutput', () => {
  it('parses ps -A -o pid,ppid,comm output', () => {
    const out = [
      '  PID  PPID COMM',
      '  100     1 /sbin/launchd',
      '  200   100 /bin/zsh',
      '  300   200 sleep',
    ].join('\n')
    expect(parsePsOutput(out)).toEqual([
      { pid: 100, ppid: 1, comm: '/sbin/launchd' },
      { pid: 200, ppid: 100, comm: '/bin/zsh' },
      { pid: 300, ppid: 200, comm: 'sleep' },
    ])
  })

  it('handles commands containing spaces', () => {
    const out = [
      '  PID  PPID COMM',
      '  200   100 /bin/zsh',
      '  300   200 node /tmp/script.js',
    ].join('\n')
    expect(parsePsOutput(out)).toEqual([
      { pid: 200, ppid: 100, comm: '/bin/zsh' },
      { pid: 300, ppid: 200, comm: 'node /tmp/script.js' },
    ])
  })

  it('skips malformed lines', () => {
    const out = ['  PID  PPID COMM', 'garbage', '  300   200 sleep'].join('\n')
    expect(parsePsOutput(out)).toEqual([{ pid: 300, ppid: 200, comm: 'sleep' }])
  })

  it('returns empty array for empty output', () => {
    expect(parsePsOutput('')).toEqual([])
    expect(parsePsOutput('  PID  PPID COMM')).toEqual([])
  })
})

describe('findForegroundDescendant', () => {
  it('returns null when shell has no children', () => {
    const rows = [
      { pid: 100, ppid: 1, comm: '/sbin/launchd' },
      { pid: 200, ppid: 100, comm: '/bin/zsh' },
    ]
    expect(findForegroundDescendant(rows, 200)).toBeNull()
  })

  it('returns the direct child when one exists', () => {
    const rows = [
      { pid: 200, ppid: 100, comm: '/bin/zsh' },
      { pid: 300, ppid: 200, comm: 'sleep' },
    ]
    expect(findForegroundDescendant(rows, 200)).toEqual({
      pid: 300,
      name: 'sleep',
    })
  })

  it('returns the deepest descendant when there is a chain', () => {
    const rows = [
      { pid: 200, ppid: 100, comm: '/bin/zsh' },
      { pid: 300, ppid: 200, comm: 'bash' },
      { pid: 400, ppid: 300, comm: 'vim' },
    ]
    expect(findForegroundDescendant(rows, 200)).toEqual({
      pid: 400,
      name: 'vim',
    })
  })

  it('strips leading path from comm for name', () => {
    const rows = [
      { pid: 200, ppid: 100, comm: '/bin/zsh' },
      { pid: 300, ppid: 200, comm: '/usr/bin/node /tmp/script.js' },
    ]
    expect(findForegroundDescendant(rows, 200)).toEqual({
      pid: 300,
      name: 'node',
    })
  })

  it('returns null when shell pid is not present', () => {
    const rows = [{ pid: 300, ppid: 999, comm: 'sleep' }]
    expect(findForegroundDescendant(rows, 200)).toBeNull()
  })

  it('picks the highest-pid descendant when there are multiple children', () => {
    const rows = [
      { pid: 200, ppid: 100, comm: '/bin/zsh' },
      { pid: 300, ppid: 200, comm: 'older' },
      { pid: 400, ppid: 200, comm: 'newer' },
    ]
    expect(findForegroundDescendant(rows, 200)).toEqual({
      pid: 400,
      name: 'newer',
    })
  })
})
