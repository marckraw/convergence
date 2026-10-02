import type { FC, ReactNode, ReactElement } from 'react'
import type {
  McpServerStatus,
  McpServerSummary,
  ProjectMcpVisibility,
  ProviderMcpVisibility,
} from '@/shared/types/mcp.types'
import {
  Badge,
  Card,
  cn,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  IconButton,
  ListRow,
  Notice,
  SectionLabel,
  toneInk,
  TooltipCard,
} from '@convergence/ui'
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  KeyRound,
  RefreshCw,
  ServerCog,
} from 'lucide-react'
import { mcpStatusTone } from './mcp-servers.pure'

interface McpServersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  projectName: string | null
  snapshot: ProjectMcpVisibility | null
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}

/** A status's glyph, in its tone's ink (the kit's map, R1). */
function renderStatusIcon(status: McpServerStatus) {
  const className = cn('size-3.5', toneInk[mcpStatusTone(status)])
  switch (status) {
    case 'ready':
      return <CircleCheck className={className} />
    case 'needs-auth':
      return <KeyRound className={className} />
    case 'failed':
      return <CircleAlert className={className} />
    case 'disabled':
      return <Ban className={className} />
    default:
      return <CircleHelp className={className} />
  }
}

function renderStatusBadge(status: McpServerStatus, label: string) {
  return (
    <Badge tone={mcpStatusTone(status)} className="font-medium uppercase">
      {label}
    </Badge>
  )
}

function renderProviderHelp(ariaLabel: string, content: ReactNode) {
  return (
    <TooltipCard
      content={content}
      className="max-w-70 space-y-1.5 leading-relaxed"
    >
      <IconButton
        label={ariaLabel}
        type="button"
        variant="ghost"
        size="xs"
        className="text-ink-muted"
      >
        <CircleHelp className="size-3.5" />
      </IconButton>
    </TooltipCard>
  )
}

function renderPiHelp() {
  return renderProviderHelp(
    'Pi MCP setup instructions',
    <>
      <p>Pi MCP requires the pi-mcp-adapter extension.</p>
      <p className="font-mono text-2xs">pi install npm:pi-mcp-adapter</p>
      <p>
        Then restart Pi and use /mcp, /mcp setup, or /mcp-auth &lt;server&gt;
        inside Pi.
      </p>
    </>,
  )
}

function renderAntigravityHelp() {
  return renderProviderHelp(
    'Antigravity MCP setup instructions',
    <>
      <p>
        Antigravity stores MCP servers in ~/.gemini/config/mcp_config.json and
        project .agents/mcp_config.json.
      </p>
      <p>
        Run /mcp list inside agy for live connection and auth state. Convergence
        shows configured servers from disk.
      </p>
    </>,
  )
}

function renderServerRow(
  providerId: string,
  scope: 'project' | 'global',
  server: McpServerSummary,
) {
  return (
    // A server is a row of the list's own kind: its status, its name, where
    // it's configured and what it is, with its transport and state at the end.
    <Card key={`${providerId}-${scope}-${server.name}`} padding="none">
      <ListRow
        leading={renderStatusIcon(server.status)}
        title={server.name}
        meta={
          <>
            <span>{server.scopeLabel}</span>
            <span>{server.description}</span>
          </>
        }
        trailing={
          <span className="flex items-center gap-2">
            <Badge className="uppercase">
              {server.transportType.replace('_', ' ')}
            </Badge>
            {renderStatusBadge(server.status, server.statusLabel)}
          </span>
        }
      />
    </Card>
  )
}

function renderProviderSection(provider: ProviderMcpVisibility) {
  const totalCount =
    provider.globalServers.length + provider.projectServers.length

  return (
    <Card render={<section />} key={provider.providerId} padding="none">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <ServerCog className="size-4 text-ink-muted" />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold">{provider.providerName}</h3>
              {provider.providerId === 'pi' ? renderPiHelp() : null}
              {provider.providerId === 'antigravity'
                ? renderAntigravityHelp()
                : null}
            </div>
            <p className="text-xs text-ink-muted">
              {totalCount} configured server{totalCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {provider.error ? (
          <Notice tone="danger" title={provider.error} />
        ) : null}

        {provider.note ? <Notice title={provider.note} /> : null}

        <div>
          <SectionLabel as="h4" className="mb-2">
            Project
          </SectionLabel>
          {provider.projectServers.length > 0 ? (
            <div className="space-y-2">
              {provider.projectServers.map((server) =>
                renderServerRow(provider.providerId, 'project', server),
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              No project-specific servers.
            </p>
          )}
        </div>

        <div>
          <SectionLabel as="h4" className="mb-2">
            Global
          </SectionLabel>
          {provider.globalServers.length > 0 ? (
            <div className="space-y-2">
              {provider.globalServers.map((server) =>
                renderServerRow(provider.providerId, 'global', server),
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No global servers.</p>
          )}
        </div>
      </div>
    </Card>
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
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      <DialogTrigger render={trigger} />
      {/* A dialog you look at and leave: Refresh in its header, no footer (R6). */}
      <DialogContent>
        <DialogHeader
          actions={
            <IconButton
              label="Refresh"
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              pending={isLoading}
              disabledReason={projectName ? undefined : 'Open a project first.'}
            >
              <RefreshCw />
            </IconButton>
          }
        >
          <DialogTitle>MCP servers</DialogTitle>
          <DialogDescription>
            {projectName
              ? `Available in ${projectName}, grouped by provider and scope.`
              : 'Select a project to inspect provider-backed MCP availability.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="app-scrollbar">
          {!projectName ? (
            <EmptyState
              title="No project open"
              detail="Open a project to inspect MCP server availability."
            />
          ) : error && !snapshot ? (
            <EmptyState
              state="failed"
              title="Couldn't read the MCP servers"
              detail={error}
              onRetry={onRefresh}
              retrying={isLoading}
            />
          ) : isLoading && !snapshot ? (
            <EmptyState
              state="loading"
              title="Checking provider MCP servers…"
            />
          ) : snapshot && snapshot.providers.length > 0 ? (
            <div className="space-y-4">
              {snapshot.providers.map((provider) =>
                renderProviderSection(provider),
              )}
            </div>
          ) : (
            <EmptyState
              title="No MCP-capable providers"
              detail="None of the installed providers speaks MCP."
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
