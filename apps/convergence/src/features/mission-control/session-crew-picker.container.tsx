import { CrewImport } from './crew-import.container'
import { useRef, useState } from 'react'
import type { FC } from 'react'
import { Plus, Users, X } from 'lucide-react'
import { useSessionCrewStore } from '@/entities/session-crew'
import { Button, cn, Combobox, IconButton, Input } from '@convergence/ui'
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
 * ticking a second crew does not untick the first, and the list stays open so
 * a session can join several crews in one pass (Combobox `multiple`).
 * Creating a crew from here puts this session in it immediately — nobody
 * opens a create form to make an empty crew they then have to fill.
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
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftEmoji, setDraftEmoji] = useState<string | null>(null)
  const [draftAccent, setDraftAccent] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  const holding = crewsHoldingSession(crews, sessionId)
  const label = formatCrewTriggerLabel(crews, sessionId)
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
    <CrewImport
      trigger={(startImport, importBusy) => (
        <Combobox
          multiple
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) resetDraft()
          }}
          selectedIds={holding.map((crew) => crew.id)}
          value={label}
          ariaLabel={`Add ${sessionName} to a crew`}
          variant={holding.length > 0 ? 'tonal' : 'ghost'}
          size="xs"
          chevron={false}
          className={cn(
            'max-w-32 shrink-0 justify-center transition-opacity',
            holding.length > 0
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100',
          )}
          icon={
            holding.length === 1 && holding[0]?.emoji ? (
              <span aria-hidden className="leading-none">
                {holding[0].emoji}
              </span>
            ) : (
              <Users className="size-3" />
            )
          }
          items={crews.map((crew) => ({
            id: crew.id,
            label: crew.name,
            icon: crew.emoji ? (
              <span aria-hidden className="leading-none">
                {crew.emoji}
              </span>
            ) : crew.accentColor ? (
              <span
                aria-hidden
                style={{ backgroundColor: crew.accentColor }}
                className="size-2 shrink-0 rounded-full"
              />
            ) : undefined,
            trailing: crew.sessionIds.length,
          }))}
          // A crew matches by its name or its emoji.
          filter={(item, query) => {
            const crew = crews.find((entry) => entry.id === item.id)
            return (
              crew !== undefined && filterCrewsByQuery([crew], query).length > 0
            )
          }}
          // Toggling keeps the list open: a session may join several crews,
          // and joining one is never leaving another.
          onChange={(ids) => {
            const joined = ids.find(
              (id) => !holding.some((crew) => crew.id === id),
            )
            const left = holding.find((crew) => !ids.includes(crew.id))
            if (joined !== undefined) void addMember(joined, sessionId)
            else if (left !== undefined) void removeMember(left.id, sessionId)
          }}
          searchable={showSearch}
          searchPlaceholder="Search crews…"
          emptyMessage={(query) =>
            crews.length === 0
              ? 'No crews yet. Make the first one below.'
              : `Nothing matches “${query}”`
          }
          contentClassName="w-64"
          footer={
            creating ? (
              <div className="flex flex-col gap-2 p-1">
                <div className="flex items-center gap-1">
                  <Input
                    size="sm"
                    ref={nameRef}
                    autoFocus
                    value={draftName}
                    placeholder="Crew name"
                    aria-label="New crew name"
                    className="flex-1 text-xs"
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
                  <IconButton
                    label="Cancel new crew"
                    type="button"
                    variant="ghost"
                    onClick={resetDraft}
                    size="sm"
                    className="shrink-0"
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </div>

                <CrewDecorationPicker
                  emoji={draftEmoji}
                  accentColor={draftAccent}
                  onEmojiChange={setDraftEmoji}
                  onAccentColorChange={setDraftAccent}
                />

                <Button
                  type="button"
                  variant="tonal"
                  disabled={!isValidCrewName(draftName)}
                  onClick={() => void submitDraft()}
                  size="sm"
                  className="px-3"
                >
                  Create &amp; add this session
                </Button>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreating(true)}
                  size="sm"
                  className="w-full justify-start font-normal"
                >
                  <Plus className="size-3.5" />
                  New crew
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={importBusy}
                  onClick={() => {
                    setOpen(false)
                    resetDraft()
                    startImport()
                  }}
                >
                  Import crew…
                </Button>
              </>
            )
          }
        />
      )}
    />
  )
}
