import { SessionStateBadge } from '@/entities/session'
import type { FC } from 'react'
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
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  ListRow,
  MetaLine,
  ScreenHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Textarea,
} from '@convergence/ui'
import {
  SELECT_EMPTY_VALUE,
  fromSelectValue,
  toSelectValue,
} from '@/shared/lib/select-value.pure'
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

const isSpaceHomeTab = (value: unknown): value is SpaceHomeTab =>
  TABS.some((tab) => tab.id === value)

/** A list of rows in one bordered box, a hairline between rows. */
const rowList = 'divide-y divide-line rounded-lg border border-line-soft'

/** A field's small label over its control. */
const fieldLabel = 'text-xs font-medium text-ink-muted'

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
      <ScreenHeader
        // The page's own heading is the h1 under it, so the strip names it at 2.
        headingLevel={2}
        start={<Folder aria-hidden className="size-4 text-ink-muted" />}
        title={space.title}
        titleAction={
          <>
            {/* The same pill in the session's Space panel (CONV-3). */}
            <StatusPill>{spaceStatusLabels[space.status]}</StatusPill>
            {space.archivedAt ? <StatusPill>Archived</StatusPill> : null}
          </>
        }
        end={
          <>
            {space.archivedAt ? (
              <Button variant="quiet" onClick={onUnarchiveSpace}>
                <Undo2 aria-hidden />
                Unarchive Space
              </Button>
            ) : (
              <Button variant="quiet" onClick={onArchiveSpace}>
                <Archive aria-hidden />
                Archive Space…
              </Button>
            )}
            <Button variant="danger-quiet" onClick={onDeleteSpace}>
              <Trash2 aria-hidden />
              Delete Space…
            </Button>
          </>
        }
      />

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-8 py-7">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
              <Folder aria-hidden className="size-4" />
              <span>Space</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {space.title}
            </h1>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-ink-muted">
              {space.brief.trim() || 'No Space brief yet.'}
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (isSpaceHomeTab(value)) onTabChange(value)
            }}
            className="gap-6"
          >
            <TabsList aria-label="Space sections" className="self-start">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTab key={tab.id} value={tab.id}>
                    <Icon aria-hidden className="size-4" />
                    {tab.label}
                  </TabsTab>
                )
              })}
            </TabsList>

            <TabsPanel value="chats" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Attempts</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted">
                    {attempts.length}
                  </span>
                  <Button variant="secondary" onClick={onBeginAttempt}>
                    <MessageSquarePlus aria-hidden />
                    New chat
                  </Button>
                </div>
              </div>
              {attempts.length > 0 ? (
                <div className={rowList}>
                  {attempts.map(({ attempt, session }) => (
                    <ListRow
                      key={attempt.id}
                      render={<button type="button" />}
                      onClick={() => onOpenAttempt(attempt.sessionId)}
                      disabled={!session}
                      className="hover:bg-fill-hover"
                      leading={<SessionStateBadge session={session} />}
                      title={session?.name ?? 'Unknown session'}
                      meta={
                        <>
                          <span>{spaceAttemptRoleLabels[attempt.role]}</span>
                          {attempt.isPrimary ? <span>Primary</span> : null}
                          {session ? <span>{session.providerId}</span> : null}
                        </>
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No attempts yet"
                  detail="Start a new Space attempt to create the first linked chat."
                />
              )}
            </TabsPanel>

            <TabsPanel value="sources" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Sources</h2>
                <Button variant="secondary" onClick={onAddSources}>
                  <FilePlus aria-hidden />
                  Add source
                </Button>
              </div>
              {sources.length > 0 ? (
                <div className={rowList}>
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      className="flex min-w-0 items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line-soft bg-surface/40">
                          <FileText
                            aria-hidden
                            className="size-4 text-ink-muted"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {source.filename}
                          </div>
                          <MetaLine className="mt-1 text-xs text-ink-muted">
                            <span>{formatBytes(source.sizeBytes)}</span>
                            <span>{source.storagePath}</span>
                          </MetaLine>
                        </div>
                      </div>
                      <IconButton
                        label={`Remove source ${source.filename}`}
                        variant="danger-quiet"
                        size="sm"
                        onClick={() => onDeleteSource(source.id)}
                        className="shrink-0"
                      >
                        <Trash2 aria-hidden />
                      </IconButton>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No sources yet"
                  detail="Add local files to keep durable reference material inside this Space."
                />
              )}
            </TabsPanel>

            <TabsPanel value="memory" className="space-y-3">
              <div>
                <h2 className="text-sm font-medium">Memory and instructions</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Durable guidance for future attempts. Retrieval and synthesis
                  come later.
                </p>
              </div>
              <Textarea
                value={memoryDraft}
                onChange={(event) => onMemoryDraftChange(event.target.value)}
                className="min-h-48 w-full resize-y"
                aria-label="Space memory and instructions"
                placeholder="Rules, preferences, durable facts, and instructions for this Space."
              />
              <Button onClick={onSaveMemory}>Save memory</Button>
            </TabsPanel>

            <TabsPanel value="artifacts" className="space-y-4">
              <Card padding="md">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium">
                      {editingArtifactId ? 'Edit artifact' : 'Add artifact'}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Promoted outputs worth keeping with this Space.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={onAddArtifactFiles}>
                    <FilePlus aria-hidden />
                    Add file
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className={fieldLabel}>Label</span>
                    <Input
                      size="lg"
                      value={artifactDraft.label}
                      onChange={(event) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          label: event.target.value,
                        })
                      }
                      placeholder="Spec, PR, exported report…"
                      aria-label="Artifact label"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className={fieldLabel}>Kind</span>
                    <Select
                      items={spaceArtifactKindLabels}
                      value={artifactDraft.kind}
                      onValueChange={(kind) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          kind: kind as SpaceArtifactKind,
                        })
                      }
                    >
                      <SelectTrigger
                        size="lg"
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
                    <span className={fieldLabel}>Value or path</span>
                    <Input
                      size="lg"
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
                    <span className={fieldLabel}>Status</span>
                    <Select
                      items={spaceArtifactStatusLabels}
                      value={artifactDraft.status}
                      onValueChange={(status) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          status: status as SpaceArtifactStatus,
                        })
                      }
                    >
                      <SelectTrigger
                        size="lg"
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
                    <span className={fieldLabel}>Source attempt</span>
                    <Select
                      items={{
                        [SELECT_EMPTY_VALUE]: 'None',
                        ...Object.fromEntries(
                          sourceAttemptOptions.map(({ attempt, session }) => [
                            attempt.sessionId,
                            session?.name ?? attempt.sessionId,
                          ]),
                        ),
                      }}
                      value={toSelectValue(artifactDraft.sourceSessionId)}
                      onValueChange={(sourceSessionId) =>
                        onArtifactDraftChange({
                          ...artifactDraft,
                          sourceSessionId: fromSelectValue(sourceSessionId),
                        })
                      }
                    >
                      <SelectTrigger
                        size="lg"
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
                    onClick={onSubmitArtifact}
                    disabled={
                      artifactDraft.label.trim().length === 0 ||
                      artifactDraft.value.trim().length === 0
                    }
                  >
                    {editingArtifactId ? (
                      <Save aria-hidden />
                    ) : (
                      <Plus aria-hidden />
                    )}
                    {editingArtifactId ? 'Save artifact' : 'Add artifact'}
                  </Button>
                  {editingArtifactId ? (
                    <Button variant="ghost" onClick={onCancelArtifactEdit}>
                      <X aria-hidden />
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </Card>

              {artifacts.length > 0 ? (
                <div className={rowList}>
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
                          <MetaLine className="mt-1 text-xs text-ink-muted">
                            <span>
                              {spaceArtifactKindLabels[artifact.kind]}
                            </span>
                            <span>{artifact.value}</span>
                          </MetaLine>
                          {sourceAttempt ? (
                            <div className="mt-1 truncate text-xs text-ink-muted">
                              From {sourceAttempt.session?.name}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusPill>
                            {spaceArtifactStatusLabels[artifact.status]}
                          </StatusPill>
                          <IconButton
                            label={`Edit artifact ${artifact.label}`}
                            variant="quiet"
                            size="sm"
                            onClick={() => onEditArtifact(artifact)}
                          >
                            <Pencil aria-hidden />
                          </IconButton>
                          <IconButton
                            label={`Remove artifact ${artifact.label}`}
                            variant="danger-quiet"
                            size="sm"
                            onClick={() => onDeleteArtifact(artifact.id)}
                          >
                            <Trash2 aria-hidden />
                          </IconButton>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No artifacts yet"
                  detail="Add a manual artifact or copy a file-backed artifact into this Space."
                />
              )}
            </TabsPanel>

            <TabsPanel value="brief">
              <Card padding="md">
                <h2 className="text-sm font-medium">Space brief</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  User-curated current understanding for this Space.
                </p>
                <Textarea
                  value={briefDraft}
                  onChange={(event) => onBriefDraftChange(event.target.value)}
                  className="mt-3 min-h-40 w-full resize-y"
                  aria-label="Space brief"
                  placeholder="Current purpose, decisions, constraints, and useful background."
                />
                <Button onClick={onSaveBrief} className="mt-3">
                  Save brief
                </Button>
              </Card>
            </TabsPanel>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
