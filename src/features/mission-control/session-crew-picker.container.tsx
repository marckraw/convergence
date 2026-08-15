import { useRef, useState } from 'react'
import type { FC } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk'
import { Check, Plus, Users, X } from 'lucide-react'
import { useSessionCrewStore } from '@/entities/session-crew'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { CrewDecorationPicker } from './crew-decoration-picker.presentational'
import {
  CREW_SEARCH_THRESHOLD,
  crewsHoldingSession,
  filterCrewsByQuery,
  formatCrewTriggerLabel,
  isValidCrewName,
} from './session-crew-picker.pure'

interface SessionCrewPickerProps {
  sessionId: string
  sessionName: string
}

/**
 * "Add to crew…" on a Session Card.
 *
 * Membership is many-to-many, so this is checkbox toggling and never a move:
 * ticking a second crew does not untick the first, and the menu stays open so
 * a session can join several crews in one pass. Creating a crew from here puts
 * this session in it immediately — nobody opens a create form to make an empty
 * crew they then have to fill.
 */
export const SessionCrewPicker: FC<SessionCrewPickerProps> = ({
  sessionId,
  sessionName,
}) => {
  const crews = useSessionCrewStore((state) => state.crews)
  const addMember = useSessionCrewStore((state) => state.addMember)
  const removeMember = useSessionCrewStore((state) => state.removeMember)
  const createCrew = useSessionCrewStore((state) => state.createCrew)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftEmoji, setDraftEmoji] = useState<string | null>(null)
  const [draftAccent, setDraftAccent] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  const holding = crewsHoldingSession(crews, sessionId)
  const label = formatCrewTriggerLabel(crews, sessionId)
  const visible = filterCrewsByQuery(crews, query)
  const showSearch = crews.length >= CREW_SEARCH_THRESHOLD

  const resetDraft = () => {
    setCreating(false)
    setDraftName('')
    setDraftEmoji(null)
    setDraftAccent(null)
  }

  const submitDraft = async () => {
    if (!isValidCrewName(draftName)) return
    const created = await createCrew({
      name: draftName,
      emoji: draftEmoji,
      accentColor: draftAccent,
      sessionIds: [sessionId],
    })
    if (created) resetDraft()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery('')
          resetDraft()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={holding.length > 0 ? 'secondary' : 'ghost'}
          size="sm"
          aria-label={`Add ${sessionName} to a crew`}
          aria-expanded={open}
          className={cn(
            'h-6 max-w-32 shrink-0 gap-1 px-2 text-[11px] transition-opacity',
            holding.length > 0
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100',
          )}
        >
          {holding.length === 1 && holding[0]?.emoji ? (
            <span aria-hidden className="leading-none">
              {holding[0].emoji}
            </span>
          ) : (
            <Users className="size-3" />
          )}
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        collisionPadding={16}
        className="flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-64 flex-col p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchRef.current?.focus()
        }}
      >
        <Command
          shouldFilter={false}
          label="Crews"
          className="flex min-h-0 flex-1 flex-col"
        >
          {showSearch ? (
            <div className="shrink-0 border-b border-white/10 px-3 py-2">
              <CommandInput
                ref={searchRef}
                value={query}
                onValueChange={setQuery}
                placeholder="Search crews…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          ) : null}

          <CommandList
            className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-1"
            style={{ maxHeight: '100%' }}
            onWheel={(event) => {
              event.currentTarget.scrollTop += event.deltaY
            }}
          >
            {crews.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No crews yet. Make the first one below.
              </p>
            ) : visible.length === 0 ? (
              <CommandEmpty className="px-2 py-6 text-center text-xs text-muted-foreground">
                Nothing matches “{query}”
              </CommandEmpty>
            ) : (
              visible.map((crew) => {
                const member = crew.sessionIds.includes(sessionId)

                return (
                  // Toggling keeps the menu open: a session may join several
                  // crews, and joining one is never leaving another.
                  <CommandItem
                    key={crew.id}
                    value={crew.id}
                    onSelect={() => {
                      void (member
                        ? removeMember(crew.id, sessionId)
                        : addMember(crew.id, sessionId))
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <Check
                      className={cn(
                        'size-3.5 shrink-0',
                        member ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {crew.emoji ? (
                      <span aria-hidden className="leading-none">
                        {crew.emoji}
                      </span>
                    ) : crew.accentColor ? (
                      <span
                        aria-hidden
                        style={{ backgroundColor: crew.accentColor }}
                        className="size-2 shrink-0 rounded-full"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{crew.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {crew.sessionIds.length}
                    </span>
                  </CommandItem>
                )
              })
            )}
          </CommandList>
        </Command>

        <div className="shrink-0 border-t border-white/10 p-2">
          {creating ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <Input
                  ref={nameRef}
                  autoFocus
                  value={draftName}
                  placeholder="Crew name"
                  aria-label="New crew name"
                  className="h-7 flex-1 text-xs"
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void submitDraft()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      resetDraft()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Cancel new crew"
                  className="size-7 shrink-0 p-0"
                  onClick={resetDraft}
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              <CrewDecorationPicker
                emoji={draftEmoji}
                accentColor={draftAccent}
                onEmojiChange={setDraftEmoji}
                onAccentColorChange={setDraftAccent}
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!isValidCrewName(draftName)}
                className="h-7 text-xs"
                onClick={() => void submitDraft()}
              >
                Create &amp; add this session
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 px-2 text-xs font-normal"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-3.5" />
              New crew
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
