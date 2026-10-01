import { useEffect, useId, useState } from 'react'
import type { FC } from 'react'
import {
  PROJECT_SCRIPT_ICON_OPTIONS,
  ProjectScriptIcon,
  type ProjectScript,
  type ProjectScriptIconId,
} from '@/entities/project-script'
import {
  Field,
  FieldLabel,
  FormDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@convergence/ui'

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

/** An icon with its name: how a choice reads in the list and in the trigger. */
function IconChoice({
  icon,
  label,
}: {
  icon: ProjectScriptIconId
  label: string
}) {
  return (
    <span className="flex items-center gap-2">
      <ProjectScriptIcon icon={icon} className="size-4" />
      {label}
    </span>
  )
}

const ICON_ITEMS = PROJECT_SCRIPT_ICON_OPTIONS.map((option) => ({
  value: option.id,
  label: <IconChoice icon={option.id} label={option.label} />,
}))

/** Why Save waits, or nothing when it can go. */
function missingField(name: string, command: string): string | undefined {
  if (!name.trim()) return 'Name the action first.'
  if (!command.trim()) return 'Give the action a command first.'
  return undefined
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
  const [error, setError] = useState<string | null>(null)
  const iconLabelId = useId()

  useEffect(() => {
    if (!open) return
    setName(script?.name ?? '')
    setCommand(script?.command ?? '')
    setIcon(script?.icon ?? 'play')
    setCwd(script?.cwd ?? '')
    setError(null)
  }, [open, script])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name,
        command,
        icon,
        cwd: cwd.trim() ? cwd : null,
      })
      onOpenChange(false)
    } catch (err) {
      const reason = err instanceof Error ? ` ${err.message}` : ''
      setError(`Couldn't save the action.${reason}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={script ? 'Edit action' : 'Add action'}
      saves="on-save"
      onSave={() => void handleSave()}
      pending={saving}
      saveDisabledReason={missingField(name, command)}
      error={error}
    >
      <div className="space-y-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            size="lg"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Dev"
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span id={iconLabelId} className="text-sm font-medium">
            Icon
          </span>
          <Select
            items={ICON_ITEMS}
            value={icon}
            onValueChange={(next: ProjectScriptIconId) => setIcon(next)}
          >
            <SelectTrigger
              size="lg"
              aria-labelledby={iconLabelId}
              className="w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_SCRIPT_ICON_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <IconChoice icon={option.id} label={option.label} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field>
          <FieldLabel>Command</FieldLabel>
          <Textarea
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="npm run dev"
            className="min-h-24 font-mono"
          />
        </Field>
        <Field>
          <FieldLabel>Working directory</FieldLabel>
          <Input
            size="lg"
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder="Project repository path"
          />
        </Field>
      </div>
    </FormDialog>
  )
}
