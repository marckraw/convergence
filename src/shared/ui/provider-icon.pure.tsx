import { cn } from '@/shared/lib/cn.pure'

interface ProviderIconProps {
  providerId?: string | null
  vendorLabel?: string | null
  name?: string | null
  className?: string
}

interface ProviderIconDescriptor {
  label: string
  className: string
}

const KNOWN_PROVIDER_ICONS: Array<{
  matches: string[]
  icon: ProviderIconDescriptor
}> = [
  {
    matches: ['claude', 'anthropic'],
    icon: {
      label: 'A\\',
      className:
        'border-orange-400/30 bg-orange-500/12 text-orange-700 dark:text-orange-200',
    },
  },
  {
    matches: ['openai', 'codex', 'gpt'],
    icon: {
      label: 'OA',
      className:
        'border-emerald-400/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
    },
  },
  {
    matches: ['pi'],
    icon: {
      label: 'Pi',
      className:
        'border-sky-400/30 bg-sky-500/12 text-sky-700 dark:text-sky-200',
    },
  },
  {
    matches: ['openrouter'],
    icon: {
      label: 'OR',
      className:
        'border-violet-400/30 bg-violet-500/12 text-violet-700 dark:text-violet-200',
    },
  },
]

export function ProviderIcon({
  providerId,
  vendorLabel,
  name,
  className,
}: ProviderIconProps) {
  const descriptor = resolveProviderIcon(providerId, vendorLabel, name)

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold leading-none',
        descriptor.className,
        className,
      )}
    >
      {descriptor.label}
    </span>
  )
}

export function resolveProviderIcon(
  providerId?: string | null,
  vendorLabel?: string | null,
  name?: string | null,
): ProviderIconDescriptor {
  const haystack = [providerId, vendorLabel, name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const known = KNOWN_PROVIDER_ICONS.find(({ matches }) =>
    matches.some((match) => haystack.includes(match)),
  )
  if (known) return known.icon

  return {
    label: initialsForProvider(vendorLabel || name || providerId || '?'),
    className:
      'border-border bg-muted text-muted-foreground dark:bg-muted/70 dark:text-foreground',
  }
}

function initialsForProvider(value: string): string {
  const words = value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()

  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}
