import type { FC, ReactNode } from 'react'
import type { SessionSummary } from '@/entities/session'
import type {
  Space,
  SpaceArtifact,
  SpaceArtifactKind,
  SpaceArtifactStatus,
  SpaceAttempt,
  SpaceSource,
} from '@/entities/space'
import {
  spaceArtifactKindLabels,
  spaceArtifactKindOptions,
  spaceArtifactStatusLabels,
  spaceArtifactStatusOptions,
  spaceAttemptRoleLabels,
  spaceStatusLabels,
} from '@/entities/space'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  SELECT_EMPTY_VALUE,
  fromSelectValue,
  toSelectValue,
} from '@/shared/lib/select-value.pure'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { cn } from '@/shared/lib/cn.pure'
import {
  Box,
  Archive,
  Brain,
  FilePlus,
  FileText,
  Folder,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  X,
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

export interface SpaceArtifactDraft {
  kind: SpaceArtifactKind
  label: string
  value: string
  sourceSessionId: string
  status: SpaceArtifactStatus
}

interface SpaceHomeProps {
  space: Space
  attempts: SpaceHomeAttemptView[]
  artifacts: SpaceArtifact[]
  sources: SpaceSource[]
  activeTab: SpaceHomeTab
  onTabChange: (tab: SpaceHomeTab) => void
  onBeginAttempt: () => void
  onOpenAttempt: (sessionId: string) => void
  onAddSources: () => void
  onDeleteSource: (sourceId: string) => void
  onArchiveSpace: () => void
  onUnarchiveSpace: () => void
  onDeleteSpace: () => void
  artifactDraft: SpaceArtifactDraft
  editingArtifactId: string | null
  briefDraft: string
  memoryDraft: string
  onBriefDraftChange: (value: string) => void
  onMemoryDraftChange: (value: string) => void
  onSaveBrief: () => void
  onSaveMemory: () => void
  onArtifactDraftChange: (draft: SpaceArtifactDraft) => void
  onSubmitArtifact: () => void
  onCancelArtifactEdit: () => void
  onEditArtifact: (artifact: SpaceArtifact) => void
  onDeleteArtifact: (artifactId: string) => void
  onAddArtifactFiles: () => void
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

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
}

export const SpaceHome: FC<SpaceHomeProps> = ({
  space,
  attempts,
  artifacts,
  sources,
  activeTab,
  onTabChange,
  onBeginAttempt,
  onOpenAttempt,
  onAddSources,
  onDeleteSource,
  onArchiveSpace,
  onUnarchiveSpace,
  onDeleteSpace,
  artifactDraft,
  editingArtifactId,
  briefDraft,
  memoryDraft,
  onBriefDraftChange,
  onMemoryDraftChange,
  onSaveBrief,
  onSaveMemory,
  onArtifactDraftChange,
  onSubmitArtifact,
  onCancelArtifactEdit,
  onEditArtifact,
  onDeleteArtifact,
  onAddArtifactFiles,
}) => {
  const sourceAttemptOptions = attempts.filter(({ session }) => session)

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
          {space.archivedAt ? (
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
              Archived
            </span>
          ) : null}
        </div>
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {space.archivedAt ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onUnarchiveSpace}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Undo2 className="h-4 w-4" />
              Unarchive Space
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onArchiveSpace}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Archive className="h-4 w-4" />
              Archive Space
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDeleteSpace}
            className="gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete Space
          </Button>
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
            <section className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium">Attempts</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {attempts.length}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onBeginAttempt}
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                      New chat
                    </Button>
                  </div>
                </div>
                {attempts.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border/70">
                    {attempts.map(({ attempt, session }) => (
                      <Button
                        key={attempt.id}
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenAttempt(attempt.sessionId)}
                        className="flex h-auto w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
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
            </section>
          ) : null}

          {activeTab === 'sources' ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Sources</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onAddSources}
                >
                  <FilePlus className="h-4 w-4" />
                  Add source
                </Button>
              </div>
              {sources.length > 0 ? (
                <div className="divide-y divide-border rounded-lg border border-border/70">
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      className="flex min-w-0 items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/40">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {source.filename}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {formatBytes(source.sizeBytes)} -{' '}
                            {source.storagePath}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove source ${source.filename}`}
                        onClick={() => onDeleteSource(source.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                renderEmptyState(
                  'No sources yet',
                  'Add local files to keep durable reference material inside this Space.',
                )
              )}
            </section>
          ) : null}

          {activeTab === 'memory' ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-medium">Memory and instructions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Durable guidance for future attempts. Retrieval and synthesis
                  come later.
                </p>
              </div>
              <textarea
                value={memoryDraft}
                onChange={(event) => onMemoryDraftChange(event.target.value)}
                className="min-h-48 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Space memory and instructions"
                placeholder="Rules, preferences, durable facts, and instructions for this Space."
              />
              <Button type="button" size="sm" onClick={onSaveMemory}>
                Save memory
              </Button>
            </section>
          ) : null}

          {activeTab === 'artifacts' ? (
            <section className="space-y-4">
              <div className="rounded-lg border border-border/70 px-4 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium">
                      {editingArtifactId ? 'Edit artifact' : 'Add artifact'}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Promoted outputs worth keeping with this Space.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onAddArtifactFiles}
                  >
                    <FilePlus className="h-4 w-4" />
                    Add file
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      Label
                    </span>
                    <Input
                      value={artifactDraft.label}
                      onChange={(event) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          label: event.target.value,
                        })
                      }
                      placeholder="Spec, PR, exported report..."
                      aria-label="Artifact label"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      Kind
                    </span>
                    <Select
                      value={artifactDraft.kind}
                      onValueChange={(kind) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          kind: kind as SpaceArtifactKind,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label="Artifact kind"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {spaceArtifactKindOptions.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {spaceArtifactKindLabels[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Value or path
                    </span>
                    <Input
                      value={artifactDraft.value}
                      onChange={(event) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          value: event.target.value,
                        })
                      }
                      placeholder="URL, decision, path, branch name, or durable result"
                      aria-label="Artifact value or path"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      Status
                    </span>
                    <Select
                      value={artifactDraft.status}
                      onValueChange={(status) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          status: status as SpaceArtifactStatus,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label="Artifact status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {spaceArtifactStatusOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {spaceArtifactStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      Source attempt
                    </span>
                    <Select
                      value={toSelectValue(artifactDraft.sourceSessionId)}
                      onValueChange={(sourceSessionId) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          sourceSessionId: fromSelectValue(sourceSessionId),
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label="Artifact source attempt"
                      >
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_EMPTY_VALUE}>None</SelectItem>
                        {sourceAttemptOptions.map(({ attempt, session }) => (
                          <SelectItem
                            key={attempt.id}
                            value={attempt.sessionId}
                          >
                            {session?.name ?? attempt.sessionId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={onSubmitArtifact}
                    disabled={
                      artifactDraft.label.trim().length === 0 ||
                      artifactDraft.value.trim().length === 0
                    }
                  >
                    {editingArtifactId ? (
                      <Save className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {editingArtifactId ? 'Save artifact' : 'Add artifact'}
                  </Button>
                  {editingArtifactId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={onCancelArtifactEdit}
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>

              {artifacts.length > 0 ? (
                <div className="divide-y divide-border rounded-lg border border-border/70">
                  {artifacts.map((artifact) => {
                    const sourceAttempt = sourceAttemptOptions.find(
                      ({ attempt }) =>
                        attempt.sessionId === artifact.sourceSessionId,
                    )
                    return (
                      <div
                        key={artifact.id}
                        className="flex min-w-0 items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {artifact.label}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {spaceArtifactKindLabels[artifact.kind]} -{' '}
                            {artifact.value}
                          </div>
                          {sourceAttempt ? (
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              From {sourceAttempt.session?.name}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                            {spaceArtifactStatusLabels[artifact.status]}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            aria-label={`Edit artifact ${artifact.label}`}
                            onClick={() => onEditArtifact(artifact)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove artifact ${artifact.label}`}
                            onClick={() => onDeleteArtifact(artifact.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                renderEmptyState(
                  'No artifacts yet',
                  'Add a manual artifact or copy a file-backed artifact into this Space.',
                )
              )}
            </section>
          ) : null}

          {activeTab === 'brief' ? (
            <div className="rounded-lg border border-border/70 px-4 py-4">
              <h2 className="text-sm font-medium">Space brief</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                User-curated current understanding for this Space.
              </p>
              <textarea
                value={briefDraft}
                onChange={(event) => onBriefDraftChange(event.target.value)}
                className="mt-3 min-h-40 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Space brief"
                placeholder="Current purpose, decisions, constraints, and useful background."
              />
              <Button
                type="button"
                size="sm"
                className="mt-3"
                onClick={onSaveBrief}
              >
                Save brief
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
