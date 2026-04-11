import type { FC } from 'react'
import { ProjectCreate } from '@/features/project-create'
import { WelcomeShell } from './welcome.presentational'

export const Welcome: FC = () => (
  <WelcomeShell createButton={<ProjectCreate />} />
)
