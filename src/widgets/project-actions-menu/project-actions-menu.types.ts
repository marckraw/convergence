import type {
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
} from '@/entities/project-script'

export interface ProjectActionItem {
  script: ProjectScript
  latestRun: ProjectScriptRun | null
  running: boolean
}

export interface ProjectActionLogDrawerView {
  script: ProjectScript
  run: ProjectScriptRun
  output: ProjectScriptRunOutput[]
}
