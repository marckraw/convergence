import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { parseNameStatusOutput } from './base-branch-diff.pure'
import type { ChangedFileEntry } from './changed-files.types'

function exec(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
      } else {
        resolve(stdout.trimEnd())
      }
    })
  })
}

function execAllowExitCodes(
  command: string,
  args: string[],
  cwd: string,
  allowedExitCodes: number[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      const code = error && 'code' in error ? Number(error.code) : 0
      if (error && !allowedExitCodes.includes(code)) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout.trimEnd())
    })
  })
}

export interface BranchOutputFacts {
  branchName: string
  upstreamBranch: string | null
  remoteUrl: string | null
}

export class GitService {
  private async refExists(repoPath: string, ref: string): Promise<boolean> {
    try {
      await exec('git', ['rev-parse', '--verify', ref], repoPath)
      return true
    } catch {
      return false
    }
  }

  async getBranches(repoPath: string): Promise<string[]> {
    const output = await exec(
      'git',
      ['branch', '--format=%(refname:short)'],
      repoPath,
    )
    if (!output) return []
    return output.split('\n').filter(Boolean)
  }

  async getAllBranches(repoPath: string): Promise<string[]> {
    const output = await exec(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads',
        'refs/remotes/origin',
      ],
      repoPath,
    )
    if (!output) return []
    const names = new Set<string>()
    for (const raw of output.split('\n')) {
      const name = raw.trim()
      if (!name) continue
      if (name === 'origin/HEAD' || name.endsWith('/HEAD')) continue
      const stripped = name.startsWith('origin/')
        ? name.slice('origin/'.length)
        : name
      if (stripped) names.add(stripped)
    }
    return Array.from(names).sort()
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    return exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
  }

  async getBranchOutputFacts(repoPath: string): Promise<BranchOutputFacts> {
    const branchName = await this.getCurrentBranch(repoPath)
    const upstreamBranch = await exec(
      'git',
      ['rev-parse', '--abbrev-ref', '@{upstream}'],
      repoPath,
    ).catch(() => null)
    const remoteName = upstreamBranch?.split('/')[0] ?? null
    const remoteUrl = remoteName
      ? await this.getRemoteUrl(repoPath, remoteName)
      : null

    return {
      branchName,
      upstreamBranch,
      remoteUrl,
    }
  }

  async getRemoteUrl(
    repoPath: string,
    remoteName = 'origin',
  ): Promise<string | null> {
    return exec('git', ['remote', 'get-url', remoteName], repoPath).catch(
      () => null,
    )
  }

  async branchExists(repoPath: string, branchName: string): Promise<boolean> {
    return this.refExists(repoPath, `refs/heads/${branchName}`)
  }

  async getDefaultBranch(repoPath: string): Promise<string> {
    const remoteHead = await this.getRemoteDefaultBranch(repoPath)

    if (remoteHead) {
      return remoteHead
    }

    if (await this.branchExists(repoPath, 'master')) {
      return 'master'
    }

    if (await this.branchExists(repoPath, 'main')) {
      return 'main'
    }

    return this.getCurrentBranch(repoPath)
  }

  async getRemoteDefaultBranch(repoPath: string): Promise<string | null> {
    return exec(
      'git',
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      repoPath,
    )
      .then((output) => output.replace(/^origin\//, ''))
      .catch(() => null)
  }

  async getFirstExistingBranch(
    repoPath: string,
    branchNames: string[],
  ): Promise<string | null> {
    for (const branchName of branchNames) {
      if (await this.branchExists(repoPath, branchName)) {
        return branchName
      }
    }

    return null
  }

  async resolveBaseBranchStartPoint(
    repoPath: string,
    preferredBaseBranchName: string | null,
  ): Promise<string> {
    const baseBranchName =
      preferredBaseBranchName?.trim() || (await this.getDefaultBranch(repoPath))

    const hasOrigin = await exec('git', ['remote'], repoPath)
      .then((output) => output.split('\n').includes('origin'))
      .catch(() => false)

    if (hasOrigin) {
      await exec('git', ['fetch', 'origin', baseBranchName], repoPath).catch(
        () => {},
      )

      if (
        await this.refExists(repoPath, `refs/remotes/origin/${baseBranchName}`)
      ) {
        return `origin/${baseBranchName}`
      }
    }

    if (await this.branchExists(repoPath, baseBranchName)) {
      return baseBranchName
    }

    throw new Error(`Base branch not found: ${baseBranchName}`)
  }

  async addWorktree(
    repoPath: string,
    worktreePath: string,
    branchName: string,
    createBranch: boolean,
    startPoint?: string,
  ): Promise<void> {
    const args = createBranch
      ? ['worktree', 'add', worktreePath, '-b', branchName]
      : ['worktree', 'add', worktreePath, branchName]

    if (createBranch && startPoint) {
      args.push(startPoint)
    }

    await exec('git', args, repoPath)
  }

  async resolveComparisonRef(
    repoPath: string,
    branchName: string,
  ): Promise<string> {
    const trimmedBranchName = branchName.trim()
    if (!trimmedBranchName) {
      throw new Error('Base branch not found: empty branch name')
    }

    const hasOrigin = await exec('git', ['remote'], repoPath)
      .then((output) => output.split('\n').includes('origin'))
      .catch(() => false)

    if (hasOrigin) {
      await exec('git', ['fetch', 'origin', trimmedBranchName], repoPath).catch(
        () => {},
      )

      if (
        await this.refExists(
          repoPath,
          `refs/remotes/origin/${trimmedBranchName}`,
        )
      ) {
        return `origin/${trimmedBranchName}`
      }
    }

    if (await this.branchExists(repoPath, trimmedBranchName)) {
      return trimmedBranchName
    }

    throw new Error(`Base branch not found: ${trimmedBranchName}`)
  }

  async getMergeBase(
    repoPath: string,
    leftRef: string,
    rightRef: string,
  ): Promise<string> {
    return exec('git', ['merge-base', leftRef, rightRef], repoPath)
  }

  async getNameStatusAgainstRef(
    repoPath: string,
    baseRef: string,
  ): Promise<ChangedFileEntry[]> {
    const output = await exec(
      'git',
      ['diff', '--name-status', '--find-renames', baseRef, '--'],
      repoPath,
    ).catch(() => '')

    return parseNameStatusOutput(output)
  }

  async getUntrackedFiles(repoPath: string): Promise<string[]> {
    const output = await exec(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      repoPath,
    ).catch(() => '')

    if (!output) return []
    return output.split('\n').filter(Boolean)
  }

  async getDiffAgainstRef(
    repoPath: string,
    baseRef: string,
    filePath?: string,
  ): Promise<string> {
    const args = ['diff', '--no-color', '--find-renames', baseRef]
    if (filePath) args.push('--', filePath)

    const tracked = await exec('git', args, repoPath).catch(() => '')

    if (!filePath) {
      return tracked
    }

    const untracked = await this.getUntrackedFiles(repoPath)
    if (!untracked.includes(filePath)) {
      return tracked
    }

    const absoluteFilePath = join(repoPath, filePath)
    if (!existsSync(absoluteFilePath)) {
      return tracked
    }

    const syntheticUntracked = await execAllowExitCodes(
      'git',
      ['diff', '--no-index', '--no-color', '--', '/dev/null', absoluteFilePath],
      repoPath,
      [0, 1],
    ).catch(() => '')

    return [tracked, syntheticUntracked].filter(Boolean).join('\n')
  }

  async isGitRepository(repoPath: string): Promise<boolean> {
    if (!existsSync(repoPath)) return false
    try {
      await exec('git', ['rev-parse', '--is-inside-work-tree'], repoPath)
      return true
    } catch {
      return false
    }
  }

  async getFileAtHead(
    repoPath: string,
    relativePath: string,
  ): Promise<string | null> {
    try {
      return await exec('git', ['show', `HEAD:${relativePath}`], repoPath)
    } catch {
      return null
    }
  }

  async diffTwoPaths(
    cwd: string,
    leftPath: string,
    rightPath: string,
  ): Promise<string> {
    return execAllowExitCodes(
      'git',
      ['diff', '--no-index', '--no-color', '--', leftPath, rightPath],
      cwd,
      [0, 1],
    )
  }

  async getStatus(
    repoPath: string,
  ): Promise<Array<{ status: string; file: string }>> {
    try {
      const output = await exec(
        'git',
        ['status', '--porcelain', '-u'],
        repoPath,
      )
      if (!output) return []
      return output
        .split('\n')
        .filter(Boolean)
        .map((line) => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3),
        }))
    } catch {
      return []
    }
  }

  async getDiff(repoPath: string, filePath?: string): Promise<string> {
    try {
      const args = ['diff', '--no-color']
      if (filePath) args.push('--', filePath)
      const staged = await exec(
        'git',
        [...args.slice(0, 1), '--cached', ...args.slice(1)],
        repoPath,
      ).catch(() => '')
      const unstaged = await exec('git', args, repoPath).catch(() => '')
      if (!filePath) {
        return [staged, unstaged].filter(Boolean).join('\n')
      }

      const tracked = await exec(
        'git',
        ['ls-files', '--error-unmatch', '--', filePath],
        repoPath,
      )
        .then(() => true)
        .catch(() => false)

      if (tracked) {
        return [staged, unstaged].filter(Boolean).join('\n')
      }

      const absoluteFilePath = join(repoPath, filePath)
      if (!existsSync(absoluteFilePath)) {
        return [staged, unstaged].filter(Boolean).join('\n')
      }

      const untracked = await execAllowExitCodes(
        'git',
        [
          'diff',
          '--no-index',
          '--no-color',
          '--',
          '/dev/null',
          absoluteFilePath,
        ],
        repoPath,
        [0, 1],
      ).catch(() => '')

      return [staged, unstaged, untracked].filter(Boolean).join('\n')
    } catch {
      return ''
    }
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
