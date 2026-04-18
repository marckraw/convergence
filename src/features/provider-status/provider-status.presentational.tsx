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
import { Bot, CircleAlert, CircleCheck, RefreshCw, Wrench } from 'lucide-react'
import { getProviderInstallHint, type HostPlatform } from './install-hints.pure'

interface ProviderStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  statuses: ProviderStatusInfo[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  platform: HostPlatform
}

function renderStatusBadge(provider: ProviderStatusInfo) {
  const className =
    provider.availability === 'available'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : 'border-amber-500/20 bg-amber-500/10 text-amber-200'

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${className}`}
    >
      {provider.statusLabel}
    </span>
  )
}

function renderInstallHint(providerId: string, platform: HostPlatform) {
  const hint = getProviderInstallHint(providerId, platform)
  if (!hint) return null

  return (
    <div className="mt-2 space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs">
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-300/90">
        How to install
      </p>
      <p className="text-foreground/80">{hint.summary}</p>
      <div className="space-y-1">
        {hint.commands.map((command) => (
          <pre
            key={command}
            className="overflow-x-auto rounded border border-border/60 bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground/90"
          >
            {command}
          </pre>
        ))}
      </div>
      {hint.platformNote && (
        <p className="text-muted-foreground">{hint.platformNote}</p>
      )}
      {hint.docsUrl && (
        <p>
          <a
            href={hint.docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline-offset-2 hover:underline"
          >
            Open install guide
          </a>
        </p>
      )}
    </div>
  )
}

function renderProviderRow(
  provider: ProviderStatusInfo,
  platform: HostPlatform,
) {
  return (
    <div
      key={provider.id}
      className="rounded-lg border border-border/60 bg-card/40 px-3 py-3"
    >
      <div className="flex items-center gap-2">
        {provider.availability === 'available' ? (
          <CircleCheck className="h-4 w-4 text-emerald-400" />
        ) : (
          <CircleAlert className="h-4 w-4 text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{provider.name}</p>
            <span className="text-xs text-muted-foreground">
              {provider.vendorLabel}
            </span>
          </div>
        </div>
        {renderStatusBadge(provider)}
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
          <p>{provider.reason ?? 'Provider binary is unavailable.'}</p>
        )}
      </div>
      {provider.availability === 'unavailable' &&
        renderInstallHint(provider.id, platform)}
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
  platform,
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
                {statuses.map((provider) =>
                  renderProviderRow(provider, platform),
                )}
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
