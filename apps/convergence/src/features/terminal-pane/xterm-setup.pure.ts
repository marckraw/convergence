import { terminalTokens } from '@convergence/ui'

export interface XtermThemeOptions {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface XtermOptions {
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorBlink: boolean
  allowProposedApi: boolean
  scrollback: number
  theme: XtermThemeOptions
  macOptionIsMeta: boolean
  rightClickSelectsWord: boolean
}

/**
 * The terminal's palette (R12): dark in both themes, read from the design
 * system's `terminalTokens`, which a test keeps equal to the `--terminal-*`
 * tokens, since xterm can't read CSS.
 */
export const DEFAULT_THEME: XtermThemeOptions = {
  background: terminalTokens.bg,
  foreground: terminalTokens.ink,
  cursor: terminalTokens.cursor,
  selectionBackground: terminalTokens.selection,
  black: terminalTokens.ansi.black,
  red: terminalTokens.ansi.red,
  green: terminalTokens.ansi.green,
  yellow: terminalTokens.ansi.yellow,
  blue: terminalTokens.ansi.blue,
  magenta: terminalTokens.ansi.magenta,
  cyan: terminalTokens.ansi.cyan,
  white: terminalTokens.ansi.white,
  brightBlack: terminalTokens.ansiBright.black,
  brightRed: terminalTokens.ansiBright.red,
  brightGreen: terminalTokens.ansiBright.green,
  brightYellow: terminalTokens.ansiBright.yellow,
  brightBlue: terminalTokens.ansiBright.blue,
  brightMagenta: terminalTokens.ansiBright.magenta,
  brightCyan: terminalTokens.ansiBright.cyan,
  brightWhite: terminalTokens.ansiBright.white,
}

export function buildXtermOptions(
  overrides: Partial<XtermOptions> = {},
): XtermOptions {
  return {
    fontFamily: terminalTokens.font,
    fontSize: terminalTokens.fontSize,
    lineHeight: terminalTokens.lineHeight,
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 10_000,
    theme: DEFAULT_THEME,
    macOptionIsMeta: true,
    rightClickSelectsWord: true,
    ...overrides,
  }
}

export interface PaneGeometry {
  pixelWidth: number
  pixelHeight: number
  cellWidth: number
  cellHeight: number
}

export interface TerminalDimensions {
  cols: number
  rows: number
}

export function computeDimensions({
  pixelWidth,
  pixelHeight,
  cellWidth,
  cellHeight,
}: PaneGeometry): TerminalDimensions {
  if (cellWidth <= 0 || cellHeight <= 0) {
    return { cols: 1, rows: 1 }
  }
  const cols = Math.max(1, Math.floor(pixelWidth / cellWidth))
  const rows = Math.max(1, Math.floor(pixelHeight / cellHeight))
  return { cols, rows }
}
