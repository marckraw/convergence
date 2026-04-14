import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Cable } from 'lucide-react'
import { mcpServerApi } from '@/entities/mcp-server'
import type { ProjectMcpVisibility } from '@/shared/types/mcp.types'
import { Button } from '@/shared/ui/button'
import { McpServersDialog } from './mcp-servers.presentational'

interface McpServersDialogContainerProps {
  projectId: string | null
  projectName: string | null
}

export const McpServersDialogContainer: FC<McpServersDialogContainerProps> = ({
  projectId,
  projectName,
}) => {
  const [open, setOpen] = useState(false)
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
    setOpen(false)
  }, [projectId])

  return (
    <McpServersDialog
      open={open}
      onOpenChange={setOpen}
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
