import type { FC, ReactNode } from 'react'
import type { ProviderStatusInfo } from '@/entities/session'
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
  Bot,
  CircleAlert,
  CircleCheck,
  RefreshCw,
  Terminal,
  Wrench,
} from 'lucide-react'

interface ProviderStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  statuses: ProviderStatusInfo[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}

function renderStatusBadge(provider: ProviderStatusInfo) {
  const className =
    provider.availability === 'available'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'border-warning/20 bg-warning/10 text-warning-foreground'

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${className}`}
    >
      {provider.statusLabel}
    </span>
  )
}

function renderUpdateBadge(provider: ProviderStatusInfo) {
  const className =
    provider.update.status === 'current'
      ? 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300'
      : provider.update.status === 'outdated'
        ? 'border-warning/20 bg-warning/10 text-warning-foreground'
        : 'border-border bg-muted/40 text-muted-foreground'

  const label =
    provider.update.status === 'current'
      ? 'Latest'
      : provider.update.status === 'outdated'
        ? 'Update available'
        : 'Latest unknown'

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${className}`}
    >
      {label}
    </span>
  )
}

function renderCommand(label: string, command: string) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
        <Terminal className="h-3.5 w-3.5" />
        {label}
      </p>
      <code className="block overflow-x-auto rounded border border-border/40 bg-background/70 px-2 py-1.5 text-[11px] text-foreground/80">
        {command}
      </code>
    </div>
  )
}

function renderProviderRow(provider: ProviderStatusInfo) {
  const showInstallCommand = provider.availability === 'unavailable'
  const showUpdateCommand =
    provider.availability === 'available' &&
    provider.update.status === 'outdated'

  return (
    <div
      key={provider.id}
      className="rounded-lg border border-border/60 bg-card/40 px-3 py-3"
    >
      <div className="flex items-center gap-2">
        {provider.availability === 'available' ? (
          <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CircleAlert className="h-4 w-4 text-warning-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{provider.name}</p>
            <span className="text-xs text-muted-foreground">
              {provider.vendorLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {renderUpdateBadge(provider)}
          {renderStatusBadge(provider)}
        </div>
      </div>

      <div className="mt-2 rounded-md border border-border/50 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
        {provider.binaryPath ? (
          <div className="space-y-2">
            {provider.version && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  Version
                </p>
                <p className="text-foreground/80">{provider.version}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Latest
              </p>
              <p className="text-foreground/80">
                {provider.update.latestVersion ??
                  (provider.update.checkError
                    ? `Unable to check: ${provider.update.checkError}`
                    : 'Unknown')}
              </p>
            </div>
            {showUpdateCommand &&
              renderCommand('Update command', provider.update.updateCommand)}
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                <Wrench className="h-3.5 w-3.5" />
                Binary path
              </p>
              <p className="break-all text-foreground/80">
                {provider.binaryPath}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p>{provider.reason ?? 'Provider binary is unavailable.'}</p>
            {provider.update.latestVersion && (
              <p>Latest version: {provider.update.latestVersion}</p>
            )}
            {showInstallCommand &&
              renderCommand('Install command', provider.update.installCommand)}
          </div>
        )}
      </div>
    </div>
  )
}

export const ProviderStatusDialog: FC<ProviderStatusDialogProps> = ({
  open,
  onOpenChange,
  trigger,
  statuses,
  isLoading,
  error,
  onRefresh,
}) => {
  const availableCount = statuses.filter(
    (provider) => provider.availability === 'available',
  ).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>Providers</DialogTitle>
          <DialogDescription>
            Runtime availability for the local AI CLIs Convergence can use on
            this machine.
          </DialogDescription>
        </DialogHeader>

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : isLoading && statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Checking installed providers…
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-card/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {availableCount} of {statuses.length} provider
                    {statuses.length === 1 ? '' : 's'} available
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {statuses.map((provider) => renderProviderRow(provider))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
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
