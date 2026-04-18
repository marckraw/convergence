export const WINDOWS_MAX_PATH = 260

export interface LongPathCheck {
  exceedsLimit: boolean
  length: number
  limit: number | null
  message: string | null
}

export function checkWorktreePathLength(
  worktreePath: string,
  platform: NodeJS.Platform,
): LongPathCheck {
  if (platform !== 'win32') {
    return {
      exceedsLimit: false,
      length: worktreePath.length,
      limit: null,
      message: null,
    }
  }

  if (worktreePath.length > WINDOWS_MAX_PATH) {
    return {
      exceedsLimit: true,
      length: worktreePath.length,
      limit: WINDOWS_MAX_PATH,
      message: `Worktree path is ${worktreePath.length} chars, exceeding Windows' default 260-char MAX_PATH limit. Enable long paths in Group Policy (Computer Configuration > Administrative Templates > System > Filesystem > Enable Win32 long paths) or pick a shorter projects directory. Creation will continue, but some Git or filesystem operations may fail.`,
    }
  }

  return {
    exceedsLimit: false,
    length: worktreePath.length,
    limit: WINDOWS_MAX_PATH,
    message: null,
  }
}
