import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { ArrowUp, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  providers: ProviderInfo[]
  selectedProviderId: string
  onProviderChange: (id: string) => void
  providerSelectionDisabled?: boolean
  placeholder?: string
  disabled?: boolean
}

export const Composer: FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  providers,
  selectedProviderId,
  onProviderChange,
  providerSelectionDisabled = false,
  placeholder = 'Ask anything, @tag files/folders, or use / to show available commands...',
  disabled = false,
}) => {
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSubmit()
      }
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={providerSelectionDisabled}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  {selectedProvider?.name ?? 'Select provider'}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {providers.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => onProviderChange(p.id)}
                    className="text-xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {p.name}
                    {p.id === selectedProviderId && (
                      <span className="ml-auto text-muted-foreground">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            size="icon"
            className="h-8 w-8 rounded-full"
            disabled={!value.trim() || disabled}
            onClick={onSubmit}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        ⌘ + Enter to send
      </p>
    </div>
  )
}
