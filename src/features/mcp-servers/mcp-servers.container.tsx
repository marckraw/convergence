import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Cable } from 'lucide-react'
import { mcpServerApi } from '@/entities/mcp-server'
import { useProjectStore } from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import type { ProjectMcpVisibility } from '@/shared/types/mcp.types'
import { Button } from '@/shared/ui/button'
import { McpServersDialog } from './mcp-servers.presentational'

export const McpServersDialogContainer: FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const projectId = activeProject?.id ?? null
  const projectName = activeProject?.name ?? null

  const open = useDialogStore((s) => s.openDialog === 'mcp-servers')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('mcp-servers')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )

  const [snapshot, setSnapshot] = useState<ProjectMcpVisibility | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) {
      setSnapshot(null)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const nextSnapshot = await mcpServerApi.listByProjectId(projectId)
      setSnapshot(nextSnapshot)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to load MCP servers',
      )
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) {
      void load()
    }
  }, [open, load])

  useEffect(() => {
    setSnapshot(null)
    setError(null)
    if (useDialogStore.getState().openDialog === 'mcp-servers') {
      closeDialog()
    }
  }, [projectId, closeDialog])

  return (
    <McpServersDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={projectName}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
      onRefresh={load}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
          disabled={!projectId}
        >
          <span className="flex items-center gap-2">
            <Cable className="h-3.5 w-3.5" />
            MCP Servers
          </span>
          <span className="text-[11px] text-muted-foreground/80">
            {snapshot
              ? snapshot.providers.reduce(
                  (count, provider) =>
                    count +
                    provider.globalServers.length +
                    provider.projectServers.length,
                  0,
                )
              : 'View'}
          </span>
        </Button>
      }
    />
  )
}
