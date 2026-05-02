import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join } from 'path'
import type {
  WorkboardSandcastleCheck,
  WorkboardSandcastleStatus,
} from '../workboard.types'

interface CommandLookup {
  pathEnv?: string
}

export interface SandcastleReadinessInput {
  projectId: string
  repoPath: string
  workflowPolicy: string
  sandboxMode: string
}

export interface SandcastleReadinessResult {
  status: WorkboardSandcastleStatus
  checks: WorkboardSandcastleCheck[]
}

function pathExists(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function dirExists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function commandExists(command: string, lookup: CommandLookup): boolean {
  const pathEnv = lookup.pathEnv ?? process.env.PATH ?? ''
  return pathEnv.split(delimiter).some((dir) => fileExists(join(dir, command)))
}

function hasAnyFile(root: string, relativePaths: string[]): boolean {
  return relativePaths.some((relativePath) =>
    fileExists(join(root, relativePath)),
  )
}

function check(
  id: string,
  label: string,
  state: WorkboardSandcastleCheck['state'],
): WorkboardSandcastleCheck {
  return { id, label, state }
}

export class SandcastleReadinessService {
  constructor(
    private options: {
      homeDir?: string
      pathEnv?: string
    } = {},
  ) {}

  checkProject(input: SandcastleReadinessInput): SandcastleReadinessResult {
    const sandcastleDir = join(input.repoPath, '.sandcastle')
    const checks: WorkboardSandcastleCheck[] = []
    const home = this.options.homeDir ?? homedir()

    checks.push(
      check(
        `${input.projectId}-sandcastle-folder`,
        '.sandcastle folder initialized',
        dirExists(sandcastleDir) ? 'pass' : 'fail',
      ),
    )

    checks.push(
      check(
        `${input.projectId}-workflow-entry`,
        'workflow entry file exists',
        hasAnyFile(sandcastleDir, ['run.ts', 'main.mts', 'main.ts'])
          ? 'pass'
          : 'fail',
      ),
    )

    checks.push(
      ...this.promptChecks(
        input.projectId,
        sandcastleDir,
        input.workflowPolicy,
      ),
    )

    if (input.sandboxMode === 'docker') {
      checks.push(
        check(
          `${input.projectId}-dockerfile`,
          'Dockerfile exists for sandbox image',
          fileExists(join(sandcastleDir, 'Dockerfile')) ? 'pass' : 'fail',
        ),
      )
      checks.push(
        check(
          `${input.projectId}-docker-cli`,
          'Docker CLI available on PATH',
          commandExists('docker', {
            pathEnv: this.options.pathEnv,
          })
            ? 'pass'
            : 'warn',
        ),
      )
    }

    checks.push(
      check(
        `${input.projectId}-claude-auth`,
        'Claude auth mount files available',
        dirExists(join(home, '.claude')) ||
          fileExists(join(home, '.claude.json'))
          ? 'pass'
          : 'warn',
      ),
    )
    checks.push(
      check(
        `${input.projectId}-codex-auth`,
        'Codex auth mount files available',
        pathExists(join(home, '.codex')) ? 'pass' : 'warn',
      ),
    )

    return {
      checks,
      status: this.statusFromChecks(checks),
    }
  }

  private promptChecks(
    projectId: string,
    sandcastleDir: string,
    workflowPolicy: string,
  ): WorkboardSandcastleCheck[] {
    const checks = [
      check(
        `${projectId}-implement-prompt`,
        'implement prompt exists',
        hasAnyFile(sandcastleDir, ['implement-prompt.md', 'prompt.md'])
          ? 'pass'
          : 'fail',
      ),
    ]

    if (workflowPolicy === 'sequential-reviewer') {
      checks.push(
        check(
          `${projectId}-review-prompt`,
          'review prompt exists',
          fileExists(join(sandcastleDir, 'review-prompt.md')) ? 'pass' : 'fail',
        ),
      )
    }

    if (workflowPolicy === 'parallel-planner') {
      checks.push(
        check(
          `${projectId}-plan-prompt`,
          'planner prompt exists',
          fileExists(join(sandcastleDir, 'plan-prompt.md')) ? 'pass' : 'fail',
        ),
      )
    }

    return checks
  }

  private statusFromChecks(
    checks: WorkboardSandcastleCheck[],
  ): WorkboardSandcastleStatus {
    const failedLabels = checks
      .filter((item) => item.state === 'fail')
      .map((item) => item.label)

    if (
      failedLabels.some((label) =>
        ['.sandcastle', 'workflow', 'prompt'].some((needle) =>
          label.toLowerCase().includes(needle),
        ),
      )
    ) {
      return 'missing-sandcastle'
    }

    if (
      failedLabels.some((label) =>
        ['dockerfile', 'docker cli'].some((needle) =>
          label.toLowerCase().includes(needle),
        ),
      )
    ) {
      return 'needs-docker'
    }

    if (
      checks.some(
        (item) =>
          item.state === 'warn' && item.label.toLowerCase().includes('auth'),
      )
    ) {
      return 'auth-risk'
    }

    return 'ready'
  }
}
