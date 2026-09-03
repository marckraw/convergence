import { execFile } from 'child_process'
import { existsSync, realpathSync, statSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import {
  deriveDefaultCloneDirectoryName,
  isContainedPath,
  normalizeCloneRemoteUrl,
  resolveCloneDestination,
} from './git-clone.pure'
import { redactUrlCredentials } from './git-redact.pure'

const EXPANDABLE_DIFF_CONTEXT_LINES = 80

function resolveRepoFilePath(
  repoPath: string,
  filePath: string,
): { relativePath: string; absolutePath: string } {
  if (filePath.includes('\0')) {
    throw new Error('Refusing to diff unsafe repository path')
  }

  const pathSegments = filePath.split(/[\\/]+/)
  if (isAbsolute(filePath) || pathSegments.includes('..')) {
    throw new Error(`Refusing to diff unsafe repository path: ${filePath}`)
  }

  const repoRoot = realpathSync(repoPath)
  const absolutePath = resolve(repoRoot, filePath)
  if (!isContainedPath(repoRoot, absolutePath)) {
    throw new Error(`Refusing to diff path outside repository: ${filePath}`)
  }

  if (existsSync(absolutePath)) {
    const canonicalTarget = realpathSync(absolutePath)
    if (!isContainedPath(repoRoot, canonicalTarget)) {
      throw new Error(`Refusing to diff path outside repository: ${filePath}`)
    }
  }

  return {
    relativePath: relative(repoRoot, absolutePath),
    absolutePath,
  }
}

async function validateBranchName(
  repoPath: string,
  branchName: string,
): Promise<string> {
  const trimmedBranchName = branchName.trim()
  if (!trimmedBranchName) {
    throw new Error('Base branch not found: empty branch name')
  }

  if (trimmedBranchName.startsWith('-') || trimmedBranchName.includes('\0')) {
    throw new Error(`Refusing unsafe branch name: ${trimmedBranchName}`)
  }

  await exec(
    'git',
    ['check-ref-format', '--branch', trimmedBranchName],
    repoPath,
  )
  return trimmedBranchName
}

function exec(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(redactUrlCredentials(stderr.trim() || error.message)))
      } else {
        resolve(stdout.trimEnd())
      }
    })
  })
}

/**
 * The exit CODE of a command whose non-zero codes are answers rather than
 * failures (`merge-base --is-ancestor` says "no" with 1). A code outside the
 * allowed set is still an error, with git's own words.
 */
function execExitCode(
  command: string,
  args: string[],
  cwd: string,
  allowedExitCodes: number[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, _stdout, stderr) => {
      const code = error && 'code' in error ? Number(error.code) : 0
      if (error && !allowedExitCodes.includes(code)) {
        reject(new Error(redactUrlCredentials(stderr.trim() || error.message)))
        return
      }
      resolve(code)
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
        reject(new Error(redactUrlCredentials(stderr.trim() || error.message)))
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

  /**
   * The branch name git itself would accept (`check-ref-format --branch`),
   * trimmed; throws with git's own words otherwise. Public so a caller can
   * refuse a bad name BEFORE doing expensive work in its name.
   */
  validateBranchName(repoPath: string, branchName: string): Promise<string> {
    return validateBranchName(repoPath, branchName)
  }

  async resolveBaseBranchStartPoint(
    repoPath: string,
    preferredBaseBranchName: string | null,
    options: { fetch?: boolean } = {},
  ): Promise<string> {
    const baseBranchName = await validateBranchName(
      repoPath,
      preferredBaseBranchName?.trim() ||
        (await this.getDefaultBranch(repoPath)),
    )

    const hasOrigin = await exec('git', ['remote'], repoPath)
      .then((output) => output.split('\n').includes('origin'))
      .catch(() => false)

    if (hasOrigin) {
      // A caller that has just fetched the whole remote passes `fetch: false`
      // so an unreachable origin is asked once, not twice.
      if (options.fetch !== false) {
        await exec('git', ['fetch', 'origin', baseBranchName], repoPath).catch(
          () => {},
        )
      }

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

  /** `git fetch <remote>`, every ref. Rejects when the remote cannot be reached. */
  async fetchRemote(repoPath: string, remoteName = 'origin'): Promise<void> {
    await exec('git', ['fetch', remoteName], repoPath)
  }

  async remoteBranchExists(
    repoPath: string,
    branchName: string,
    remoteName = 'origin',
  ): Promise<boolean> {
    return this.refExists(repoPath, `refs/remotes/${remoteName}/${branchName}`)
  }

  /**
   * `git checkout -B <branch> <startPoint>`: creates the branch at the start
   * point, or resets it there if a local branch of that name already exists.
   * The name goes through `check-ref-format` first, so a name git would refuse
   * is refused here with the same words rather than half-way through a
   * checkout.
   */
  async checkoutBranch(
    repoPath: string,
    branchName: string,
    startPoint: string,
  ): Promise<void> {
    const validated = await validateBranchName(repoPath, branchName)
    await exec('git', ['checkout', '-B', validated, startPoint], repoPath)
  }

  /**
   * `git merge-base --is-ancestor <contained> <container>`: whether the first
   * ref's commit is already in the second's history -- so a caller with two
   * tips of one branch can adopt the one that CONTAINS the other, and tell a
   * divergence (neither contains the other) from a fast-forward (MAR-2783
   * round 4, M2). Exit 1 is git's honest "no", not a failure; anything else
   * (an unknown ref) still throws.
   */
  async refContains(
    repoPath: string,
    containerRef: string,
    containedRef: string,
  ): Promise<boolean> {
    return (
      (await execExitCode(
        'git',
        ['merge-base', '--is-ancestor', containedRef, containerRef],
        repoPath,
        [0, 1],
      )) === 0
    )
  }

  /**
   * `git checkout <branch>`, plain: the branch must already exist locally and
   * is taken as it stands. The lane uses it to adopt a root-only branch at
   * its own tip, where `-B` would silently reset it to the base (MAR-2783
   * round 3, M2).
   */
  async checkoutExistingBranch(
    repoPath: string,
    branchName: string,
  ): Promise<void> {
    const validated = await validateBranchName(repoPath, branchName)
    await exec('git', ['checkout', validated], repoPath)
  }

  /**
   * `git reset --hard HEAD` then `git clean -fd`: tracked files back to HEAD,
   * staged additions and untracked files gone, IGNORED files untouched. Used
   * on a lane's fresh copy so the root's uncommitted edits stay the root's
   * (MAR-2783 round 2, L4).
   */
  async resetWorkingTreeToHead(repoPath: string): Promise<void> {
    await exec('git', ['reset', '--hard', 'HEAD'], repoPath)
    await exec('git', ['clean', '-fd'], repoPath)
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

  async cloneRepository(input: {
    remoteUrl: string
    parentDirectory: string
    directoryName?: string
  }): Promise<string> {
    const remoteUrl = normalizeCloneRemoteUrl(input.remoteUrl)
    const parentDirectory = resolve(input.parentDirectory)

    if (!existsSync(parentDirectory)) {
      throw new Error(`Clone destination does not exist: ${parentDirectory}`)
    }
    if (!statSync(parentDirectory).isDirectory()) {
      throw new Error(
        `Clone destination is not a directory: ${parentDirectory}`,
      )
    }

    const destinationPath = resolveCloneDestination(
      parentDirectory,
      input.directoryName ?? deriveDefaultCloneDirectoryName(remoteUrl),
    )
    if (existsSync(destinationPath)) {
      throw new Error(`Clone destination already exists: ${destinationPath}`)
    }

    await exec(
      'git',
      ['clone', '--', remoteUrl, destinationPath],
      parentDirectory,
    )
    return destinationPath
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
      [
        'diff',
        '--no-index',
        '--no-color',
        `--unified=${EXPANDABLE_DIFF_CONTEXT_LINES}`,
        '--',
        leftPath,
        rightPath,
      ],
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
    const repoFilePath = filePath
      ? resolveRepoFilePath(repoPath, filePath)
      : null

    try {
      const args = [
        'diff',
        '--no-color',
        `--unified=${EXPANDABLE_DIFF_CONTEXT_LINES}`,
      ]
      if (repoFilePath) args.push('--', repoFilePath.relativePath)
      const staged = await exec(
        'git',
        [...args.slice(0, 1), '--cached', ...args.slice(1)],
        repoPath,
      ).catch(() => '')
      const unstaged = await exec('git', args, repoPath).catch(() => '')
      if (!repoFilePath) {
        return [staged, unstaged].filter(Boolean).join('\n')
      }

      const tracked = await exec(
        'git',
        ['ls-files', '--error-unmatch', '--', repoFilePath.relativePath],
        repoPath,
      )
        .then(() => true)
        .catch(() => false)

      if (tracked) {
        return [staged, unstaged].filter(Boolean).join('\n')
      }

      const absoluteFilePath = repoFilePath.absolutePath
      if (!existsSync(absoluteFilePath)) {
        return [staged, unstaged].filter(Boolean).join('\n')
      }

      const untracked = await execAllowExitCodes(
        'git',
        [
          'diff',
          '--no-index',
          '--no-color',
          `--unified=${EXPANDABLE_DIFF_CONTEXT_LINES}`,
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
