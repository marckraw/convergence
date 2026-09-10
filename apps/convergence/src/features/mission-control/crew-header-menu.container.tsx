import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { toast } from 'sonner'
import { projectOpenApi } from '@/entities/project-open'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { useSessionCrewStore, sessionCrewApi } from '@/entities/session-crew'
import type { SessionCrew } from '@/entities/session-crew'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { CrewDecorationPicker } from './crew-decoration-picker.presentational'
import { formatCrewMemberCount } from './session-crew-groups.pure'
import { isValidCrewName } from './session-crew-picker.pure'

interface CrewHeaderMenuProps {
  crew: SessionCrew
}

/**
 * Rename, redecorate or delete a crew, from its own container header.
 *
 * Deletion asks twice and says what it does: crews are labels, so removing one
 * removes memberships and nothing else. Nobody should have to guess whether a
 * crew takes its sessions with it.
 */
export const CrewHeaderMenu: FC<CrewHeaderMenuProps> = ({ crew }) => {
  const updateCrew = useSessionCrewStore((state) => state.updateCrew)
  const deleteCrew = useSessionCrewStore((state) => state.deleteCrew)

  const [includePositions, setIncludePositions] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(crew.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // A rename from another window must not be overwritten by a stale draft.
  useEffect(() => {
    if (!open) setName(crew.name)
  }, [open, crew.name])

  const dirty = name.trim() !== crew.name
  const canSave = isValidCrewName(name) && dirty

  const close = () => {
    setOpen(false)
    setConfirmingDelete(false)
  }

  const saveName = async () => {
    if (!canSave) return
    await updateCrew(crew.id, { name })
    close()
  }

  const exportCrew = async (force = false) => {
    setExporting(true)
    try {
      const result = await sessionCrewApi.export(crew.id, {
        includePositions,
        ...(force ? { force: true } : {}),
      })
      toast.success('Crew exported', {
        description: result.path,
        action: {
          label: 'Reveal',
          onClick: () => {
            // The existing Finder door opens the containing directory.
            const directory = result.path.slice(
              0,
              Math.max(
                result.path.lastIndexOf('/'),
                result.path.lastIndexOf('\\'),
              ),
            )
            void projectOpenApi
              .open({ appId: 'finder', path: directory })
              .catch((error) => toast.error(String(error)))
          },
        },
      })
      close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error('Could not export crew', {
        description: message,
        ...(message.includes('EEXIST')
          ? {
              action: {
                label: 'Replace existing file',
                onClick: () => void exportCrew(true),
              },
            }
          : {}),
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setConfirmingDelete(false)
          setName(crew.name)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Edit crew ${crew.name}`}
          aria-expanded={open}
          className="size-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={16}
        className="flex w-64 flex-col gap-3 p-3"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`crew-name-${crew.id}`}
            className="text-[11px] text-muted-foreground"
          >
            Name
          </label>
          <Input
            id={`crew-name-${crew.id}`}
            value={name}
            aria-label="Crew name"
            className="h-7 text-xs"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveName()
              }
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">Decoration</span>
          <CrewDecorationPicker
            emoji={crew.emoji}
            accentColor={crew.accentColor}
            // Decoration saves on click: there is nothing to get wrong, and
            // seeing the border change immediately is the whole point.
            onEmojiChange={(emoji) => void updateCrew(crew.id, { emoji })}
            onAccentColorChange={(accentColor) =>
              void updateCrew(crew.id, { accentColor })
            }
          />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canSave}
          className="h-7 text-xs"
          onClick={() => void saveName()}
        >
          Save name
        </Button>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Input
              type="checkbox"
              className="size-3.5 rounded-sm p-0"
              checked={includePositions}
              disabled={exporting}
              onChange={(event) => setIncludePositions(event.target.checked)}
            />
            Include positions
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            disabled={exporting}
            onClick={() => void exportCrew()}
          >
            {exporting ? 'Exporting…' : 'Export crew…'}
          </Button>
        </div>
        <div className="border-t border-white/10 pt-2">
          {confirmingDelete ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground">
                Delete “{crew.name}”? Its{' '}
                {formatCrewMemberCount(crew.sessionIds.length)} stay exactly
                where they are — only the crew disappears.
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => {
                    void deleteCrew(crew.id)
                    close()
                  }}
                >
                  Delete crew
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 px-2 text-xs font-normal text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-3.5" />
              Delete crew
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
