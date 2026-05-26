import type { ProjectScript, ProjectScriptRun } from '@/entities/project-script'

export interface ProjectActionItem {
  script: ProjectScript
  latestRun: ProjectScriptRun | null
  running: boolean
}
