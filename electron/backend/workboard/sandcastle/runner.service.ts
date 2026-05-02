import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  AgentProvider,
  AgentStreamEvent,
  RunResult,
  SandboxProvider,
} from '@ai-hero/sandcastle'

export interface SandcastleRunAdapterEvent {
  type: 'agent_text' | 'tool_call'
  message: string
  iteration: number
  payload: Record<string, unknown>
}

export interface SandcastleSmokeRunInput {
  cwd: string
  promptFile: string
  promptArgs: Record<string, string>
  branchName: string
  logFilePath: string
  sandboxMode: string
  providerId: 'claude-code' | 'codex'
  model: string
  effort: string | null
  maxIterations: number
  signal: AbortSignal
  onEvent: (event: SandcastleRunAdapterEvent) => void
}

export interface SandcastleSmokeRunResult {
  iterations: number
  completionSignal?: string
  stdout: string
  commits: string[]
  branch: string
  logFilePath: string
  preservedWorktreePath?: string
}

export interface SandcastleRunAdapter {
  runSmoke(input: SandcastleSmokeRunInput): Promise<SandcastleSmokeRunResult>
}

function effortForClaude(
  value: string | null,
): 'low' | 'medium' | 'high' | 'max' | undefined {
  return value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'max'
    ? value
    : undefined
}

function effortForCodex(
  value: string | null,
): 'low' | 'medium' | 'high' | 'xhigh' | undefined {
  return value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
    ? value
    : undefined
}

interface SandcastleRuntime {
  run: typeof import('@ai-hero/sandcastle').run
  claudeCode: typeof import('@ai-hero/sandcastle').claudeCode
  codex: typeof import('@ai-hero/sandcastle').codex
  docker: typeof import('@ai-hero/sandcastle/sandboxes/docker').docker
}

interface SandcastleMount {
  hostPath: string
  sandboxPath: string
  readonly?: boolean
}

async function loadSandcastleRuntime(): Promise<SandcastleRuntime> {
  const [sandcastle, dockerSandbox] = await Promise.all([
    import('@ai-hero/sandcastle'),
    import('@ai-hero/sandcastle/sandboxes/docker'),
  ])

  return {
    run: sandcastle.run,
    claudeCode: sandcastle.claudeCode,
    codex: sandcastle.codex,
    docker: dockerSandbox.docker,
  }
}

function createAgentProvider(
  input: SandcastleSmokeRunInput,
  runtime: SandcastleRuntime,
): AgentProvider {
  if (input.providerId === 'codex') {
    return runtime.codex(input.model, { effort: effortForCodex(input.effort) })
  }

  return runtime.claudeCode(input.model, {
    effort: effortForClaude(input.effort),
  })
}

function providerAuthMounts(
  providerId: SandcastleSmokeRunInput['providerId'],
): {
  mounts: SandcastleMount[]
  env: Record<string, string>
} {
  const home = homedir()
  const mounts: SandcastleMount[] = []
  const env: Record<string, string> = {}

  if (providerId === 'codex') {
    const codexHome = join(home, '.codex')
    if (existsSync(codexHome)) {
      mounts.push({
        hostPath: codexHome,
        sandboxPath: '/home/agent/.codex',
      })
    }
  }

  if (providerId === 'claude-code') {
    const claudeDir = join(home, '.claude')
    const claudeJson = join(home, '.claude.json')
    if (existsSync(claudeDir)) {
      mounts.push({
        hostPath: claudeDir,
        sandboxPath: '/home/agent/.claude',
      })
    }
    if (existsSync(claudeJson)) {
      mounts.push({
        hostPath: claudeJson,
        sandboxPath: '/home/agent/.claude.json',
      })
    }
  }

  return { mounts, env }
}

function toAdapterEvent(event: AgentStreamEvent): SandcastleRunAdapterEvent {
  if (event.type === 'toolCall') {
    return {
      type: 'tool_call',
      message: `${event.name} ${event.formattedArgs}`.trim(),
      iteration: event.iteration,
      payload: {
        name: event.name,
        formattedArgs: event.formattedArgs,
        timestamp: event.timestamp.toISOString(),
      },
    }
  }

  return {
    type: 'agent_text',
    message: event.message,
    iteration: event.iteration,
    payload: {
      timestamp: event.timestamp.toISOString(),
    },
  }
}

function createSandboxProvider(
  input: SandcastleSmokeRunInput,
  runtime: SandcastleRuntime,
): SandboxProvider {
  if (input.sandboxMode === 'no-sandbox') {
    throw new Error(
      'Sandcastle run() does not support no-sandbox mode yet; use Docker for Phase 5 smoke runs',
    )
  }

  const auth = providerAuthMounts(input.providerId)
  return runtime.docker({
    mounts: auth.mounts,
    env: auth.env,
  })
}

function toResult(result: RunResult): SandcastleSmokeRunResult {
  return {
    iterations: result.iterations.length,
    completionSignal: result.completionSignal,
    stdout: result.stdout,
    commits: result.commits.map((commit) => commit.sha),
    branch: result.branch,
    logFilePath: result.logFilePath ?? '',
    preservedWorktreePath: result.preservedWorktreePath,
  }
}

export class SandcastleLibraryRunAdapter implements SandcastleRunAdapter {
  async runSmoke(
    input: SandcastleSmokeRunInput,
  ): Promise<SandcastleSmokeRunResult> {
    mkdirSync(dirname(input.logFilePath), { recursive: true })
    const runtime = await loadSandcastleRuntime()

    const result = await runtime.run({
      cwd: input.cwd,
      agent: createAgentProvider(input, runtime),
      sandbox: createSandboxProvider(input, runtime),
      promptFile: input.promptFile,
      promptArgs: input.promptArgs,
      maxIterations: input.maxIterations,
      branchStrategy: { type: 'branch', branch: input.branchName },
      logging: {
        type: 'file',
        path: input.logFilePath,
        onAgentStreamEvent: (event) => input.onEvent(toAdapterEvent(event)),
      },
      name: 'convergence-workboard-smoke',
      signal: input.signal,
    })

    return toResult(result)
  }
}
