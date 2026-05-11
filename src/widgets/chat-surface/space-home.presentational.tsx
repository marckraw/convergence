import type { FC, ReactNode } from 'react'
import type { SessionSummary } from '@/entities/session'
import type { Space, SpaceArtifact, SpaceAttempt } from '@/entities/space'
import {
  spaceArtifactStatusLabels,
  spaceAttemptRoleLabels,
  spaceStatusLabels,
} from '@/entities/space'
import { Button } from '@/shared/ui/button'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { cn } from '@/shared/lib/cn.pure'
import {
  Box,
  Brain,
  FileText,
  Folder,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
} from 'lucide-react'

export type SpaceHomeTab =
  | 'chats'
  | 'sources'
  | 'memory'
  | 'artifacts'
  | 'brief'

export interface SpaceHomeAttemptView {
  attempt: SpaceAttempt
  session: SessionSummary | null
}

interface SpaceHomeProps {
  space: Space
  attempts: SpaceHomeAttemptView[]
  artifacts: SpaceArtifact[]
  activeTab: SpaceHomeTab
  newAttemptComposer: ReactNode
  onTabChange: (tab: SpaceHomeTab) => void
  onOpenAttempt: (sessionId: string) => void
}

const TABS: Array<{
  id: SpaceHomeTab
  label: string
  icon: FC<{ className?: string }>
}> = [
  { id: 'chats', label: 'Chats', icon: MessagesSquare },
  { id: 'sources', label: 'Sources', icon: Paperclip },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'artifacts', label: 'Artifacts', icon: Box },
  { id: 'brief', label: 'Brief', icon: FileText },
]

function renderEmptyState(title: string, detail: string): ReactNode {
  return (
    <div className="rounded-lg border border-border/70 px-4 py-5">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  )
}

export const SpaceHome: FC<SpaceHomeProps> = ({
  space,
  attempts,
  artifacts,
  activeTab,
  newAttemptComposer,
  onTabChange,
  onOpenAttempt,
}) => {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{space.title}</span>
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            {spaceStatusLabels[space.status]}
          </span>
        </div>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-8 py-7">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <header>
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Folder className="h-4 w-4" />
              <span>Space</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {space.title}
            </h1>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {space.brief.trim() || 'No Space brief yet.'}
            </p>
          </header>

          <div className="flex flex-wrap gap-2 border-b border-border">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <Button
                  key={tab.id}
                  type="button"
                  variant="ghost"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={activeTab === tab.id}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Button>
              )
            })}
          </div>

          {activeTab === 'chats' ? (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium">Attempts</h2>
                  <span className="text-xs text-muted-foreground">
                    {attempts.length}
                  </span>
                </div>
                {attempts.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border/70">
                    {attempts.map(({ attempt, session }) => (
                      <Button
                        key={attempt.id}
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenAttempt(attempt.sessionId)}
                        className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                        disabled={!session}
                      >
                        <SessionBadge
                          attention={session?.attention ?? 'none'}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {session?.name ?? 'Unknown session'}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>{spaceAttemptRoleLabels[attempt.role]}</span>
                            {attempt.isPrimary ? <span>Primary</span> : null}
                            {session ? <span>{session.providerId}</span> : null}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                ) : (
                  renderEmptyState(
                    'No attempts yet',
                    'Start a new Space attempt to create the first linked chat.',
                  )
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquarePlus className="h-4 w-4" />
                  <span>New attempt in this Space</span>
                </div>
                {newAttemptComposer}
              </div>
            </section>
          ) : null}

          {activeTab === 'sources'
            ? renderEmptyState(
                'No sources yet',
                'Space sources will collect local files and references in a later phase.',
              )
            : null}

          {activeTab === 'memory'
            ? renderEmptyState(
                'No memory yet',
                'Space memory will hold durable guidance that can be reused across attempts.',
              )
            : null}

          {activeTab === 'artifacts' ? (
            artifacts.length > 0 ? (
              <div className="divide-y divide-border rounded-lg border border-border/70">
                {artifacts.map((artifact) => (
                  <div key={artifact.id} className="px-4 py-3">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {artifact.label}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {artifact.kind} - {artifact.value}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {spaceArtifactStatusLabels[artifact.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              renderEmptyState(
                'No artifacts yet',
                'Artifacts will track branches, pull requests, documents, releases, and other Space outputs.',
              )
            )
          ) : null}

          {activeTab === 'brief' ? (
            <div className="rounded-lg border border-border/70 px-4 py-4">
              <h2 className="text-sm font-medium">Space brief</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {space.brief.trim() || 'No Space brief yet.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
