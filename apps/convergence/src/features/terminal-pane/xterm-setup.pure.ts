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

export const DEFAULT_THEME: XtermThemeOptions = {
  background: '#0b0b0f',
  foreground: '#e6e6e6',
  cursor: '#e6e6e6',
  selectionBackground: '#2d3340',
  black: '#1a1a1f',
  red: '#ef5350',
  green: '#9ccc65',
  yellow: '#ffca28',
  blue: '#42a5f5',
  magenta: '#ab47bc',
  cyan: '#26c6da',
  white: '#e6e6e6',
  brightBlack: '#4f4f5a',
  brightRed: '#ff6e6e',
  brightGreen: '#b9f27c',
  brightYellow: '#ffe082',
  brightBlue: '#64b5f6',
  brightMagenta: '#ce93d8',
  brightCyan: '#4dd0e1',
  brightWhite: '#ffffff',
}

export function buildXtermOptions(
  overrides: Partial<XtermOptions> = {},
): XtermOptions {
  return {
    fontFamily:
      'JetBrainsMono, "JetBrains Mono", Menlo, "SF Mono", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.2,
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
