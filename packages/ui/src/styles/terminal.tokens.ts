/*
 * The terminal's palette and type (MAR-3615 DS2, R12), for xterm, which can't
 * read CSS. Dark in both themes. They mirror the --terminal-* tokens in
 * tokens.css, and terminal.tokens.test.ts fails if the two drift apart.
 */
export const terminalTokens = {
  /** --terminal-bg */
  bg: '#0b0b0f',
  /** --terminal-ink */
  ink: '#e6e6e6',
  /** --terminal-cursor */
  cursor: '#e6e6e6',
  /** --terminal-selection */
  selection: '#2d3340',
  /** --terminal-ansi-* */
  ansi: {
    black: '#1a1a1f',
    red: '#ef5350',
    green: '#9ccc65',
    yellow: '#ffca28',
    blue: '#42a5f5',
    magenta: '#ab47bc',
    cyan: '#26c6da',
    white: '#e6e6e6',
  },
  /** --terminal-ansi-bright-* */
  ansiBright: {
    black: '#4f4f5a',
    red: '#ff6e6e',
    green: '#b9f27c',
    yellow: '#ffe082',
    blue: '#64b5f6',
    magenta: '#ce93d8',
    cyan: '#4dd0e1',
    white: '#ffffff',
  },
  /** --terminal-font */
  font: 'JetBrainsMono, "JetBrains Mono", Menlo, "SF Mono", Consolas, monospace',
  /** --terminal-font-size, in pixels */
  fontSize: 13,
  /** --terminal-line-height */
  lineHeight: 1.2,
} as const
