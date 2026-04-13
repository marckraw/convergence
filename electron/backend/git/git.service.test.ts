import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, writeFileSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { GitService } from './git.service'

function gitInit(dir: string): void {
  execFileSync('git', ['init', dir])
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir })
}

describe('GitService', () => {
  let service: GitService
  let tempDir: string
  let repoPath: string

  beforeEach(() => {
    service = new GitService()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-git-test-'))
    repoPath = join(tempDir, 'repo')
    gitInit(repoPath)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('getCurrentBranch', () => {
    it('returns the current branch name', async () => {
      const branch = await service.getCurrentBranch(repoPath)
      expect(['main', 'master']).toContain(branch)
    })
  })

  describe('getBranches', () => {
    it('lists all local branches', async () => {
      execFileSync('git', ['checkout', '-b', 'feature-1'], { cwd: repoPath })
      execFileSync('git', ['checkout', '-b', 'feature-2'], { cwd: repoPath })

      const branches = await service.getBranches(repoPath)
      expect(branches).toContain('feature-1')
      expect(branches).toContain('feature-2')
    })
  })

  describe('branchExists', () => {
    it('returns true for existing branch', async () => {
      const current = await service.getCurrentBranch(repoPath)
      expect(await service.branchExists(repoPath, current)).toBe(true)
    })

    it('returns false for non-existing branch', async () => {
      expect(await service.branchExists(repoPath, 'nonexistent')).toBe(false)
    })
  })

  describe('addWorktree', () => {
    it('creates a worktree with a new branch', async () => {
      const wtPath = join(tempDir, 'wt-new')
      await service.addWorktree(repoPath, wtPath, 'feature-new', true)

      expect(existsSync(wtPath)).toBe(true)
      const branch = await service.getCurrentBranch(wtPath)
      expect(branch).toBe('feature-new')
    })

    it('creates a worktree from an existing branch', async () => {
      execFileSync('git', ['branch', 'existing-branch'], { cwd: repoPath })

      const wtPath = join(tempDir, 'wt-existing')
      await service.addWorktree(repoPath, wtPath, 'existing-branch', false)

      expect(existsSync(wtPath)).toBe(true)
      const branch = await service.getCurrentBranch(wtPath)
      expect(branch).toBe('existing-branch')
    })

    it('rejects duplicate branch in worktree', async () => {
      const wtPath1 = join(tempDir, 'wt-1')
      await service.addWorktree(repoPath, wtPath1, 'dup-branch', true)

      const wtPath2 = join(tempDir, 'wt-2')
      await expect(
        service.addWorktree(repoPath, wtPath2, 'dup-branch', false),
      ).rejects.toThrow()
    })
  })

  describe('removeWorktree', () => {
    it('removes a worktree and cleans up directory', async () => {
      const wtPath = join(tempDir, 'wt-remove')
      await service.addWorktree(repoPath, wtPath, 'remove-me', true)
      expect(existsSync(wtPath)).toBe(true)

      await service.removeWorktree(repoPath, wtPath)
      expect(existsSync(wtPath)).toBe(false)
    })

    it('handles already-removed worktree gracefully', async () => {
      const wtPath = join(tempDir, 'wt-gone')
      await expect(
        service.removeWorktree(repoPath, wtPath),
      ).resolves.not.toThrow()
    })
  })

  describe('getStatus', () => {
    it('returns working tree file status entries', async () => {
      writeFileSync(join(repoPath, 'tracked.txt'), 'hello\n')
      execFileSync('git', ['add', 'tracked.txt'], { cwd: repoPath })
      execFileSync('git', ['commit', '-m', 'tracked'], { cwd: repoPath })
      writeFileSync(join(repoPath, 'tracked.txt'), 'changed\n')

      const status = await service.getStatus(repoPath)

      expect(status).toEqual([{ status: 'M', file: 'tracked.txt' }])
    })
  })

  describe('getDiff', () => {
    it('returns a diff for tracked modified files', async () => {
      writeFileSync(join(repoPath, 'tracked.txt'), 'hello\n')
      execFileSync('git', ['add', 'tracked.txt'], { cwd: repoPath })
      execFileSync('git', ['commit', '-m', 'tracked'], { cwd: repoPath })
      writeFileSync(join(repoPath, 'tracked.txt'), 'changed\n')

      const diff = await service.getDiff(repoPath, 'tracked.txt')

      expect(diff).toContain('tracked.txt')
      expect(diff).toContain('+changed')
    })

    it('returns a synthetic diff for untracked files', async () => {
      writeFileSync(join(repoPath, 'new-file.txt'), 'new file\n')

      const diff = await service.getDiff(repoPath, 'new-file.txt')

      expect(diff).toContain('new-file.txt')
      expect(diff).toContain('/dev/null')
      expect(diff).toContain('+new file')
    })
  })
})
