import type { FC } from 'react'
import { ExternalLink, GitBranch, GitPullRequest, Star } from 'lucide-react'
import type { Space, SpaceAttempt, SpaceArtifact } from '@/entities/space'
import { spaceAttemptRoleLabels, spaceStatusLabels } from '@/entities/space'
import {
  Badge,
  Card,
  EmptyState,
  IconButton,
  MetaLine,
  PanelHeader,
  SectionLabel,
  SidePanel,
  SidePanelBody,
  StatusPill,
} from '@convergence/ui'

export interface SpaceContextAttemptView {
  attempt: SpaceAttempt
  sessionName: string
  projectName: string
  branchName: string | null
  providerId: string
}

interface SpaceContextPanelProps {
  space: Space
  attempts: SpaceContextAttemptView[]
  artifacts: SpaceArtifact[]
  onOpenSpace: (spaceId: string) => void
}

export const SpaceContextPanel: FC<SpaceContextPanelProps> = ({
  space,
  attempts,
  artifacts,
  onOpenSpace,
}) => {
  return (
    <SidePanel data-testid="space-context-panel">
      <PanelHeader
        title={space.title}
        actions={
          <>
            {/* A Space's status reads the same here as on Space home (CONV-3). */}
            <StatusPill>{spaceStatusLabels[space.status]}</StatusPill>
            <IconButton
              label={`Open Space ${space.title}`}
              variant="quiet"
              size="sm"
              onClick={() => onOpenSpace(space.id)}
            >
              <ExternalLink aria-hidden className="size-3.5" />
            </IconButton>
          </>
        }
      />

      <SidePanelBody className="space-y-5">
        <section className="space-y-2">
          <SectionLabel as="h3">Space brief</SectionLabel>
          <Card className="text-sm leading-6">
            {space.brief.trim() ? (
              <p className="whitespace-pre-wrap">{space.brief}</p>
            ) : (
              <p className="text-ink-muted">No Space brief yet.</p>
            )}
          </Card>
        </section>

        <section className="space-y-2">
          <SectionLabel as="h3">Attempts</SectionLabel>
          <div className="space-y-2">
            {attempts.map((view) => (
              <Card key={view.attempt.id}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {view.sessionName}
                  </span>
                  {view.attempt.isPrimary ? (
                    <Badge tone="warning" icon={<Star />}>
                      Primary
                    </Badge>
                  ) : null}
                </div>
                <MetaLine className="mt-1 text-xs text-ink-muted">
                  <span>{spaceAttemptRoleLabels[view.attempt.role]}</span>
                  <span>{view.projectName}</span>
                  {view.branchName ? (
                    <span className="inline-flex items-center gap-1 align-bottom">
                      <GitBranch aria-hidden className="size-3.5" />
                      {view.branchName}
                    </span>
                  ) : null}
                  <span>{view.providerId}</span>
                </MetaLine>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel as="h3">Artifacts</SectionLabel>
          {artifacts.length === 0 ? (
            <EmptyState size="compact" title="No artifacts yet" />
          ) : (
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <Card key={artifact.id}>
                  <div className="flex min-w-0 items-center gap-2">
                    <GitPullRequest
                      aria-hidden
                      className="size-4 shrink-0 text-ink-muted"
                    />
                    <span className="truncate text-sm font-medium">
                      {artifact.label}
                    </span>
                  </div>
                  <MetaLine className="mt-1 text-xs text-ink-muted">
                    <span>{artifact.kind}</span>
                    <span>{artifact.status}</span>
                  </MetaLine>
                </Card>
              ))}
            </div>
          )}
        </section>
      </SidePanelBody>
    </SidePanel>
  )
}
