import type { FC } from 'react'
import { Plus } from 'lucide-react'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import { Button } from '@/shared/ui/button'
import { ExecutionHostSettingsContainer } from './execution-host-settings.container'
import type {
  ExecutionHostEndpointDraft,
  ExecutionHostSessionCounts,
} from './execution-host-settings.pure'

interface ExecutionHostEndpointsFieldsProps {
  drafts: readonly ExecutionHostEndpointDraft[]
  savedEndpoints: readonly ExecutionHostEndpoint[]
  /** Sessions per execution host id, and whether that is known yet. */
  sessionCounts: ExecutionHostSessionCounts
  /**
   * Why the environment override is doing nothing, or null when it is not set
   * or the endpoint it serves exists.
   */
  environmentOverrideWarning: string | null
  onAdd: () => void
  onLabelChange: (endpointId: string, value: string) => void
  onBaseUrlChange: (endpointId: string, value: string) => void
  onRemove: (endpointId: string) => void
}

/**
 * Every Endpoint Convergence knows, in the order the Execution Bar will draw
 * them (MAR-2642). Local is not here: it is this machine, never an Endpoint.
 */
export const ExecutionHostEndpointsFields: FC<
  ExecutionHostEndpointsFieldsProps
> = ({
  drafts,
  savedEndpoints,
  sessionCounts,
  environmentOverrideWarning,
  onAdd,
  onLabelChange,
  onBaseUrlChange,
  onRemove,
}) => (
  <div className="space-y-4">
    {environmentOverrideWarning && (
      <p
        role="status"
        className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
      >
        {environmentOverrideWarning}
      </p>
    )}

    {drafts.length === 0 && (
      <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No execution host endpoints. Sessions run on this machine.
      </p>
    )}

    {drafts.map((draft) => (
      <ExecutionHostSettingsContainer
        key={draft.id}
        draft={draft}
        saved={
          savedEndpoints.find((endpoint) => endpoint.id === draft.id) ?? null
        }
        sessionCounts={sessionCounts}
        onLabelChange={(value) => onLabelChange(draft.id, value)}
        onRemoteBaseUrlChange={(value) => onBaseUrlChange(draft.id, value)}
        onRemove={() => onRemove(draft.id)}
      />
    ))}

    <Button type="button" variant="outline" size="sm" onClick={onAdd}>
      <Plus className="mr-2 h-4 w-4" />
      Add endpoint
    </Button>
  </div>
)
