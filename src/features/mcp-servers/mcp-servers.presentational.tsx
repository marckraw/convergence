import type { FC, ReactNode } from 'react'
import type {
  McpServerStatus,
  McpServerSummary,
  ProjectMcpVisibility,
  ProviderMcpVisibility,
} from '@/shared/types/mcp.types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  KeyRound,
  RefreshCw,
  ServerCog,
} from 'lucide-react'

interface McpServersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  projectName: string | null
  snapshot: ProjectMcpVisibility | null
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}

function renderStatusIcon(status: McpServerStatus) {
  switch (status) {
    case 'ready':
      return <CircleCheck className="h-3.5 w-3.5 text-emerald-400" />
    case 'needs-auth':
      return <KeyRound className="h-3.5 w-3.5 text-amber-400" />
    case 'failed':
      return <CircleAlert className="h-3.5 w-3.5 text-destructive" />
    case 'disabled':
      return <Ban className="h-3.5 w-3.5 text-muted-foreground" />
    default:
      return <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function renderStatusBadge(status: McpServerStatus, label: string) {
  const className =
    status === 'ready'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : status === 'needs-auth'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
        : status === 'failed'
          ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-border/70 bg-muted/50 text-muted-foreground'

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${className}`}
    >
      {label}
    </span>
  )
}

function renderServerRow(
  providerId: string,
  scope: 'project' | 'global',
  server: McpServerSummary,
) {
  return (
    <div
      key={`${providerId}-${scope}-${server.name}`}
      className="rounded-lg border border-border/60 bg-card/40 px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        {renderStatusIcon(server.status)}
        <p className="min-w-0 truncate text-sm font-medium" title={server.name}>
          {server.name}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {server.transportType.replace('_', ' ')}
          </span>
          {renderStatusBadge(server.status, server.statusLabel)}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">{server.scopeLabel}</span>
        <span className="text-muted-foreground/50">•</span>
        <span className="min-w-0 truncate" title={server.description}>
          {server.description}
        </span>
      </div>
    </div>
  )
}

function renderProviderSection(provider: ProviderMcpVisibility) {
  const totalCount =
    provider.globalServers.length + provider.projectServers.length

  return (
    <section
      key={provider.providerId}
      className="rounded-xl border border-border/70 bg-card/40"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <ServerCog className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">{provider.providerName}</p>
            <p className="text-xs text-muted-foreground">
              {totalCount} configured server{totalCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {provider.error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {provider.error}
          </div>
        ) : null}

        {provider.note ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {provider.note}
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Project
          </p>
          {provider.projectServers.length > 0 ? (
            <div className="space-y-2">
              {provider.projectServers.map((server) =>
                renderServerRow(provider.providerId, 'project', server),
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No project-specific servers.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Global
          </p>
          {provider.globalServers.length > 0 ? (
            <div className="space-y-2">
              {provider.globalServers.map((server) =>
                renderServerRow(provider.providerId, 'global', server),
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No global servers.</p>
          )}
        </div>
      </div>
    </section>
  )
}

export const McpServersDialog: FC<McpServersDialogProps> = ({
  open,
  onOpenChange,
  trigger,
  projectName,
  snapshot,
  isLoading,
  error,
  onRefresh,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>MCP Servers</DialogTitle>
          <DialogDescription>
            {projectName
              ? `Available in ${projectName}, grouped by provider and scope.`
              : 'Select a project to inspect provider-backed MCP availability.'}
          </DialogDescription>
        </DialogHeader>

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!projectName ? (
            <p className="text-sm text-muted-foreground">
              Open a project to inspect MCP server availability.
            </p>
          ) : error && !snapshot ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : isLoading && !snapshot ? (
            <p className="text-sm text-muted-foreground">
              Checking provider MCP servers…
            </p>
          ) : snapshot && snapshot.providers.length > 0 ? (
            <div className="space-y-4">
              {snapshot.providers.map((provider) =>
                renderProviderSection(provider),
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No MCP-capable providers are currently available.
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={!projectName || isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
