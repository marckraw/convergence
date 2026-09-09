import { readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  AgentRunStatus,
  HarnessEvidence,
} from '../../session/harness-evidence.types'
import { toClaudeProjectsKey } from './claude-context-log.service'
import {
  claudeRecord,
  claudeString,
  readClaudeTaskFacts,
} from './claude-evidence.pure'

interface AgentIdentity {
  id: string
  itemId: string
  depth: number
  transcriptPath: string | null
}
interface ToolIdentity {
  itemId: string
  name: string
  input: Record<string, unknown> | null
}

/** Adapts Claude's tool and disk identities into provider-neutral evidence. */
export class ClaudeEvidenceService {
  private readonly agents = new Map<string, AgentIdentity>()
  private readonly tools = new Map<string, ToolIdentity>()
  private readonly tasksByTool = new Map<string, string>()
  private readonly terminalAgents = new Set<string>()
  private readonly readMetadata = new Set<string>()
  private readonly unmatchedMetadata = new Set<string>()
  private metadataListing = ''
  private sessionId: string | null = null
  private cwd: string
  constructor(
    workingDirectory: string,
    private readonly configDir: () => string | null,
    private readonly emit: (fact: HarnessEvidence) => void,
  ) {
    this.cwd = workingDirectory
  }

  consume(data: unknown, at: string): void {
    const event = claudeRecord(data)
    if (!event) return
    this.sessionId = claudeString(event.session_id) ?? this.sessionId
    if (event.type === 'system' && event.subtype === 'init')
      this.cwd = claudeString(event.cwd) ?? this.cwd
    if (event.type !== 'stream_event') this.readMeta()
    const tasks = readClaudeTaskFacts(event, at)
    if (tasks) {
      for (const fact of tasks) {
        if (fact.patch.toolUseId)
          this.tasksByTool.set(fact.patch.toolUseId, fact.taskId)
        this.emit(fact)
        const toolId = fact.patch.toolUseId
        if (
          event.subtype === 'task_started' &&
          fact.patch.taskType === 'local_agent' &&
          toolId
        ) {
          const agent = this.agents.get(toolId)
          if (agent) {
            const depth =
              typeof event.spawn_depth === 'number'
                ? event.spawn_depth
                : agent.depth
            this.identify(
              toolId,
              fact.taskId,
              claudeString(event.subagent_type),
              claudeString(event.description),
              depth,
              agent.transcriptPath,
            )
            this.emit({
              kind: 'agent.changed',
              spawnedByItemId: agent.itemId,
              patch: {
                isBackgrounded:
                  typeof event.is_backgrounded === 'boolean'
                    ? event.is_backgrounded
                    : null,
              },
            })
          }
        }
        for (const agent of this.agents.values()) {
          if (agent.id !== fact.taskId) continue
          if (event.subtype === 'task_progress')
            this.emit({
              kind: 'agent.changed',
              spawnedByItemId: agent.itemId,
              patch: {
                ...('last_tool_name' in event
                  ? { lastToolName: claudeString(event.last_tool_name) }
                  : {}),
                ...('usage' in event
                  ? { usageJson: JSON.stringify(event.usage ?? null) }
                  : {}),
                updatedAt: at,
              },
            })
          if (
            fact.patch.status &&
            ['completed', 'failed', 'stopped'].includes(fact.patch.status)
          )
            this.endAgent(
              agent,
              fact.patch.status as 'completed' | 'failed' | 'stopped',
              fact.patch.endedAt ?? at,
              fact.patch.endedSummary,
            )
        }
      }
    } else if (
      !['assistant', 'user', 'stream_event', 'result'].includes(
        String(event.type),
      )
    ) {
      this.emit({
        kind: 'harness.unknown',
        type: claudeString(event.type) ?? 'unknown',
        subtype: claudeString(event.subtype),
        payload: event,
        at,
      })
    }
  }

  identity(
    data: unknown,
    toolUseId?: string | null,
  ): { agentRunId: string | null; taskId: string | null } {
    const parent = claudeString(claudeRecord(data)?.parent_tool_use_id)
    return {
      agentRunId: parent ? (this.agents.get(parent)?.id ?? parent) : null,
      taskId:
        (toolUseId && this.tasksByTool.get(toolUseId)) ||
        (parent && this.tasksByTool.get(parent)) ||
        null,
    }
  }

  toolCall(data: unknown, block: unknown, itemId: string, at: string): void {
    const tool = claudeRecord(block)
    const id = claudeString(tool?.id),
      name = claudeString(tool?.name)
    if (!id || !name) return
    const input = claudeRecord(tool?.input)
    this.tools.set(id, { itemId, name, input })
    if (name !== 'Agent') return
    const parent = claudeString(claudeRecord(data)?.parent_tool_use_id)
    const depth = (parent ? (this.agents.get(parent)?.depth ?? 0) : 0) + 1
    this.agents.set(id, { id, itemId, depth, transcriptPath: null })
    this.emit({
      kind: 'agent.started',
      run: {
        id,
        spawnedByItemId: itemId,
        agentType: claudeString(input?.subagent_type),
        description: claudeString(input?.description),
        model: null,
        depth,
        startedAt: at,
        transcriptPath: null,
      },
    })
    this.readMeta()
  }

  toolResult(
    data: unknown,
    block: unknown,
    at: string,
  ): { relatedItemId: string | null; toolName: string | null } {
    const result = claudeRecord(block),
      event = claudeRecord(data)
    const id = claudeString(result?.tool_use_id)
    const tool = id ? this.tools.get(id) : undefined
    if (tool && id) {
      if (tool.name === 'Agent') {
        this.readMeta()
        const structured = claudeRecord(event?.tool_use_result)
        const text =
          typeof result?.content === 'string'
            ? result.content
            : JSON.stringify(result?.content)
        const textId =
          claudeString(structured?.agentId) ??
          text?.match(/\bagentId:\s*([A-Za-z0-9_-]+)/)?.[1]
        const agent = this.agents.get(id)
        if (agent && textId && agent.id === id)
          this.identify(id, textId, null, null, agent.depth, null)
        const model = claudeString(structured?.resolvedModel)
        if (model)
          this.emit({
            kind: 'agent.changed',
            spawnedByItemId: tool.itemId,
            patch: { model },
          })
        if (
          agent &&
          (result?.is_error === true || structured?.status === 'completed')
        )
          this.endAgent(
            agent,
            result?.is_error === true ? 'failed' : 'completed',
            at,
            result?.is_error === true ? text : undefined,
          )
      } else if (tool.name === 'TaskStop' && result?.is_error !== true) {
        const taskId =
          claudeString(tool.input?.task_id) ??
          claudeString(tool.input?.shell_id)
        if (taskId) {
          this.emit({
            kind: 'task.changed',
            taskId,
            at,
            patch: { status: 'stopped', endedAt: at },
          })
          this.stopAgentForTask(taskId, at)
        }
      }
    }
    return { relatedItemId: tool?.itemId ?? null, toolName: tool?.name ?? null }
  }

  accounting(data: unknown): void {
    const event = claudeRecord(data)
    this.emit({
      kind: 'turn.accounting',
      resultSubtype: claudeString(event?.subtype),
      usage: event?.usage ?? null,
      costUsd:
        typeof event?.total_cost_usd === 'number' &&
        Number.isFinite(event.total_cost_usd)
          ? event.total_cost_usd
          : null,
      permissionDenials: event?.permission_denials ?? null,
      subagentStats: event?.subagent_stats ?? null,
    })
  }
  processEnded(
    at: string,
    reason?: 'quit' | 'idle' | 'account' | 'stop' | 'exit',
  ): void {
    this.emit({ kind: 'process.ended', at, ...(reason ? { reason } : {}) })
  }

  private stopAgentForTask(taskId: string, at: string): void {
    for (const [toolId, agent] of this.agents)
      if (agent.id === taskId || this.tasksByTool.get(toolId) === taskId)
        this.endAgent(agent, 'stopped', at)
  }
  private endAgent(
    agent: AgentIdentity,
    status: Exclude<AgentRunStatus, 'running' | 'unknown'>,
    at: string,
    summary?: string | null,
  ): void {
    // The task update, notification and foreground result name one terminal moment.
    if (this.terminalAgents.has(agent.itemId)) return
    this.terminalAgents.add(agent.itemId)
    this.emit({
      kind: 'agent.ended',
      ...(summary !== undefined ? { summary } : {}),
      spawnedByItemId: agent.itemId,
      status,
      at,
    })
  }
  private identify(
    toolId: string,
    id: string,
    agentType: string | null,
    description: string | null,
    depth: number,
    transcriptPath: string | null,
  ): void {
    const agent = this.agents.get(toolId)
    if (!agent) return
    this.agents.set(toolId, { ...agent, id, depth, transcriptPath })
    this.emit({
      kind: 'agent.identified',
      spawnedByItemId: agent.itemId,
      id,
      agentType,
      description,
      depth,
      transcriptPath,
    })
  }
  private readMeta(): void {
    if (
      !this.sessionId ||
      !/^[A-Za-z0-9_-]+$/.test(this.sessionId) ||
      ![...this.agents].some(([toolId, agent]) => agent.id === toolId)
    )
      return
    const root = join(
      this.configDir() ?? join(homedir(), '.claude'),
      'projects',
      toClaudeProjectsKey(this.cwd),
      this.sessionId,
      'subagents',
    )
    let files: string[]
    try {
      files = readdirSync(root)
    } catch {
      return
    }
    const listing = files.sort().join('\n')
    if (listing !== this.metadataListing) {
      this.unmatchedMetadata.clear()
      this.metadataListing = listing
    }
    for (const file of files) {
      const match = /^agent-([A-Za-z0-9_-]+)\.meta\.json$/.exec(file)
      if (
        !match ||
        this.readMetadata.has(file) ||
        this.unmatchedMetadata.has(file)
      )
        continue
      let meta: Record<string, unknown> | null
      try {
        meta = claudeRecord(JSON.parse(readFileSync(join(root, file), 'utf8')))
      } catch {
        continue
      } // A partially written file is retried on the next event.
      const toolId = claudeString(meta?.toolUseId)
      const agent = toolId ? this.agents.get(toolId) : undefined
      if (!toolId || !agent) {
        this.unmatchedMetadata.add(file)
        continue
      }
      const depth =
        typeof meta?.spawnDepth === 'number' &&
        Number.isInteger(meta.spawnDepth)
          ? meta.spawnDepth
          : agent.depth
      this.identify(
        toolId,
        agent.id === toolId ? match[1] : agent.id,
        claudeString(meta?.agentType),
        claudeString(meta?.description),
        depth,
        join(root, `agent-${match[1]}.jsonl`),
      )
      this.readMetadata.add(file)
    }
  }
}
