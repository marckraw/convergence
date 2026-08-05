import { describe, expect, it } from 'vitest'
import {
  stripTerminalControlSequences,
  summarizeTerminalOutput,
} from './provider-account-pty-runner.pure'

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const CR = String.fromCharCode(0x0d)

describe('stripTerminalControlSequences', () => {
  it('drops the colours a pipe would never have shown', () => {
    expect(
      stripTerminalControlSequences(`${ESC}[32mOpening browser${ESC}[0m`),
    ).toBe('Opening browser')
  })

  it('drops the window-title sequence Claude Code emits while it works', () => {
    expect(
      stripTerminalControlSequences(`${ESC}]0;claude mcp login${BEL}ready`),
    ).toBe('ready')
  })

  it('drops cursor moves and short two-character escapes', () => {
    expect(
      stripTerminalControlSequences(`${ESC}[2K${ESC}[1Gline${ESC}(B`),
    ).toBe('line')
  })

  it('turns a redrawn line into successive lines instead of losing the newest', () => {
    // A spinner overwrites itself with \r; dropping the CR would glue the
    // states into one unreadable line, and dropping the earlier text would
    // throw away context. Newlines keep the last thing said last.
    expect(stripTerminalControlSequences(`waiting...${CR}authorized`)).toBe(
      'waiting...\nauthorized',
    )
  })

  it('keeps ordinary text, including tabs, intact', () => {
    expect(stripTerminalControlSequences('atlassian:\tconnected')).toBe(
      'atlassian:\tconnected',
    )
  })
})

describe('summarizeTerminalOutput', () => {
  it('quotes the tail, where the outcome lives', () => {
    const output = ['connecting', 'opening browser', 'authorized'].join('\n')

    expect(summarizeTerminalOutput(output, 2)).toBe(
      'opening browser\nauthorized',
    )
  })

  it('ignores blank redraw lines so the quote is not empty padding', () => {
    const output = `authorized${CR}${ESC}[2K   \n\n`

    expect(summarizeTerminalOutput(output)).toBe('authorized')
  })

  it('returns nothing printable as an empty string, not whitespace', () => {
    expect(summarizeTerminalOutput(`${ESC}[2K${CR}   `)).toBe('')
  })
})
