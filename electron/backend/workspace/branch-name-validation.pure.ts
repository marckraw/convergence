const WINDOWS_RESERVED_BASE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
])

export type BranchNameValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

function hasWindowsReservedSegment(name: string): boolean {
  // Git branch names can contain `/` — each segment becomes a directory under
  // `.git/refs/heads`, so every segment must pass the Windows reserved-name check.
  return name.split('/').some((segment) => {
    const base = segment.split('.')[0].toUpperCase()
    return WINDOWS_RESERVED_BASE_NAMES.has(base)
  })
}

function hasWindowsInvalidSegmentEnding(name: string): boolean {
  return name.split('/').some((segment) => {
    if (segment.length === 0) return false
    const last = segment[segment.length - 1]
    return last === '.' || last === ' '
  })
}

export function validateBranchNameForPlatform(
  name: string,
  platform: NodeJS.Platform,
): BranchNameValidationResult {
  if (platform !== 'win32') return { valid: true }

  if (hasWindowsReservedSegment(name)) {
    return {
      valid: false,
      reason: `Branch name "${name}" contains a Windows reserved segment (CON, PRN, AUX, NUL, COM1-9, LPT1-9). Git cannot create ref files with these names on Windows.`,
    }
  }

  if (hasWindowsInvalidSegmentEnding(name)) {
    return {
      valid: false,
      reason: `Branch name "${name}" has a segment ending in "." or a space. Windows does not allow file names ending in those characters, which breaks Git ref files.`,
    }
  }

  return { valid: true }
}
