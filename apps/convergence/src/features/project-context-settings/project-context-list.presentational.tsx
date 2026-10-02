import type { FC } from 'react'
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import type { ProjectContextItem } from '@/entities/project-context'
import { Badge, Button, Card, EmptyState, IconButton } from '@convergence/ui'

interface ProjectContextListProps {
  items: ProjectContextItem[]
  isLoading: boolean
  isEmpty: boolean
  onCreateClick: () => void
  onEditClick: (item: ProjectContextItem) => void
  /** Delete: it asks first, in the app's own dialog (R5). */
  onDeleteRequest: (item: ProjectContextItem) => void
}

const BODY_PREVIEW_LIMIT = 120

function previewBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT)}…`
}

export const ProjectContextList: FC<ProjectContextListProps> = ({
  items,
  isLoading,
  isEmpty,
  onCreateClick,
  onEditClick,
  onDeleteRequest,
}) => {
  return (
    <div className="space-y-3" data-testid="project-context-list">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Context items</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Reusable text blocks that can be attached to sessions in this
            project.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={onCreateClick}
          disabled={isLoading}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState
          title="No context items yet"
          detail="Add one to attach it to sessions in this project."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <Card
              render={<li />}
              key={item.id}
              data-testid={`project-context-item-${item.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {item.label?.trim() ? item.label : 'Untitled'}
                    </span>
                    {item.reinjectMode === 'every-turn' ? (
                      <Badge tone="warning" icon={<Repeat />}>
                        Every turn
                      </Badge>
                    ) : (
                      <Badge hue="tag-cyan">Boot</Badge>
                    )}
                  </div>
                  <p className="text-xs wrap-break-word whitespace-pre-wrap text-ink-muted">
                    {previewBody(item.body)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label={`Edit ${item.label ?? 'context item'}`}
                    type="button"
                    variant="ghost"
                    onClick={() => onEditClick(item)}
                    size="sm"
                  >
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${item.label ?? 'context item'}…`}
                    type="button"
                    variant="danger-quiet"
                    onClick={() => onDeleteRequest(item)}
                    size="sm"
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
