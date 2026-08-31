import type { ProjectScriptIconId } from './project-script.types'

export const PROJECT_SCRIPT_ICON_OPTIONS: Array<{
  id: ProjectScriptIconId
  label: string
}> = [
  { id: 'play', label: 'Run' },
  { id: 'check', label: 'Check' },
  { id: 'build', label: 'Build' },
  { id: 'test', label: 'Test' },
  { id: 'wrench', label: 'Configure' },
  { id: 'bug', label: 'Debug' },
]
