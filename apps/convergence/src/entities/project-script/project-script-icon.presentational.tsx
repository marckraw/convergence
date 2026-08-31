import type { FC } from 'react'
import type { ProjectScriptIconId } from './project-script.types'
import { Bug, Check, FlaskConical, Hammer, Play, Wrench } from 'lucide-react'

interface ProjectScriptIconProps {
  icon: ProjectScriptIconId
  className?: string
}

export const ProjectScriptIcon: FC<ProjectScriptIconProps> = ({
  icon,
  className,
}) => {
  const Icon = iconComponentById[icon]
  return <Icon className={className} />
}

const iconComponentById = {
  play: Play,
  check: Check,
  build: Hammer,
  test: FlaskConical,
  wrench: Wrench,
  bug: Bug,
} satisfies Record<ProjectScriptIconId, typeof Play>
