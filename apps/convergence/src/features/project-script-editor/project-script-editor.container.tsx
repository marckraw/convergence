import { useEffect, useState, type FormEvent } from 'react'
import type { FC } from 'react'
import {
  PROJECT_SCRIPT_ICON_OPTIONS,
  ProjectScriptIcon,
  type ProjectScript,
  type ProjectScriptIconId,
} from '@/entities/project-script'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

interface ProjectScriptEditorProps {
  open: boolean
  script: ProjectScript | null
  onOpenChange: (open: boolean) => void
  onSave: (input: {
    name: string
    command: string
    icon: ProjectScriptIconId
    cwd: string | null
  }) => Promise<void>
}

export const ProjectScriptEditor: FC<ProjectScriptEditorProps> = ({
  open,
  script,
  onOpenChange,
  onSave,
}) => {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [icon, setIcon] = useState<ProjectScriptIconId>('play')
  const [cwd, setCwd] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(script?.name ?? '')
    setCommand(script?.command ?? '')
    setIcon(script?.icon ?? 'play')
    setCwd(script?.cwd ?? '')
  }, [open, script])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave({
        name,
        command,
        icon,
        cwd: cwd.trim() ? cwd : null,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{script ? 'Edit Action' : 'Add Action'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Name
              </span>
              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2">
                <div className="flex h-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground">
                  <ProjectScriptIcon icon={icon} className="h-4 w-4" />
                </div>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Dev"
                  required
                />
              </div>
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Icon
              </span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {PROJECT_SCRIPT_ICON_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    variant={icon === option.id ? 'secondary' : 'outline'}
                    className="h-14 flex-col gap-1 px-1 text-[11px]"
                    onClick={() => setIcon(option.id)}
                    title={option.label}
                    aria-pressed={icon === option.id ? true : undefined}
                  >
                    <ProjectScriptIcon icon={option.id} className="h-4 w-4" />
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Command
              </span>
              <Textarea
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="npm run dev"
                className="min-h-24 font-mono"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Working directory
              </span>
              <Input
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
                placeholder="Project repository path"
              />
            </label>
          </DialogBody>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || !command.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
