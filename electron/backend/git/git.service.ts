import { execFile } from 'child_process'
import { existsSync } from 'fs'

function exec(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

export class GitService {
  async getBranches(repoPath: string): Promise<string[]> {
    const output = await exec(
      'git',
      ['branch', '--format=%(refname:short)'],
      repoPath,
    )
    if (!output) return []
    return output.split('\n').filter(Boolean)
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    return exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
  }

  async branchExists(repoPath: string, branchName: string): Promise<boolean> {
    try {
      await exec(
        'git',
        ['rev-parse', '--verify', `refs/heads/${branchName}`],
        repoPath,
      )
      return true
    } catch {
      return false
    }
  }

  async addWorktree(
    repoPath: string,
    worktreePath: string,
    branchName: string,
    createBranch: boolean,
  ): Promise<void> {
    const args = createBranch
      ? ['worktree', 'add', worktreePath, '-b', branchName]
      : ['worktree', 'add', worktreePath, branchName]

    await exec('git', args, repoPath)
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    try {
      await exec(
        'git',
        ['worktree', 'remove', '--force', worktreePath],
        repoPath,
      )
    } catch {
      // If worktree remove fails (e.g., already gone), prune stale entries
      await exec('git', ['worktree', 'prune'], repoPath).catch(() => {})
    }

    // Clean up directory if still present
    if (existsSync(worktreePath)) {
      const { rm } = await import('fs/promises')
      await rm(worktreePath, { recursive: true, force: true })
    }
  }
}
